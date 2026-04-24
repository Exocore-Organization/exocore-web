import axios, { AxiosRequestConfig } from "axios";
import FormData from "form-data";
import { resolveBaseUrl } from "../../routes/_resolveBase";
import { backendCall } from "../backendWs";

export class RpcError extends Error {
    status: number;
    data: any;
    constructor(status: number, message: string, data?: any) {
        super(message);
        this.status = status;
        this.data = data;
    }
}

function defaultCfg(extra?: AxiosRequestConfig): AxiosRequestConfig {
    return {
        timeout: 20000,
        validateStatus: () => true,
        ...(extra || {}),
    };
}

async function unwrap(r: { status: number; data: any }) {
    if (r.status < 200 || r.status >= 300) {
        throw new RpcError(r.status, r.data?.message || "request failed", r.data);
    }
    return r.data;
}

export async function getBackend(path: string, params?: any) {
    try {
        const r = await backendCall("GET", path, params);
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}

export async function postBackend(path: string, body: any, params?: any) {
    try {
        const r = await backendCall("POST", path, params, body);
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}

export interface RpcFile {
    name?: string;
    type?: string;
    bytes: Uint8Array | Buffer;
}

function isRpcFile(v: unknown): v is RpcFile {
    return !!v && typeof v === "object" && "bytes" in (v as any) &&
        ((v as any).bytes instanceof Uint8Array || Buffer.isBuffer((v as any).bytes));
}

export async function postBackendForm(
    path: string,
    fields: Record<string, unknown>,
    files: Record<string, RpcFile | undefined>,
    params?: any,
) {
    const base = await resolveBaseUrl();
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        if (v == null) continue;
        form.append(k, typeof v === "string" ? v : String(v));
    }
    for (const [k, file] of Object.entries(files)) {
        if (!file || !isRpcFile(file)) continue;
        const buf = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
        form.append(k, buf, {
            filename: file.name || `${k}.bin`,
            contentType: file.type || "application/octet-stream",
        });
    }
    try {
        const r = await axios.post(`${base}${path}`, form, defaultCfg({
            params,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }));
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "backend unreachable");
    }
}

/* ---------- Self-loop helpers (for routes that own the local FS) ---------- */
function selfBase(): string {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
    return `http://127.0.0.1:${port}`;
}

export async function getSelf(path: string, params?: any) {
    try {
        const r = await axios.get(`${selfBase()}${path}`, defaultCfg({ params }));
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}

export async function postSelf(path: string, body: any, params?: any, headers?: Record<string, string>) {
    try {
        const r = await axios.post(`${selfBase()}${path}`, body, defaultCfg({ params, headers }));
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}

export async function deleteSelf(path: string, params?: any, body?: any) {
    try {
        const r = await axios.delete(`${selfBase()}${path}`, defaultCfg({ params, data: body }));
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}

export async function postSelfForm(
    path: string,
    fields: Record<string, unknown>,
    files: Record<string, RpcFile | undefined>,
    params?: any,
) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
        if (v == null) continue;
        form.append(k, typeof v === "string" ? v : String(v));
    }
    for (const [k, file] of Object.entries(files)) {
        if (!file || !isRpcFile(file)) continue;
        const buf = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes);
        form.append(k, buf, {
            filename: file.name || `${k}.bin`,
            contentType: file.type || "application/octet-stream",
        });
    }
    try {
        const r = await axios.post(`${selfBase()}${path}`, form, defaultCfg({
            params,
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
        }));
        return await unwrap(r);
    } catch (e: any) {
        if (e instanceof RpcError) throw e;
        throw new RpcError(502, e?.message || "self-route unreachable");
    }
}

export function requireString(v: unknown, name: string): string {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) throw new RpcError(400, `${name} is required`);
    return s;
}

export function optString(v: unknown): string {
    return typeof v === "string" ? v : "";
}
