"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_EMAILS = void 0;
exports.rankOf = rankOf;
exports.roleForEmail = roleForEmail;
exports.canAssignRole = canAssignRole;
exports.canModerate = canModerate;
exports.titleForLevel = titleForLevel;
exports.OWNER_EMAILS = new Set([
    "userchoru@gmail.com",
    "johnstevegamer5@gmail.com",
    "exocoreai@gmail.com",
    "chorutiktokers@gmail.com",
]);
const RANK = { owner: 4, admin: 3, mod: 2, user: 1 };
function rankOf(r) {
    if (!r)
        return RANK.user;
    return RANK[r] ?? RANK.user;
}
/** Returns the role implied solely by the email (owner-list bypass). */
function roleForEmail(email) {
    if (!email)
        return null;
    if (exports.OWNER_EMAILS.has(email.trim().toLowerCase()))
        return "owner";
    return null;
}
/** Caller may set `target` to `desired` only if their rank is strictly
 *  higher than both current and desired (owner can do anything). */
function canAssignRole(callerRole, currentTargetRole, desired) {
    if (callerRole === "owner")
        return true;
    const c = rankOf(callerRole);
    return c > rankOf(currentTargetRole) && c > rankOf(desired);
}
function canModerate(callerRole, targetRole) {
    if (callerRole === "owner")
        return true;
    return rankOf(callerRole) > rankOf(targetRole);
}
/** 0..1000 → title band. */
function titleForLevel(level) {
    const lv = Math.max(0, Math.min(1000, Math.floor(level || 0)));
    if (lv < 10)
        return "Beginner";
    if (lv < 25)
        return "Novice";
    if (lv < 50)
        return "Apprentice";
    if (lv < 100)
        return "Adept";
    if (lv < 200)
        return "Expert";
    if (lv < 350)
        return "Veteran";
    if (lv < 500)
        return "Elite";
    if (lv < 700)
        return "Master";
    if (lv < 900)
        return "Grandmaster";
    if (lv < 1000)
        return "Legend";
    return "Mythic";
}
