# --- Build Stage ---
# https://hub.docker.com/_/python/
FROM mirror.gcr.io/python:3.12-slim-trixie AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# https://github.com/astral-sh/uv/pkgs/container/uv
COPY --from=ghcr.io/astral-sh/uv:0.9.27-python3.12-trixie /usr/local/bin/uv /usr/local/bin/uvx /usr/local/bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-install-project --no-dev

# --- Final Stage ---
FROM mirror.gcr.io/python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY . .

ENV PATH="/app/.venv/bin:$PATH"

CMD ["streamlit", "run", "main.py"]
