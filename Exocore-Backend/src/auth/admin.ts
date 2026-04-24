import { Request, Response } from "express";
import { getAllUsers, getUserFolder, writeUserDb, isCacheReady, UserData } from "../services/drive";
import { appendAudit } from "../services/auditStore";
import { canAssignRole, canModerate, Role, roleForEmail } from "../utils/owners";

function sanitize(u: UserData) {
  const { pass: _p, verifyOtp: _o, ...safe } = u;
  return safe;
}

async function userByToken(token: string): Promise<UserData | null> {
  if (!token) return null;
  const all = await getAllUsers();
  return all.find(u => u.token === token) ?? null;
}

async function userByUsername(username: string): Promise<UserData | null> {
  const all = await getAllUsers();
  return all.find(u => u.username === username) ?? null;
}

/** GET /exocore/api/auth/token-verify?token=... → returns sanitized user. */
export async function tokenVerifyHandler(req: Request, res: Response) {
  try {
    const token = String(req.query.token || req.body?.token || "").trim();
    if (!token) return res.status(400).json({ success: false, message: "Missing token" });
    if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
    const u = await userByToken(token);
    if (!u) return res.status(401).json({ success: false, message: "invalid token" });
    return res.json({ success: true, user: sanitize(u) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/admin/role { token, target, role } */
export async function setRoleHandler(req: Request, res: Response) {
  try {
    const { token, target, role } = (req.body || {}) as { token?: string; target?: string; role?: Role };
    if (!token || !target || !role) return res.status(400).json({ success: false, message: "token/target/role required" });
    if (!["owner", "admin", "mod", "user"].includes(role)) return res.status(400).json({ success: false, message: "invalid role" });

    const caller = await userByToken(token);
    if (!caller) return res.status(401).json({ success: false, message: "invalid token" });
    const tgt = await userByUsername(target);
    if (!tgt) return res.status(404).json({ success: false, message: "target not found" });

    // Email-pinned owners can never be demoted.
    if (roleForEmail(tgt.email) === "owner" && role !== "owner") {
      return res.status(403).json({ success: false, message: "cannot demote a pinned owner" });
    }
    if (!canAssignRole(String(caller.role || "user"), String(tgt.role || "user"), role)) {
      return res.status(403).json({ success: false, message: "insufficient privileges" });
    }
    const folderId = await getUserFolder(tgt.username);
    if (!folderId) return res.status(404).json({ success: false, message: "target folder missing" });
    const updated: UserData = { ...tgt, role };
    await writeUserDb(folderId, updated);
    appendAudit({ by: caller.username, action: "role:set", target: tgt.username, meta: { from: tgt.role || "user", to: role } });
    return res.json({ success: true, user: sanitize(updated) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/admin/mute { token, target, minutes, reason? }
 *  minutes: number > 0 sets restrictedUntil; 0 lifts the mute. */
export async function muteHandler(req: Request, res: Response) {
  try {
    const { token, target, minutes, reason } = (req.body || {}) as {
      token?: string; target?: string; minutes?: number; reason?: string;
    };
    if (!token || !target || minutes === undefined) {
      return res.status(400).json({ success: false, message: "token/target/minutes required" });
    }
    const caller = await userByToken(token);
    if (!caller) return res.status(401).json({ success: false, message: "invalid token" });
    const tgt = await userByUsername(target);
    if (!tgt) return res.status(404).json({ success: false, message: "target not found" });
    if (roleForEmail(tgt.email) === "owner") {
      return res.status(403).json({ success: false, message: "cannot mute a pinned owner" });
    }
    if (!canModerate(String(caller.role || "user"), String(tgt.role || "user"))) {
      return res.status(403).json({ success: false, message: "insufficient privileges" });
    }
    const restrictedUntil = (typeof minutes === "number" && minutes > 0)
      ? Date.now() + minutes * 60 * 1000 : null;
    const folderId = await getUserFolder(tgt.username);
    if (!folderId) return res.status(404).json({ success: false, message: "target folder missing" });
    const updated: UserData = { ...tgt, restrictedUntil };
    await writeUserDb(folderId, updated);
    appendAudit({
      by: caller.username,
      action: restrictedUntil === null ? "mute:lift" : "mute:apply",
      target: tgt.username,
      meta: { restrictedUntil, reason: reason || null },
    });
    return res.json({ success: true, user: sanitize(updated) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}

/** POST /exocore/api/admin/ban { token, target, days, reason? }
 *  days: number of days (>0), 0 = unban, "perm" = permanent.            */
export async function banHandler(req: Request, res: Response) {
  try {
    const { token, target, days, reason } = (req.body || {}) as {
      token?: string; target?: string; days?: number | "perm"; reason?: string;
    };
    if (!token || !target || days === undefined) {
      return res.status(400).json({ success: false, message: "token/target/days required" });
    }

    const caller = await userByToken(token);
    if (!caller) return res.status(401).json({ success: false, message: "invalid token" });
    const tgt = await userByUsername(target);
    if (!tgt) return res.status(404).json({ success: false, message: "target not found" });
    if (roleForEmail(tgt.email) === "owner") {
      return res.status(403).json({ success: false, message: "cannot ban a pinned owner" });
    }
    if (!canModerate(String(caller.role || "user"), String(tgt.role || "user"))) {
      return res.status(403).json({ success: false, message: "insufficient privileges" });
    }

    let bannedUntil: number | null = null;
    if (days === "perm") bannedUntil = -1;
    else if (typeof days === "number" && days > 0) bannedUntil = Date.now() + days * 86400 * 1000;
    else bannedUntil = null; // unban

    const folderId = await getUserFolder(tgt.username);
    if (!folderId) return res.status(404).json({ success: false, message: "target folder missing" });
    const updated: UserData = { ...tgt, bannedUntil, banReason: reason || null };
    await writeUserDb(folderId, updated);
    appendAudit({
      by: caller.username,
      action: bannedUntil === null ? "ban:lift" : "ban:apply",
      target: tgt.username,
      meta: { bannedUntil, reason: reason || null },
    });
    return res.json({ success: true, user: sanitize(updated) });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message });
  }
}
