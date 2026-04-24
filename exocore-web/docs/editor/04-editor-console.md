# 04 — Console pane

  `ConsolePane.tsx` shows the project runtime's stdout / stderr stream. The Start / Stop button calls `routes/editor/runtime.ts` which spawns the configured `exocore.run` script and pipes the output back over Server-Sent Events.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![04 — Console pane — desktop](../screenshots/editor/04-editor-console.png) | ![04 — Console pane — mobile](../screenshots/editor/mobile/04-editor-console.png) |
  
  ## What it does

  - Console is **runtime output** — it's separate from the terminal (which is an interactive pty).
- The desktop screenshot was captured mid-run; the mobile shot intentionally shows the empty pane (running the dev server inside the headless mobile profile detaches the page session).
- The Stop button sends `SIGTERM` first then `SIGKILL` after a 3s grace period.

  ## Source files

  - [`client/editor/ConsolePane.tsx`](../../client/editor/ConsolePane.tsx)
- [`routes/editor/runtime.ts`](../../routes/editor/runtime.ts)

  ---

  ← Back to the [editor index](./README.md).
  