import fs from "fs";
import path from "path";
import crypto from "crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { scrypt } from "@noble/hashes/scrypt.js";

/**
 * Two-layer authenticated encryption for the local user cache.
 *
 *   plaintext
 *      │
 *      ▼  XChaCha20-Poly1305  (key1, 24-byte nonce)
 *   ciphertext_inner + tag
 *      │
 *      ▼  AES-256-GCM         (key2, 12-byte nonce)
 *   ciphertext_outer + tag
 *
 * Both ciphers are AEAD (encrypt + authenticate). An attacker would need to
 * break BOTH independent algorithms with two distinct keys to recover the
 * data — current best public attacks against either cipher are infeasible.
 *
 * Keys are derived with scrypt (N=2^15, r=8, p=1) from a master secret kept
 * outside the repo (env var DB_ENCRYPTION_KEY, otherwise auto-generated and
 * stored in `local-db/.master.key` with 0600 permissions).
 */

const MAGIC = Buffer.from("EXOSEC2"); // file format marker, version 2
const SALT_LEN = 16;
const AES_NONCE_LEN = 12;
const XCHACHA_NONCE_LEN = 24;

interface DerivedKeys {
  inner: Uint8Array; // 32 bytes for XChaCha20
  outer: Buffer;     // 32 bytes for AES-256
}

function deriveKeys(masterKey: Buffer, salt: Buffer): DerivedKeys {
  // Single scrypt call → 64 bytes → split into two independent 32-byte keys.
  const out = scrypt(masterKey, salt, { N: 1 << 15, r: 8, p: 1, dkLen: 64 });
  return {
    inner: out.slice(0, 32),
    outer: Buffer.from(out.slice(32, 64)),
  };
}

function loadMasterKey(localDir: string): Buffer {
  const envKey = process.env.DB_ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return crypto.createHash("sha256").update(envKey).digest();
  }
  const keyPath = path.join(localDir, ".master.key");
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  console.warn(
    "[secure] generated new master key at local-db/.master.key — set DB_ENCRYPTION_KEY env var to override."
  );
  return key;
}

export class SecureStore {
  private masterKey: Buffer;

  constructor(localDir: string) {
    this.masterKey = loadMasterKey(localDir);
  }

  /** Encrypt → returns binary blob (Buffer). */
  encrypt(plaintext: string | Buffer): Buffer {
    const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf-8");
    const salt = crypto.randomBytes(SALT_LEN);
    const { inner, outer } = deriveKeys(this.masterKey, salt);

    // Inner layer: XChaCha20-Poly1305
    const xNonce = crypto.randomBytes(XCHACHA_NONCE_LEN);
    const xChacha = xchacha20poly1305(inner, xNonce);
    const innerCt = Buffer.from(xChacha.encrypt(data));

    // Outer layer: AES-256-GCM
    const aesNonce = crypto.randomBytes(AES_NONCE_LEN);
    const aes = crypto.createCipheriv("aes-256-gcm", outer, aesNonce);
    const outerCt = Buffer.concat([aes.update(innerCt), aes.final()]);
    const aesTag = aes.getAuthTag();

    // Layout: MAGIC | salt | aesNonce | aesTag | xNonce | outerCt
    return Buffer.concat([MAGIC, salt, aesNonce, aesTag, xNonce, outerCt]);
  }

  /** Encrypt and write to a file (binary). */
  encryptToFile(plaintext: string | Buffer, filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, this.encrypt(plaintext), { mode: 0o600 });
  }

  /** Read an encrypted file and return the original utf-8 string. */
  decryptFromFile(filePath: string): string {
    return this.decrypt(fs.readFileSync(filePath));
  }

  /** Decrypt → returns the original utf-8 string. Throws if tampered. */
  decrypt(blob: Buffer): string {
    let offset = 0;
    const magic = blob.slice(offset, offset + MAGIC.length);
    offset += MAGIC.length;
    if (!magic.equals(MAGIC)) throw new Error("secure store: bad magic / unsupported format");

    const salt = blob.slice(offset, offset + SALT_LEN); offset += SALT_LEN;
    const aesNonce = blob.slice(offset, offset + AES_NONCE_LEN); offset += AES_NONCE_LEN;
    const aesTag = blob.slice(offset, offset + 16); offset += 16;
    const xNonce = blob.slice(offset, offset + XCHACHA_NONCE_LEN); offset += XCHACHA_NONCE_LEN;
    const outerCt = blob.slice(offset);

    const { inner, outer } = deriveKeys(this.masterKey, salt);

    // Outer
    const aes = crypto.createDecipheriv("aes-256-gcm", outer, aesNonce);
    aes.setAuthTag(aesTag);
    const innerCt = Buffer.concat([aes.update(outerCt), aes.final()]);

    // Inner
    const xChacha = xchacha20poly1305(inner, xNonce);
    const plain = Buffer.from(xChacha.decrypt(innerCt));
    return plain.toString("utf-8");
  }
}
