import { encode, decode } from "@msgpack/msgpack";
import { muxCarrier, MuxChannel } from "./wsMux";

type Frame = { t: string; d?: unknown; id?: string };

export interface RpcCallOptions {
    token?: string;
    timeoutMs?: number;
}

class RpcClient {
    private ws: MuxChannel | null = null;
    private connecting: Promise<MuxChannel> | null = null;
    private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: number }>();
    private idCounter = 0;
    private currentToken = "";

    private channelUrl(token: string): string {
        const qs = token ? `?token=${encodeURIComponent(token)}` : "";
        return `/exocore/ws/rpc${qs}`;
    }

    private connect(token: string): Promise<MuxChannel> {
        if (this.ws && this.ws.readyState === 1 && this.currentToken === token) {
            return Promise.resolve(this.ws);
        }
        if (this.connecting && this.currentToken === token) return this.connecting;
        try { this.ws?.close(); } catch {}
        this.currentToken = token;

        const ch = muxCarrier.openChannel("rpc", this.channelUrl(token));
        ch.binaryType = "arraybuffer";
        ch.onmessage = (ev) => this.onMessage(ev);
        ch.onclose = () => {
            if (this.ws === ch) this.ws = null;
            for (const [, p] of this.pending) {
                window.clearTimeout(p.timer);
                p.reject(new Error("RPC connection closed"));
            }
            this.pending.clear();
        };
        this.ws = ch;

        this.connecting = new Promise<MuxChannel>((resolve, reject) => {
            const t = window.setTimeout(() => {
                ch.onopen = null;
                reject(new Error("RPC connect timeout"));
            }, 8000);
            ch.onopen = () => {
                window.clearTimeout(t);
                this.connecting = null;
                resolve(ch);
            };
        });
        return this.connecting;
    }

    private streams = new Map<string, {
        method: string;
        opened: boolean;
        openResolve?: (v: void) => void;
        openReject?: (e: Error) => void;
        openTimer?: number;
        onData: Set<(d: any) => void>;
        onClose: Set<(reason?: string) => void>;
    }>();

    private onMessage(ev: MessageEvent): void {
        let frame: Frame | null = null;
        try {
            const buf = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : new Uint8Array(0);
            frame = decode(buf) as Frame;
        } catch { return; }
        if (!frame || !frame.id) return;

        // Stream-protocol frames first (id maps into this.streams)
        const s = this.streams.get(frame.id);
        if (s) {
            if (frame.t === "rpc:open:ok") {
                s.opened = true;
                if (s.openTimer) window.clearTimeout(s.openTimer);
                s.openResolve?.();
                return;
            }
            if (frame.t === "rpc:open:err") {
                if (s.openTimer) window.clearTimeout(s.openTimer);
                const err = frame.d as { message?: string } | undefined;
                s.openReject?.(new Error(err?.message || "stream open failed"));
                this.streams.delete(frame.id);
                return;
            }
            if (frame.t === "rpc:data") {
                for (const cb of s.onData) { try { cb(frame.d); } catch {} }
                return;
            }
            if (frame.t === "rpc:close") {
                const reason = (frame.d as any)?.reason;
                for (const cb of s.onClose) { try { cb(reason); } catch {} }
                this.streams.delete(frame.id);
                return;
            }
        }

        const p = this.pending.get(frame.id);
        if (!p) return;
        this.pending.delete(frame.id);
        window.clearTimeout(p.timer);

        if (frame.t === "rpc:ok") {
            p.resolve((frame.d as any)?.result);
        } else if (frame.t === "rpc:err") {
            const err = frame.d as { message?: string; status?: number; data?: any } | undefined;
            const e = new Error(err?.message || "rpc error") as Error & { status?: number; data?: any };
            e.status = err?.status;
            e.data = err?.data;
            p.reject(e);
        } else {
            p.resolve(frame.d);
        }
    }

    async call<T = any>(method: string, data?: unknown, opts: RpcCallOptions = {}): Promise<T> {
        const token = opts.token ?? localStorage.getItem("exo_token") ?? "";
        const ws = await this.connect(token);
        const id = `r${++this.idCounter}_${Date.now().toString(36)}`;
        const timeoutMs = opts.timeoutMs ?? 20000;

        return new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`RPC '${method}' timed out`));
            }, timeoutMs);

            this.pending.set(id, { resolve, reject, timer });
            try {
                const frame: Frame = { t: method, d: data, id };
                ws.send(encode(frame));
            } catch (e: any) {
                this.pending.delete(id);
                window.clearTimeout(timer);
                reject(new Error(e?.message || "send failed"));
            }
        });
    }

    async stream(method: string, params?: unknown, opts: RpcCallOptions = {}): Promise<RpcStream> {
        const token = opts.token ?? localStorage.getItem("exo_token") ?? "";
        const ws = await this.connect(token);
        const id = `s${++this.idCounter}_${Date.now().toString(36)}`;
        const timeoutMs = opts.timeoutMs ?? 20000;

        const entry = {
            method,
            opened: false,
            onData: new Set<(d: any) => void>(),
            onClose: new Set<(reason?: string) => void>(),
        } as any;
        this.streams.set(id, entry);

        await new Promise<void>((resolve, reject) => {
            entry.openResolve = resolve;
            entry.openReject = reject;
            entry.openTimer = window.setTimeout(() => {
                this.streams.delete(id);
                reject(new Error(`stream '${method}' open timed out`));
            }, timeoutMs);
            try {
                ws.send(encode({ t: "rpc:open", d: { method, params }, id }));
            } catch (e: any) {
                if (entry.openTimer) window.clearTimeout(entry.openTimer);
                this.streams.delete(id);
                reject(new Error(e?.message || "send failed"));
            }
        });

        const sock = ws;
        const handle: RpcStream = {
            id,
            send: (payload: unknown) => {
                if (!this.streams.has(id)) return;
                try { sock.send(encode({ t: "rpc:data", d: payload, id })); } catch {}
            },
            onData: (cb) => {
                entry.onData.add(cb);
                return () => entry.onData.delete(cb);
            },
            onClose: (cb) => {
                entry.onClose.add(cb);
                return () => entry.onClose.delete(cb);
            },
            close: (reason?: string) => {
                if (!this.streams.has(id)) return;
                try { sock.send(encode({ t: "rpc:close", d: { reason }, id })); } catch {}
                const e = this.streams.get(id);
                if (e) for (const cb of e.onClose) { try { cb(reason); } catch {} }
                this.streams.delete(id);
            },
        };
        return handle;
    }

    close(): void {
        try { this.ws?.close(); } catch {}
        this.ws = null;
    }
}

export interface RpcStream {
    id: string;
    send: (payload: unknown) => void;
    onData: (cb: (data: any) => void) => () => void;
    onClose: (cb: (reason?: string) => void) => () => void;
    close: (reason?: string) => void;
}

export const rpc = new RpcClient();

/** Convert a browser File into the `{ name, type, bytes }` shape that the
 *  RPC server expects for binary upload fields. msgpack encodes Uint8Array
 *  as a native binary frame, so the bytes travel over WSS without base64. */
export async function rpcFile(file: File): Promise<{ name: string; type: string; bytes: Uint8Array }> {
    const buf = await file.arrayBuffer();
    return { name: file.name, type: file.type || "application/octet-stream", bytes: new Uint8Array(buf) };
}
