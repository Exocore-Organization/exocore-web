FROM node:20-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ git \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --legacy-peer-deps

RUN cd node_modules/node-pty && PYTHON=$(which python3) npx node-gyp rebuild

FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build:client

FROM node:20-slim AS runner

# ----------------------------------------------------------------------------
# Runtimes & build tools that templates' install.sh expect to find.
# Pre-installing them here means install.sh on Hugging Face / Render / Railway
# (Docker, no nix-env) just detects the runtime and skips the install step.
# ----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl tini procps fish ca-certificates \
        sudo bash coreutils util-linux \
        git make cmake gcc g++ build-essential pkg-config \
        python3 python3-pip python3-venv \
        php-cli composer \
        unzip zip \
    && rm -rf /var/lib/apt/lists/*

# Optional runtimes that are nice to have pre-installed for templates:
# Bun, Deno, Rust (cargo), .NET. Failures are non-fatal — install.sh has
# its own fallbacks if any of these aren't present at runtime.
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && curl -fsSL https://deno.land/install.sh | sh \
    && ln -sf /root/.deno/bin/deno /usr/local/bin/deno \
    || true

RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then CF_ARCH="amd64"; \
    elif [ "$ARCH" = "arm64" ]; then CF_ARCH="arm64"; \
    else CF_ARCH="amd64"; fi && \
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}.deb" -o /tmp/cloudflared.deb && \
    dpkg -i /tmp/cloudflared.deb && \
    rm /tmp/cloudflared.deb

WORKDIR /app

RUN groupadd --system --gid 1001 exocore && \
    useradd --system --uid 1001 --gid exocore exocore && \
    echo 'exocore ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/exocore

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/exocore-web/dist ./exocore-web/dist
COPY --from=builder /app/exocore-web ./exocore-web
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig*.json ./

RUN mkdir -p projects projects_archive uploads/temp && \
    chown -R exocore:exocore /app

USER exocore

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:${PORT}/exocore/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/tsx", "exocore-web/index.ts"]
