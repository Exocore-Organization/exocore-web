"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerHandler;
const crypto_1 = __importDefault(require("crypto"));
const drive_1 = require("../services/drive");
const mailer_1 = require("../services/mailer");
const validate_1 = require("../utils/validate");
const owners_1 = require("../utils/owners");
async function registerHandler(req, res) {
    try {
        const { user, pass, email, bio, nickname, dob, country } = req.body || {};
        const host = req.body?.host || req.query?.host || "";
        const usernameCheck = (0, validate_1.validateUsername)(String(user || ""));
        if (!usernameCheck.ok)
            return res.status(400).json({ success: false, message: usernameCheck.message });
        const emailCheck = (0, validate_1.validateEmail)(String(email || ""));
        if (!emailCheck.ok)
            return res.status(400).json({ success: false, message: emailCheck.message });
        const passCheck = (0, validate_1.validatePassword)(String(pass || ""));
        if (!passCheck.ok)
            return res.status(400).json({ success: false, message: passCheck.message });
        const normalizedEmail = String(email).trim().toLowerCase();
        // Enforce: ONE account per email
        const existing = await (0, drive_1.getAllUsers)();
        const emailTaken = existing.some(u => (u.email || "").trim().toLowerCase() === normalizedEmail);
        if (emailTaken) {
            return res.status(409).json({ success: false, message: "An account with this email already exists" });
        }
        const formattedUsername = (0, validate_1.cleanUsername)(user);
        const usernameTaken = existing.some(u => u.username === formattedUsername);
        if (usernameTaken) {
            return res.status(409).json({ success: false, message: "Username already taken" });
        }
        const files = req.files;
        const avatarBuffer = files?.["avatar"]?.[0]?.buffer ?? null;
        const coverBuffer = files?.["cover"]?.[0]?.buffer ?? null;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const userId = Date.now() + Math.floor(Math.random() * 1000);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const generatedToken = crypto_1.default.randomBytes(32).toString("hex");
        const userData = {
            id: userId,
            user: String(user),
            username: formattedUsername,
            pass: String(pass),
            email: normalizedEmail,
            bio: bio || "",
            nickname: nickname || user,
            dob: dob || "",
            country: country || "",
            timezone,
            verified: false,
            verifyOtp: otp,
            token: generatedToken,
            createdAt: Date.now(),
            role: (0, owners_1.roleForEmail)(normalizedEmail) || "user",
            level: 0,
            xp: 0,
            achievements: [],
            bannedUntil: null,
        };
        await (0, drive_1.registerUserToDrive)(userData, avatarBuffer, coverBuffer);
        // Best-effort send the verification email immediately.
        // Prefer the public web host (the user's browser URL) so the link works
        // outside the Replit container. Fall back to API_PUBLIC_BASE then localhost.
        const port = process.env.PORT || 8081;
        const apiBase = (host && /^https?:\/\//.test(host) ? host.replace(/\/$/, "") : null) ||
            process.env.API_PUBLIC_BASE ||
            `http://localhost:${port}`;
        const verifyLink = `${apiBase}/exocore/api/auth/verify?username=${encodeURIComponent(formattedUsername)}&otp=${otp}&host=${encodeURIComponent(host)}`;
        (0, mailer_1.sendVerifyEmail)(normalizedEmail, verifyLink, userData.nickname).catch(() => { });
        return res.status(200).json({
            success: true,
            message: "Account created. Check your email to verify.",
            data: {
                id: userId,
                username: formattedUsername,
                email: normalizedEmail,
                nickname: userData.nickname,
                verified: false,
                token: generatedToken,
            },
        });
    }
    catch (err) {
        if (err?.message === "ALREADY_EXISTS") {
            return res.status(409).json({ success: false, message: "Username already taken" });
        }
        console.error("[register] error:", err);
        return res.status(500).json({ success: false, message: "Registration failed", error: err?.message });
    }
}
