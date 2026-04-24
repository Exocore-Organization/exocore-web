"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthHandlers = registerAuthHandlers;
const hub_1 = require("./hub");
const _helpers_1 = require("./_helpers");
const hub_2 = require("../social/hub");
function registerAuthHandlers() {
    // ------- Phase 1 — login -------
    (0, hub_1.registerHandler)("auth.login", async (d) => {
        const user = (0, _helpers_1.requireString)(d?.user, "user");
        const pass = (0, _helpers_1.requireString)(d?.pass, "pass");
        return await (0, _helpers_1.postBackend)("/exocore/api/auth/login", { user, pass });
    });
    // ------- Phase 2 — register / verify (OTP confirm) / forgot -------
    (0, hub_1.registerHandler)("auth.register", async (d) => {
        const fields = {
            user: (0, _helpers_1.requireString)(d?.user, "user"),
            pass: (0, _helpers_1.requireString)(d?.pass, "pass"),
            email: (0, _helpers_1.requireString)(d?.email, "email"),
            nickname: (0, _helpers_1.optString)(d?.nickname),
            bio: (0, _helpers_1.optString)(d?.bio),
            dob: (0, _helpers_1.optString)(d?.dob),
            country: (0, _helpers_1.optString)(d?.country),
            host: (0, _helpers_1.requireString)(d?.host, "host"),
        };
        const files = {
            avatar: d?.avatar,
            cover: d?.cover,
        };
        return await (0, _helpers_1.postBackendForm)("/exocore/api/auth/register", fields, files);
    });
    // OTP-based verify (called from the VerifyPending screen).
    // The email-link verify (`/exocore/api/auth/verify` GET with redirect) stays HTTP.
    (0, hub_1.registerHandler)("auth.verify", async (d) => {
        const username = (0, _helpers_1.requireString)(d?.username, "username");
        const otp = (0, _helpers_1.requireString)(d?.otp, "otp");
        const host = (0, _helpers_1.optString)(d?.host);
        return await (0, _helpers_1.getBackend)("/exocore/api/auth/verify", {
            username,
            otp,
            req: "json",
            host,
        });
    });
    // Resend the verification email — no OTP needed, just retriggers the send.
    (0, hub_1.registerHandler)("auth.verify.resend", async (d) => {
        const username = (0, _helpers_1.requireString)(d?.username, "username");
        const host = (0, _helpers_1.optString)(d?.host);
        return await (0, _helpers_1.getBackend)("/exocore/api/auth/verify", {
            username, req: "now", host,
        });
    });
    (0, hub_1.registerHandler)("auth.forgot.request", async (d) => {
        const email = (0, _helpers_1.requireString)(d?.email, "email");
        return await (0, _helpers_1.getBackend)("/exocore/api/auth/forgot", { email, req: "now" });
    });
    (0, hub_1.registerHandler)("auth.forgot.reset", async (d) => {
        const email = (0, _helpers_1.requireString)(d?.email, "email");
        const otp = (0, _helpers_1.requireString)(d?.otp, "otp");
        const pass = (0, _helpers_1.requireString)(d?.pass, "pass");
        return await (0, _helpers_1.getBackend)("/exocore/api/auth/forgot", { email, otp, pass });
    });
    // ------- Phase 3 — userinfo / delete / plans / xp / audit / leaderboard -------
    (0, hub_1.registerHandler)("auth.userinfo.get", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const source = (0, _helpers_1.requireString)(d?.source, "source");
        return await (0, _helpers_1.getBackend)("/exocore/api/auth/userinfo", { source, token });
    });
    (0, hub_1.registerHandler)("auth.userinfo.edit", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const update = { ...(d?.update || {}) };
        delete update.id;
        delete update.pass;
        delete update.email;
        delete update.token;
        return await (0, _helpers_1.postBackend)("/exocore/api/auth/userinfo", update, { source: "edit", token });
    });
    (0, hub_1.registerHandler)("auth.userinfo.upload", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const kind = (0, _helpers_1.requireString)(d?.kind, "kind"); // "avatar" | "cover"
        if (kind !== "avatar" && kind !== "cover") {
            throw new _helpers_1.RpcError(400, "kind must be 'avatar' or 'cover'");
        }
        const file = d?.file;
        if (!file?.bytes)
            throw new _helpers_1.RpcError(400, "file is required");
        return await (0, _helpers_1.postBackendForm)("/exocore/api/auth/userinfo", {}, { file }, { source: `upload-${kind}`, token });
    });
    (0, hub_1.registerHandler)("auth.delete", async (d) => {
        const pass = (0, _helpers_1.requireString)(d?.pass, "pass");
        const payload = { pass };
        if (typeof d?.token === "string" && d.token)
            payload.token = d.token;
        if (typeof d?.user === "string" && d.user)
            payload.user = d.user;
        if (typeof d?.username === "string" && d.username)
            payload.username = d.username;
        if (typeof d?.email === "string" && d.email)
            payload.email = d.email;
        if (typeof d?.id === "string" && d.id)
            payload.id = d.id;
        const hasIdentifier = !!(payload.token || payload.user || payload.username || payload.email || payload.id);
        if (!hasIdentifier) {
            throw new _helpers_1.RpcError(400, "token or username/email is required");
        }
        return await (0, _helpers_1.postBackend)("/exocore/api/auth/delete", payload);
    });
    // ------- Plans -------
    (0, hub_1.registerHandler)("plans.catalog", async (d) => {
        return await (0, _helpers_1.getBackend)("/exocore/api/plans/catalog", { token: (0, _helpers_1.optString)(d?.token) });
    });
    (0, hub_1.registerHandler)("plans.me", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        return await (0, _helpers_1.getBackend)("/exocore/api/plans/me", { token });
    });
    (0, hub_1.registerHandler)("plans.pending", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const status = (0, _helpers_1.optString)(d?.status) || "pending";
        return await (0, _helpers_1.getBackend)("/exocore/api/plans/pending", { token, status });
    });
    (0, hub_1.registerHandler)("plans.submit", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const plan = (0, _helpers_1.optString)(d?.plan) || "exo";
        const method = (0, _helpers_1.optString)(d?.method) || "gcash";
        const file = d?.file;
        if (!file?.bytes)
            throw new _helpers_1.RpcError(400, "payment proof file is required");
        const result = await (0, _helpers_1.postBackendForm)("/exocore/api/plans/submit", { token, plan, method, note: (0, _helpers_1.optString)(d?.note) }, { file });
        // Mirror the HTTP route's owner notification.
        if (result?.success && result?.payment) {
            const p = result.payment;
            try {
                (0, hub_2.systemAnnounce)(`💰 New ${String(p.plan || "").toUpperCase()} payment from @${p.username} via ${String(p.method || "").toUpperCase()} (${p.currency} ${p.amount}). Owners — please review.`);
            }
            catch { }
        }
        return result;
    });
    (0, hub_1.registerHandler)("plans.decide", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const paymentId = (0, _helpers_1.requireString)(d?.paymentId, "paymentId");
        const decision = (0, _helpers_1.requireString)(d?.decision, "decision");
        const reason = (0, _helpers_1.optString)(d?.reason);
        const result = await (0, _helpers_1.postBackend)("/exocore/api/plans/decide", {
            token, paymentId, decision, reason,
        });
        if (result?.success && result?.payment) {
            const p = result.payment;
            try {
                if (p.status === "approved") {
                    (0, hub_2.systemAnnounce)(`✅ @${p.username} is now on EXO PLAN. Welcome 🎉`);
                }
                else if (p.status === "rejected") {
                    (0, hub_2.systemAnnounce)(`❌ Payment from @${p.username} was rejected${p.reason ? ` — ${p.reason}` : ""}.`);
                }
            }
            catch { }
        }
        return result;
    });
    // ------- XP -------
    (0, hub_1.registerHandler)("xp.me", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        return await (0, _helpers_1.getBackend)("/exocore/api/xp/me", { token });
    });
    (0, hub_1.registerHandler)("xp.catalog", async () => {
        return await (0, _helpers_1.getBackend)("/exocore/api/xp/catalog");
    });
    // ------- Audit -------
    (0, hub_1.registerHandler)("audit.list", async (d) => {
        const token = (0, _helpers_1.requireString)(d?.token, "token");
        const limit = typeof d?.limit === "number" ? d.limit : 200;
        return await (0, _helpers_1.getBackend)("/exocore/api/audit", { token, limit });
    });
    // ------- Leaderboard -------
    (0, hub_1.registerHandler)("leaderboard.list", async (d) => {
        const sort = (0, _helpers_1.optString)(d?.sort) || "xp";
        const limit = typeof d?.limit === "number" ? d.limit : 50;
        return await (0, _helpers_1.getBackend)("/exocore/api/leaderboard", { sort, limit });
    });
}
