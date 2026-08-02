# Build stage: compiles the wheels that need a toolchain (psycopg2, cryptography,
# bcrypt) so the runtime image never ships a C compiler.
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


# Runtime stage
FROM python:3.11-slim

# libpq5 is the psycopg2 runtime; curl backs the container healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

COPY . .

# Run unprivileged. The audio cache is a mounted volume, so it has to be owned by
# the runtime user or writes fail with a permission error at request time.
RUN useradd --create-home --uid 10001 tutor \
    && mkdir -p /app/audio_cache \
    && chown -R tutor:tutor /app
USER tutor

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    AUDIO_CACHE_DIR=/app/audio_cache \
    APP_PORT=8001

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${APP_PORT}/health" || exit 1

# tini reaps zombies and forwards SIGTERM, so `docker compose down` and rolling
# restarts stop uvicorn cleanly instead of hitting the 10s kill timeout.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Migrations are applied (and verified) before the app is imported, so a rollout
# carrying a schema change never serves traffic against the old schema.
# --proxy-headers makes uvicorn trust the scheme/host from the TLS terminator.
CMD ["sh", "-c", "python database_bootstrap.py && exec uvicorn main:app --host 0.0.0.0 --port ${APP_PORT} --proxy-headers --forwarded-allow-ips='*'"]
