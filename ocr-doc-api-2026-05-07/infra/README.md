# Infra

```
infra/
├── terragrunt.hcl              # root: backend + provider generation
├── modules/
│   ├── storage/                # GCS input/output buckets
│   ├── pubsub/                 # jobs topic + DLQ
│   ├── artifact_registry/      # docker repo
│   ├── iam/                    # service accounts + bucket/topic bindings
│   ├── api_service/            # Cloud Run service running the Rust API
│   └── worker_job/             # Cloud Run Job + Eventarc (Pub/Sub) trigger
└── live/
    └── dev/
        ├── account.hcl
        ├── storage/
        ├── pubsub/
        ├── artifact_registry/
        ├── iam/
        ├── api/
        ├── worker-yomitoku/
        └── worker-tesseract/
```

## Usage

```bash
# one-time: create the GCP project, enable APIs, and create the tfstate bucket
gcloud projects create ocr-doc-api-dev
gcloud services enable run.googleapis.com pubsub.googleapis.com \
    artifactregistry.googleapis.com eventarc.googleapis.com \
    storage.googleapis.com cloudbuild.googleapis.com \
    --project=ocr-doc-api-dev
gsutil mb -p ocr-doc-api-dev -l asia-northeast1 gs://ocr-doc-api-dev-tfstate

# then
cd infra/live/dev
terragrunt run-all init
terragrunt run-all apply
```

`IMAGE_TAG` env var on `terragrunt apply` selects which image tag the API and
workers point at:

```bash
IMAGE_TAG=$(git rev-parse --short HEAD) terragrunt run-all apply
```

## Notes / TODO

* The Eventarc trigger in `modules/worker_job` currently routes to a Cloud Run
  *service* destination. To execute a Cloud Run *Job* directly per Pub/Sub
  message you'll need either (a) a tiny shim Cloud Run service that calls
  `run.googleapis.com/.../jobs:run` with `containerOverrides.env` carrying
  `JOB_PAYLOAD`, or (b) a Workflows-based fan-out. Replace the destination block
  accordingly when the GA `cloud_run_job` destination is wired in.
* `prod/` mirrors `dev/` — copy the directory and override `account.hcl` once
  the project is provisioned.
