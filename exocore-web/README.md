# Exocore Web

> Next-generation **browser-based IDE + developer panel** with built-in social
> features (posts, DMs, friends), gamified XP / leaderboard, project nodes,
> cloud storage (Google Drive), GitHub integration, NPM / pip / Cargo package
> managers, and a multi-language editor backed by Monaco + CodeMirror.

The whole SPA is mounted under the `/exocore` URL prefix and sits behind the
**panel-devs gate** (`devs.json` master account). Once the panel is unlocked,
regular **user accounts** sign in via `/exocore/login`.

---

## ▶️ Quick start

```bash
# install root deps (skips the failing node-pty native build — that's fine)
npm install --legacy-peer-deps --ignore-scripts

# install backend deps
cd Exocore-Backend && npm install --legacy-peer-deps --ignore-scripts && cd -

# start everything (recommended: use the workflows in Replit)
#   - "Start application" → port 5000  (this package, the SPA + gateway)
#   - "Exocore Backend"   → port 3000  (auth + user data, Google-Drive backed)
npm run start
```

Open <http://localhost:5000/exocore/> and create the panel master account.

| Account     | Username   | Password         | Notes |
|-------------|------------|------------------|-------|
| Panel gate  | `Choruyt`  | `ex123`          | Created on first run via the panel-devs setup form. |
| Demo user   | `choruyt`  | `Stevepen4321!`  | Used by the screenshot scripts. |

> The `Choruyt` / `ex123` panel account is also the default that
> `exocore-web/scripts/capture-docs.ts` and `capture-editor.ts` expect when
> taking documentation screenshots. Override with `EXO_PANEL_USER` and
> `EXO_PANEL_PASS` if you want a different one.

---

## 📁 Layout

```
exocore-web/
├── client/         React 19 + Vite SPA (mounted at /exocore via BrowserRouter basename)
├── server/         Express + WSS infrastructure (RPC mux, social hub, services)
├── routes/         HTTP routes that the gateway exposes (most are also bridged to RPC)
├── templates/      Project-template catalog used by the editor's "New project" wizard
├── scripts/        Capture / tooling scripts (puppeteer-based docs capture, etc.)
├── docs/           Visual documentation (rendered screenshots + per-section README files)
├── app.ts          Express app factory
├── index.ts        Server entry point
└── vite.config.mts Client build config
```

The companion backend lives one level up at [`../Exocore-Backend`](../Exocore-Backend).

---

## 📚 Visual documentation

Per-route walkthroughs (with **desktop** + **mobile** screenshots) live under
[`docs/`](./docs/README.md). Section index:

| # | Folder | What it covers |
|---|--------|----------------|
| 1 | [`docs/panel/`](./docs/panel/README.md) | Panel-devs gate (master `devs.json` lock screen) |
| 2 | [`docs/auth/`](./docs/auth/README.md) | Home landing, Login, Register, Forgot, Verify, OAuth callback |
| 3 | [`docs/dashboard/`](./docs/dashboard/README.md) | Main `/dashboard` workspace (after user login) |
| 4 | [`docs/profile/`](./docs/profile/README.md) | `/u/:username` — profile, posts, friends, "stalk" mode |
| 5 | [`docs/social/`](./docs/social/README.md) | SocialPanel — chat, DMs, online presence, posts |
| 6 | [`docs/leaderboard/`](./docs/leaderboard/README.md) | Top members ranked by XP / level / achievements |
| 7 | [`docs/projects/`](./docs/projects/README.md) | Project nodes, CreateProjectWizard, FileManager |
| 8 | [`docs/cloud/`](./docs/cloud/README.md) | Google Drive cloud storage manager |
| 9 | [`docs/github/`](./docs/github/README.md) | GitHub integration (org browse, clone, push) |
| 10 | [`docs/editor/`](./docs/editor/README.md) | IDE (Monaco/CodeMirror), languages, terminal, AI, NPM |

Raw screenshot grids:

