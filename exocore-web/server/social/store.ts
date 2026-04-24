import fs from "fs";
import path from "path";

export interface ChatMessage {
  id: string;
  ts: number;
  username: string;
  nickname?: string;
  role: string;
  plan?: string;       // "free" | "exo" — surfaced for the chat-row badge
  text: string;
  deleted?: boolean;
}

const DATA_DIR = path.join(process.cwd(), "Exocore-Backend", "local-db");
const FILE = path.join(DATA_DIR, "global-chat.json");
const RING_LIMIT = 300;

let buffer: ChatMessage[] = [];
let loaded = false;
let dirty = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, "utf-8");
      const arr = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(arr)) buffer = arr.slice(-RING_LIMIT);
    }
  } catch (e: any) {
    console.warn("[social.store] failed to load chat:", e?.message);
  }
}

function persistSoon() {
  dirty = true;
}

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(buffer.slice(-RING_LIMIT)), { mode: 0o600 });
  } catch (e: any) {
    console.warn("[social.store] persist failed:", e?.message);
  }
}, 5000).unref?.();

export function appendMessage(msg: ChatMessage): void {
  ensureLoaded();
  buffer.push(msg);
  if (buffer.length > RING_LIMIT) buffer = buffer.slice(-RING_LIMIT);
  persistSoon();
}

export function listMessages(limit = 100): ChatMessage[] {
  ensureLoaded();
  return buffer.slice(-limit);
}

export function deleteMessage(id: string): boolean {
  ensureLoaded();
  const m = buffer.find(x => x.id === id);
  if (!m || m.deleted) return false;
  m.deleted = true;
  m.text = "";
  persistSoon();
  return true;
}
