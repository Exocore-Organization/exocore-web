# FileTree Pro

A context-aware file explorer that supercharges the Exocore file tree with right-click menus, live filtering, file-info tooltips, drag-and-drop support, and context-aware quick actions.

---

## Features

### Right-click context menu
Right-click any file or folder in the explorer to get:

| File | Folder |
|---|---|
| ✏️ Rename | 📄 New File |
| 📋 Copy Path | 📁 New Folder |
| 📝 Duplicate | ✏️ Rename |
| 🗑 Delete | 📋 Copy Path |
| | 🗑 Delete |

All operations are backed by the Exocore file API — no terminal needed.

### Live filter box
A search box appears at the top of the file tree. Type to instantly filter files by name or path. Press `Ctrl/⌘+Shift+F` (or click the `🌲 Tree` status bar button) to focus it.

Parent folders of matching files are automatically kept visible.

### File-info tooltips
Hover over any file to see a tooltip showing:
- Full path
- File extension badge

### Context-aware quick-action bar
When you open a file in the editor, a small bar appears at the bottom of the file tree with a context-relevant action button:

| Extension | Quick action |
|---|---|
| `.js` / `.ts` / `.py` / `.sh` | ▶ Run in terminal |
| `.html` / `.md` | 🌐 Open preview |
| `.json` | ✔ Validate JSON |
| `.css` / `.scss` | 🎨 Beautify |

### Drag-and-drop
Full drag-and-drop file/folder move is already built into the Exocore file tree — FileTree Pro enhances the visual feedback.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/⌘+Shift+F` | Focus the file filter box |
| `Esc` | Clear the filter and return to the tree |
