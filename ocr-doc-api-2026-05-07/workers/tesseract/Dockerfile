FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata/

RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr tesseract-ocr-jpn tesseract-ocr-eng \
      poppler-utils ghostscript ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "google-cloud-storage" \
      "pdf2image" \
      "Pillow"

WORKDIR /app
COPY entrypoint.py ./

ENTRYPOINT ["python", "/app/entrypoint.py"]
