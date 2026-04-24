"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiRoute = void 0;
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const metaAi_1 = require("../../scripts/metaAi");
/* AI bridge routes (mounted at /exocore/api/editor/ai).
 *
 * All AI calls are proxied through the Exocore Llama Flask API at
 *   https://exocore-llama.hf.space/
 *
 * The user pastes their meta.ai cookies once via /meta/cookies. The server
 * probes each cookie to keep only the ones that actually authenticate, then
 * forwards them on every subsequent /chat or /image call. */
class AiRoute {
    router;
    projectRoot;
    activeFile;
    sessionFile;
    projectsDir;
    /* Sticky conversation lock: while a chat is in flight we queue the next
     * one so we never spam Meta AI with parallel "new conversation" calls. */
    inFlight = null;
    constructor() {
        this.router = (0, express_1.Router)();
        this.projectRoot = path_1.default.resolve(__dirname, "..", "..", "..");
        this.activeFile = path_1.default.join(this.projectRoot, "config", "llama_active.json");
        this.sessionFile = path_1.default.join(this.projectRoot, "config", "llama_session.json");
        this.projectsDir = path_1.default.resolve(process.cwd(), "projects");
        this.router.get("/meta/status", this.status.bind(this));
        this.router.post("/meta", this.chat.bind(this));
        this.router.post("/meta/image", this.image.bind(this));
        this.router.post("/meta/agent", this.agent.bind(this));
        this.router.post("/meta/cookies", this.saveCookies.bind(this));
        this.router.get("/meta/cookies", this.getActiveCookieMeta.bind(this));
        this.router.delete("/meta/cookies", this.clearCookies.bind(this));
        this.router.post("/meta/delete-conversation", this.deleteConvo.bind(this));
        this.router.post("/meta/cleanup", this.cleanupConversations.bind(this));
        this.router.post("/meta/delete-all", this.deleteAll.bind(this));
        // New: sticky-session, mode, warmup, reset.
        this.router.get("/meta/session", this.getSession.bind(this));
        this.router.post("/meta/session/reset", this.resetSession.bind(this));
        this.router.post("/meta/session/create", this.createSession.bind(this));
        this.router.post("/meta/mode", this.changeMode.bind(this));
        this.router.post("/meta/warmup", this.warmupSession.bind(this));
        // Extra providers (Deep / Hez / Pixe) — same upstream Flask wrapper.
        this.router.post("/extra/:provider", this.extraChat.bind(this));
    }
    /* Generic chat passthrough for the additional Tapos AI namespaces:
     *   - /deep   (DeepAI, free, no creds)
     *   - /hez    (chat.z.ai GLM-5-Turbo, requires { token })
     *   - /pixe   (Perplexity AI, cookies optional)
     *
     * The client posts { prompt, token?, cookies? } and we forward the body
     * verbatim (renaming `prompt` → `message` so it matches the upstream
     * contract). The reply is normalized to { ok, reply, conversationId }. */
    async extraChat(req, res) {
        const ALLOWED = new Set(["deep", "hez", "pixe"]);
        const provider = String(req.params.provider || "").toLowerCase();
        if (!ALLOWED.has(provider)) {
            res.status(404).json({ ok: false, error: "unknown_provider" });
            return;
        }
        const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim()
            : typeof req.body?.message === "string" ? req.body.message.trim() : "";
        if (!prompt) {
            res.status(400).json({ ok: false, error: "empty_prompt" });
            return;
        }
        const upstream = { ...req.body, message: prompt };
        delete upstream.prompt;
        try {
            const axios = (await import("axios")).default;
            const base = process.env.EXOCORE_LLAMA_BASE_URL || "https://exocore-llama.hf.space";
            const r = await axios.post(`${base}/${provider}`, upstream, {
                timeout: 120_000,
                validateStatus: () => true,
            });
            const data = r.data || {};
            if (r.status >= 400) {
                res.status(r.status).json({
                    ok: false,
                    error: data.error || `${provider}_failed`,
                    detail: data.detail || data.error || `HTTP ${r.status}`,
                    raw: data,
                });
                return;
            }
            const reply = data.text || data.reply || data.message || data.answer
                || (typeof data === "string" ? data : "");
            res.json({
                ok: true,
                provider,
                reply,
                conversationId: data.conversation_id || data.conversationId || null,
                model: data.model || null,
                raw: data,
            });
        }
        catch (err) {
            const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || "request_failed";
            res.status(502).json({ ok: false, error: `${provider}_failed`, detail: String(detail) });
        }
    }
    /* Sticky-session helpers: persist ONE conversation id across requests so
     * we don't spam Meta AI with new conversations on every prompt. */
    loadSession() {
        if (!fs_1.default.existsSync(this.sessionFile))
            return {};
        try {
            return JSON.parse(fs_1.default.readFileSync(this.sessionFile, "utf-8")) || {};
        }
        catch {
            return {};
        }
    }
    saveSession(s) {
        const dir = path_1.default.dirname(this.sessionFile);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(this.sessionFile, JSON.stringify(s, null, 2));
    }
    clearSession() {
        try {
            if (fs_1.default.existsSync(this.sessionFile))
                fs_1.default.unlinkSync(this.sessionFile);
        }
        catch { }
    }
    loadCookies() {
        if (!fs_1.default.existsSync(this.activeFile))
            return null;
        try {
            const data = JSON.parse(fs_1.default.readFileSync(this.activeFile, "utf-8"));
            return (data?.cookies && typeof data.cookies === "object") ? data.cookies : null;
        }
        catch {
            return null;
        }
    }
    /* Cookies are now stored client-side in IndexedDB and forwarded on every
     * request body. We still fall back to the legacy server-side file so old
     * setups don't break, but new installs never write cookies to disk. */
    cookiesFromReq(req) {
        const fromBody = req?.body?.cookies;
        if (fromBody && typeof fromBody === "object" && !Array.isArray(fromBody)) {
            const cleaned = {};
            for (const [k, v] of Object.entries(fromBody)) {
                if (typeof v === "string" && v.length > 0)
                    cleaned[k] = v;
            }
            if (Object.keys(cleaned).length > 0)
                return cleaned;
        }
        return this.loadCookies();
    }
    saveActive(cookies, source, perCookie) {
        const dir = path_1.default.dirname(this.activeFile);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(this.activeFile, JSON.stringify({
            provider: "exocore-llama",
            source,
            base_url: "https://exocore-llama.hf.space",
            tested_at: new Date().toISOString(),
            cookies,
            per_cookie: perCookie || null,
        }, null, 2));
    }
    status(_req, res) {
        const cookies = this.loadCookies();
        res.json({
            ready: !!cookies,
            activeConfig: fs_1.default.existsSync(this.activeFile),
            engine: "exocore-llama",
            baseUrl: "https://exocore-llama.hf.space",
        });
    }
    getActiveCookieMeta(_req, res) {
        const cookies = this.loadCookies();
        if (!cookies) {
            res.json({ saved: false });
            return;
        }
        res.json({ saved: true, cookieNames: Object.keys(cookies) });
    }
    clearCookies(_req, res) {
        try {
            if (fs_1.default.existsSync(this.activeFile))
                fs_1.default.unlinkSync(this.activeFile);
        }
        catch { }
        res.json({ ok: true });
    }
    /* Save the user's cookies. We probe each one against /cookies/check + a
     * real /chat ping, then keep only the ones that authenticate. The client
     * gets back a per-cookie report so users see exactly which tokens worked. */
    async saveCookies(req, res) {
        const cookies = req.body?.cookies;
        if (!cookies || typeof cookies !== "object" || Array.isArray(cookies)) {
            res.status(400).json({ ok: false, error: "invalid_cookies", detail: "Body must be { cookies: { name: value, ... } }" });
            return;
        }
        try {
            // Detect which login flow the user came from based on cookie names.
            // meta.ai itself stores its session under .meta.ai cookies regardless
            // of whether the user signed in via Facebook or Instagram, but the
            // *names* of the auth carrier cookies differ:
            //   FB login: abra_sess, c_user, xs, fr, sb, presence
            //   IG login: i_user, ig_did, sessionid, ds_user_id, csrftoken (.instagram.com)
            //             plus abra_sess on .meta.ai once the OAuth handshake completes
            //   Common  : datr, dpr, ecto_1_sess, rd_challenge, wd  (anonymous fingerprint)
            const names = new Set(Object.keys(cookies));
            const FB_AUTH = ["abra_sess", "c_user", "xs", "fr"];
            const IG_AUTH = ["i_user", "sessionid", "ds_user_id", "ig_did"];
            const ANON_ONLY = ["datr", "dpr", "ecto_1_sess", "rd_challenge", "wd"];
            const hasFb = FB_AUTH.some((n) => names.has(n));
            const hasIg = IG_AUTH.some((n) => names.has(n));
            const onlyAnon = !hasFb && !hasIg && [...names].every((n) => ANON_ONLY.includes(n));
            const flow = hasIg && !hasFb ? "instagram" : hasFb && !hasIg ? "facebook" : hasFb && hasIg ? "both" : "none";
            const { working: probed, perCookie } = await (0, metaAi_1.findWorkingCookies)(cookies);
            // meta.ai (Apr 2026) update: the GraphQL probe used by
            // /cookies/check now returns "logged in" errors even for valid
            // sessions because meta requires a JS-derived OAuth header that
            // the probe doesn't generate. So if the probe says "no working
            // cookies" BUT the user has a long signed `ecto_1_sess` token
            // (the new session carrier), we skip the probe and trust the
            // real chat ping below to be the source of truth.
            const ectoVal = String(cookies.ecto_1_sess || "");
            const looksLikeSignedSession = ectoVal.length > 120 && ectoVal.includes("%3A");
            let working = probed;
            if (Object.keys(probed).length === 0) {
                if (looksLikeSignedSession) {
                    working = { ...cookies };
                }
                else {
                    const missing = onlyAnon
                        ? "You only pasted the anonymous fingerprint cookies (datr/dpr/ecto_1_sess/rd_challenge/wd) and ecto_1_sess looks too short to be a logged-in session. Send at least one message in meta.ai first, then re-export."
                        : flow === "instagram"
                            ? "Instagram cookies detected, but no working session was found. Open https://www.meta.ai, send one message, then re-export ALL .meta.ai cookies (DevTools → Application → Cookies)."
                            : flow === "facebook"
                                ? "Facebook cookies detected but did not authenticate. Make sure cookies are exported from .meta.ai after sending a message."
                                : "None of the provided cookies authenticated against meta.ai.";
                    res.status(401).json({
                        ok: false,
                        error: "no_working_cookies",
                        detail: missing,
                        detectedFlow: flow,
                        hint: {
                            instagram: "https://www.meta.ai → 'Continue with Instagram' → send one message → export ALL .meta.ai cookies.",
                            facebook: "https://www.meta.ai → 'Continue with Facebook' → send one message → export ALL .meta.ai cookies.",
                            verify_login: "Open https://www.meta.ai in Chromium — if you see the chatbox (not the login screen), your cookies are alive.",
                        },
                        perCookie,
                    });
                    return;
                }
            }
            // Refuse to save if no recognized auth carrier survived the probe.
            // This catches truncated abra_sess pastes (sino ang nag-truncate sa
            // export; or anonymous-only sets that somehow passed the upstream).
            const survived = new Set(Object.keys(working));
            // meta.ai (Apr 2026) update: for Instagram-linked sessions the
            // long signed `ecto_1_sess` token IS the session — `abra_sess`
            // is no longer issued. So we accept any of the historical
            // carriers OR a working `ecto_1_sess`.
            const hasAuthCarrier = survived.has("abra_sess") || survived.has("c_user") || survived.has("xs") ||
                survived.has("i_user") || survived.has("sessionid") || survived.has("ecto_1_sess");
            if (!hasAuthCarrier) {
                res.status(401).json({
                    ok: false,
                    error: "missing_auth_cookie",
                    detail: "No recognized auth cookie survived (need abra_sess, c_user, xs, i_user, sessionid, or ecto_1_sess). The export might be truncated — re-export the FULL value of each cookie.",
                    detectedFlow: flow,
                    perCookie,
                });
                return;
            }
            // Sanity check the surviving subset with a tiny chat. We DO NOT
            // persist cookies on the server anymore — the client owns them
            // in IndexedDB and forwards on every request for safety. We just
            // return the working subset so the UI can store it.
            const ping = await (0, metaAi_1.chat)({ prompt: "hi", cookies: working });
            if (ping.conversationId) {
                (0, metaAi_1.deleteConversation)({ cookies: working, conversationId: ping.conversationId, accessToken: ping.accessToken })
                    .catch(() => { });
            }
            res.json({
                ok: true,
                saved: false, // server-side storage is intentionally disabled
                cookies: working, // client persists this map to IndexedDB
                kept: Object.keys(working),
                perCookie,
                replyPreview: ping.reply.slice(0, 200),
            });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "test_failed", detail: String(err?.message || err) });
        }
    }
    async chat(req, res) {
        const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        const system = typeof req.body?.system === "string" ? req.body.system : undefined;
        const forceNew = req.body?.newConversation === true;
        const clientConvId = typeof req.body?.conversationId === "string" && req.body.conversationId
            ? req.body.conversationId
            : undefined;
        const rawMode = typeof req.body?.mode === "string" ? req.body.mode : "think_fast";
        // Default to think_fast (instant). Anything that looks like "thinking"
        // routes to think_hard. Unknown values are passed through so the
        // upstream can also accept CHAT/IMAGINE.
        const mode = (rawMode === "think_hard" || rawMode === "thinking")
            ? "think_hard"
            : rawMode === "think_fast" || rawMode === "instant"
                ? "think_fast"
                : rawMode;
        if (!prompt) {
            res.status(400).json({ ok: false, error: "empty_prompt" });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies", detail: "Paste meta.ai cookies in the AI panel first." });
            return;
        }
        // Sticky-session lock: if a previous chat is still running, wait for
        // it to finish before sending the next one. This prevents spawning a
        // brand new conversation per message and keeps the convo id stable.
        if (this.inFlight) {
            try {
                await this.inFlight;
            }
            catch { /* ignore previous failure */ }
        }
        // Pinned conversation id: the client owns it (IndexedDB), but we
        // keep a server-side fallback for legacy callers that don't pass one.
        const session = this.loadSession();
        const pinnedId = clientConvId || session.conversationId;
        const useNew = forceNew || !pinnedId;
        const task = (async () => {
            const result = await (0, metaAi_1.chat)({
                prompt, system, cookies,
                newConversation: useNew,
                conversationId: useNew ? undefined : pinnedId,
                mode,
            });
            if (result.conversationId && result.conversationId !== session.conversationId) {
                this.saveSession({ ...session, conversationId: result.conversationId });
            }
            return result;
        })();
        this.inFlight = task;
        try {
            const result = await task;
            // Single-convo invariant: after every chat, reap any orphan convos
            // the upstream may have spawned (it forks on cache glitches /
            // doc_id stream parse errors). Keeps exactly ONE thread visible
            // on meta.ai and surfaces its real id back to the client. Proven
            // by scripts/test_single_convo_reap.py against the live service.
            const survivor = await (0, metaAi_1.reapToOne)(cookies).catch(() => undefined);
            const finalId = survivor || result.conversationId || pinnedId;
            if (finalId && finalId !== session.conversationId) {
                this.saveSession({ ...this.loadSession(), conversationId: finalId });
            }
            res.json({
                ok: true,
                reply: result.reply,
                conversationId: finalId,
                sessionId: finalId,
                mode,
            });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "chat_failed", detail: String(err?.message || err) });
        }
        finally {
            if (this.inFlight === task)
                this.inFlight = null;
        }
    }
    getSession(_req, res) {
        const s = this.loadSession();
        res.json({ ok: true, conversationId: s.conversationId || null, mode: s.mode || "CHAT" });
    }
    /* Delete the pinned conversation on Meta AI and forget the local id.
     * Use this when the user wants to start fresh — much cheaper than
     * spamming new_conversation=true on every prompt. */
    async resetSession(req, res) {
        const cookies = this.cookiesFromReq(req);
        const s = this.loadSession();
        if (s.conversationId && cookies) {
            try {
                await (0, metaAi_1.deleteConversation)({ cookies, conversationId: s.conversationId });
            }
            catch { /* best-effort */ }
        }
        this.clearSession();
        res.json({ ok: true });
    }
    /* Explicitly bootstrap a single Meta AI conversation and return its id.
     * The user clicks "Create convo" once → we ping /chat with
     * new_conversation:true, capture the resulting id, persist it, and hand
     * it back so the client can pin it in IndexedDB. Every later prompt
     * reuses that same id, so meta.ai never sees duplicate "Quick Hello"
     * threads again. */
    async createSession(req, res) {
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies", detail: "Paste meta.ai cookies first." });
            return;
        }
        const seed = typeof req.body?.seed === "string" && req.body.seed.trim()
            ? req.body.seed.trim()
            : "ping";
        try {
            // Wipe whatever the user already has so we land on EXACTLY one
            // brand-new convo, then ping with new_conversation:true and reap
            // any extras the upstream spawned during the round-trip. The
            // Flask /chat doesn't return a conversation id, so we discover
            // the real id via /conversations after the ping.
            const before = await (0, metaAi_1.reapToOne)(cookies).catch(() => undefined);
            if (before) {
                try {
                    await (0, metaAi_1.deleteConversation)({ cookies, conversationId: before });
                }
                catch { /* best-effort */ }
            }
            const result = await (0, metaAi_1.chat)({
                prompt: seed,
                cookies,
                newConversation: true,
            });
            const id = (await (0, metaAi_1.reapToOne)(cookies).catch(() => undefined))
                || result.conversationId;
            if (!id) {
                res.status(502).json({ ok: false, error: "no_convo_id", detail: "Meta AI did not return a conversation id." });
                return;
            }
            this.saveSession({ ...this.loadSession(), conversationId: id });
            res.json({ ok: true, conversationId: id, sessionId: id, replyPreview: (result.reply || "").slice(0, 200) });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "create_failed", detail: String(err?.message || err) });
        }
    }
    /* Switch the pinned conversation between CHAT, IMAGINE, think_fast and
     * think_hard. CHAT/IMAGINE flip between text and image modes; think_fast
     * gives instant replies, think_hard turns on Meta AI's extended-reasoning
     * mode. The conversation id stays the same across all switches. */
    async changeMode(req, res) {
        const mode = req.body?.mode;
        const VALID = ["CHAT", "IMAGINE", "think_fast", "think_hard"];
        if (!mode || !VALID.includes(mode)) {
            res.status(400).json({ ok: false, error: "invalid_mode", detail: "mode must be CHAT, IMAGINE, think_fast or think_hard" });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        const s = this.loadSession();
        const id = (typeof req.body?.id === "string" && req.body.id) || s.conversationId;
        if (!id) {
            res.status(409).json({ ok: false, error: "no_session", detail: "No active conversation. Send a chat first." });
            return;
        }
        const r = await (0, metaAi_1.setMode)({ cookies, conversationId: id, mode });
        if (r.success)
            this.saveSession({ ...s, conversationId: id, mode });
        res.json({ ok: r.success, mode, conversationId: id, raw: r.raw });
    }
    /* Pre-warm the pinned conversation so the next /meta call replies faster. */
    async warmupSession(req, res) {
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        const s = this.loadSession();
        const id = (typeof req.body?.id === "string" && req.body.id) || s.conversationId;
        if (!id) {
            res.status(409).json({ ok: false, error: "no_session", detail: "No active conversation. Send a chat first." });
            return;
        }
        const r = await (0, metaAi_1.warmup)({ cookies, conversationId: id });
        res.json({ ok: r.success, conversationId: id, raw: r.raw });
    }
    async image(req, res) {
        const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        const orientation = req.body?.orientation || "SQUARE";
        if (!prompt) {
            res.status(400).json({ ok: false, error: "empty_prompt" });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        try {
            const result = await (0, metaAi_1.image)({ prompt, cookies, orientation });
            res.json({ ok: true, images: result.images, conversationId: result.conversationId });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "image_failed", detail: String(err?.message || err) });
        }
    }
    /* "Replit-Agent" style endpoint.
     *
     * The client sends { prompt, projectId }. We:
     *   1. Walk the project directory ("find ./") to gather a tree snapshot.
     *   2. Pull a small set of file contents for context (text files only).
     *   3. Ask Llama for a structured action plan.
     *   4. Return a JSON list of actions (file_create, file_delete, terminal,
     *      message) that the client executes against the existing
     *      /coding/save, /coding/delete and terminal websocket. */
    async agent(req, res) {
        const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
        const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
        if (!prompt) {
            res.status(400).json({ ok: false, error: "empty_prompt" });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        const clientConvId = typeof req.body?.conversationId === "string" && req.body.conversationId
            ? req.body.conversationId
            : undefined;
        const rawAgentMode = typeof req.body?.mode === "string" ? req.body.mode : "think_fast";
        const agentMode = rawAgentMode === "thinking" ? "think_hard"
            : rawAgentMode === "instant" ? "think_fast"
                : rawAgentMode;
        // Build workspace snapshot.
        let tree = "";
        let files = "";
        if (projectId) {
            const safe = path_1.default.basename(projectId);
            const root = path_1.default.join(this.projectsDir, safe);
            if (fs_1.default.existsSync(root)) {
                const collected = [];
                const TEXT_EXT = new Set([
                    ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".html", ".css",
                    ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp",
                    ".sh", ".env", ".yaml", ".yml", ".txt",
                ]);
                const walk = (dir, depth = 0) => {
                    if (depth > 6)
                        return;
                    let entries = [];
                    try {
                        entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
                    }
                    catch {
                        return;
                    }
                    for (const ent of entries) {
                        if (["node_modules", ".git", "dist", "build", ".next", ".cache"].includes(ent.name))
                            continue;
                        const full = path_1.default.join(dir, ent.name);
                        const rel = path_1.default.relative(root, full);
                        tree += `${"  ".repeat(depth)}${ent.isDirectory() ? "📁" : "📄"} ${rel}\n`;
                        if (ent.isDirectory()) {
                            walk(full, depth + 1);
                        }
                        else {
                            const ext = path_1.default.extname(ent.name).toLowerCase();
                            if (TEXT_EXT.has(ext) && collected.length < 20) {
                                try {
                                    const stat = fs_1.default.statSync(full);
                                    if (stat.size < 40_000)
                                        collected.push(rel);
                                }
                                catch { }
                            }
                        }
                    }
                };
                walk(root);
                for (const rel of collected) {
                    try {
                        const content = fs_1.default.readFileSync(path_1.default.join(root, rel), "utf-8");
                        files += `\n--- ${rel} ---\n${content}\n`;
                    }
                    catch { }
                }
            }
        }
        const systemPrompt = `You are Meta Agent, a coding helper backed by Meta AI.
You can create files, delete files, edit files (by re-creating them with new content), and run shell commands in the user's project.
ALWAYS reply with a single JSON object (no prose, no markdown fences) shaped exactly like:
{
  "message": "short human reply to show in chat",
  "actions": [
    { "type": "file_create", "path": "relative/path.ext", "content": "..." },
    { "type": "file_delete", "path": "relative/path.ext" },
    { "type": "terminal",    "command": "npm install express" }
  ]
}
Hard rules:
- Reply MUST be a single JSON object. No prose, no markdown fences, nothing before "{" or after "}".
- Use forward-slash relative paths rooted at the project root.
- "actions" may be empty for pure questions only. For ANY build/create/scaffold/install/run request, you MUST emit at least one action — never reply with "actions": [] for those.
- For multi-file scaffolds (Express app, React component, etc.) emit ONE file_create per file with the full content. Always include the entry file (e.g. index.js, server.js) and a package.json.
- Workflow for "build me X" prompts: (1) brief plan in "message" describing the directory, (2) file_create for each source file, (3) file_create for system.exo if missing or its run/port needs updating, (4) terminal action to install deps (npm install / pip install), (5) terminal action to run it (e.g. node index.js, npm start).
- To edit an existing file, re-emit it with file_create — the tooling overwrites by path. If the supplied "Existing files" already shows that exact content, skip re-emitting it.
- Prefer "terminal" for: installing packages (npm install, pip install), creating folders (mkdir), listing (ls / find), or running build/start commands.
- If the user asks "ls", "pwd", "cat X", "find ./", "run X", "cmd X" or similar, return EXACTLY one terminal action.
- Keep "message" under 400 chars; for long explanations write a README.md via file_create instead.
- Never invent paths that aren't in the supplied tree unless you also create them.
- system.exo is the project config (TOML-ish). It is PROTECTED — you may only update the [runtime] section (keys: run, port). Never rewrite [project], [meta], or any other section; the server will discard those edits. When scaffolding, emit only a [runtime] block with run = "node index.js" (or matching) and port = 3000.`;
        const userPayload = `User request:
${prompt}

Project: ${projectId || "(none)"}
Project tree (find ./):
${tree || "(empty)"}

Existing files (truncated):
${files || "(none)"}`;
        try {
            // First pass — keep the pinned conversation id stable.
            const session = this.loadSession();
            const pinned = clientConvId || session.conversationId;
            const result = await (0, metaAi_1.chat)({
                prompt: userPayload, system: systemPrompt, cookies,
                conversationId: pinned, mode: agentMode,
            });
            let parsed = extractJsonPlan(result.reply);
            let conversationId = result.conversationId || pinned;
            // Retry once if the model went prose for a clear build request,
            // OR if it parsed an empty plan for a build request. Llama tends
            // to comply on the second pass when we re-state the contract.
            const buildIntent = isBuildRequest(prompt);
            const needsRetry = (!parsed.parsed && buildIntent) ||
                (parsed.parsed && parsed.actions.length === 0 && buildIntent);
            if (needsRetry) {
                const retrySystem = `${systemPrompt}

CRITICAL: Your previous reply was invalid. The user asked you to build/create/run something. You MUST respond with the JSON plan format above and include real actions (file_create + terminal). Do NOT chat. Do NOT propose alternatives. Do NOT mention images or videos. Just emit the JSON plan now.`;
                const retryUser = `${userPayload}

Your previous attempt was rejected because it was prose, not JSON, or had zero actions. Reply with the JSON plan only this time.`;
                try {
                    // Retry on the SAME pinned conversation — never spawn a new
                    // doc id just because the first pass returned prose.
                    const retry = await (0, metaAi_1.chat)({
                        prompt: retryUser, system: retrySystem, cookies,
                        conversationId: pinned || conversationId, mode: agentMode,
                    });
                    const retryParsed = extractJsonPlan(retry.reply);
                    if (retryParsed.parsed && (retryParsed.actions.length > 0 || !buildIntent)) {
                        parsed = retryParsed;
                        conversationId = retry.conversationId || conversationId;
                    }
                }
                catch { /* keep first-pass result */ }
            }
            // Single-convo invariant: reap any orphan threads spawned by the
            // upstream during this round-trip (and the optional retry above)
            // and surface the survivor's id back to the client so its pinned
            // id always matches what's actually on meta.ai.
            const survivor = await (0, metaAi_1.reapToOne)(cookies).catch(() => undefined);
            const finalId = survivor || conversationId;
            if (finalId && finalId !== session.conversationId) {
                this.saveSession({ ...this.loadSession(), conversationId: finalId });
            }
            res.json({
                ok: true,
                message: parsed.message,
                actions: parsed.actions,
                rawReply: result.reply,
                conversationId: finalId,
            });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "agent_failed", detail: String(err?.message || err) });
        }
    }
    /* Bulk-delete conversations created during a chat session. The client
     * collects every conversationId returned by /meta, /meta/image and
     * /meta/agent, then POSTs them here when the user clears the chat. */
    async cleanupConversations(req, res) {
        const ids = req.body?.conversationIds;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.json({ ok: true, deleted: 0 });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        const results = await Promise.all(ids
            .filter((id) => typeof id === "string" && id.length > 0)
            .map(async (id) => {
            try {
                const r = await (0, metaAi_1.deleteConversation)({ cookies, conversationId: id });
                return { id, ok: r.success };
            }
            catch (err) {
                return { id, ok: false, error: String(err?.message || err) };
            }
        }));
        res.json({ ok: true, deleted: results.filter(r => r.ok).length, results });
    }
    /* Wipe EVERY conversation on the user's meta.ai account in one shot.
     * Forwards to the Flask /delete/all endpoint (which fans out parallel
     * deletes). Also clears our pinned local session id since whatever it
     * pointed at is gone. The caller must pass { confirm: true } so a
     * stray click can't nuke the account by accident. */
    async deleteAll(req, res) {
        if (req.body?.confirm !== true) {
            res.status(400).json({ ok: false, error: "confirm_required", detail: "Pass { confirm: true } to wipe all conversations." });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        try {
            const axios = (await import("axios")).default;
            const r = await axios.post((process.env.EXOCORE_LLAMA_BASE_URL || "https://exocore-llama.hf.space") + "/delete/all", { cookies, confirm: true }, { timeout: 120_000 });
            this.clearSession();
            const data = r.data || {};
            res.json({ ok: true, deleted: data.deleted ?? data.count ?? null, raw: data });
        }
        catch (err) {
            const detail = err?.response?.data?.detail || err?.response?.data?.error || err?.message || "delete_all_failed";
            res.status(502).json({ ok: false, error: "delete_all_failed", detail: String(detail) });
        }
    }
    async deleteConvo(req, res) {
        const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : "";
        if (!conversationId) {
            res.status(400).json({ ok: false, error: "missing_conversationId" });
            return;
        }
        const cookies = this.cookiesFromReq(req);
        if (!cookies) {
            res.status(503).json({ ok: false, error: "no_cookies" });
            return;
        }
        try {
            const r = await (0, metaAi_1.deleteConversation)({ cookies, conversationId });
            res.json({ ok: r.success, raw: r.raw });
        }
        catch (err) {
            res.status(502).json({ ok: false, error: "delete_failed", detail: String(err?.message || err) });
        }
    }
}
exports.AiRoute = AiRoute;
/* Llama loves wrapping JSON in markdown fences or chatty preamble. This pulls
 * out the first {...} block and validates it; if nothing parses we fall back
 * to a plain message-only plan so the chat still shows something useful.
 * The `parsed` flag tells the caller whether we got real JSON (so it can
 * decide to retry with a stricter prompt). */
