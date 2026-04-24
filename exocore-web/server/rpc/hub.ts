import type { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { packFrame, unpackFrame } from "../social/codec";
import { registerAuthHandlers } from "./authHandlers";
import { registerSocialHandlers } from "./socialHandlers";
import { registerEditorHandlers } from "./editorHandlers";
import { registerEditor2Handlers } from "./editor2Handlers";
import { registerEditorStreamHandlers } from "./editorStreamHandlers";
import { registerDevAccessHandlers } from "./devAccessHandlers";

export interface RpcContext {
    ws: WebSocket;
    req: IncomingMessage;
    token: string;
}

export type RpcHandler = (data: any, ctx: RpcContext) => Promise<any> | any;

export interface RpcStreamSession {
    id: string;
    ctx: RpcContext;
    push: (payload: unknown) => void;
    end: (reason?: string) => void;
}

export interface RpcStreamHandle {
    onClientFrame?: (payload: unknown) => void | Promise<void>;
    onClose?: (reason?: string) => void | Promise<void>;
}

export type RpcStreamOpen = (
    params: any,
    session: RpcStreamSession,
) => Promise<RpcStreamHandle> | RpcStreamHandle;

const handlers = new Map<string, RpcHandler>();
const streamHandlers = new Map<string, RpcStreamOpen>();

export function registerHandler(name: string, fn: RpcHandler): void {
    if (handlers.has(name)) {
        console.warn(`[RPC] handler '${name}' is being overwritten`);
    }
    handlers.set(name, fn);
}

export function registerStream(name: string, fn: RpcStreamOpen): void {
    if (streamHandlers.has(name)) {
        console.warn(`[RPC] stream '${name}' is being overwritten`);
    }
    streamHandlers.set(name, fn);
}

export function listHandlers(): string[] {
    return Array.from(handlers.keys()).sort();
}

export function listStreams(): string[] {
    return Array.from(streamHandlers.keys()).sort();
}

function send(ws: WebSocket, t: string, d: unknown, id?: string): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(packFrame({ t, d, id })); } catch {}
}

export function createRpcWss(): WebSocketServer {
    registerAuthHandlers();
    registerSocialHandlers();
    registerEditorHandlers();
    registerEditor2Handlers();
    registerEditorStreamHandlers();
    registerDevAccessHandlers();

    const wss = new WebSocketServer({ noServer: true });

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const token = url.searchParams.get("token") || "";
        const ctx: RpcContext = { ws, req, token };

        // Per-connection open streams (id -> handle + method label)
        const openStreams = new Map<string, { handle: RpcStreamHandle; method: string }>();

        const closeStream = (id: string, reason?: string) => {
            const s = openStreams.get(id);
            if (!s) return;
            openStreams.delete(id);
            try { s.handle.onClose?.(reason); } catch {}
        };

        send(ws, "rpc:hello", {
            ts: Date.now(),
            handlers: listHandlers(),
            streams: listStreams(),
        });

        ws.on("message", async (raw, isBinary) => {
            const buf = isBinary ? (raw as Buffer) : Buffer.from(raw.toString());
            const f = unpackFrame(buf);
            if (!f || typeof f.t !== "string") return;

            if (f.t === "ping") {
                send(ws, "pong", { ts: Date.now() }, f.id);
                return;
            }

            // ---------- Streaming protocol ----------
            if (f.t === "rpc:open") {
                const id = typeof f.id === "string" ? f.id : "";
                if (!id) {
                    send(ws, "rpc:open:err", { message: "stream id required" });
                    return;
                }
                const payload = (f.d || {}) as { method?: string; params?: unknown };
                const method = typeof payload.method === "string" ? payload.method : "";
                const opener = streamHandlers.get(method);
                if (!opener) {
                    send(ws, "rpc:open:err", { method, message: "unknown stream" }, id);
                    return;
                }
                if (openStreams.has(id)) {
                    send(ws, "rpc:open:err", { method, message: "stream id in use" }, id);
                    return;
                }
                const session: RpcStreamSession = {
                    id,
                    ctx,
                    push: (d) => send(ws, "rpc:data", d, id),
                    end: (reason) => {
                        if (!openStreams.has(id)) return;
                        send(ws, "rpc:close", { reason: reason || null }, id);
                        closeStream(id, reason);
                    },
                };
                try {
                    const handle = await opener(payload.params, session);
                    openStreams.set(id, { handle, method });
                    send(ws, "rpc:open:ok", { method }, id);
                } catch (err: any) {
                    send(ws, "rpc:open:err", {
                        method,
                        message: err?.message || "stream open failed",
                        status: err?.status,
                        data: err?.data,
                    }, id);
                }
                return;
            }

            if (f.t === "rpc:data") {
                const id = typeof f.id === "string" ? f.id : "";
                const s = id ? openStreams.get(id) : undefined;
                if (!s) return;
                try { await s.handle.onClientFrame?.(f.d); } catch (err: any) {
                    send(ws, "rpc:close", { reason: err?.message || "stream error" }, id);
                    closeStream(id, err?.message || "stream error");
                }
                return;
            }

            if (f.t === "rpc:close") {
                const id = typeof f.id === "string" ? f.id : "";
                if (!id) return;
                const reason = (f.d as any)?.reason;
                closeStream(id, reason);
                return;
            }
            // ---------- /Streaming protocol ----------

            const fn = handlers.get(f.t);
            if (!fn) {
                send(ws, "rpc:err", { method: f.t, message: "unknown method" }, f.id);
                return;
            }
            try {
                const result = await fn(f.d, ctx);
                send(ws, "rpc:ok", { method: f.t, result }, f.id);
            } catch (err: any) {
                send(ws, "rpc:err", {
                    method: f.t,
                    message: err?.message || "handler failed",
                    status: err?.status,
                    data: err?.data,
                }, f.id);
            }
        });

        const cleanupAll = (reason: string) => {
            for (const id of Array.from(openStreams.keys())) {
                closeStream(id, reason);
            }
        };

        ws.on("close", () => cleanupAll("socket closed"));
        ws.on("error", () => {
            cleanupAll("socket error");
            try { ws.close(); } catch {}
        });
    });

    console.log(`[RPC] hub ready with ${handlers.size} handler(s) + ${streamHandlers.size} stream(s)`);
    return wss;
}
