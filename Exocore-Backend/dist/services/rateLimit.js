"use strict";
/** Phase 6 — token-bucket rate limiter, used by the gateway hub for
 *  chat:send and dm:send. Each (key, bucket) refills at `refillPerMs`
 *  up to `capacity`. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBucket = void 0;
class TokenBucket {
    capacity;
    refillPerMs;
    map = new Map();
    constructor(capacity, refillPerMs) {
        this.capacity = capacity;
        this.refillPerMs = refillPerMs;
    }
    /** Returns `true` if the request is allowed (and consumes 1 token). */
    take(key) {
        const now = Date.now();
        const b = this.map.get(key) ?? { tokens: this.capacity, last: now };
        const elapsed = now - b.last;
        b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerMs);
        b.last = now;
        if (b.tokens < 1) {
            this.map.set(key, b);
            return false;
        }
        b.tokens -= 1;
        this.map.set(key, b);
        return true;
    }
}
exports.TokenBucket = TokenBucket;
