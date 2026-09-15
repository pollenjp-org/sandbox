#[derive(Debug, Clone)]
pub struct Config {
    pub project_id: String,
    pub input_bucket: String,
    pub output_bucket: String,
    pub pubsub_topic: String,
    pub max_upload_bytes: usize,
}
