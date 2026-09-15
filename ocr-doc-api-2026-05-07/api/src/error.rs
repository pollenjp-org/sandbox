use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("invalid request: {0}")]
    BadRequest(String),

    #[error("not found")]
    NotFound,

    #[error("unsupported format: {0}")]
    UnsupportedFormat(String),

    #[error("storage error: {0}")]
    Storage(#[from] anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::UnsupportedFormat(_) => (StatusCode::BAD_REQUEST, "unsupported_format"),
            ApiError::Storage(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        };

        if matches!(self, ApiError::Storage(_)) {
            tracing::error!(error = %self, "internal error");
        }

        (
            status,
            Json(json!({
                "error": code,
                "message": self.to_string(),
            })),
        )
            .into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
