"""Cloud Run Job entrypoint for the tesseract OCR worker.

Same payload contract as the yomitoku worker. Produces:
- json: one record per page with text + word-level boxes
- csv:  flat word list (page,left,top,right,bottom,conf,text)
- html: hOCR
- md:   simple page-delimited markdown text
- pdf:  searchable PDF (tesseract `pdf` config)
"""

from __future__ import annotations

import base64
import csv
import io
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

from google.cloud import storage  # type: ignore
from pdf2image import convert_from_path  # type: ignore

LOG = logging.getLogger("tesseract-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

INPUT_BUCKET = os.environ["GCS_INPUT_BUCKET"]
OUTPUT_BUCKET = os.environ["GCS_OUTPUT_BUCKET"]
LANG = os.environ.get("TESSERACT_LANG", "jpn+eng")


def load_payload() -> dict:
    raw = os.environ.get("JOB_PAYLOAD")
    if not raw:
        LOG.error("JOB_PAYLOAD env var missing")
        sys.exit(2)
    try:
        return json.loads(base64.b64decode(raw))
    except Exception:
        return json.loads(raw)


def write_status(client: storage.Client, prefix: str, status: str, **extra) -> None:
    blob = client.bucket(OUTPUT_BUCKET).blob(f"{prefix}status.json")
    blob.upload_from_string(
        json.dumps({"status": status, **extra}), content_type="application/json"
    )


def pages_for(src: Path, work: Path) -> list[Path]:
    if src.suffix.lower() == ".pdf":
        images = convert_from_path(str(src), dpi=300)
        out = []
        for i, img in enumerate(images):
            p = work / f"page-{i + 1:04d}.png"
            img.save(p, "PNG")
            out.append(p)
        return out
    return [src]


def run_tesseract(image: Path, out_base: Path, configs: Iterable[str]) -> None:
    cmd = ["tesseract", str(image), str(out_base), "-l", LANG, *configs]
    LOG.info("running: %s", " ".join(cmd))
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"tesseract failed: {r.stderr}")


def main() -> int:
    payload = load_payload()
    job_id = payload["job_id"]
    formats = payload.get("formats", ["json"])
    input_object = payload["input_object"]
    output_prefix = payload["output_prefix"]

    client = storage.Client()
    write_status(client, output_prefix, "running", job_id=job_id)

    try:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            src = work / Path(input_object).name
            client.bucket(INPUT_BUCKET).blob(input_object).download_to_filename(src)

            page_imgs = pages_for(src, work)

            tsvs: list[Path] = []
            hocrs: list[Path] = []
            for i, img in enumerate(page_imgs):
                base = work / f"page-{i + 1:04d}"
                run_tesseract(img, base, ["tsv"])
                tsvs.append(base.with_suffix(".tsv"))
                if "html" in formats:
                    run_tesseract(img, base, ["hocr"])
                    hocrs.append(base.with_suffix(".hocr"))

            json_pages = []
            md_chunks = []
            csv_buf = io.StringIO()
            writer = csv.writer(csv_buf)
            writer.writerow(["page", "left", "top", "right", "bottom", "conf", "text"])

            for page_idx, tsv in enumerate(tsvs, start=1):
                page_words = []
                page_text_lines: dict[tuple[int, int, int], list[str]] = {}
                with tsv.open() as f:
                    reader = csv.DictReader(f, delimiter="\t")
                    for row in reader:
                        text = (row.get("text") or "").strip()
                        if not text:
                            continue
                        try:
                            left = int(row["left"])
                            top = int(row["top"])
                            width = int(row["width"])
                            height = int(row["height"])
                            conf = float(row["conf"])
                        except (KeyError, ValueError):
                            continue
                        right = left + width
                        bottom = top + height
                        page_words.append(
                            {
                                "text": text,
                                "bbox": [left, top, right, bottom],
                                "conf": conf,
                            }
                        )
                        writer.writerow([page_idx, left, top, right, bottom, conf, text])
                        key = (
                            int(row.get("block_num", 0)),
                            int(row.get("par_num", 0)),
                            int(row.get("line_num", 0)),
                        )
                        page_text_lines.setdefault(key, []).append(text)

                json_pages.append({"page": page_idx, "words": page_words})
                md_chunks.append(f"## Page {page_idx}\n\n")
                for _, words in sorted(page_text_lines.items()):
                    md_chunks.append(" ".join(words) + "\n")
                md_chunks.append("\n")

            bucket = client.bucket(OUTPUT_BUCKET)

            if "json" in formats:
                bucket.blob(f"{output_prefix}result.json").upload_from_string(
                    json.dumps({"pages": json_pages}, ensure_ascii=False),
                    content_type="application/json",
                )
            if "csv" in formats:
                bucket.blob(f"{output_prefix}result.csv").upload_from_string(
                    csv_buf.getvalue(), content_type="text/csv"
                )
            if "md" in formats:
                bucket.blob(f"{output_prefix}result.md").upload_from_string(
                    "".join(md_chunks), content_type="text/markdown"
                )
            if "html" in formats:
                merged = "<!doctype html><meta charset=utf-8><body>\n"
                for h in hocrs:
                    merged += h.read_text(encoding="utf-8")
                bucket.blob(f"{output_prefix}result.html").upload_from_string(
                    merged, content_type="text/html; charset=utf-8"
                )
            if "pdf" in formats:
                pdf_base = work / "searchable"
                # Build a single searchable PDF over all page images.
                with (work / "imgs.txt").open("w") as f:
                    for img in page_imgs:
                        f.write(f"{img}\n")
                cmd = [
                    "tesseract",
                    str(work / "imgs.txt"),
                    str(pdf_base),
                    "-l",
                    LANG,
                    "pdf",
                ]
                r = subprocess.run(cmd, capture_output=True, text=True)
                if r.returncode != 0:
                    raise RuntimeError(f"tesseract pdf failed: {r.stderr}")
                bucket.blob(f"{output_prefix}result.pdf").upload_from_filename(
                    str(pdf_base.with_suffix(".pdf"))
                )

    except Exception as e:  # noqa: BLE001
        LOG.exception("job failed")
        write_status(client, output_prefix, "failed", job_id=job_id, error=str(e))
        return 1

    write_status(client, output_prefix, "done", job_id=job_id, formats=formats)
    LOG.info("job %s done", job_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
