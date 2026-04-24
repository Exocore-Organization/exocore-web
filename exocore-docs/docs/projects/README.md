# Project Nodes

A **Project Node** is one isolated workspace inside the panel. Every node has
its own filesystem, run command, env vars, package manager state, and live
runtime stats. The Dashboard renders them as cards
([`home/ProjectNodeCard.tsx`](../../client/home/ProjectNodeCard.tsx)) and the
manager modal ([`home/FileManager.tsx`](../../client/home/FileManager.tsx))
lets you create / archive / delete / browse them.

## Visual

The Dashboard capture below shows where the project grid lives (top of the
"Project Nodes" section). Without an active user account it redirects to
login — sign in to see live cards.

| Desktop | Mobile |
|---------|--------|
| ![Dashboard — desktop](../screenshots/desktop/07-dashboard.png) | ![Dashboard — mobile](../screenshots/mobile/07-dashboard.png) |

## Card anatomy

```
┌───────────────────────────────┐
│  ▦ project-name      [⋮]      │
│  language · template          │
├───────────────────────────────┤
│  status: Running / Idle /…    │
│  CPU 7 %  ·  RAM 142 MB       │
├───────────────────────────────┤
│   [ Open ]   [ Run ]   [ ⋮ ]  │
└───────────────────────────────┘
```

Card actions:

- **Open** → `navigate(/editor?project=${id})` (deep-links into the IDE)
- **Run** → POST `editor/runtime/start`
- **⋮ menu** → Rename · Stop · Restart · Archive · Delete · Duplicate

## Create wizard

Triggered by the `+ New Project` quick action. Steps:

1. **Pick a template** —
   `editor/templates` provides Node.js, Python, Static HTML, React/Vite,
   Express, Flask, Next.js, Vanilla, "Empty".
2. **Name + slug** — auto-slugged with collision detection.
3. **Select runtime** — Node 20 / 22, Python 3.10 / 3.11 / 3.12, Bun, Deno.
4. **Initial files** — preview tree from the template; allow tweaks.
5. **Confirm + create** → spawns project under `exocore-web/uploads/<id>/`,
   records metadata in `editor/projects` and navigates straight into it.

Source: [`home/CreateProjectWizard.tsx`](../../client/home/CreateProjectWizard.tsx).

## File manager modal

Opened from `Quick Actions → Project Nodes`. Shows:

- All nodes (active + archived) with sort by name / last opened / size.
- Storage quota bar (per plan: free 1 GB, pro 10 GB, owner unlimited).
- Bulk actions: archive, restore, delete, export ZIP.

## Backend routes used

| Route | Verb | Source |
|-------|------|--------|
| `/exocore/api/editor/projects`            | GET  | List projects |
| `/exocore/api/editor/projects`            | POST | Create project |
| `/exocore/api/editor/projects/:id`        | PATCH | Rename / archive |
| `/exocore/api/editor/projects/:id`        | DELETE | Delete |
| `/exocore/api/editor/runtime/start`       | POST | Spawn process |
| `/exocore/api/editor/runtime/stop`        | POST | SIGTERM |
| `/exocore/api/editor/runtime/stats`       | GET  | CPU / RAM tick |

(Wired in [`routes/editor/projects.ts`](../../routes/editor/projects.ts) and
[`routes/editor/runtime.ts`](../../routes/editor/runtime.ts).)
