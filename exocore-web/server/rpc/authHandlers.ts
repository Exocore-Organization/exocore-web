import { registerHandler } from "./hub";
import {
    RpcError,
    getBackend,
    postBackend,
    postBackendForm,
    requireString,
    optString,
    RpcFile,
} from "./_helpers";
import { systemAnnounce } from "../social/hub";

export function registerAuthHandlers(): void {
    // ------- Phase 1 — login -------
    registerHandler("auth.login", async (d) => {
        const user = requireString(d?.user, "user");
        const pass = requireString(d?.pass, "pass");
        return await postBackend("/exocore/api/auth/login", { user, pass });
    });

    // ------- Phase 2 — register / verify (OTP confirm) / forgot -------
    registerHandler("auth.register", async (d) => {
        const fields: Record<string, unknown> = {
            user: requireString(d?.user, "user"),
            pass: requireString(d?.pass, "pass"),
            email: requireString(d?.email, "email"),
            nickname: optString(d?.nickname),
            bio: optString(d?.bio),
            dob: optString(d?.dob),
            country: optString(d?.country),
            host: requireString(d?.host, "host"),
        };
        const files = {
            avatar: d?.avatar as RpcFile | undefined,
            cover: d?.cover as RpcFile | undefined,
        };
        return await postBackendForm("/exocore/api/auth/register", fields, files);
    });

    // OTP-based verify (called from the VerifyPending screen).
    // The email-link verify (`/exocore/api/auth/verify` GET with redirect) stays HTTP.
    registerHandler("auth.verify", async (d) => {
        const username = requireString(d?.username, "username");
        const otp = requireString(d?.otp, "otp");
        const host = optString(d?.host);
        return await getBackend("/exocore/api/auth/verify", {
            username,
            otp,
            req: "json",
            host,
        });
    });

    // Resend the verification email — no OTP needed, just retriggers the send.
    registerHandler("auth.verify.resend", async (d) => {
        const username = requireString(d?.username, "username");
        const host = optString(d?.host);
        return await getBackend("/exocore/api/auth/verify", {
            username, req: "now", host,
        });
    });

    registerHandler("auth.forgot.request", async (d) => {
        const email = requireString(d?.email, "email");
        return await getBackend("/exocore/api/auth/forgot", { email, req: "now" });
    });

    registerHandler("auth.forgot.reset", async (d) => {
        const email = requireString(d?.email, "email");
        const otp = requireString(d?.otp, "otp");
        const pass = requireString(d?.pass, "pass");
        return await getBackend("/exocore/api/auth/forgot", { email, otp, pass });
    });

    // ------- Phase 3 — userinfo / delete / plans / xp / audit / leaderboard -------
    registerHandler("auth.userinfo.get", async (d) => {
        const token = requireString(d?.token, "token");
        const source = requireString(d?.source, "source");
        return await getBackend("/exocore/api/auth/userinfo", { source, token });
    });

    registerHandler("auth.userinfo.edit", async (d) => {
        const token = requireString(d?.token, "token");
        const update = { ...(d?.update || {}) } as Record<string, unknown>;
        delete update.id; delete update.pass; delete update.email; delete update.token;
        return await postBackend("/exocore/api/auth/userinfo", update, { source: "edit", token });
    });

    registerHandler("auth.userinfo.upload", async (d) => {
        const token = requireString(d?.token, "token");
        const kind = requireString(d?.kind, "kind"); // "avatar" | "cover"
        if (kind !== "avatar" && kind !== "cover") {
            throw new RpcError(400, "kind must be 'avatar' or 'cover'");
        }
        const file = d?.file as RpcFile | undefined;
        if (!file?.bytes) throw new RpcError(400, "file is required");
        return await postBackendForm(
            "/exocore/api/auth/userinfo",
            {},
            { file },
            { source: `upload-${kind}`, token },
        );
    });

    registerHandler("auth.delete", async (d) => {
        const pass = requireString(d?.pass, "pass");
        const payload: Record<string, unknown> = { pass };
        if (typeof d?.token === "string" && d.token) payload.token = d.token;
        if (typeof d?.user === "string" && d.user) payload.user = d.user;
        if (typeof d?.username === "string" && d.username) payload.username = d.username;
        if (typeof d?.email === "string" && d.email) payload.email = d.email;
        if (typeof d?.id === "string" && d.id) payload.id = d.id;
        const hasIdentifier = !!(payload.token || payload.user || payload.username || payload.email || payload.id);
        if (!hasIdentifier) {
            throw new RpcError(400, "token or username/email is required");
        }
        return await postBackend("/exocore/api/auth/delete", payload);
    });

    // ------- Plans -------
    registerHandler("plans.catalog", async (d) => {
        return await getBackend("/exocore/api/plans/catalog", { token: optString(d?.token) });
    });
    registerHandler("plans.me", async (d) => {
        const token = requireString(d?.token, "token");
        return await getBackend("/exocore/api/plans/me", { token });
    });
    registerHandler("plans.pending", async (d) => {
        const token = requireString(d?.token, "token");
        const status = optString(d?.status) || "pending";
        return await getBackend("/exocore/api/plans/pending", { token, status });
    });
    registerHandler("plans.submit", async (d) => {
        const token = requireString(d?.token, "token");
        const plan = optString(d?.plan) || "exo";
        const method = optString(d?.method) || "gcash";
        const file = d?.file as RpcFile | undefined;
        if (!file?.bytes) throw new RpcError(400, "payment proof file is required");
        const result = await postBackendForm(
            "/exocore/api/plans/submit",
            { token, plan, method, note: optString(d?.note) },
            { file },
        );
        // Mirror the HTTP route's owner notification.
        if (result?.success && result?.payment) {

            const p = result.payment;
            try {
                systemAnnounce(
                    `💰 New ${String(p.plan || "").toUpperCase()} payment from @${p.username} via ${String(p.method || "").toUpperCase()} (${p.currency} ${p.amount}). Owners — please review.`
                );
            } catch {}
        }
        return result;
    });
    registerHandler("plans.decide", async (d) => {
        const token = requireString(d?.token, "token");
        const paymentId = requireString(d?.paymentId, "paymentId");
        const decision = requireString(d?.decision, "decision");
        const reason = optString(d?.reason);
        const result = await postBackend("/exocore/api/plans/decide", {
            token, paymentId, decision, reason,
        });
        if (result?.success && result?.payment) {

            const p = result.payment;
            try {
                if (p.status === "approved") {
                    systemAnnounce(`✅ @${p.username} is now on EXO PLAN. Welcome 🎉`);
                } else if (p.status === "rejected") {
                    systemAnnounce(`❌ Payment from @${p.username} was rejected${p.reason ? ` — ${p.reason}` : ""}.`);
                }
            } catch {}
        }
        return result;
    });

    // ------- XP -------
    registerHandler("xp.me", async (d) => {
        const token = requireString(d?.token, "token");
        return await getBackend("/exocore/api/xp/me", { token });
    });
    registerHandler("xp.catalog", async () => {
        return await getBackend("/exocore/api/xp/catalog");
    });

    // ------- Audit -------
    registerHandler("audit.list", async (d) => {
        const token = requireString(d?.token, "token");
        const limit = typeof d?.limit === "number" ? d.limit : 200;
        return await getBackend("/exocore/api/audit", { token, limit });
    });

    // ------- Leaderboard -------
    registerHandler("leaderboard.list", async (d) => {
        const sort = optString(d?.sort) || "xp";
        const limit = typeof d?.limit === "number" ? d.limit : 50;
        return await getBackend("/exocore/api/leaderboard", { sort, limit });
    });
}
