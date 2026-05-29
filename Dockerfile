FROM debian:stable-slim AS run

LABEL org.opencontainers.image.title="Exocore IDE"
LABEL org.opencontainers.image.description="Browser-based IDE — full stack, any language"
LABEL org.opencontainers.image.version="6.0.0"

ENV PORT=7860 \
    DENO_DIR=/tmp/deno

RUN apt-get update \
 && apt-get install -y \
        ca-certificates curl tini procps \
        bash coreutils \
        git unzip zip \
        python3 python3-pip python3-venv \
        sudo vim nano htop \
        build-essential gcc g++ make \
        openssh-client \
        wget net-tools \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /var/cache/apt/archives/*

WORKDIR /app

RUN groupadd --system --gid 1001 exocore \
 && useradd --system --uid 1001 --gid exocore --create-home --shell /bin/bash exocore \
 && echo "exocore ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/exocore \
 && chmod 440 /etc/sudoers.d/exocore

# fetch-binary-174749
RUN curl -fsSL https://github.com/Exocore-Organization/exocore-web/raw/main/exocore-ide -o /app/exocore-ide \
 && chmod +x /app/exocore-ide \
 && chown exocore:exocore /app/exocore-ide

RUN mkdir -p \
        /app/projects \
        /app/projects_archive \
        /app/uploads/temp \
        /app/uploads/avatars \
 && chown -R exocore:exocore /app

VOLUME ["/app/projects", "/app/uploads"]

RUN mkdir -p /tmp/exo-cache && chown exocore:exocore /tmp/exo-cache

USER exocore

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
    CMD curl -f http://localhost:${PORT}/exocore/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./exocore-ide"]
