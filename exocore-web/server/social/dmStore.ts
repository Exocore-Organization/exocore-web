import fs from "fs";
import path from "path";

export interface DMRecord {
  id: string;
  ts: number;
  from: string;        // sender username
  to: string;          // recipient username
  ciphertext: string;  // base64 (XChaCha20-Poly1305)
  nonce: string;       // base64 (24 bytes)
  ephPub?: string;     // base64 (optional sender ephemeral X25519 pub)
}

const DATA_DIR = path.join(process.cwd(), "Exocore-Backend", "local-db", "dms");
const RING_LIMIT = 200;
const FLUSH_MS = 5000;

const buffers = new Map<string, DMRecord[]>();   // pairKey → ring
const dirty = new Set<string>();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("__");
}

function fileFor(pair: string): string {
  // Sanitize: usernames in our system are safe but be defensive.
  const safe = pair.replace(/[^a-zA-Z0-9._@\-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

function load(pair: string): DMRecord[] {
  if (buffers.has(pair)) return buffers.get(pair)!;
  ensureDir();
  const f = fileFor(pair);
  let arr: DMRecord[] = [];
  try {
    if (fs.existsSync(f)) {
      arr = JSON.parse(fs.readFileSync(f, "utf-8")) as DMRecord[];
      if (!Array.isArray(arr)) arr = [];
    }
  } catch { arr = []; }
  buffers.set(pair, arr);
  return arr;
}

setInterval(() => {
  if (dirty.size === 0) return;
  ensureDir();
  for (const pair of Array.from(dirty)) {
    dirty.delete(pair);
    try {
      const arr = buffers.get(pair) || [];
      fs.writeFileSync(fileFor(pair), JSON.stringify(arr.slice(-RING_LIMIT)), { mode: 0o600 });
    } catch (e: any) {
      console.warn("[dmStore] flush failed:", e?.message);
    }
  }
}, FLUSH_MS).unref?.();

export function appendDM(rec: DMRecord): void {
  const pair = pairKey(rec.from, rec.to);
  const arr = load(pair);
  arr.push(rec);
  if (arr.length > RING_LIMIT) buffers.set(pair, arr.slice(-RING_LIMIT));
  dirty.add(pair);
}

export function listDMs(a: string, b: string, limit = 100): DMRecord[] {
  const arr = load(pairKey(a, b));
  return arr.slice(-limit);
}
