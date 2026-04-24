# 00 — Panel gate

  First-touch screen at `/exocore/`. Until a panel-devs master account exists in `devs.json`, every other route is locked behind this gate. The form doubles as both the **register-master** flow (when the file is empty) and the **unlock** flow (when an account is already provisioned).

  ## Screenshots

  | Desktop | Mobile |
  |---------|--------|
  | ![00 — Panel gate — desktop](../screenshots/editor/00-panel-gate.png) | ![00 — Panel gate — mobile](../screenshots/editor/mobile/00-panel-gate.png) |
  
  ## What it does

  - POST `/exocore/api/access/panel/register` (first run) → writes the salted master credential into `devs.json`.
- POST `/exocore/api/access/panel/unlock` (subsequent runs) → returns a short-lived panel cookie used by every other route.
- All other client routes redirect here while the cookie is missing.

  ## Source files

  - [`client/access/Panel.tsx`](../../client/access/Panel.tsx)
- [`routes/access/panel.ts`](../../routes/access/panel.ts)

  ---

  ← Back to the [editor index](./README.md).
  