function extractJsonPlan(reply) {
    const fallback = { message: reply.trim() || "(empty response)", actions: [], parsed: false };
    if (!reply)
        return fallback;
    let candidate = reply.trim();
    const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence)
        candidate = fence[1].trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start)
        return fallback;
    const slice = candidate.slice(start, end + 1);
    try {
        const obj = JSON.parse(slice);
        const actions = [];
        if (Array.isArray(obj.actions)) {
            for (const a of obj.actions) {
                if (!a || typeof a !== "object")
                    continue;
                if (a.type === "file_create" && typeof a.path === "string") {
                    actions.push({ type: "file_create", path: a.path, content: typeof a.content === "string" ? a.content : "" });
                }
                else if (a.type === "file_delete" && typeof a.path === "string") {
                    actions.push({ type: "file_delete", path: a.path });
                }
                else if (a.type === "terminal" && typeof a.command === "string") {
                    actions.push({ type: "terminal", command: a.command });
                }
            }
        }
        return {
            message: typeof obj.message === "string" ? obj.message : fallback.message,
            actions,
            parsed: true,
        };
    }
    catch {
        return fallback;
    }
}
/* Heuristic: did the user clearly ask for code/files to be built/run?
 * Used to force a retry when the model returns prose-only for a request that
 * obviously needs actions. */
function isBuildRequest(prompt) {
    return /\b(create|build|scaffold|generate|make|setup|set up|initialize|init|add|install|fix|run|edit|update|gawa|gawin|gumawa|ayusin|i-install|i-edit|i-run)\b/i.test(prompt)
        || /\.(?:js|ts|py|html|css|json)\b/i.test(prompt);
}
exports.default = AiRoute;
