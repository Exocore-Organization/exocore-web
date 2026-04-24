import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface DevsRecord {
    user: string;
    passHash: string;
    salt: string;
    createdAt: string;
}

const DEVS_PATH = path.join(__dirname, "..", "..", "client", "access", "devs.json");
const SESSIONS_PATH = path.join(__dirname, "..", "..", "client", "access", "sessions.json");

function ensureDir(): void {
    const dir = path.dirname(DEVS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Single-token model: the panel only ever has ONE active session
 * token at a time. It's created on first setup/login, persisted to
 * `sessions.json`, and reused for every subsequent login so the
 * token saved in the browser never goes stale.
 *
 * `sessions.json` now stores a small metadata object alongside the
 * token so the UI can surface "last login" info. Older shapes
 * (string / array / { token }) are read for back-compat and
 * rewritten in the new shape on first persist.
 */
export interface SessionMeta {
    issuedAt: string;
    lastSeenAt: string;
    ip: string | null;
    ua: string | null;
    previousIp: string | null;
    lastIpChangeAt: string | null;
}

interface StoredSession extends SessionMeta {
    token: string;
}

function emptyMeta(): SessionMeta {
    const now = new Date().toISOString();
    return { issuedAt: now, lastSeenAt: now, ip: null, ua: null, previousIp: null, lastIpChangeAt: null };
}

function loadStored(): StoredSession | null {
    try {
        if (!fs.existsSync(SESSIONS_PATH)) return null;
        const raw = fs.readFileSync(SESSIONS_PATH, "utf-8").trim();
        if (!raw) return null;
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === "string" && parsed.length > 0) {
            return { token: parsed, ...emptyMeta() };
        }
        if (Array.isArray(parsed)) {
            const first = parsed.find((t): t is string => typeof t === "string" && t.length > 0);
            return first ? { token: first, ...emptyMeta() } : null;
        }
        if (parsed && typeof parsed === "object" && "token" in parsed) {
            const obj = parsed as Record<string, unknown>;
            const t = typeof obj.token === "string" ? obj.token : "";
            if (!t) return null;
            return {
                token: t,
                issuedAt: typeof obj.issuedAt === "string" ? obj.issuedAt : new Date().toISOString(),
                lastSeenAt: typeof obj.lastSeenAt === "string" ? obj.lastSeenAt : new Date().toISOString(),
                ip: typeof obj.ip === "string" ? obj.ip : null,
                ua: typeof obj.ua === "string" ? obj.ua : null,
                previousIp: typeof obj.previousIp === "string" ? obj.previousIp : null,
                lastIpChangeAt: typeof obj.lastIpChangeAt === "string" ? obj.lastIpChangeAt : null,
            };
        }
        return null;
    } catch {
        return null;
    }
}

function persist(): void {
    try {
        ensureDir();
        fs.writeFileSync(SESSIONS_PATH, JSON.stringify(stored), "utf-8");
    } catch {
        // best-effort persistence; ignore write errors
    }
}

let stored: StoredSession | null = loadStored();
// Normalize legacy `sessions.json` shapes into the new metadata
// format on boot so the file stops accumulating stale entries.
if (stored !== null) persist();

function hashPassword(pass: string, salt: string): string {
    return crypto.createHash("sha256").update(`${salt}::${pass}`).digest("hex");
}

export function readDevs(): DevsRecord | null {
    try {
        if (!fs.existsSync(DEVS_PATH)) return null;
        const raw = fs.readFileSync(DEVS_PATH, "utf-8").trim();
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<DevsRecord>;
        if (!parsed.user || !parsed.passHash || !parsed.salt) return null;
        return parsed as DevsRecord;
    } catch {
        return null;
    }
}

export function isInitialized(): boolean {
    return readDevs() !== null;
}

function applyConn(ip?: string | null, ua?: string | null): void {
    if (!stored) return;
    if (ip && stored.ip && ip !== stored.ip) {
        // Connecting IP just changed — record the previous one so the UI
        // can flash a "session moved to a new network" warning banner.
        stored.previousIp = stored.ip;
        stored.lastIpChangeAt = new Date().toISOString();
    }
    if (ip) stored.ip = ip;
    if (ua) stored.ua = ua;
}

function ensureToken(ip?: string | null, ua?: string | null): string {
    if (stored && stored.token.length > 0) {
        // Reuse persistent token; refresh last-seen + connection meta.
        applyConn(ip, ua);
        stored.lastSeenAt = new Date().toISOString();
        persist();
        return stored.token;
    }
    const now = new Date().toISOString();
    stored = {
        token: crypto.randomBytes(32).toString("hex"),
        issuedAt: now,
        lastSeenAt: now,
        ip: ip ?? null,
        ua: ua ?? null,
        previousIp: null,
        lastIpChangeAt: null,
    };
    persist();
    return stored.token;
}

export function getSessionMeta(): SessionMeta | null {
    if (!stored) return null;
    return {
        issuedAt: stored.issuedAt,
        lastSeenAt: stored.lastSeenAt,
        ip: stored.ip,
        ua: stored.ua,
        previousIp: stored.previousIp,
        lastIpChangeAt: stored.lastIpChangeAt,
    };
}

export function touchSession(token: string | undefined, ip?: string | null, ua?: string | null): void {
    if (!token || !stored || token !== stored.token) return;
    applyConn(ip, ua);
    stored.lastSeenAt = new Date().toISOString();
    persist();
}

export function setupDevs(user: string, pass: string, ip?: string | null, ua?: string | null): { token: string } {
    if (isInitialized()) {
        throw new Error("Already initialized");
    }
    const cleanUser = (user || "").trim();
    if (cleanUser.length < 3) throw new Error("Username must be at least 3 characters");
    if (!pass || pass.length < 4) throw new Error("Password must be at least 4 characters");

    const salt = crypto.randomBytes(16).toString("hex");
    const record: DevsRecord = {
        user: cleanUser,
        passHash: hashPassword(pass, salt),
        salt,
        createdAt: new Date().toISOString(),
    };
    ensureDir();
    fs.writeFileSync(DEVS_PATH, JSON.stringify(record, null, 2), "utf-8");
    return { token: ensureToken(ip, ua) };
}

/* ---------- Brute-force lockout (per IP) ---------- */
// In-memory only — server restart wipes counters, which is fine: the lockout
// is a defense against rapid scripted attacks, not against a determined human.
interface LockoutEntry {
    failCount: number;
    firstFailAt: number;   // ms epoch — start of the current failure window
    lockedUntil: number;   // ms epoch — 0 if not locked
}

const FAIL_WINDOW_MS = 15 * 60 * 1000;  // failures expire after 15 minutes
const FAIL_THRESHOLD = 5;               // 5 strikes → lock
const LOCK_DURATION_MS = 60 * 1000;     // lock for 60 seconds

const lockouts = new Map<string, LockoutEntry>();

function lockoutKey(ip?: string | null): string {
    return (ip && ip.trim()) || "__no_ip__";
}

export class LockedOutError extends Error {
    lockedUntil: number;
    retryAfterSec: number;
    constructor(lockedUntil: number) {
        const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
        super(`Too many failed attempts. Try again in ${retryAfterSec}s.`);
        this.name = "LockedOutError";
        this.lockedUntil = lockedUntil;
        this.retryAfterSec = retryAfterSec;
    }
}

function checkLockout(ip?: string | null): void {
    const key = lockoutKey(ip);
    const entry = lockouts.get(key);
    if (!entry) return;
    const now = Date.now();
    if (entry.lockedUntil > now) {
        throw new LockedOutError(entry.lockedUntil);
    }
    // Lock expired — reset the entry so the user starts fresh.
    if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
        lockouts.delete(key);
    }
}

