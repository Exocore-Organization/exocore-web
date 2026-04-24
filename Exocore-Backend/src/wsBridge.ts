import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import axios from "axios";
import FormData from "form-data";
import { encode, decode } from "@msgpack/msgpack";

interface BridgeFile {
  field: string;
  name: string;
  type: string;
  bytes: Uint8Array;
}

interface BridgeReq {
  id: string;
  method: "GET" | "POST";
  path: string;
  params?: Record<string, unknown>;
  body?: unknown;
  files?: BridgeFile[];
  followRedirects?: boolean;
}

interface BridgeRes {
  id: string;
  ok: boolean;
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

function normalizeHeaders(h: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const k of Object.keys(h)) {
    const v = (h as any)[k];
    if (v == null) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

function buildForm(body: unknown, files: BridgeFile[]): FormData {
  const form = new FormData();
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v == null) continue;
      form.append(k, typeof v === "string" ? v : String(v));
    }
  }
  for (const f of files) {
    if (!f || !f.field || !f.bytes) continue;
    const buf = Buffer.from(f.bytes);
    form.append(f.field, buf, { filename: f.name || "file", contentType: f.type || "application/octet-stream" });
  }
  return form;
}

export function attachBridge(server: HttpServer, port: number): void {
  // 32 MiB cap covers a 20 MiB upload + envelope overhead with msgpack (no base64).
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);
    if (pathname === "/ws/bridge") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    }
  });

  wss.on("connection", (ws: WebSocket) => {
    let alive = true;
    const ping = setInterval(() => {
      if (!alive) { try { ws.terminate(); } catch {} return; }
      alive = false;
      try { ws.ping(); } catch {}
    }, 30_000);
    ws.on("pong", () => { alive = true; });
    ws.on("close", () => clearInterval(ping));

    ws.on("message", async (raw: Buffer | ArrayBuffer | Buffer[]) => {
      let m: BridgeReq;
      try {
        const buf = Array.isArray(raw)
          ? Buffer.concat(raw)
          : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
        m = decode(buf) as BridgeReq;
      } catch { return; }
      if (!m || !m.id || !m.method || !m.path) return;

      const url = `http://localhost:${port}${m.path}`;
      const cfg: any = {
        params: m.params,
        timeout: 30_000,
        validateStatus: () => true,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      };
      if (m.followRedirects === false) cfg.maxRedirects = 0;

      let res: BridgeRes;
      try {
        let r;
        if (m.method === "GET") {
          r = await axios.get(url, cfg);
        } else if (m.files && m.files.length > 0) {
          const form = buildForm(m.body, m.files);
          r = await axios.post(url, form, { ...cfg, headers: form.getHeaders() });
        } else {
          r = await axios.post(url, m.body, cfg);
        }
        res = {
          id: m.id,
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          data: r.data,
          headers: normalizeHeaders(r.headers),
        };
      } catch (e: any) {
        const r = e?.response;
        if (r && typeof r.status === "number") {
          res = {
            id: m.id,
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            data: r.data,
            headers: normalizeHeaders(r.headers),
          };
        } else {
          res = { id: m.id, ok: false, status: 0, data: { message: e?.message || "bridge error" } };
        }
      }
      try { ws.send(encode(res)); } catch {}
    });
  });

  console.log(`🛰️  Bridge WS attached at /ws/bridge`);
}
