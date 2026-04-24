/** Phase 6 — Owner-only audit log. Records moderation + payment actions.
 *  Persisted to local-db/audit.json with a periodic 5s flush. */

import fs from "fs";
import path from "path";

export interface AuditEntry {
    id: string;
    at: number;
    by: string;          // actor username
    action: string;      // e.g. "role:set", "ban:apply", "post:delete", "payment:approve"
    target: string;      // username / postId / paymentId
    meta?: Record<string, unknown>;
}

const DATA_DIR = path.join(__dirname, "../../local-db");
const FILE = path.join(DATA_DIR, "audit.json");
const RING_LIMIT = 5000;
const FLUSH_MS = 5000;

let buffer: AuditEntry[] = [];
let loaded = false;
let dirty = false;

function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(FILE)) {
            const raw = fs.readFileSync(FILE, "utf-8");
            const arr = JSON.parse(raw) as AuditEntry[];
            if (Array.isArray(arr)) buffer = arr.slice(-RING_LIMIT);
        }
    } catch (e: any) {
        console.warn("[audit] load failed:", e?.message);
    }
}

setInterval(() => {
    if (!dirty) return;
    dirty = false;
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify(buffer.slice(-RING_LIMIT)), { mode: 0o600 });
    } catch (e: any) {
        console.warn("[audit] persist failed:", e?.message);
    }
}, FLUSH_MS).unref?.();

export function appendAudit(e: Omit<AuditEntry, "id" | "at"> & Partial<Pick<AuditEntry, "at">>): AuditEntry {
    ensureLoaded();
    const entry: AuditEntry = {
        id: `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        at: e.at ?? Date.now(),
        by: e.by,
        action: e.action,
        target: e.target,
        meta: e.meta,
    };
    buffer.push(entry);
    if (buffer.length > RING_LIMIT) buffer = buffer.slice(-RING_LIMIT);
    dirty = true;
    return entry;
}

export function listAudit(limit = 200, action?: string): AuditEntry[] {
    ensureLoaded();
    const filtered = action ? buffer.filter(e => e.action.startsWith(action)) : buffer;
    return filtered.slice(-limit).reverse();
}
