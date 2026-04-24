import fs from "fs";
import path from "path";

export type PaymentStatus = "pending" | "approved" | "rejected";

export interface Payment {
  id: string;
  ts: number;
  username: string;
  email?: string;
  plan: string;            // "exo"
  amount: number;          // PHP base price (e.g. 100)
  currency: string;        // "PHP"
  method: "gcash" | "gotyme" | "other";
  proofUrl: string | null; // Drive thumbnail URL
  proofFileId?: string | null;
  note?: string;
  status: PaymentStatus;
  decidedAt?: number;
  decidedBy?: string;      // owner username
  reason?: string;
}

const DATA_DIR = path.join(__dirname, "../../local-db");
const FILE = path.join(DATA_DIR, "payments.json");
const FLUSH_MS = 5000;

let buffer: Payment[] = [];
let loaded = false;
let dirty = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, "utf-8");
      const arr = JSON.parse(raw) as Payment[];
      if (Array.isArray(arr)) buffer = arr;
    }
  } catch (e: any) {
    console.warn("[paymentsStore] load failed:", e?.message);
  }
}

function persistSoon() { dirty = true; }

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(buffer), { mode: 0o600 });
  } catch (e: any) {
    console.warn("[paymentsStore] persist failed:", e?.message);
  }
}, FLUSH_MS).unref?.();

export function addPayment(p: Payment): void {
  ensureLoaded();
  buffer.push(p);
  persistSoon();
}

export function listAll(): Payment[] {
  ensureLoaded();
  return buffer.slice().sort((a, b) => b.ts - a.ts);
}

export function listPending(): Payment[] {
  return listAll().filter(p => p.status === "pending");
}

export function listForUser(username: string): Payment[] {
  return listAll().filter(p => p.username === username);
}

export function getPayment(id: string): Payment | undefined {
  ensureLoaded();
  return buffer.find(p => p.id === id);
}

export function updatePayment(id: string, fields: Partial<Payment>): Payment | null {
  ensureLoaded();
  const p = buffer.find(x => x.id === id);
  if (!p) return null;
  Object.assign(p, fields);
  persistSoon();
  return p;
}
