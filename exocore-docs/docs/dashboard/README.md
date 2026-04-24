# Dashboard — `/exocore/dashboard`

The Dashboard is the **command-centre** that opens right after a successful
user login. Implemented in
[`client/home/Dashboard.tsx`](../../client/home/Dashboard.tsx); ~770 lines
that orchestrate every other panel as either an inline view (`activeView`) or
a modal (`*Open` flags).

> The screenshots below show the **redirect to `/login`** because the docs
> capture run was unauthenticated. With a real `exo_token` in
> `localStorage`, the same route renders the layout described below.

| Desktop | Mobile |
|---------|--------|
| ![Dashboard redirect — desktop](../screenshots/desktop/07-dashboard.png) | ![Dashboard redirect — mobile](../screenshots/mobile/07-dashboard.png) |

---

## Layout

```
┌─ Header ──────────────────────────────────────────────┐
│  EXOCORE   • CPU 4 % · RAM 42 % · 14:22:01            │
│  Avatar ⟶ Profile · Leaderboard · ⚙ Account · Logout  │
├─ Welcome card ────────────────────────────────────────┤
│  Hi {nickname}, plan: FREE / PRO / OWNER              │
│  Plan-upgrade button (opens PlansModal)               │
├─ Stats row ───────────────────────────────────────────┤
│  Projects · Active · CPU · RAM (live ticking)         │
├─ Project Nodes ───────────────────────────────────────┤
│  Grid of ProjectNodeCard (open · run · archive)       │
│  + "Show all" toggle if > 6                           │
├─ Quick Actions ───────────────────────────────────────┤
│  ▢ Project Nodes · ⚙ Account · ☁ Cloud Backups · …  │
├─ Social grid ─────────────────────────────────────────┤
│  GitHub · Drive · Discord · X · Donations …           │
└───────────────────────────────────────────────────────┘
```

## State machine

`activeView` only swaps two top-level views:

| Value | What renders |
|-------|--------------|
| `'home'`   | The composite layout above |
| `'account'`| Inline `<Account />` settings sub-page |

Everything else is a modal driven by booleans:

| Flag | Modal component | What it does |
|------|----------------|--------------|
| `projectsOpen`     | `FileManager`         | Browse all projects + storage usage |
| `gDriveOpen`       | `GDriveManager`       | OAuth-connect Google Drive, sync state |
| `githubOpen`       | `GithubManager`       | OAuth-connect GitHub, browse repos |
| `plansOpen`        | `PlansModal`          | Upgrade plan (free → pro / owner) |
| `ownerPaymentsOpen`| `OwnerPaymentsPanel`  | Owner-only revenue / pay-out view |
| `headerMenuOpen`   | Inline dropdown       | Profile · Leaderboard · Account |
| `dialog`           | SweetAlert2 wrapper   | Confirm / prompt / alert |

## Header chips

- **Avatar** → `navigate(/u/${userData.username})` (own profile)
- **Trophy** → `/leaderboard`
- **Gear** → switches `activeView` to `'account'`
- **Logout** → clears `exo_token`, navigates back to `/login`

## Stats card

Powered by an interval that polls `/exocore/api/auth/userinfo` and the local
`navigator.connection` API; falls back to mocked values (`stats = { cpu, ram }`)
when the live numbers aren't available yet.

## Social grid

A static array `SOCIAL_LINKS` with id `github`, `gdrive`, `discord`, `twitter`,
`donate`, `youtube`. Rendered as **outbound** cards — clicking opens the org's
public page (e.g. `https://github.com/Exocore-Organization`). Different from
the in-app `social/SocialPanel` (chat / DM / posts) which is documented
separately under [`../social/`](../social/README.md).

## Auth shape consumed

```ts
type UserData = {
  username: string;          // e.g. "@exocore"
  nickname: string;          // "Costanos"
  email: string;
  plan: "free" | "pro" | "owner";
  role: "user" | "mod" | "admin" | "owner";
  xp: number;
  level: number;
  avatarUrl?: string;
  country?: string;
  // … plus payments / drive / github linked-account fields
};
```
