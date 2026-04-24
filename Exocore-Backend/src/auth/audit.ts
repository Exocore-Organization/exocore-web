/** Phase 6 — owner-only audit log endpoint. */

import { Request, Response } from "express";
import { getAllUsers, UserData } from "../services/drive";
import { listAudit } from "../services/auditStore";

async function userByToken(token: string): Promise<UserData | null> {
    if (!token) return null;
    return (await getAllUsers()).find(u => u.token === token) ?? null;
}

/** GET /exocore/api/audit?token=...&limit=200&action=role:* */
export async function listAuditHandler(req: Request, res: Response) {
    try {
        const token = String(req.query.token || "");
        const me = await userByToken(token);
        if (!me) return res.status(401).json({ success: false, message: "invalid token" });
        if (me.role !== "owner") return res.status(403).json({ success: false, message: "owner only" });
        const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
        const action = String(req.query.action || "") || undefined;
        return res.json({ success: true, entries: listAudit(limit, action) });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
