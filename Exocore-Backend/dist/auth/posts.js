"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileHandler = profileHandler;
exports.listPostsHandler = listPostsHandler;
exports.createPostHandler = createPostHandler;
exports.deletePostHandler = deletePostHandler;
exports.reactHandler = reactHandler;
exports.commentHandler = commentHandler;
exports.deleteCommentHandler = deleteCommentHandler;
const drive_1 = require("../services/drive");
const postsStore_1 = require("../services/postsStore");
const xpService_1 = require("../services/xpService");
const auditStore_1 = require("../services/auditStore");
function sanitize(u) {
    const { pass: _p, verifyOtp: _o, token: _t, email: _e, friendRequests: _fr, sentFriendRequests: _sfr, ...safe } = u;
    return safe;
}
async function userByToken(token) {
    if (!token)
        return null;
    return (await (0, drive_1.getAllUsers)()).find(u => u.token === token) ?? null;
}
async function userByName(username) {
    if (!username)
        return null;
    return (await (0, drive_1.getAllUsers)()).find(u => u.username === username) ?? null;
}
function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
/** GET /exocore/api/posts/profile?token=...&username=...
 *  Returns full public profile incl. avatar/cover/posts/friends count. */
async function profileHandler(req, res) {
    try {
        if (!(0, drive_1.isCacheReady)())
            return res.status(503).json({ success: false, message: "warming up" });
        const token = String(req.query.token || "");
        const username = String(req.query.username || "");
        if (!username)
            return res.status(400).json({ success: false, message: "username required" });
        const me = token ? await userByToken(token) : null;
        const u = await userByName(username);
        if (!u)
            return res.status(404).json({ success: false, message: "not found" });
        const folderId = await (0, drive_1.getUserFolder)(u.username);
        let images = { avatarUrl: null, coverUrl: null };
        if (folderId) {
            try {
                images = await (0, drive_1.getProfileImages)(folderId);
            }
            catch { }
        }
        const posts = (0, postsStore_1.listPostsByAuthor)(u.username, 60);
        const friends = Array.isArray(u.friends) ? u.friends : [];
        const isFriend = !!(me && friends.includes(me.username));
        return res.json({
            success: true,
            profile: sanitize(u),
            avatarUrl: images.avatarUrl,
            coverUrl: images.coverUrl,
            friendsCount: friends.length,
            postsCount: posts.length,
            posts,
            relation: me ? {
                isSelf: me.username === u.username,
                isFriend,
                outgoing: Array.isArray(me.sentFriendRequests) && me.sentFriendRequests.includes(u.username),
                incoming: Array.isArray(me.friendRequests) && me.friendRequests.includes(u.username),
            } : null,
        });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** GET /exocore/api/posts?username=...&token=... */
async function listPostsHandler(req, res) {
    try {
        const username = String(req.query.username || "");
        if (username) {
            return res.json({ success: true, posts: (0, postsStore_1.listPostsByAuthor)(username, 60) });
        }
        return res.json({ success: true, posts: (0, postsStore_1.listFeed)(60) });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** POST /exocore/api/posts/create  multipart: file?, fields: token, text */
async function createPostHandler(req, res) {
    try {
        if (!(0, drive_1.isCacheReady)())
            return res.status(503).json({ success: false, message: "warming up" });
        const token = String((req.body?.token ?? req.query.token ?? "")).trim();
        const text = String((req.body?.text ?? "")).slice(0, 500);
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        if (!text && !req.file) {
            return res.status(400).json({ success: false, message: "text or image required" });
        }
        const folderId = await (0, drive_1.getUserFolder)(me.username);
        if (!folderId)
            return res.status(404).json({ success: false, message: "folder missing" });
        const id = newId("post");
        let imageUrl = null;
        let imageFileId = null;
        const file = req.file;
        if (file?.buffer) {
            try {
                const fid = await (0, drive_1.uploadImagePublic)(folderId, `post_${id}.png`, file.buffer);
                if (fid) {
                    imageFileId = fid;
                    imageUrl = `https://drive.google.com/thumbnail?id=${fid}&sz=w1600`;
                }
            }
            catch (e) {
                console.warn("[posts] upload failed:", e?.message);
            }
        }
        const post = {
            id, ts: Date.now(), author: me.username,
            imageUrl, imageFileId, text, comments: [],
        };
        (0, postsStore_1.addPost)(post);
        // Phase 5 — XP + first_post achievement.
        const ach = (Array.isArray(me.achievements) && me.achievements.includes("first_post")) ? [] : ["first_post"];
        const xp = await (0, xpService_1.addXp)(me, "post", ach);
        return res.json({ success: true, post, xp: { xpDelta: xp.xpDelta, level: xp.level, levelUp: xp.levelUp, newAchievements: xp.newAchievements } });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** POST /exocore/api/posts/delete  { token, postId } */
async function deletePostHandler(req, res) {
    try {
        const { token, postId } = (req.body || {});
        if (!token || !postId)
            return res.status(400).json({ success: false, message: "token/postId required" });
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        const p = (0, postsStore_1.getPost)(postId);
        if (!p)
            return res.status(404).json({ success: false, message: "post not found" });
        if (p.author !== me.username && me.role !== "owner") {
            return res.status(403).json({ success: false, message: "forbidden" });
        }
        (0, postsStore_1.softDeletePost)(postId);
        (0, auditStore_1.appendAudit)({ by: me.username, action: "post:delete", target: postId, meta: { author: p.author } });
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** POST /exocore/api/posts/react  { token, postId, emoji } */
async function reactHandler(req, res) {
    try {
        const { token, postId, emoji } = (req.body || {});
        if (!token || !postId || !emoji)
            return res.status(400).json({ success: false, message: "token/postId/emoji required" });
        if (!postsStore_1.REACTION_EMOJIS.includes(emoji)) {
            return res.status(400).json({ success: false, message: "invalid emoji" });
        }
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        const r = (0, postsStore_1.toggleReaction)(postId, emoji, me.username);
        if (!r)
            return res.status(404).json({ success: false, message: "post not found" });
        return res.json({ success: true, reactions: r.reactions, mine: r.mine });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** POST /exocore/api/posts/comment  { token, postId, text } */
async function commentHandler(req, res) {
    try {
        const { token, postId, text } = (req.body || {});
        if (!token || !postId || !text)
            return res.status(400).json({ success: false, message: "token/postId/text required" });
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        const p = (0, postsStore_1.getPost)(postId);
        if (!p)
            return res.status(404).json({ success: false, message: "post not found" });
        const c = {
            id: newId("c"), ts: Date.now(), author: me.username,
            text: String(text).slice(0, 300),
        };
        (0, postsStore_1.addComment)(postId, c);
        return res.json({ success: true, comment: c });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** POST /exocore/api/posts/comment/delete  { token, postId, commentId } */
async function deleteCommentHandler(req, res) {
    try {
        const { token, postId, commentId } = (req.body || {});
        if (!token || !postId || !commentId)
            return res.status(400).json({ success: false, message: "fields required" });
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        const p = (0, postsStore_1.getPost)(postId);
        if (!p)
            return res.status(404).json({ success: false, message: "post not found" });
        const c = p.comments.find(x => x.id === commentId);
        if (!c)
            return res.status(404).json({ success: false, message: "comment not found" });
        if (c.author !== me.username && me.role !== "owner") {
            return res.status(403).json({ success: false, message: "forbidden" });
        }
        (0, postsStore_1.deleteComment)(postId, commentId);
        (0, auditStore_1.appendAudit)({ by: me.username, action: "comment:delete", target: commentId, meta: { postId, author: c.author } });
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
