"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = loginHandler;
const drive_1 = require("../services/drive");
async function loginHandler(req, res) {
    try {
        const { user: userInput, pass } = req.body || {};
        if (!userInput || !pass) {
            return res.status(400).json({ success: false, message: "Identifier and password are required" });
        }
        const users = await (0, drive_1.getAllUsers)();
        const found = users.find(u => {
            const m = u.user === userInput || u.username === userInput || u.email === String(userInput).toLowerCase() || String(u.id) === String(userInput);
            return m && u.pass === pass;
        });
        if (!found)
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        if (found.verified === false) {
            return res.status(403).json({
                success: false,
                message: "Account not verified. Please check your email.",
                requiresVerification: true,
                username: found.username,
                email: found.email,
                nickname: found.nickname,
            });
        }
        const { pass: _p, verifyOtp: _o, ...safe } = found;
        return res.status(200).json({ success: true, message: "Login successful", user: safe, token: found.token });
    }
    catch (err) {
        console.error("[login] error:", err?.message);
        return res.status(500).json({ success: false, message: "Login failed due to server error" });
    }
}
