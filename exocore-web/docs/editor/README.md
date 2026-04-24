# Editor / IDE — `/exocore/editor`

The Exocore IDE is a full Monaco-and-CodeMirror powered code editor with file
explorer, integrated terminal (xterm + node-pty), package managers, AI
assistant, GitHub pane, Drive pane, language servers, and a webview for live
previews.

Entry point: [`client/editor/coding.tsx`](../../client/editor/coding.tsx).
Layout shell: [`client/editor/Layout.tsx`](../../client/editor/Layout.tsx).

Every screenshot below was captured by
[`scripts/capture-editor.ts`](../../scripts/capture-editor.ts) against a freshly
seeded `exorepo-demo` (Node) project. Mobile shots come from a 414×896 iPhone
profile; desktop shots from a 1440×900 Chromium 138 window.

## Layout

```
┌─ Title bar ───────────────────────────────────────────────┐
│ Exocore · project / file path · 🔍 cmd-K · 🌗 theme       │
├─ Sidebar tabs ─────┬─ Tabs (open files) ──────────────────┤
│ ▾ Explorer (📁)    │ index.ts ✕  utils.ts ✕  README.md ✕  │
│   project tree     ├─ Editor pane ────────────────────────┤
│ ▾ NPM (📦)         │  Monaco (or CodeMirror per language) │
│ ▾ GitHub (🌿)      │  with LSP completion / diagnostics    │
│ ▾ Drive (☁)        │                                       │
│ ▾ AI (🤖)          │                                       │
├──────────────────  ├─ Bottom panel ───────────────────────┤
│                    │ [problems] [console] [terminal] [webview]
└────────────────────┴───────────────────────────────────────┘
                Status bar — git branch · LSP · runtime · cursor
```

`SidebarTab = 'explorer' | 'npm' | 'github' | 'drive' | 'ai'`
`BottomPanel = 'problems' | 'console' | 'terminal' | 'webview' | 'none'`

## Walkthrough

### 00 — Panel gate

The first thing a fresh browser sees is the per-machine panel-devs gate
(`/exocore/`). Until a panel admin (e.g. `Choruyt`) is registered, the rest
of the site is locked behind this form.

| Desktop | Mobile |
|---------|--------|
| ![Panel gate — desktop](../screenshots/editor/00-panel-gate.png) | ![Panel gate — mobile](../screenshots/editor/mobile/00-panel-gate.png) |

### 01 — Default editor view

After login the editor opens onto the project root — Monaco shows a welcome
banner and the explorer lists the seeded files.

| Desktop | Mobile |
|---------|--------|
| ![Editor default — desktop](../screenshots/editor/01-editor-default.png) | ![Editor default — mobile](../screenshots/editor/mobile/01-editor-default.png) |

### 02 — Explorer file open

Clicking a file in the explorer (here `index.js`) opens it in a new tab and
streams diagnostics from the matching LSP.

| Desktop | Mobile |
|---------|--------|
| ![Explorer file — desktop](../screenshots/editor/02-editor-explorer-file.png) | ![Explorer file — mobile](../screenshots/editor/mobile/02-editor-explorer-file.png) |

### 03 — Integrated terminal

`KittyTerminal.tsx` wraps `xterm.js` over a WebSocket pty bridge
(`routes/editor/shell.ts`). Multiple tabs and split panes are supported.

| Desktop | Mobile |
|---------|--------|
| ![Terminal — desktop](../screenshots/editor/03-editor-terminal.png) | ![Terminal — mobile](../screenshots/editor/mobile/03-editor-terminal.png) |

### 04 — Console pane

`ConsolePane.tsx` shows the project's runtime stdout/stderr from
`routes/editor/runtime.ts`. The Start/Stop button spawns the configured
`exocore.run` script. The desktop screenshot was captured mid-run; mobile
shows the empty pane (running the dev server inside the headless mobile
profile detaches the page session).

| Desktop | Mobile |
|---------|--------|
| ![Console — desktop](../screenshots/editor/04-editor-console.png) | ![Console — mobile](../screenshots/editor/mobile/04-editor-console.png) |

### 05 — Webview / preview (desktop only)

