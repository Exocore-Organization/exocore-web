# 06 — Problems pane

  LSP diagnostics aggregated across every open file, grouped per-file with severity icons. Click a row to jump straight to the offending line.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![06 — Problems pane — desktop](../screenshots/editor/06-editor-problems.png) | ![06 — Problems pane — mobile](../screenshots/editor/mobile/06-editor-problems.png) |
  
  ## What it does

  - Source: the same `useLspClient(...)` hook used by the editor gutter.
- Severity counts (errors / warnings) are also surfaced in the status bar.
- Click a diagnostic → `jumpToLine(line)` in `coding.tsx` selects the position in the active textarea and scrolls it into view.

  ## Source files

  - [`client/editor/Layout.tsx`](../../client/editor/Layout.tsx)
- [`client/editor/LspClient.tsx`](../../client/editor/LspClient.tsx)

  ---

  ← Back to the [editor index](./README.md).
  