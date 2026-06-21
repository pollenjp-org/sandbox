use serde_json::{Value, json};

use crate::enml::ConvertedBlock;

/// Map a `ConvertedBlock` (with media references already resolved to Notion
/// `file_upload` ids) to a Notion block payload.
pub fn to_notion_block(block: ConvertedBlock, resolved: &dyn MediaResolver) -> Option<Value> {
    Some(match block {
        ConvertedBlock::Heading1(t) => heading("heading_1", &t),
        ConvertedBlock::Heading2(t) => heading("heading_2", &t),
        ConvertedBlock::Heading3(t) => heading("heading_3", &t),
        ConvertedBlock::Paragraph(t) => paragraph(&t),
        ConvertedBlock::BulletItem(t) => list_item("bulleted_list_item", &t),
        ConvertedBlock::NumberedItem(t) => list_item("numbered_list_item", &t),
        ConvertedBlock::Code(t) => code(&t),
        ConvertedBlock::MediaRef { hash_hex, mime } => media(&hash_hex, &mime, resolved)?,
    })
}

pub trait MediaResolver {
    fn resolve(&self, hash_hex: &str) -> Option<&str>;
}

/// Simple HashMap-backed resolver.
#[derive(Debug, Default)]
pub struct HashMapResolver(pub std::collections::HashMap<String, (String, String)>);

impl HashMapResolver {
    pub fn insert(&mut self, hash_hex: String, file_upload_id: String, mime: String) {
        self.0.insert(hash_hex, (file_upload_id, mime));
    }
    pub fn get(&self, hash_hex: &str) -> Option<&(String, String)> {
        self.0.get(hash_hex)
    }
}

impl MediaResolver for HashMapResolver {
    fn resolve(&self, hash_hex: &str) -> Option<&str> {
        self.0.get(hash_hex).map(|(id, _)| id.as_str())
    }
}

fn rich_text(t: &str) -> Value {
    json!([{
        "type": "text",
        "text": { "content": truncate(t, 2000) },
    }])
}

fn truncate(s: &str, max: usize) -> &str {
    if s.len() <= max {
        s
    } else {
        // ensure we cut on a char boundary
        let mut idx = max;
        while !s.is_char_boundary(idx) && idx > 0 {
            idx -= 1;
        }
        &s[..idx]
    }
}

fn heading(kind: &str, t: &str) -> Value {
    json!({
        "object": "block",
        "type": kind,
        kind: { "rich_text": rich_text(t) },
    })
}

fn paragraph(t: &str) -> Value {
    json!({
        "object": "block",
        "type": "paragraph",
        "paragraph": { "rich_text": rich_text(t) },
    })
}

fn list_item(kind: &str, t: &str) -> Value {
    json!({
        "object": "block",
        "type": kind,
        kind: { "rich_text": rich_text(t) },
    })
}

fn code(t: &str) -> Value {
    json!({
        "object": "block",
        "type": "code",
        "code": {
            "rich_text": rich_text(t),
            "language": "plain text",
        },
    })
}

fn media(hash_hex: &str, mime: &str, resolved: &dyn MediaResolver) -> Option<Value> {
    let id = resolved.resolve(hash_hex)?;
    let kind = media_kind(mime);
    Some(json!({
        "object": "block",
        "type": kind,
        kind: {
            "type": "file_upload",
            "file_upload": { "id": id },
        },
    }))
}

fn media_kind(mime: &str) -> &'static str {
    if mime.starts_with("image/") {
        "image"
    } else if mime.starts_with("video/") {
        "video"
    } else if mime.starts_with("audio/") {
        "audio"
    } else if mime == "application/pdf" {
        "pdf"
    } else {
        "file"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paragraph_block_shape() {
        let r = HashMapResolver::default();
        let v = to_notion_block(ConvertedBlock::Paragraph("hi".into()), &r).unwrap();
        assert_eq!(v["type"], "paragraph");
        assert_eq!(v["paragraph"]["rich_text"][0]["text"]["content"], "hi");
    }

    #[test]
    fn media_block_uses_resolved_id() {
        let mut r = HashMapResolver::default();
        r.insert("deadbeef".into(), "fu_123".into(), "image/png".into());
        let v = to_notion_block(
            ConvertedBlock::MediaRef {
                hash_hex: "deadbeef".into(),
                mime: "image/png".into(),
            },
            &r,
        )
        .unwrap();
        assert_eq!(v["type"], "image");
        assert_eq!(v["image"]["file_upload"]["id"], "fu_123");
    }

    #[test]
    fn unresolved_media_dropped() {
        let r = HashMapResolver::default();
        let v = to_notion_block(
            ConvertedBlock::MediaRef {
                hash_hex: "missing".into(),
                mime: "image/png".into(),
            },
            &r,
        );
        assert!(v.is_none());
    }
}
