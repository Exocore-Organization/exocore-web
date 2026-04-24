# Tapos Multi-AI API

A Flask wrapper around five chat backends — **Meta AI**, **Google Gemini**,
**ChatGPT**, **Pi.ai**, and **DeepAI** — each on its own URL namespace.

| Namespace | Backend         | Auth                       |
|-----------|-----------------|----------------------------|
| `/meta/*` | meta.ai         | meta.ai cookies (per request) |
| `/gemini/*` | gemini.google.com | Google cookies (per request) |
| `/chatgpt/*` | chatgpt.com  | Bearer JWT or chatgpt.com cookies |
| `/pi/*`   | pi.ai           | pi.ai cookies (per request) |
| `/deep/*` | deepai.org      | **None** — anonymous, free |

> **You provide your own session credentials on every request.** Nothing is
> stored server-side. Caching is in-memory per session and cleared when the
> process restarts. DeepAI alone needs no credentials.

---

## Quick start

```bash
pip install -r requirements.txt
python app.py            # listens on :5000
```

---

## Authentication: cookies (Meta)

Every Meta request needs your meta.ai cookies. The wrapper enforces
`ecto_1_sess`, but for **authenticated write actions** (chat, delete,
rename, pin, mode change, warmup) meta.ai also requires the **session
auth carrier** issued AFTER login.

### Two login flows — same destination

meta.ai supports both **Facebook** and **Instagram** sign-in. Regardless
of which you pick, meta.ai stores its own session cookies on the
`.meta.ai` domain. The carrier names differ:

| Login flow  | Carrier cookies on `.meta.ai`              | Optional helpers          |
|-------------|--------------------------------------------|---------------------------|
| Facebook    | `abra_sess`, `c_user`, `xs`                | `fr`, `sb`, `presence`    |
| Instagram   | `abra_sess`, `i_user`                      | `sessionid`, `ds_user_id` |
| Anonymous*  | `datr`, `dpr`, `ecto_1_sess`, `rd_challenge`, `wd` | — (unauthenticated) |

> *The "anonymous" set is what your browser receives BEFORE you click
> *Continue with Facebook / Instagram*. It is enough to render the
> landing page but **will be rejected by every write op**.

Recommended export: select all cookies on the `.meta.ai` domain after
sending at least one chat message — that guarantees the session is
fully provisioned.

### Verify before you trust

1. Open <https://www.meta.ai> in Chromium. If you see the **chatbox**
   (not the *Continue with Instagram/Facebook* screen), your cookies
   are alive in that browser profile.
2. DevTools → **Application → Cookies → https://www.meta.ai**. Confirm
   `abra_sess` is present (it's `httpOnly`, so the cookie editor must
   not be filtering httpOnly cookies out).
3. `POST /meta/cookies/check` with the exported map. The response's
   `summary.authenticated_with_full_set` must be `true`.

You can attach cookies any of these ways (merged in this priority):

1. **JSON body**: `{"cookies": {"ecto_1_sess": "...", "datr": "..."}}`
2. **JSON body string**: `{"cookies": "ecto_1_sess=...; datr=..."}`
3. **Query param**: `?cookies={"ecto_1_sess":"..."}` or `?cookies=ecto_1_sess=...`
4. **Individual query params**: `?ecto_1_sess=...&datr=...`
5. **`Cookie` header**: just forward your browser's `Cookie:` header

The fastest way to get your cookies: use a "Cookie Editor" extension on
`https://www.meta.ai`, export as JSON, and pass it as the `cookies` field.

---

## Endpoints

### Chat

| Method | Path     | Purpose                    |
|--------|----------|----------------------------|
| POST   | `/meta/chat`  | Send a text message        |

```json
POST /chat
{
  "cookies": { "ecto_1_sess": "..." },
  "message": "Hello in Tagalog please",
  "new_conversation": false
}
```

Response: `{ "message": "...", "conversation_id": "...", ... }`

> **Speed**: the first call per session does an `rd_challenge` handshake
> (~3-6s). Subsequent calls reuse the cached client and average **~2-3s**.

### Image / Video

| Method | Path                       | Purpose                    |
|--------|----------------------------|----------------------------|
| POST   | `/meta/image`                   | Generate an image          |
| POST   | `/meta/video`                   | Generate a video (sync)    |
| POST   | `/meta/video/extend`            | Extend an existing video   |
| POST   | `/meta/video/async`             | Kick off a video job       |
| GET    | `/meta/video/jobs/<job_id>`     | Poll an async video job    |
| POST   | `/meta/upload`                  | Upload an image (file or URL) |

