# GitHub integration

Two surfaces:

1. **Dashboard card** — shows org connection status + a "Visit Org" link to
   `https://github.com/Exocore-Organization`.
2. **`GithubManager` modal** ([`home/GithubManager.tsx`](../../client/home/GithubManager.tsx))
   — full OAuth dance, repo browser, clone-into-project flow.
3. **IDE Github pane** ([`editor/GithubPane.tsx`](../../client/editor/GithubPane.tsx))
   — sidebar inside the editor with branch / commit / push / pull buttons.

Backend route: [`routes/editor/github.ts`](../../routes/editor/github.ts).

## Visual

The Dashboard capture below shows the GitHub card on the social grid; the
modal opens on top with the same dark-yellow theme.

| Desktop | Mobile |
|---------|--------|
| ![Dashboard — desktop](../screenshots/desktop/07-dashboard.png) | ![Dashboard — mobile](../screenshots/mobile/07-dashboard.png) |

## Manager modal sections

```
┌─ Connected account ───────────────────────────────┐
│  @octocat · 142 repos · 8 orgs                    │
│  scopes: repo, read:org, workflow                 │
│  [ Disconnect ]                                   │
├─ Browse repos ────────────────────────────────────┤
│  search · filter (orgs / forks / archived)        │
│  ┌─ row ────────────────────────────────────────┐ │
│  │ ⭐ exocore-web   · TypeScript · 1 day ago    │ │
│  │ [ Open in IDE ] [ Clone to project ] [ … ]   │ │
│  └──────────────────────────────────────────────┘ │
├─ Pending PRs / Issues ────────────────────────────┤
│  inline preview cards                             │
└───────────────────────────────────────────────────┘
```

## OAuth flow

1. Click **Connect GitHub** → redirect to GitHub OAuth consent
   (`scope=repo,read:org,workflow`).
2. GitHub redirects to `/exocore/api/editor/github/callback`.
3. Server stores access token in encrypted user record.
4. UI re-fetches `github.status` and unlocks browse / clone actions.

## IDE Github pane

Lives in the left sidebar (`tab="github"`). Provides:

- **Branch picker** — switch / create / delete branches.
- **Status** — staged / unstaged / untracked files with diff preview.
- **Commit composer** — message input + sign-off toggle.
- **Push / pull** with conflict UI.
- **Open repo on github.com** chip.

## RPC channels

| Channel | Purpose |
|---------|---------|
| `github.status`     | Returns `{ connected, login, scopes, repoCount }` |
| `github.repos`      | Paginated repo list (with filters) |
| `github.clone`      | Clones repo into a new Project Node |
| `github.commit`     | Stages + commits selected paths |
| `github.push`       | Pushes current branch |
| `github.pull`       | Fetch + merge upstream |
| `github.disconnect` | Revoke OAuth |
