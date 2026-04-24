/* Bridge to the self-hosted Meta AI Flask API at
 * https://exocore-llama.hf.space (see project README for endpoints).
 *
 * Every call is stateless: the caller's meta.ai cookies are forwarded on
 * each request. We expose a small TypeScript surface that the editor's
 * AI route (exocore-web/routes/editor/ai.ts) consumes.
 */

import axios, { AxiosError, AxiosRequestConfig } from "axios";

export type CookieMap = Record<string, string>;

// All meta endpoints on the Flask wrapper live under the /meta/* prefix
// (e.g. /meta/chat, /meta/cookies/check). Hardcoding the prefix here lets
// every call site stay terse.
const BASE_URL = (process.env.EXOCORE_LLAMA_BASE_URL || "https://exocore-llama.hf.space").replace(/\/+$/, "") + "/meta";
const DEFAULT_TIMEOUT = 120_000;

/* The Meta AI bridge sometimes responds without a proper `charset=utf-8`
 * Content-Type, which makes Node's default JSON decoder treat multi-byte
 * UTF-8 sequences as Latin-1 — every emoji and accented character then
 * arrives in the panel as mojibake (e.g. "👋" → "ð"). Forcing the response
 * into a raw buffer and decoding with TextDecoder fixes that for every
 * endpoint without changing the upstream service. */
const utf8Decoder = new TextDecoder("utf-8");
function utf8JsonConfig(extra: AxiosRequestConfig = {}): AxiosRequestConfig {
    return {
        ...extra,
        responseType: "arraybuffer",
        transformResponse: [
            (raw) => {
                if (!raw) return raw;
                const buf = raw instanceof ArrayBuffer
                    ? new Uint8Array(raw)
                    : (raw as Buffer);
                const text = utf8Decoder.decode(buf as any);
                try { return JSON.parse(text); } catch { return text; }
            },
        ],
    };
}

interface ChatArgs {
    prompt: string;
    system?: string;
    cookies: CookieMap;
    newConversation?: boolean;
    /* Pin the upstream conversation so we don't spam meta.ai with a brand
     * new conversation per message. The bridge accepts `conversation_id`
     * and reuses that thread for every subsequent reply. */
    conversationId?: string;
    /* Reasoning mode: "think_fast" for instant replies (default) or
     * "think_hard" for extended thinking. The bridge also accepts
     * "thinking" / "instant" / "CHAT" / "IMAGINE" as aliases. */
    mode?: "think_fast" | "think_hard" | "thinking" | "instant" | "CHAT" | "IMAGINE";
}
interface ChatResult {
    reply: string;
    conversationId?: string;
    accessToken?: string;
}

interface ImageArgs {
    prompt: string;
    cookies: CookieMap;
    orientation?: "LANDSCAPE" | "VERTICAL" | "SQUARE";
}
interface ImageResult {
    images: string[];
    conversationId?: string;
}

interface DeleteArgs {
    cookies: CookieMap;
    conversationId: string;
    accessToken?: string;
}
interface DeleteResult {
    success: boolean;
    raw: any;
}

interface PerCookieReport {
    [name: string]: { ok: boolean; reason?: string };
}
interface FindCookiesResult {
    working: CookieMap;
    perCookie: PerCookieReport;
}

/* Helper: turn an axios error into a clean Error message. The Flask API
 * returns useful JSON detail in the body, so we surface that when present. */
function asError(err: unknown, fallback: string): Error {
    const ax = err as AxiosError<any>;
    if (ax?.response) {
        const body = ax.response.data;
        const detail = typeof body === "string"
            ? body
            : (body?.detail || body?.error || JSON.stringify(body));
        return new Error(`${fallback} (${ax.response.status}): ${detail}`);
    }
    if (ax?.message) return new Error(`${fallback}: ${ax.message}`);
    return new Error(fallback);
}

/* POST /chat — Meta AI exposes only `message`, so when the caller supplies
 * a `system` prompt we prepend it to the user message.
 *
 * IMPORTANT — convo id stickiness:
 *   The upstream Flask bridge spawns a brand-new conversation whenever it
 *   sees `new_conversation: true` OR when no convo id is supplied. Sending
 *   `new_conversation: false` AND a convo id together has been observed to
 *   STILL spawn a new convo on meta.ai (the boolean wins), which is what
 *   was producing the duplicate "Quick Hello" entries in the screenshot.
 *
 *   Fix: only include `new_conversation` when we explicitly want a fresh
 *   convo. When reusing, send both `id` AND `conversation_id` (the bridge
 *   reads `body.get("id") or body.get("conversation_id")`) and OMIT
 *   `new_conversation` entirely. */
