/** Browser-side WebSocket-shaped object that rides one carrier socket
 *  multiplexed by channel name. Drop-in for the few APIs the existing
 *  hubs actually use: send / close / readyState / binaryType /
 *  onopen|onmessage|onclose|onerror / addEventListener("message") /
 *  removeEventListener. */
export class MuxChannel {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState: number = 0;
    binaryType: "arraybuffer" | "blob" = "arraybuffer";
    onopen: ((ev?: any) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: ((ev?: any) => void) | null = null;
    onerror: ((ev?: any) => void) | null = null;

    private listeners: Record<string, Set<Function>> = {};

    constructor(
        readonly channel: string,
        private readonly _send: (bytes: Uint8Array) => void,
        private readonly _close: (code?: number, reason?: string) => void,
    ) {}

    addEventListener(type: string, fn: any): void {
        (this.listeners[type] ||= new Set()).add(fn);
    }
    removeEventListener(type: string, fn: any): void {
        this.listeners[type]?.delete(fn);
    }
    private dispatch(type: string, ev: any): void {
        const cb = (this as any)["on" + type];
        if (typeof cb === "function") { try { cb.call(this, ev); } catch {} }
        const set = this.listeners[type];
        if (set) for (const fn of set) { try { (fn as Function).call(this, ev); } catch {} }
    }

    /** Called by the mux carrier when this channel goes live. */
    _markOpen(): void {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.dispatch("open", { type: "open", target: this });
    }

    /** Called by the mux carrier on each inbound binary frame. */
    _deliverMessage(bytes: Uint8Array): void {
        if (this.readyState !== 1) return;
        const data: ArrayBuffer | Blob = this.binaryType === "arraybuffer"
            ? (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
            : new Blob([bytes]);
        const ev = { type: "message", data, target: this } as unknown as MessageEvent;
        this.dispatch("message", ev);
    }

    /** Called by the mux carrier when this channel is torn down. */
    _markClosed(code?: number, reason?: string): void {
        if (this.readyState >= 3) return;
        this.readyState = 3;
        this.dispatch("close", { type: "close", code: code ?? 1000, reason: reason ?? "", target: this });
    }

    send(data: ArrayBuffer | ArrayBufferView | string | Blob): void {
        if (this.readyState !== 1) return;
        let bytes: Uint8Array;
        if (data instanceof Uint8Array) bytes = data;
        else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
        else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        else if (typeof data === "string") bytes = new TextEncoder().encode(data);
        else { try { (data as Blob).arrayBuffer().then((b) => this._send(new Uint8Array(b))); } catch {}; return; }
        this._send(bytes);
    }

    close(code?: number, reason?: string): void {
        if (this.readyState >= 2) return;
        this.readyState = 2;
        try { this._close(code, reason); } catch {}
        this._markClosed(code, reason);
    }
}

/** Compact carrier wire format: [type:u8][nlen:u8][name:N][payload:rest].
 *  type 1=open (payload=url utf8), 2=data (payload=raw), 3=close
 *  (payload=u16 LE code + utf8 reason). Mirrors the server-side layout
 *  in `server/wsMux.ts`. */
const FT_OPEN = 1;
const FT_DATA = 2;
const FT_CLOSE = 3;

function encodeFrame(type: number, ch: string, payload?: Uint8Array): Uint8Array {
    const name = new TextEncoder().encode(ch);
    if (name.length > 255) throw new Error("channel name too long");
    const out = new Uint8Array(2 + name.length + (payload?.length ?? 0));
    out[0] = type;
    out[1] = name.length;
    out.set(name, 2);
    if (payload && payload.length) out.set(payload, 2 + name.length);
    return out;
}

function encodeOpen(ch: string, urlPath: string): Uint8Array {
    return encodeFrame(FT_OPEN, ch, new TextEncoder().encode(urlPath));
}

function encodeClose(ch: string, code?: number, reason?: string): Uint8Array {
    const reasonBytes = new TextEncoder().encode(reason || "");
    const payload = new Uint8Array(2 + reasonBytes.length);
    new DataView(payload.buffer).setUint16(0, (code ?? 1000) & 0xffff, true);
    payload.set(reasonBytes, 2);
    return encodeFrame(FT_CLOSE, ch, payload);
}

interface ParsedFrame { type: number; ch: string; payload: Uint8Array }

function parseFrame(buf: Uint8Array): ParsedFrame | null {
    if (buf.length < 2) return null;
    const type = buf[0];
    const nlen = buf[1];
    if (buf.length < 2 + nlen) return null;
    const ch = new TextDecoder("utf-8").decode(buf.subarray(2, 2 + nlen));
    const payload = buf.subarray(2 + nlen);
    return { type, ch, payload };
}

class MuxCarrier {
    private ws: WebSocket | null = null;
    private connecting: Promise<WebSocket> | null = null;
    private channels = new Map<string, MuxChannel>();
    private backoff = 500;

    private url(): string {
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${window.location.host}/exocore/ws`;
    }

    private connect(): Promise<WebSocket> {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws);
        if (this.connecting) return this.connecting;

        this.connecting = new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(this.url());
            ws.binaryType = "arraybuffer";

            const t = window.setTimeout(() => {
                try { ws.close(); } catch {}
                reject(new Error("mux carrier connect timeout"));
            }, 8000);

            ws.onopen = () => {
                window.clearTimeout(t);
                this.ws = ws;
                this.connecting = null;
                this.backoff = 500;
                resolve(ws);
            };
            ws.onerror = () => {
                window.clearTimeout(t);
                this.connecting = null;
                reject(new Error("mux carrier websocket error"));
            };
            ws.onclose = () => {
                this.ws = null;
                this.connecting = null;
                for (const [, ch] of this.channels) ch._markClosed(1006, "carrier closed");
                this.channels.clear();
            };
            ws.onmessage = (ev) => {
                if (!(ev.data instanceof ArrayBuffer)) return;
                const m = parseFrame(new Uint8Array(ev.data));
                if (!m) return;
                const ch = this.channels.get(m.ch);
                if (!ch) return;
                if (m.type === FT_DATA) {
                    ch._deliverMessage(m.payload);
                } else if (m.type === FT_CLOSE) {
                    this.channels.delete(m.ch);
                    const code = m.payload.length >= 2
                        ? new DataView(m.payload.buffer, m.payload.byteOffset).getUint16(0, true)
                        : 1000;
                    const reason = m.payload.length > 2
                        ? new TextDecoder("utf-8").decode(m.payload.subarray(2))
                        : "";
                    ch._markClosed(code, reason);
                }
            };
        });

        return this.connecting.catch((e) => {
            const wait = this.backoff;
            this.backoff = Math.min(this.backoff * 2, 15_000);
            setTimeout(() => { /* next caller retries */ }, wait);
            throw e;
        });
    }

    private sendBytes(bytes: Uint8Array): void {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try { ws.send(bytes); } catch {}
    }

    /** Open (or reuse, if already open) a multiplexed channel. Returns a
     *  `WebSocket`-shaped adapter immediately — assign onopen/onmessage on
     *  it like a real socket; the open event fires once the carrier and the
     *  channel are live. `urlPath` is forwarded as the synthetic request
     *  URL on the server side, useful for hubs that read query params
     *  (e.g. `?token=…`). */
    /** Open a fresh, uniquely-keyed channel against `hubName` (e.g. one
     *  per terminal tab). Server-side routes by the prefix before `#`. */
    openChannelInstance(hubName: string, urlPath?: string): MuxChannel {
        const id = (typeof crypto !== "undefined" && (crypto as any).randomUUID
            ? (crypto as any).randomUUID()
            : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
        return this.openChannel(`${hubName}#${id}`, urlPath);
    }

    openChannel(name: string, urlPath?: string): MuxChannel {
        const existing = this.channels.get(name);
        if (existing && existing.readyState <= 1) return existing;

        const pending: Uint8Array[] = [];
        let opened = false;
        const path = urlPath || `/${name}`;

        const ch = new MuxChannel(
            name,
            (bytes) => {
                if (!opened) { pending.push(bytes); return; }
                this.sendBytes(encodeFrame(FT_DATA, name, bytes));
            },
            (code, reason) => {
                this.channels.delete(name);
                this.sendBytes(encodeClose(name, code, reason));
            },
        );
        this.channels.set(name, ch);

        this.connect().then(() => {
            this.sendBytes(encodeOpen(name, path));
            opened = true;
            for (const b of pending) this.sendBytes(encodeFrame(FT_DATA, name, b));
            pending.length = 0;
            ch._markOpen();
        }).catch(() => {
            this.channels.delete(name);
            ch._markClosed(1006, "carrier connect failed");
        });

        return ch;
    }
}

export const muxCarrier = new MuxCarrier();
