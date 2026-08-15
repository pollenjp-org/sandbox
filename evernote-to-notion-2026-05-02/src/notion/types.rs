use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PageId(pub String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadedFile {
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct CreatePageRequest {
    pub database_id: String,
    pub title: String,
    pub evernote_url: String,
    pub blocks: Vec<serde_json::Value>,
}
