"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addPayment = addPayment;
exports.listAll = listAll;
exports.listPending = listPending;
exports.listForUser = listForUser;
exports.getPayment = getPayment;
exports.updatePayment = updatePayment;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(__dirname, "../../local-db");
const FILE = path_1.default.join(DATA_DIR, "payments.json");
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
                buffer = arr;
        }
    }
    catch (e) {
        console.warn("[paymentsStore] load failed:", e?.message);
    }
}
function persistSoon() { dirty = true; }
setInterval(() => {
    if (!dirty)
        return;
    dirty = false;
    try {
        if (!fs_1.default.existsSync(DATA_DIR))
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        fs_1.default.writeFileSync(FILE, JSON.stringify(buffer), { mode: 0o600 });
    }
    catch (e) {
        console.warn("[paymentsStore] persist failed:", e?.message);
    }
}, FLUSH_MS).unref?.();
function addPayment(p) {
    ensureLoaded();
    buffer.push(p);
    persistSoon();
}
function listAll() {
    ensureLoaded();
    return buffer.slice().sort((a, b) => b.ts - a.ts);
}
function listPending() {
    return listAll().filter(p => p.status === "pending");
}
function listForUser(username) {
    return listAll().filter(p => p.username === username);
}
function getPayment(id) {
    ensureLoaded();
    return buffer.find(p => p.id === id);
}
function updatePayment(id, fields) {
    ensureLoaded();
    const p = buffer.find(x => x.id === id);
    if (!p)
        return null;
    Object.assign(p, fields);
    persistSoon();
    return p;
}
