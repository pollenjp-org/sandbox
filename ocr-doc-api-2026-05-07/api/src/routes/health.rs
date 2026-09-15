use axum::{routing::get, Router};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/healthz", get(|| async { "ok" }))
}
