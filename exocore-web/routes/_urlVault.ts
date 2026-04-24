/**
 * Encrypted vault for `urlData.json`.
 *
 * The plain JSON used to live next to this file and was readable to anyone
 * who could see the deployment bundle. That made it trivial to rewrite the
 * upstream backend to a malicious URL on a public host (e.g. Hugging Face
 * Spaces, where the source tree is exposed by default).
 *
 * Now the same data is stored in `urlData.enc` as an AES-256-GCM ciphertext
 * with a 96-bit random nonce and a 128-bit authentication tag. The 256-bit
 * key is derived from a passphrase (split across multiple constants and
 * recombined at runtime, then run through PBKDF2 with a fixed salt + 200k
 * iterations) so the key is never written verbatim anywhere in the source.
 *
 * This is *defence in depth*, not absolute secrecy — anyone with full
 * access to the obfuscated runtime bundle can still recover the URL. The
 * goal is to make a casual reader / scraper of the public file tree see
 * an opaque blob instead of a URL they can swap.
 *
 * File format (binary, base64-wrapped in JSON for portability):
 *
 *   {
 *       "v":      1,
 *       "alg":    "aes-256-gcm",
 *       "kdf":    "pbkdf2-sha512",
 *       "iter":   200000,
 *       "salt":   "<base64 16B>",
 *       "nonce":  "<base64 12B>",
 *       "tag":    "<base64 16B>",
 *       "data":   "<base64 ciphertext>"
 *   }
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface UrlConfig {
    URL: string;
    local?: string;
    preferLocal?: boolean;
}

export interface VaultEnvelope {
    v:     number;
    alg:   "aes-256-gcm";
    kdf:   "pbkdf2-sha512";
    iter:  number;
    salt:  string;
    nonce: string;
    tag:   string;
    data:  string;
}

const VAULT_FILENAME  = "urlData.enc";
const LEGACY_FILENAME = "urlData.json";

const KDF_ITER  = 200_000;
const KDF_HASH  = "sha512";
const NONCE_LEN = 12;   // GCM
const SALT_LEN  = 16;
const KEY_LEN   = 32;   // AES-256

/**
 * Re-assemble the passphrase at runtime from a few small fragments so the
 * full string never appears as a single literal in the compiled output.
 * After the obfuscator passes over this file the fragments themselves get
 * encoded into the string-array, hardening the seam further.
 *
 * NOTE: this is intentionally not a secret-management story — it's a
 * speed-bump for casual source readers. Real secrets live in environment
 * variables / KMS.
 */
function passphrase(): string {
    const a = ["ex", "o", "core"].join("");           // "exocore"
    const b = ["url", "Vault", "v1"].join("-");       // "url-Vault-v1"
    const c = String(0x7e1e02);                       // anchor digits
    const d = ["Cho", "ru", "yt"].join("");           // "Choruyt"
    const env = (process.env.EXO_URLDATA_PASSPHRASE || "").trim();
    return env || `${a}::${b}::${c}::${d}`;
}

const SALT_LITERAL = Buffer.from(
    "65786f636f72652d75726c2d76617568742d76312d736c632d7468325f31",
    "hex",
);

function deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(passphrase(), salt, KDF_ITER, KEY_LEN, KDF_HASH);
}

export function encryptConfig(cfg: UrlConfig): VaultEnvelope {
    // Random per-file salt so the same plaintext re-encrypted yields a fresh
    // envelope every time (hides whether the URL changed across runs).
    const salt  = crypto.randomBytes(SALT_LEN);
    const nonce = crypto.randomBytes(NONCE_LEN);
    const key   = deriveKey(salt);

    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    const pt = Buffer.from(JSON.stringify(cfg), "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        v:     1,
        alg:   "aes-256-gcm",
        kdf:   "pbkdf2-sha512",
        iter:  KDF_ITER,
        salt:  salt.toString("base64"),
        nonce: nonce.toString("base64"),
        tag:   tag.toString("base64"),
        data:  ct.toString("base64"),
    };
}

export function decryptConfig(env: VaultEnvelope): UrlConfig {
    if (env.v !== 1)              throw new Error(`urlVault: unsupported version ${env.v}`);
    if (env.alg !== "aes-256-gcm") throw new Error(`urlVault: unsupported alg ${env.alg}`);

    const salt  = Buffer.from(env.salt,  "base64");
    const nonce = Buffer.from(env.nonce, "base64");
    const tag   = Buffer.from(env.tag,   "base64");
    const ct    = Buffer.from(env.data,  "base64");

    // Defence in depth: if the file's own salt is missing/short fall back to
    // the deterministic literal so the legacy short-salt format still loads.
    const useSalt = salt.length === SALT_LEN ? salt : SALT_LITERAL;
    const key = deriveKey(useSalt);

    const dec = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    dec.setAuthTag(tag);
    const pt = Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
    return JSON.parse(pt) as UrlConfig;
}

/**
 * Load the URL config from the encrypted vault. Falls back to the legacy
 * plain `urlData.json` if no vault file exists yet — and immediately
 * re-encrypts it next to itself so the next read picks up the secure copy.
 *
 * The `dir` argument defaults to the directory this file lives in so callers
 * don't have to think about it.
 */
export function loadUrlConfig(dir?: string): UrlConfig {
    const base = dir ?? __dirname;
    const vaultPath  = path.join(base, VAULT_FILENAME);
    const legacyPath = path.join(base, LEGACY_FILENAME);

    if (fs.existsSync(vaultPath)) {
        const env = JSON.parse(fs.readFileSync(vaultPath, "utf-8")) as VaultEnvelope;
        return decryptConfig(env);
    }

    if (fs.existsSync(legacyPath)) {
        const cfg = JSON.parse(fs.readFileSync(legacyPath, "utf-8")) as UrlConfig;
        // Auto-migrate: write the encrypted twin so the plain copy is no
        // longer the source of truth on the next boot.
        try {
            const env = encryptConfig(cfg);
            fs.writeFileSync(vaultPath, JSON.stringify(env, null, 2), "utf-8");
        } catch { /* non-fatal; we still return the in-memory config */ }
        return cfg;
    }

    throw new Error(
        `urlVault: neither ${VAULT_FILENAME} nor ${LEGACY_FILENAME} found in ${base}`,
    );
}

/**
 * Manually (re)encrypt the legacy plain JSON into a fresh vault file. Use
 * this from the CLI helper at `exocore-web/scripts/encrypt-urldata.ts`.
 */
export function rotateVault(dir?: string): { vaultPath: string } {
    const base = dir ?? __dirname;
    const vaultPath  = path.join(base, VAULT_FILENAME);
    const legacyPath = path.join(base, LEGACY_FILENAME);

    let cfg: UrlConfig | null = null;
    if (fs.existsSync(vaultPath))      cfg = decryptConfig(JSON.parse(fs.readFileSync(vaultPath,  "utf-8")));
    else if (fs.existsSync(legacyPath)) cfg = JSON.parse(fs.readFileSync(legacyPath, "utf-8")) as UrlConfig;
    else throw new Error("urlVault: nothing to rotate — no input file found");

    const env = encryptConfig(cfg!);
    fs.writeFileSync(vaultPath, JSON.stringify(env, null, 2), "utf-8");
    return { vaultPath };
}
