<div align="center">

# Exocore

**A full-stack social + dev workspace for the Exocore community.**

`React + Vite SPA` · `TypeScript Express gateway` · `WSS multiplexer` · `Google-Drive-backed auth` · `In-browser code editor`

</div>

---

## Quick reference

| Service | Port | Description |
| --- | --- | --- |
| **Start application** | `5000` (webview) | `exocore-web` — React/Vite SPA + Express gateway, mounted under `/exocore`. |
| **Exocore Backend** | `3000` (console) | TypeScript auth + user backend, persisted to Google Drive. |

| Account | Username | Notes |
| --- | --- | --- |
| Demo / dev | `choruyt` (display: **Cute**) | Owner-pinned, used for capture screenshots. |

| Common tasks | Command |
| --- | --- |
| Install root deps | `npm install --legacy-peer-deps` |
| Run app (auto-builds client) | workflow **Start application** |
| Run backend | workflow **Exocore Backend** |
| Recapture docs screenshots | `EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-docs.ts` |

---

## Table of contents

1. [Services](#services) · [Architecture](#architecture) · [Build / run](#build--run)
2. [Social layer — Phase 1](#social-layer-phase-1) → [Phase 2](#social-layer-phase-2--friends--e2ee-dms)
3. [Roadmap (Phases 3 → 9)](#roadmap-remaining-phases--keep-this-list-in-sync-as-work-lands)
4. [Tracked changes summary](#tracked-changes-summary)
5. [Resume / continuation instructions](#resume--continuation-instructions-read-this-first-if-youre-a-fresh-agent)
6. [WSS-Only Migration](#wss-only-migration-in-progress) — Phases 1–7 (HTTP → RPC over a single persistent socket)
7. [Backend WSS bridge — Phase 8a → 8k](#phase-8--backend-wss-bridge--in-band-social-auth-2026-04-24) (in-band auth, msgpack codec, raw binary framing, terminal & LSP folded into the mux)
8. [HTTP cleanup — Phase 9](#phase-9--drop-the-dead-http-exocoreapiauthsocialadmin-route-files) (deleted dead REST routes)
9. [`dev-access` → RPC migration](#phase-8-migration-plan--dev-accessts--rpc) and [single persistent panel token](#phase-8-follow-up--single-persistent-panel-token)
10. [Editor: auto-save & local code history](#editor-auto-save--local-code-history-apr-2026) (diff view, merge picker, slider scrubber, project-folder storage)
11. [Visual documentation (Apr 24, 2026)](#visual-documentation-apr-24-2026) — `exocore-web/docs/` capture pipeline

---

## Services

- **Start application** (port 5000, webview) — `exocore-web`, the Vite + React frontend with an Express gateway. The SPA is mounted under `/exocore`. The dev script auto-builds the client once on startup and then serves `exocore-web/dist`.
- **Exocore Backend** (port 3000, console) — `Exocore-Backend`, the TypeScript auth + user backend backed by Google Drive.

## Architecture

### Backend (`Exocore-Backend/`, TypeScript, tsx runtime)

```
src/
├── index.ts             entry point + startup dedupe pass
├── services/
│   ├── drive.ts         Google Drive client + user CRUD helpers
│   └── mailer.ts        nodemailer (gmail) + branded HTML templates
├── utils/
│   ├── validate.ts      strong-password rules + disposable-email blocklist
│   └── dedupe.ts        scan & remove duplicate-email accounts
└── auth/
    ├── register.ts      multipart create + send verification email
    ├── login.ts         identifier (user/username/email/id) + pass
    ├── verify.ts        OTP confirm + 302 redirect to web for auto-login
    ├── userinfo.ts      pb / pv / edit / upload-avatar / upload-cover
    ├── forgot.ts        request-OTP + reset-with-OTP
    └── delete.ts        token + password → permanent account purge
```

The only `.js` file kept in the backend is `getToken.js` (Google OAuth refresh helper). Cred paths in `drive.ts` use `__dirname` + `../../` so they resolve correctly for both `tsx src/index.ts` (dev) and `node dist/index.js` (after `npm run build`).

#### Auth rules
- Passwords: ≥ 10 chars, upper + lower + digit + symbol, no spaces.
- Emails: format check + disposable-domain blocklist.
- One account per email (server-side enforced + auto-dedupe pass at startup).
- Verify link redirects back to `${host}/exocore/auth/callback?token=…&verified=1` so the web app auto-logs the user in (no second login).

#### Account deletion
- `POST /exocore/api/auth/delete` (or `DELETE`) takes `{ token, pass }`. Token alone is rejected — the password is required as a safety re-confirm so a stolen token can't nuke an account. On success the user's entire Drive folder (`database.json`, `avatar.png`, `cover.png`) is removed.
- The Dashboard exposes this via a red **Delete** button next to **Sign Out** in the top-right header.

### Web gateway (`exocore-web/routes/`)

- `_resolveBase.ts` resolves the upstream backend with a 30 s memo cache: prefers `local` from `urlData.json` if reachable, else falls back to the remote feed.
- `urlData.json` is set with `preferLocal: true` → `http://localhost:3000` for local dev.
- The routes walker (`routes/index.ts`) skips `urlData.json`, `index.*`, and any file starting with `_` so helper modules don't get loaded as routes.
- All `/auth/*` routes proxy to the backend, forwarding the user-facing `host` so the verify-redirect lands back on the right web origin.

### Web client (`exocore-web/client/access/auth/`)

- `Register.tsx` — 5-step wizard (Account → About → Where & when → Avatar → Cover). Includes a live password-strength meter, IP-based country auto-detect via `ipapi.co`, and a searchable country picker.
- `VerifyPending.tsx` — "check your inbox" screen. Detects the user's email provider (Gmail/Outlook/Yahoo/Proton/iCloud) and opens the inbox in a new tab. Resend has a 45 s cool-down.
- `AuthCallback.tsx` — stores the token from the verify-redirect and forwards to `/dashboard`.
- Avatar/cover are optional at registration and editable later from the profile.

### Routing model

`<BrowserRouter basename="/exocore">` is set in `client/main.tsx`, so every `navigate('/login')` / `navigate('/dashboard')` automatically resolves to `/exocore/login` / `/exocore/dashboard` in the browser URL. Direct calls to `window.location.href` use the explicit `/exocore/...` prefix.

## Build / run

- Root deps: `npm install --legacy-peer-deps --ignore-scripts` (the `--ignore-scripts` skips the failing `node-pty` native build).
- Backend deps: `cd Exocore-Backend && npm install`.
- Backend scripts: `dev`, `start`, `build` (tsc → `dist/`), `start:prod` (node `dist/index.js`).

## Social layer (Phase 1)

A real-time social hub now ships with the dashboard. It is layered on top of
the existing user store — no schema migration is needed; the new fields default
in code.

### Roles & owner pinning
- `UserData.role`: `"owner" | "admin" | "mod" | "user"` (defaults to `"user"`).
- Pinned owner emails (`Exocore-Backend/src/utils/owners.ts`):
  `userchoru@gmail.com`, `johnstevegamer5@gmail.com`, `exocoreai@gmail.com`,
  `chorutiktokers@gmail.com`. These are auto-promoted to `owner` on register
  and on every backend boot, and they cannot be demoted or banned.
- Hierarchy: owner > admin > mod > user. A caller can only assign / moderate
  roles strictly below their own (owner can do anything).
- Other social fields: `level` (0–1000, title bands in `titleForLevel`),
  `xp`, `achievements`, `bannedUntil` (ms epoch, `-1` = permanent),
  `banReason`, `restrictedUntil`.

### Backend HTTP additions (`Exocore-Backend/src/auth/admin.ts`)
- `GET  /exocore/api/auth/token-verify?token=…` → sanitized user (used by the
  gateway WSS to authenticate connections).
- `POST /exocore/api/admin/role`  `{ token, target, role }` (hierarchy gated).
- `POST /exocore/api/admin/ban`   `{ token, target, days, reason? }` where
  `days` is a positive number, `0` to unban, or `"perm"` for permanent.

### Gateway WSS hub (`exocore-web/server/social/`)
- Endpoint: **`wss://<host>/exocore/ws/social?token=<exo_token>`**
- Wire format: **binary `@msgpack/msgpack` frames** — payloads never appear as
  readable JSON in DevTools. TLS already protects the channel itself.
- On upgrade the hub calls `auth/token-verify` against the resolved backend
  base; banned users are rejected with close code `4403`.
- Tracks presence in-memory and broadcasts:
  - `auth:ok`, `auth:fail`
  - `presence:list`, `presence:join`, `presence:leave`
  - `chat:history`, `chat:msg`, `chat:deleted`
  - `user:updated`, `admin:ok`, `admin:err`, `error`, `pong`
- Accepts: `ping`, `presence:list`, `chat:send`, `chat:delete` (owner only),
  `admin:role`, `admin:ban`.
- Global chat is a 300-message ring persisted to
  `Exocore-Backend/local-db/global-chat.json` every 5 s.

### Frontend (`exocore-web/client/social/`)
- `useSocial.ts` — token-aware WSS hook with msgpack codec, exponential-backoff
  reconnect, ping every 25 s, exposes `presence`, `chat`, `me`, plus `send`,
  `deleteMessage`, `setRole`, `ban` actions.
- `SocialPanel.tsx` — floating button (bottom-right of Dashboard) that opens
  a chat / online-users panel with role badges (gold OWNER, red ADMIN, blue
  MOD, grey USER). Owners see a delete-button on every message; staff
  (owner / admin / mod) see promote / ban actions on every other user.
- Mobile-friendly: panel fills the screen edges below 480 px.

## Social layer (Phase 2 — friends + E2EE DMs)

Phase 2 extends the WSS hub with a friend graph and end-to-end encrypted
direct messages. Global chat stays server-readable on purpose so owners can
moderate; only DMs are encrypted client-side.

### New `UserData` fields (Phase 2)
- `pubKey` — base64 X25519 public key (32-byte raw point).
- `friends`, `friendRequests` (incoming pending),
  `sentFriendRequests` (outgoing pending) — all `string[]` of usernames.

### Backend HTTP additions (`Exocore-Backend/src/auth/social.ts`)
- `POST /exocore/api/social/pubkey`  `{ token, pubKey }` — register/replace.
- `GET  /exocore/api/social/peer?token=…&username=…` — public profile slice
  (username/nickname/role/level/pubKey only — no email or token).
- `GET  /exocore/api/social/friends?token=…` — returns
  `{ friends, incoming, outgoing, suggestions }`. Suggestions are ranked by
  mutual-friend count then newest account.
- `POST /exocore/api/social/friend`  `{ token, action, target }` where
  `action` is `request | cancel | accept | decline | remove`. A `request` to
  someone who already requested you is auto-accepted.

### Gateway WSS additions
New frame types accepted on `/exocore/ws/social`:
- `social:pubkey { pubKey }`              — proxy to backend register.
- `social:friends`                        — fetch the friends payload.
- `social:peer { username }`              — fetch a peer's pubKey/profile.
- `social:friend { action, target }`      — friend graph mutation.
- `dm:history { peer }`                   — get last 100 ciphertext records.
- `dm:send { to, ciphertext, nonce }`     — append to ring + push to peer.

New frame types emitted:
- `social:friends`, `social:peer`, `social:ok`, `social:err`,
  `social:friend-event { from, action }` (live notify the other side),
  `dm:history { peer, messages }`, `dm:msg` (broadcast to both ends).

DM ciphertext is stored per conversation in
`Exocore-Backend/local-db/dms/<sortedPair>.json` (200-message ring, flushed
every 5 s). The server **never** sees plaintext.

### Client crypto (`exocore-web/client/social/crypto.ts`)
- X25519 keypair generated on first run via `@noble/curves/ed25519.js`,
  private key persisted in IndexedDB (`exo_x25519_priv_v1`).
- DM key = `HKDF-SHA-256(x25519_shared(myPriv, peerPub), info="exo-dm-v1")`.
- AEAD = `xchacha20poly1305` (24-byte random nonce per message).
- Helpers: `ensureKeyPair`, `pubKeyB64`, `sealForPeer`, `openFromPeer`.

### Client UI updates (`SocialPanel.tsx`)
The panel now has 4 tabs: **GLOBAL** · **DMs** · **FRIENDS** · **ONLINE**.
- DMs tab lists every friend + every conversation with history. Opening a
  conversation fetches the recipient's pubKey, decrypts past messages, and
  every new `dm:msg` is decrypted on arrival. Undecryptable messages render
  as `[encrypted — peer key not available]`.
- Friends tab: search bar to add by username, separate sections for
  incoming requests, outgoing requests, current friends, and suggestions.
- Online tab now also has `dm` and `add` actions per row.

## Roadmap (remaining phases — keep this list in sync as work lands)

Each phase is meant to be picked up in a future agent session. They're
ordered by dependency, but Phase 3 and Phase 5 are mostly independent.

### ✅ Phase 3 — Posts & profile  *(landed)*
Implemented in `Exocore-Backend/src/auth/posts.ts` + `services/postsStore.ts`,
gateway proxy `exocore-web/routes/auth/posts.ts`, SPA pages in
`exocore-web/client/profile/Profile.tsx` (route `/exocore/u/:username`).
Post images live in the user's Drive folder as `post_<id>.png`. Comments are
text-only; owners (`role==="owner"`) can delete any post/comment, authors can
delete their own.

### Phase 3 — Posts & profile *(spec for reference)*
- New `posts.ts` route (backend): create / list / delete posts. Each post is
  one image (uploaded to the user's Drive folder as `post_<id>.png`) plus a
  text `description` (≤ 500 chars). No video.
- Per-user post feed under `/exocore/api/posts?username=…`.
- Comments on posts (text only). Owner can delete any comment; author can
  delete own comment.
- New profile-stalk route in the SPA: `/exocore/u/:username` showing
  avatar/cover, role/level/title, friends count, post grid, and (for the
  viewer) a friend/DM action bar.
- Mention-style links to profiles inside global chat & DMs.

### ✅ Phase 4 — Plans & manual payments  *(landed)*
Implemented in `Exocore-Backend/src/auth/plans.ts` + `services/paymentsStore.ts`,
gateway proxy `exocore-web/routes/auth/plans.ts`, SPA modals
`exocore-web/client/home/PlansModal.tsx` & `OwnerPaymentsPanel.tsx` (opened
from the dashboard header). Owner pings are broadcast through the global chat
channel via `systemAnnounce` in `exocore-web/server/social/hub.ts`. Plan badge
on chat rows is carried by `ChatMessage.plan`. New `UserData` fields:
`plan`, `planExpiresAt`, `pendingPaymentId`.

### Phase 4 — Plans & manual payments *(spec for reference)*
- New `plans.ts` route + new fields on `UserData`:
  `plan: "free" | "exo"`, `planExpiresAt: number | null`,
  `pendingPaymentId: string | null`.
- Plan catalog on the dashboard (just one plan for now: **EXO PLAN
  ₱100 / 3 months**, with FX-converted display via `https://api.frankfurter.app`
  using the user's `country` to pick the local currency).
- User flow: pick plan → see GCash + GoTyme QR/details → upload payment proof
  → status becomes `pending`. PMs to owners are sent in the global chat
  channel only (per the user's request).
- Owner panel additions: **Pending payments** list with approve/reject. On
  approve, set `plan = "exo"` and `planExpiresAt = now + 90 days`.
- Plan badge in chat row alongside the role badge (e.g. `EXO`).

### Phase 5 — Achievements, levels, titles ✅
- XP gain hooks wired:
  - `+1` per chat message (rate-limited to 1/min per user) — fired from the
    hub right after `appendMessage`, then `xp:gain` is sent to the sender on
    level-up / achievement and `user:updated` is broadcast.
  - `+5` per accepted friend request (both sides; auto-accept on mutual).
  - `+10` per post.
  - `+50` on EXO plan approval (also grants `paid_supporter`).
- Level curve `level = floor(sqrt(xp / 12))`, cap 1000. Title bands stay in
  `Exocore-Backend/src/utils/owners.ts::titleForLevel`.
- Endpoints: `POST /xp/grant`, `GET /xp/me`, `GET /xp/catalog` (gateway:
  `/exocore/api/auth/xp/...`).
- Achievements seed list (`utils/achievements.ts`): `first_message`,
  `first_friend`, `first_post`, `welcomed_owner`, `night_owl`,
  `paid_supporter`, `level_10/50/100`, idempotent via Set dedupe.
- UI: Profile page now shows an XP bar (`xp(L) = 12·L²` segment), title,
  and achievement chips (catalog fetched once). SocialPanel shows a
  golden `xp-toast` on level-up / new achievement.

### Phase 7 — Public leaderboard ✅
- Backend: `Exocore-Backend/src/auth/leaderboard.ts` exposes
  `GET /exocore/api/leaderboard?limit=50&sort=xp|level|achievements` returning
  ranked entries with `rank, username, nickname, avatarUrl, role, plan, level,
  xp, title, achievements, country`. Wired in `index.ts`. Filters out
  unverified accounts.
- Gateway proxy: `exocore-web/routes/auth/leaderboard.ts` →
  `/exocore/api/auth/leaderboard`.
- SPA: `exocore-web/client/leaderboard/Leaderboard.tsx` (route
  `/exocore/leaderboard`) — sortable tabs (XP / Level / Achievements),
  search, top-3 podium, ranked list with role + plan badges, links to
  `/u/:username`. Highlights the viewer's row when they're on the board.
  Mobile-friendly grid collapse. Dashboard header has a 🏆 Leaderboard
  button next to Profile.

### Phase 6 — Moderation deepening ✅
- Owner-only audit ring: `services/auditStore.ts` flushes a 5 s debounced
  ring buffer to `local-db/audit.json`. Hooks added on `role:set`,
  `ban:apply/lift`, `mute:apply/lift`, `post:delete`, `comment:delete`,
  `payment:approve/reject`. Endpoint `GET /audit` (owner-only).
- Time-boxed mute: `POST /admin/mute { token, target, minutes, reason? }`
  sets `restrictedUntil`. Hub blocks `chat:send` / `dm:send` when active
  and tells the user when it expires.
- Per-user rate limits: `services/rateLimit.ts::TokenBucket` shared by hub:
  chat = 10 burst @ 0.5/s, DM = 20 burst @ 1/s.
- Unban / unmute scheduler: hub re-pulls each connected user every 30 s and
  broadcasts `user:updated` (+ system message for ban lifts) when
  `bannedUntil` / `restrictedUntil` rolls past `Date.now()`.
- Owner panel rebuilt as **Owner Tools** with tabs: Pending / All payments /
  **Moderate** (mute + ban forms) / **Audit log**.

### Phase 8 — UX polish: account, mobile, profile, chat ✅
- **Critical bug fix:** `Dashboard.tsx` was setting `userData` to the backend
  *wrapper* (`{success, user, avatarUrl, coverUrl}`), which made every Account
  field render "[object Object]" / "—". The init now flattens
  `payload.user` and re-attaches `avatarUrl` / `coverUrl`.
- `Account.tsx`:
  * Typed `id` as `string | number`.
  * New locked fields: **Role** (color-coded badge), **Plan** (EXO highlight),
    **Presence** (live • Online).
  * New **Danger Zone** at the bottom with the Delete-account button (moved
    here from the dashboard header — safer; harder to mis-click).
- `Dashboard.tsx` header:
  * Header user button now opens **`/u/:username`** (avatar = profile click).
  * Added a separate **⚙ Account** button for editing.
  * Wrapped action buttons in `.dash-header-actions` (visible on desktop).
  * On phones (≤768px), the inline actions collapse into a kebab menu
    (`.dash-header-menu-wrap` / `.dash-header-kebab`) with: Profile, Account,
    Leaderboard, EXO plan, Payments (owner), Sign out.
  * Removed the dangerous Delete button from the header entirely.
- `Profile.tsx` (stalk view): added **meta chips** for ID, Plan, Status
  (✓ Verified / Unverified) and Presence (when self) under the existing
  level/friends/posts row.
- `SocialPanel.tsx`:
  * Fullscreen toggle in the panel header (`⛶` / `⤡`) — flips
    `.social-panel.fullscreen` to cover the whole viewport.
  * Global chat rows redesigned: avatar bubble (initials, role-tinted) +
    bubble with role badge, **clickable** name (`<Link to="/u/:user">`),
    timestamp, and the message body. Owner delete button preserved.
  * DM header peer name is now a clickable `@handle` link to the profile.
  * Friends / DMs / Online lists: every row's username is wrapped in a
    `Link` to `/u/:username` so any avatar/name click opens the profile.

### Phase 9 — 2026 social refresh ✅
- **Verified-only suggestions:** `Exocore-Backend/src/auth/social.ts::listFriends`
  now requires `u.verified === true` (was `!== false`) so only confirmed users
  show up in the SUGGESTIONS list. The list also has its own
  "✨ SUGGESTED · VERIFIED USERS" header on the Friends tab.
- **Post reactions (Facebook-style):** `Post.reactions: Record<emoji, string[]>`
  added in `Exocore-Backend/src/services/postsStore.ts` with a
  `toggleReaction(postId, emoji, username)` helper.
  - Emojis: `like / love / haha / wow / sad / angry`.
  - New endpoint `POST /exocore/api/posts/react { token, postId, emoji }`
    handled by `reactHandler` in `auth/posts.ts`, mounted in `index.ts`.
  - Gateway proxy added in `exocore-web/routes/auth/posts.ts::react`.
- **Global feed inside the social panel:** new `FEED` tab in
  `exocore-web/client/social/SocialPanel.tsx`. Pulls from
  `/exocore/api/auth/posts` (no `username` → global feed, newest first),
  auto-refreshes every 20 s while open. Each card has avatar + handle, post
  text/image, top-3 reaction emoji summary, **React** button with hover
  picker (👍❤️😂😮😢😡), Comment toggle, inline comment composer, and a
  delete button for the author/owner. Built-in mini composer at the top of
  the tab so users can post without leaving the panel.
- **Messenger-style DMs:** the DM list now renders as preview rows with
  avatar + last-message snippet + relative time + green online dot. The
  open conversation uses left/right bubbles (`dm-bubble-row.theirs`/`.mine`),
  per-author avatar (only on the first message of a streak), and a centered
  time divider whenever messages are >5 min apart. Mine = yellow bubble,
  theirs = dark bubble, with rounded corners that point toward the sender.
- **2026 visual polish in `social.css`:** glassy panel with
  `backdrop-filter`, gradient backgrounds on rows/feeds/composer, animated
  reaction picker (`reactPop`), pill buttons, custom thin scrollbars, tab
  active underline gradient, online presence bullets on avatars.

## Tracked changes summary

- Backend rewritten from JS → clean TS layout under `src/`.
- Strong password rules + disposable-email blocking + one-account-per-email enforcement + startup dedupe pass.
- Branded HTML email templates (verify + password reset) in the Exocore yellow neo-brutalist style.
- Verify flow auto-logs the user in on success.
- 5-step register wizard with country auto-detect, password strength meter, optional avatar/cover.
- Account deletion endpoint + Dashboard UI button.
- Local backend selection via `urlData.json` (`preferLocal: true`).
- Removed unused `Exocore-Backend/Dockerfile`. The remaining `getToken.js` stays for OAuth token refresh.

## RESUME / CONTINUATION INSTRUCTIONS (read this first if you're a fresh agent)

This whole project is a multi-session WSS migration. If your context is fresh and the previous agent ran out of credits/messages, start here:

1. **Goal**: Convert every HTTP route in `exocore-web/routes/` to WebSocket Secure (WSS) RPC. The user wants HTTP **gone** by Phase 9. Both server and client speak through one unified WSS hub at `wss://<host>/exocore/ws/rpc`.
2. **User language**: Tagalog/Taglish. Reply in kind, plain non-technical phrasing.
3. **Run the work in phases** — don't try to migrate everything at once. The phase table is below in *§Phased plan*. Each phase keeps the legacy HTTP route mounted as a safety net until **all** clients in that phase are switched, so the app never half-breaks.
4. **The wire format** is msgpack binary frames (same codec as `server/social/codec.ts`). Never use JSON or base64 — files travel as `Uint8Array` inside an `RpcFile = { name, type, bytes }` triple. The client helper is `rpcFile(File)` in `exocore-web/client/access/rpcClient.ts`.
5. **Where to add a new RPC method**:
   - Server: pick the right `*Handlers.ts` under `exocore-web/server/rpc/` (`authHandlers`, `socialHandlers`, `editorHandlers`, …) and call `registerHandler("namespace.method", async (d) => { … })`.
   - Use the helpers in `_helpers.ts`: `getBackend / postBackend / postBackendForm` (proxy to the auth backend on port 3000) **or** `getSelf / postSelf / postSelfForm` (self-loop into the local Express routes when the route owns the file system, e.g. editor routes). `requireString / optString / RpcError` for input validation.
   - Client: `import { rpc, rpcFile } from "../access/rpcClient"` then `await rpc.call<ReturnType>("namespace.method", { …data })`. Always `await import` lazily so the rpc client is code-split.
6. **Verifying a phase is live**: after restarting `Start application`, hit the hub with the snippet below. The `rpc:hello` greeting frame lists every registered method.
   ```js
   const ws = new (await import('ws')).WebSocket('ws://localhost:5000/exocore/ws/rpc');
   ws.on('message', (d) => console.log((await import('@msgpack/msgpack')).decode(d)));
   ```
7. **Workflows**: `Start application` (web, port 5000) and `Exocore Backend` (auth, port 3000). Restart with `restart_workflow`. If a port is stuck, `pkill -9 -f "tsx exocore-web"` then restart.
8. **What stays HTTP forever** is documented under *§Routes that intentionally stay HTTP*. Don't try to RPC the email-link verify, single-binary `/social/avatar`, or the `/exocore/port/<port>` user-app proxy — they cannot work over WSS.
9. **Always** update the *§Phased plan* status table when a phase lands, and append the new methods to the *§Methods registered* table so the next agent can see what's already done.
10. **Commit cadence**: an automatic checkpoint runs at the end of every loop. You don't need to commit manually.

If a phase produces a TypeScript `tsc` warning about ESM import extensions, the app still runs (`tsx` ignores it). Prefer **static imports** at the top of the handler file over `await import("…")` to keep the auto-build happy.

---

## WSS-Only Migration (in progress)

Goal: replace every HTTP route in `exocore-web/routes/` with WebSocket-Secure (WSS) RPC calls. The browser will keep a single persistent WSS connection to the gateway and call methods like `auth.login`, `editor.shell.exec`, etc., over msgpack frames. No `fetch`/`axios` to `/exocore/api/*` from the client.

### Architecture

- **Endpoint:** `wss://<host>/exocore/ws/rpc?token=<exo_token>` (token optional for pre-auth calls like `auth.login`).
- **Wire format:** binary `@msgpack/msgpack` frames, same codec as `server/social/codec.ts`. Request frame `{ t: "<method>", d: <payload>, id: "<corrId>" }`. Response frame `{ t: "rpc:ok" | "rpc:err", d: { method, result | message, status?, data? }, id }`.
- **Server hub:** `exocore-web/server/rpc/hub.ts` — generic registry + dispatcher. Handlers register via `registerHandler(name, fn)`; the hub mounts on the HTTP `upgrade` event in `exocore-web/index.ts`.
- **Client:** `exocore-web/client/access/rpcClient.ts` exposes a singleton `rpc.call(method, data, { token? })`. Auto-connects, pools one WSS, correlates responses by `id`, 20 s timeout.

### Phased plan (one batch per turn)

| Phase | Routes (server) | Client touchpoints | Status |
|-------|-----------------|--------------------|--------|
| 1 | `auth/login` | `Login.tsx` | DONE |
| 2 | `auth/register`, `auth/verify` (OTP/resend), `auth/forgot` | `Register.tsx`, `VerifyPending.tsx`, `Forgot.tsx` | DONE |
| 3 | `auth/userinfo`, `auth/delete`, `auth/plans`, `auth/xp`, `auth/audit`, `auth/leaderboard` | `Dashboard.tsx`, `Account.tsx`, `KittyTerminal.tsx`, `Leaderboard.tsx`, `PlansModal.tsx`, `OwnerPaymentsPanel.tsx`, `Profile.tsx` (xp.catalog) | DONE |
| 4 | `auth/posts`, `social.ts`, `admin.ts` | `SocialPanel.tsx`, `Profile.tsx` (posts + friend), `OwnerPaymentsPanel.tsx` (admin.ban/mute) | DONE |
| 5 | `editor/coding`, `editor/projects`, `editor/templates`, `editor/runtime`, `editor/deps` | `Dashboard.tsx`, `FileManager.tsx`, `coding.tsx`, `Sidebar.tsx`, `tsChecker.ts`, `ExocoreAI.tsx` (coding.* only), `ConsolePane.tsx` (runtime.kill), `GenericPackagePane.tsx` (deps.list) | DONE |
| 6 | `editor/npm`, `editor/pylib`, `editor/gdrive`, `editor/github`, `editor/ai` | `NpmPane`, `PyLibrary`, `GDrivePane`, `GithubPane`, `Layout`, `home/GDriveManager`, `home/GithubManager`, `home/Dashboard` (auto-import restore), `editor/ExocoreAI`, `editor/ai/ExoSetupPanel`, `editor/ai/exocore.ts` | DONE |
| 7 | `editor/shell`, `editor/lspBridge` (already partial WS) — fold their existing upgrades into the unified RPC scheme where it makes sense | terminal + LSP client | IN PROGRESS |
| 8 | `dev-access.ts` | dev gate (`PanelDevsGuard`) | DONE |
| 9 | Delete the now-unused HTTP route handlers under `exocore-web/routes/auth/**`, `routes/admin.ts`, and trim `routes/social.ts` to the binary-avatar GET. The `/exocore/api/*` mount itself stays because editor RPCs self-loop into it. | n/a | DONE |

Each phase keeps the HTTP route alive until both server handler **and** every client caller have been switched to RPC, so we never break a half-migrated screen.

### Phases 1–3 — done

- **Server registry** lives in `exocore-web/server/rpc/`:
  - `hub.ts` — generic dispatcher mounted at `/exocore/ws/rpc`. Sends a one-shot `rpc:hello` frame on connect that lists every registered method.
  - `_helpers.ts` — `getBackend / postBackend / postBackendForm / RpcError / requireString / optString` plus the `RpcFile` type. `postBackendForm` accepts `{ name, type, bytes }` triples and forwards them as multipart to the backend.
  - `authHandlers.ts` — registers every Phase 1–3 method.
- **Client side**: `exocore-web/client/access/rpcClient.ts` exposes `rpc.call(method, data, opts)` and a `rpcFile(File)` helper that converts a browser `File` into the binary triple. msgpack carries the bytes natively (no base64 overhead).
- **Backwards compatibility**: every legacy HTTP `/exocore/api/...` route is still mounted in parallel until Phase 9, so any not-yet-migrated caller keeps working.

#### Methods registered

| Method | Maps to backend |
|--------|-----------------|
| `auth.login` | POST `/exocore/api/auth/login` |
| `auth.register` | POST `/exocore/api/auth/register` (multipart, `avatar` + `cover`) |
| `auth.verify` | GET `/exocore/api/auth/verify` (OTP confirm, JSON) |
| `auth.verify.resend` | GET `/exocore/api/auth/verify?req=now` (re-send the link) |
| `auth.forgot.request` | GET `/exocore/api/auth/forgot?req=now` |
| `auth.forgot.reset` | GET `/exocore/api/auth/forgot` with `email`, `otp`, `pass` |
| `auth.userinfo.get` | GET `/exocore/api/auth/userinfo?source=…` |
| `auth.userinfo.edit` | POST `/exocore/api/auth/userinfo?source=edit` |
| `auth.userinfo.upload` | POST `/exocore/api/auth/userinfo?source=upload-avatar|upload-cover` |
| `auth.delete` | POST `/exocore/api/auth/delete` |
| `plans.catalog` / `plans.me` / `plans.pending` | GETs under `/exocore/api/plans/…` |
| `plans.submit` | POST `/exocore/api/plans/submit` (multipart proof file). Re-emits the owner system-announce on success. |
| `plans.decide` | POST `/exocore/api/plans/decide`. Re-emits the approve/reject system-announce. |
| `xp.me` / `xp.catalog` | GETs under `/exocore/api/xp/…` |
| `audit.list` | GET `/exocore/api/audit` |
| `leaderboard.list` | GET `/exocore/api/leaderboard` |
| `posts.list` / `posts.profile` | GETs under `/exocore/api/posts/…` |
| `posts.create` | POST `/exocore/api/posts/create` (multipart, optional `file`). Re-broadcasts `postsUpdated("create")`. |
| `posts.delete` / `posts.react` / `posts.comment` / `posts.comment.delete` | POSTs under `/exocore/api/posts/…`. All re-broadcast `postsUpdated(<reason>)` on success so other tabs auto-refresh. |
| `social.friends` / `social.peer` / `social.avatars` | GETs under `/exocore/api/social/…` |
| `social.pubkey` / `social.friend` | POSTs under `/exocore/api/social/…` |
| `admin.role` / `admin.ban` / `admin.mute` | POSTs under `/exocore/api/admin/…` |
| `coding.files` / `coding.read` | GETs under `/exocore/api/editor/coding/…` |
| `coding.save` / `coding.create` / `coding.delete` / `coding.rename` / `coding.move` | POSTs under `/exocore/api/editor/coding/…`. Optional `source` field forwards as `x-exo-source` header (used by ExocoreAI agent writes). `coding.create` and `coding.extract` accept a `file` RpcFile for multipart uploads. |
| `projects.list` / `projects.create` / `projects.archive` / `projects.unarchive` / `projects.delete` / `projects.rename` | GET / POSTs under `/exocore/api/editor/projects/…`. All accept optional `token`. |
| `templates.list` | GET `/exocore/api/editor/templates/list` |
| `runtime.start` / `runtime.stop` / `runtime.kill` / `runtime.restart` | POSTs under `/exocore/api/editor/runtime/…` |
| `runtime.status` / `runtime.list` / `runtime.config.get` / `runtime.config.save` | GETs (and one POST) under `/exocore/api/editor/runtime/…` |
| `deps.list` | GET `/exocore/api/editor/deps/list` (params: `projectId`, `language`, `runtime`) |

#### Routes that intentionally stay HTTP

- **Email-link verify** — `GET /exocore/api/auth/verify` is hit by the link in the verification email. Browsers can't open WSS from an `<a href>`, so this entrypoint stays HTTP and 302-redirects into `/exocore/auth/callback` for auto-login. The OTP confirm + resend buttons inside the SPA use the `auth.verify` / `auth.verify.resend` RPC methods instead.
- **`/exocore/settings.json` + `/exocore/api/settings`** — pure file IO for the bundled `settings.json`, not a backend proxy. Will be folded into RPC alongside Phase 8.
- **`GET /exocore/api/social/avatar`** — returns binary image bytes consumed by `<img src>` tags. Browsers can't load image elements from a WSS frame, so this single-image endpoint stays HTTP. The bulk JSON listing (`social.avatars`) is on RPC.
- **`/exocore/port/<port>/...`** — the static-port reverse-proxy for user projects. By definition these forward arbitrary HTTP to user-spawned servers, so they remain HTTP forever.
- **`POST /exocore/api/editor/templates/create-from-template`** — streams progress to the install modal via Server-Sent Events. The current `rpc.call()` model returns a single result; until we add an `rpc.stream()` channel this endpoint stays HTTP. Used by `InstallModal.tsx`.
- **`GET /exocore/api/editor/coding/media`** — returns binary file bytes for `<img src>` / `<video src>` previews inside the editor. Stays HTTP for the same reason as `/social/avatar`. Used by `Editor.tsx` and `coding.tsx`.
- **`GET /exocore/api/editor/coding/download` / `download-file` / `download-folder`** — browser-driven file/zip downloads via `<a href>`. Stay HTTP. Used by `Sidebar.tsx`.
- **`POST /exocore/api/editor/coding/create` (multipart upload) and `coding/extract`** — the file-upload paths in `Sidebar.handleFileUpload` still use HTTP multipart for now. The RPC handlers exist (`coding.create` / `coding.extract` accept an `RpcFile`), so this can be flipped to RPC anytime; left on HTTP to keep the upload progress UX simple.

---

## Phase 7 — `editor/shell` + `editor/lspBridge` (in progress)

### Current state (pre-migration)

Both routes mount **their own** dedicated `WebSocketServer` instances on the HTTP `upgrade` event, side-by-side with the unified RPC hub:

- `exocore-web/routes/editor/shell.ts` (506 lines) — owns:
  - `ws://…/exocore/api/editor/shell/pty` — interactive terminal session (uses `node-pty` when available, falls back to `child_process.spawn` of the user's shell). Also exposes a fat HTTP API for "active console" management: spawn/stop/restart of the project's `runCmd`, port detection, output history ring, optional cloudflared tunnel, exoConfig persistence.
  - `ws://…/exocore/api/editor/shell/console/:projectId` — read-only attach to a project's running console (output stream + status frames).
  - HTTP sidekicks: `POST /shell/start`, `/shell/stop`, `/shell/restart`, `/shell/kill-port`, `GET /shell/status`, `/shell/ports`, `/shell/config`, `POST /shell/config`.

- `exocore-web/routes/editor/lspBridge.ts` (121 lines) — owns:
  - `ws://…/exocore/api/editor/lsp/:projectId` — spawns `typescript-language-server --stdio` per session and bridges LSP framed messages (`Content-Length:` headers) over the WS. Pure stream-multiplex; no HTTP side.

Client touchpoints:
- Terminal UI: `client/terminal/KittyTerminal.tsx` and `client/editor/ConsolePane.tsx` (attach to `/shell/console/:projectId`).
- LSP client: `client/editor/tsChecker.ts` (currently still HTTP-fallback for diagnostics) and the in-editor language client.

### Why these are special

Unlike Phases 1–6 (request → single response), shell and LSP are **bidirectional persistent streams**: many frames in, many frames out, lifetime tied to a child process. The existing `rpc.call()` returns one result and resolves — that doesn't fit a terminal.

### Design: `rpc.stream()` channel

Add a streaming primitive on top of the same `/exocore/ws/rpc` socket so we don't need a second WSS endpoint:

- **Open frame** (client → server): `{ t: "rpc:open", d: { method, params }, id }` where `id` doubles as the **stream id**.
- **Server ack**: `{ t: "rpc:open:ok" | "rpc:open:err", d: {…}, id }`.
- **Data frames** (both directions): `{ t: "rpc:data", d: <payload>, id }`. Payload shape is method-specific (e.g. `{ kind: "stdout", bytes }` for shell, raw LSP message body for lsp).
- **Close** (either side): `{ t: "rpc:close", d: { reason? }, id }` → server tears down the child process; client cleans up its handler map.

Server: `hub.ts` gains `registerStream(name, openFn)` where `openFn(params, ctx)` returns `{ onClientFrame, onClose, push, end }`. Stream handlers live in a new `editorStreamHandlers.ts`.

Client: `rpcClient.ts` gains `rpc.stream(method, params)` returning `{ send(frame), onData(cb), onClose(cb), close() }`. No new socket.

### Methods to register (Phase 7)

| Stream method | Replaces | Notes |
|---------------|----------|-------|
| `editor.shell.pty` | `ws /shell/pty` | Open with `{ projectId, cols, rows, shell? }`. Client → `{ kind: "input", bytes }` and `{ kind: "resize", cols, rows }`. Server → `{ kind: "output", bytes }`, `{ kind: "exit", code }`. |
| `editor.shell.console` | `ws /shell/console/:projectId` | Read-only attach. Server emits the history ring on open, then live `output` + `status` frames. |
| `editor.lsp.session` | `ws /lsp/:projectId` | Open with `{ projectId, server?: "ts" }`. Frames carry the LSP JSON body as `Uint8Array` — server adds the `Content-Length:` framing on stdin and strips it on stdout. |

| Unary RPC | Replaces |
|-----------|----------|
| `shell.start` / `shell.stop` / `shell.restart` / `shell.killPort` | `POST /shell/{start,stop,restart,kill-port}` |
| `shell.status` / `shell.ports` | `GET  /shell/{status,ports}` |
| `shell.config.get` / `shell.config.save` | `GET` / `POST /shell/config` |

### Migration order (sub-steps inside Phase 7)

1. ✅ **DONE** — Added `rpc:open / rpc:data / rpc:close` framing + `registerStream(name, openFn)` to `server/rpc/hub.ts`. Open frame: `{ t: "rpc:open", d: { method, params }, id }` → server replies `rpc:open:ok` / `rpc:open:err` with the same `id`. Data flows in **both** directions as `rpc:data` frames keyed by stream id. Either side can `rpc:close`. The `rpc:hello` greeting now also lists `streams: [...]`. Per-connection stream registry is cleaned up on socket `close` / `error`. Client side: `rpc.stream(method, params)` in `client/access/rpcClient.ts` returns `{ id, send, onData, onClose, close }` — multiplexed over the same single WSS that `rpc.call` uses. `rpc.call` semantics unchanged.
2. ✅ **DONE — all three editor streams registered.** Module: `exocore-web/server/rpc/editorStreamHandlers.ts` (wired into `hub.ts::createRpcWss`).

   - **`editor.shell.console`** — auto-restart project console (the "Logs" tab)
     - Added `attachConsole(projectId, adapter, opts?)` public method on `TerminalManager` (`exocore-web/routes/editor/shell.ts`) plus a `getTerminalManager()` singleton getter (set in the constructor).
     - `ActiveConsole` now tracks both legacy `listeners: Set<WebSocket>` **and** new `adapterListeners: Set<ConsoleAdapter>`. `broadcast()` fans-out to both, so the legacy `/exocore/terminal` WSS endpoint and the new RPC stream share the same `activeConsoles` map / process / port-detect / tunnel / auto-restart machinery (no duplication, no second process per project).
     - Open params: `{ projectId, forceRestart? }`. Server → client: `{ kind: "output", data }`. Client → server: `{ kind: "input", text }` (forwarded to `process.stdin`; `\x03` = SIGINT). `close` only detaches this adapter — the underlying process keeps running for other listeners.

   - **`editor.shell.pty`** — interactive shell (xterm)
     - New `attachPty(opts, adapter)` standalone export in `shell.ts`. Honors `cols / rows / user / projectId / cwd`, falls back to a friendly error message when `node-pty` is not compiled. Same prompt-override logic as the legacy WSS branch (bash / zsh / fish, blue `user@exocore <cwd> $`).
     - Open params: `{ cols?, rows?, user?, projectId? }`. Server → client: `{ kind: "output", data }`. Client → server: `{ kind: "input", text }` and `{ kind: "resize", cols, rows }`. `close` kills the pty.

   - **`editor.lsp.session`** — typescript-language-server bridge
     - Refactored `lspBridge.ts` to expose `attachLspSession(projectId, adapter)` returning `{ sendMessage, close }`. The `Content-Length:` header framing stays inside the helper — the adapter only sees the raw JSON body. Used by both the legacy `/exocore/api/editor/lsp/ts` WSS endpoint and the new RPC stream.
     - Open params: `{ projectId, server?: "ts" }`. Both directions: `{ kind: "msg", text: <LSP JSON body> }`. `close` SIGTERMs the language server.

   - **Verified live:** `rpc:hello` greeting now lists `streams: ["editor.lsp.session","editor.shell.console","editor.shell.pty"]`. Legacy WSS endpoints still mounted as the safety net per the migration rule.
3. ✅ **DONE — unary `runtime.*` RPC methods registered** in `editor2Handlers.ts` (the actual project-lifecycle endpoints live in `routes/editor/runtime.ts`, not `shell.ts`). Six new methods wrap the existing self-routes via `postSelf / getSelf`:
   - `runtime.start` (params: `{ projectId, command?, port? }`) → POST `/editor/runtime/start`
   - `runtime.stop` (params: `{ projectId }`) → POST `/editor/runtime/stop`
   - `runtime.kill` (params: `{ projectId }`) → POST `/editor/runtime/kill`
   - `runtime.restart` (params: `{ projectId }`) → POST `/editor/runtime/restart`
   - `runtime.status` (params: `{ projectId }`) → GET `/editor/runtime/status/:projectId`
   - `runtime.list` (no params) → GET `/editor/runtime/list`
   - `runtime.config.get` / `runtime.config.save` already existed from earlier phase — left untouched.
   - Verified live: total handler count is now **106**; `runtime.list` smoke-test returned `rpc:ok` with `[]`.
4. Switch clients in this order so we can ship + test each:
   - `ConsolePane.tsx` → `editor.shell.console` (read-only, lowest risk).
   - `KittyTerminal.tsx` → `editor.shell.pty` (interactive, includes resize handling).
   - `tsChecker.ts` + the in-editor LSP client → `editor.lsp.session`.
   - All `shell.*` HTTP callers → unary RPC.
6. Once every caller is migrated, leave the legacy WSS endpoints mounted as a safety net for one phase, then remove them in Phase 9 alongside the HTTP cleanup.

### Files that will change

- `exocore-web/server/rpc/hub.ts` (+ new `editorStreamHandlers.ts`)
- `exocore-web/server/rpc/_helpers.ts` (already has `getSelf/postSelf`)
- `exocore-web/server/editor/consoles.ts` (new — extracted from `shell.ts`)
- `exocore-web/client/access/rpcClient.ts` (add `rpc.stream`)
- `exocore-web/client/terminal/KittyTerminal.tsx`
- `exocore-web/client/editor/ConsolePane.tsx`
- `exocore-web/client/editor/tsChecker.ts` and the LSP client wiring
- `exocore-web/routes/editor/shell.ts` and `lspBridge.ts` stay mounted (legacy) until Phase 9.

## Phase 8 — Backend WSS bridge & in-band social auth (2026-04-24)

Two related changes that cut the chatty HTTP traffic between `exocore-web`
and `Exocore-Backend` and stop leaking the auth token in URLs.

### 8a — Social WSS now authenticates in-band

- **Client (`exocore-web/client/social/useSocial.ts`):** the WebSocket URL
  is plain `/exocore/ws/social` (no `?token=…`). Right after `onopen`, the
  client emits a single msgpack frame `{ t: "auth", d: { token } }`.
- **Server (`exocore-web/server/social/hub.ts`):** the upgrade handler no
  longer reads the token from the query string. `wss.on("connection")` waits
  for an in-band `auth` frame, validates it against the backend, and only
  then registers the `Conn`. A 10 s timeout drops sockets that never
  authenticate. Frames that arrive in the brief window before auth completes
  are queued (capped at 32) and replayed via `ws.emit("message", …)` once
  `finishAuth` resolves — so the existing `social:pubkey` / `social:friends`
  calls fired on open still work without an extra round-trip.
- **Why:** kept the token out of URLs / proxy access logs / the browser
  Network tab. Reconnect storms still show frequent `social` rows in the
  inspector but they no longer carry the bearer token in the URL.

### 8b — `Exocore-Backend` exposes a single persistent WSS bridge

- **Backend (`Exocore-Backend/src/wsBridge.ts`)** — new file. Attaches a
  `WebSocketServer` to the existing `http.Server` returned from
  `app.listen(...)` on path `/ws/bridge`. Each request frame is a small
  JSON envelope `{ id, method: "GET"|"POST", path, params?, body? }`. The
  bridge forwards to `http://localhost:${PORT}${path}` via axios (so all
  existing Express routes keep working unchanged) and replies with
  `{ id, ok, status, data }`. Heartbeat ping every 30 s; `pong` rolls the
  liveness flag, otherwise the socket is `terminate()`'d.
- **Web (`exocore-web/server/backendWs.ts`)** — new singleton client.
  Maintains one persistent `ws://…/ws/bridge` connection (resolved through
  the existing `_resolveBase`), exponential reconnect backoff (500 ms →
  15 s), id-correlated request/response, eager connect on import.
  Exposes `backendCall(method, path, params?, body?, timeoutMs?)` returning
  the same `{ ok, status, data }` shape the rest of the codebase already
  expects.
- **`exocore-web/server/social/hub.ts` migration:** `authToken`,
  `avatarFor`, `callBackend`, and `callAdmin` now route through
  `backendCall` instead of axios. Per-message backend traffic during a
  busy chat (`chat:send` → `xp/grant`, `chat:msg` → `social/avatar` lookup,
  every `social:friend` action → `social/friends` refresh) collapses from
  multiple TCP+HTTP round-trips per event to a single multiplexed WSS
  frame each, eliminating the "DDoS-like" log spam on the backend.
- **Routes still on HTTP:** the request-scoped proxies under
  `exocore-web/routes/auth/*` and `routes/social.ts` are still axios — they
  are 1 web HTTP request → 1 backend HTTP request, so they don't fan out
  and don't benefit from the bridge. Future phase can migrate them too if
  we want a single transport everywhere.

## Phase 8c — Express auth proxies migrated to the WSS bridge (2026-04-24)

Moved every JSON HTTP proxy in `exocore-web/routes/**` from axios onto the
persistent backend WSS bridge introduced in 8b. Multipart endpoints
(register, posts/create, plans/submit, userinfo upload-avatar/upload-cover)
stay on axios because the bridge envelope is JSON-only.

### What changed

- **New `exocore-web/routes/_proxy.ts`** — tiny `proxyGet(res, path, params)`
  / `proxyPost(res, path, body, params)` helper that wraps `backendCall` and
  forwards `{status, data}` back to the express response.
- **`server/rpc/_helpers.ts`** — `getBackend` and `postBackend` now route
  through `backendCall` instead of axios. Every RPC handler that used these
  helpers is auto-migrated. `postBackendForm` stays on axios.
- **Migrated route files** (all axios proxy paths replaced with the bridge):
  `routes/social.ts`, `routes/admin.ts`, `routes/auth/login.ts`,
  `routes/auth/forgot.ts`, `routes/auth/delete.ts`,
  `routes/auth/leaderboard.ts`, `routes/auth/audit.ts`,
  `routes/auth/xp.ts`, `routes/auth/userinfo.ts` (GET + edit),
  `routes/auth/posts.ts` (list / profile / delete / react / comment /
  comment-delete), `routes/auth/plans.ts` (catalog / me / pending / decide).
- **Intentionally NOT migrated:**
  - `routes/auth/register.ts`, `posts.ts::create`, `plans.ts::submit`,
    `userinfo.ts::upload-*` — multipart form uploads, JSON bridge can't
    carry them.

## Phase 8d — Bridge envelope carries response headers (2026-04-24)

The WSS bridge response now includes the upstream response headers, and
clients can opt out of automatic redirect following. This unlocks the last
JSON proxy that still needed axios.

### What changed

- **Backend (`Exocore-Backend/src/wsBridge.ts`):**
  - Response envelope gained `headers: Record<string, string>` (lowercased).
  - Request envelope accepts `followRedirects?: boolean` (default `true` —
    backward compatible). When `false`, the bridge sets `maxRedirects: 0`
    on the upstream axios call and still returns the 3xx as a normal
    response (with `Location` in `headers`).
- **Web (`exocore-web/server/backendWs.ts`):**
  - `BackendResult.headers?: Record<string, string>` is now populated.
  - New `BackendCallOpts { followRedirects?: boolean }` passed as an
    optional 6th arg to `backendCall(...)`. When `followRedirects: false`
    is requested, the flag is forwarded in the envelope.
- **Migrated route:** `routes/auth/verify.ts` is now on the bridge.
  Calls `backendCall("GET", "/exocore/api/auth/verify", …, undefined,
  10_000, { followRedirects: false })` and forwards `headers.location`
  via `res.redirect(...)` for the auto-login bounce. axios import dropped.

### What still uses axios (post-8d)

Nothing in `exocore-web/routes/**` once Phase 8e lands — see below.

## Phase 8e — Multipart uploads ride the bridge (2026-04-24)

The bridge envelope now carries binary file parts, so the last four axios
proxies (the multipart paths) are migrated. axios is no longer imported by
any file under `exocore-web/routes/`.

### What changed

- **Backend (`Exocore-Backend/src/wsBridge.ts`):**
  - Request envelope accepts `files?: Array<{ field, name, type, b64 }>`.
    When present, the bridge rebuilds a `form-data` body and POSTs it
    upstream instead of forwarding `body` as JSON.
  - WSS `maxPayload` raised to 32 MiB so a 20 MiB upload (≈27 MiB after
    base64) fits inside one frame. Upstream axios `timeout` raised to 30 s
    and body/content limits removed for these big POSTs.
- **Web (`exocore-web/server/backendWs.ts`):**
  - New `BridgeFilePart { field, name, type, bytes: Buffer }` type.
  - `BackendCallOpts.files?: BridgeFilePart[]`. When provided, the client
    base64-encodes each `bytes` buffer into the JSON envelope before send.
- **Web (`exocore-web/routes/_proxy.ts`):**
  - New `proxyPostMultipart(res, path, body, files, params?)` helper —
    same `{status,data}` forwarding as the existing `proxyPost`.
- **Migrated routes** (axios + `form-data` + `_resolveBase` imports dropped):
  - `routes/auth/register.ts` — avatar + cover.
  - `routes/auth/userinfo.ts::upload-avatar | upload-cover` — single `file`.
  - `routes/auth/posts.ts::create` — optional `file` + text fields.
  - `routes/auth/plans.ts::submit` — optional proof `file` + text fields.

### Codec note

Earlier draft of 8e shipped with base64-in-JSON for files. Phase 8f
below replaced that with msgpack so files now ride as raw `Uint8Array`
with zero size overhead.

## Phase 8f — Bridge codec switched to msgpack (2026-04-24)

Replaced the JSON envelope on `/ws/bridge` with `@msgpack/msgpack`
binary frames — the same codec the social hub already uses
(`server/social/codec.ts`).

### What changed

- **Backend (`Exocore-Backend/src/wsBridge.ts`):** added
  `@msgpack/msgpack` dep. `ws.on("message")` now `decode()`s the
  incoming Buffer; outgoing replies go through `encode()` and are sent
  as binary frames. The `files[]` envelope entries carry raw
  `Uint8Array` `bytes` instead of `b64`, so a 20 MiB upload travels as
  20 MiB of frame body (no base64 inflation).
- **Web (`exocore-web/server/backendWs.ts`):** same codec swap on the
  client side. `ws.maxPayload` raised to 32 MiB (matches the server).
  `BridgeFilePart.bytes` is forwarded directly as `Uint8Array` — no
  per-call base64 step.
- **Route helpers and migrated routes** were unchanged — `proxyPost`,
  `proxyPostMultipart`, and the four multipart routes all still pass
  `Buffer` bytes; only the wire format under them flipped.

### Why it matters

- A 20 MiB avatar upload was ≈27 MiB on the wire under the old
  base64-in-JSON envelope; it's now exactly 20 MiB + ~hundred bytes of
  msgpack header.
- Codec is now consistent with `/exocore/ws/social` and
  `/exocore/ws/rpc`, which both already use msgpack — one less
  serialization shape to reason about.

### Verified

- Backend boots with `🛰️ Bridge WS attached at /ws/bridge`.
- Web boots, the persistent bridge connects on import.
- Smoke tests `GET /exocore/api/auth/xp/catalog` and
  `GET /exocore/api/auth/leaderboard?limit=3` both return `200`.
- `axios` and `form-data` are absent from every file under
  `exocore-web/routes/auth/**`. The remaining `axios` usages in
  `routes/editor/{npm,github,gdrive,ai}.ts` talk to **external** APIs
  (npmjs, GitHub, Google Drive, AI providers), and `_resolveBase.ts`
  uses it once to bootstrap which backend host to point the bridge at —
  none of those go through `Exocore-Backend`, so the bridge migration
  is complete.

## Phase 8g — Multiplexed WSS endpoint `/exocore/ws`

The browser used to open two long-lived sockets per session:
`/exocore/ws/social` and `/exocore/ws/rpc`. Both now ride a single
multiplexed carrier at `/exocore/ws`, with channel routing handled by
a thin server-side and client-side wrapper.

### Wire format

Every frame on the carrier is a msgpack object:

```
{ t: "mux:open" | "mux:data" | "mux:close",
  ch: "social" | "rpc",
  bin?: Uint8Array,   // raw inner frame (msgpack already)
  url?: string,       // open-only — synthetic req.url for the hub
  code?, reason?: string }
```

- `mux:open` creates a sub-socket on the named channel.
- `mux:data` carries one inner frame in either direction.
- `mux:close` tears the channel down.

### Server (`exocore-web/server/wsMux.ts`)

`createMuxWss({ social, rpc })` returns a `WebSocketServer` (noServer
mode) that the main upgrade dispatcher in `exocore-web/index.ts`
mounts at `/exocore/ws`. On `mux:open` it builds a `MuxedSocket`
(EventEmitter that quacks like `ws.WebSocket` — same `send`, `close`,
`readyState`, `on("message"|"close"|"error")`, `emit`, `terminate`,
`ping` surface the existing hubs already use) and emits
`'connection'` on the matching hub with a synthetic `IncomingMessage`
whose `url` carries any query string (so `req.url` based auth like
`?token=…` keeps working in the rpc hub). Carrier-level WS ping every
30 s drops dead TCP. Hubs were not modified.

### Client (`exocore-web/client/access/wsMux.ts`)

`muxCarrier.openChannel(name, urlPath?)` returns a `MuxChannel` that
is API-compatible with `WebSocket` for the surface the existing code
uses (`send`, `close`, `readyState`, `binaryType`, `onopen`,
`onmessage`, `onclose`, `addEventListener`/`removeEventListener` for
`"message"`). It returns synchronously and queues outbound frames
until the underlying carrier is open, then flushes and fires `onopen`.

`exocore-web/client/access/rpcClient.ts` and
`exocore-web/client/social/useSocial.ts` were updated to call
`muxCarrier.openChannel(...)` instead of `new WebSocket(...)`. No
other call sites changed.

### Safety net

`/exocore/ws/social` and `/exocore/ws/rpc` are still mounted in
`exocore-web/index.ts` so older clients keep working through this
phase. They can be removed in a follow-up phase once we're confident
no external script is connecting to them directly.

### Verified

- `npx tsc -p exocore-web/tsconfig.server.json` — clean.
- `npx vite build --config exocore-web/vite.config.mts` — clean.
- Smoke test: connecting `ws://localhost:5000/exocore/ws`, sending
  `{ t: "mux:open", ch: "rpc", url: "/exocore/ws/rpc" }`, and
  decoding the carrier reply yields a `mux:data` frame whose inner
  msgpack payload is `{ t: "rpc:hello", … }` from the RPC hub.
- App preview at `/exocore` loads cleanly post-restart.

## Phase 8h — Drop legacy `/exocore/ws/social` and `/exocore/ws/rpc`

Now that every browser client routes through `/exocore/ws` (Phase 8g),
the two legacy paths were removed from the upgrade dispatcher in
`exocore-web/index.ts`. The hub factories themselves
(`createSocialWss`, `createRpcWss`) are unchanged — they're just no
longer wired to a path of their own; the mux carrier is their only
entry point.

### Verified

- `ws://localhost:5000/exocore/ws/social` and
  `ws://localhost:5000/exocore/ws/rpc` now return `socket hang up`
  (handshake refused).
- Mux probe on `ch: "rpc"` still gets `rpc:hello`.
- Mux probe on `ch: "social"` with a junk token still gets
  `auth:fail` — proves the social hub is reachable through the
  carrier and rejects bad creds the same way it always did.

## Phase 8i — Raw binary framing on the mux carrier

Replaced the msgpack-wrapped envelope (`{ t, ch, bin }`) on the
`/exocore/ws` carrier with a 2-byte header + raw payload:

```
+------+------+------------+----------------+
| type | nlen | name (N B) | payload (rest) |
+------+------+------------+----------------+
```

- `type` u8: 1 = open, 2 = data, 3 = close.
- `nlen` u8: channel-name length (UTF-8, ≤255).
- `payload`:
  - open  → URL string (UTF-8) for the synthetic `req.url`
  - data  → opaque inner frame bytes (already msgpack from the hub)
  - close → u16-LE close code, then UTF-8 reason

Implemented in both `exocore-web/server/wsMux.ts` and
`exocore-web/client/access/wsMux.ts`. The `MuxedSocket`/`MuxChannel`
public surface didn't change; only the bytes on the carrier did.

### Why it matters

- Per-frame overhead drops to `2 + len("rpc"|"social")` = 5 or 8
  bytes, versus ~10–15 bytes for the old msgpack object header.
- One fewer encode/decode pass on every data frame in both
  directions. Inner hub frames already arrive as msgpack — we just
  forward the bytes verbatim now.
- No more risk of msgpack misinterpreting a `Buffer` as a generic
  Uint8Array on different runtimes.

### Verified

- `npx tsc -p exocore-web/tsconfig.server.json` — clean.
- `npx vite build --config exocore-web/vite.config.mts` — clean.
- Smoke test on raw carrier:
  - `rpc` channel → inner `rpc:hello` (5 B header for 1610 B payload).
  - `social` channel with bogus token → inner `auth:fail` (8 B header
    for 49 B payload).

## Phase 8j — Terminal & LSP into the mux carrier

The single `/exocore/ws` carrier now also tunnels the PTY terminal
(`/exocore/terminal`) and the TS language server bridge
(`/exocore/api/editor/lsp/ts`) as named channels. With four call sites
opening terminals (KittyTerminal, Dashboard logs viewer, FileManager
logs viewer, ExocoreAI auto-runner, ConsolePane) plus the LSP
diagnostics client, that's up to 6 parallel WebSockets per project
collapsing into a **single** browser↔server socket.

### Channel keying — `hubName#instanceId`

A single hub like `terminal` may have many concurrent sessions
(multiple tabs / panes). To keep them addressable on one carrier,
channel keys carry a `#instance` suffix:

```
terminal#0f3c…   → routed by wsMux to the `terminal` hub
terminal#9b21…   → same hub, different MuxedSocket
lsp#a17e…        → routed to the `lsp` hub
```

Server (`exocore-web/server/wsMux.ts`) splits on `#` and looks up the
hub by the prefix; the suffix is just a uniqueness token. Client
(`exocore-web/client/access/wsMux.ts`) gained
`openChannelInstance(hubName, urlPath)` which mints the suffix via
`crypto.randomUUID()` (with a Math.random fallback) and delegates to
`openChannel`.

### Migration touch points

- `exocore-web/index.ts` — `createMuxWss({ social, rpc, terminal, lsp })`.
- `LspClient.tsx` — `new WebSocket(...)` →
  `muxCarrier.openChannelInstance("lsp", path)`. Onmessage decodes
  ArrayBuffer→string via TextDecoder (LSP frames are JSON-RPC text).
- `KittyTerminal.tsx`, `ConsolePane.tsx`, `Dashboard.tsx`,
  `FileManager.tsx`, `ExocoreAI.tsx` — same swap, casting the channel
  to `WebSocket` so xterm's `AttachAddon` and existing
  `socket.send(str)` paths keep working unchanged.

### Safety net

The legacy `/exocore/terminal` and `/exocore/api/editor/lsp/ts`
upgrade paths stayed mounted on `server.on('upgrade', …)` for one
phase in case a stale bundle reached a browser. They were removed in
Phase 8k below.

### Verified

- `npx tsc -p exocore-web/tsconfig.server.json` — clean.
- `npx vite build --config exocore-web/vite.config.mts` — clean.
- Carrier smoke test with two parallel channel instances:
  - `lsp#…` opened, `tsserver` spawn failed for the bogus projectId
    and the channel closed with `lsp_spawn_failed` (expected).
  - `terminal#…` opened and the hub immediately wrote back the
    "no run command in system.exo" notice — proving the PTY hub
    accepted the synthetic upgrade and round-tripped binary frames
    over the carrier.

## Phase 8k — Drop legacy `/exocore/terminal` and `/exocore/api/editor/lsp/ts`

Now that every browser caller routes the PTY terminal and the TS
language-server bridge through the mux carrier (`terminal#…` /
`lsp#…` channels from Phase 8j), the two legacy upgrade paths were
removed from the dispatcher in `exocore-web/index.ts`. The hub
factories themselves (`TerminalManager`, `createLspWebSocketServer`)
are unchanged — they're just no longer wired to a path of their own;
the mux carrier is their only entry point now.

### Verified

- `ws://localhost:5000/exocore/terminal` and
  `ws://localhost:5000/exocore/api/editor/lsp/ts` both return
  `socket hang up` (handshake refused).
- `ws://localhost:5000/exocore/ws` still opens cleanly — the mux
  carrier is intact, so `terminal#…` and `lsp#…` channels keep
  working through it.

## Phase 9 — Drop the dead HTTP `/exocore/api/auth|social|admin` route files

Every browser caller in `exocore-web/client/**` for auth, social, and
admin already speaks RPC (Phases 1–4). The matching files under
`exocore-web/routes/` were thin axios/bridge proxies that nothing in
the browser hit anymore — only the RPC handlers in
`server/rpc/_helpers.ts` proxy directly to the auth backend via the
WSS bridge. So the legacy files were just dead weight loaded by
`routes/index.ts::walk`. Phase 9 removes them.

### What was deleted

- `exocore-web/routes/admin.ts`
- `exocore-web/routes/auth/login.ts`
- `exocore-web/routes/auth/register.ts`
- `exocore-web/routes/auth/forgot.ts`
- `exocore-web/routes/auth/userinfo.ts`
- `exocore-web/routes/auth/delete.ts`
- `exocore-web/routes/auth/plans.ts`
- `exocore-web/routes/auth/xp.ts`
- `exocore-web/routes/auth/audit.ts`
- `exocore-web/routes/auth/leaderboard.ts`
- `exocore-web/routes/auth/posts.ts`

`routes/social.ts` was trimmed from six proxy methods down to a
single `GET /social/avatar` endpoint — the only path here that
returns binary image bytes for `<img src>` tags and therefore
cannot ride RPC.

### What stayed (and why)

- `routes/auth/verify.ts` — entrypoint for the email-link confirm
  GET (browsers can't open WSS from `<a href>`), still 302-redirects
  into the SPA for auto-login.
- `routes/social.ts` (slim) — `GET /social/avatar` binary endpoint.
- `routes/dev-access.ts` — still HTTP, will move to RPC in Phase 8
  of the migration plan.
- All of `routes/editor/**` — every editor RPC handler in
  `server/rpc/editorHandlers.ts` and `editor2Handlers.ts` self-loops
  into these via `getSelf` / `postSelf`, so they're load-bearing.
  Browser also hits `editor/coding/{media,download*,extract,create}`
  and `editor/templates/create-from-template` (SSE) directly.
- The `/exocore/api/*` Express mount in `app.ts` itself — needed by
  the surviving routes above.

### Verified

- `POST /exocore/api/auth/login` now returns **404** (proves the
  legacy proxy is gone). The SPA logs in via the `auth.login` RPC
  method, which still bridges to the backend at port 3000.
- `GET /exocore/api/social/avatar?username=…` still returns **200**.
- `GET /exocore/` still returns **200** (SPA renders normally).
- Mux carrier `/exocore/ws` still serves `rpc:hello` (full handler
  registry intact, including all `auth.*`, `social.*`, `admin.*`,
  `posts.*`, `plans.*`, `xp.*`, `leaderboard.*`, `audit.*`).

## Phase 8 (migration plan) — `dev-access.ts` → RPC

The developer-gate endpoints (`/exocore/api/dev-access/*`) were the
last HTTP-only auth surface in the SPA. They're now exposed as RPC
methods on the unified hub, so the only HTTP routes still serving
the browser are the ones that physically must stay (email-link
verify, binary avatar, editor media/downloads/templates SSE, plus
`/exocore/api/settings`).

### What changed

- **New `exocore-web/server/rpc/devAccessHandlers.ts`** registers
  five handlers that call the in-process `server/lib/devGate` lib
  directly (no backend hop):
  - `devAccess.status`  → `{ initialized }`
  - `devAccess.me { token }` → `{ authenticated }`
  - `devAccess.setup { user, pass }` → `{ success, token }`
    (409 on "Already initialized", 400 on validation errors)
  - `devAccess.login { user, pass }` → `{ success, token }` (401 on
    bad creds)
  - `devAccess.logout { token }` → `{ success: true }`
- Wired into `server/rpc/hub.ts::createRpcWss` alongside the other
  handler registrations.
- **`exocore-web/client/access/panel-devs.tsx`** swapped every
  `axios.get/post('/exocore/api/dev-access/...')` for
  `rpc.call('devAccess.<method>', { … })`. The panel token is now
  passed explicitly in the RPC payload (`{ token }`) instead of via
  an `Authorization` header.
- **`exocore-web/client/access/panelAuth.ts`** dropped the special
  case that skipped attaching the panel token to
  `/exocore/api/dev-access/*` HTTP requests — the path no longer
  exists and the dev-access calls are RPC now.
- **Deleted `exocore-web/routes/dev-access.ts`** — the legacy HTTP
  router class is gone. The dev-gate state still lives in
  `server/lib/devGate.ts`; both the HTTP wrapper (now removed) and
  the new RPC handlers were just thin dispatch surfaces over it.

### Verified

- `GET /exocore/api/dev-access/status` → **404** (legacy gone).
- RPC `devAccess.status` over the mux carrier → `rpc:ok` with
  `{ initialized: true }` on the running server.
- `npx tsc -p exocore-web/tsconfig.server.json` — clean.
- `Start application` boots, web preview at `/exocore` loads
  through the dev-gate normally.

## Phase 8 (follow-up) — Single persistent panel token

The dev-gate session store used to collect a fresh 32-byte token on
**every** login/setup, accumulating dozens of valid tokens in
`exocore-web/client/access/sessions.json` over time. That meant the
browser-saved panel token kept getting "rotated out" when the user
re-logged from a different tab or when an old client used a stale
token, so the gate would intermittently bounce people back to the
login form.

`exocore-web/server/lib/devGate.ts` now uses a **single-token**
model:

- `sessions.json` is a plain JSON string (the active token), not an
  array. On boot we read the legacy array/object shape if present
  and rewrite it as a single string so the file stops growing.
- `setupDevs` and `loginDevs` both call `ensureToken()`: if a token
  already exists it is returned as-is, otherwise a new one is
  generated, persisted, and returned. The token therefore survives
  server restarts and successive logins, so the browser cache stays
  valid until the operator explicitly revokes it.
- `revokeSession(token)` now clears the single stored token (only
  if it matches), and `isValidSession(token)` is a strict equality
  check against the stored token.

Net effect: one panel account → exactly one long-lived token, no
auto-rotation on login, and no more silent gate kick-outs.

## Editor: Auto-save + Local Code History (Apr 2026)

The editor no longer has a Save button. Saving is automatic now that
all editor traffic flows over WSS.

`exocore-web/client/editor/coding.tsx`:

- Each keystroke schedules a debounced (~800 ms) silent
  `coding.save` RPC. The header pill shows
  `idle / saving / saved / error` instead of toasts.
- Switching files re-baselines the "last saved" snapshot so a
  freshly-loaded file isn't immediately re-uploaded.
- `Ctrl/Cmd+S` flushes immediately. `Ctrl/Cmd+Shift+H` opens
  History.

History is **browser-only** (no server side). Snapshots are stored
in IndexedDB via `idb-keyval` under
`exocore_history:{projectId}:{filePath}`, capped at 50 entries
(newest first), pushed each time auto-save persists a *new*
content hash. A History modal (`CodeHistoryModal`) lets the user
browse timestamped snapshots, preview them, restore one (which
swaps editor content and re-triggers auto-save), or clear all
local history for that file.

`Layout.tsx` exports an `AutoSaveState` type and the new
`LayoutHeader` props (`autoSaveState`, `onOpenHistory`); the old
Save icon and `onSave/isSaving` props are gone.

### History modal — Diff (Compare) view (Apr 2026)

`CodeHistoryModal` now has a **Preview / Compare** segmented
toggle in the header. The Compare tab is disabled until there are
≥ 2 snapshots.

- **Compare** mode shows two snapshot dropdowns (BASE = left,
  COMPARE = right), a `+adds / -dels` summary, a **Swap** button,
  a **Changes only** checkbox, and side-by-side restore buttons
  (`Restore base` / `Restore compare`). Picking from either
  dropdown re-runs the diff.
- The diff itself is line-level LCS (`diffLines` helper near the
  top of `coding.tsx`) returning `DiffOp[]` with `eq | del | add`
  rows. Renderer aligns ops into a 2-column grid: deletions are
  red on the left only, additions are green on the right only,
  and equal lines fill both sides. Files over 4000 lines fall
  back to a fast index-aligned diff with a "truncated" notice so
  the LCS table never blows up memory.
- **Changes only**: collapses long runs of unchanged lines into
  a `··· N unchanged lines ···` divider, while keeping up to 2
  lines of context above and below each hunk.
- **Responsive layout** (`isNarrow = window.innerWidth < 720`,
  re-evaluated on `resize`):
  - Modal goes full-screen (no border/radius/padding) on phones,
    keeps the rounded centered card on desktop. Compare-mode
    desktop max width is `1180px`; preview is `880px`.
  - Preview sidebar collapses from a 240 px vertical column into
    a horizontal scrollable strip on top, with `pre-wrap` body
    so long lines don't force horizontal scroll.
  - Compare toolbar wraps: BASE / COMPARE pickers each take a
    full row on phones, then a wrap row holds `+/-` counts,
    Swap, Changes-only, and the two Restore buttons.
  - Diff body switches to a **unified** single-column renderer on
    phones (`renderDiffRowUnified`) — `+` green / `-` red prefix,
    full-width — and stays side-by-side (`renderDiffRowSplit`) on
    desktop. Touch scrolling uses `WebkitOverflowScrolling`.

### History modal — Merge picker (Apr 2026)

Third tab `Merge` next to `Preview` / `Compare` (also disabled
until ≥ 2 snapshots). Lets the user hand-pick lines from BASE
vs COMPARE per change region and restore the merged result.

- `groupHunks(ops)` walks the diff and emits an alternating list
  of `{ kind: 'eq', op }` and `{ kind: 'hunk', id, dels, adds }`
  items. A *hunk* = a maximal run of consecutive `del` / `add`
  ops between equal lines.
- Per-hunk picker has 4 choices, default `compare`:
  - **Use base** (red): keep the BASE side
  - **Use compare** (green): keep the COMPARE side
  - **Both** (purple): keep BASE then COMPARE
  - **Skip** (grey): drop the hunk entirely
- Toolbar adds: `+/- counts`, `N hunks`, **All base**, **All
  compare**, **Reset picks**, **Preview merged** (toggles the
  body to show the assembled file as a single `<pre>`), and
  **Restore merged** which calls `onRestore({ ts: now,
  size, content })` with a freshly-built synthetic entry.
- `buildMerged(items, choices)` joins equal lines + the chosen
  side(s) of each hunk with `\n` to produce the final content.
- `hunkChoices` state resets whenever `baseIdx` or `compareIdx`
  changes (different snapshot pair = different hunk ids).
- Mobile: each hunk's BASE/COMPARE columns stack vertically
  (single-column grid + horizontal divider); toolbar and picker
  buttons wrap. Desktop keeps the side-by-side hunk layout.
- Implemented as a separate `MergeBody` sub-component so the
  parent modal stays manageable; receives all theme tokens
  (`addBg` / `delBg` / `fadedBg` / `gutterMuted`) plus
  `restoreBtnStyle` and `snapshotLabel` as props.

### Fix — Black screen on file open (Apr 2026)

`<SimpleCodeEditor>` was being rendered with `onSave={handleSave}`
but `handleSave` was never defined in `CodingPage`. Because `tsx`
strips types but does not evaluate static checks, this slipped
past the build but threw `ReferenceError: handleSave is not
defined` the moment the user clicked any code file → React
unmounted → blank/black page (especially obvious on mobile where
the modal would have covered everything else).

Changed line ~583 to mirror the working sidebar binding at
~line 507: `onSave={() => void flushSave()}`. `flushSave` is the
useCallback that already powers Ctrl+S and the auto-save timer.

### History storage moved to project folder (Apr 2026)

Per-file edit history was migrated **out of the browser
IndexedDB** and into the project tree at
`projects/<projectId>/.history/<base64url(filePath)>.json`. This
means GDrive zip backups + GitHub pushes now preserve a user's
full per-file undo history alongside the source.

- Server endpoints in `exocore-web/routes/editor/coding.ts`:
  - `GET  /editor/coding/projects/:id/history?file=…` — returns
    `{ entries: HistoryEntry[] }` (newest first; capped at 50).
  - `POST /editor/coding/projects/:id/history/push` `{ file,
    entry }` — appends, dedupes consecutive identical content
    hashes, trims to 50, returns `{ entries }`.
  - `POST /editor/coding/projects/:id/history/clear` `{ file }`
    — deletes the per-file json.
  Each file's history lives in its own json so a single huge
  file can't poison the rest. Path is computed by base64url of
  the relative file path so slashes/casing don't escape `.history/`.
- RPC bridges in `exocore-web/server/rpc/editorHandlers.ts`:
  `coding.history.list / push / clear`. Client uses these
  exclusively now — the old `idb-keyval` import was deleted from
  `coding.tsx` and `loadHistory / pushHistory / clearHistory`
  were replaced with thin `rpc.call` wrappers.
- `Sidebar.tsx` already hides any node whose name starts with `.`
  (line 74: `node.name.startsWith('.')`), so `.history/` does not
  pollute the file tree but still ships in zip exports.

### History modal redesign — slider scrubber (Apr 2026)

The previous Preview / Compare / Merge segmented-tabs layout was
"sobra gulo" (too noisy). Replaced with a single clean slider
inspired by Replit's history UI:

- **Header**: title + filename, a small `Clear` ghost button, and
  a close `X`. When the user opens the advanced merge view the
  title swaps to `Advanced merge` and a `← Back` button appears.
- **Scrubber bar** (always visible, just under the header):
  - A full-width `<input type="range">` whose right edge =
    newest snapshot, left edge = oldest. `accentColor` follows
    the current theme.
  - Below the slider: ▶/⏸ play button (auto-advances oldest →
    newest at 700 ms / step, stops at the end), `<` older / `>`
    newer step buttons, an `N / total` counter, a `timeAgo()`
    label (`just now` / `5m ago` / `2h ago` / etc.), and a tiny
    avatar circle showing the file's first letter on the accent
    colour. Avatar `title` attr shows the full timestamp.
- **Body**: either the selected snapshot's content as a `<pre>`,
  or — when the bottom-bar `Compare` toggle is on — the existing
  side-by-side / unified diff vs the latest snapshot, using the
  same `renderDiffRowSplit` / `renderDiffRowUnified` / `renderGap`
  helpers that already powered the old Compare tab.
- **Bottom toolbar**: `Compare` toggle (disabled with <2 snapshots),
  `Changes only` toggle + `+adds / -dels` summary (only when
  Compare is on), an `Advanced merge…` link button (also Compare-
  only) which swaps the body for the existing `MergeBody`
  component, plus `Cancel` and the primary `Restore` action.
  `Restore` becomes a disabled "Viewing latest" pill when
  `selectedIdx === 0` so users can't accidentally restore the
  current state on top of itself.
- The full hunk-picker `MergeBody` is unchanged — it's just hidden
  behind the `Advanced merge…` entry point now instead of a
  permanent third tab. Restoring a merged result still calls
  `onRestore({ ts, size, content })` exactly like before.
- Helpers added near the top of `CodeHistoryModal`: `timeAgo(ts)`
  for the relative-time label, `goPrev / goNext` step handlers
  that also pause the auto-play, and shared `ghostBtn` / `iconBtn`
  / `playBtnStyle` / `toggleLabelStyle` style objects for a
  consistent look. Mode-specific desktop max width: `1180px` when
  Compare or Advanced merge is on, `820px` otherwise.

### Side-effect — orphaned `home/Dashboard` import (Apr 2026)

`exocore-web/client/main.tsx` imported `./home/dashboard.css` and
`lazy(() => import('./home/Dashboard'))`, but the entire
`client/home/` directory had been removed previously. The vite
build was failing with two `UNRESOLVED_IMPORT` errors that had
nothing to do with the history rework but were blocking it from
shipping. Commented out the css import and re-pointed the
`/dashboard` route to the existing `access/auth/Home` component
as a temporary fallback so the build is green again. Proper
Dashboard page can be reintroduced later.

### Visual documentation (Apr 24, 2026)

Added `exocore-web/docs/` with a complete visual + technical
walkthrough of every panel route. Markdown sections under
`docs/{panel,auth,dashboard,profile,social,leaderboard,projects,
cloud,github,editor}/README.md` plus the index `docs/README.md`.

Screenshots captured by `exocore-web/scripts/capture-docs.ts`
(Puppeteer + Nix Chromium 138). Both desktop (1440×900) and
mobile (390×844) PNGs land under
`docs/screenshots/{desktop,mobile}/01..11-*.png`. Re-run with
`npx tsx exocore-web/scripts/capture-docs.ts`.

Capture-only rate-limit bypass: `app.ts` reads
`process.env.EXOCORE_CAPTURE === "1"` to raise the global limit.
The `Start application` workflow ships **without** that env in
production; set it temporarily when re-capturing.

### Backend Docker hardening + URL vault + standalone docs site (Apr 24, 2026)

A multi-piece pass focused on shippable, leak-resistant artifacts:

- **`Exocore-Backend/Dockerfile`** — multi-stage build (`node:20-bookworm-slim` →
  `tsc` to JS → `javascript-obfuscator` pass → minimal runtime image as
  the non-root `exocore` user, `tini` as PID 1, port 8081). Designed for
  hassle-free hosting on Hugging Face / Fly / Render. Backed by
  `Exocore-Backend/scripts/obfuscate-dist.js` (control-flow flatten,
  string-array shuffle/encode, dead-code injection). New
  `npm run build:secure` and `javascript-obfuscator` devDependency.

- **URL vault for `exocore-web/routes/urlData.json`** — old plain JSON
  was readable from any source-tree dump. Replaced with
  `routes/_urlVault.ts` (AES-256-GCM, PBKDF2-SHA512 200k iter,
  fragmented passphrase, random per-file salt+nonce). Resolver
  (`_resolveBase.ts`) now goes through `loadUrlConfig()`. Migration done
  via `exocore-web/scripts/encrypt-urldata.ts` — produces `urlData.enc`
  and reduces the legacy `urlData.json` to a placeholder so the URL no
  longer leaks from the file tree. Auto-migration on first boot if a
  legacy file is present without a vault.

- **Mobile editor capture pass** — `capture-editor.ts` rewritten so the
  same script runs against both the desktop (1440×900) and mobile
  (414×896) viewports, and auto-creates the `exorepo-demo` (node) and
  `exorepo-py` (python) projects via the `/api/editor/templates/create-from-template`
  SSE endpoint so the editor screenshots have something to render.
  Hardened with a `safeStep()` wrapper, `unhandledRejection` guard, and
  a relaxed `domcontentloaded` wait. Mobile output saved under
  `docs/screenshots/editor/mobile/00..04-*.png` (5 frames covering the
  panel gate + editor default + explorer + terminal + console). The
  remaining mobile panes (sidebar/modals) still hit a Chromium 138
  webview-target detach bug — documented in `exocore-web/README.md`
  under *Mobile capture caveats*.

- **`exocore-docs/`** — brand-new Vite + React 19 + react-markdown SPA
  that bundles every `.md` under `exocore-web/docs/**/*.md` at build
  time (`import.meta.glob`) into a searchable static site, hostable on
  Hugging Face Static Spaces / GitHub Pages / Netlify. Includes:
  - In-memory `/`-shortcut search with snippet preview (`src/lib/docs.ts`).
  - HashRouter (no server rewrite required).
  - Sidebar nav, breadcrumbs, prev/next pager, dark-mode syntax
    highlight (rehype-highlight + GitHub Dark theme).
  - Single-file palette (`src/styles.css`) with mobile drawer.
  - `npm run build` → 632 KB JS / 11 KB CSS (197 KB gzipped) into
    `exocore-docs/dist`.

- **Top-level `exocore-web/README.md`** added with credentials matrix,
  capture instructions, mobile capture caveats, and a link to the new
  `exocore-docs/` deploy guide.
