"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastPostsUpdated = broadcastPostsUpdated;
exports.systemAnnounce = systemAnnounce;
exports.createSocialWss = createSocialWss;
const ws_1 = require("ws");
const backendWs_1 = require("../backendWs");
const codec_1 = require("./codec");
const store_1 = require("./store");
const dmStore_1 = require("./dmStore");
const rateLimit_1 = require("../../../Exocore-Backend/src/services/rateLimit");
// Phase 6 — token-bucket rate limits.
//   chat:  10 messages, refilling at 1/2s (= 0.5/s).
//   dm:    20 messages, refilling at 1/s.
const chatBucket = new rateLimit_1.TokenBucket(10, 0.5 / 1000);
const dmBucket = new rateLimit_1.TokenBucket(20, 1 / 1000);
const conns = new Set();
const AVATAR_CACHE = new Map();
const AVATAR_TTL = 5 * 60 * 1000;
async function avatarFor(username) {
    const u = String(username || "").toLowerCase();
    if (!u || u === "system")
        return null;
    const hit = AVATAR_CACHE.get(u);
    const now = Date.now();
    if (hit && hit.expires > now)
        return hit.url;
    try {
        const r = await (0, backendWs_1.backendCall)("GET", "/exocore/api/social/avatar", { username: u }, undefined, 4000);
        const url = r.ok && r.data?.success ? (r.data.url || null) : null;
        AVATAR_CACHE.set(u, { url, expires: now + AVATAR_TTL });
        return url;
    }
    catch {
        AVATAR_CACHE.set(u, { url: null, expires: now + 30_000 });
        return null;
    }
}
function presenceList() {
    const seen = new Map();
    for (const c of conns)
        seen.set(c.user.username, c.user);
    return Array.from(seen.values()).sort((a, b) => a.username.localeCompare(b.username));
}
async function presenceListWithAvatars() {
    const list = presenceList();
    await Promise.all(list.map(async (u) => {
        if (u.avatarUrl == null)
            u.avatarUrl = await avatarFor(u.username);
    }));
    return list;
}
function broadcast(typ, data, except) {
    const buf = (0, codec_1.packFrame)({ t: typ, d: data });
    for (const c of conns) {
        if (c === except)
            continue;
        if (c.ws.readyState === ws_1.WebSocket.OPEN) {
            try {
                c.ws.send(buf);
            }
            catch { }
        }
    }
}
/** Append a SYSTEM message to global chat & broadcast it. Used for plan
 *  notifications (per Phase 4 — owner pings live in global chat). */
