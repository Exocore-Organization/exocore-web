# Exocore Web

> Next-generation **browser-based IDE + developer panel** with built-in social
> features (posts, DMs, friends), gamified XP / leaderboard, project nodes,
> cloud storage (Google Drive), GitHub integration, NPM / pip / Cargo package
> managers, and a multi-language editor backed by Monaco + CodeMirror.

The whole SPA is mounted under the `/exocore` URL prefix and sits behind the
**panel-devs gate** (`devs.json` master account). Once the panel is unlocked,
regular **user accounts** sign in via `/exocore/login`.

---

## ✨ Features (click any badge to read the full doc on GitHub)

> Every link below points at a self-contained markdown walkthrough with
> desktop **and** mobile screenshots. They render natively on GitHub —
> no clone needed.

#### 🔐 Authentication & gating
- **[Panel-devs gate](./exocore-web/docs/panel/README.md)** — first-touch master-account form, the `devs.json` lock screen, and the per-machine cookie session.
- **[User auth flow](./exocore-web/docs/auth/README.md)** — landing page, login, register, forgot-password, email-verify, OAuth callback (Google + GitHub).

#### 🧑‍💻 Editor / IDE — `/exocore/editor` ([all 15 frames →](./exocore-web/docs/editor/README.md))
| Feature | Doc |
|---------|-----|
| Default editor view (Monaco + explorer)        | [01-editor-default.md](./exocore-web/docs/editor/01-editor-default.md) |
| Open file from explorer + LSP diagnostics      | [02-editor-explorer-file.md](./exocore-web/docs/editor/02-editor-explorer-file.md) |
| Integrated `xterm` terminal (node-pty bridge)  | [03-editor-terminal.md](./exocore-web/docs/editor/03-editor-terminal.md) |
| Runtime console (Start / Stop project)         | [04-editor-console.md](./exocore-web/docs/editor/04-editor-console.md) |
| Live webview / preview iframe                  | [05-editor-webview.md](./exocore-web/docs/editor/05-editor-webview.md) |
| Problems pane (LSP diagnostics)                | [06-editor-problems.md](./exocore-web/docs/editor/06-editor-problems.md) |
| NPM sidebar (search / install / publish)       | [07-sidebar-npm.md](./exocore-web/docs/editor/07-sidebar-npm.md) |
| GitHub sidebar (clone / push / diff)           | [08-sidebar-github.md](./exocore-web/docs/editor/08-sidebar-github.md) |
| Drive sidebar (Google Drive picker)            | [09-sidebar-drive.md](./exocore-web/docs/editor/09-sidebar-drive.md) |
| AI sidebar (chat + tool-use)                   | [10-sidebar-ai.md](./exocore-web/docs/editor/10-sidebar-ai.md) |
| Code-history modal (per-file IndexedDB diffs)  | [11-history-modal.md](./exocore-web/docs/editor/11-history-modal.md) |
| Settings modal (60+ themes, key bindings)      | [12-settings-modal.md](./exocore-web/docs/editor/12-settings-modal.md) |
| Live theme switch                              | [13-settings-theme-changed.md](./exocore-web/docs/editor/13-settings-theme-changed.md) |
| PyLib pane (Python projects)                   | [14-sidebar-pylib.md](./exocore-web/docs/editor/14-sidebar-pylib.md) |

#### 🏠 Workspace
- **[Dashboard](./exocore-web/docs/dashboard/README.md)** — `/dashboard`: project nodes, system stats, plans, payments, account.
- **[Projects](./exocore-web/docs/projects/README.md)** — `CreateProjectWizard`, FileManager, archived view, bulk delete.
- **[Cloud storage](./exocore-web/docs/cloud/README.md)** — Google Drive manager (`GDriveManager.tsx`).
- **[GitHub integration](./exocore-web/docs/github/README.md)** — org / repo browser, clone-to-project, push-back-to-remote.

#### 🌐 Social
- **[Profile pages](./exocore-web/docs/profile/README.md)** — `/u/:username`, friends, posts, *stalk* mode.
- **[SocialPanel](./exocore-web/docs/social/README.md)** — chat, DMs, online presence, post composer.
- **[Leaderboard](./exocore-web/docs/leaderboard/README.md)** — XP / level / achievements, ranked.

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

Open <http://localhost:5000/exocore/> and create the panel master account
through the on-screen setup form. Once the panel is unlocked, register a
regular user account from `/exocore/register`.

> **Credentials are not bundled with this repo.** Bring your own panel
> admin and demo-user credentials, then export them via the environment
> variables listed in the *Re-capturing the screenshots* section below
> before running the capture scripts.

---

## 📁 Layout

```
exocore-web/
├── client/         React 19 + Vite SPA (mounted at /exocore via BrowserRouter basename)
├── server/         Express + WSS infrastructure (RPC mux, social hub, services)
├── routes/         HTTP routes that the gateway exposes (most are also bridged to RPC)
├── templates/      Project-template catalog used by the editor's "New project" wizard
├── scripts/        Capture / tooling scripts (puppeteer-based exocore-web/docs capture, etc.)
├── exocore-web/docs/           Visual documentation (rendered screenshots + per-section README files)
├── app.ts          Express app factory
├── index.ts        Server entry point
└── vite.config.mts Client build config
```

