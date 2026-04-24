import { Request, Response } from "express";
import { getAllUsers, isCacheReady, UserData } from "../services/drive";
import { titleForLevel } from "../utils/owners";

interface LeaderboardEntry {
    rank: number;
    username: string;
    nickname?: string;
    avatarUrl?: string | null;
    role: string;
    plan: string;
    level: number;
    xp: number;
    title: string;
    achievements: number;
    country?: string;
}

function toEntry(u: UserData): Omit<LeaderboardEntry, "rank"> {
    const xp = Number(u.xp || 0);
    const level = Number(u.level || 0);
    return {
        username: String(u.username || ""),
        nickname: typeof u.nickname === "string" ? u.nickname : undefined,
        avatarUrl: (u as any).avatarUrl ?? null,
        role: String(u.role || "user"),
        plan: String(u.plan || "free"),
        level,
        xp,
        title: titleForLevel(level),
        achievements: Array.isArray(u.achievements) ? u.achievements.length : 0,
        country: typeof u.country === "string" ? u.country : undefined,
    };
}

/** GET /exocore/api/leaderboard?limit=50&sort=xp|level|achievements */
export async function leaderboardHandler(req: Request, res: Response) {
    try {
        if (!isCacheReady()) {
            return res.status(503).json({ success: false, message: "warming up" });
        }
        const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit || "50"), 10) || 50));
        const sort = String(req.query.sort || "xp");

        const users = await getAllUsers();
        const entries = users
            .filter(u => u && u.username && u.verified !== false)
            .map(toEntry);

        const cmp =
            sort === "level"
                ? (a: ReturnType<typeof toEntry>, b: ReturnType<typeof toEntry>) =>
                      b.level - a.level || b.xp - a.xp || a.username.localeCompare(b.username)
                : sort === "achievements"
                ? (a: ReturnType<typeof toEntry>, b: ReturnType<typeof toEntry>) =>
                      b.achievements - a.achievements || b.xp - a.xp || a.username.localeCompare(b.username)
                : (a: ReturnType<typeof toEntry>, b: ReturnType<typeof toEntry>) =>
                      b.xp - a.xp || b.level - a.level || a.username.localeCompare(b.username);

        entries.sort(cmp);
        const ranked: LeaderboardEntry[] = entries.slice(0, limit).map((e, i) => ({ rank: i + 1, ...e }));

        return res.json({
            success: true,
            sort,
            total: entries.length,
            count: ranked.length,
            entries: ranked,
        });
    } catch (e: any) {
        return res.status(500).json({ success: false, message: e?.message });
    }
}