### Conversation management

| Method | Path                | Purpose                                                                |
|--------|---------------------|------------------------------------------------------------------------|
| GET    | `/meta/conversations`    | List all conversations (paginated, returns id/title/timestamp/pinned)  |
| POST   | `/meta/delete`           | Delete one conversation by `id`                                        |
| POST   | `/meta/delete/all`       | Delete **every** conversation (requires `"confirm": true`)             |
| POST   | `/meta/rename`           | Rename a conversation: `{id, title}`                                   |
| POST   | `/meta/pin`              | Pin a conversation: `{id}`                                             |
| POST   | `/meta/unpin`            | Unpin a conversation: `{id}`                                           |
| POST   | `/meta/mode`             | Change a conversation's mode: `{id, mode}` (`"think_hard"`, `"think_fast"`, `"CHAT"`, `"IMAGINE"`, ...) |
| POST   | `/meta/think`            | Shortcut: switch a conversation to extended thinking mode (`think_hard`): `{id}` |
| POST   | `/meta/instant`          | Shortcut: switch back to fast/instant mode (`think_fast`): `{id}`      |
| POST   | `/meta/warmup`           | Pre-warm a conversation to cut first-token latency: `{id}`             |
| POST   | `/meta/stop`             | Stop in-flight generation: `{id, message_id?}`                         |
| GET    | `/meta/starters`         | Fetch suggested starter prompts                                        |

#### Examples

```bash
BASE=http://localhost:5000

# Health / endpoint list
curl -s $BASE/ | python3 -m json.tool

# Cookie check
curl -s -X POST $BASE/meta/cookies/check \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES}" | python3 -m json.tool

# CHAT (text)
curl -s -X POST $BASE/meta/chat \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"message\": \"kumusta? sagutin mo sa tagalog\"}" | python3 -m json.tool

# Chat in a NEW conversation
curl -s -X POST $BASE/meta/chat \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"message\": \"hi\", \"new_conversation\": true}" | python3 -m json.tool

# LIST all conversations
curl -s -X GET $BASE/meta/conversations \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES}" | python3 -m json.tool

# Grab the FIRST conversation id into $CID
export CID=$(curl -s -X GET $BASE/meta/conversations \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES}" | python3 -c "import json,sys; print(json.load(sys.stdin)['conversations'][0]['id'])")
echo "CID=$CID"

# RENAME
curl -s -X POST $BASE/meta/rename \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"id\": \"$CID\", \"title\": \"Pinalitan via curl\"}" | python3 -m json.tool

# PIN / UNPIN
curl -s -X POST $BASE/meta/pin   -H 'Content-Type: application/json' -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool
curl -s -X POST $BASE/meta/unpin -H 'Content-Type: application/json' -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool

# WARMUP (faster next reply for that convo)
curl -s -X POST $BASE/meta/warmup \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool

# STARTERS (suggested prompts)
curl -s -X GET $BASE/meta/starters \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES}" | python3 -m json.tool

# DELETE one conversation
curl -s -X POST $BASE/meta/delete \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool

# DELETE ALL (need confirm:true)
curl -s -X POST $BASE/meta/delete/all \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"confirm\": true}" | python3 -m json.tool

# THINKING mode (extended reasoning) — switch then chat
curl -s -X POST $BASE/meta/think \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool

# Or do both in one call: switch mode AND send the prompt
curl -s -X POST $BASE/meta/chat \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"conversation_id\": \"$CID\", \"mode\": \"thinking\", \"message\": \"explain how binary works\"}" | python3 -m json.tool

# Switch back to fast/instant replies
curl -s -X POST $BASE/meta/instant \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"id\": \"$CID\"}" | python3 -m json.tool

# IMAGE generation
curl -s -X POST $BASE/meta/image \
  -H 'Content-Type: application/json' \
  -d "{\"cookies\": $COOKIES, \"prompt\": \"a tiny corgi astronaut, cartoon\"}" | python3 -m json.tool
```

`/meta/delete/all` runs deletes in parallel (8 workers) — wiping 30+ conversations
takes about 10 seconds.

### Diagnostics

| Method | Path             | Purpose                                  |
|--------|------------------|------------------------------------------|
| GET    | `/`              | Service info + endpoint list             |
| POST   | `/meta/cookies/check` | Validate your cookies against meta.ai    |

