import { Request, Response } from "express";
import {
  getAllUsers, getUserFolder, getProfileImages, isCacheReady,
  uploadImagePublic, UserData,
} from "../services/drive";
import {
  addPost, listPostsByAuthor, listFeed, getPost, softDeletePost,
  addComment, deleteComment, toggleReaction, REACTION_EMOJIS, Post, Comment,
} from "../services/postsStore";
import { addXp } from "../services/xpService";
import { appendAudit } from "../services/auditStore";

function sanitize(u: UserData) {
  const { pass: _p, verifyOtp: _o, token: _t, email: _e, friendRequests: _fr,
          sentFriendRequests: _sfr, ...safe } = u as any;
  return safe;
}

async function userByToken(token: string): Promise<UserData | null> {
  if (!token) return null;
  return (await getAllUsers()).find(u => u.token === token) ?? null;
}

async function userByName(username: string): Promise<UserData | null> {
  if (!username) return null;
  return (await getAllUsers()).find(u => u.username === username) ?? null;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** GET /exocore/api/posts/profile?token=...&username=...
 *  Returns full public profile incl. avatar/cover/posts/friends count. */
export async function profileHandler(req: Request, res: Response) {
  try {
    if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
    const token = String(req.query.token || "");
    const username = String(req.query.username || "");
    if (!username) return res.status(400).json({ success: false, message: "username required" });
    const me = token ? await userByToken(token) : null;
    const u = await userByName(username);
    if (!u) return res.status(404).json({ success: false, message: "not found" });
    const folderId = await getUserFolder(u.username);
    let images = { avatarUrl: null as string | null, coverUrl: null as string | null };
    if (folderId) { try { images = await getProfileImages(folderId); } catch {} }
    const posts = listPostsByAuthor(u.username, 60);
    const friends = Array.isArray(u.friends) ? (u.friends as string[]) : [];
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
        outgoing: Array.isArray(me.sentFriendRequests) && (me.sentFriendRequests as string[]).includes(u.username),
        incoming: Array.isArray(me.friendRequests) && (me.friendRequests as string[]).includes(u.username),
      } : null,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** GET /exocore/api/posts?username=...&token=... */
export async function listPostsHandler(req: Request, res: Response) {
  try {
    const username = String(req.query.username || "");
    if (username) {
      return res.json({ success: true, posts: listPostsByAuthor(username, 60) });
    }
    return res.json({ success: true, posts: listFeed(60) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/posts/create  multipart: file?, fields: token, text */
export async function createPostHandler(req: Request, res: Response) {
  try {
    if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
    const token = String((req.body?.token ?? req.query.token ?? "")).trim();
    const text = String((req.body?.text ?? "")).slice(0, 500);
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    if (!text && !(req as any).file) {
      return res.status(400).json({ success: false, message: "text or image required" });
    }
    const folderId = await getUserFolder(me.username);
    if (!folderId) return res.status(404).json({ success: false, message: "folder missing" });

    const id = newId("post");
    let imageUrl: string | null = null;
    let imageFileId: string | null = null;
    const file = (req as any).file as { buffer: Buffer } | undefined;
    if (file?.buffer) {
      try {
        const fid = await uploadImagePublic(folderId, `post_${id}.png`, file.buffer);
        if (fid) {
          imageFileId = fid;
          imageUrl = `https://drive.google.com/thumbnail?id=${fid}&sz=w1600`;
        }
      } catch (e: any) {
        console.warn("[posts] upload failed:", e?.message);
      }
    }
    const post: Post = {
      id, ts: Date.now(), author: me.username,
      imageUrl, imageFileId, text, comments: [],
    };
    addPost(post);
    // Phase 5 — XP + first_post achievement.
    const ach = (Array.isArray(me.achievements) && (me.achievements as string[]).includes("first_post")) ? [] : ["first_post"];
    const xp = await addXp(me, "post", ach);
    return res.json({ success: true, post, xp: { xpDelta: xp.xpDelta, level: xp.level, levelUp: xp.levelUp, newAchievements: xp.newAchievements } });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/posts/delete  { token, postId } */
export async function deletePostHandler(req: Request, res: Response) {
  try {
    const { token, postId } = (req.body || {}) as { token?: string; postId?: string };
    if (!token || !postId) return res.status(400).json({ success: false, message: "token/postId required" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const p = getPost(postId);
    if (!p) return res.status(404).json({ success: false, message: "post not found" });
    if (p.author !== me.username && me.role !== "owner") {
      return res.status(403).json({ success: false, message: "forbidden" });
    }
    softDeletePost(postId);
    appendAudit({ by: me.username, action: "post:delete", target: postId, meta: { author: p.author } });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/posts/react  { token, postId, emoji } */
export async function reactHandler(req: Request, res: Response) {
  try {
    const { token, postId, emoji } = (req.body || {}) as { token?: string; postId?: string; emoji?: string };
    if (!token || !postId || !emoji) return res.status(400).json({ success: false, message: "token/postId/emoji required" });
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      return res.status(400).json({ success: false, message: "invalid emoji" });
    }
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const r = toggleReaction(postId, emoji, me.username);
    if (!r) return res.status(404).json({ success: false, message: "post not found" });
    return res.json({ success: true, reactions: r.reactions, mine: r.mine });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/posts/comment  { token, postId, text } */
export async function commentHandler(req: Request, res: Response) {
  try {
    const { token, postId, text } = (req.body || {}) as { token?: string; postId?: string; text?: string };
    if (!token || !postId || !text) return res.status(400).json({ success: false, message: "token/postId/text required" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const p = getPost(postId);
    if (!p) return res.status(404).json({ success: false, message: "post not found" });
    const c: Comment = {
      id: newId("c"), ts: Date.now(), author: me.username,
      text: String(text).slice(0, 300),
    };
    addComment(postId, c);
    return res.json({ success: true, comment: c });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/posts/comment/delete  { token, postId, commentId } */
export async function deleteCommentHandler(req: Request, res: Response) {
  try {
    const { token, postId, commentId } = (req.body || {}) as { token?: string; postId?: string; commentId?: string };
    if (!token || !postId || !commentId) return res.status(400).json({ success: false, message: "fields required" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const p = getPost(postId);
    if (!p) return res.status(404).json({ success: false, message: "post not found" });
    const c = p.comments.find(x => x.id === commentId);
    if (!c) return res.status(404).json({ success: false, message: "comment not found" });
    if (c.author !== me.username && me.role !== "owner") {
      return res.status(403).json({ success: false, message: "forbidden" });
    }
    deleteComment(postId, commentId);
    appendAudit({ by: me.username, action: "comment:delete", target: commentId, meta: { postId, author: c.author } });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}
