use std::sync::Arc;

use clap::{Parser, Subcommand};
use evernote_to_notion::config::Config;
use evernote_to_notion::evernote::EvernoteClient;
use evernote_to_notion::migrator::{MigrateOptions, Migrator};
use evernote_to_notion::notion::NotionClient;
use evernote_to_notion::rate_limit::TokenBucket;
use evernote_to_notion::thrift::HttpTransport;
use tracing_subscriber::EnvFilter;

#[derive(Parser, Debug)]
#[command(name = "evernote-to-notion", version)]
struct Cli {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Run the full migration.
    Migrate {
        /// How many notes to fetch per page from NoteStore.findNotesMetadata.
        #[arg(long, default_value_t = 50)]
        batch_size: i32,
        /// Stop after migrating N notes (helpful for sanity checks).
        #[arg(long)]
        limit: Option<usize>,
    },
    /// Don't write to Notion; just list what would be migrated.
    DryRun {
        #[arg(long, default_value_t = 50)]
        batch_size: i32,
        #[arg(long)]
        limit: Option<usize>,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();
    let config = Config::from_env()?;

    let evernote_limiter = Arc::new(TokenBucket::new(2, 2.0));
    let notion_limiter = Arc::new(TokenBucket::new(3, 3.0));

    let evernote = Arc::new(EvernoteClient::new(
        HttpTransport::new(&config.evernote_notestore_url),
        HttpTransport::new(&config.evernote_userstore_url),
        config.evernote_dev_token,
        evernote_limiter,
    ));
    let notion = Arc::new(NotionClient::new(
        config.notion_token,
        config.notion_version,
        notion_limiter,
    ));

    let migrator = Migrator { evernote, notion };

    let opts = match cli.cmd {
        Command::Migrate { batch_size, limit } => MigrateOptions {
            database_id: config.notion_database_id,
            batch_size,
            dry_run: false,
            max_notes: limit,
        },
        Command::DryRun { batch_size, limit } => MigrateOptions {
            database_id: config.notion_database_id,
            batch_size,
            dry_run: true,
            max_notes: limit,
        },
    };

    let report = migrator.run(&opts).await?;
    println!(
        "created={} skipped_existing={} failed={}",
        report.created, report.skipped_existing, report.failed
    );
    Ok(())
}
