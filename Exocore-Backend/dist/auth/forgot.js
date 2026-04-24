"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = forgotHandler;
const drive_1 = require("../services/drive");
const mailer_1 = require("../services/mailer");
const validate_1 = require("../utils/validate");
// Dedupe rapid duplicate "send OTP" requests for the same email so we don't
// overwrite a freshly-issued OTP with another one before the user can use it.
const recentSends = new Map();
const SEND_COOLDOWN_MS = 15_000;
async function forgotHandler(req, res) {
    try {
        const params = { ...req.query, ...req.body };
        const email = params.email;
        const requestType = params.req;
        const otp = params.otp;
        const newPass = params.newPass;
        if (!email)
            return res.status(400).json({ success: false, message: "Email is required" });
        if (requestType === "now") {
            // Respond immediately to avoid the Replit edge proxy ~30s timeout.
            // Drive lookup + email delivery happens in the background.
            res.status(200).json({
                success: true,
                message: "If the email is registered, a reset code has been sent.",
                account: { email },
            });
            const key = String(email).toLowerCase();
            const last = recentSends.get(key) || 0;
            const now = Date.now();
            if (now - last < SEND_COOLDOWN_MS) {
                console.log(`[forgot] cooldown hit for ${key}, skipping duplicate send`);
                return;
            }
            recentSends.set(key, now);
            (async () => {
                try {
                    const users = await (0, drive_1.getAllUsers)();
                    const found = users.find(u => (u.email || "").toLowerCase() === String(email).toLowerCase());
                    if (!found) {
                        console.warn(`[forgot] no account found for ${email}`);
                        return;
                    }
                    const folderId = await (0, drive_1.getUserFolder)(found.username);
                    if (!folderId) {
                        console.warn(`[forgot] no folder for ${found.username}`);
                        return;
                    }
                    const fresh = await (0, drive_1.readUserDb)(folderId);
                    if (!fresh) {
                        console.warn(`[forgot] missing user db for ${found.username}`);
                        return;
                    }
                    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
                    fresh.verifyOtp = newOtp;
                    await (0, drive_1.writeUserDb)(folderId, fresh);
                    await (0, mailer_1.sendResetOtp)(fresh.email, newOtp, fresh.nickname);
                    console.log(`[forgot] reset OTP delivered to ${fresh.email}`);
                }
                catch (err) {
                    console.error("[forgot] background failed:", err?.message || err);
                }
            })();
            return;
        }
        const users = await (0, drive_1.getAllUsers)();
        const found = users.find(u => (u.email || "").toLowerCase() === String(email).toLowerCase());
        if (!found)
            return res.status(404).json({ success: false, message: "No account found with this email" });
        const folderId = await (0, drive_1.getUserFolder)(found.username);
        if (!folderId)
            return res.status(404).json({ success: false, message: "User folder not found" });
        if (otp && newPass) {
            const passCheck = (0, validate_1.validatePassword)(newPass);
            if (!passCheck.ok)
                return res.status(400).json({ success: false, message: passCheck.message });
            const fresh = (await (0, drive_1.readUserDb)(folderId));
            if (fresh.verifyOtp !== otp) {
                return res.status(400).json({ success: false, message: "Invalid OTP code" });
            }
            fresh.pass = newPass;
            fresh.verifyOtp = null;
            await (0, drive_1.writeUserDb)(folderId, fresh);
            return res.status(200).json({ success: true, message: "Password updated" });
        }
        return res.status(400).json({ success: false, message: "Provide req=now to request a code, or otp and newPass to reset" });
    }
    catch (err) {
        console.error("[forgot] error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
}
