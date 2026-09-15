use std::str::FromStr;

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    model::{Engine, Format, JobAccepted, JobMessage, JobStatus},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/jobs", post(create_job))
        .route("/jobs/:id", get(get_job))
        .route("/jobs/:id/:format", get(get_job_result))
}

async fn create_job(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> ApiResult<(StatusCode, Json<JobAccepted>)> {
    let job_id = Uuid::new_v4().to_string();

    let mut engine = Engine::default();
    let mut formats: Vec<Format> = vec![Format::Json];
    let mut file_bytes: Option<bytes::Bytes> = None;
    let mut file_ext: String = "bin".to_string();
    let mut content_type: String = "application/octet-stream".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(format!("multipart error: {e}")))?
    {
        let name = field.name().unwrap_or_default().to_string();
        match name.as_str() {
            "file" => {
                if let Some(ct) = field.content_type() {
                    content_type = ct.to_string();
                }
                if let Some(filename) = field.file_name() {
                    if let Some(ext) = std::path::Path::new(filename).extension() {
                        file_ext = ext.to_string_lossy().to_lowercase();
                    }
                }
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("read file: {e}")))?;
                if data.is_empty() {
                    return Err(ApiError::BadRequest("empty file".into()));
                }
                file_bytes = Some(data);
            }
            "engine" => {
                let v = field
                    .text()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("read engine: {e}")))?;
                engine = Engine::from_str(&v).map_err(ApiError::BadRequest)?;
            }
            "formats" => {
                let v = field
                    .text()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("read formats: {e}")))?;
                formats = v
                    .split(',')
                    .filter(|s| !s.trim().is_empty())
                    .map(Format::from_str)
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(ApiError::BadRequest)?;
                if formats.is_empty() {
                    return Err(ApiError::BadRequest("formats must not be empty".into()));
                }
            }
            _ => {}
        }
    }

    let bytes = file_bytes.ok_or_else(|| ApiError::BadRequest("missing 'file' field".into()))?;

    let input_object = format!("input/{job_id}/source.{file_ext}");
    let output_prefix = format!("output/{job_id}/");

    state
        .storage
        .put(
            &state.config.input_bucket,
            &input_object,
            bytes,
            &content_type,
        )
        .await?;

    state
        .storage
        .put_json(
            &state.config.output_bucket,
            &format!("{output_prefix}status.json"),
            &json!({
                "job_id": job_id,
                "status": JobStatus::Pending,
                "engine": engine,
                "formats": formats,
            }),
        )
        .await?;

    let msg = JobMessage {
        job_id: job_id.clone(),
        engine,
        formats: formats.clone(),
        input_object: input_object.clone(),
        output_prefix: output_prefix.clone(),
    };
    state.publisher.publish(&msg).await?;

    let status_url = format!("/v1/jobs/{job_id}");
    Ok((
        StatusCode::ACCEPTED,
        Json(JobAccepted { job_id, status_url }),
    ))
}

async fn get_job(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let key = format!("output/{id}/status.json");
    match state.storage.get(&state.config.output_bucket, &key).await? {
        Some(bytes) => {
            let v: serde_json::Value = serde_json::from_slice(&bytes)
                .map_err(|e| ApiError::Storage(anyhow::anyhow!("status json: {e}")))?;
            Ok(Json(v))
        }
        None => Err(ApiError::NotFound),
    }
}

async fn get_job_result(
    State(state): State<AppState>,
    Path((id, format)): Path<(String, String)>,
) -> ApiResult<Response> {
    let fmt = Format::from_str(&format).map_err(ApiError::UnsupportedFormat)?;
    let key = format!("output/{id}/result.{}", fmt.extension());

    let stream = state
        .storage
        .stream(&state.config.output_bucket, &key)
        .await?;
    let stream = match stream {
        Some(s) => s,
        None => return Err(ApiError::NotFound),
    };

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, fmt.content_type().parse().unwrap());
    headers.insert(
        header::CONTENT_DISPOSITION,
        format!(
            "attachment; filename=\"{id}.{ext}\"",
            ext = fmt.extension()
        )
        .parse()
        .unwrap(),
    );

    Ok((headers, Body::from_stream(stream)).into_response())
}
