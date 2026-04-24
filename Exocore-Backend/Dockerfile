# ──────────────────────────────────────────────────────────────────────────────
# Exocore Backend — production Docker image (no-source variant)
#
# This image is built FROM A PRE-BUILT, OBFUSCATED `dist/` ONLY.
# The TypeScript sources in `src/` are intentionally NOT part of the
# build context — they stay on the developer's machine and are never
# uploaded to Hugging Face Spaces (or any other host running this image).
#
# ── Workflow ─────────────────────────────────────────────────────────
#
#   On your local machine (the only place `src/` lives):
#
#     cd Exocore-Backend
#     npm install --legacy-peer-deps
#     npm run build:secure         # tsc → dist/  +  obfuscate every dist/*.js
#
#   Then upload ONLY these to the host (HF Space, server, registry, …):
#
#     Exocore-Backend/
#     ├── Dockerfile               (this file)
#     ├── .dockerignore
#     ├── package.json
#     ├── package-lock.json
#     ├── dist/                    ← obfuscated bundle, the only "source"
#     └── scripts/                 ← runtime helpers (getToken, getClient, …)
#
#   The `src/` folder is hard-excluded from the build context by
#   `.dockerignore` so it can't accidentally leak even if you forgot to
#   delete it before uploading.
#
# ── Build ────────────────────────────────────────────────────────────
#
#   docker build -t exocore-backend:latest -f Exocore-Backend/Dockerfile Exocore-Backend
#
# ── Run ──────────────────────────────────────────────────────────────
#
#   docker run --rm -p 8081:8081 \
#       -v $PWD/Exocore-Backend/local-db:/app/local-db \
#       -v $PWD/Exocore-Backend/credentials.json:/app/credentials.json:ro \
#       -e PORT=8081 \
#       exocore-backend:latest
#
# Hugging Face Spaces want the listening port to be 7860 — override:
#       docker run -p 7860:7860 -e PORT=7860 exocore-backend:latest
# ──────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8081 \
    NPM_CONFIG_LOGLEVEL=warn

# tini → clean PID-1 / signal handling for graceful shutdown.
# ca-certificates → required for outbound TLS (Google APIs, SMTP, …).
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 exocore \
 && useradd  --system --uid 1001 --gid exocore --create-home exocore

WORKDIR /app

# 1) lockfile + manifest first → cache-friendly install.
COPY --chown=exocore:exocore package*.json ./

# 2) Install RUNTIME deps only (skip devDeps like tsc / tsx / obfuscator —
#    they're only needed on the build machine where `dist/` was produced).
#    `--ignore-scripts` keeps lifecycle hooks from trying to re-build.
RUN npm install --omit=dev --legacy-peer-deps --ignore-scripts \
 && npm cache clean --force

# 3) Copy the pre-built obfuscated bundle and the runtime helpers.
#    NOTE: we deliberately do NOT copy `src/` — it's blocked at the
#    .dockerignore layer too, so this is belt-and-braces.
COPY --chown=exocore:exocore dist    ./dist
COPY --chown=exocore:exocore scripts ./scripts

# 4) Persistent state lives in /app/local-db. Mount a volume here at
#    runtime if the user database needs to survive container restarts.
RUN mkdir -p /app/local-db && chown exocore:exocore /app/local-db
VOLUME ["/app/local-db"]

USER exocore

EXPOSE 8081

# Cheap healthcheck — the backend exposes GET /exocore/api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8081)+'/exocore/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]

# Production entry — the obfuscated, source-free bundle.
# (`npm run start:prod` resolves to the same command, kept literal so the
#  image still runs even if package.json is stripped further later.)
CMD ["node", "dist/index.js"]
