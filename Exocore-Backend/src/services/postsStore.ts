import fs from "fs";
import path from "path";

export interface Comment {
  id: string;
  ts: number;
  author: string;          // username
  text: string;
  deleted?: boolean;
}

export interface Post {
  id: string;
  ts: number;
  author: string;          // username
  imageUrl: string | null; // Drive thumbnail URL
  imageFileId?: string | null;
  text: string;            // ≤ 500 chars
  comments: Comment[];
  reactions?: Record<string, string[]>; // emoji -> usernames who reacted
  deleted?: boolean;
}

export const REACTION_EMOJIS = ["like", "love", "haha", "wow", "sad", "angry"] as const;
export type ReactionKey = typeof REACTION_EMOJIS[number];

const DATA_DIR = path.join(__dirname, "../../local-db");
const FILE = path.join(DATA_DIR, "posts.json");
const RING_LIMIT = 5000;
const FLUSH_MS = 5000;

let buffer: Post[] = [];
let loaded = false;
let dirty = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) {
      const raw = fs.readFileSync(FILE, "utf-8");
      const arr = JSON.parse(raw) as Post[];
      if (Array.isArray(arr)) buffer = arr.slice(-RING_LIMIT);
    }
  } catch (e: any) {
    console.warn("[postsStore] load failed:", e?.message);
  }
}

function persistSoon() { dirty = true; }

setInterval(() => {
  if (!dirty) return;
  dirty = false;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(buffer.slice(-RING_LIMIT)), { mode: 0o600 });
  } catch (e: any) {
    console.warn("[postsStore] persist failed:", e?.message);
  }
}, FLUSH_MS).unref?.();

export function addPost(p: Post): void {
  ensureLoaded();
  buffer.push(p);
  if (buffer.length > RING_LIMIT) buffer = buffer.slice(-RING_LIMIT);
  persistSoon();
}

export function listPostsByAuthor(author: string, limit = 50): Post[] {
  ensureLoaded();
  return buffer.filter(p => p.author === author && !p.deleted).slice(-limit).reverse();
}

export function listFeed(limit = 60): Post[] {
  ensureLoaded();
  return buffer.filter(p => !p.deleted).slice(-limit).reverse();
}

export function getPost(id: string): Post | undefined {
  ensureLoaded();
  return buffer.find(p => p.id === id);
}

export function softDeletePost(id: string): boolean {
  ensureLoaded();
  const p = buffer.find(x => x.id === id);
  if (!p || p.deleted) return false;
  p.deleted = true;
  p.text = "";
  persistSoon();
  return true;
}

export function addComment(postId: string, c: Comment): boolean {
  ensureLoaded();
  const p = buffer.find(x => x.id === postId);
  if (!p || p.deleted) return false;
  p.comments.push(c);
  if (p.comments.length > 500) p.comments = p.comments.slice(-500);
  persistSoon();
  return true;
}

export function toggleReaction(postId: string, emoji: string, username: string): { reactions: Record<string, string[]>; mine: string | null } | null {
  ensureLoaded();
  const p = buffer.find(x => x.id === postId);
  if (!p || p.deleted) return null;
  if (!p.reactions) p.reactions = {};
  // Remove user from any existing reaction first.
  let prev: string | null = null;
  for (const k of Object.keys(p.reactions)) {
    const arr = p.reactions[k];
    const i = arr.indexOf(username);
    if (i >= 0) {
      prev = k;
      arr.splice(i, 1);
      if (arr.length === 0) delete p.reactions[k];
    }
  }
  // Toggle: if user clicked same one, leave it removed. Else add new.
  if (prev !== emoji) {
    if (!p.reactions[emoji]) p.reactions[emoji] = [];
    p.reactions[emoji].push(username);
  }
  persistSoon();
  const mine = prev === emoji ? null : emoji;
  return { reactions: p.reactions, mine };
}

export function deleteComment(postId: string, commentId: string): boolean {
  ensureLoaded();
  const p = buffer.find(x => x.id === postId);
  if (!p) return false;
  const c = p.comments.find(x => x.id === commentId);
  if (!c || c.deleted) return false;
  c.deleted = true;
  c.text = "";
  persistSoon();
  return true;
}
