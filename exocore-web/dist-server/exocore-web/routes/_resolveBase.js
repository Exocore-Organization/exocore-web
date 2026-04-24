"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBaseUrl = resolveBaseUrl;
exports.clearResolvedCache = clearResolvedCache;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
let cached = null;
const TTL_MS = 30_000;
function loadCfg() {
    const p = path_1.default.join(__dirname, "urlData.json");
    return JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
}
async function probe(url) {
    try {
        const r = await axios_1.default.get(url, { timeout: 1500, validateStatus: () => true });
        return r.status >= 200 && r.status < 500;
    }
    catch {
        return false;
    }
}
/**
 * Resolves the upstream backend base URL.
 * - If config has `local` and `preferLocal: true` AND that URL is reachable, use it.
 * - Else fetch the remote feed (URL) and return its `.link` field.
 * - Else fall back to `local` if defined, else throw.
 */
async function resolveBaseUrl() {
    if (cached && cached.expires > Date.now())
        return cached.base;
    const cfg = loadCfg();
    let base = null;
    if (cfg.local && cfg.preferLocal) {
        if (await probe(cfg.local))
            base = cfg.local;
    }
    if (!base && cfg.URL) {
        try {
            const r = await axios_1.default.get(`${cfg.URL}?cache=${Date.now()}`, { timeout: 4000 });
            if (typeof r.data === "object" && r.data && typeof r.data.link === "string") {
                base = r.data.link;
            }
            else if (typeof r.data === "string" && /^https?:\/\//.test(r.data.trim())) {
                base = r.data.trim();
            }
        }
        catch {
            /* fall through */
        }
    }
    if (!base && cfg.local)
        base = cfg.local;
    if (!base)
        throw new Error("No backend URL could be resolved");
    base = base.replace(/\/$/, "");
    cached = { base, expires: Date.now() + TTL_MS };
    return base;
}
function clearResolvedCache() {
    cached = null;
}
