# ──────────────────────────────────────────────────────────────────────────────
# Exocore Web — production Docker image
#
# Slim runtime that bundles ONLY the two language runtimes the editor
# currently supports out of the box:
#   • Node.js 20  (default workspace runtime + the Express gateway itself)
#   • Python 3    (template: `exorepo-py`, plus AI / scripting templates)
#
# Other runtimes (PHP, Bun, Deno, Rust, .NET, etc.) are intentionally
# disabled — re-enable them in this Dockerfile only after the matching
# templates and editor LSP wiring have landed. Disabling keeps the image
# small (~250 MB instead of ~1.2 GB) and shrinks the attack surface.
#
# Build:
#   docker build -t exocore-web:latest .
#
# Run:
#   docker run --rm -p 5000:5000 exocore-web:latest
# ──────────────────────────────────────────────────────────────────────────────

# ───── Stage 1: install + native rebuild ─────
FROM node:20-slim AS deps

WORKDIR /app

# Build tools needed to compile node-pty (the only native module we care about).
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
        python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --legacy-peer-deps

# Rebuild node-pty against the container's libc / node ABI.
RUN cd node_modules/node-pty && PYTHON=$(which python3) npx node-gyp rebuild


# ───── Stage 2: client build ─────
FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build:client


# ───── Stage 3: minimal runtime ─────
FROM node:20-slim AS runner

# Only the runtimes Exocore currently supports end-to-end:
#   - Node.js 20 (already in the base image)
#   - Python 3 + pip + venv
# Plus the bare-minimum supporting tools for git-clone templates,
# unzip uploads, and shell sessions.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl tini procps \
        bash coreutils util-linux \
        git unzip zip \
        python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd --system --gid 1001 exocore && \
    useradd  --system --uid 1001 --gid exocore --create-home exocore

COPY --from=deps    /app/node_modules         ./node_modules
COPY --from=builder /app/exocore-web/dist     ./exocore-web/dist
COPY --from=builder /app/exocore-web          ./exocore-web
COPY --from=builder /app/package*.json        ./
COPY --from=builder /app/tsconfig*.json       ./

RUN mkdir -p projects projects_archive uploads/temp \
 && chown -R exocore:exocore /app

USER exocore

ENV NODE_ENV=production \
    PORT=5000 \
    EXOCORE_RUNTIMES=node,python

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT}/exocore/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/tsx", "exocore-web/index.ts"]