export async function chat(args: ChatArgs): Promise<ChatResult> {
    const message = args.system
        ? `${args.system}\n\n${args.prompt}`
        : args.prompt;
    try {
        const body: Record<string, unknown> = {
            message,
            cookies: args.cookies,
        };
        if (args.newConversation || !args.conversationId) {
            body.new_conversation = true;
        } else {
            body.id = args.conversationId;
            body.conversation_id = args.conversationId;
        }
        if (args.mode) body.mode = args.mode;
        const r = await axios.post(
            `${BASE_URL}/chat`,
            body,
            utf8JsonConfig({ timeout: DEFAULT_TIMEOUT }),
        );
        const data = r.data || {};
        const resp = data.response || {};
        return {
            reply: typeof resp.message === "string"
                ? resp.message
                : (typeof data.message === "string" ? data.message : ""),
            conversationId: resp.conversation_id || data.conversation_id,
            accessToken: resp.access_token || data.access_token,
        };
    } catch (err) {
        throw asError(err, "chat_failed");
    }
}

/* POST /image — returns up to 4 image URLs. */
export async function image(args: ImageArgs): Promise<ImageResult> {
    try {
        const r = await axios.post(
            `${BASE_URL}/image`,
            {
                prompt: args.prompt,
                orientation: args.orientation || "SQUARE",
                cookies: args.cookies,
            },
            utf8JsonConfig({ timeout: DEFAULT_TIMEOUT * 2 }),
        );
        const data = r.data || {};
        const resp = data.response || {};
        const images: string[] = Array.isArray(data.image_urls)
            ? data.image_urls
            : Array.isArray(resp.image_urls)
                ? resp.image_urls
                : [];
        return {
            images,
            conversationId: resp.conversation_id || data.conversation_id,
        };
    } catch (err) {
        throw asError(err, "image_failed");
    }
}

/* POST /delete — wipes a single conversation by id. The bulk-cleanup
 * endpoint in ai.ts iterates this once per stored conversationId so the
 * whole chat session can be wiped in one go without breaking multi-turn
 * context mid-conversation. */
export async function deleteConversation(args: DeleteArgs): Promise<DeleteResult> {
    try {
        const r = await axios.post(
            `${BASE_URL}/delete`,
            {
                id: args.conversationId,
                cookies: args.cookies,
            },
            utf8JsonConfig({ timeout: 30_000 }),
        );
        const data = r.data || {};
        const ok = data.success === true
            || data?.data?.data?.deleteConversation?.success === true;
        return { success: !!ok, raw: data };
    } catch (err) {
        const wrapped = asError(err, "delete_failed");
        return { success: false, raw: { error: wrapped.message } };
    }
}

/* POST /cookies/check — figure out which of the supplied cookies actually
 * authenticate against meta.ai, then return only that working subset.
 * The Flask API reports two useful fields:
 *   - cookies_that_authenticate_alone: cookies that work on their own
 *   - cookies_that_appear_required:    cookies the auth flow needs
 * We union them to build the working set, and produce a per-cookie report
 * so the UI can show which tokens passed/failed. */
export async function findWorkingCookies(cookies: CookieMap): Promise<FindCookiesResult> {
    const empty: FindCookiesResult = {
        working: {},
        perCookie: Object.fromEntries(
            Object.keys(cookies).map((k) => [k, { ok: false, reason: "untested" }]),
        ),
    };

    try {
        const r = await axios.post(
            `${BASE_URL}/cookies/check`,
            { cookies },
            utf8JsonConfig({ timeout: 60_000 }),
        );
        const data = r.data || {};
        const summary = data.summary || {};

        const aloneList: string[] = Array.isArray(summary.cookies_that_authenticate_alone)
            ? summary.cookies_that_authenticate_alone
            : [];
        const requiredList: string[] = Array.isArray(summary.cookies_that_appear_required)
            ? summary.cookies_that_appear_required
            : [];

        const keep = new Set<string>([...aloneList, ...requiredList]);

        // If the full set authenticated but the breakdown is empty, fall
        // back to keeping every cookie the caller sent.
        if (keep.size === 0 && summary.authenticated_with_full_set === true) {
            Object.keys(cookies).forEach((k) => keep.add(k));
        }

        const working: CookieMap = {};
        const perCookie: PerCookieReport = {};
        for (const name of Object.keys(cookies)) {
            const ok = keep.has(name);
            if (ok) working[name] = cookies[name];
            perCookie[name] = ok
                ? { ok: true, reason: aloneList.includes(name) ? "authenticates_alone" : "required" }
                : { ok: false, reason: "not_required_for_auth" };
        }
        return { working, perCookie };
    } catch (err) {
        const wrapped = asError(err, "cookies_check_failed");
        empty.perCookie = Object.fromEntries(
            Object.keys(cookies).map((k) => [k, { ok: false, reason: wrapped.message }]),
        );
        return empty;
    }
}

