"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pairKey = pairKey;
exports.appendDM = appendDM;
exports.listDMs = listDMs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), "Exocore-Backend", "local-db", "dms");
const RING_LIMIT = 200;
const FLUSH_MS = 5000;
const buffers = new Map(); // pairKey → ring
const dirty = new Set();
function ensureDir() {
    if (!fs_1.default.existsSync(DATA_DIR))
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
}
function pairKey(a, b) {
    return [a, b].sort().join("__");
}
function fileFor(pair) {
    // Sanitize: usernames in our system are safe but be defensive.
    const safe = pair.replace(/[^a-zA-Z0-9._@\-]/g, "_");
    return path_1.default.join(DATA_DIR, `${safe}.json`);
}
function load(pair) {
    if (buffers.has(pair))
        return buffers.get(pair);
    ensureDir();
    const f = fileFor(pair);
    let arr = [];
    try {
        if (fs_1.default.existsSync(f)) {
            arr = JSON.parse(fs_1.default.readFileSync(f, "utf-8"));
            if (!Array.isArray(arr))
                arr = [];
        }
    }
    catch {
        arr = [];
    }
    buffers.set(pair, arr);
    return arr;
}
setInterval(() => {
    if (dirty.size === 0)
        return;
    ensureDir();
    for (const pair of Array.from(dirty)) {
        dirty.delete(pair);
        try {
            const arr = buffers.get(pair) || [];
            fs_1.default.writeFileSync(fileFor(pair), JSON.stringify(arr.slice(-RING_LIMIT)), { mode: 0o600 });
        }
        catch (e) {
            console.warn("[dmStore] flush failed:", e?.message);
        }
    }
}, FLUSH_MS).unref?.();
function appendDM(rec) {
    const pair = pairKey(rec.from, rec.to);
    const arr = load(pair);
    arr.push(rec);
    if (arr.length > RING_LIMIT)
        buffers.set(pair, arr.slice(-RING_LIMIT));
    dirty.add(pair);
}
function listDMs(a, b, limit = 100) {
    const arr = load(pairKey(a, b));
    return arr.slice(-limit);
}
