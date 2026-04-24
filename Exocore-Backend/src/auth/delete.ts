import { Request, Response } from "express";
import {
  drive,
  getAllUsers,
  getUserFolder,
  readUserDb,
  deleteUserFolder,
  UserData,
} from "../services/drive";

/**
 * Delete the account belonging to the supplied token / identifier.
 * Body / query params:
 *   - token  (optional) — the user's auth token
 *   - pass   (required) — current password, used as a safety re-confirm
 *   - user / username / email / id (optional) — fallback identifier
 *
 * FAST PATH: if a username is supplied, we look up that ONE folder in Drive
 * and read only its database.json (≈2 Drive calls). The slow fallback that
 * scans every user is only used when we have no username at all.
 */
export default async function deleteHandler(req: Request, res: Response) {
  try {
    const params = { ...(req.query as any), ...(req.body as any) };
    const token = params.token as string | undefined;
    const pass = params.pass as string | undefined;
    const username = (params.username ?? params.user) as string | undefined;
    const email = params.email as string | undefined;
    const idParam = params.id as string | undefined;
    const identifier = username ?? email ?? idParam;

    console.log(
      `[delete] hit — method=${req.method} hasToken=${!!token} tokenLen=${token?.length ?? 0} hasPass=${!!pass} username=${username ?? "(none)"} email=${email ?? "(none)"}`
    );

    if (!pass) {
      console.log("[delete] reject: no pass");
      return res.status(400).json({ success: false, message: "Password is required to confirm deletion" });
    }
    if (!token && !identifier) {
      console.log("[delete] reject: no token and no identifier");
      return res.status(400).json({ success: false, message: "Token or username/email is required" });
    }

    let found: UserData | undefined;
    let folderId: string | null = null;

    // Normalize the username candidates we'll try (with and without @ prefix,
    // lowercased) so a small mismatch doesn't break delete.
    const usernameCandidates = new Set<string>();
    if (username) {
      const u = String(username).trim();
      usernameCandidates.add(u);
      usernameCandidates.add(u.toLowerCase());
      const noAt = u.replace(/^@+/, "");
      usernameCandidates.add(noAt);
      usernameCandidates.add(noAt.toLowerCase());
      usernameCandidates.add(`@${noAt}`);
      usernameCandidates.add(`@${noAt.toLowerCase()}`);
    }

    // FAST PATH — try every username candidate against the cache directly.
    for (const cand of usernameCandidates) {
      const t0 = Date.now();
      const fid = await getUserFolder(cand);
      console.log(`[delete] fast-path lookup "${cand}" → ${fid ?? "NOT FOUND"} (${Date.now() - t0}ms)`);
      if (fid) {
        folderId = fid;
        const db = await readUserDb(fid);
        if (db) { found = db; break; }
      }
    }

    // SLOW PATH — scan all users and match by ANY identifier we have.
    if (!found) {
      console.log("[delete] slow-path: scanning all users…");
      const t0 = Date.now();
      const users = await getAllUsers();
      console.log(`[delete] loaded ${users.length} users (${Date.now() - t0}ms)`);
      const emailLower = (email ?? "").toString().toLowerCase().trim();
      const idLower = (identifier ?? "").toString().toLowerCase().trim();
      const idNoAt = idLower.replace(/^@+/, "");

      found = users.find(u => {
        const uname = (u.username || "").toLowerCase();
        const unameNoAt = uname.replace(/^@+/, "");
        const uemail = (u.email || "").toLowerCase();
        if (token && u.token === token) return true;
        if (emailLower && uemail === emailLower) return true;
        if (idParam && String(u.id) === String(idParam)) return true;
        if (identifier) {
          if (uname === idLower || unameNoAt === idNoAt) return true;
          if (uemail === idLower) return true;
        }
        for (const cand of usernameCandidates) {
          if (uname === cand.toLowerCase()) return true;
        }
        return false;
      });
      if (found) {
        console.log(`[delete] slow-path matched user=${found.username} email=${found.email}`);
        folderId = await getUserFolder(found.username);
        console.log(`[delete] folder lookup for ${found.username} → ${folderId ?? "NOT FOUND"}`);
      } else {
        // Helpful diagnostic — show first chars of a few cached usernames so
        // we can tell whether the input simply doesn't exist.
        const sample = users.slice(0, 5).map(u => u.username).join(", ");
        console.log(`[delete] no match. tried candidates=${[...usernameCandidates].join("|")} email="${emailLower}" id="${idParam ?? ""}". cache sample: ${sample}`);
      }
    }

    if (!found) {
      console.log("[delete] reject: no user matched");
      return res.status(401).json({ success: false, message: "Account not found for that token or identifier" });
    }

    if (token && found.token !== token) {
      console.log(`[delete] note: provided token does not match stored token (using identifier match)`);
    }

    if (found.pass !== pass) {
      console.log("[delete] reject: password mismatch");
      return res.status(403).json({ success: false, message: "Password does not match — deletion cancelled" });
    }

    if (!folderId) {
      console.log("[delete] reject: no drive folder found for user");
      return res.status(404).json({ success: false, message: "User folder not found" });
    }

    const t2 = Date.now();
    await deleteUserFolder(folderId);
    console.log(`[delete] ✅ account removed: ${found.username} (${found.email}) — drive delete ${Date.now() - t2}ms`);

    return res.status(200).json({
      success: true,
      message: "Account deleted",
      username: found.username,
      email: found.email,
    });
  } catch (err: any) {
    console.error("[delete] error:", err?.message, err?.stack);
    return res.status(500).json({ success: false, message: "Failed to delete account", error: err?.message });
  }
}

export { drive, deleteUserFolder };
