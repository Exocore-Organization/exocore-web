"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendMessage = appendMessage;
exports.listMessages = listMessages;
exports.deleteMessage = deleteMessage;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), "Exocore-Backend", "local-db");
const FILE = path_1.default.join(DATA_DIR, "global-chat.json");
const RING_LIMIT = 300;
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
        console.warn("[social.store] failed to load chat:", e?.message);
    }
}
function persistSoon() {
    dirty = true;
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
        console.warn("[social.store] persist failed:", e?.message);
    }
}, 5000).unref?.();
function appendMessage(msg) {
    ensureLoaded();
    buffer.push(msg);
    if (buffer.length > RING_LIMIT)
        buffer = buffer.slice(-RING_LIMIT);
    persistSoon();
}
function listMessages(limit = 100) {
    ensureLoaded();
    return buffer.slice(-limit);
}
function deleteMessage(id) {
    ensureLoaded();
    const m = buffer.find(x => x.id === id);
    if (!m || m.deleted)
        return false;
    m.deleted = true;
    m.text = "";
    persistSoon();
    return true;
}
