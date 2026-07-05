# Two Separate Git Repos

## 1. Public Repo — `exocore-web` (root level)

**Remote:** `origin` → `https://github.com/Exocore-Organization/exocore-web.git`

Contains compiled binary + installers + assets. Source code (`backup/`) and `build.ts` are **gitignored**.

| File | When to push |
|------|-------------|
| `exocore-ide` | After recompile (always, LFS — 345 MB) |
| `pty-helper-linux-x64` | After PTY helper rebuild |
| `Dockerfile` | Changed |
| `README.md` | Changed |
| `linux.sh` | Changed |
| `termux.sh` | Changed |
| `install.ps1` | Changed |
| `window.bat` | Changed |
| `start.sh` | Changed |
| `deno.json` | Changed |
| `.gitattributes` | LFS config changes |
| `docs/` | Changed |
| `guidePush.md` | Changed |

```bash
cd /home/runner/workspace
git add -A
git commit -m "message"
git push origin main
```

---

## 2. Private Repo — `exocore-web-backup` (inside `backup/`)

**Remote:** `origin` → `https://github.com/Exocore-Organization/exocore-web-backup.git`

Contains source code (`backup/exocore-ide/`), `build.ts`, `deno.json`.

```bash
cd /home/runner/workspace/backup
# Copy latest build.ts/deno.json from root if changed
cp ../build.ts ../deno.json .
git add -A
git commit -m "message"
git push origin main
```

---

## 3. Hugging Face (optional)

```bash
cp exocore-ide Dockerfile README.md package.json /tmp/opencode/exocore-web/
cp -r backup/exocore-ide/static-pages backup/exocore-ide/templates backup/exocore-ide/extension backup/exocore-ide/scripts /tmp/opencode/exocore-web/
cd /tmp/opencode/exocore-web
git add -A && git commit -m "message" && git push
```

> **HF blocks binary files** (.png, .jpg, .ttf, .mp3) — remove them before pushing if needed.
