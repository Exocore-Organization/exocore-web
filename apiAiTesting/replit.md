# Meta AI + Gemini + ChatGPT + Pi.ai + DeepAI API

Flask wrapper around the meta.ai GraphQL backend, the gemini.google.com
web client, the chatgpt.com backend, the pi.ai backend, and deepai.org's
free chat. User brings their own browser session credentials on each request
(except DeepAI, which is fully anonymous).

## Stack
- Python 3.11
- Flask, requests
- Workflow: **Start application** → `python app.py` on port 5000 (webview)

## Layout
- `app.py` — Flask routes + per-session client cache (Meta, Gemini, ChatGPT)
- `meta/main.py` — `MetaAI` client (GraphQL chat, sidebar ops, doc_id constants)
- `meta/generation.py` — image/video generation
- `meta/html_scraper.py` — access-token + rd_challenge handling
- `gemini/client.py` — `GeminiClient` (web BardChatUi, fast/thinking/pro modes)
- `chatgpt/client.py` — `ChatGPTClient` (chatgpt.com SSE, pinned conv, auto-repin)
- `chatgpt/__init__.py` — module exports
- `pi/client.py` — `PiClient` (pi.ai SSE v2, stateful conv, greeting, discover)
- `pi/__init__.py` — module exports
- `deepai/client.py` — `DeepAIClient` (anonymous deepai.org free chat, in-memory convos)
- `deepai/__init__.py` — module exports
- `requirements.txt`

## Endpoints
Meta chat: `POST /chat`. Media: `/meta/image`, `/meta/video`, `/meta/video/extend`, `/meta/video/async`,
`/meta/video/jobs/<id>`, `/meta/upload`. Conversations: `/meta/conversations` (list),
`/meta/delete`, `/meta/delete/all` (`{confirm:true}`), `/meta/rename`, `/meta/pin`, `/meta/unpin`,
`/meta/mode`, `/meta/warmup`, `/meta/stop`, `/meta/starters`. Diag: `/`, `/meta/cookies/check`.

Gemini chat: `POST /gemini` body
`{message, mode, conversation_id?, cookies}`. `mode` is `fast` (default) /
`thinking` / `pro`. Response = `{text, conversation_id, model}` — caller
stores `conversation_id` to continue the thread (no other state kept).

Pi.ai: all endpoints accept cookies as `{"cookies": {…}}` JSON body.
- `POST /pi` — send message; auto-creates+pins conv on first call.
  Body: `{message, cookies, conversation_id?, use_pinned?}`.
  Response: `{text, conversation_id, sid, pinned_conversation_id}`.
- `POST /pi/create` — create a new conversation + pin it (`{cookies, pin?}`).
- `POST /pi/pin` — pin an existing conversation (`{conversation_id, cookies}`).
- `POST /pi/unpin` — clear the pinned conversation.
- `POST /pi/delete` — delete a single conversation (`{conversation_id, cookies}`).
- `POST /pi/delete/all` — delete all server-tracked convs (`{confirm:true, cookies}`).
- `GET /pi/conversations` — list all account conversations from pi.ai.
- `GET /pi/history` — fetch message history (`{conversation_id, cookies}`).
- `GET /pi/greeting` — fetch Pi's greeting.
- `GET /pi/discover` — fetch Pi's topic suggestions.

DeepAI (free, anonymous — **no cookies, no api-key**):
- `POST /deep` — chat. Body: `{message, conversation_id?, model?, chat_style?, history?, stream?}`.
  Response: `{text, conversation_id, model}`. With `stream:true` returns SSE
  `data: {"text": "<chunk>"}` events ending in `data: [DONE]`.
- `POST /deep/create` — allocate a fresh `conversation_id` (UUID).
- `GET  /deep/conversations` — list in-process conversation IDs.
- `GET  /deep/history?conversation_id=…` — full message log for one convo.
- `POST /deep/delete` — drop one (`{conversation_id}`).
- `POST /deep/delete/all` — wipe all (`{confirm:true}`).
- `GET  /deep/models` — model alias map. Free tier exposes only `standard`.

