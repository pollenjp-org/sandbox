use std::sync::Arc;

use tracing::{info, warn};

use crate::enml::{ConvertedBlock, convert_enml};
use crate::evernote::{EvernoteClient, EvernoteError, EvernoteRef};
use crate::notion::blocks::{HashMapResolver, to_notion_block};
use crate::notion::types::CreatePageRequest;
use crate::notion::{NotionClient, NotionError};

#[derive(Debug, thiserror::Error)]
pub enum MigrateError {
    #[error("evernote: {0}")]
    Evernote(#[from] EvernoteError),
    #[error("notion: {0}")]
    Notion(#[from] NotionError),
    #[error("enml: {0}")]
    Enml(#[from] crate::enml::EnmlConvertError),
}

#[derive(Debug, Clone)]
pub struct MigrateOptions {
    pub database_id: String,
    pub batch_size: i32,
    pub dry_run: bool,
    pub max_notes: Option<usize>,
}

#[derive(Debug, Default)]
pub struct MigrateReport {
    pub created: usize,
    pub skipped_existing: usize,
    pub failed: usize,
}

pub struct Migrator {
    pub evernote: Arc<EvernoteClient>,
    pub notion: Arc<NotionClient>,
}

impl Migrator {
    pub async fn run(&self, opts: &MigrateOptions) -> Result<MigrateReport, MigrateError> {
        let user = self.evernote.get_user().await?;
        info!(user_id = user.id, shard = user.shard_id, "fetched user");

        let mut report = MigrateReport::default();
        let mut offset = 0i32;
        loop {
            let list = match self
                .evernote
                .find_notes_metadata(offset, opts.batch_size)
                .await
            {
                Ok(l) => l,
                Err(err) => {
                    if EvernoteClient::handle_rate_limit(&err).await.is_some() {
                        continue;
                    }
                    return Err(err.into());
                }
            };
            if list.notes.is_empty() {
                break;
            }
            for meta in list.notes {
                if let Some(limit) = opts.max_notes {
                    if report.created + report.skipped_existing >= limit {
                        return Ok(report);
                    }
                }
                let evernote_url = EvernoteRef::new(user.id, &user.shard_id, &meta.guid).to_url();
                if let Some(_existing) = self
                    .notion
                    .find_page_by_evernote_url(&opts.database_id, &evernote_url)
                    .await?
                {
                    info!(guid = meta.guid, "skip already migrated");
                    report.skipped_existing += 1;
                    continue;
                }
                if opts.dry_run {
                    info!(guid = meta.guid, evernote_url, "dry-run");
                    report.created += 1;
                    continue;
                }

                match self
                    .migrate_one(&meta.guid, &opts.database_id, &evernote_url)
                    .await
                {
                    Ok(()) => report.created += 1,
                    Err(e) => {
                        warn!(error = %e, guid = meta.guid, "failed migrating note");
                        report.failed += 1;
                    }
                }
            }
            offset += opts.batch_size;
            if offset >= list.total_notes {
                break;
            }
        }
        Ok(report)
    }

    async fn migrate_one(
        &self,
        guid: &str,
        database_id: &str,
        evernote_url: &str,
    ) -> Result<(), MigrateError> {
        let note = self.evernote.get_note(guid, true, false).await?;
        let blocks = convert_enml(&note.content_enml)?;

        // Resolve every MediaRef hash to a Notion file_upload id.
        let mut resolver = HashMapResolver::default();
        for media in blocks.iter() {
            if let ConvertedBlock::MediaRef { hash_hex, mime } = media {
                let resource = note
                    .resources
                    .iter()
                    .find(|r| r.data_hash_hex.as_deref() == Some(hash_hex.as_str()));
                let Some(meta) = resource else { continue };
                let bytes = self.evernote.get_resource(&meta.guid).await?;
                let filename = bytes
                    .file_name
                    .clone()
                    .unwrap_or_else(|| default_filename(&meta.guid, &bytes.mime));
                let uploaded = self
                    .notion
                    .upload_file(&filename, &bytes.mime, bytes.bytes)
                    .await?;
                resolver.insert(hash_hex.clone(), uploaded.id, mime.clone());
            }
        }

        let notion_blocks: Vec<_> = blocks
            .into_iter()
            .filter_map(|b| to_notion_block(b, &resolver))
            .collect();
        let req = CreatePageRequest {
            database_id: database_id.to_string(),
            title: if note.title.is_empty() {
                "(untitled)".to_string()
            } else {
                note.title
            },
            evernote_url: evernote_url.to_string(),
            blocks: notion_blocks,
        };
        self.notion.create_page(&req).await?;
        Ok(())
    }
}

fn default_filename(guid: &str, mime: &str) -> String {
    let ext = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "video/mp4" => "mp4",
        "audio/mpeg" => "mp3",
        _ => "bin",
    };
    format!("{guid}.{ext}")
}