---

## Performance notes

- **Client cache**: the Flask layer caches one `MetaAI` instance per
  `ecto_1_sess` (LRU, max 32). The expensive `rd_challenge` handshake runs
  once per session instead of per request.
- **Streaming chat**: the `/meta/chat` path uses GraphQL SSE (`text/event-stream`)
  internally so the model's tokens stream into the response as they're produced.
- **Parallel deletes**: `/meta/delete/all` fans out concurrent delete mutations.

### Tuning environment variables

| Var                       | Default                              | What it does                              |
|---------------------------|--------------------------------------|-------------------------------------------|
| `META_AI_CHAT_MODE`       | `chat`                               | Mode flag sent on chat mutation           |
| `META_AI_CHAT_DOC_ID`     | `2f707e4a86f4b01adba97e1376cbdc14`   | Override the GraphQL chat doc id          |
| `META_AI_CHAT_DOC_ID_ALT` | (unset)                              | Fallback chat doc id                      |

---

## GraphQL doc id reference (Apr 2026)

These are the meta.ai persisted-query ids the wrapper uses. Extracted by scanning
authenticated `/_next/static/chunks/*.js`. They drift over time — re-scan if a call
suddenly returns `GRAPHQL_VALIDATION_FAILED`.

| Op | Kind | doc_id |
|----|------|--------|
| `EctoConversationListWithPaginationRouterQuery` (list) | query | `5b38409017144f88a5e4fc84eb5923f4` |
| `useEctoDeleteConversationMutation` | mutation | `ad35bda8475e29ba4264ef0d6cc0958a` |
| `useEctoRenameConversationMutation` | mutation | `2775bdbd0886fb2056fae9c68d323368` |
| `useEctoPinConversationMutation` | mutation | `ee1968033ea19d57f428774cf65b0b5d` |
| `useUpdateConversationModeMutation` | mutation | `c32bbe999c48e64e855dc63177d5153f` |
| `useConversationWarmupMutation` | mutation | `e7f802582dbfed8e181b012e010993eb` |
| `useEctoStopMessageMutation` | mutation | `211fff1b73307b73d2033b7e84e821a8` |
| `useEctoSendMessageSubscription` (streaming chat) | subscription | `078dfdff6fb0d420d8011b49073e6886` |
| `useEctoMultiSendSubscription` | subscription | `f94245a63d3e3222745392c9aab46f5f` |
| `useStreamRecoveryQuery` | query | `1fb3a0f9d06288879b98afc3fcef311e` |
| `EctoConversationStartersQuery` | query | `8b93d5b56ca7a76d49601b95d9e79d3a` |
| Unified chat / imagine | mutation | `2f707e4a86f4b01adba97e1376cbdc14` |

---

## Gemini (`/gemini/*`)

Required cookie: `__Secure-1PSID` (recommended also: `__Secure-1PSIDTS`,
`__Secure-3PSID`, `SAPISID`, `SID`, `HSID`, `SSID`, `NID`).

| Method | Path | Purpose |
|---|---|---|
| POST | `/gemini` | Chat. Body: `{message, mode, conversation_id?, cookies, account?}` — `mode` ∈ `fast`/`thinking`/`pro` |
| POST | `/gemini/delete` | Delete one tracked conv |
| POST | `/gemini/delete/all` | Wipe all tracked convs (`{confirm:true}`) |
| GET  | `/gemini/conversations` | List tracked conv ids |
| POST | `/gemini/accounts/register` | Add account(s) to round-robin pool |
| GET  | `/gemini/accounts` | List pool labels + throttle status |
| DELETE | `/gemini/accounts/<label>` | Remove an account |
| POST | `/gemini/accounts/clear` | Wipe pool (`{confirm:true}`) |

```bash
curl -X POST $BASE/gemini -H 'Content-Type: application/json' \
  -d '{"message":"hello","mode":"fast","cookies":{"__Secure-1PSID":"..."}}'
```

Sending only `conversation_id` chains correctly — the wrapper auto-fills the
internal `(response_id, choice_id)` triple per session.

---

## ChatGPT (`/chatgpt/*`)

Auth: a Bearer JWT (any of `access_token` JSON field, `Authorization` header,
`X-Chatgpt-Token` header, `?access_token=` query) **or** a `cookies` dict from
chatgpt.com (server fetches the JWT lazily via `/api/auth/session`).

