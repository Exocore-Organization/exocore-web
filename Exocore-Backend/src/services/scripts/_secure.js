// Shared helpers for paste-and-encrypt CLIs (getToken.js / getClient.js).
// Mirrors src/services/secureStore.ts so the CLIs run with plain `node`.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_DIR = path.join(__dirname, "..", "local-db");
const KEY_PATH = path.join(LOCAL_DIR, ".master.key");

const MAGIC = Buffer.from("EXOSEC2");
const SALT_LEN = 16;
const AES_NONCE_LEN = 12;
const XCHACHA_NONCE_LEN = 24;

function loadMasterKey() {
  if (process.env.DB_ENCRYPTION_KEY && process.env.DB_ENCRYPTION_KEY.length >= 32) {
    return crypto.createHash("sha256").update(process.env.DB_ENCRYPTION_KEY).digest();
  }
  if (fs.existsSync(KEY_PATH)) return fs.readFileSync(KEY_PATH);
  if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const k = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, k, { mode: 0o600 });
  console.warn("[secure] generated new master key at local-db/.master.key");
  return k;
}

async function deriveKeys(masterKey, salt) {
  const { scrypt } = await import("@noble/hashes/scrypt.js");
  const out = scrypt(masterKey, salt, { N: 1 << 15, r: 8, p: 1, dkLen: 64 });
  return { inner: out.slice(0, 32), outer: Buffer.from(out.slice(32, 64)) };
}

async function encrypt(plaintext) {
  const { xchacha20poly1305 } = await import("@noble/ciphers/chacha.js");
  const data = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, "utf-8");
  const masterKey = loadMasterKey();
  const salt = crypto.randomBytes(SALT_LEN);
  const { inner, outer } = await deriveKeys(masterKey, salt);

  const xNonce = crypto.randomBytes(XCHACHA_NONCE_LEN);
  const innerCt = Buffer.from(xchacha20poly1305(inner, xNonce).encrypt(data));

  const aesNonce = crypto.randomBytes(AES_NONCE_LEN);
  const aes = crypto.createCipheriv("aes-256-gcm", outer, aesNonce);
  const outerCt = Buffer.concat([aes.update(innerCt), aes.final()]);
  const aesTag = aes.getAuthTag();

  return Buffer.concat([MAGIC, salt, aesNonce, aesTag, xNonce, outerCt]);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", chunk => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function pasteAndEncrypt({ encName, label, requiredKeys }) {
  const encPath = path.join(LOCAL_DIR, encName);
  const fromArg = process.argv[2];
  let raw;

  if (fromArg && fs.existsSync(fromArg)) {
    raw = fs.readFileSync(fromArg, "utf-8");
    console.log(`[${label}] reading from file: ${fromArg}`);
  } else {
    if (process.stdin.isTTY) {
      console.log(`[${label}] paste the JSON content below.`);
      console.log(`        when done, press Ctrl+D (Linux/macOS) or Ctrl+Z then Enter (Windows).\n`);
    }
    raw = await readStdin();
  }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    console.error(`[${label}] ERROR: pasted content is not valid JSON — ${e.message}`);
    process.exit(1);
  }

  if (requiredKeys && requiredKeys.length) {
    const missing = requiredKeys.filter(k => {
      const parts = k.split("|");
      return !parts.some(p => p.split(".").reduce((o, key) => o && o[key], parsed));
    });
    if (missing.length) {
      console.error(`[${label}] ERROR: JSON missing expected keys: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
  const blob = await encrypt(JSON.stringify(parsed));
  fs.writeFileSync(encPath, blob, { mode: 0o600 });

  console.log(`\n[${label}] ✅ encrypted → ${encPath}`);
  console.log(`        size: ${blob.length} bytes (binary, AES-256-GCM ⊕ XChaCha20-Poly1305)`);
  console.log(`        the original JSON is NOT written to disk by this tool.`);
}

module.exports = { pasteAndEncrypt };