function broadcastPostsUpdated(reason = "change") {
    broadcast("posts:updated", { reason, ts: Date.now() });
}
function systemAnnounce(text) {
    const msg = {
        id: `sys_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        username: "system",
        nickname: "SYSTEM",
        role: "system",
        text: String(text || "").slice(0, 1000),
    };
    (0, store_1.appendMessage)(msg);
    broadcast("chat:msg", msg);
}
function send(c, typ, data, id) {
    if (c.ws.readyState !== ws_1.WebSocket.OPEN)
        return;
    try {
        c.ws.send((0, codec_1.packFrame)({ t: typ, d: data, id }));
    }
    catch { }
}
async function authToken(token) {
    if (!token)
        return null;
    try {
        const r = await (0, backendWs_1.backendCall)("GET", "/exocore/api/auth/token-verify", { token }, undefined, 5000);
        if (!r.ok || !r.data?.success)
            return null;
        const u = r.data.user || {};
        return {
            username: u.username,
            nickname: u.nickname,
            role: u.role || "user",
            level: u.level || 0,
            xp: u.xp || 0,
            achievements: Array.isArray(u.achievements) ? u.achievements : [],
            bannedUntil: u.bannedUntil ?? null,
            restrictedUntil: u.restrictedUntil ?? null,
            plan: u.plan || "free",
            planExpiresAt: u.planExpiresAt ?? null,
        };
    }
    catch {
        return null;
    }
}
function isBanned(u) {
    const b = u.bannedUntil;
    if (b == null)
        return false;
    if (b === -1)
        return true;
    return typeof b === "number" && b > Date.now();
}
function isMuted(u) {
    const r = u.restrictedUntil;
    return typeof r === "number" && r > Date.now();
}
const callBackend = backendWs_1.backendCall;
const callAdmin = (path, body) => (0, backendWs_1.backendCall)("POST", path, undefined, body);
function createSocialWss() {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    wss.on("connection", async (ws, req) => {
        // Auth happens via an in-band `auth` frame (no token in the URL).
        // Frames that arrive before auth completes are queued and replayed
        // once we know who the caller is.
        let conn = null;
        let authResolved = false;
        const pending = [];
        // Hard timeout: if no valid auth within 10s, drop the socket.
        const authTimer = setTimeout(() => {
            if (!authResolved) {
                try {
                    ws.send((0, codec_1.packFrame)({ t: "auth:fail", d: { reason: "auth timeout" } }));
                }
                catch { }
                try {
                    ws.close(4401, "auth timeout");
                }
                catch { }
            }
        }, 10_000);
        const finishAuth = async (token) => {
            if (authResolved)
                return;
            const user = await authToken(token);
            if (!user) {
                try {
                    ws.send((0, codec_1.packFrame)({ t: "auth:fail", d: { reason: "invalid token" } }));
                }
                catch { }
                try {
                    ws.close(4401, "unauthorized");
                }
                catch { }
                authResolved = true;
                clearTimeout(authTimer);
                return;
            }
            if (isBanned(user)) {
                try {
                    ws.send((0, codec_1.packFrame)({ t: "auth:fail", d: { reason: "banned", until: user.bannedUntil } }));
                }
                catch { }
                try {
                    ws.close(4403, "banned");
                }
                catch { }
                authResolved = true;
                clearTimeout(authTimer);
                return;
            }
            conn = { ws, user, token, lastSeen: Date.now() };
            conns.add(conn);
            authResolved = true;
            clearTimeout(authTimer);
            // Best-effort avatar lookup for self.
            try {
                user.avatarUrl = await avatarFor(user.username);
            }
            catch { }
            // Greet + history + presence broadcast
            send(conn, "auth:ok", { user });
            // Hydrate chat history with avatar URLs.
            (async () => {
                const msgs = (0, store_1.listMessages)(80);
                const uniq = Array.from(new Set(msgs.map(m => m.username).filter(u => u && u !== "system")));
                const av = await Promise.all(uniq.map(async (u) => [u, await avatarFor(u)]));
                const map = new Map(av);
                const enriched = msgs.map(m => ({ ...m, avatarUrl: map.get(m.username) || null }));
                send(conn, "chat:history", { messages: enriched });
            })().catch(() => send(conn, "chat:history", { messages: (0, store_1.listMessages)(80) }));
            presenceListWithAvatars().then(users => send(conn, "presence:list", { users }));
            broadcast("presence:join", { user }, conn);
            presenceListWithAvatars().then(users => broadcast("presence:list", { users }));
            // Replay any frames that arrived before auth completed.
            const queued = pending.splice(0);
            for (const q of queued) {
                ws.emit("message", q.raw, q.isBinary);
            }
        };
        ws.on("message", async (raw, isBinary) => {
            const data = isBinary ? raw : Buffer.from(raw.toString());
            const f = (0, codec_1.unpackFrame)(data);
            if (!f)
                return;
            // First, accept the in-band auth frame.
            if (!authResolved) {
                if (f.t === "auth") {
                    const token = String(f.d?.token || "");
                    await finishAuth(token);
                }
                else {
                    // Stash up to 32 frames; drop the rest to bound memory.
                    if (pending.length < 32)
                        pending.push({ raw: data, isBinary });
                }
                return;
            }
            if (!conn)
                return; // auth failed; socket already closing.
            const c2 = conn; // pin a non-null alias for use after `await` boundaries.
            c2.lastSeen = Date.now();
            switch (f.t) {
                case "ping":
                    send(conn, "pong", { ts: Date.now() }, f.id);
                    return;
                case "presence:list":
                    presenceListWithAvatars().then(users => send(c2, "presence:list", { users }, f.id));
                    return;
                case "chat:send": {
                    const text = String(f.d?.text || "").trim().slice(0, 1000);
                    if (!text)
                        return;
                    if (isBanned(c2.user)) {
                        send(c2, "error", { message: "you are banned" }, f.id);
                        return;
                    }
                    if (isMuted(c2.user)) {
                        send(c2, "error", { message: `you are muted until ${new Date(c2.user.restrictedUntil).toLocaleString()}` }, f.id);
                        return;
                    }
                    if (!chatBucket.take(c2.user.username)) {
                        send(c2, "error", { message: "slow down — chat rate limit" }, f.id);
                        return;
                    }
                    const msg = {
                        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                        ts: Date.now(),
                        username: c2.user.username,
                        nickname: c2.user.nickname,
                        role: c2.user.role,
                        plan: c2.user.plan || "free",
                        text,
                    };
                    (0, store_1.appendMessage)(msg);
                    const av = c2.user.avatarUrl ?? await avatarFor(c2.user.username);
                    c2.user.avatarUrl = av;
                    broadcast("chat:msg", { ...msg, avatarUrl: av });
                    // Phase 5 — fire-and-forget XP grant. The backend rate-limits to 1/min.
                    (async () => {
                        const r = await callBackend("POST", "/exocore/api/xp/grant", undefined, { token: c2.token, reason: "chat" });
                        if (r.ok && r.data?.success && r.data?.xpDelta > 0) {
                            const u = r.data.user;
                            c2.user.level = u.level || 0;
                            c2.user.xp = u.xp || 0;
                            c2.user.achievements = u.achievements || [];
                            broadcast("user:updated", u);
                            if (r.data.levelUp || (Array.isArray(r.data.newAchievements) && r.data.newAchievements.length > 0)) {
                                send(c2, "xp:gain", {
                                    xpDelta: r.data.xpDelta,
                                    level: r.data.level,
                                    levelUp: r.data.levelUp,
                                    newAchievements: r.data.newAchievements,
                                });
                            }
                        }
                    })().catch(() => { });
                    return;
                }
                case "chat:delete": {
                    const id = String(f.d?.id || "");
                    if (!id)
                        return;
                    // Only owner can delete chat messages.
                    if (c2.user.role !== "owner") {
                        send(c2, "error", { message: "only owner can delete messages" }, f.id);
                        return;
                    }
                    if ((0, store_1.deleteMessage)(id)) {
                        broadcast("chat:deleted", { id });
                    }
                    return;
                }
                case "admin:role": {
                    const target = String(f.d?.target || "");
                    const role = String(f.d?.role || "");
                    const r = await callAdmin("/exocore/api/admin/role", { token: c2.token, target, role });
                    send(c2, r.ok ? "admin:ok" : "admin:err", r.data, f.id);
                    if (r.ok)
                        broadcast("user:updated", r.data?.user);
                    return;
                }
                case "social:pubkey": {
                    const pubKey = String(f.d?.pubKey || "");
                    if (!pubKey)
                        return;
                    const r = await callBackend("POST", "/exocore/api/social/pubkey", undefined, { token: c2.token, pubKey });
                    send(c2, r.ok ? "social:ok" : "social:err", r.data, f.id);
                    return;
                }
                case "social:friends": {
                    const r = await callBackend("GET", "/exocore/api/social/friends", { token: c2.token });
                    // Hydrate every group with avatar URLs.
                    if (r.ok && r.data?.success) {
                        const groups = ["friends", "incoming", "outgoing", "suggestions"];
                        const allNames = new Set();
                        for (const g of groups)
                            for (const u of (r.data[g] || []))
                                allNames.add(u.username);
                        const av = await Promise.all(Array.from(allNames).map(async (n) => [n, await avatarFor(n)]));
                        const m = new Map(av);
                        for (const g of groups) {
                            r.data[g] = (r.data[g] || []).map((u) => ({ ...u, avatarUrl: m.get(u.username) || null }));
                        }
                    }
                    send(c2, "social:friends", r.data, f.id);
                    return;
                }
                case "social:peer": {
                    const username = String(f.d?.username || "");
                    if (!username)
                        return;
                    const r = await callBackend("GET", "/exocore/api/social/peer", { token: c2.token, username });
                    send(c2, "social:peer", r.data, f.id);
                    return;
                }
                case "social:friend": {
                    const action = String(f.d?.action || "");
                    const target = String(f.d?.target || "");
                    if (!action || !target)
                        return;
                    const r = await callBackend("POST", "/exocore/api/social/friend", undefined, { token: c2.token, action, target });
                    send(c2, r.ok ? "social:ok" : "social:err", { ...r.data, action, target }, f.id);
                    // Notify the target if they're online so their UI updates immediately.
                    if (r.ok) {
                        for (const c of conns) {
                            if (c.user.username === target) {
                                send(c, "social:friend-event", { from: c2.user.username, action });
                            }
                        }
                    }
                    return;
                }
                case "dm:history": {
                    const peer = String(f.d?.peer || "");
                    if (!peer)
                        return;
                    send(c2, "dm:history", { peer, messages: (0, dmStore_1.listDMs)(c2.user.username, peer, 100) }, f.id);
                    return;
                }
                case "dm:send": {
                    const to = String(f.d?.to || "");
                    const ciphertext = String(f.d?.ciphertext || "");
                    const nonce = String(f.d?.nonce || "");
                    if (!to || !ciphertext || !nonce) {
                        send(c2, "error", { message: "dm:send requires to/ciphertext/nonce" }, f.id);
                        return;
                    }
                    if (isBanned(c2.user)) {
                        send(c2, "error", { message: "you are banned" }, f.id);
                        return;
                    }
                    if (isMuted(c2.user)) {
                        send(c2, "error", { message: `you are muted until ${new Date(c2.user.restrictedUntil).toLocaleString()}` }, f.id);
                        return;
                    }
                    if (!dmBucket.take(c2.user.username)) {
                        send(c2, "error", { message: "slow down — dm rate limit" }, f.id);
                        return;
                    }
                    const rec = {
                        id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
                        ts: Date.now(),
                        from: c2.user.username,
                        to,
                        ciphertext,
                        nonce,
                    };
                    (0, dmStore_1.appendDM)(rec);
                    // Echo to sender (with id) + push to recipient(s) if online.
                    send(c2, "dm:msg", rec, f.id);
                    for (const c of conns) {
                        if (c === c2)
                            continue;
                        if (c.user.username === to)
                            send(c, "dm:msg", rec);
                    }
                    return;
                }
                case "admin:ban": {
                    const target = String(f.d?.target || "");
                    const days = f.d?.days;
                    const reason = f.d?.reason;
                    const r = await callAdmin("/exocore/api/admin/ban", { token: c2.token, target, days, reason });
                    send(c2, r.ok ? "admin:ok" : "admin:err", r.data, f.id);
                    if (r.ok) {
                        broadcast("user:updated", r.data?.user);
                        // Boot the banned user immediately.
                        const banned = r.data?.user;
                        if (banned?.username) {
                            for (const c of Array.from(conns)) {
                                if (c.user.username === banned.username) {
                                    try {
                                        c.ws.close(4403, "banned");
                                    }
                                    catch { }
                                    conns.delete(c);
                                }
                            }
                            presenceListWithAvatars().then(users => broadcast("presence:list", { users }));
                        }
                    }
                    return;
                }
                default:
                    send(c2, "error", { message: `unknown frame: ${f.t}` }, f.id);
            }
        });
        const onLeave = () => {
            clearTimeout(authTimer);
            if (!conn)
                return;
            if (!conns.delete(conn))
                return;
            broadcast("presence:leave", { username: conn.user.username });
            presenceListWithAvatars().then(users => broadcast("presence:list", { users }));
        };
        ws.on("close", onLeave);
        ws.on("error", onLeave);
    });
    // heartbeat-ish cleanup
    setInterval(() => {
        const now = Date.now();
        for (const c of Array.from(conns)) {
            if (c.ws.readyState !== ws_1.WebSocket.OPEN) {
                conns.delete(c);
                continue;
            }
            if (now - c.lastSeen > 90_000) {
                try {
                    c.ws.close(4408, "idle");
                }
                catch { }
                conns.delete(c);
            }
        }
    }, 30_000).unref?.();
    // Phase 6 — naturally-expired ban / mute scheduler. Every 30s we
    // re-pull each connected user's record and broadcast user:updated +
    // a system message when bannedUntil or restrictedUntil rolled past now.
    setInterval(async () => {
        for (const c of Array.from(conns)) {
            const wasBanned = isBanned(c.user);
            const wasMuted = isMuted(c.user);
            const fresh = await authToken(c.token);
            if (!fresh)
                continue;
            const nowBanned = isBanned(fresh);
            const nowMuted = isMuted(fresh);
            // Carry forward the live state so chat:send stops blocking.
            c.user = { ...c.user, ...fresh };
            if (wasBanned && !nowBanned) {
                systemAnnounce(`🔓 @${fresh.username}'s ban has expired.`);
                broadcast("user:updated", fresh);
            }
            if (wasMuted && !nowMuted) {
                send(c, "user:updated", fresh);
                broadcast("user:updated", fresh);
            }
        }
    }, 30_000).unref?.();
    return wss;
}