- Top-level routes: [`docs/screenshots/desktop`](./docs/screenshots/desktop) · [`docs/screenshots/mobile`](./docs/screenshots/mobile)
- Editor workflow: [`docs/screenshots/editor`](./docs/screenshots/editor) (desktop, 14 frames) · [`docs/screenshots/editor/mobile`](./docs/screenshots/editor/mobile) (mobile, 5 frames — see *Mobile capture caveats* below)

---

## 📸 Re-capturing the screenshots

Both capture scripts run a real Chromium 138 instance via Puppeteer. The
**Start application** workflow must be running on port 5000 first.

```bash
# Top-level routes (panel gate, auth, dashboard, profile, leaderboard, editor splash)
EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-docs.ts

# Deep editor walkthrough — auto-creates `exorepo-demo` (node) + `exorepo-py`
# (python) under ./projects so the screenshots have something to render.
# Captures BOTH desktop (./docs/screenshots/editor/) and mobile
# (./docs/screenshots/editor/mobile/). Pass VIEWPORT=desktop or VIEWPORT=mobile
# to capture only one.
npx tsx exocore-web/scripts/capture-editor.ts
```

Useful environment overrides (both scripts):

| Variable          | Default              | Purpose |
|-------------------|----------------------|---------|
| `EXOCORE_BASE`    | `http://localhost:5000/exocore` | Panel base URL |
| `EXO_PANEL_USER`  | `Choruyt`            | Panel-gate username |
| `EXO_PANEL_PASS`  | `ex123`              | Panel-gate password |
| `EXO_LOGIN_USER`  | `choruyt`            | Demo-user username |
| `EXO_LOGIN_PASS`  | `Stevepen4321!`      | Demo-user password |
| `VIEWPORT`        | *(both)*             | `desktop` or `mobile` to filter (editor script) |
| `CHROMIUM_PATH`   | bundled nix path     | Override the Chromium binary |

### Mobile capture caveats

Headless Chromium 138 has a stubborn bug where the embedded **preview /
webview** target detaches the parent page session whenever the editor's
mobile preview pane is opened. To keep the rest of the mobile pass useful,
the script:

- Skips the `05-editor-webview` capture on mobile entirely.
- Wraps every other step in a tolerant `safeStep(...)` so a single
  pane-open failure doesn't abort the whole pass.

The mobile output therefore covers the **panel gate, editor default,
explorer file open, terminal pane, and console pane** (5 frames). The
sidebar / modal panes still need a manual capture pass on a real device —
that workflow is on the docs roadmap. Desktop captures all 14 frames
without limitation.

---

## 📚 Standalone docs site (`exocore-docs/`)

The sibling [`../exocore-docs`](../exocore-docs) project is a Vite + React
SPA that bundles every Markdown file under `exocore-web/docs/**/*.md` into
a searchable static site, hostable on Hugging Face Spaces, GitHub Pages,
or any plain static host.

```bash
cd exocore-docs
npm install
npm run dev          # vite dev server on :5173
npm run build        # → exocore-docs/dist (drop into Hugging Face Static Space)
```

See [`../exocore-docs/README.md`](../exocore-docs/README.md) for the full
deploy guide.

---

## 🧰 Stack snapshot

- **Server**: Express 5 + TypeScript (`app.ts`, `index.ts`), with WebSocket
  multiplexer (`server/wsMux`), social hub (`server/social/hub`), RPC hub
  (`server/rpc/hub`).
- **Client**: React 19 + Vite + React Router (basename `/exocore`),
  Monaco / CodeMirror, xterm.js, Framer Motion, SweetAlert2, Zustand.
- **Backend (separate)**: [`../Exocore-Backend`](../Exocore-Backend) —
  Express + Google Drive sync, encrypted user store, mail, OAuth.
- **Auth model**:
  - **Panel gate** → server-side `devs.json` (one master account per server).
  - **User auth** → email-verified accounts handled by the Exocore-Backend.

For the full architecture / phase-by-phase change log, see the project root
[`replit.md`](../replit.md).
