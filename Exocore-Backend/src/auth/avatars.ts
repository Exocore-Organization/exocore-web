import { Request, Response } from "express";
import { getUserFolder, getProfileImages, isCacheReady } from "../services/drive";

interface CacheEntry { url: string | null; expires: number }
const CACHE = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

async function lookup(username: string): Promise<string | null> {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return null;
  const hit = CACHE.get(u);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.url;
  try {
    const folderId = await getUserFolder(u);
    if (!folderId) {
      CACHE.set(u, { url: null, expires: now + TTL_MS });
      return null;
    }
    const imgs = await getProfileImages(folderId);
    const url = imgs?.avatarUrl || null;
    CACHE.set(u, { url, expires: now + TTL_MS });
    return url;
  } catch {
    CACHE.set(u, { url: null, expires: now + 30_000 });
    return null;
  }
}

/** GET /exocore/api/social/avatar?username=alice */
export async function avatarOneHandler(req: Request, res: Response) {
  if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
  const u = String(req.query.username || "").trim();
  if (!u) return res.status(400).json({ success: false, message: "username required" });
  const url = await lookup(u);
  return res.json({ success: true, username: u.toLowerCase(), url });
}

/** GET /exocore/api/social/avatars?usernames=a,b,c (comma list, max 50) */
export async function avatarBatchHandler(req: Request, res: Response) {
  if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
  const raw = String(req.query.usernames || "").trim();
  if (!raw) return res.json({ success: true, avatars: {} });
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 50);
  const entries = await Promise.all(list.map(async (n) => [n, await lookup(n)] as const));
  const avatars: Record<string, string | null> = {};
  for (const [n, url] of entries) avatars[n] = url;
  return res.json({ success: true, avatars });
}

export function invalidateAvatar(username: string): void {
  CACHE.delete(String(username || "").toLowerCase());
}
