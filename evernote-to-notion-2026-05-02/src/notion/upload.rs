use reqwest::multipart;
use serde_json::json;

use super::client::{NotionClient, NotionError};
use super::types::UploadedFile;

impl NotionClient {
    /// Two-step upload: create a `file_upload` then PUT the bytes.
    /// <https://developers.notion.com/reference/file-uploads>
    pub async fn upload_file(
        &self,
        filename: &str,
        mime: &str,
        bytes: Vec<u8>,
    ) -> Result<UploadedFile, NotionError> {
        self.limiter().acquire().await;
        let create = self
            .http()
            .post(format!("{}/file_uploads", self.base_url()))
            .bearer_auth(self.token())
            .header("Notion-Version", self.notion_version())
            .json(&json!({
                "filename": filename,
                "content_type": mime,
            }))
            .send()
            .await
            .map_err(NotionError::Http)?;
        if !create.status().is_success() {
            let s = create.status().as_u16();
            let body = create.text().await.unwrap_or_default();
            return Err(NotionError::Status { status: s, body });
        }
        let json: serde_json::Value = create.json().await.map_err(NotionError::Http)?;
        let id = json
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| NotionError::Malformed("no id in file_upload response".into()))?
            .to_string();
        let upload_url = json
            .get("upload_url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| NotionError::Malformed("no upload_url".into()))?
            .to_string();

        self.limiter().acquire().await;
        let part = multipart::Part::bytes(bytes)
            .file_name(filename.to_string())
            .mime_str(mime)
            .map_err(NotionError::Http)?;
        let form = multipart::Form::new().part("file", part);
        let resp = self
            .http()
            .post(upload_url)
            .bearer_auth(self.token())
            .header("Notion-Version", self.notion_version())
            .multipart(form)
            .send()
            .await
            .map_err(NotionError::Http)?;
        if !resp.status().is_success() {
            let s = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(NotionError::Status { status: s, body });
        }
        Ok(UploadedFile { id })
    }
}
