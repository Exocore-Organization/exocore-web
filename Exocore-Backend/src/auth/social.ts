import { Request, Response } from "express";
import { getAllUsers, getUserFolder, writeUserDb, isCacheReady, UserData } from "../services/drive";
import { addXp } from "../services/xpService";
import { isUserVerified } from "../utils/CheckUserVerified";

function sanitize(u: UserData) {
  const { pass: _p, verifyOtp: _o, ...safe } = u;
  return safe;
}

async function userByToken(token: string): Promise<UserData | null> {
  if (!token) return null;
  const all = await getAllUsers();
  return all.find(u => u.token === token) ?? null;
}

async function userByName(username: string): Promise<UserData | null> {
  if (!username) return null;
  const all = await getAllUsers();
  return all.find(u => u.username === username) ?? null;
}

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

async function patch(u: UserData, fields: Partial<UserData>) {
  const folderId = await getUserFolder(u.username);
  if (!folderId) throw new Error("folder missing for " + u.username);
  await writeUserDb(folderId, { ...u, ...fields });
}

/** POST /exocore/api/social/pubkey { token, pubKey }
 *  Registers / replaces the user's X25519 public key (base64). */
export async function registerPubKey(req: Request, res: Response) {
  try {
    const { token, pubKey } = (req.body || {}) as { token?: string; pubKey?: string };
    if (!token || !pubKey) return res.status(400).json({ success: false, message: "token/pubKey required" });
    if (typeof pubKey !== "string" || pubKey.length < 16 || pubKey.length > 256) {
      return res.status(400).json({ success: false, message: "invalid pubKey" });
    }
    if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
    const u = await userByToken(token);
    if (!u) return res.status(401).json({ success: false, message: "invalid token" });
    await patch(u, { pubKey });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** GET /exocore/api/social/peer?token=...&username=...
 *  Returns the public profile slice of `username`, including pubKey. */
export async function getPeer(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    const username = String(req.query.username || "");
    if (!token || !username) return res.status(400).json({ success: false, message: "token/username required" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const peer = await userByName(username);
    if (!peer) return res.status(404).json({ success: false, message: "not found" });
    const { pass: _p, verifyOtp: _o, token: _t, email: _e, friends: _f, friendRequests: _fr,
            sentFriendRequests: _sfr, ...pub } = peer;
    return res.json({ success: true, peer: pub });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** GET /exocore/api/social/friends?token=...
 *  Returns: { friends, incoming, outgoing, suggestions } */
export async function listFriends(req: Request, res: Response) {
  try {
    const token = String(req.query.token || "");
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    const all = await getAllUsers();
    const myFriends = new Set(asArr(me.friends));
    const incoming = asArr(me.friendRequests);
    const outgoing = asArr(me.sentFriendRequests);
    const slim = (u: UserData) => ({
      username: u.username, nickname: u.nickname, role: u.role || "user",
      level: u.level || 0, pubKey: u.pubKey || null,
    });
    const friends = all.filter(u => myFriends.has(u.username)).map(slim);

    // Suggestions: top by mutual-friend count, then most recent.
    const suggestions = all
      .filter(u => u.username !== me.username && !myFriends.has(u.username) &&
                   !incoming.includes(u.username) && !outgoing.includes(u.username) &&
                   isUserVerified(u))
      .map(u => {
        const theirs = new Set(asArr(u.friends));
        let mutual = 0;
        for (const f of myFriends) if (theirs.has(f)) mutual++;
        return { user: u, mutual };
      })
      .sort((a, b) => b.mutual - a.mutual || (b.user.createdAt || 0) - (a.user.createdAt || 0))
      .slice(0, 200)
      .map(x => ({ ...slim(x.user), mutual: x.mutual }));

    return res.json({
      success: true,
      friends,
      incoming: incoming.map(n => slim(all.find(u => u.username === n) || ({ username: n } as UserData))),
      outgoing: outgoing.map(n => slim(all.find(u => u.username === n) || ({ username: n } as UserData))),
      suggestions,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/social/friend { token, action, target }
 *  action: "request" | "cancel" | "accept" | "decline" | "remove"            */
export async function friendAction(req: Request, res: Response) {
  try {
    const { token, action, target } = (req.body || {}) as { token?: string; action?: string; target?: string };
    if (!token || !action || !target) return res.status(400).json({ success: false, message: "token/action/target required" });
    const me = await userByToken(token);
    if (!me) return res.status(401).json({ success: false, message: "invalid token" });
    if (target === me.username) return res.status(400).json({ success: false, message: "cannot friend yourself" });
    const peer = await userByName(target);
    if (!peer) return res.status(404).json({ success: false, message: "target not found" });

    const myFriends = new Set(asArr(me.friends));
    const myInc = new Set(asArr(me.friendRequests));
    const myOut = new Set(asArr(me.sentFriendRequests));
    const peerFriends = new Set(asArr(peer.friends));
    const peerInc = new Set(asArr(peer.friendRequests));
    const peerOut = new Set(asArr(peer.sentFriendRequests));

    switch (action) {
      case "request": {
        if (myFriends.has(peer.username)) return res.json({ success: true, status: "already_friends" });
        if (myOut.has(peer.username)) return res.json({ success: true, status: "already_sent" });
        // If peer already requested me → auto-accept.
        if (myInc.has(peer.username)) {
          myFriends.add(peer.username); peerFriends.add(me.username);
          myInc.delete(peer.username); peerOut.delete(me.username);
        } else {
          myOut.add(peer.username); peerInc.add(me.username);
        }
        break;
      }
      case "cancel": {
        myOut.delete(peer.username); peerInc.delete(me.username);
        break;
      }
      case "accept": {
        if (!myInc.has(peer.username)) return res.status(400).json({ success: false, message: "no pending request" });
        myInc.delete(peer.username); peerOut.delete(me.username);
        myFriends.add(peer.username); peerFriends.add(me.username);
        break;
      }
      case "decline": {
        myInc.delete(peer.username); peerOut.delete(me.username);
        break;
      }
      case "remove": {
        myFriends.delete(peer.username); peerFriends.delete(me.username);
        break;
      }
      default:
        return res.status(400).json({ success: false, message: "invalid action" });
    }

    await patch(me,   { friends: [...myFriends],   friendRequests: [...myInc],   sentFriendRequests: [...myOut]   });
    await patch(peer, { friends: [...peerFriends], friendRequests: [...peerInc], sentFriendRequests: [...peerOut] });

    // Phase 5 — XP awards on the auto-accept ("request" that auto-accepted)
    // and explicit "accept" cases. Both sides get +5 + first_friend.
    const becameFriends = (action === "accept") || (action === "request" && myFriends.has(peer.username));
    if (becameFriends) {
      const meWithFriends = { ...me, friends: [...myFriends], friendRequests: [...myInc], sentFriendRequests: [...myOut] };
      const peerWithFriends = { ...peer, friends: [...peerFriends], friendRequests: [...peerInc], sentFriendRequests: [...peerOut] };
      const meHasFF = Array.isArray(me.achievements) && (me.achievements as string[]).includes("first_friend");
      const peerHasFF = Array.isArray(peer.achievements) && (peer.achievements as string[]).includes("first_friend");
      try { await addXp(meWithFriends,   "friend_accept", meHasFF ? [] : ["first_friend"]); } catch {}
      try { await addXp(peerWithFriends, "friend_accept", peerHasFF ? [] : ["first_friend"]); } catch {}
    }

    return res.json({ success: true, me: sanitize({ ...me, friends: [...myFriends], friendRequests: [...myInc], sentFriendRequests: [...myOut] }) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}
