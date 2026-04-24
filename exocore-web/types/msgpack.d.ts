declare module "@msgpack/msgpack" {
    export function encode(value: unknown, options?: Record<string, unknown>): Uint8Array;
    export function decode(buffer: ArrayBuffer | Uint8Array | Buffer, options?: Record<string, unknown>): any;
    export function decodeAsync(stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>, options?: Record<string, unknown>): Promise<any>;
    export class Encoder { encode(value: unknown): Uint8Array; }
    export class Decoder { decode(buffer: ArrayBuffer | Uint8Array | Buffer): any; }
}
