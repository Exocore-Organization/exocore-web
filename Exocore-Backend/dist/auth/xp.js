"use strict";
/** Phase 5 — XP grant + read endpoints. The hub calls /grant for chat XP
 *  (rate-limited server-side). The SPA reads /me to decorate the profile. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantXpHandler = grantXpHandler;
exports.myXpHandler = myXpHandler;
exports.achievementsCatalogHandler = achievementsCatalogHandler;
const drive_1 = require("../services/drive");
const xpService_1 = require("../services/xpService");
const achievements_1 = require("../utils/achievements");
function sanitize(u) {
    const { pass: _p, verifyOtp: _o, ...safe } = u;
    return safe;
}
async function userByToken(token) {
    if (!token)
        return null;
    return (await (0, drive_1.getAllUsers)()).find(u => u.token === token) ?? null;
}
/** POST /exocore/api/xp/grant { token, reason } */
async function grantXpHandler(req, res) {
    try {
        if (!(0, drive_1.isCacheReady)())
            return res.status(503).json({ success: false, message: "warming up" });
        const token = String(req.body?.token || "");
        const reason = String(req.body?.reason || "");
        if (!(reason in xpService_1.XP_REASONS))
            return res.status(400).json({ success: false, message: "invalid reason" });
        const u = await userByToken(token);
        if (!u)
            return res.status(401).json({ success: false, message: "invalid token" });
        const extras = [];
        if (reason === "chat" && !(Array.isArray(u.achievements) && u.achievements.includes("first_message"))) {
            extras.push("first_message");
        }
        const result = await (0, xpService_1.addXp)(u, reason, extras);
        return res.json({
            success: true,
            xpDelta: result.xpDelta,
            xp: result.xp,
            level: result.level,
            levelUp: result.levelUp,
            newAchievements: result.newAchievements,
            user: sanitize(result.user),
        });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** GET /exocore/api/xp/me?token=... */
async function myXpHandler(req, res) {
    try {
        const token = String(req.query.token || "");
        const u = await userByToken(token);
        if (!u)
            return res.status(401).json({ success: false, message: "invalid token" });
        return res.json({
            success: true,
            xp: u.xp || 0,
            level: u.level || 0,
            achievements: Array.isArray(u.achievements) ? u.achievements : [],
        });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
/** GET /exocore/api/xp/catalog → static seed list of all achievements. */
async function achievementsCatalogHandler(_req, res) {
    return res.json({ success: true, achievements: achievements_1.ACHIEVEMENTS });
}
