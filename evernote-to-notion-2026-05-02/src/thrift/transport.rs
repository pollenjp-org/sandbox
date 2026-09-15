use bytes::Bytes;

#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("non-success status {status}: {body}")]
    Status { status: u16, body: String },
}

/// Thin POST transport for Thrift binary payloads.
#[derive(Debug, Clone)]
pub struct HttpTransport {
    client: reqwest::Client,
    endpoint: String,
}

impl HttpTransport {
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("evernote-to-notion/0.1 (+thrift-binary)")
                .build()
                .expect("reqwest client build"),
            endpoint: endpoint.into(),
        }
    }

    pub fn with_client(client: reqwest::Client, endpoint: impl Into<String>) -> Self {
        Self {
            client,
            endpoint: endpoint.into(),
        }
    }

    pub async fn call(&self, payload: Bytes) -> Result<Bytes, TransportError> {
        let resp = self
            .client
            .post(&self.endpoint)
            .header(reqwest::header::CONTENT_TYPE, "application/x-thrift")
            .header(reqwest::header::ACCEPT, "application/x-thrift")
            .body(payload)
            .send()
            .await?;
        let status = resp.status();
        let body = resp.bytes().await?;
        if !status.is_success() {
            let body_str = String::from_utf8_lossy(&body).into_owned();
            return Err(TransportError::Status {
                status: status.as_u16(),
                body: body_str,
            });
        }
        Ok(body)
    }
}
