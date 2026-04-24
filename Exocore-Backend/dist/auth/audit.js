"use strict";
/** Phase 6 — owner-only audit log endpoint. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAuditHandler = listAuditHandler;
const drive_1 = require("../services/drive");
const auditStore_1 = require("../services/auditStore");
async function userByToken(token) {
    if (!token)
        return null;
    return (await (0, drive_1.getAllUsers)()).find(u => u.token === token) ?? null;
}
/** GET /exocore/api/audit?token=...&limit=200&action=role:* */
async function listAuditHandler(req, res) {
    try {
        const token = String(req.query.token || "");
        const me = await userByToken(token);
        if (!me)
            return res.status(401).json({ success: false, message: "invalid token" });
        if (me.role !== "owner")
            return res.status(403).json({ success: false, message: "owner only" });
        const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
        const action = String(req.query.action || "") || undefined;
        return res.json({ success: true, entries: (0, auditStore_1.listAudit)(limit, action) });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
