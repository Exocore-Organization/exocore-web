/** Phase 5 — XP grant + read endpoints. The hub calls /grant for chat XP
 *  (rate-limited server-side). The SPA reads /me to decorate the profile. */

import { Request, Response } from "express";
import { getAllUsers, isCacheReady, UserData } from "../services/drive";
import { addXp, XP_REASONS, XpReason } from "../services/xpService";
import { ACHIEVEMENTS } from "../utils/achievements";

function sanitize(u: UserData) {
    const { pass: _p, verifyOtp: _o, ...safe } = u;
    return safe;
}

async function userByToken(token: string): Promise<UserData | null> {
    if (!token) return null;
    return (await getAllUsers()).find(u => u.token === token) ?? null;
}

/** POST /exocore/api/xp/grant { token, reason } */
export async function grantXpHandler(req: Request, res: Response) {
    try {
        if (!isCacheReady()) return res.status(503).json({ success: false, message: "warming up" });
        const token = String(req.body?.token || "");
        const reason = String(req.body?.reason || "") as XpReason;
        if (!(reason in XP_REASONS)) return res.status(400).json({ success: false, message: "invalid reason" });
        const u = await userByToken(token);
        if (!u) return res.status(401).json({ success: false, message: "invalid token" });

        const extras: string[] = [];
        if (reason === "chat" && !(Array.isArray(u.achievements) && (u.achievements as string[]).includes("first_message"))) {
            extras.push("first_message");
        }
        const result = await addXp(u, reason, extras);
        return res.json({
            success: true,
            xpDelta: result.xpDelta,
            xp: result.xp,
            level: result.level,
            levelUp: result.levelUp,
            newAchievements: result.newAchievements,
            user: sanitize(result.user),
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}

/** GET /exocore/api/xp/me?token=... */
export async function myXpHandler(req: Request, res: Response) {
    try {
        const token = String(req.query.token || "");
        const u = await userByToken(token);
        if (!u) return res.status(401).json({ success: false, message: "invalid token" });
        return res.json({
            success: true,
            xp: u.xp || 0,
            level: u.level || 0,
            achievements: Array.isArray(u.achievements) ? u.achievements : [],
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}

/** GET /exocore/api/xp/catalog → static seed list of all achievements. */
export async function achievementsCatalogHandler(_req: Request, res: Response) {
    return res.json({ success: true, achievements: ACHIEVEMENTS });
}