function recordFailure(ip?: string | null): LockoutEntry {
    const key = lockoutKey(ip);
    const now = Date.now();
    let entry = lockouts.get(key);
    if (!entry || now - entry.firstFailAt > FAIL_WINDOW_MS) {
        entry = { failCount: 1, firstFailAt: now, lockedUntil: 0 };
    } else {
        entry.failCount += 1;
    }
    if (entry.failCount >= FAIL_THRESHOLD) {
        entry.lockedUntil = now + LOCK_DURATION_MS;
    }
    lockouts.set(key, entry);
    return entry;
}

function clearFailures(ip?: string | null): void {
    lockouts.delete(lockoutKey(ip));
}

export function loginDevs(user: string, pass: string, ip?: string | null, ua?: string | null): { token: string } {
    // Reject early if this IP is currently locked out.
    checkLockout(ip);

    const record = readDevs();
    if (!record) throw new Error("Panel not initialized");

    const userOk = record.user === (user || "").trim();
    const passOk = userOk && record.passHash === hashPassword(pass, record.salt);
    if (!userOk || !passOk) {
        const entry = recordFailure(ip);
        if (entry.lockedUntil > Date.now()) {
            throw new LockedOutError(entry.lockedUntil);
        }
        const remaining = Math.max(0, FAIL_THRESHOLD - entry.failCount);
        const hint = remaining > 0 ? ` (${remaining} attempt${remaining === 1 ? '' : 's'} left)` : "";
        throw new Error(`Invalid credentials${hint}`);
    }

    // Success — clear the failure counter for this IP.
    clearFailures(ip);
    // Always return the SAME persistent token instead of rotating one
    // per login — keeps the browser-cached token valid forever.
    return { token: ensureToken(ip, ua) };
}

/** @deprecated kept only for back-compat with old callers; identical to ensureToken(). */
export function createSession(): string {
    return ensureToken();
}

export function revokeSession(token: string | undefined): void {
    if (!token) return;
    if (stored && token === stored.token) {
        stored = null;
        persist();
    }
}

export function isValidSession(token: string | undefined): boolean {
    if (!token || !stored) return false;
    return token === stored.token;
}

export function getDevsPath(): string {
    return DEVS_PATH;
}
