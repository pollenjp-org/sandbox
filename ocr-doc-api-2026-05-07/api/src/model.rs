use std::str::FromStr;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    Yomitoku,
    Tesseract,
}

impl Default for Engine {
    fn default() -> Self {
        Engine::Yomitoku
    }
}

impl FromStr for Engine {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "yomitoku" => Ok(Engine::Yomitoku),
            "tesseract" => Ok(Engine::Tesseract),
            other => Err(format!("unknown engine: {other}")),
        }
    }
}

impl Engine {
    pub fn as_str(&self) -> &'static str {
        match self {
            Engine::Yomitoku => "yomitoku",
            Engine::Tesseract => "tesseract",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Json,
    Csv,
    Html,
    Md,
    Pdf,
}

impl FromStr for Format {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "json" => Ok(Format::Json),
            "csv" => Ok(Format::Csv),
            "html" => Ok(Format::Html),
            "md" | "markdown" => Ok(Format::Md),
            "pdf" => Ok(Format::Pdf),
            other => Err(format!("unsupported format: {other}")),
        }
    }
}

impl Format {
    pub fn extension(&self) -> &'static str {
        match self {
            Format::Json => "json",
            Format::Csv => "csv",
            Format::Html => "html",
            Format::Md => "md",
            Format::Pdf => "pdf",
        }
    }

    pub fn content_type(&self) -> &'static str {
        match self {
            Format::Json => "application/json",
            Format::Csv => "text/csv",
            Format::Html => "text/html; charset=utf-8",
            Format::Md => "text/markdown; charset=utf-8",
            Format::Pdf => "application/pdf",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobAccepted {
    pub job_id: String,
    pub status_url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Running,
    Done,
    Failed,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobMessage {
    pub job_id: String,
    pub engine: Engine,
    pub formats: Vec<Format>,
    pub input_object: String,
    pub output_prefix: String,
}
