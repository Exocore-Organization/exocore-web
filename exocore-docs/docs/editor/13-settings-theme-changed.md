# 13 — Settings · theme switch

  Same settings modal, captured immediately after switching to a different theme (Dracula on desktop). The swatches re-render live across the entire editor chrome — header, sidebar, status bar, even the modal itself — so users can preview without closing the dialog.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![13 — Settings · theme switch — desktop](../screenshots/editor/13-settings-theme-changed.png) | ![13 — Settings · theme switch — mobile](../screenshots/editor/mobile/13-settings-theme-changed.png) |
  
  ## What it does

  - Theme application path: `setTheme(id)` → `useLegacyEditorStore` → CSS variables on `<body>` → re-render of every styled component.
- The Monaco / CodeMirror grammars are restyled in the same tick using the matching token-color map from `editorThemes.ts`.
- Closing the modal commits the change; pressing **Cancel** rolls back to the previous theme via the snapshot taken on open.

  ## Source files

  - [`client/editor/Settings.tsx`](../../client/editor/Settings.tsx)
- [`client/editor/editorThemes.ts`](../../client/editor/editorThemes.ts)

  ---

  ← Back to the [editor index](./README.md).
  