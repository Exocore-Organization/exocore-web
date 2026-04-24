# 12 — Settings modal

  Theme picker, font family / size, key bindings, indent rules, word-wrap toggle, autosave delay, and the AI provider quick-link. Persisted to localStorage as well as synced to the user account when logged in.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![12 — Settings modal — desktop](../screenshots/editor/12-settings-modal.png) | ![12 — Settings modal — mobile](../screenshots/editor/mobile/12-settings-modal.png) |
  
  ## What it does

  - Theme list is sourced from `editorThemes.ts` (60+ themes — One Dark Pro, Dracula, Tokyo Night, Replit, Catppuccin, Monokai, Synthwave 84, …).
- Settings are split into tabs — `General · Editor · AI · About`.
- Each numeric input is validated client-side before being written back to the store; out-of-range values fall back to the default.

  ## Source files

  - [`client/editor/Settings.tsx`](../../client/editor/Settings.tsx)
- [`client/editor/editorThemes.ts`](../../client/editor/editorThemes.ts)
- [`client/editor/uiStore.ts`](../../client/editor/uiStore.ts)

  ---

  ← Back to the [editor index](./README.md).
  