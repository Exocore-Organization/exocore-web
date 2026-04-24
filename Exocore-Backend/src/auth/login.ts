import { Request, Response } from "express";
import { getAllUsers } from "../services/drive";

export default async function loginHandler(req: Request, res: Response) {
  try {
    const { user: userInput, pass } = req.body || {};
    if (!userInput || !pass) {
      return res.status(400).json({ success: false, message: "Identifier and password are required" });
    }

    const users = await getAllUsers();
    const found = users.find(u => {
      const m = u.user === userInput || u.username === userInput || u.email === String(userInput).toLowerCase() || String(u.id) === String(userInput);
      return m && u.pass === pass;
    });

    if (!found) return res.status(401).json({ success: false, message: "Invalid credentials" });

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
  } catch (err: any) {
    console.error("[login] error:", err?.message);
    return res.status(500).json({ success: false, message: "Login failed due to server error" });
  }
}
