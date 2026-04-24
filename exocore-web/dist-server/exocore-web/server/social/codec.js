"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.packFrame = packFrame;
exports.unpackFrame = unpackFrame;
const msgpack_1 = require("@msgpack/msgpack");
function packFrame(f) {
    const ts = f.ts ?? Date.now();
    return Buffer.from((0, msgpack_1.encode)({ ...f, ts }));
}
function unpackFrame(buf) {
    try {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const obj = (0, msgpack_1.decode)(u8);
        if (!obj || typeof obj !== "object" || typeof obj.t !== "string")
            return null;
        return obj;
    }
    catch {
        return null;
    }
}
