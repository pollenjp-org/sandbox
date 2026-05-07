use anyhow::Context;
use google_cloud_pubsub::{
    client::{Client, ClientConfig},
    publisher::Publisher,
};
use google_cloud_googleapis::pubsub::v1::PubsubMessage;
use serde::Serialize;

pub struct PubSubPublisher {
    publisher: Publisher,
}

impl PubSubPublisher {
    pub async fn new(project_id: &str, topic: &str) -> anyhow::Result<Self> {
        let config = ClientConfig::default()
            .with_auth()
            .await
            .context("pubsub auth")?;
        let client = Client::new(config).await.context("pubsub client")?;

        let topic_handle = client.topic(topic);
        if !topic_handle.exists(None).await.unwrap_or(false) {
            tracing::warn!(%project_id, %topic, "pubsub topic not found at startup");
        }
        let publisher = topic_handle.new_publisher(None);
        Ok(Self { publisher })
    }

    pub async fn publish<T: Serialize>(&self, value: &T) -> anyhow::Result<()> {
        let data = serde_json::to_vec(value)?;
        let msg = PubsubMessage {
            data,
            ..Default::default()
        };
        let awaiter = self.publisher.publish(msg).await;
        awaiter.get().await.context("publish")?;
        Ok(())
    }
}
