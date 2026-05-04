# Exocore Extensions

This folder hosts editor extensions for `static-pages/editor` (the vanilla
editor). Two channels are supported:

- **`testing/`** — auto-loaded at editor boot. Used during development of an
  extension; the user sees them in the *Installed* tab with a yellow
  **AUTO INSTALLED** badge plus the README and version.
- **`official/`** — *not* auto-loaded. Drop `.zip` files downloaded from the
  team's Google Drive here (extract the archive so the folder name is the
  extension id). They show up in the *Browse* tab so users can read the
  README and click **Install** to start using them.

## Manifest format (`extension.json`)

```json
{
    "name": "Canvas",
    "version": "1.1.0",
    "author": "Exocore Team",
    "description": "Drag-and-drop visual canvas → emits HTML/JS/TS code.",
    "date": "2026-04-29",
    "team": true,
    "entry": "canvas.js",
    "status": "both",
    "access": "free",
    "supportedFiles": [".html", ".js", ".ts"]
}
```

| Field            | Notes                                                                            |
|------------------|----------------------------------------------------------------------------------|
| `name`           | Display name in the manager.                                                     |
| `version`        | Semver-ish string.                                                               |
| `author`         | Person / team that wrote it.                                                     |
| `description`    | One-liner shown on the card.                                                     |
| `date`           | ISO date the extension was published.                                            |
| `team`           | `true` if shipped by the Exocore group, `false` for community.                   |
| `entry`          | Optional. Defaults to `<folderName>.js`. Path is relative to the extension folder. |
| `icon`           | Optional. Defaults to `icon.svg` if present.                                     |
| `status`         | `online` / `offline` / `both`. `online` extensions only load when the browser is online; `offline` only when offline; `both` always. Defaults to `both`. |
| `access`         | `free` / `paid` / `roles`. `paid` requires an Exo Plan; `roles` requires the user to be `owner`, `admin` or `moderator`. Defaults to `free`. |
| `supportedFiles` | Optional list of file extensions (with leading dot) the extension applies to. The manager hides command launchers / status-bar items when the active file isn't in this list. |

## Folder layout per extension

```
extension/<scope>/<id>/
├── extension.json   ← manifest above
├── README.md        ← shown in the manager details panel
├── icon.svg         ← optional badge
└── <entry>.js       ← entry script (registers via window.ExoExt)
```

## Authoring an extension

The entry script runs once at editor boot. It registers itself via the global
`ExoExt` API:

```js
ExoExt.register('my-ext', {
    activate(api) {
        api.commands.register({
            id: 'my-ext.hello',
            title: 'My Ext: Hello',
            run: () => api.toast('Hi', 'Hello from my extension!', 'info'),
        });
    },
});
```

See `testing/canvas/canvas.js` for a complete example.
