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

## Hugging Face (`cp` to HF clone → `git add -A && git commit && git push`)

| File | When to push |
|------|-------------|
| `exocore-ide` | After recompile (always, LFS) |
| `Dockerfile` | Changed |
| `README.md` | Changed |
| `package.json` | Changed |
