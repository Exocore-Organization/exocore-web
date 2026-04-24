# 02 — Explorer file open

  Clicking a file in the explorer (here `index.js`) opens it in a new tab. Monaco loads its contents, the LSP bridge spins up the matching language server, and diagnostics start streaming back into the gutter and the Problems pane.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![02 — Explorer file open — desktop](../screenshots/editor/02-editor-explorer-file.png) | ![02 — Explorer file open — mobile](../screenshots/editor/mobile/02-editor-explorer-file.png) |
  
  ## What it does

  - Tabs are stored in `useFileStore` so a refresh restores the same set of open files.
- The active file's contents are persisted to IndexedDB on every keystroke (via the autosave timer in `coding.tsx`).
- `useLspClient(content, fileName, projectId)` opens a WebSocket to `/exocore/api/editor/lsp` and routes diagnostics back into the editor.

  ## Source files

  - [`client/editor/Sidebar.tsx`](../../client/editor/Sidebar.tsx)
- [`client/editor/Tabs.tsx`](../../client/editor/Tabs.tsx)
- [`client/editor/SimpleCodeEditor.tsx`](../../client/editor/SimpleCodeEditor.tsx)
- [`client/editor/LspClient.tsx`](../../client/editor/LspClient.tsx)

  ---

  ← Back to the [editor index](./README.md).
  