import express from "express";
import cors from "cors";
import multer from "multer";

import registerHandler from "./auth/register";
import loginHandler from "./auth/login";
import verifyHandler from "./auth/verify";
import userInfoHandler from "./auth/userinfo";
import forgotHandler from "./auth/forgot";
import deleteHandler from "./auth/delete";
import { tokenVerifyHandler, setRoleHandler, banHandler, muteHandler } from "./auth/admin";
import { registerPubKey, getPeer, listFriends, friendAction } from "./auth/social";
import { avatarOneHandler, avatarBatchHandler } from "./auth/avatars";
import {
  profileHandler, listPostsHandler, createPostHandler, deletePostHandler,
  commentHandler, deleteCommentHandler, reactHandler,
} from "./auth/posts";
import {
  catalogHandler, submitPaymentHandler, myPaymentsHandler,
  listPendingHandler, decidePaymentHandler,
} from "./auth/plans";
import { grantXpHandler, myXpHandler, achievementsCatalogHandler } from "./auth/xp";
import { leaderboardHandler } from "./auth/leaderboard";
import { listAuditHandler } from "./auth/audit";
import { getAllUsers, getUserFolder, writeUserDb, initLocalCache } from "./services/drive";
import { dedupeUsersByEmail } from "./utils/dedupe";
import { roleForEmail } from "./utils/owners";
import { attachBridge } from "./wsBridge";

const app = express();
const PORT = Number(process.env.PORT) || 7860;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const ip = (req.headers["x-forwarded-for"] as string) || req.ip || "?";
  console.log(`[req] ${req.method} ${req.originalUrl} ← ${ip}`);
  res.on("finish", () => {
    console.log(
      `[res] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`
    );
  });
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, service: "exocore-backend", version: "2.0.0" }));
app.get("/exocore/api/health", (_req, res) => res.json({ ok: true }));

app.post(
  "/exocore/api/auth/register",
  upload.fields([{ name: "avatar", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
  registerHandler
);

app.post("/exocore/api/auth/login", loginHandler);

app.all("/exocore/api/auth/userinfo", upload.single("file"), userInfoHandler);

app.get("/exocore/api/auth/verify", verifyHandler);

app.all("/exocore/api/auth/forgot", forgotHandler);

app.all("/exocore/api/auth/delete", deleteHandler);
app.delete("/exocore/api/auth/delete", deleteHandler);

app.get("/exocore/api/auth/token-verify", tokenVerifyHandler);
app.post("/exocore/api/admin/role", setRoleHandler);
app.post("/exocore/api/admin/ban", banHandler);
app.post("/exocore/api/admin/mute", muteHandler);

app.post("/exocore/api/social/pubkey", registerPubKey);
app.get("/exocore/api/social/peer", getPeer);
app.get("/exocore/api/social/friends", listFriends);
app.post("/exocore/api/social/friend", friendAction);
app.get("/exocore/api/social/avatar", avatarOneHandler);
app.get("/exocore/api/social/avatars", avatarBatchHandler);

// Phase 3 — posts & profile
app.get("/exocore/api/posts/profile", profileHandler);
app.get("/exocore/api/posts", listPostsHandler);
app.post("/exocore/api/posts/create", upload.single("file"), createPostHandler);
app.post("/exocore/api/posts/delete", deletePostHandler);
app.post("/exocore/api/posts/react", reactHandler);
app.post("/exocore/api/posts/comment", commentHandler);
app.post("/exocore/api/posts/comment/delete", deleteCommentHandler);

// Phase 4 — plans & manual payments
app.get("/exocore/api/plans/catalog", catalogHandler);
app.post("/exocore/api/plans/submit", upload.single("file"), submitPaymentHandler);
app.get("/exocore/api/plans/me", myPaymentsHandler);
app.get("/exocore/api/plans/pending", listPendingHandler);
app.post("/exocore/api/plans/decide", decidePaymentHandler);

// Phase 5 — XP, levels, achievements
app.post("/exocore/api/xp/grant", grantXpHandler);
app.get("/exocore/api/xp/me", myXpHandler);
app.get("/exocore/api/xp/catalog", achievementsCatalogHandler);

// Phase 7 — public leaderboard
app.get("/exocore/api/leaderboard", leaderboardHandler);

// Phase 6 — owner audit log
app.get("/exocore/api/audit", listAuditHandler);

app.get("/exocore/api/users", async (_req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users.map(({ pass, verifyOtp, ...rest }) => rest));
  } catch {
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

app.post("/exocore/api/admin/dedupe", async (_req, res) => {
  try {
    const summary = await dedupeUsersByEmail();
    res.json({ success: true, ...summary });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message });
  }
});

const server = app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Exocore Backend running on http://localhost:${PORT}`);
  attachBridge(server, PORT);
  // Restore the local user cache from Google Drive, then start the
  // background sync (every 60s). All API reads go through the cache so
  // we don't hit Drive's slow round-trips on every request.
  try {
    await initLocalCache();
  } catch (e: any) {
    console.warn(`[startup] cache init failed: ${e?.message}`);
  }
  // Auto-promote pinned owner emails on every boot.
  try {
    const all = await getAllUsers();
    let promoted = 0;
    for (const u of all) {
      if (roleForEmail(u.email) === "owner" && u.role !== "owner") {
        const folderId = await getUserFolder(u.username);
        if (!folderId) continue;
        await writeUserDb(folderId, { ...u, role: "owner" });
        promoted++;
      }
    }
    if (promoted > 0) console.log(`[startup-owners] promoted ${promoted} pinned owner account(s)`);
  } catch (e: any) {
    console.warn("[startup-owners] sweep failed:", e?.message);
  }

  try {
    const r = await dedupeUsersByEmail();
    if (r.duplicatesRemoved > 0) {
      console.log(`[startup-dedupe] removed ${r.duplicatesRemoved} duplicate account(s)`);
    } else {
      console.log(`[startup-dedupe] scanned ${r.scanned} users, no duplicates`);
    }
  } catch (e: any) {
    console.warn(`[startup-dedupe] skipped: ${e?.message}`);
  }
});
