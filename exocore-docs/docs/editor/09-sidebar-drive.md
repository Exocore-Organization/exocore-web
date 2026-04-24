# 09 — Drive sidebar pane

  `GDrivePane.tsx` picks files / folders from the connected Google Drive account and uploads project files back the other way. Drive auth is shared with the dashboard's [Cloud manager](../cloud/README.md).

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![09 — Drive sidebar pane — desktop](../screenshots/editor/09-sidebar-drive.png) | ![09 — Drive sidebar pane — mobile](../screenshots/editor/mobile/09-sidebar-drive.png) |
  
  ## What it does

  - Picker uses the standard Google Picker API embedded inside an iframe modal — no extra OAuth round-trip if the user already linked Drive in the dashboard.
- Upload writes go through `/exocore/api/editor/gdrive/upload` (multipart) and inherit the user's per-folder ACL.
- Drive sessions are revoked from `Dashboard → Account → Connections`.

  ## Source files

  - [`client/editor/GDrivePane.tsx`](../../client/editor/GDrivePane.tsx)
- [`routes/editor/gdrive.ts`](../../routes/editor/gdrive.ts)
- [`server/services/googleDrive`](../../server/services/googleDrive)

  ---

  ← Back to the [editor index](./README.md).
  