DeepAI internals: hits `POST https://api.deepai.org/hacking_is_a_serious_crime`
with `multipart/form-data` (fields: `chat_style`, `chatHistory` JSON,
`model`, `session_uuid`, `sensitivity_request_id`, `hacker_is_stinky=very_stinky`,
`enabled_tools=[]`). Response is plain-text streamed body. State is
in-process only — restart wipes conversations. Single shared `DeepAIClient`
singleton (no per-user split since there are no credentials).

## Pi.ai Auth Notes
Required cookies (copy from pi.ai browser DevTools → Application → Cookies):
| Cookie | Notes |
|---|---|
| `__Secure-pi-session` | Primary auth — long-lived |
| `__Host-session` | Same value as above (hostOnly variant) |
| `__Secure-pi-auth-state` | Usually `"1"` |
| `__cf_bm` | Cloudflare bot mgmt — rotates every ~30 min; re-send on each request |

Pass the `__cf_bm` value on every request for best reliability.

## Pi.ai Implementation Notes
- **API version header**: `x-api-version: 5` on chat; `x-api-version: 2` on all other endpoints.
- **SSE format**: each event carries the FULL accumulated text so far (`isComplete: false`);
  the final event has `isComplete: true`. Client yields only the last event's text.
- **Conversation continuity**: server-stateful — just re-use the same `conversation` ID.
  No parent_message_id or session tokens needed beyond the cookie.
- **Delete fallback**: tries `DELETE /api/conversations/<id>` first; falls back to
  `PATCH /api/conversations/<id>` with `{deleted: true}` if DELETE isn't exposed.
- **Client cache**: keyed by `__Secure-pi-session`. Analytics IDs (`eqDistinctId`,
  `eqSessionId`) are generated once per `PiClient` instance and reused.
  `__cf_bm` is refreshed on every request automatically.

## Performance
- `_client(cookies)` in `app.py` caches a `MetaAI` instance per `ecto_1_sess`
  (LRU, max 32). Cuts warm chat from ~3.5s → ~2-3s by skipping the
  `rd_challenge` handshake on each request.
- `/meta/chat` already streams via SSE (`text/event-stream`).
- `/meta/delete/all` parallelises deletes (8 worker threads).

## Known doc_ids (Apr 2026, persistent-query GraphQL)
chat (unified) `2f707e4a86f4b01adba97e1376cbdc14` (set `mode:"chat"`),
list `5b38409017144f88a5e4fc84eb5923f4`,
delete `ad35bda8475e29ba4264ef0d6cc0958a`,
rename `2775bdbd0886fb2056fae9c68d323368` (input.id, input.title),
pin `ee1968033ea19d57f428774cf65b0b5d` (input.id, input.pinned),
mode `c32bbe999c48e64e855dc63177d5153f`,
warmup `e7f802582dbfed8e181b012e010993eb`,
stop `211fff1b73307b73d2033b7e84e821a8`,
starters `8b93d5b56ca7a76d49601b95d9e79d3a`,
send-msg subscription `078dfdff6fb0d420d8011b49073e6886`
(needs `conversationId`, `content`, `userMessageId`, `assistantMessageId`,
`userUniqueMessageId`, `turnId`).

## Env vars
- `META_AI_CHAT_MODE` (default `chat`) — overrides chat mutation mode
- `META_AI_CHAT_DOC_ID` / `META_AI_CHAT_DOC_ID_ALT` — chat doc id overrides

## Auth
Cookies provided per request. Sources merged in priority: JSON body
`cookies`, query `?cookies=`, individual cookie query params, `Cookie` header.

