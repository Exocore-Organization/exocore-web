"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandler = registerHandler;
exports.registerStream = registerStream;
exports.listHandlers = listHandlers;
exports.listStreams = listStreams;
exports.createRpcWss = createRpcWss;
const ws_1 = require("ws");
const codec_1 = require("../social/codec");
const authHandlers_1 = require("./authHandlers");
const socialHandlers_1 = require("./socialHandlers");
const editorHandlers_1 = require("./editorHandlers");
const editor2Handlers_1 = require("./editor2Handlers");
const editorStreamHandlers_1 = require("./editorStreamHandlers");
const devAccessHandlers_1 = require("./devAccessHandlers");
const handlers = new Map();
const streamHandlers = new Map();
function registerHandler(name, fn) {
    if (handlers.has(name)) {
        console.warn(`[RPC] handler '${name}' is being overwritten`);
    }
    handlers.set(name, fn);
}
function registerStream(name, fn) {
    if (streamHandlers.has(name)) {
        console.warn(`[RPC] stream '${name}' is being overwritten`);
    }
    streamHandlers.set(name, fn);
}
function listHandlers() {
    return Array.from(handlers.keys()).sort();
}
function listStreams() {
    return Array.from(streamHandlers.keys()).sort();
}
function send(ws, t, d, id) {
    if (ws.readyState !== ws_1.WebSocket.OPEN)
        return;
    try {
        ws.send((0, codec_1.packFrame)({ t, d, id }));
    }
    catch { }
}
function createRpcWss() {
    (0, authHandlers_1.registerAuthHandlers)();
    (0, socialHandlers_1.registerSocialHandlers)();
    (0, editorHandlers_1.registerEditorHandlers)();
    (0, editor2Handlers_1.registerEditor2Handlers)();
    (0, editorStreamHandlers_1.registerEditorStreamHandlers)();
    (0, devAccessHandlers_1.registerDevAccessHandlers)();
    const wss = new ws_1.WebSocketServer({ noServer: true });
    wss.on("connection", (ws, req) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);
        const token = url.searchParams.get("token") || "";
        const ctx = { ws, req, token };
        // Per-connection open streams (id -> handle + method label)
        const openStreams = new Map();
        const closeStream = (id, reason) => {
            const s = openStreams.get(id);
            if (!s)
                return;
            openStreams.delete(id);
            try {
                s.handle.onClose?.(reason);
            }
            catch { }
        };
        send(ws, "rpc:hello", {
            ts: Date.now(),
            handlers: listHandlers(),
            streams: listStreams(),
        });
        ws.on("message", async (raw, isBinary) => {
            const buf = isBinary ? raw : Buffer.from(raw.toString());
            const f = (0, codec_1.unpackFrame)(buf);
            if (!f || typeof f.t !== "string")
                return;
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
                const payload = (f.d || {});
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
                const session = {
                    id,
                    ctx,
                    push: (d) => send(ws, "rpc:data", d, id),
                    end: (reason) => {
                        if (!openStreams.has(id))
                            return;
                        send(ws, "rpc:close", { reason: reason || null }, id);
                        closeStream(id, reason);
                    },
                };
                try {
                    const handle = await opener(payload.params, session);
                    openStreams.set(id, { handle, method });
                    send(ws, "rpc:open:ok", { method }, id);
                }
                catch (err) {
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
                if (!s)
                    return;
                try {
                    await s.handle.onClientFrame?.(f.d);
                }
                catch (err) {
                    send(ws, "rpc:close", { reason: err?.message || "stream error" }, id);
                    closeStream(id, err?.message || "stream error");
                }
                return;
            }
            if (f.t === "rpc:close") {
                const id = typeof f.id === "string" ? f.id : "";
                if (!id)
                    return;
                const reason = f.d?.reason;
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
            }
            catch (err) {
                send(ws, "rpc:err", {
                    method: f.t,
                    message: err?.message || "handler failed",
                    status: err?.status,
                    data: err?.data,
                }, f.id);
            }
        });
        const cleanupAll = (reason) => {
            for (const id of Array.from(openStreams.keys())) {
                closeStream(id, reason);
            }
        };
        ws.on("close", () => cleanupAll("socket closed"));
        ws.on("error", () => {
            cleanupAll("socket error");
            try {
                ws.close();
            }
            catch { }
        });
    });
    console.log(`[RPC] hub ready with ${handlers.size} handler(s) + ${streamHandlers.size} stream(s)`);
    return wss;
}
