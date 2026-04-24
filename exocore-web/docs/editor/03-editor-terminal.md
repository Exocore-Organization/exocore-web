# 03 — Integrated terminal

  `KittyTerminal.tsx` wraps `xterm.js` over a WebSocket pty bridge. Multiple tabs and split panes are supported; each tab is a separate node-pty process scoped to the project's working directory.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![03 — Integrated terminal — desktop](../screenshots/editor/03-editor-terminal.png) | ![03 — Integrated terminal — mobile](../screenshots/editor/mobile/03-editor-terminal.png) |
  
  ## What it does

  - WebSocket endpoint: `wss://<host>/exocore/api/editor/shell?projectId=…&tabId=…`.
- Server-side: `node-pty` spawns the user's preferred shell (`bash` on Linux containers, `pwsh` on Windows hosts) inside `projects/<projectId>/`.
- ANSI colors and unicode glyphs use the `Cascadia Code` / `JetBrainsMono Nerd Font` fallback chain.

  ## Source files

  - [`client/terminal/KittyTerminal.tsx`](../../client/terminal/KittyTerminal.tsx)
- [`routes/editor/shell.ts`](../../routes/editor/shell.ts)

  ---

  ← Back to the [editor index](./README.md).
  