- Meta required: `ecto_1_sess`. Recommended: `datr`, `dpr`, `wd`, `rd_challenge`.
- Gemini required: `__Secure-1PSID`. Recommended: `__Secure-1PSIDTS`,
  `__Secure-3PSID`, `__Secure-3PSIDTS`, `SAPISID`, `SID`, `HSID`, `SSID`,
  `NID`. SIDCC variants rotate every few minutes — fresh cookies needed if
  the SNlM0e fetch starts failing.

## Gemini internals (Apr 2026)
- Endpoint: `POST https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
- Per-request body: `f.req=[null,'[[<msg>],null,[<conv>,<resp>,<choice>]]']`,
  `at=<SNlM0e>`. Query needs `bl` (`cfb2h` from page) + `f.sid` (`FdrFJe`).
- Model selected via header `x-goog-ext-525001261-jspb: [1,null,null,null,"<id>"]`
  (extra positions trigger status 13). IDs from `sor/e884f5e583fd8fc2`
  experiment buckets `thinking=...` / `fast=...`:
  - fast → `56fdd199312815e2`
  - thinking → `797f3d0293f288ad`
  - pro → `2525e3954d185b3c`
- Response is XSSI-guarded (`)]}'`) followed by repeating `\n<bytelen>\n<json>`
  frames. Length is **bytes** — must walk the body in UTF-8 bytes or emoji
  break the slicing. Pro/thinking stream multiple `wrb.fr` frames; the answer
  arrives in a later one.
- `GeminiClient` caches SNlM0e + bl + sid per session; the Flask layer caches
  one `GeminiClient` per `__Secure-1PSID` (LRU, max 32) so warm requests skip
  the page fetch.

## Gemini conversation continuity (gotcha)
Sending only `conversation_id` on the next turn is **not enough** — the server
will echo back the same `conversation_id` but the model has zero memory of
previous turns (creates a fresh branch). The full triple
`[conversation_id, response_id, choice_id]` is required to chain context.

Live-confirmed Apr 2026: with conv_id only, "Anong paborito kong kulay?"
right after telling Gemini "azul" returned "Hindi ko pa alam ang paborito
mong kulay".

Fix in `GeminiClient`: an internal `_threads: {conv_id -> (resp_id, choice_id)}`
LRU is updated after every turn. When the caller passes only
`conversation_id`, the client auto-fills the latest `resp_id` / `choice_id`
for that thread. Surface API still keeps the user-facing contract of "store
conversation_id only".

Caveat: state lives in process memory, so if the same `__Secure-1PSID`
hits a different Flask worker (or the cache evicts), continuity for an
existing conversation is lost. Rebuild with persistent storage (sqlite/
redis) when running multi-worker.

## Gemini conversation deletion
Endpoints:
- `POST /gemini/delete`        body: `{"conversation_id": "...", "cookies": {...}}`
- `POST /gemini/delete/all`    body: `{"confirm": true, "cookies": {...}}`
- `GET  /gemini/conversations` returns the conv ids this server is tracking
  for the caller's `__Secure-1PSID`.

Implementation: `GeminiClient.delete_conversation(cid)` posts to the same
`batchexecute` RPC the web sidebar uses (`rpcid=GzXR5e`) with `f.req` =
`[[[GzXR5e, json([[cid]]), null, "generic"]]]` plus the SNlM0e `at` token.
`delete_all_conversations()` iterates only the conversations this client
instance has tracked locally — never enumerates the full server-side
history, so chats made directly in the browser stay intact. The local
`_threads` cache is cleared on delete regardless of the HTTP outcome so
future chats with that id won't accidentally reuse stale resp/choice ids.

Recommended test pattern: clean → chat → continuity → delete:
```
GET  /gemini/conversations         # what's tracked
POST /gemini/delete/all {confirm}  # wipe tracked
POST /gemini  {message: "..."}            -> save conv_id
POST /gemini  {message: "...", conversation_id}   # verify memory
POST /gemini/delete {conversation_id}     # clean up
```

