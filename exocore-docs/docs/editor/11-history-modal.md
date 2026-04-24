# 11 — Code history modal

  Local versioned snapshots of the active file (kept in IndexedDB). Each entry shows the timestamp, a unified diff against the previous snapshot, and a `Restore` button. Opened from the topbar `Code history` icon.

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![11 — Code history modal — desktop](../screenshots/editor/11-history-modal.png) | ![11 — Code history modal — mobile](../screenshots/editor/mobile/11-history-modal.png) |
  
  ## What it does

  - Snapshots are auto-captured on every successful autosave (debounced 800 ms after the last keystroke).
- Storage is per-file inside IndexedDB so it survives refresh, browser restart, and OAuth re-auth.
- Restore swaps the active editor buffer back to the snapshot's content but does **not** auto-save — the user has to commit the change explicitly.

  ## Source files

  - [`client/editor/coding.tsx (HistoryCodePreview)`](../../client/editor/coding.tsx (HistoryCodePreview))
- [`client/editor/fileStore.ts`](../../client/editor/fileStore.ts)

  ---

  ← Back to the [editor index](./README.md).
  