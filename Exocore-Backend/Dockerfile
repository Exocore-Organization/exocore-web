# ──────────────────────────────────────────────────────────────────────────────
# Exocore Backend — production Docker image
#
# Builds a slim, obfuscated JS bundle from the TypeScript source so the
# resulting image is hard to read / modify if it ever leaks out of the host
# (e.g. on Hugging Face Spaces). The intermediate TS sources are dropped from
# the final image — only the obfuscated `dist/` and runtime deps remain.
#
# Build:
#   docker build -t exocore-backend:latest -f Exocore-Backend/Dockerfile Exocore-Backend
#
# Run:
#   docker run --rm -p 8081:8081 \
#       -v $PWD/Exocore-Backend/local-db:/app/local-db \
#       -v $PWD/Exocore-Backend/credentials.json:/app/credentials.json:ro \
#       -e PORT=8081 \
#       exocore-backend:latest
# ──────────────────────────────────────────────────────────────────────────────

# ───── Stage 1: build + obfuscate ─────
FROM node:20-bookworm-slim AS builder

WORKDIR /build

# OS deps for native modules (some googleapis transitive deps need python).
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy lockfile + manifest first for cache-friendly install.
COPY package*.json tsconfig.json ./

# Install ALL deps (incl. dev) for the build pass.
RUN npm install --legacy-peer-deps --ignore-scripts

# Pull in the rest of the sources.
COPY src ./src
COPY scripts ./scripts

# 1) compile TypeScript → dist/
RUN npx tsc

# 2) install + run the obfuscator on every emitted .js file in dist/.
#    `--self-defending` + dead-code injection make the bundle painful to
#    edit by hand without breaking it.
RUN npm install --no-save --legacy-peer-deps javascript-obfuscator \
 && node -e "                                                                  \
    const fs   = require('fs');                                                \
    const path = require('path');                                              \
    const ob   = require('javascript-obfuscator');                             \
    const opts = {                                                             \
      compact: true,                                                           \
      controlFlowFlattening: true,                                             \
      controlFlowFlatteningThreshold: 0.6,                                     \
      deadCodeInjection: true,                                                 \
      deadCodeInjectionThreshold: 0.3,                                         \
      stringArray: true,                                                       \
      stringArrayEncoding: ['base64'],                                         \
      stringArrayThreshold: 0.75,                                              \
      identifierNamesGenerator: 'hexadecimal',                                 \
      renameGlobals: false,                                                    \
      selfDefending: true,                                                     \
      simplify: true,                                                          \
      transformObjectKeys: true,                                               \
      unicodeEscapeSequence: false,                                            \
      target: 'node'                                                           \
    };                                                                         \
    const walk = (d) => fs.readdirSync(d).forEach((n) => {                     \
      const p = path.join(d, n);                                               \
      const s = fs.statSync(p);                                                \
      if (s.isDirectory()) return walk(p);                                     \
      if (!p.endsWith('.js')) return;                                          \
      const src = fs.readFileSync(p, 'utf8');                                  \
      const out = ob.obfuscate(src, opts).getObfuscatedCode();                 \
      fs.writeFileSync(p, out);                                                \
    });                                                                        \
    walk(path.resolve('dist'));                                                \
    console.log('Obfuscation pass done.');                                     \
  "

# Strip dev deps so the next stage only carries runtime modules.
RUN npm prune --omit=dev --legacy-peer-deps


# ───── Stage 2: minimal runtime image ─────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=8081 \
    NPM_CONFIG_LOGLEVEL=warn

# tini gives us proper PID-1 signal handling for graceful shutdown.
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 exocore \
 && useradd  --system --uid 1001 --gid exocore --create-home exocore

WORKDIR /app

# Copy ONLY the obfuscated build + runtime modules. No sources. No tsconfig.
COPY --from=builder --chown=exocore:exocore /build/dist          ./dist
COPY --from=builder --chown=exocore:exocore /build/node_modules  ./node_modules
COPY --from=builder --chown=exocore:exocore /build/package.json  ./package.json

# Persistent state lives in /app/local-db. Mount a volume here at runtime
# if you want the user database to survive container restarts.
RUN mkdir -p /app/local-db && chown exocore:exocore /app/local-db
VOLUME ["/app/local-db"]

USER exocore

EXPOSE 8081

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
