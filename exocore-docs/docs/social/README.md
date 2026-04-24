# Social Panel — chat, DMs, online presence, posts

The SocialPanel is a slide-up sheet docked at the bottom of every authenticated
page. Implemented in
[`client/social/SocialPanel.tsx`](../../client/social/SocialPanel.tsx) +
`client/social/useSocial.ts` (custom hook that owns the WebSocket subscriptions).

It is the **single place** in the app that surfaces real-time:

- 🟢 Online presence list
- 💬 Public global chat (markdown + code-block aware)
- ✉️ Direct messages (1-on-1)
- 👥 Friends manager (add / remove / block)
- 📰 Posts feed (same model as profile feed)
- 🔔 Notifications (mentions, reactions)

## Tabs

`type Tab = "chat" | "online" | "friends" | "dms" | "feed";`

| Tab | What you see |
|-----|--------------|
| `chat`    | Global server-wide chatroom; collapsible code blocks; nicknames colored by role. |
| `online`  | Live list of presence (idle ⏰, active 🟢). Click a user → opens their DM. |
| `friends` | Search + add friends, sees mutuals, in-line "chat" button. |
| `dms`     | Active DM thread with `activeDM`. Sidebar lists every started conversation. |
| `feed`    | Same posts you see on profiles, but server-wide, ordered by recency. Reactions + comments work inline. |

## Real-time pipeline

```
client/social/useSocial.ts
        │  ws://…/ws/social  (mux channel)
        ▼
exocore-web/server/social/hub.ts
        │  Token-bucket rate-limited
        ▼
Exocore-Backend/src/auth/social.ts  (chat.json, posts.json, friends.enc)
        │  Mirrored to Google Drive every N seconds
        ▼
client/social/SocialPanel.tsx  re-renders via useSocial state
```

Server topics broadcast over the multiplexed WebSocket:

- `chat.message` — new chat line
- `chat.delete` — moderator removed a line
- `dm.message` — incoming DM
- `presence.online` / `presence.offline`
- `friends.update`
- `posts.new` / `posts.delete` / `posts.react` / `posts.comment`

## Visual reference

The SocialPanel is owned by `Dashboard.tsx`, so it inherits the dashboard
screenshot. To see it standalone, expand the bottom drawer ("💬 Open chat")
once authenticated.

| Desktop (drawer in dashboard) | Mobile (drawer collapses to bottom-tab) |
|---|---|
| ![Dashboard — desktop](../screenshots/desktop/07-dashboard.png) | ![Dashboard — mobile](../screenshots/mobile/07-dashboard.png) |

(The captured run is unauthenticated → login redirect; once a user logs in
the social panel pops up at the bottom of the same page.)

## RPC channels (also reachable for non-WS calls)

| Channel | Purpose |
|---------|---------|
| `chat.history`        | Pull last N global messages |
| `chat.send`           | Post a new chat line (rate-limited) |
| `chat.delete`         | Mod-only delete |
| `dm.history`          | Pull a single conversation |
| `dm.send`             | Send DM |
| `social.friend`       | Add / remove / block / accept |
| `social.online`       | Snapshot of who is online right now |
| `posts.feed`          | Server-wide posts feed |
| `posts.create`        | New post (text + optional image) |
| `posts.react`         | Toggle reaction emoji |
| `posts.comment`       | Append comment |

## XP integration

Each successful action grants XP through
[`Exocore-Backend/src/services/xpService.ts`](../../Exocore-Backend/src/services/xpService.ts):

| Action | XP | Cooldown |
|--------|----|----------|
| Send chat message | 1 | 60 s per user |
| Send DM | 1 | 60 s per user |
| Create post | 5 | none |
| Receive reaction | 1 per react | none |
| Comment on post | 2 | 30 s per user |

Triggered events bubble through the leaderboard in real time.

## Roles + colors

Implemented in `ROLE_TITLES`:

| Role  | Title  | Chip color |
|-------|--------|-----------|
| owner | OWNER  | yellow / gold |
| admin | ADMIN  | red |
| mod   | MOD    | violet |
| user  | USER   | grey |
