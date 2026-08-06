"""Cloud Run Job entrypoint for the yomitoku OCR worker.

The job receives a Pub/Sub-style payload via the JOB_PAYLOAD env var (set by
the Eventarc → Cloud Run Job trigger, base64 of the message body). It expects:

    {
      "job_id":        "<uuid>",
      "engine":        "yomitoku",
      "formats":       ["json", "csv", "html", "md", "pdf"],
      "input_object":  "input/<id>/source.<ext>",
      "output_prefix": "output/<id>/"
    }

It downloads the source, runs yomitoku, and uploads each requested format plus
a `status.json` indicating completion.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from google.cloud import storage  # type: ignore

LOG = logging.getLogger("yomitoku-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

INPUT_BUCKET = os.environ["GCS_INPUT_BUCKET"]
OUTPUT_BUCKET = os.environ["GCS_OUTPUT_BUCKET"]


def load_payload() -> dict:
    raw = os.environ.get("JOB_PAYLOAD")
    if not raw:
        LOG.error("JOB_PAYLOAD env var missing")
        sys.exit(2)
    try:
        decoded = base64.b64decode(raw)
        return json.loads(decoded)
    except Exception:
        return json.loads(raw)


def write_status(client: storage.Client, prefix: str, status: str, **extra) -> None:
    blob = client.bucket(OUTPUT_BUCKET).blob(f"{prefix}status.json")
    body = {"status": status, **extra}
    blob.upload_from_string(json.dumps(body), content_type="application/json")


def main() -> int:
    payload = load_payload()
    job_id = payload["job_id"]
    formats = payload.get("formats", ["json"])
    input_object = payload["input_object"]
    output_prefix = payload["output_prefix"]

    client = storage.Client()
    write_status(client, output_prefix, "running", job_id=job_id)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src = tmp_path / Path(input_object).name
        client.bucket(INPUT_BUCKET).blob(input_object).download_to_filename(src)

        out_dir = tmp_path / "out"
        out_dir.mkdir()

        # yomitoku CLI: `yomitoku <input> -f json,csv,html,md,pdf -o <out_dir>`
        cmd = [
            "yomitoku",
            str(src),
            "-f", ",".join(formats),
            "-o", str(out_dir),
        ]
        LOG.info("running: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            LOG.error("yomitoku failed: %s", result.stderr)
            write_status(client, output_prefix, "failed", job_id=job_id, error=result.stderr[-2000:])
            return 1

        bucket = client.bucket(OUTPUT_BUCKET)
        for fmt in formats:
            produced = next(out_dir.glob(f"*.{fmt}"), None)
            if produced is None:
                LOG.warning("no output for format %s", fmt)
                continue
            blob = bucket.blob(f"{output_prefix}result.{fmt}")
            blob.upload_from_filename(produced)

    write_status(client, output_prefix, "done", job_id=job_id, formats=formats)
    LOG.info("job %s done", job_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
