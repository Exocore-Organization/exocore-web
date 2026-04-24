"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEncryptedJson = loadEncryptedJson;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const secureStore_1 = require("./secureStore");
/**
 * Loads a JSON credential file with this priority:
 *   1. Encrypted file at `local-db/<name>.enc`         (preferred)
 *   2. Plaintext at `<projectRoot>/<plaintextName>`    (legacy)
 *
 * If only the legacy plaintext exists, it is auto-encrypted into the
 * `local-db/` directory and the original file is deleted on success.
 */
function loadEncryptedJson(opts) {
    const { localDir, encName, legacyPaths } = opts;
    const encPath = path_1.default.join(localDir, encName);
    const store = new secureStore_1.SecureStore(localDir);
    if (fs_1.default.existsSync(encPath)) {
        return JSON.parse(store.decryptFromFile(encPath));
    }
    for (const legacy of legacyPaths) {
        if (fs_1.default.existsSync(legacy)) {
            const raw = fs_1.default.readFileSync(legacy, "utf-8");
            // Validate JSON before encrypting
            const parsed = JSON.parse(raw);
            store.encryptToFile(raw, encPath);
            try {
                fs_1.default.unlinkSync(legacy);
            }
            catch { }
            console.log(`[secure] migrated ${path_1.default.basename(legacy)} → local-db/${encName}`);
            return parsed;
        }
    }
    throw new Error(`[secure] missing credential: tried ${encPath} and ${legacyPaths.join(", ")}`);
}