When the runtime detects a bound HTTP server it surfaces the URL inside an
embedded `<iframe>` (`Webview.tsx`). The mobile capture intentionally skips
this — the embedded preview iframe consistently crashes the Chromium 138
mobile target.

![Webview — desktop](../screenshots/editor/05-editor-webview.png)

### 06 — Problems pane

LSP diagnostics grouped per-file. Click a row to jump straight to the
offending line.

| Desktop | Mobile |
|---------|--------|
| ![Problems — desktop](../screenshots/editor/06-editor-problems.png) | ![Problems — mobile](../screenshots/editor/mobile/06-editor-problems.png) |

### 07 — NPM sidebar pane

`NpmPane.tsx` searches the public registry, lists installed dependencies, and
publishes packages using a browser-stored access token.

| Desktop | Mobile |
|---------|--------|
| ![NPM — desktop](../screenshots/editor/07-sidebar-npm.png) | ![NPM — mobile](../screenshots/editor/mobile/07-sidebar-npm.png) |

### 08 — GitHub sidebar pane

`GithubPane.tsx` covers OAuth auth, clone, push/pull, branch switching, and
the staged-files diff view. Dedicated docs: [GitHub pane](../github/README.md).

| Desktop | Mobile |
|---------|--------|
| ![GitHub — desktop](../screenshots/editor/08-sidebar-github.png) | ![GitHub — mobile](../screenshots/editor/mobile/08-sidebar-github.png) |

### 09 — Drive sidebar pane

`GDrivePane.tsx` picks files/folders from the connected Google Drive account
and uploads project files back the other way.

| Desktop | Mobile |
|---------|--------|
| ![Drive — desktop](../screenshots/editor/09-sidebar-drive.png) | ![Drive — mobile](../screenshots/editor/mobile/09-sidebar-drive.png) |

### 10 — AI sidebar pane

`ExocoreAI.tsx` is the chat assistant with file/terminal tool-use, streaming
SSE responses through `routes/editor/ai.ts`.

| Desktop | Mobile |
|---------|--------|
| ![AI — desktop](../screenshots/editor/10-sidebar-ai.png) | ![AI — mobile](../screenshots/editor/mobile/10-sidebar-ai.png) |

### 11 — Code history modal

Local versioned snapshots of the active file (kept in IndexedDB) — diff +
restore. Opened from the topbar `Code history` icon.

| Desktop | Mobile |
|---------|--------|
| ![History — desktop](../screenshots/editor/11-history-modal.png) | ![History — mobile](../screenshots/editor/mobile/11-history-modal.png) |

### 12 — Settings modal

Theme picker, font size, key bindings, indent rules, etc.

| Desktop | Mobile |
|---------|--------|
| ![Settings — desktop](../screenshots/editor/12-settings-modal.png) | ![Settings — mobile](../screenshots/editor/mobile/12-settings-modal.png) |

### 13 — Settings · theme switch

Same modal after switching to a different theme (Dracula on desktop). The
swatches re-render live across the editor and the surrounding chrome.

| Desktop | Mobile |
|---------|--------|
| ![Theme switch — desktop](../screenshots/editor/13-settings-theme-changed.png) | ![Theme switch — mobile](../screenshots/editor/mobile/13-settings-theme-changed.png) |

### 14 — PyLib pane (Python project)

Switching to the seeded `exorepo-py` project re-labels the package tab to
**PyPI** and renders `PyLibrary.tsx` in place of `NpmPane.tsx`.

| Desktop | Mobile |
|---------|--------|
| ![PyLib — desktop](../screenshots/editor/14-sidebar-pylib.png) | ![PyLib — mobile](../screenshots/editor/mobile/14-sidebar-pylib.png) |

## Sidebar tabs reference

| Tab | Component | What it does |
|-----|-----------|--------------|
| **Explorer** | `Sidebar.tsx`         | Tree view, drag-and-drop, context menu, multi-select |
| **NPM**      | `NpmPane.tsx`         | Search npm, install / uninstall, see installed deps |
| **GitHub**   | `GithubPane.tsx`      | See [GitHub docs](../github/README.md) |
| **Drive**    | `GDrivePane.tsx`      | Pick / upload from Google Drive |
| **AI**       | `ExocoreAI.tsx`       | Chat assistant with file/terminal tool-use |

