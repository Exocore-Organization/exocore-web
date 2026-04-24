"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const chacha_js_1 = require("@noble/ciphers/chacha.js");
const scrypt_js_1 = require("@noble/hashes/scrypt.js");
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
function deriveKeys(masterKey, salt) {
    // Single scrypt call → 64 bytes → split into two independent 32-byte keys.
    const out = (0, scrypt_js_1.scrypt)(masterKey, salt, { N: 1 << 15, r: 8, p: 1, dkLen: 64 });
    return {
        inner: out.slice(0, 32),
        outer: Buffer.from(out.slice(32, 64)),
    };
}
function loadMasterKey(localDir) {
    const envKey = process.env.DB_ENCRYPTION_KEY;
    if (envKey && envKey.length >= 32) {
        return crypto_1.default.createHash("sha256").update(envKey).digest();
    }
    const keyPath = path_1.default.join(localDir, ".master.key");
    if (fs_1.default.existsSync(keyPath)) {
        return fs_1.default.readFileSync(keyPath);
    }
    if (!fs_1.default.existsSync(localDir))
        fs_1.default.mkdirSync(localDir, { recursive: true });
    const key = crypto_1.default.randomBytes(32);
    fs_1.default.writeFileSync(keyPath, key, { mode: 0o600 });
    console.warn("[secure] generated new master key at local-db/.master.key — set DB_ENCRYPTION_KEY env var to override.");
    return key;
}
class SecureStore {
    masterKey;
    constructor(localDir) {
        this.masterKey = loadMasterKey(localDir);
    }
    /** Encrypt → returns binary blob (Buffer). */
    encrypt(plaintext) {
        const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf-8");
        const salt = crypto_1.default.randomBytes(SALT_LEN);
        const { inner, outer } = deriveKeys(this.masterKey, salt);
        // Inner layer: XChaCha20-Poly1305
        const xNonce = crypto_1.default.randomBytes(XCHACHA_NONCE_LEN);
        const xChacha = (0, chacha_js_1.xchacha20poly1305)(inner, xNonce);
        const innerCt = Buffer.from(xChacha.encrypt(data));
        // Outer layer: AES-256-GCM
        const aesNonce = crypto_1.default.randomBytes(AES_NONCE_LEN);
        const aes = crypto_1.default.createCipheriv("aes-256-gcm", outer, aesNonce);
        const outerCt = Buffer.concat([aes.update(innerCt), aes.final()]);
        const aesTag = aes.getAuthTag();
        // Layout: MAGIC | salt | aesNonce | aesTag | xNonce | outerCt
        return Buffer.concat([MAGIC, salt, aesNonce, aesTag, xNonce, outerCt]);
    }
    /** Encrypt and write to a file (binary). */
    encryptToFile(plaintext, filePath) {
        const dir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(filePath, this.encrypt(plaintext), { mode: 0o600 });
    }
    /** Read an encrypted file and return the original utf-8 string. */
    decryptFromFile(filePath) {
        return this.decrypt(fs_1.default.readFileSync(filePath));
    }
    /** Decrypt → returns the original utf-8 string. Throws if tampered. */
    decrypt(blob) {
        let offset = 0;
        const magic = blob.slice(offset, offset + MAGIC.length);
        offset += MAGIC.length;
        if (!magic.equals(MAGIC))
            throw new Error("secure store: bad magic / unsupported format");
        const salt = blob.slice(offset, offset + SALT_LEN);
        offset += SALT_LEN;
        const aesNonce = blob.slice(offset, offset + AES_NONCE_LEN);
        offset += AES_NONCE_LEN;
        const aesTag = blob.slice(offset, offset + 16);
        offset += 16;
        const xNonce = blob.slice(offset, offset + XCHACHA_NONCE_LEN);
        offset += XCHACHA_NONCE_LEN;
        const outerCt = blob.slice(offset);
        const { inner, outer } = deriveKeys(this.masterKey, salt);
        // Outer
        const aes = crypto_1.default.createDecipheriv("aes-256-gcm", outer, aesNonce);
        aes.setAuthTag(aesTag);
        const innerCt = Buffer.concat([aes.update(outerCt), aes.final()]);
        // Inner
        const xChacha = (0, chacha_js_1.xchacha20poly1305)(inner, xNonce);
        const plain = Buffer.from(xChacha.decrypt(innerCt));
        return plain.toString("utf-8");
    }
}
exports.SecureStore = SecureStore;