/* POST /mode — switch a conversation between "CHAT" and "IMAGINE".
 * In IMAGINE mode every subsequent message in that conversation is treated
 * as an image-generation prompt by Meta AI; in CHAT mode the conversation
 * goes back to plain text replies. The conversation id stays the same. */
export type ConversationMode = "CHAT" | "IMAGINE" | "think_fast" | "think_hard";

export async function setMode(args: {
    cookies: CookieMap;
    conversationId: string;
    mode: ConversationMode;
}): Promise<{ success: boolean; raw: any }> {
    try {
        const r = await axios.post(
            `${BASE_URL}/mode`,
            { id: args.conversationId, mode: args.mode, cookies: args.cookies },
            utf8JsonConfig({ timeout: 30_000 }),
        );
        const data = r.data || {};
        const ok = data.success === true || data.ok === true
            || data?.data?.data?.updateConversationMode?.success === true;
        return { success: !!ok, raw: data };
    } catch (err) {
        const wrapped = asError(err, "mode_failed");
        return { success: false, raw: { error: wrapped.message } };
    }
}

/* POST /warmup — pre-warm a conversation so the next /chat reply has lower
 * first-token latency. Best-effort; failures should not block the caller. */
export async function warmup(args: {
    cookies: CookieMap;
    conversationId: string;
}): Promise<{ success: boolean; raw: any }> {
    try {
        const r = await axios.post(
            `${BASE_URL}/warmup`,
            { id: args.conversationId, cookies: args.cookies },
            utf8JsonConfig({ timeout: 30_000 }),
        );
        const data = r.data || {};
        const ok = data.success === true || data.ok === true
            || data?.data?.data?.conversationWarmup?.success === true;
        return { success: !!ok, raw: data };
    } catch (err) {
        const wrapped = asError(err, "warmup_failed");
        return { success: false, raw: { error: wrapped.message } };
    }
}

/* GET /conversations — list every conversation visible to the supplied
 * cookies. Used by reapToOne() below to enforce the "exactly one convo"
 * invariant. */
export interface ConvoSummary {
    id: string;
    title?: string;
    updatedAt?: number;
    raw: any;
}
export async function listConversations(cookies: CookieMap): Promise<ConvoSummary[]> {
    try {
        const qs = new URLSearchParams({ cookies: JSON.stringify(cookies) });
        const r = await axios.get(
            `${BASE_URL}/conversations?${qs.toString()}`,
            utf8JsonConfig({ timeout: 60_000 }),
        );
        const data = r.data || {};
        let raw: any[] = [];
        const candidate = data.conversations || data.data || data;
        if (Array.isArray(candidate)) raw = candidate;
        else if (candidate && Array.isArray(candidate.conversations)) raw = candidate.conversations;
        return raw
            .map((c: any) => {
                if (!c || typeof c !== "object") return null;
                const id = c.id || c.conversation_id;
                if (typeof id !== "string" || !id) return null;
                const ts = (() => {
                    for (const k of ["updated_time", "updated_at", "created_time", "created_at", "lastMessageTime"]) {
                        const v = c[k];
                        if (typeof v === "number") return v;
                        if (typeof v === "string") {
                            const n = Number(v);
                            if (Number.isFinite(n)) return n;
                            const d = Date.parse(v);
                            if (!isNaN(d)) return d;
                        }
                    }
                    return 0;
                })();
                return { id, title: c.title || c.name, updatedAt: ts, raw: c } as ConvoSummary;
            })
            .filter((x): x is ConvoSummary => x !== null);
    } catch {
        return [];
    }
}

/* Enforce the "single conversation" invariant after a chat round-trip.
 *
 * The upstream Flask bridge silently spawns a brand-new conversation on
 * meta.ai whenever its cached MetaAI client glitches (e.g. a doc_id
 * stream-parse error returns HTTP 500 and resets `external_conversation_id`
 * to None). Without intervention the user ends up with a graveyard of
 * "Quick Hello" / "Q5 ok" / etc. threads after only a handful of prompts.
 *
 * Strategy (proven by scripts/test_single_convo_reap.py against the live
 * service): after every chat, list the visible conversations, keep the
 * NEWEST one, and delete the rest. The newest is the one the user actually
 * cares about because it received the most recent reply. Returns the id of
 * the survivor so the caller can pin it for display. */
export async function reapToOne(cookies: CookieMap): Promise<string | undefined> {
    const convos = await listConversations(cookies);
    if (convos.length === 0) return undefined;
    convos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const keep = convos[0];
    await Promise.all(
        convos.slice(1).map((c) =>
            deleteConversation({ cookies, conversationId: c.id }).catch(() => undefined),
        ),
    );
    return keep.id;
}

export default { chat, image, deleteConversation, findWorkingCookies, setMode, warmup, listConversations, reapToOne };
