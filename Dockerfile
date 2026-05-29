FROM debian:stable-slim

LABEL org.opencontainers.image.title="Exocore IDE"
LABEL org.opencontainers.image.description="Browser-based IDE — full stack, any language"
LABEL org.opencontainers.image.version="6.0.0"

ENV PORT=5000 \
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
        strace ltrace \
        gdb valgrind \
        tree jq \
        rsync \
        locales \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /var/cache/apt/archives/* \
 && sed -i 's/^# en_US.UTF-8 UTF-8$/en_US.UTF-8 UTF-8/' /etc/locale.gen \
 && locale-gen

WORKDIR /app

RUN groupadd --system --gid 1001 exocore \
 && useradd --system --uid 1001 --gid exocore --create-home --shell /bin/bash exocore \
 && echo "exocore ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/exocore \
 && chmod 440 /etc/sudoers.d/exocore

COPY --chown=exocore:exocore exocore-ide ./

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
CMD ["./exocore-ide"]
