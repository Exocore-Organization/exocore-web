import { encode, decode } from "@msgpack/msgpack";

export interface Frame<T = unknown> {
  t: string;        // event type, e.g. "chat:msg", "presence:list"
  d?: T;            // payload
  id?: string;      // optional correlation id
  ts?: number;      // server timestamp
}

export function packFrame(f: Frame): Buffer {
  const ts = f.ts ?? Date.now();
  return Buffer.from(encode({ ...f, ts }));
}

export function unpackFrame(buf: ArrayBuffer | Uint8Array | Buffer): Frame | null {
  try {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    const obj = decode(u8) as Frame;
    if (!obj || typeof obj !== "object" || typeof obj.t !== "string") return null;
    return obj;
  } catch {
    return null;
  }
}
