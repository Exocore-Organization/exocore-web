/** Phase 5 — achievement seed list. Achievements are stored as `string[]`
 *  on the user; awarding is idempotent. Each entry has a presentation icon +
 *  label which the SPA renders as a small badge. */

export interface AchievementDef {
    key: string;
    label: string;
    icon: string;
    desc: string;
}

export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
    { key: "first_message",   label: "Hello World",    icon: "💬", desc: "Sent your first chat message" },
    { key: "first_friend",    label: "Mutuals",        icon: "🤝", desc: "Made your first friend" },
    { key: "first_post",      label: "Posted!",        icon: "📝", desc: "Published your first post" },
    { key: "welcomed_owner",  label: "Met the Owner",  icon: "👑", desc: "Said hi to an Exocore owner" },
    { key: "night_owl",       label: "Night Owl",      icon: "🦉", desc: "Active between 12 AM – 5 AM" },
    { key: "paid_supporter",  label: "EXO Supporter",  icon: "💎", desc: "Subscribed to EXO PLAN" },
    { key: "level_10",        label: "Apprentice",     icon: "⭐", desc: "Reached level 10" },
    { key: "level_50",        label: "Adept",          icon: "🌟", desc: "Reached level 50" },
    { key: "level_100",       label: "Expert",         icon: "💫", desc: "Reached level 100" },
];

const KEY_SET = new Set(ACHIEVEMENTS.map(a => a.key));

export function isValidAchievement(k: string): boolean {
    return KEY_SET.has(k);
}

export function getAchievement(k: string): AchievementDef | undefined {
    return ACHIEVEMENTS.find(a => a.key === k);
}
