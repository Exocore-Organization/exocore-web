import type { IncomingMessage } from "http";
import { registerHandler } from "./hub";
import { RpcError, optString } from "./_helpers";
import {
    isInitialized,
    setupDevs,
    loginDevs,
    revokeSession,
    isValidSession,
    getSessionMeta,
    touchSession,
    LockedOutError,
} from "../lib/devGate";

function pickIp(req: IncomingMessage | undefined): string | null {
    if (!req) return null;
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
    return req.socket?.remoteAddress ?? null;
}

function pickUa(req: IncomingMessage | undefined): string | null {
    const ua = req?.headers["user-agent"];
    return typeof ua === "string" && ua.length > 0 ? ua.slice(0, 200) : null;
}

/**
 * RPC counterpart of the legacy `routes/dev-access.ts` HTTP endpoints.
 * The dev-gate state lives in-process on the web server (devs.json),
 * so these handlers call the local `devGate` lib directly — no
 * backend hop, no self-loop.
 */
export function registerDevAccessHandlers(): void {
    registerHandler("devAccess.status", async () => {
        return { initialized: isInitialized() };
    });

    registerHandler("devAccess.me", async (d, ctx) => {
        const token = optString(d?.token) || undefined;
        const ok = isValidSession(token);
        if (ok) touchSession(token, pickIp(ctx.req), pickUa(ctx.req));
        return { authenticated: ok };
    });

    registerHandler("devAccess.session", async (d, ctx) => {
        const token = optString(d?.token) || undefined;
        if (!isValidSession(token)) {
            throw new RpcError(401, "Not authenticated", { success: false });
        }
        touchSession(token, pickIp(ctx.req), pickUa(ctx.req));
        const meta = getSessionMeta();
        return { success: true, meta };
    });

    registerHandler("devAccess.setup", async (d, ctx) => {
        const user = optString(d?.user);
        const pass = optString(d?.pass);
        try {
            const { token } = setupDevs(user, pass, pickIp(ctx.req), pickUa(ctx.req));
            return { success: true, token };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Setup failed";
            const status = message === "Already initialized" ? 409 : 400;
            throw new RpcError(status, message, { success: false, message });
        }
    });

    registerHandler("devAccess.login", async (d, ctx) => {
        const user = optString(d?.user);
        const pass = optString(d?.pass);
        try {
            const { token } = loginDevs(user, pass, pickIp(ctx.req), pickUa(ctx.req));
            return { success: true, token };
        } catch (err) {
            if (err instanceof LockedOutError) {
                throw new RpcError(429, err.message, {
                    success: false,
                    message: err.message,
                    lockedUntil: err.lockedUntil,
                    retryAfterSec: err.retryAfterSec,
                });
            }
            const message = err instanceof Error ? err.message : "Login failed";
            throw new RpcError(401, message, { success: false, message });
        }
    });

    registerHandler("devAccess.logout", async (d) => {
        revokeSession(optString(d?.token) || undefined);
        return { success: true };
    });
}
