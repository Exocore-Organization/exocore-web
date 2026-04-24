"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachBridge = attachBridge;
const ws_1 = require("ws");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const msgpack_1 = require("@msgpack/msgpack");
function normalizeHeaders(h) {
    const out = {};
    if (!h || typeof h !== "object")
        return out;
    for (const k of Object.keys(h)) {
        const v = h[k];
        if (v == null)
            continue;
        out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
    }
    return out;
}
function buildForm(body, files) {
    const form = new form_data_1.default();
    if (body && typeof body === "object") {
        for (const [k, v] of Object.entries(body)) {
            if (v == null)
                continue;
            form.append(k, typeof v === "string" ? v : String(v));
        }
    }
    for (const f of files) {
        if (!f || !f.field || !f.bytes)
            continue;
        const buf = Buffer.from(f.bytes);
        form.append(f.field, buf, { filename: f.name || "file", contentType: f.type || "application/octet-stream" });
    }
    return form;
}
function attachBridge(server, port) {
    // 32 MiB cap covers a 20 MiB upload + envelope overhead with msgpack (no base64).
    const wss = new ws_1.WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    server.on("upgrade", (req, socket, head) => {
        const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);
        if (pathname === "/ws/bridge") {
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
        }
    });
    wss.on("connection", (ws) => {
        let alive = true;
        const ping = setInterval(() => {
            if (!alive) {
                try {
                    ws.terminate();
                }
                catch { }
                return;
            }
            alive = false;
            try {
                ws.ping();
            }
            catch { }
        }, 30_000);
        ws.on("pong", () => { alive = true; });
        ws.on("close", () => clearInterval(ping));
        ws.on("message", async (raw) => {
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
            if (!m || !m.id || !m.method || !m.path)
                return;
            const url = `http://localhost:${port}${m.path}`;
            const cfg = {
                params: m.params,
                timeout: 30_000,
                validateStatus: () => true,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            };
            if (m.followRedirects === false)
                cfg.maxRedirects = 0;
            let res;
            try {
                let r;
                if (m.method === "GET") {
                    r = await axios_1.default.get(url, cfg);
                }
                else if (m.files && m.files.length > 0) {
                    const form = buildForm(m.body, m.files);
                    r = await axios_1.default.post(url, form, { ...cfg, headers: form.getHeaders() });
                }
                else {
                    r = await axios_1.default.post(url, m.body, cfg);
                }
                res = {
                    id: m.id,
                    ok: r.status >= 200 && r.status < 300,
                    status: r.status,
                    data: r.data,
                    headers: normalizeHeaders(r.headers),
                };
            }
            catch (e) {
                const r = e?.response;
                if (r && typeof r.status === "number") {
                    res = {
                        id: m.id,
                        ok: r.status >= 200 && r.status < 300,
                        status: r.status,
                        data: r.data,
                        headers: normalizeHeaders(r.headers),
                    };
                }
                else {
                    res = { id: m.id, ok: false, status: 0, data: { message: e?.message || "bridge error" } };
                }
            }
            try {
                ws.send((0, msgpack_1.encode)(res));
            }
            catch { }
        });
    });
    console.log(`🛰️  Bridge WS attached at /ws/bridge`);
}
