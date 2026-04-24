import { Request, Response } from "express";
import {
  getAllUsers,
  getUserFolder,
  writeUserDb,
  uploadImagePublic,
  getProfileImages,
  isCacheReady,
  UserData,
} from "../services/drive";

function sanitize(u: UserData) {
  const { pass: _p, verifyOtp: _o, ...safe } = u;
  return safe;
}

async function findUserByToken(token: string): Promise<UserData | null> {
  if (!token) return null;
  const users = await getAllUsers();
  return users.find(u => u.token === token) ?? null;
}

export default async function userInfoHandler(req: Request, res: Response) {
  try {
    const source = String((req.query.source ?? req.body?.source ?? "")).trim();
    const token = String((req.query.token ?? req.body?.token ?? "")).trim();

    if (!source) {
      return res.status(400).json({ success: false, message: "Missing source" });
    }
    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token" });
    }
    if (!isCacheReady()) {
      return res.status(503).json({ success: false, message: "Service warming up, try again shortly" });
    }

    const user = await findUserByToken(token);
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const folderId = await getUserFolder(user.username);
    if (!folderId) {
      return res.status(404).json({ success: false, message: "User folder not found" });
    }

    // ─────────────────────────────────────────────────────────────────────
    // GET ?source=pv  → profile view (user info + image URLs)
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === "GET" && (source === "pv" || source === "view" || source === "info")) {
      let images = { avatarUrl: null as string | null, coverUrl: null as string | null };
      try { images = await getProfileImages(folderId); } catch {}
      return res.status(200).json({
        success: true,
        user: sanitize(user),
        avatarUrl: images.avatarUrl,
        coverUrl: images.coverUrl,
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST ?source=upload-avatar | upload-cover  (multer single 'file')
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === "POST" && (source === "upload-avatar" || source === "upload-cover")) {
      const file = (req as any).file as { buffer: Buffer; mimetype?: string } | undefined;
      if (!file?.buffer) {
        return res.status(400).json({ success: false, message: 'No file received (field "file")' });
      }
      const name = source === "upload-avatar" ? "avatar.png" : "cover.png";
      try {
        const fileId = await uploadImagePublic(folderId, name, file.buffer);
        const url = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600` : null;
        return res.status(200).json({
          success: true,
          message: `${source === "upload-avatar" ? "Avatar" : "Cover"} updated`,
          url,
        });
      } catch (e: any) {
        console.error("[userinfo] upload failed:", e?.message);
        return res.status(500).json({ success: false, message: "Upload failed" });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // POST ?source=edit  → update mutable user fields
    // ─────────────────────────────────────────────────────────────────────
    if (req.method === "POST" && source === "edit") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      // Whitelist editable fields. Identity-critical fields are NOT touched
      // here even if the proxy already strips them — defense in depth.
      const editable = ["nickname", "bio", "dob", "country", "timezone", "user"] as const;
      const updated: UserData = { ...user };
      for (const k of editable) {
        if (body[k] !== undefined) (updated as any)[k] = body[k];
      }
      await writeUserDb(folderId, updated);
      return res.status(200).json({
        success: true,
        message: "Profile updated",
        user: sanitize(updated),
      });
    }

    return res.status(400).json({ success: false, message: `Unsupported source '${source}' for ${req.method}` });
  } catch (err: any) {
    console.error("[userinfo] error:", err?.message);
    return res.status(500).json({ success: false, message: "User info request failed" });
  }
}
