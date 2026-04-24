"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backendCall = backendCall;
const ws_1 = __importDefault(require("ws"));
const msgpack_1 = require("@msgpack/msgpack");
const _resolveBase_1 = require("../routes/_resolveBase");
const pending = new Map();
let socket = null;
let connecting = null;
let backoff = 500;
function bridgeUrl(base) {
    return base.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws")) + "/ws/bridge";
}
function failAll(reason) {
    for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.resolve({ ok: false, status: 0, data: { message: reason } });
        pending.delete(id);
    }
}
async function connect() {
    if (socket && socket.readyState === ws_1.default.OPEN)
        return socket;
    if (connecting)
        return connecting;
    connecting = (async () => {
        const base = await (0, _resolveBase_1.resolveBaseUrl)();
        const url = bridgeUrl(base);
        const ws = new ws_1.default(url, { handshakeTimeout: 5000, maxPayload: 32 * 1024 * 1024 });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error("bridge handshake timeout")), 6000);
            ws.once("open", () => { clearTimeout(t); resolve(); });
            ws.once("error", (e) => { clearTimeout(t); reject(e); });
        });
        ws.on("message", (raw) => {
            let m;
            try {
                const buf = Array.isArray(raw)
                    ? Buffer.concat(raw)
                    : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
                m = (0, msgpack_1.decode)(buf);
            }
            catch {
                return;
            }
            const id = m && m.id;
            if (!id)
                return;
            const p = pending.get(id);
            if (!p)
                return;
            pending.delete(id);
            clearTimeout(p.timer);
            p.resolve({
                ok: !!m.ok,
                status: Number(m.status || 0),
                data: m.data,
                headers: (m.headers && typeof m.headers === "object") ? m.headers : undefined,
            });
        });
        const onDown = () => {
            if (socket === ws)
                socket = null;
            failAll("bridge disconnected");
        };
        ws.on("close", onDown);
        ws.on("error", onDown);
        socket = ws;
        backoff = 500;
        return ws;
    })();
    try {
        return await connecting;
    }
    catch (e) {
        socket = null;
        const wait = backoff;
        backoff = Math.min(backoff * 2, 15_000);
        setTimeout(() => { }, wait);
        throw e;
    }
    finally {
        connecting = null;
    }
}
async function backendCall(method, path, params, body, timeoutMs = 10_000, opts = {}) {
    let ws;
    try {
        ws = await connect();
    }
    catch (e) {
        return { ok: false, status: 0, data: { message: e?.message || "bridge unavailable" } };
    }
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (pending.delete(id))
                resolve({ ok: false, status: 0, data: { message: "bridge timeout" } });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        try {
            const env = { id, method, path, params, body };
            if (opts.followRedirects === false)
                env.followRedirects = false;
            if (opts.files && opts.files.length > 0) {
                env.files = opts.files.map((f) => ({
                    field: f.field,
                    name: f.name || "file",
                    type: f.type || "application/octet-stream",
                    bytes: f.bytes instanceof Uint8Array ? f.bytes : Uint8Array.from(f.bytes),
                }));
            }
            ws.send((0, msgpack_1.encode)(env));
        }
        catch (e) {
            pending.delete(id);
            clearTimeout(timer);
            resolve({ ok: false, status: 0, data: { message: e?.message || "bridge send failed" } });
        }
    });
}
// Eagerly establish the connection on first import so the social hub's
// first request doesn't pay handshake latency. Failures are swallowed —
// the next backendCall() will retry.
connect().catch(() => { });
