# Files to Push

## GitHub (`git add -A && git commit && git push`)

| File | When to push |
|------|-------------|
| `exocore-ide` | After recompile (always, LFS — 310 MB) |
| `Dockerfile` | Changed |
| `README.md` | Changed |
| `build.ts` | Changed |
| `deno.json` | Changed |
| `.gitattributes` | LFS config changes |
| `guidePush.md` | Changed |

> Source code (`backup/exocore-ide/`) is **gitignored** — not pushed. Only the compiled binary goes to GitHub.

## Hugging Face (`cp -r` to HF clone → `git add -A && git commit && git push`)

| File/Dir | When to push |
|----------|-------------|
| `exocore-ide` | After recompile (always, LFS) |
| `Dockerfile` | Changed |
| `README.md` | Changed |
| `static-pages/` | Changed |
| `templates/` | Changed |
| `extension/` | Changed |
| `scripts/` | Changed |
| `package.json` | Changed |

```bash
# Full sync command
cp exocore-ide Dockerfile README.md package.json /tmp/opencode/exocore-web/
cp -r backup/exocore-ide/static-pages backup/exocore-ide/templates backup/exocore-ide/extension backup/exocore-ide/scripts /tmp/opencode/exocore-web/
cd /tmp/opencode/exocore-web
git add -A && git commit -m "message" && git push
```

> **HF blocks binary files** (.png, .jpg, .ttf, .mp3) — remove them before pushing if needed.
