"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarOneHandler = avatarOneHandler;
exports.avatarBatchHandler = avatarBatchHandler;
exports.invalidateAvatar = invalidateAvatar;
const drive_1 = require("../services/drive");
const CACHE = new Map();
const TTL_MS = 5 * 60 * 1000;
async function lookup(username) {
    const u = String(username || "").trim().toLowerCase();
    if (!u)
        return null;
    const hit = CACHE.get(u);
    const now = Date.now();
    if (hit && hit.expires > now)
        return hit.url;
    try {
        const folderId = await (0, drive_1.getUserFolder)(u);
        if (!folderId) {
            CACHE.set(u, { url: null, expires: now + TTL_MS });
            return null;
        }
        const imgs = await (0, drive_1.getProfileImages)(folderId);
        const url = imgs?.avatarUrl || null;
        CACHE.set(u, { url, expires: now + TTL_MS });
        return url;
    }
    catch {
        CACHE.set(u, { url: null, expires: now + 30_000 });
        return null;
    }
}
/** GET /exocore/api/social/avatar?username=alice */
async function avatarOneHandler(req, res) {
    if (!(0, drive_1.isCacheReady)())
        return res.status(503).json({ success: false, message: "warming up" });
    const u = String(req.query.username || "").trim();
    if (!u)
        return res.status(400).json({ success: false, message: "username required" });
    const url = await lookup(u);
    return res.json({ success: true, username: u.toLowerCase(), url });
}
/** GET /exocore/api/social/avatars?usernames=a,b,c (comma list, max 50) */
async function avatarBatchHandler(req, res) {
    if (!(0, drive_1.isCacheReady)())
        return res.status(503).json({ success: false, message: "warming up" });
    const raw = String(req.query.usernames || "").trim();
    if (!raw)
        return res.json({ success: true, avatars: {} });
    const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 50);
    const entries = await Promise.all(list.map(async (n) => [n, await lookup(n)]));
    const avatars = {};
    for (const [n, url] of entries)
        avatars[n] = url;
    return res.json({ success: true, avatars });
}
function invalidateAvatar(username) {
    CACHE.delete(String(username || "").toLowerCase());
}
