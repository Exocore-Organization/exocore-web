# ──────────────────────────────────────────────────────────────────────────────
# Exocore Docs — production Docker image
#
# Two-stage build:
#   1. Node 20 builds the Vite + React SPA into ./dist
#   2. nginx-alpine serves the static bundle (no Node runtime in the
#      final image — keeps it tiny: ~25 MB compressed)
#
# Build:
#   docker build -t exocore-docs:latest -f exocore-docs/Dockerfile exocore-docs
#
# Run (host port 8080 → container port 80):
#   docker run --rm -p 8080:80 exocore-docs:latest
#
# Hugging Face Spaces: this image works as-is on a "Docker" Space — HF
# expects something on port 7860, so override at run-time:
#   docker run -p 7860:7860 -e PORT=7860 exocore-docs:latest
# ──────────────────────────────────────────────────────────────────────────────

# ───── Stage 1: build the SPA ─────
FROM node:20-bookworm-slim AS builder

WORKDIR /build

# Cache npm install on the lockfile.
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Pull in the rest of the project.
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY docs   ./docs
COPY src    ./src

RUN npm run build


# ───── Stage 2: static serve via nginx ─────
FROM nginx:1.27-alpine AS runtime

# Drop the default nginx site and replace it with one that listens on
# $PORT (defaults to 80) and serves the SPA with hash-routing fallback.
RUN rm /etc/nginx/conf.d/default.conf

# Inline nginx config — kept here so the image is reproducible without
# any extra files outside the Docker build context.
RUN printf '%s\n' \
    'server {' \
    '    listen       ${NGINX_PORT};' \
    '    server_name  _;' \
    '    root         /usr/share/nginx/html;' \
    '    index        index.html;' \
    '' \
    '    # Long cache on hashed assets, short cache on the entry HTML.' \
    '    location /assets/ {' \
    '        add_header Cache-Control "public, max-age=31536000, immutable";' \
    '        try_files $uri =404;' \
    '    }' \
    '    location /screenshots/ {' \
    '        add_header Cache-Control "public, max-age=86400";' \
    '        try_files $uri =404;' \
    '    }' \
    '' \
    '    # Hash-router SPA fallback — every unknown path returns index.html.' \
    '    location / {' \
    '        add_header Cache-Control "no-cache";' \
    '        try_files $uri $uri/ /index.html;' \
    '    }' \
    '' \
    '    gzip            on;' \
    '    gzip_types      text/plain text/css application/javascript application/json image/svg+xml;' \
    '    gzip_min_length 1024;' \
    '}' \
    > /etc/nginx/templates/default.conf.template

COPY --from=builder /build/dist /usr/share/nginx/html

# Default to the conventional HTTP port. Override with -e PORT=7860 for
# Hugging Face Docker Spaces, or any other host that demands a specific
# listen port. nginx envsubst will fill `${NGINX_PORT}` at container start.
ENV PORT=80
ENV NGINX_PORT=80

# Cheap healthcheck — `wget --spider` is included in the alpine base image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --spider http://localhost:${NGINX_PORT}/ || exit 1

# Allow overriding the listen port via $PORT (HF Spaces convention).
# nginx automatically substitutes envs in /etc/nginx/templates/*.template
# when the official image starts up.
EXPOSE 80

CMD ["sh", "-c", "export NGINX_PORT=${PORT:-80}; exec nginx -g 'daemon off;'"]
