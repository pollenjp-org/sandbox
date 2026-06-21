use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: i32,
    pub username: String,
    pub shard_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoteMetadata {
    pub guid: String,
    pub title: Option<String>,
    pub updated: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NotesMetadataList {
    pub start_index: i32,
    pub total_notes: i32,
    pub notes: Vec<NoteMetadata>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resource {
    pub guid: String,
    pub mime: String,
    pub data_hash_hex: Option<String>,
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Note {
    pub guid: String,
    pub title: String,
    pub content_enml: String,
    pub created: Option<i64>,
    pub updated: Option<i64>,
    pub resources: Vec<Resource>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceData {
    pub guid: String,
    pub mime: String,
    pub bytes: Vec<u8>,
    pub file_name: Option<String>,
}
