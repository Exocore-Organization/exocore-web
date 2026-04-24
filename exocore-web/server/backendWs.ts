import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import { resolveBaseUrl } from "../routes/_resolveBase";

export interface BackendResult {
  ok: boolean;
  status: number;
  data: any;
  headers?: Record<string, string>;
}

export interface BridgeFilePart {
  field: string;
  name: string;
  type: string;
  bytes: Buffer;
}

export interface BackendCallOpts {
  followRedirects?: boolean;
  files?: BridgeFilePart[];
}

interface PendingEntry {
  resolve: (r: BackendResult) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingEntry>();
let socket: WebSocket | null = null;
let connecting: Promise<WebSocket> | null = null;
let backoff = 500;

function bridgeUrl(base: string): string {
  return base.replace(/^http/i, (m) => (m.toLowerCase() === "https" ? "wss" : "ws")) + "/ws/bridge";
}

function failAll(reason: string) {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve({ ok: false, status: 0, data: { message: reason } });
    pending.delete(id);
  }
}

async function connect(): Promise<WebSocket> {
  if (socket && socket.readyState === WebSocket.OPEN) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    const base = await resolveBaseUrl();
    const url = bridgeUrl(base);
    const ws = new WebSocket(url, { handshakeTimeout: 5000, maxPayload: 32 * 1024 * 1024 });

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("bridge handshake timeout")), 6000);
      ws.once("open", () => { clearTimeout(t); resolve(); });
      ws.once("error", (e) => { clearTimeout(t); reject(e); });
    });

    ws.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let m: any;
      try {
        const buf = Array.isArray(raw)
          ? Buffer.concat(raw)
          : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
        m = decode(buf);
      } catch { return; }
      const id = m && m.id;
      if (!id) return;
      const p = pending.get(id);
      if (!p) return;
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
      if (socket === ws) socket = null;
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
  } catch (e) {
    socket = null;
    const wait = backoff;
    backoff = Math.min(backoff * 2, 15_000);
    setTimeout(() => { /* allow next call to retry */ }, wait);
    throw e;
  } finally {
    connecting = null;
  }
}

export async function backendCall(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, unknown>,
  body?: unknown,
  timeoutMs = 10_000,
  opts: BackendCallOpts = {},
): Promise<BackendResult> {
  let ws: WebSocket;
  try {
    ws = await connect();
  } catch (e: any) {
    return { ok: false, status: 0, data: { message: e?.message || "bridge unavailable" } };
  }

  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<BackendResult>((resolve) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) resolve({ ok: false, status: 0, data: { message: "bridge timeout" } });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    try {
      const env: Record<string, unknown> = { id, method, path, params, body };
      if (opts.followRedirects === false) env.followRedirects = false;
      if (opts.files && opts.files.length > 0) {
        env.files = opts.files.map((f) => ({
          field: f.field,
          name: f.name || "file",
          type: f.type || "application/octet-stream",
          bytes: f.bytes instanceof Uint8Array ? f.bytes : Uint8Array.from(f.bytes),
        }));
      }
      ws.send(encode(env));
    } catch (e: any) {
      pending.delete(id);
      clearTimeout(timer);
      resolve({ ok: false, status: 0, data: { message: e?.message || "bridge send failed" } });
    }
  });
}

// Eagerly establish the connection on first import so the social hub's
// first request doesn't pay handshake latency. Failures are swallowed —
// the next backendCall() will retry.
connect().catch(() => { /* will retry on demand */ });
