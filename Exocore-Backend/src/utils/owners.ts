export const OWNER_EMAILS: ReadonlySet<string> = new Set([
  "userchoru@gmail.com",
  "johnstevegamer5@gmail.com",
  "exocoreai@gmail.com",
  "chorutiktokers@gmail.com",
]);

export type Role = "owner" | "admin" | "mod" | "user";

const RANK: Record<Role, number> = { owner: 4, admin: 3, mod: 2, user: 1 };

export function rankOf(r: string | undefined | null): number {
  if (!r) return RANK.user;
  return RANK[(r as Role)] ?? RANK.user;
}

/** Returns the role implied solely by the email (owner-list bypass). */
export function roleForEmail(email: string | undefined | null): Role | null {
  if (!email) return null;
  if (OWNER_EMAILS.has(email.trim().toLowerCase())) return "owner";
  return null;
}

/** Caller may set `target` to `desired` only if their rank is strictly
 *  higher than both current and desired (owner can do anything). */
export function canAssignRole(callerRole: string, currentTargetRole: string, desired: Role): boolean {
  if (callerRole === "owner") return true;
  const c = rankOf(callerRole);
  return c > rankOf(currentTargetRole) && c > rankOf(desired);
}

export function canModerate(callerRole: string, targetRole: string): boolean {
  if (callerRole === "owner") return true;
  return rankOf(callerRole) > rankOf(targetRole);
}

/** 0..1000 → title band. */
export function titleForLevel(level: number): string {
  const lv = Math.max(0, Math.min(1000, Math.floor(level || 0)));
  if (lv < 10) return "Beginner";
  if (lv < 25) return "Novice";
  if (lv < 50) return "Apprentice";
  if (lv < 100) return "Adept";
  if (lv < 200) return "Expert";
  if (lv < 350) return "Veteran";
  if (lv < 500) return "Elite";
  if (lv < 700) return "Master";
  if (lv < 900) return "Grandmaster";
  if (lv < 1000) return "Legend";
  return "Mythic";
}
