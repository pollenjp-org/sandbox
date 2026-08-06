FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libgl1 libglib2.0-0 poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "yomitoku" \
      "google-cloud-storage" \
      "pydantic"

WORKDIR /app
COPY entrypoint.py ./

ENTRYPOINT ["python", "/app/entrypoint.py"]
