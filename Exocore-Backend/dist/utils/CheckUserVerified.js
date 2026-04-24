"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserVerified = isUserVerified;
exports.filterVerified = filterVerified;
const STAFF_ROLES = new Set(["owner", "admin", "mod"]);
function isUserVerified(u) {
    if (!u)
        return false;
    const role = String(u.role || "user").toLowerCase();
    if (STAFF_ROLES.has(role))
        return true;
    const v = u.verified;
    if (v === true)
        return true;
    if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        if (s === "true" || s === "1" || s === "yes" || s === "verified")
            return true;
    }
    if (typeof v === "number" && v === 1)
        return true;
    const ev = u.emailVerified;
    if (ev === true || ev === 1 || ev === "true")
        return true;
    if (u.verifiedAt && Number(u.verifiedAt) > 0)
        return true;
    return false;
}
function filterVerified(users) {
    return users.filter(isUserVerified);
}
