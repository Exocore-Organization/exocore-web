import axios from 'axios';
import { get as idbGet, set as idbSet } from 'idb-keyval';

const TOKEN_KEY = 'exocore_panel_token';

// In-memory cache so axios interceptors stay synchronous after the first load.
let cachedToken: string | null = null;
let bootstrapPromise: Promise<string | null> | null = null;

async function loadTokenFromStorage(): Promise<string | null> {
    try {
        // One-time migration from legacy localStorage → IndexedDB.
        try {
            const legacy = typeof localStorage !== 'undefined'
                ? localStorage.getItem(TOKEN_KEY)
                : null;
            if (legacy) {
                await idbSet(TOKEN_KEY, legacy);
                try { localStorage.removeItem(TOKEN_KEY); } catch {}
            }
        } catch {}
        const tok = await idbGet<string>(TOKEN_KEY);
        cachedToken = tok ?? null;
        // NOTE: Do NOT set axios.defaults.headers.common['Authorization'] here.
        // That would leak the Bearer token to EVERY axios call site-wide,
        // including external hosts like registry.npmjs.org, which then trigger
        // CORS preflight failures. The request interceptor below scopes the
        // header to /exocore/api/* only.
        return cachedToken;
    } catch {
        return null;
    }
}

export function setPanelToken(token: string | null): void {
    cachedToken = token;
    // Defensive: clear any stale global default that older code may have set,
    // so the token is only ever attached by the scoped interceptor below.
    if (axios.defaults.headers.common['Authorization']) {
        delete axios.defaults.headers.common['Authorization'];
    }
}

export async function getPanelToken(): Promise<string | null> {
    if (cachedToken) return cachedToken;
    if (!bootstrapPromise) bootstrapPromise = loadTokenFromStorage();
    return bootstrapPromise;
}

export async function panelAuthHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const tok = await getPanelToken();
    const headers: Record<string, string> = { ...extra };
    if (tok) headers['Authorization'] = `Bearer ${tok}`;
    return headers;
}

// ---------------------------------------------------------------------------
// Global axios setup — runs on first import of this module.
//
// Without this, lazy-loaded routes like /editor can fire their axios.get()
// requests BEFORE the panel gate's async IndexedDB bootstrap finishes, which
// produces an intermittent 401 "Panel authentication required." The async
// request interceptor below makes EVERY axios call await the token lookup
// (instant after the first one, thanks to the in-memory cache) and stamp the
// Authorization header — so it is impossible for an /exocore/api/* call to
// race ahead of the auth setup, regardless of load order.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
    // Kick off the bootstrap immediately so the cache is warm by the time
    // most components mount.
    void getPanelToken();

    axios.interceptors.request.use(async (config) => {
        const url = (config.url || '').toString();
        // Only attach the panel token to our own backend calls.
        if (!url.startsWith('/exocore/api/') && !url.includes('/exocore/api/')) {
            return config;
        }
        const tok = await getPanelToken();
        if (tok) {
            config.headers = config.headers ?? {};
            // Don't override an explicit override the caller passed in.
            const existing =
                (config.headers as Record<string, unknown>)['Authorization'] ??
                (config.headers as Record<string, unknown>)['authorization'];
            if (!existing) {
                (config.headers as Record<string, string>)['Authorization'] = `Bearer ${tok}`;
            }
        }
        return config;
    });
}
