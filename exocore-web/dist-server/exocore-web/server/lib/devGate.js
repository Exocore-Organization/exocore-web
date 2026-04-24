"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockedOutError = void 0;
exports.readDevs = readDevs;
exports.isInitialized = isInitialized;
exports.getSessionMeta = getSessionMeta;
exports.touchSession = touchSession;
exports.setupDevs = setupDevs;
exports.loginDevs = loginDevs;
exports.createSession = createSession;
exports.revokeSession = revokeSession;
exports.isValidSession = isValidSession;
exports.getDevsPath = getDevsPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const DEVS_PATH = path_1.default.join(__dirname, "..", "..", "client", "access", "devs.json");
const SESSIONS_PATH = path_1.default.join(__dirname, "..", "..", "client", "access", "sessions.json");
function ensureDir() {
    const dir = path_1.default.dirname(DEVS_PATH);
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
function emptyMeta() {
    const now = new Date().toISOString();
    return { issuedAt: now, lastSeenAt: now, ip: null, ua: null, previousIp: null, lastIpChangeAt: null };
}
function loadStored() {
    try {
        if (!fs_1.default.existsSync(SESSIONS_PATH))
            return null;
        const raw = fs_1.default.readFileSync(SESSIONS_PATH, "utf-8").trim();
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string" && parsed.length > 0) {
            return { token: parsed, ...emptyMeta() };
        }
        if (Array.isArray(parsed)) {
            const first = parsed.find((t) => typeof t === "string" && t.length > 0);
            return first ? { token: first, ...emptyMeta() } : null;
        }
        if (parsed && typeof parsed === "object" && "token" in parsed) {
            const obj = parsed;
            const t = typeof obj.token === "string" ? obj.token : "";
            if (!t)
                return null;
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
    }
    catch {
        return null;
    }
}
function persist() {
    try {
        ensureDir();
        fs_1.default.writeFileSync(SESSIONS_PATH, JSON.stringify(stored), "utf-8");
    }
    catch {
        // best-effort persistence; ignore write errors
    }
}
let stored = loadStored();
// Normalize legacy `sessions.json` shapes into the new metadata
// format on boot so the file stops accumulating stale entries.
if (stored !== null)
    persist();
function hashPassword(pass, salt) {
    return crypto_1.default.createHash("sha256").update(`${salt}::${pass}`).digest("hex");
}
function readDevs() {
    try {
        if (!fs_1.default.existsSync(DEVS_PATH))
            return null;
        const raw = fs_1.default.readFileSync(DEVS_PATH, "utf-8").trim();
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (!parsed.user || !parsed.passHash || !parsed.salt)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function isInitialized() {
    return readDevs() !== null;
}
function applyConn(ip, ua) {
    if (!stored)
        return;
    if (ip && stored.ip && ip !== stored.ip) {
        // Connecting IP just changed — record the previous one so the UI
        // can flash a "session moved to a new network" warning banner.
        stored.previousIp = stored.ip;
        stored.lastIpChangeAt = new Date().toISOString();
    }
    if (ip)
        stored.ip = ip;
    if (ua)
        stored.ua = ua;
}
function ensureToken(ip, ua) {
    if (stored && stored.token.length > 0) {
        // Reuse persistent token; refresh last-seen + connection meta.
        applyConn(ip, ua);
        stored.lastSeenAt = new Date().toISOString();
        persist();
        return stored.token;
    }
    const now = new Date().toISOString();
    stored = {
        token: crypto_1.default.randomBytes(32).toString("hex"),
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
function getSessionMeta() {
    if (!stored)
        return null;
    return {
        issuedAt: stored.issuedAt,
        lastSeenAt: stored.lastSeenAt,
        ip: stored.ip,
        ua: stored.ua,
        previousIp: stored.previousIp,
        lastIpChangeAt: stored.lastIpChangeAt,
    };
}
function touchSession(token, ip, ua) {
    if (!token || !stored || token !== stored.token)
        return;
    applyConn(ip, ua);
    stored.lastSeenAt = new Date().toISOString();
    persist();
}
function setupDevs(user, pass, ip, ua) {
    if (isInitialized()) {
        throw new Error("Already initialized");
    }
    const cleanUser = (user || "").trim();
    if (cleanUser.length < 3)
        throw new Error("Username must be at least 3 characters");
    if (!pass || pass.length < 4)
        throw new Error("Password must be at least 4 characters");
    const salt = crypto_1.default.randomBytes(16).toString("hex");
    const record = {
        user: cleanUser,
        passHash: hashPassword(pass, salt),
        salt,
        createdAt: new Date().toISOString(),
    };
    ensureDir();
    fs_1.default.writeFileSync(DEVS_PATH, JSON.stringify(record, null, 2), "utf-8");
    return { token: ensureToken(ip, ua) };
}
const FAIL_WINDOW_MS = 15 * 60 * 1000; // failures expire after 15 minutes
const FAIL_THRESHOLD = 5; // 5 strikes → lock
const LOCK_DURATION_MS = 60 * 1000; // lock for 60 seconds
const lockouts = new Map();
function lockoutKey(ip) {
    return (ip && ip.trim()) || "__no_ip__";
}
class LockedOutError extends Error {
    lockedUntil;
    retryAfterSec;
    constructor(lockedUntil) {
        const retryAfterSec = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
        super(`Too many failed attempts. Try again in ${retryAfterSec}s.`);
        this.name = "LockedOutError";
        this.lockedUntil = lockedUntil;
        this.retryAfterSec = retryAfterSec;
    }
}
exports.LockedOutError = LockedOutError;
function checkLockout(ip) {
    const key = lockoutKey(ip);
    const entry = lockouts.get(key);
    if (!entry)
        return;
    const now = Date.now();
    if (entry.lockedUntil > now) {
        throw new LockedOutError(entry.lockedUntil);
    }
    // Lock expired — reset the entry so the user starts fresh.
    if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
        lockouts.delete(key);
    }
}
function recordFailure(ip) {
    const key = lockoutKey(ip);
    const now = Date.now();
    let entry = lockouts.get(key);
    if (!entry || now - entry.firstFailAt > FAIL_WINDOW_MS) {
        entry = { failCount: 1, firstFailAt: now, lockedUntil: 0 };
    }
    else {
        entry.failCount += 1;
    }
    if (entry.failCount >= FAIL_THRESHOLD) {
        entry.lockedUntil = now + LOCK_DURATION_MS;
    }
    lockouts.set(key, entry);
    return entry;
}
function clearFailures(ip) {
    lockouts.delete(lockoutKey(ip));
}
function loginDevs(user, pass, ip, ua) {
    // Reject early if this IP is currently locked out.
    checkLockout(ip);
    const record = readDevs();
    if (!record)
        throw new Error("Panel not initialized");
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
function createSession() {
    return ensureToken();
}
function revokeSession(token) {
    if (!token)
        return;
    if (stored && token === stored.token) {
        stored = null;
        persist();
    }
}
function isValidSession(token) {
    if (!token || !stored)
        return false;
    return token === stored.token;
}
function getDevsPath() {
    return DEVS_PATH;
}
