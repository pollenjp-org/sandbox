use std::net::SocketAddr;

use clap::Parser;
use ocr_doc_api::{config::Config, run};

#[derive(Parser, Debug)]
#[command(name = "ocr-doc-api")]
struct Args {
    #[arg(long, env = "PORT", default_value_t = 8080)]
    port: u16,

    #[arg(long, env = "GCS_INPUT_BUCKET")]
    input_bucket: String,

    #[arg(long, env = "GCS_OUTPUT_BUCKET")]
    output_bucket: String,

    #[arg(long, env = "PUBSUB_TOPIC")]
    pubsub_topic: String,

    #[arg(long, env = "GCP_PROJECT_ID")]
    project_id: String,

    #[arg(long, env = "MAX_UPLOAD_BYTES", default_value_t = 100 * 1024 * 1024)]
    max_upload_bytes: usize,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let args = Args::parse();
    let config = Config {
        input_bucket: args.input_bucket,
        output_bucket: args.output_bucket,
        pubsub_topic: args.pubsub_topic,
        project_id: args.project_id,
        max_upload_bytes: args.max_upload_bytes,
    };

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    run(addr, config).await
}
