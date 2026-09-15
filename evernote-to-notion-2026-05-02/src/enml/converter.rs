//! Convert ENML (Evernote's HTML subset) into a sequence of intermediate
//! "ConvertedBlock" values. The migrator then maps each ConvertedBlock onto a
//! Notion block payload — file blocks (en-media) require a separate
//! `file_upload` round-trip so they are emitted as `MediaRef` placeholders.
//!
//! ENML reference: <https://dev.evernote.com/doc/articles/enml.php>

use quick_xml::Reader;
use quick_xml::events::Event;

#[derive(Debug, thiserror::Error)]
pub enum EnmlConvertError {
    #[error("xml parse error: {0}")]
    Xml(#[from] quick_xml::Error),
    #[error("xml event error: {0}")]
    Event(String),
    #[error("utf8: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConvertedBlock {
    Heading1(String),
    Heading2(String),
    Heading3(String),
    Paragraph(String),
    BulletItem(String),
    NumberedItem(String),
    Code(String),
    /// Refers to a Note resource by hash. The migrator resolves the hash to
    /// an uploaded Notion file and replaces this with image/file/video block.
    MediaRef {
        hash_hex: String,
        mime: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ListMode {
    None,
    Bullet,
    Numbered,
}

pub fn convert_enml(input: &str) -> Result<Vec<ConvertedBlock>, EnmlConvertError> {
    let mut reader = Reader::from_str(input);
    reader.config_mut().trim_text(true);

    let mut blocks = Vec::new();
    let mut text = String::new();
    let mut current_tag: Option<String> = None;
    let mut list_mode = ListMode::None;
    let mut buf = Vec::new();

    fn flush(
        blocks: &mut Vec<ConvertedBlock>,
        text: &mut String,
        tag: &Option<String>,
        list_mode: ListMode,
    ) {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            text.clear();
            return;
        }
        let owned = trimmed.to_string();
        let block = match tag.as_deref() {
            Some("h1") => ConvertedBlock::Heading1(owned),
            Some("h2") => ConvertedBlock::Heading2(owned),
            Some("h3") | Some("h4") | Some("h5") | Some("h6") => ConvertedBlock::Heading3(owned),
            Some("pre") | Some("code") => ConvertedBlock::Code(owned),
            Some("li") => match list_mode {
                ListMode::Numbered => ConvertedBlock::NumberedItem(owned),
                _ => ConvertedBlock::BulletItem(owned),
            },
            _ => ConvertedBlock::Paragraph(owned),
        };
        blocks.push(block);
        text.clear();
    }

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())?.to_lowercase();
                match name.as_str() {
                    "ul" => list_mode = ListMode::Bullet,
                    "ol" => list_mode = ListMode::Numbered,
                    "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "pre" | "code" => {
                        flush(&mut blocks, &mut text, &current_tag, list_mode);
                        current_tag = Some(name);
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())?.to_lowercase();
                match name.as_str() {
                    "ul" | "ol" => list_mode = ListMode::None,
                    "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "li" | "pre" | "code" => {
                        flush(&mut blocks, &mut text, &current_tag, list_mode);
                        current_tag = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(e)) => {
                let name = std::str::from_utf8(e.name().as_ref())?.to_lowercase();
                if name == "en-media" {
                    flush(&mut blocks, &mut text, &current_tag, list_mode);
                    let mut hash_hex = String::new();
                    let mut mime = String::new();
                    for attr in e.attributes().with_checks(false).flatten() {
                        let key = std::str::from_utf8(attr.key.as_ref())?.to_lowercase();
                        let value = attr
                            .unescape_value()
                            .map_err(|err| EnmlConvertError::Event(err.to_string()))?
                            .into_owned();
                        match key.as_str() {
                            "hash" => hash_hex = value,
                            "type" => mime = value,
                            _ => {}
                        }
                    }
                    if !hash_hex.is_empty() {
                        blocks.push(ConvertedBlock::MediaRef { hash_hex, mime });
                    }
                } else if name == "br" {
                    text.push('\n');
                }
            }
            Ok(Event::Text(t)) => {
                let s = t
                    .unescape()
                    .map_err(|e| EnmlConvertError::Event(e.to_string()))?;
                text.push_str(&s);
            }
            Ok(Event::CData(c)) => {
                text.push_str(std::str::from_utf8(&c)?);
            }
            Ok(Event::Eof) => {
                flush(&mut blocks, &mut text, &current_tag, list_mode);
                break;
            }
            Ok(_) => {}
            Err(e) => return Err(EnmlConvertError::Event(e.to_string())),
        }
        buf.clear();
    }
    Ok(blocks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_paragraph() {
        let enml = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note><p>hello world</p></en-note>"#;
        let blocks = convert_enml(enml).unwrap();
        assert_eq!(
            blocks,
            vec![ConvertedBlock::Paragraph("hello world".into())]
        );
    }

    #[test]
    fn parses_headings_and_lists() {
        let enml = "<en-note><h1>Title</h1><ul><li>a</li><li>b</li></ul></en-note>";
        let blocks = convert_enml(enml).unwrap();
        assert_eq!(
            blocks,
            vec![
                ConvertedBlock::Heading1("Title".into()),
                ConvertedBlock::BulletItem("a".into()),
                ConvertedBlock::BulletItem("b".into()),
            ]
        );
    }

    #[test]
    fn parses_numbered_list() {
        let enml = "<en-note><ol><li>one</li><li>two</li></ol></en-note>";
        let blocks = convert_enml(enml).unwrap();
        assert_eq!(
            blocks,
            vec![
                ConvertedBlock::NumberedItem("one".into()),
                ConvertedBlock::NumberedItem("two".into()),
            ]
        );
    }

    #[test]
    fn parses_media_ref() {
        let enml =
            r#"<en-note><p>see image</p><en-media hash="deadbeef" type="image/png"/></en-note>"#;
        let blocks = convert_enml(enml).unwrap();
        assert_eq!(
            blocks,
            vec![
                ConvertedBlock::Paragraph("see image".into()),
                ConvertedBlock::MediaRef {
                    hash_hex: "deadbeef".into(),
                    mime: "image/png".into(),
                },
            ]
        );
    }

    #[test]
    fn parses_code_block() {
        let enml = "<en-note><pre>let x = 1;</pre></en-note>";
        let blocks = convert_enml(enml).unwrap();
        assert_eq!(blocks, vec![ConvertedBlock::Code("let x = 1;".into())]);
    }
}
