import { EventEmitter } from "events";
import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";

/** A WebSocket-shaped object that the existing social/rpc hubs can drive
 *  unchanged. Sends/closes go through the mux carrier with a channel tag. */
class MuxedSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = 1;
    binaryType: "nodebuffer" | "arraybuffer" = "nodebuffer";

    constructor(
        private readonly _send: (buf: Uint8Array) => void,
        private readonly _close: (code?: number, reason?: string) => void,
    ) { super(); }

    send(data: any): void {
        if (this.readyState !== 1) return;
        let buf: Uint8Array;
        if (data instanceof Uint8Array) buf = data;
        else if (Buffer.isBuffer(data)) buf = data;
        else if (typeof data === "string") buf = Buffer.from(data, "utf-8");
        else if (data instanceof ArrayBuffer) buf = new Uint8Array(data);
        else buf = Buffer.from(String(data));
        this._send(buf);
    }

    close(code?: number, reason?: string): void {
        if (this.readyState >= 2) return;
        this.readyState = 3;
        try { this._close(code, reason); } catch {}
        this.emit("close", code ?? 1000, Buffer.from(reason || ""));
    }

    /** App-level ping (msgpack frame) is handled by each hub; the WS-level
     *  ping/pong is run by the carrier socket itself. No-op here. */
    ping(): void { /* noop */ }
    terminate(): void { this.close(1006, "terminated"); }
}

/** Compact carrier wire format (binary frames only):
 *
 *    +------+------+------------+----------------+
 *    | type | nlen | name (N B) | payload (rest) |
 *    +------+------+------------+----------------+
 *
 *  type:  1 = open, 2 = data, 3 = close
 *  nlen:  channel-name length in bytes (UTF-8, ≤255)
 *  payload:
 *    open  → URL string (UTF-8) for the synthetic req.url
 *    data  → opaque inner frame bytes (already msgpack from the hub)
 *    close → 2-byte LE close code, then UTF-8 reason (rest of frame)
 *
 *  Replaces the previous msgpack-wrapped envelope. Saves ~5 bytes per
 *  data frame and one decode/encode pass per direction.                */
const FT_OPEN = 1;
const FT_DATA = 2;
const FT_CLOSE = 3;

function encodeFrame(type: number, ch: string, payload?: Uint8Array): Buffer {
    const name = Buffer.from(ch, "utf-8");
    if (name.length > 255) throw new Error("channel name too long");
    const out = Buffer.allocUnsafe(2 + name.length + (payload?.length ?? 0));
    out[0] = type;
    out[1] = name.length;
    name.copy(out, 2);
    if (payload && payload.length) Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).copy(out, 2 + name.length);
    return out;
}

function encodeClose(ch: string, code?: number, reason?: string): Buffer {
    const reasonBuf = Buffer.from(reason || "", "utf-8");
    const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
    payload.writeUInt16LE((code ?? 1000) & 0xffff, 0);
    reasonBuf.copy(payload, 2);
    return encodeFrame(FT_CLOSE, ch, payload);
}

interface ParsedFrame {
    type: number;
    ch: string;
    payload: Buffer;
}

function parseFrame(buf: Buffer): ParsedFrame | null {
    if (buf.length < 2) return null;
    const type = buf[0];
    const nlen = buf[1];
    if (buf.length < 2 + nlen) return null;
    const ch = buf.toString("utf-8", 2, 2 + nlen);
    const payload = buf.subarray(2 + nlen);
    return { type, ch, payload };
}

/** Build a multiplexed WSS carrier. Returns the underlying `WebSocketServer`
 *  (in noServer mode) so the caller can wire it into its own upgrade
 *  dispatcher — keeps the mux from fighting other listeners that might
 *  `socket.destroy()` unknown paths. The carrier hands each named channel
 *  off to one of the supplied `WebSocketServer`s (e.g. the existing
 *  social/rpc hubs) without modifying them. */
export function createMuxWss(hubs: Record<string, WebSocketServer>): WebSocketServer {
    const carrierWss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });

    carrierWss.on("connection", (carrier: WebSocket, req: IncomingMessage) => {
        const channels = new Map<string, MuxedSocket>();

        const sendRaw = (frame: Buffer) => {
            if (carrier.readyState !== WebSocket.OPEN) return;
            try { carrier.send(frame); } catch {}
        };

        // Carrier-level keepalive — drops dead TCP connections.
        let alive = true;
        const ping = setInterval(() => {
            if (!alive) { try { carrier.terminate(); } catch {} return; }
            alive = false;
            try { carrier.ping(); } catch {}
        }, 30_000);
        carrier.on("pong", () => { alive = true; });

        carrier.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
            const buf = Array.isArray(raw)
                ? Buffer.concat(raw)
                : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
            const m = parseFrame(buf);
            if (!m) return;

            // Channel keys are `hubName` or `hubName#instance` — the hash
            // suffix lets multiple parallel sockets share one hub (e.g.
            // many terminal tabs at once). The hash is server-opaque.
            const hashAt = m.ch.indexOf("#");
            const hubName = hashAt < 0 ? m.ch : m.ch.slice(0, hashAt);
            const hub = hubs[hubName];
            if (!hub) return;

            if (m.type === FT_OPEN) {
                if (channels.has(m.ch)) return;
                const synthReq = Object.create(req) as IncomingMessage;
                (synthReq as any).url = m.payload.length ? m.payload.toString("utf-8") : `/${m.ch}`;
                const fake = new MuxedSocket(
                    (bytes) => sendRaw(encodeFrame(FT_DATA, m.ch, bytes)),
                    (code, reason) => sendRaw(encodeClose(m.ch, code, reason)),
                );
                channels.set(m.ch, fake);
                hub.emit("connection", fake as unknown as WebSocket, synthReq);
                return;
            }

            const fake = channels.get(m.ch);
            if (!fake) return;

            if (m.type === FT_DATA) {
                fake.emit("message", m.payload, true);
                return;
            }

            if (m.type === FT_CLOSE) {
                channels.delete(m.ch);
                const code = m.payload.length >= 2 ? m.payload.readUInt16LE(0) : 1000;
                const reason = m.payload.length > 2 ? m.payload.toString("utf-8", 2) : "";
                if (fake.readyState < 3) {
                    fake.readyState = 3;
                    fake.emit("close", code, Buffer.from(reason));
                }
                return;
            }
        });

        const teardown = () => {
            clearInterval(ping);
            for (const [ch, fake] of channels) {
                if (fake.readyState < 3) {
                    fake.readyState = 3;
                    fake.emit("close", 1006, Buffer.from("carrier closed"));
                }
                channels.delete(ch);
            }
        };
        carrier.on("close", teardown);
        carrier.on("error", teardown);
    });

    console.log(`🔀 WSS mux ready (channels: ${Object.keys(hubs).join(", ")}) [raw framing]`);
    return carrierWss;
}
