use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub evernote_dev_token: String,
    pub evernote_notestore_url: String,
    pub evernote_userstore_url: String,
    pub notion_token: String,
    pub notion_database_id: String,
    pub notion_version: String,
    pub max_concurrency: usize,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            evernote_dev_token: req_env("EVERNOTE_DEV_TOKEN")?,
            evernote_notestore_url: req_env("EVERNOTE_NOTESTORE_URL")?,
            evernote_userstore_url: env::var("EVERNOTE_USERSTORE_URL")
                .unwrap_or_else(|_| "https://www.evernote.com/edam/user".to_string()),
            notion_token: req_env("NOTION_TOKEN")?,
            notion_database_id: req_env("NOTION_DATABASE_ID")?,
            notion_version: env::var("NOTION_VERSION").unwrap_or_else(|_| "2022-06-28".to_string()),
            max_concurrency: env::var("MAX_CONCURRENCY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
        })
    }
}

fn req_env(key: &str) -> Result<String, ConfigError> {
    env::var(key).map_err(|_| ConfigError::Missing(key.to_string()))
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("required environment variable missing: {0}")]
    Missing(String),
}
