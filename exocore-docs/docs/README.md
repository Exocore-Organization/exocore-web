# Exocore Web — Visual Documentation

> Generated on April 24, 2026 — captures every panel route in **desktop (1440×900)**
> and **mobile (390×844)** using bundled Chromium via Puppeteer.
> Re-run with `npx tsx exocore-web/scripts/capture-docs.ts`.

Exocore Web is a next-generation **browser-based IDE + developer panel** with built-in
social features (posts, DMs, friends), gamified XP / leaderboard, project nodes,
cloud storage (Google Drive), GitHub integration, NPM / pip / Cargo package
managers, and a multi-language editor backed by Monaco + CodeMirror.

The panel is mounted at the `/exocore` URL prefix. The whole SPA sits behind the
**panel-devs gate** (`devs.json` master account) which protects every route on the
server. Once unlocked, regular **user accounts** sign in via `/exocore/login`.

---

## 📚 Sections

| # | Folder | What it covers |
|---|--------|----------------|
| 1 | [`./panel/`](./panel/README.md) | Panel-devs gate (master `devs.json` lock screen) |
| 2 | [`./auth/`](./auth/README.md) | Home landing, Login, Register, Forgot, Verify, OAuth callback |
| 3 | [`./dashboard/`](./dashboard/README.md) | Main `/dashboard` workspace (after user login) |
| 4 | [`./profile/`](./profile/README.md) | `/u/:username` — profile, posts, friends, "stalk" mode |
| 5 | [`./social/`](./social/README.md) | SocialPanel — chat, DMs, online presence, posts |
| 6 | [`./leaderboard/`](./leaderboard/README.md) | Top members ranked by XP / level / achievements |
| 7 | [`./projects/`](./projects/README.md) | Project nodes, CreateProjectWizard, FileManager |
| 8 | [`./cloud/`](./cloud/README.md) | Google Drive cloud storage manager |
| 9 | [`./github/`](./github/README.md) | GitHub integration (org browse, clone, push) |
| 10 | [`./editor/`](./editor/README.md) | IDE (Monaco/CodeMirror), languages, terminal, AI, NPM |

Raw screenshot grids live in
[`./screenshots/desktop/`](./screenshots/desktop) and
[`./screenshots/mobile/`](./screenshots/mobile).

---

## 🗺️ Route map

| URL                          | Component                              | Auth required |
|------------------------------|----------------------------------------|---------------|
| `/exocore/`                  | `access/auth/Home.tsx` (landing)       | Panel only    |
| `/exocore/login`             | `access/auth/Login.tsx`                | Panel only    |
| `/exocore/register`          | `access/auth/Register.tsx`             | Panel only    |
| `/exocore/forgot`            | `access/auth/Forgot.tsx`               | Panel only    |
| `/exocore/verify-pending`    | `access/auth/VerifyPending.tsx`        | Panel only    |
| `/exocore/auth/callback`     | `access/auth/AuthCallback.tsx`         | Panel only    |
| `/exocore/dashboard`         | `home/Dashboard.tsx`                   | Panel + user  |
| `/exocore/u/:username`       | `profile/Profile.tsx`                  | Panel + user  |
| `/exocore/leaderboard`       | `leaderboard/Leaderboard.tsx`          | Panel + user  |
| `/exocore/editor`            | `editor/coding.tsx`                    | Panel + user  |

---

## 🧰 Stack snapshot

- **Server**: Express 5 + TypeScript (`exocore-web/app.ts`, `index.ts`), with
  WebSocket multiplexer (`server/wsMux`), social hub (`server/social/hub`),
  RPC hub (`server/rpc/hub`).
- **Client**: React 19 + Vite + React Router (basename `/exocore`), Monaco / CodeMirror,
  xterm.js, Framer Motion, SweetAlert2, Zustand.
- **Backend (separate)**: `Exocore-Backend/` — Express + Google Drive sync,
  encrypted user store, mail, OAuth.
- **Auth model**:
  - **Panel gate** → server-side `devs.json` (one master account per server).
  - **User auth** → email-verified accounts handled by the Exocore-Backend.

---

## ▶️ How the screenshots were captured

Both viewports were rendered with a real **Chromium 138** binary
(`/nix/store/.../chromium`) driven by Puppeteer. The script:

1. Loads `/exocore/` to capture the panel-devs **setup gate**.
2. Submits the gate form to create the master account.
3. Re-visits every route and takes a `fullPage` PNG.
4. Repeats for the mobile viewport.

See [`exocore-web/scripts/capture-docs.ts`](../scripts/capture-docs.ts).