The package tab swaps based on project language via
`PackagesPane.tsx` — `NPM` for Node, `PyPI` for Python, `Cargo` for Rust,
`Go`, `Maven`, `Gems`, `Composer`, `NuGet`, `Hex`, `Cabal`, `SPM`, …

## Bottom panels reference

| Panel    | Source             | Notes |
|----------|--------------------|-------|
| Problems | LSP diagnostics    | grouped per-file, click to jump |
| Console  | `ConsolePane.tsx`  | runtime stdout / stderr |
| Terminal | `KittyTerminal.tsx` + `xterm` | pty-backed, supports tabs |
| Webview  | `Webview.tsx`      | proxied iframe of the running project |

## Languages

`editor/language.tsx` registers Monaco grammars + CodeMirror extensions for:

- TypeScript / JavaScript (with JSX)
- Python · PHP · Rust · C · C++
- HTML · CSS · JSON · Markdown
- Plus syntax highlight via Prism for less common languages
  (Go, Ruby, YAML, TOML, SQL, Shell, …) inside chat code blocks.

LSP bridge: WebSocket to `routes/editor/_lspBridge.ts`, which spawns the
appropriate language server (`pyright`, `tsserver`, `rust-analyzer`,
`clangd`, …) per project.

## Command palette

`Ctrl + K` opens [`CommandPalette.tsx`](../../client/editor/CommandPalette.tsx)
with fuzzy-search across files, commands, settings, and AI prompts.

## AI assistant

Two-pane component (`ExocoreAI.tsx`):

- **Chat** — ChatGPT-style stream with code-blocks, file-attach, and
  "apply this diff" button.
- **Setup** — pick provider (Exo-built-in / OpenAI / Anthropic / OpenRouter)
  via [`ai/ExoSetupPanel.tsx`](../../client/editor/ai/ExoSetupPanel.tsx) +
  [`ai/RestSetupPanel.tsx`](../../client/editor/ai/RestSetupPanel.tsx).

Server bridge: [`routes/editor/ai.ts`](../../routes/editor/ai.ts) (proxies to
the configured provider, streams SSE back).

## Mobile layout

On viewports `≤ 768 px` the desktop sidebar collapses into an overlay drawer
that slides in over the editor, and the bottom panel becomes a full-screen
sheet pinned to a 5-button bottom nav (`.m-nav-btn`): **Files · Errors ·
Console · Terminal · Preview**. Tap the active button again to close the
drawer / sheet.

The Files button reveals the same five sidebar tabs from desktop
(Explorer · NPM · Git · Drive · AI) plus a close pill.

## Backend routes

| Route                                | Source |
|--------------------------------------|--------|
| `/exocore/api/editor/coding`         | File CRUD |
| `/exocore/api/editor/runtime`        | Spawn / stop project process |
| `/exocore/api/editor/shell`          | WS pty bridge for the terminal |
| `/exocore/api/editor/npm`            | Search / install npm |
| `/exocore/api/editor/pylib`          | pip equivalent |
| `/exocore/api/editor/deps`           | Cross-package summary |
| `/exocore/api/editor/templates`      | Template catalog (used by `capture-editor.ts` to seed `exorepo-demo` + `exorepo-py`) |
| `/exocore/api/editor/github`         | Git ops |
| `/exocore/api/editor/gdrive`         | Drive picker |
| `/exocore/api/editor/ai`             | AI proxy |
| `/exocore/api/editor/projects`       | Project CRUD |

## Re-capturing the screenshots

```bash
# Both viewports (default).
EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-editor.ts

# Desktop only.
VIEWPORT=desktop EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-editor.ts

# Mobile only.
VIEWPORT=mobile  EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-editor.ts

# Top-up the two mobile frames the main pass occasionally drops
# (theme switch + python pylib). Each runs in its own browser context.
EXOCORE_CAPTURE=1 npx tsx exocore-web/scripts/capture-editor-mobile-fix.ts
```

`EXOCORE_CAPTURE=1` raises the global rate-limit so the capture script can
hit `/login`, the templates SSE endpoint, and a dozen editor routes in
quick succession. The shipped `Start application` workflow already sets
this; production deploys do not.
