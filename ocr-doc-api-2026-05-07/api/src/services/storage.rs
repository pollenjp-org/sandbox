use anyhow::Context;
use bytes::Bytes;
use futures_util::Stream;
use google_cloud_storage::{
    client::{Client, ClientConfig},
    http::objects::{
        download::Range,
        get::GetObjectRequest,
        upload::{Media, UploadObjectRequest, UploadType},
    },
};
use serde::Serialize;
use std::pin::Pin;

pub type ByteStream =
    Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static>>;

pub struct GcsStore {
    client: Client,
}

impl GcsStore {
    pub async fn new() -> anyhow::Result<Self> {
        let config = ClientConfig::default()
            .with_auth()
            .await
            .context("gcs auth")?;
        Ok(Self {
            client: Client::new(config),
        })
    }

    pub async fn put(
        &self,
        bucket: &str,
        object: &str,
        data: Bytes,
        content_type: &str,
    ) -> anyhow::Result<()> {
        let mut media = Media::new(object.to_string());
        media.content_type = std::borrow::Cow::Owned(content_type.to_string());
        let upload_type = UploadType::Simple(media);

        self.client
            .upload_object(
                &UploadObjectRequest {
                    bucket: bucket.to_string(),
                    ..Default::default()
                },
                data,
                &upload_type,
            )
            .await
            .with_context(|| format!("upload gs://{bucket}/{object}"))?;
        Ok(())
    }

    pub async fn put_json<T: Serialize>(
        &self,
        bucket: &str,
        object: &str,
        value: &T,
    ) -> anyhow::Result<()> {
        let body = serde_json::to_vec(value)?;
        self.put(bucket, object, Bytes::from(body), "application/json")
            .await
    }

    pub async fn get(&self, bucket: &str, object: &str) -> anyhow::Result<Option<Bytes>> {
        let req = GetObjectRequest {
            bucket: bucket.to_string(),
            object: object.to_string(),
            ..Default::default()
        };
        match self
            .client
            .download_object(&req, &Range::default())
            .await
        {
            Ok(bytes) => Ok(Some(Bytes::from(bytes))),
            Err(e) if is_not_found(&e) => Ok(None),
            Err(e) => Err(e).with_context(|| format!("download gs://{bucket}/{object}")),
        }
    }

    pub async fn stream(
        &self,
        bucket: &str,
        object: &str,
    ) -> anyhow::Result<Option<ByteStream>> {
        let req = GetObjectRequest {
            bucket: bucket.to_string(),
            object: object.to_string(),
            ..Default::default()
        };
        match self
            .client
            .download_streamed_object(&req, &Range::default())
            .await
        {
            Ok(stream) => {
                use futures_util::StreamExt;
                let mapped = stream.map(|chunk| {
                    chunk.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
                });
                Ok(Some(Box::pin(mapped)))
            }
            Err(e) if is_not_found(&e) => Ok(None),
            Err(e) => Err(e).with_context(|| format!("stream gs://{bucket}/{object}")),
        }
    }
}

fn is_not_found(err: &google_cloud_storage::http::Error) -> bool {
    use google_cloud_storage::http::Error as E;
    matches!(err, E::Response(r) if r.code == 404)
}
