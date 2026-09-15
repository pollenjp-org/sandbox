use std::sync::Arc;

use serde_json::{Value, json};

use super::types::{CreatePageRequest, PageId};
use crate::rate_limit::TokenBucket;

#[derive(Debug, thiserror::Error)]
pub enum NotionError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("status {status}: {body}")]
    Status { status: u16, body: String },
    #[error("malformed: {0}")]
    Malformed(String),
}

#[derive(Debug)]
pub struct NotionClient {
    http: reqwest::Client,
    base_url: String,
    token: String,
    notion_version: String,
    limiter: Arc<TokenBucket>,
}

impl NotionClient {
    pub fn new(
        token: impl Into<String>,
        notion_version: impl Into<String>,
        limiter: Arc<TokenBucket>,
    ) -> Self {
        Self::with_base_url("https://api.notion.com/v1", token, notion_version, limiter)
    }

    pub fn with_base_url(
        base_url: impl Into<String>,
        token: impl Into<String>,
        notion_version: impl Into<String>,
        limiter: Arc<TokenBucket>,
    ) -> Self {
        Self {
            http: reqwest::Client::new(),
            base_url: base_url.into(),
            token: token.into(),
            notion_version: notion_version.into(),
            limiter,
        }
    }

    pub(crate) fn http(&self) -> &reqwest::Client {
        &self.http
    }
    pub(crate) fn base_url(&self) -> &str {
        &self.base_url
    }
    pub(crate) fn token(&self) -> &str {
        &self.token
    }
    pub(crate) fn notion_version(&self) -> &str {
        &self.notion_version
    }
    pub(crate) fn limiter(&self) -> &TokenBucket {
        &self.limiter
    }

    /// Search the database for a page whose `Evernote URL` URL property
    /// equals the given evernote URL. Returns the page id if it exists.
    pub async fn find_page_by_evernote_url(
        &self,
        database_id: &str,
        evernote_url: &str,
    ) -> Result<Option<PageId>, NotionError> {
        self.limiter.acquire().await;
        let body = json!({
            "filter": {
                "property": "Evernote URL",
                "url": { "equals": evernote_url }
            },
            "page_size": 1
        });
        let resp = self
            .http
            .post(format!("{}/databases/{}/query", self.base_url, database_id))
            .bearer_auth(&self.token)
            .header("Notion-Version", &self.notion_version)
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            let s = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(NotionError::Status { status: s, body });
        }
        let json: Value = resp.json().await?;
        let id = json
            .get("results")
            .and_then(|r| r.as_array())
            .and_then(|arr| arr.first())
            .and_then(|p| p.get("id"))
            .and_then(|v| v.as_str())
            .map(|s| PageId(s.to_string()));
        Ok(id)
    }

    pub async fn create_page(&self, req: &CreatePageRequest) -> Result<PageId, NotionError> {
        self.limiter.acquire().await;
        // Notion accepts up to 100 children per request; chunk the rest with
        // `append_block_children` afterwards.
        let (head, tail): (&[_], &[_]) = if req.blocks.len() > 100 {
            (&req.blocks[..100], &req.blocks[100..])
        } else {
            (&req.blocks[..], &[])
        };
        let body = json!({
            "parent": { "database_id": req.database_id },
            "properties": {
                "Name": {
                    "title": [{
                        "type": "text",
                        "text": { "content": &req.title }
                    }]
                },
                "Evernote URL": { "url": &req.evernote_url }
            },
            "children": head,
        });
        let resp = self
            .http
            .post(format!("{}/pages", self.base_url))
            .bearer_auth(&self.token)
            .header("Notion-Version", &self.notion_version)
            .json(&body)
            .send()
            .await?;
        if !resp.status().is_success() {
            let s = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(NotionError::Status { status: s, body });
        }
        let v: Value = resp.json().await?;
        let id = v
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| NotionError::Malformed("page id missing".into()))?
            .to_string();
        let page_id = PageId(id);

        for chunk in tail.chunks(100) {
            self.append_block_children(&page_id, chunk).await?;
        }
        Ok(page_id)
    }

    pub async fn append_block_children(
        &self,
        page: &PageId,
        children: &[Value],
    ) -> Result<(), NotionError> {
        self.limiter.acquire().await;
        let resp = self
            .http
            .patch(format!("{}/blocks/{}/children", self.base_url, page.0))
            .bearer_auth(&self.token)
            .header("Notion-Version", &self.notion_version)
            .json(&json!({ "children": children }))
            .send()
            .await?;
        if !resp.status().is_success() {
            let s = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(NotionError::Status { status: s, body });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rate_limit::TokenBucket;
    use std::sync::Arc;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn limiter() -> Arc<TokenBucket> {
        Arc::new(TokenBucket::new(10, 100.0))
    }

    #[tokio::test]
    async fn find_page_returns_id_when_match_exists() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/databases/db1/query"))
            .and(header("Notion-Version", "2022-06-28"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "results": [{ "id": "page-1" }],
                "has_more": false
            })))
            .mount(&server)
            .await;

        let c = NotionClient::with_base_url(server.uri(), "tok", "2022-06-28", limiter());
        let p = c
            .find_page_by_evernote_url("db1", "evernote:///view/x")
            .await
            .unwrap();
        assert_eq!(p, Some(PageId("page-1".into())));
    }

    #[tokio::test]
    async fn find_page_returns_none_when_no_results() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/databases/db1/query"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(serde_json::json!({"results": [], "has_more": false})),
            )
            .mount(&server)
            .await;

        let c = NotionClient::with_base_url(server.uri(), "tok", "2022-06-28", limiter());
        let p = c
            .find_page_by_evernote_url("db1", "evernote:///none")
            .await
            .unwrap();
        assert_eq!(p, None);
    }

    #[tokio::test]
    async fn create_page_returns_id() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/pages"))
            .and(header("authorization", "Bearer tok"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({"id": "new-page"})),
            )
            .mount(&server)
            .await;

        let c = NotionClient::with_base_url(server.uri(), "tok", "2022-06-28", limiter());
        let req = CreatePageRequest {
            database_id: "db1".into(),
            title: "T".into(),
            evernote_url: "evernote:///view/x".into(),
            blocks: vec![],
        };
        let id = c.create_page(&req).await.unwrap();
        assert_eq!(id.0, "new-page");
    }
}
