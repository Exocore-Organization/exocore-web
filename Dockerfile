# ──────────────────────────────────────────────────────────────────────────────
# Exocore Web — production Docker image (dist/-based)
#
# The dist/ folder is pre-built (TypeScript compiled + obfuscated via
# build-dist.mjs) and committed to the repo, so this image only needs to:
#   1. Install production npm deps (including building node-pty natively)
#   2. Copy dist/ and the static assets that live inside it
#   3. Run: node dist/index.js
#
# Build:  docker build -t exocore:latest .
# Run:    docker run --rm -p 5000:5000 \
#           -v exocore-projects:/app/projects \
#           -v exocore-uploads:/app/uploads  \
#           exocore:latest
# ──────────────────────────────────────────────────────────────────────────────

# ───── Stage 1: install production deps (needs build tools for node-pty) ──────
FROM node:20-slim AS builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# Build tools needed to compile node-pty native bindings.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install production deps only — no dev tools, no vite, no tsx needed.
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund


# ───── Stage 2: minimal runtime ───────────────────────────────────────────────
FROM node:20-slim AS runner

LABEL org.opencontainers.image.title="Exocore IDE"
LABEL org.opencontainers.image.description="Browser-based IDE — full stack, any language"
LABEL org.opencontainers.image.version="5.0.0"

ENV NODE_ENV=production \
    PORT=5000 \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    NODE_OPTIONS="--max-old-space-size=384"

# Bare-minimum runtime OS packages.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl tini procps \
        bash coreutils \
        git unzip zip \
        python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /var/cache/apt/archives/*

WORKDIR /app

# Non-root user.
RUN groupadd --system --gid 1001 exocore \
 && useradd  --system --uid 1001 --gid exocore --create-home --shell /bin/bash exocore

# ── Copy only what the runtime needs ──────────────────────────────────────────
# Production node_modules (with node-pty native .node binary compiled above).
COPY --from=builder --chown=exocore:exocore /app/node_modules  ./node_modules

# Pre-built + obfuscated server + browser assets (all in dist/).
COPY --chown=exocore:exocore dist/ ./dist/

# Root package.json (needed for version API + node_modules resolution).
COPY --chown=exocore:exocore package.json ./

# ── Persistent data directories ────────────────────────────────────────────────
RUN mkdir -p \
        /app/projects \
        /app/projects_archive \
        /app/uploads/temp \
        /app/uploads/avatars \
 && chown -R exocore:exocore /app

VOLUME ["/app/projects", "/app/uploads"]

RUN mkdir -p /tmp/exo-cache && chown exocore:exocore /tmp/exo-cache

USER exocore

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
    CMD curl -f http://localhost:${PORT}/exocore/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
