"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcError = void 0;
exports.getBackend = getBackend;
exports.postBackend = postBackend;
exports.postBackendForm = postBackendForm;
exports.getSelf = getSelf;
exports.postSelf = postSelf;
exports.deleteSelf = deleteSelf;
exports.postSelfForm = postSelfForm;
exports.requireString = requireString;
exports.optString = optString;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const _resolveBase_1 = require("../../routes/_resolveBase");
const backendWs_1 = require("../backendWs");
class RpcError extends Error {
    status;
    data;
    constructor(status, message, data) {
        super(message);
        this.status = status;
        this.data = data;
    }
}
exports.RpcError = RpcError;
function defaultCfg(extra) {
    return {
        timeout: 20000,
        validateStatus: () => true,
        ...(extra || {}),
    };
}
async function unwrap(r) {
    if (r.status < 200 || r.status >= 300) {
        throw new RpcError(r.status, r.data?.message || "request failed", r.data);
    }
    return r.data;
}
async function getBackend(path, params) {
    try {
        const r = await (0, backendWs_1.backendCall)("GET", path, params);
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}
async function postBackend(path, body, params) {
    try {
        const r = await (0, backendWs_1.backendCall)("POST", path, params, body);
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}
function isRpcFile(v) {
    return !!v && typeof v === "object" && "bytes" in v &&
        (v.bytes instanceof Uint8Array || Buffer.isBuffer(v.bytes));
}
async function postBackendForm(path, fields, files, params) {
    const base = await (0, _resolveBase_1.resolveBaseUrl)();
    const form = new form_data_1.default();
    for (const [k, v] of Object.entries(fields)) {
        if (v == null)
            continue;
        form.append(k, typeof v === "string" ? v : String(v));
    }
    for (const [k, file] of Object.entries(files)) {
        if (!file || !isRpcFile(file))
            continue;
        const buf = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
        form.append(k, buf, {
            filename: file.name || `${k}.bin`,
            contentType: file.type || "application/octet-stream",
        });
    }
    try {
        const r = await axios_1.default.post(`${base}${path}`, form, defaultCfg({
            params,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }));
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}
/* ---------- Self-loop helpers (for routes that own the local FS) ---------- */
function selfBase() {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
    return `http://127.0.0.1:${port}`;
}
async function getSelf(path, params) {
    try {
        const r = await axios_1.default.get(`${selfBase()}${path}`, defaultCfg({ params }));
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}
async function postSelf(path, body, params, headers) {
    try {
        const r = await axios_1.default.post(`${selfBase()}${path}`, body, defaultCfg({ params, headers }));
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}
async function deleteSelf(path, params, body) {
    try {
        const r = await axios_1.default.delete(`${selfBase()}${path}`, defaultCfg({ params, data: body }));
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}
async function postSelfForm(path, fields, files, params) {
    const form = new form_data_1.default();
    for (const [k, v] of Object.entries(fields)) {
        if (v == null)
            continue;
        form.append(k, typeof v === "string" ? v : String(v));
    }
    for (const [k, file] of Object.entries(files)) {
        if (!file || !isRpcFile(file))
            continue;
        const buf = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
        form.append(k, buf, {
            filename: file.name || `${k}.bin`,
            contentType: file.type || "application/octet-stream",
        });
    }
    try {
        const r = await axios_1.default.post(`${selfBase()}${path}`, form, defaultCfg({
            params,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }));
        return await unwrap(r);
    }
    catch (e) {
        if (e instanceof RpcError)
            throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}
function requireString(v, name) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s)
        throw new RpcError(400, `${name} is required`);
    return s;
}
function optString(v) {
    return typeof v === "string" ? v : "";
}