## Gemini test rate-limiting (observed)
~10 rapid back-to-back StreamGenerate calls on a single account triggers an
account-level throttle: response shrinks to a single `[["wrb.fr",null,null,
null,null,[13]]]` frame (status 13, no candidates) for ~10–30 minutes. Not
specific to model id — affects all of fast/thinking/pro. Add ≥5s spacing
between turns when scripting tests.

## Gemini hardened transport
`GeminiClient` ships a full Chrome 147 fingerprint:
- Browser headers: `Sec-Ch-Ua` (+ Arch/Bitness/Full-Version/Mobile/Model/
  Platform/Platform-Version/Wow64), `Sec-Fetch-Dest|Mode|Site`,
  `X-Same-Domain: 1`, `Accept-Encoding: gzip, deflate, br, zstd`, `DNT: 1`,
  `Origin` + `Referer` pinned to `https://gemini.google.com`.
- `urllib3.Retry` adapter on the session: `total=3`, `backoff_factor=0.6`,
  `status_forcelist=(429,500,502,503,504)`, allowed_methods limited to
  GET/HEAD only (chat POSTs stay non-idempotent — never retried).
- Connection pool: `pool_connections=8, pool_maxsize=16`.
- Proxy precedence: explicit `proxy=` arg > `GEMINI_PROXY` env >
  `HTTPS_PROXY` env. Set `GEMINI_PROXY=http://user:pass@host:port` to
  route every Gemini request through a proxy without code changes.

## Gemini account pool (`gemini.AccountPool`)
Server keeps an in-memory pool keyed by caller-chosen labels. Used when
`/gemini` is called without a `cookies` field — round-robin pick, with
per-account throttle bookkeeping (`mark_throttled(cooldown=600s)` on
status-13 frames, `is_throttled` skipped during selection). On a throttle
the pool auto-fails-over to the next non-throttled account up to 3
attempts. If `prefer_label` is given (or body `account: "main"`) that
account is tried first — useful for sticking a `conversation_id` to
whichever account owns it.

Endpoints:
- `POST /gemini/accounts/register` body:
  `{accounts:[{label, cookies, proxy?}, ...]}` (also accepts a single
  `{label, cookies}` shorthand). Re-registering the same label refreshes
  cookies in place without losing the slot.
- `GET  /gemini/accounts` — list labels with throttle status, cooldown
  remaining, last_used, and tracked conversation count. No secrets exposed.
- `DELETE /gemini/accounts/<label>` — remove one account.
- `POST /gemini/accounts/clear` body: `{confirm: true}` — wipe pool.

`/gemini` body now accepts `account: "<label>"` to bias selection. Response
includes `account` so callers can sticky-route follow-ups.

Important: pool stores cookies in memory only — restarting Flask wipes
the pool and the per-account `_threads` continuity cache. If running
multiple workers (gunicorn -w >1), each worker has its own pool.

## ChatGPT backend (chatgpt.com reverse-proxy)

### Auth
Every request must supply one of:
- JSON `access_token`: Bearer JWT from chatgpt.com browser session
- `Authorization: Bearer <JWT>` header
- `X-Chatgpt-Token: <JWT>` header
- `?access_token=<JWT>` query param (GET routes)
- JSON `cookies`: dict or cookie-string of chatgpt.com cookies (server fetches
  the Bearer JWT lazily via `GET /api/auth/session`)

The server caches one `ChatGPTClient` per access_token (LRU, max 32).

### Pinned conversation
- The server keeps one "pinned" `conversation_id` per access_token.
- `POST /chatgpt` uses the pinned id by default (`use_pinned: true`).
- On a 429 / rate-limit the server auto-creates a fresh conversation and pins it.
- `POST /chatgpt/create` always makes a new conversation (and pins it by default).
- `POST /chatgpt/pin {conversation_id}` manually pins an existing id.

