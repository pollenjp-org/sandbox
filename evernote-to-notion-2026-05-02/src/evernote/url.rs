/// A logical reference to an Evernote note that can be rendered as a
/// `evernote:///view/<userId>/s<shard>/<noteGuid>/<noteGuid>` link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvernoteRef {
    pub user_id: i32,
    pub shard: String,
    pub note_guid: String,
}

impl EvernoteRef {
    pub fn new(user_id: i32, shard: impl Into<String>, note_guid: impl Into<String>) -> Self {
        Self {
            user_id,
            shard: shard.into(),
            note_guid: note_guid.into(),
        }
    }

    /// Render the link as found in Evernote's "Copy Internal Link" command.
    /// Example:
    /// `evernote:///view/190107255/s396/38a39f11-.../38a39f11-...`
    pub fn to_url(&self) -> String {
        let shard = if self.shard.starts_with('s') {
            self.shard.clone()
        } else {
            format!("s{}", self.shard)
        };
        format!(
            "evernote:///view/{user}/{shard}/{guid}/{guid}",
            user = self.user_id,
            shard = shard,
            guid = self.note_guid,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_canonical_url_with_shard_prefix() {
        let r = EvernoteRef::new(190107255, "s396", "38a39f11-a0da-acff-3b9f-05634d7a0199");
        assert_eq!(
            r.to_url(),
            "evernote:///view/190107255/s396/38a39f11-a0da-acff-3b9f-05634d7a0199/38a39f11-a0da-acff-3b9f-05634d7a0199"
        );
    }

    #[test]
    fn adds_s_prefix_when_missing() {
        let r = EvernoteRef::new(1, "12", "guid");
        assert_eq!(r.to_url(), "evernote:///view/1/s12/guid/guid");
    }
}