| Method | Path | Purpose |
|---|---|---|
| POST | `/chatgpt` | Chat. Body: `{message, model?, conversation_id?, use_pinned?, access_token}` |
| POST | `/chatgpt/create` | Start a new conversation (and pin it by default) |
| POST | `/chatgpt/pin` / `/chatgpt/unpin` | Manage the per-token pinned conv |
| POST | `/chatgpt/delete` / `/chatgpt/delete/all` | Soft-delete tracked convs |
| GET  | `/chatgpt/conversations` | List tracked conv ids |
| GET  | `/chatgpt/models` | Model alias map |

Models: `auto`/`fast`/`instant` → `auto`; `thinking`/`o1` → `o1`; `o3-mini`,
`gpt-4o`, `gpt-4o-mini` (Plus required for non-`auto`).

The server keeps one **pinned conversation** per token; `/chatgpt` reuses it
by default and **auto-creates a fresh one** on a 429.

---

## Pi.ai (`/pi/*`)

Required cookie: `__Secure-pi-session` (also pass `__Host-session` mirror,
`__Secure-pi-auth-state`, and a fresh `__cf_bm` for reliability).

| Method | Path | Purpose |
|---|---|---|
| POST | `/pi` | Chat. Body: `{message, conversation_id?, use_pinned?, cookies}` |
| POST | `/pi/create` | Create + pin a new conversation |
| POST | `/pi/pin` / `/pi/unpin` | Manage pinned conv |
| POST | `/pi/delete` / `/pi/delete/all` | Delete tracked convs |
| GET  | `/pi/conversations` | List server-side account convs |
| GET  | `/pi/history` | Fetch one conv's messages |
| GET  | `/pi/greeting` | Pi's greeting line |
| GET  | `/pi/discover` | Pi's topic suggestions |

`__cf_bm` rotates every ~30 min — always re-send a fresh one.

---

## DeepAI (`/deep/*`) — free, **no credentials**

Anonymous wrapper around deepai.org's free chat. Single model alias `standard`.
In-memory conversation continuity (cleared on restart).

| Method | Path | Purpose |
|---|---|---|
| POST | `/deep` | Chat. Body: `{message, conversation_id?, model?, history?, stream?}` |
| POST | `/deep/create` | Allocate a fresh conversation id |
| GET  | `/deep/conversations` | List in-memory conv ids |
| GET  | `/deep/history?conversation_id=…` | Full message log |
| POST | `/deep/delete` | Drop one conv |
| POST | `/deep/delete/all` | Wipe all (`{confirm:true}`) |
| GET  | `/deep/models` | Model alias map |

```bash
# One-shot
curl -X POST $BASE/deep -H 'Content-Type: application/json' \
  -d '{"message":"Hello in 5 words"}'

# Streaming SSE
curl -N -X POST $BASE/deep -H 'Content-Type: application/json' \
  -d '{"message":"Count 1 to 5","stream":true}'
```

---

## Project layout

```
app.py                 # Flask routes for all 5 backends
meta/main.py           # MetaAI client (GraphQL, auth, sidebar ops)
meta/generation.py     # Image/video generation helpers
meta/html_scraper.py   # Token + cookie extraction
gemini/client.py       # GeminiClient (StreamGenerate, account pool)
chatgpt/client.py      # ChatGPTClient (chatgpt.com SSE, pinned conv)
pi/client.py           # PiClient (pi.ai SSE v2)
deepai/client.py       # DeepAIClient (anonymous deepai.org chat)
requirements.txt
```

---

## Troubleshooting

- **"Cookies required"** — the `ecto_1_sess` cookie is missing. Re-export from
  the browser.
- **`GRAPHQL_VALIDATION_FAILED`** — meta.ai rotated a doc id. Re-scan the
  authenticated JS chunks for the new one and update either the env var override
  or the constant in `meta/main.py`.
- **Slow first call** — expected (~5s for `rd_challenge`). Subsequent calls in
  the same process are cached and faster.
- **`"You must be logged in to ..."`** — your cookies don't include the full
  authenticated set. Add `abra_sess` (and ideally `xs`, `c_user`) and retry.
  Use `POST /cookies/check` to confirm.
- **Garbled apostrophes / accents (e.g. `Iâ` instead of `I'`)** — caused by
  `text/event-stream` responses being decoded as Latin-1. Fixed in this build
  by forcing `response.encoding = "utf-8"` on the streaming chat response.
