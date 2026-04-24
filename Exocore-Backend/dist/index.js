"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const register_1 = __importDefault(require("./auth/register"));
const login_1 = __importDefault(require("./auth/login"));
const verify_1 = __importDefault(require("./auth/verify"));
const userinfo_1 = __importDefault(require("./auth/userinfo"));
const forgot_1 = __importDefault(require("./auth/forgot"));
const delete_1 = __importDefault(require("./auth/delete"));
const admin_1 = require("./auth/admin");
const social_1 = require("./auth/social");
const avatars_1 = require("./auth/avatars");
const posts_1 = require("./auth/posts");
const plans_1 = require("./auth/plans");
const xp_1 = require("./auth/xp");
const leaderboard_1 = require("./auth/leaderboard");
const audit_1 = require("./auth/audit");
const drive_1 = require("./services/drive");
const dedupe_1 = require("./utils/dedupe");
const owners_1 = require("./utils/owners");
const wsBridge_1 = require("./wsBridge");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 7860;
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
});
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "50mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.headers["x-forwarded-for"] || req.ip || "?";
    console.log(`[req] ${req.method} ${req.originalUrl} ← ${ip}`);
    res.on("finish", () => {
        console.log(`[res] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
});
app.get("/", (_req, res) => res.json({ ok: true, service: "exocore-backend", version: "2.0.0" }));
app.get("/exocore/api/health", (_req, res) => res.json({ ok: true }));
app.post("/exocore/api/auth/register", upload.fields([{ name: "avatar", maxCount: 1 }, { name: "cover", maxCount: 1 }]), register_1.default);
app.post("/exocore/api/auth/login", login_1.default);
app.all("/exocore/api/auth/userinfo", upload.single("file"), userinfo_1.default);
app.get("/exocore/api/auth/verify", verify_1.default);
app.all("/exocore/api/auth/forgot", forgot_1.default);
app.all("/exocore/api/auth/delete", delete_1.default);
app.delete("/exocore/api/auth/delete", delete_1.default);
app.get("/exocore/api/auth/token-verify", admin_1.tokenVerifyHandler);
app.post("/exocore/api/admin/role", admin_1.setRoleHandler);
app.post("/exocore/api/admin/ban", admin_1.banHandler);
app.post("/exocore/api/admin/mute", admin_1.muteHandler);
app.post("/exocore/api/social/pubkey", social_1.registerPubKey);
app.get("/exocore/api/social/peer", social_1.getPeer);
app.get("/exocore/api/social/friends", social_1.listFriends);
app.post("/exocore/api/social/friend", social_1.friendAction);
app.get("/exocore/api/social/avatar", avatars_1.avatarOneHandler);
app.get("/exocore/api/social/avatars", avatars_1.avatarBatchHandler);
// Phase 3 — posts & profile
app.get("/exocore/api/posts/profile", posts_1.profileHandler);
app.get("/exocore/api/posts", posts_1.listPostsHandler);
app.post("/exocore/api/posts/create", upload.single("file"), posts_1.createPostHandler);
app.post("/exocore/api/posts/delete", posts_1.deletePostHandler);
app.post("/exocore/api/posts/react", posts_1.reactHandler);
app.post("/exocore/api/posts/comment", posts_1.commentHandler);
app.post("/exocore/api/posts/comment/delete", posts_1.deleteCommentHandler);
// Phase 4 — plans & manual payments
app.get("/exocore/api/plans/catalog", plans_1.catalogHandler);
app.post("/exocore/api/plans/submit", upload.single("file"), plans_1.submitPaymentHandler);
app.get("/exocore/api/plans/me", plans_1.myPaymentsHandler);
app.get("/exocore/api/plans/pending", plans_1.listPendingHandler);
app.post("/exocore/api/plans/decide", plans_1.decidePaymentHandler);
// Phase 5 — XP, levels, achievements
app.post("/exocore/api/xp/grant", xp_1.grantXpHandler);
app.get("/exocore/api/xp/me", xp_1.myXpHandler);
app.get("/exocore/api/xp/catalog", xp_1.achievementsCatalogHandler);
// Phase 7 — public leaderboard
app.get("/exocore/api/leaderboard", leaderboard_1.leaderboardHandler);
// Phase 6 — owner audit log
app.get("/exocore/api/audit", audit_1.listAuditHandler);
app.get("/exocore/api/users", async (_req, res) => {
    try {
        const users = await (0, drive_1.getAllUsers)();
        res.json(users.map(({ pass, verifyOtp, ...rest }) => rest));
    }
    catch {
        res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
});
app.post("/exocore/api/admin/dedupe", async (_req, res) => {
    try {
        const summary = await (0, dedupe_1.dedupeUsersByEmail)();
        res.json({ success: true, ...summary });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e?.message });
    }
});
const server = app.listen(PORT, "0.0.0.0", async () => {
    console.log(`🚀 Exocore Backend running on http://localhost:${PORT}`);
    (0, wsBridge_1.attachBridge)(server, PORT);
    // Restore the local user cache from Google Drive, then start the
    // background sync (every 60s). All API reads go through the cache so
    // we don't hit Drive's slow round-trips on every request.
    try {
        await (0, drive_1.initLocalCache)();
    }
    catch (e) {
        console.warn(`[startup] cache init failed: ${e?.message}`);
    }
    // Auto-promote pinned owner emails on every boot.
    try {
        const all = await (0, drive_1.getAllUsers)();
        let promoted = 0;
        for (const u of all) {
            if ((0, owners_1.roleForEmail)(u.email) === "owner" && u.role !== "owner") {
                const folderId = await (0, drive_1.getUserFolder)(u.username);
                if (!folderId)
                    continue;
                await (0, drive_1.writeUserDb)(folderId, { ...u, role: "owner" });
                promoted++;
            }
        }
        if (promoted > 0)
            console.log(`[startup-owners] promoted ${promoted} pinned owner account(s)`);
    }
    catch (e) {
        console.warn("[startup-owners] sweep failed:", e?.message);
    }
    try {
        const r = await (0, dedupe_1.dedupeUsersByEmail)();
        if (r.duplicatesRemoved > 0) {
            console.log(`[startup-dedupe] removed ${r.duplicatesRemoved} duplicate account(s)`);
        }
        else {
            console.log(`[startup-dedupe] scanned ${r.scanned} users, no duplicates`);
        }
    }
    catch (e) {
        console.warn(`[startup-dedupe] skipped: ${e?.message}`);
    }
});
