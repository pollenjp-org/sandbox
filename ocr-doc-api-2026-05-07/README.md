# ocr-doc-api

REST API that accepts images / PDFs and returns OCR results in `json`, `csv`,
`html`, `md`, or searchable `pdf`.

## Architecture

```
client ──HTTP──▶ Cloud Run (Rust / axum API)
                    │
                    │ 1. PUT object   ┌──────────────┐
                    ├────────────────▶│ GCS: input/  │
                    │                 └──────────────┘
                    │ 2. publish msg
                    ▼
              ┌──────────┐  3. push    ┌────────────────────┐
              │ Pub/Sub  ├────────────▶│ Cloud Run Job      │
              └──────────┘             │ yomitoku|tesseract │
                                       └─────────┬──────────┘
                                                 │ 4. write result
                                                 ▼
                                       ┌──────────────────┐
                                       │ GCS: output/     │
                                       └──────────────────┘
client ──HTTP GET /jobs/{id}/{fmt}──▶ Cloud Run (Rust API)
                                       (signed URL or stream)
```

* `api/` — Rust REST API (axum). Runs on Cloud Run service.
* `workers/yomitoku/` — Cloud Run Job container wrapping
  [yomitoku](https://pypi.org/project/yomitoku/).
* `workers/tesseract/` — Cloud Run Job container wrapping
  [tesseract](https://github.com/tesseract-ocr/tesseract).
* `infra/` — Terraform modules + Terragrunt env wiring (GCP).

The OCR engine is pluggable: the API includes the engine name in the Pub/Sub
message, and a separate Cloud Run Job exists per engine subscribing to its own
subscription.

## Endpoints

| Method | Path                       | Description                                            |
|--------|----------------------------|--------------------------------------------------------|
| POST   | `/v1/jobs`                 | Multipart upload. Returns `{job_id, status_url}`.      |
| GET    | `/v1/jobs/{id}`            | Job metadata + status (`pending`, `running`, `done`).  |
| GET    | `/v1/jobs/{id}/{format}`   | Download result. `format` ∈ `json,csv,html,md,pdf`.    |
| GET    | `/healthz`                 | Liveness.                                              |

Form fields on `POST /v1/jobs`:

* `file` — the image or PDF (required).
* `engine` — `yomitoku` (default) or `tesseract`.
* `formats` — comma-separated outputs to render, e.g. `json,pdf`.

## Local dev

```bash
cd api
cargo run
# in another shell
curl -F file=@sample.pdf -F engine=yomitoku -F formats=json,pdf \
  http://localhost:8080/v1/jobs
```

The API talks to GCS and Pub/Sub via the standard
`GOOGLE_APPLICATION_CREDENTIALS` flow; for local dev point it at emulators or a
sandbox project.

## Deploy

```bash
cd infra/live/dev
terragrunt run-all apply
```

Each leaf `terragrunt.hcl` under `infra/live/<env>/` wires one module.