The companion backend lives one level up at [`../Exocore-Backend`](../Exocore-Backend).

---

## 📚 Visual documentation

Per-route walkthroughs (with **desktop** + **mobile** screenshots) live under
[`exocore-web/docs/`](./exocore-web/docs/README.md). Section index:

| # | Folder | What it covers |
|---|--------|----------------|
| 1 | [`exocore-web/docs/panel/`](./exocore-web/docs/panel/README.md) | Panel-devs gate (master `devs.json` lock screen) |
| 2 | [`exocore-web/docs/auth/`](./exocore-web/docs/auth/README.md) | Home landing, Login, Register, Forgot, Verify, OAuth callback |
| 3 | [`exocore-web/docs/dashboard/`](./exocore-web/docs/dashboard/README.md) | Main `/dashboard` workspace (after user login) |
| 4 | [`exocore-web/docs/profile/`](./exocore-web/docs/profile/README.md) | `/u/:username` — profile, posts, friends, "stalk" mode |
| 5 | [`exocore-web/docs/social/`](./exocore-web/docs/social/README.md) | SocialPanel — chat, DMs, online presence, posts |
| 6 | [`exocore-web/docs/leaderboard/`](./exocore-web/docs/leaderboard/README.md) | Top members ranked by XP / level / achievements |
| 7 | [`exocore-web/docs/projects/`](./exocore-web/docs/projects/README.md) | Project nodes, CreateProjectWizard, FileManager |
| 8 | [`exocore-web/docs/cloud/`](./exocore-web/docs/cloud/README.md) | Google Drive cloud storage manager |
| 9 | [`exocore-web/docs/github/`](./exocore-web/docs/github/README.md) | GitHub integration (org browse, clone, push) |
| 10 | [`exocore-web/docs/editor/`](./exocore-web/docs/editor/README.md) | IDE (Monaco/CodeMirror), languages, terminal, AI, NPM |

Raw screenshot grids:

- Top-level routes: [`exocore-web/docs/screenshots/desktop`](./exocore-web/docs/screenshots/desktop) · [`exocore-web/docs/screenshots/mobile`](./exocore-web/docs/screenshots/mobile) (11 frames each)
- Editor workflow: [`exocore-web/docs/screenshots/editor`](./exocore-web/docs/screenshots/editor) (desktop, 14 frames) · [`exocore-web/docs/screenshots/editor/mobile`](./exocore-web/docs/screenshots/editor/mobile) (mobile, 14 frames — see *Mobile capture caveats* below)

---

## 📸 Re-capturing the screenshots

Both capture scripts run a real Chromium 138 instance via Puppeteer. The
**Start application** workflow must be running on port 5000 first.

```bash
# Top-level routes (panel gate, auth, dashboard, profile, leaderboard, editor splash)
EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-exocore-web/docs.ts

# Deep editor walkthrough — auto-creates `exorepo-demo` (node) + `exorepo-py`
# (python) under ./projects so the screenshots have something to render.
# Captures BOTH desktop (./exocore-web/docs/screenshots/editor/) and mobile
# (./exocore-web/docs/screenshots/editor/mobile/). Pass VIEWPORT=desktop or VIEWPORT=mobile
# to capture only one.
npx tsx exocore-web/scripts/capture-editor.ts
```

Useful environment overrides (both scripts):

| Variable          | Default                         | Purpose |
|-------------------|---------------------------------|---------|
| `EXOCORE_BASE`    | `http://localhost:5000/exocore` | Panel base URL |
| `EXO_PANEL_USER`  | *(required)*                    | Panel-gate username |
| `EXO_PANEL_PASS`  | *(required)*                    | Panel-gate password |
| `EXO_LOGIN_USER`  | *(required)*                    | Demo-user username |
| `EXO_LOGIN_PASS`  | *(required)*                    | Demo-user password |
| `VIEWPORT`        | *(both)*                        | `desktop` or `mobile` to filter (editor script) |
| `CHROMIUM_PATH`   | bundled nix path                | Override the Chromium binary |

> The capture scripts read the four `EXO_*` variables on every run — set
> them in your shell or a local `.env` (do **not** commit values back into
> the repo).

### Mobile capture caveats

Headless Chromium 138 has a stubborn bug where the embedded **preview /
webview** target detaches the parent page session whenever the editor's
mobile preview pane is opened. To work around it, the script:

- Skips the `05-editor-webview` capture on mobile (the preview pane is
  collapsed into the bottom drawer on mobile and is already covered by
  the `03 / 04` terminal + console frames).
- Wraps every step in a tolerant `safeStep(...)` so a single pane-open
  failure can't abort the whole pass.
- Re-runs the panel-unlock + login flow inside a fresh browser context
  before any "fix-up" pass that needs to fill in late-arriving frames.

With those guards the mobile pass now produces **14 of the 15 desktop
frames** (everything except `05-editor-webview`). Desktop still captures
the full 15 (well, 14 numbered + the gate) without limitation.

---
