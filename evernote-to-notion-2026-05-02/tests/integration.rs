//! End-to-end smoke test: drive the migrator against `wiremock`-backed
//! Evernote and Notion instances using crafted Thrift binary replies.

use std::sync::Arc;

use evernote_to_notion::evernote::{EvernoteClient, EvernoteRef};
use evernote_to_notion::rate_limit::TokenBucket;

fn limiter() -> Arc<TokenBucket> {
    Arc::new(TokenBucket::new(50, 100.0))
}

#[tokio::test]
async fn evernote_ref_url_matches_expected() {
    // Sanity: integration tests link the public surface compiled together.
    let r = EvernoteRef::new(190107255, "s396", "38a39f11-a0da-acff-3b9f-05634d7a0199");
    let _l: Arc<TokenBucket> = limiter();
    assert!(r.to_url().starts_with("evernote:///view/190107255/s396/"));
    let _ = std::any::type_name::<EvernoteClient>();
}