### Models
| Alias | chatgpt.com model slug | Notes |
|---|---|---|
| `auto` / `fast` / `instant` | `auto` | Default; ChatGPT picks gpt-4o or gpt-4o-mini |
| `thinking` / `o1` | `o1` | Requires Plus plan |
| `o3-mini` | `o3-mini` | Requires Plus plan |
| `gpt-4o` | `gpt-4o` | Requires Plus plan |

### Endpoints
- `POST /chatgpt` — chat; body: `{message, access_token, model?, conversation_id?, use_pinned?}`
- `POST /chatgpt/create` — start new conversation; body: `{message, access_token, model?, pin?}`
- `POST /chatgpt/pin` — pin a conversation; body: `{conversation_id, access_token}`
- `POST /chatgpt/unpin` — unpin; body: `{conversation_id, access_token}`
- `POST /chatgpt/delete` — soft-delete one; body: `{conversation_id, access_token}`
- `POST /chatgpt/delete/all` — delete all tracked; body: `{access_token, confirm: true}`
- `GET  /chatgpt/conversations` — list tracked ids for this session
- `GET  /chatgpt/models` — list model alias map

### SSE parsing (v1 buffered encoding)
ChatGPT uses a custom `v1` SSE encoding where each event has a `v` field
(string delta) and optionally a `p` path like `/message/<uuid>/content/parts/0`
that reveals the assistant message id. The client also handles the legacy
`message.content.parts[]` format as fallback.

### Sentinel tokens
ChatGPT's bot-protection sends a `openai-sentinel-chat-requirements-token`
with every conversation request. The client calls the prepare endpoint
(`POST /backend-api/sentinel/chat-requirements/prepare`) to obtain this token
before each message. The harder proof-of-work and Turnstile tokens are browser-
computed and not replicated — the client sends `client_prepare_state: "none"`
which may be accepted for valid accounts.

## sourceHez (chat.z.ai GLM-5-Turbo)
- `POST /hez` chat (auto-creates remote chat on first turn, reuses chat_id for follow-ups).
- `POST /hez/create`, `GET /hez/conversations`, `GET /hez/history`,
  `POST /hez/delete`, `POST /hez/delete/all`, `GET /hez/models`, `GET /hez/upstream`.
- Auth: bearer JWT from the `token` cookie at chat.z.ai. Pass as `{"token": "..."}`,
  `{"cookies":{"token":"..."}}`, or `?token=...` (GET routes also accept the
  `Cookie` header). The `id` claim from the JWT is used as `user_id` in the
  upstream call + signature.

### X-Signature (reverse-engineered from prod-fe-1.1.14, Apr 2026)
chat.z.ai now requires an `X-Signature` header on `/api/v2/chat/completions`.
Algorithm reproduced in `sourceHez/client.py::_zai_signature`:
1. `bucket = floor(timestamp_ms / 300000)` (5-min epoch window).
2. `rotated_key = HMAC-SHA256("key-@@@@)))()((9))-xxxx&&&%%%%%", str(bucket)).hex()`.
3. `sortedPayload = "requestId,<r>,timestamp,<t>,user_id,<u>"` — entries of
   `{timestamp, requestId, user_id}` sorted by key, joined as
   `Object.entries(...).sort().join(",")` does in JS.
4. `data = sortedPayload + "|" + base64(utf8(message)) + "|" + str(timestamp_ms)`.
5. `X-Signature = HMAC-SHA256(rotated_key, data).hex()`.

Same `timestamp_ms` is also passed as `signature_timestamp` on the URL. The
upstream signing function lives in chunk `m87BJU5M.js` as `ei()` — heavily
RC4-obfuscated; the seed and structure were extracted by deobfuscating the
`Ee()`/`K()` wordlist.

## User notes
- Speaks Taglish/Filipino — replies should match.
- Wants clean text chat (mode=chat, no accidental image generation),
  conversation listing, bulk delete, fast responses.
- ChatGPT: pinned conversation auto-routing, thinking/fast modes, auto-repin on limit.
