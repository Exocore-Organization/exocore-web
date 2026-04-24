"use strict";
/** Phase 6 — Owner-only audit log. Records moderation + payment actions.
 *  Persisted to local-db/audit.json with a periodic 5s flush. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendAudit = appendAudit;
exports.listAudit = listAudit;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(__dirname, "../../local-db");
const FILE = path_1.default.join(DATA_DIR, "audit.json");
const RING_LIMIT = 5000;
const FLUSH_MS = 5000;
let buffer = [];
let loaded = false;
let dirty = false;
function ensureLoaded() {
    if (loaded)
        return;
    loaded = true;
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        if (fs_1.default.existsSync(FILE)) {
            const raw = fs_1.default.readFileSync(FILE, "utf-8");
            const arr = JSON.parse(raw);
            if (Array.isArray(arr))
                buffer = arr.slice(-RING_LIMIT);
        }
    }
    catch (e) {
        console.warn("[audit] load failed:", e?.message);
    }
}
setInterval(() => {
    if (!dirty)
        return;
    dirty = false;
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        fs_1.default.writeFileSync(FILE, JSON.stringify(buffer.slice(-RING_LIMIT)), { mode: 0o600 });
    }
    catch (e) {
        console.warn("[audit] persist failed:", e?.message);
    }
}, FLUSH_MS).unref?.();
function appendAudit(e) {
    ensureLoaded();
    const entry = {
        id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: e.at ?? Date.now(),
        by: e.by,
        action: e.action,
        target: e.target,
        meta: e.meta,
    };
    buffer.push(entry);
    if (buffer.length > RING_LIMIT)
        buffer = buffer.slice(-RING_LIMIT);
    dirty = true;
    return entry;
}
function listAudit(limit = 200, action) {
    ensureLoaded();
    const filtered = action ? buffer.filter(e => e.action.startsWith(action)) : buffer;
    return filtered.slice(-limit).reverse();
}
