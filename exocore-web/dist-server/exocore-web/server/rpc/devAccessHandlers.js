"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDevAccessHandlers = registerDevAccessHandlers;
const hub_1 = require("./hub");
const _helpers_1 = require("./_helpers");
const devGate_1 = require("../lib/devGate");
function pickIp(req) {
    if (!req)
        return null;
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length > 0)
        return xf.split(",")[0].trim();
    return req.socket?.remoteAddress ?? null;
}
function pickUa(req) {
    const ua = req?.headers["user-agent"];
    return typeof ua === "string" && ua.length > 0 ? ua.slice(0, 200) : null;
}
/**
 * RPC counterpart of the legacy `routes/dev-access.ts` HTTP endpoints.
 * The dev-gate state lives in-process on the web server (devs.json),
 * so these handlers call the local `devGate` lib directly — no
 * backend hop, no self-loop.
 */
function registerDevAccessHandlers() {
    (0, hub_1.registerHandler)("devAccess.status", async () => {
        return { initialized: (0, devGate_1.isInitialized)() };
    });
    (0, hub_1.registerHandler)("devAccess.me", async (d, ctx) => {
        const token = (0, _helpers_1.optString)(d?.token) || undefined;
        const ok = (0, devGate_1.isValidSession)(token);
        if (ok)
            (0, devGate_1.touchSession)(token, pickIp(ctx.req), pickUa(ctx.req));
        return { authenticated: ok };
    });
    (0, hub_1.registerHandler)("devAccess.session", async (d, ctx) => {
        const token = (0, _helpers_1.optString)(d?.token) || undefined;
        if (!(0, devGate_1.isValidSession)(token)) {
            throw new _helpers_1.RpcError(401, "Not authenticated", { success: false });
        }
        (0, devGate_1.touchSession)(token, pickIp(ctx.req), pickUa(ctx.req));
        const meta = (0, devGate_1.getSessionMeta)();
        return { success: true, meta };
    });
    (0, hub_1.registerHandler)("devAccess.setup", async (d, ctx) => {
        const user = (0, _helpers_1.optString)(d?.user);
        const pass = (0, _helpers_1.optString)(d?.pass);
        try {
            const { token } = (0, devGate_1.setupDevs)(user, pass, pickIp(ctx.req), pickUa(ctx.req));
            return { success: true, token };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Setup failed";
            const status = message === "Already initialized" ? 409 : 400;
            throw new _helpers_1.RpcError(status, message, { success: false, message });
        }
    });
    (0, hub_1.registerHandler)("devAccess.login", async (d, ctx) => {
        const user = (0, _helpers_1.optString)(d?.user);
        const pass = (0, _helpers_1.optString)(d?.pass);
        try {
            const { token } = (0, devGate_1.loginDevs)(user, pass, pickIp(ctx.req), pickUa(ctx.req));
            return { success: true, token };
        }
        catch (err) {
            if (err instanceof devGate_1.LockedOutError) {
                throw new _helpers_1.RpcError(429, err.message, {
                    success: false,
                    message: err.message,
                    lockedUntil: err.lockedUntil,
                    retryAfterSec: err.retryAfterSec,
                });
            }
            const message = err instanceof Error ? err.message : "Login failed";
            throw new _helpers_1.RpcError(401, message, { success: false, message });
        }
    });
    (0, hub_1.registerHandler)("devAccess.logout", async (d) => {
        (0, devGate_1.revokeSession)((0, _helpers_1.optString)(d?.token) || undefined);
        return { success: true };
    });
}
