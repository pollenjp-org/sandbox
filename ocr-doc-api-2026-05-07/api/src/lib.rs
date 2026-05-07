pub mod config;
pub mod error;
pub mod model;
pub mod routes;
pub mod services;

use std::{net::SocketAddr, sync::Arc};

use axum::Router;
use tower_http::{limit::RequestBodyLimitLayer, trace::TraceLayer};

use crate::{
    config::Config,
    services::{pubsub::PubSubPublisher, storage::GcsStore},
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub storage: Arc<GcsStore>,
    pub publisher: Arc<PubSubPublisher>,
}

pub async fn build_router(state: AppState) -> Router {
    let max_bytes = state.config.max_upload_bytes;
    Router::new()
        .merge(routes::health::router())
        .nest("/v1", routes::jobs::router())
        .with_state(state)
        .layer(RequestBodyLimitLayer::new(max_bytes))
        .layer(TraceLayer::new_for_http())
}

pub async fn run(addr: SocketAddr, config: Config) -> anyhow::Result<()> {
    let storage = GcsStore::new().await?;
    let publisher = PubSubPublisher::new(&config.project_id, &config.pubsub_topic).await?;

    let state = AppState {
        config: Arc::new(config),
        storage: Arc::new(storage),
        publisher: Arc::new(publisher),
    };

    let app = build_router(state).await;

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "ocr-doc-api listening");
    axum::serve(listener, app).await?;
    Ok(())
}
