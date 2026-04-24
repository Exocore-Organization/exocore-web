"use strict";
/** Phase 5 — XP / level service.
 *
 *  Level curve (per replit.md spec):
 *      level = floor(sqrt(xp / 12)), capped at 1000.
 *
 *  Rate-limit: chat XP is gated to 1 grant per user per minute. Other
 *  actions (post, friend, payment) bypass the rate-limit because they
 *  already have natural cooldowns.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XP_REASONS = void 0;
exports.levelFromXp = levelFromXp;
exports.addXp = addXp;
exports.awardAchievement = awardAchievement;
const drive_1 = require("./drive");
const achievements_1 = require("../utils/achievements");
const lastChatXpAt = new Map();
const CHAT_RL_MS = 60 * 1000;
exports.XP_REASONS = {
    chat: 1,
    friend_accept: 5,
    post: 10,
    payment_approved: 50,
};
function levelFromXp(xp) {
    if (!Number.isFinite(xp) || xp <= 0)
        return 0;
    return Math.min(1000, Math.floor(Math.sqrt(xp / 12)));
}
function levelMilestoneAchievements(newLevel) {
    const out = [];
    if (newLevel >= 10)
        out.push("level_10");
    if (newLevel >= 50)
        out.push("level_50");
    if (newLevel >= 100)
        out.push("level_100");
    return out;
}
/** Awards XP + persists. Returns the updated user. If `reason === "chat"`
 *  and the user already received chat XP within the last minute, returns a
 *  zero-delta result (no write). */
async function addXp(user, reason, extraAchievements = []) {
    const baseXp = Number(user.xp || 0);
    const baseLevel = Number(user.level || 0);
    const baseAch = Array.isArray(user.achievements) ? user.achievements : [];
    let amount = exports.XP_REASONS[reason];
    if (reason === "chat") {
        const last = lastChatXpAt.get(user.username) || 0;
        if (Date.now() - last < CHAT_RL_MS)
            amount = 0;
        else
            lastChatXpAt.set(user.username, Date.now());
    }
    const newXp = baseXp + amount;
    const newLevel = levelFromXp(newXp);
    const levelUp = newLevel > baseLevel;
    // Merge + dedupe achievements.
    const candidate = new Set(baseAch);
    const newlyAwarded = [];
    for (const k of [...extraAchievements, ...levelMilestoneAchievements(newLevel)]) {
        if (!(0, achievements_1.isValidAchievement)(k))
            continue;
        if (!candidate.has(k)) {
            candidate.add(k);
            newlyAwarded.push(k);
        }
    }
    if (amount === 0 && newlyAwarded.length === 0) {
        return { xpDelta: 0, xp: baseXp, level: baseLevel, levelUp: false, newAchievements: [], user };
    }
    const updated = {
        ...user,
        xp: newXp,
        level: newLevel,
        achievements: [...candidate],
    };
    try {
        const folderId = await (0, drive_1.getUserFolder)(user.username);
        if (folderId)
            await (0, drive_1.writeUserDb)(folderId, updated);
    }
    catch (e) {
        console.warn("[xp] persist failed:", e?.message);
    }
    return {
        xpDelta: amount,
        xp: newXp,
        level: newLevel,
        levelUp,
        newAchievements: newlyAwarded,
        user: updated,
    };
}
/** Idempotently award an achievement without granting XP. */
async function awardAchievement(user, key) {
    if (!(0, achievements_1.isValidAchievement)(key))
        return user;
    const existing = Array.isArray(user.achievements) ? user.achievements : [];
    if (existing.includes(key))
        return user;
    const updated = { ...user, achievements: [...existing, key] };
    try {
        const folderId = await (0, drive_1.getUserFolder)(user.username);
        if (folderId)
            await (0, drive_1.writeUserDb)(folderId, updated);
    }
    catch (e) {
        console.warn("[xp] achievement persist failed:", e?.message);
    }
    return updated;
}
