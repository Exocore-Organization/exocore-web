# 08 — GitHub sidebar pane

  `GithubPane.tsx` covers the full editor-side Git workflow: OAuth login, clone, push / pull, branch switching, staged-files diff view, and per-file revert. See the dedicated [GitHub pane docs](../github/README.md) for the full feature matrix.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![08 — GitHub sidebar pane — desktop](../screenshots/editor/08-sidebar-github.png) | ![08 — GitHub sidebar pane — mobile](../screenshots/editor/mobile/08-sidebar-github.png) |
  
  ## What it does

  - OAuth happens through `/exocore/api/access/github/start` → `/callback`; the resulting token is stored encrypted on the backend, not in localStorage.
- All git operations are POSTed through `/exocore/api/editor/github/*` and shell out to `git` inside the project workspace.
- The diff view is a Monaco DiffEditor reused by the file-history modal (frame 11).

  ## Source files

  - [`client/editor/GithubPane.tsx`](../../client/editor/GithubPane.tsx)
- [`routes/editor/github.ts`](../../routes/editor/github.ts)

  ---

  ← Back to the [editor index](./README.md).
  