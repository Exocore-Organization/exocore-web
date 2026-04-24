import fs from "fs";
import path from "path";
import { SecureStore } from "./secureStore";

/**
 * Loads a JSON credential file with this priority:
 *   1. Encrypted file at `local-db/<name>.enc`         (preferred)
 *   2. Plaintext at `<projectRoot>/<plaintextName>`    (legacy)
 *
 * If only the legacy plaintext exists, it is auto-encrypted into the
 * `local-db/` directory and the original file is deleted on success.
 */
export function loadEncryptedJson<T = any>(opts: {
  localDir: string;       // absolute path to local-db
  encName: string;        // e.g. "client_secret.enc"
  legacyPaths: string[];  // absolute paths to fall back to (in order)
}): T {
  const { localDir, encName, legacyPaths } = opts;
  const encPath = path.join(localDir, encName);
  const store = new SecureStore(localDir);

  if (fs.existsSync(encPath)) {
    return JSON.parse(store.decryptFromFile(encPath));
  }

  for (const legacy of legacyPaths) {
    if (fs.existsSync(legacy)) {
      const raw = fs.readFileSync(legacy, "utf-8");
      // Validate JSON before encrypting
      const parsed = JSON.parse(raw);
      store.encryptToFile(raw, encPath);
      try { fs.unlinkSync(legacy); } catch {}
      console.log(`[secure] migrated ${path.basename(legacy)} → local-db/${encName}`);
      return parsed;
    }
  }

  throw new Error(
    `[secure] missing credential: tried ${encPath} and ${legacyPaths.join(", ")}`
  );
}
