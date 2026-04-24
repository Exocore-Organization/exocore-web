"use strict";
// Strong password + email anti-spam validation
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEmail = validateEmail;
exports.validatePassword = validatePassword;
exports.cleanUsername = cleanUsername;
exports.validateUsername = validateUsername;
const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com", "tempmail.com", "10minutemail.com", "guerrillamail.com",
    "trashmail.com", "throwawaymail.com", "yopmail.com", "fakeinbox.com",
    "sharklasers.com", "getnada.com", "maildrop.cc", "temp-mail.org",
    "dispostable.com", "mintemail.com", "mohmal.com", "tempr.email",
    "tmpmail.org", "spambox.us", "spam4.me", "emailondeck.com",
    "moakt.com", "mailnesia.com", "harakirimail.com", "mytemp.email",
    "burnermail.io", "anonbox.net", "tempinbox.com", "dropmail.me"
]);
function validateEmail(email) {
    if (!email || typeof email !== "string")
        return { ok: false, message: "Email is required" };
    const trimmed = email.trim().toLowerCase();
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;
    if (!re.test(trimmed))
        return { ok: false, message: "Invalid email format" };
    if (trimmed.length > 254)
        return { ok: false, message: "Email is too long" };
    const domain = trimmed.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
        return { ok: false, message: "Disposable / temporary email addresses are not allowed" };
    }
    // Block obvious "spam-style" plus-addressing abuse with many dots/+
    const local = trimmed.split("@")[0];
    if ((local.match(/\+/g) || []).length > 1) {
        return { ok: false, message: "Email looks suspicious — please use your real address" };
    }
    return { ok: true };
}
function validatePassword(pass) {
    if (!pass || typeof pass !== "string")
        return { ok: false, message: "Password is required" };
    if (pass.length < 10)
        return { ok: false, message: "Password must be at least 10 characters" };
    if (pass.length > 128)
        return { ok: false, message: "Password is too long" };
    if (!/[a-z]/.test(pass))
        return { ok: false, message: "Password must include a lowercase letter" };
    if (!/[A-Z]/.test(pass))
        return { ok: false, message: "Password must include an uppercase letter" };
    if (!/\d/.test(pass))
        return { ok: false, message: "Password must include a number" };
    if (!/[^A-Za-z0-9]/.test(pass))
        return { ok: false, message: "Password must include a symbol (e.g. !@#$%)" };
    if (/\s/.test(pass))
        return { ok: false, message: "Password cannot contain spaces" };
    return { ok: true };
}
function cleanUsername(input) {
    // Strip @, lowercase, collapse whitespace to _, and only allow letters, digits,
    // underscore, and hyphen. Dots are NOT allowed so a username can never look
    // like an email or a domain (e.g. "user.gmail.com").
    const raw = input.replace(/@/g, "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
    return `@${raw}`;
}
function validateUsername(input) {
    if (!input || typeof input !== "string")
        return { ok: false, message: "Username is required" };
    const raw = input.trim();
    if (raw.length < 3)
        return { ok: false, message: "Username must be at least 3 characters" };
    if (raw.length > 32)
        return { ok: false, message: "Username is too long (max 32)" };
    // Reject anything that looks like an email or contains a dot/domain.
    if (/@.+\..+/.test(raw) || /\.[a-z]{2,}$/i.test(raw)) {
        return { ok: false, message: "Username cannot be an email — use a handle like @yourname" };
    }
    if (/\./.test(raw)) {
        return { ok: false, message: "Username cannot contain dots" };
    }
    // After cleaning, ensure something usable remains.
    const cleaned = cleanUsername(raw).replace(/^@/, "");
    if (cleaned.length < 3) {
        return { ok: false, message: "Username must contain at least 3 letters, numbers, _ or -" };
    }
    return { ok: true };
}
