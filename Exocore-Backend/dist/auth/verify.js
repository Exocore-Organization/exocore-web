"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = verifyHandler;
const drive_1 = require("../services/drive");
const mailer_1 = require("../services/mailer");
async function verifyHandler(req, res) {
    try {
        const { username: identifier, otp, host, req: requestType } = req.query;
        if (!identifier)
            return res.status(400).send("Missing username, email, or ID");
        const users = await (0, drive_1.getAllUsers)();
        const found = users.find(u => u.username === identifier ||
            u.email === String(identifier).toLowerCase() ||
            String(u.id) === String(identifier));
        if (!found)
            return res.status(404).send("User account not found");
        const folderId = await (0, drive_1.getUserFolder)(found.username);
        if (!folderId)
            return res.status(404).send("User folder not found");
        // Resend OTP path
        if (requestType === "now") {
            const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
            const fresh = await (0, drive_1.readUserDb)(folderId);
            if (!fresh)
                return res.status(404).send("User database missing");
            fresh.verifyOtp = newOtp;
            await (0, drive_1.writeUserDb)(folderId, fresh);
            const port = process.env.PORT || 8081;
            const apiBase = (host && /^https?:\/\//.test(host) ? host.replace(/\/$/, "") : null) ||
                process.env.API_PUBLIC_BASE ||
                `http://localhost:${port}`;
            const link = `${apiBase}/exocore/api/auth/verify?username=${encodeURIComponent(fresh.username)}&otp=${newOtp}&host=${encodeURIComponent(host || "")}`;
            await (0, mailer_1.sendVerifyEmail)(fresh.email, link, fresh.nickname);
            return res.status(200).json({ success: true, message: `Verification link sent to ${fresh.email}` });
        }
        // Actual verify
        if (!otp)
            return res.status(400).send("OTP is required");
        const fresh = await (0, drive_1.readUserDb)(folderId);
        if (!fresh)
            return res.status(404).send("User database missing");
        if (fresh.verifyOtp !== otp)
            return res.status(400).send("Invalid or expired OTP");
        fresh.verified = true;
        fresh.verifyOtp = null;
        await (0, drive_1.writeUserDb)(folderId, fresh);
        // Auto-login: bounce back to host with token in query so the client can store it
        const target = host && /^https?:\/\//.test(host) ? host : "http://localhost:8080";
        const url = new URL(target);
        url.pathname = (url.pathname.replace(/\/$/, "") || "") + "/exocore/auth/callback";
        url.searchParams.set("token", fresh.token);
        url.searchParams.set("verified", "1");
        return res.redirect(url.toString());
    }
    catch (err) {
        console.error("[verify] error:", err);
        res.status(500).send("Internal Error during verification");
    }
}
