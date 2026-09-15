"""Convert ENML (Evernote's HTML dialect) into Notion block payloads.

Notion has tight limits we have to honour:

* Each rich-text item caps at 2000 characters.
* A single ``children`` array on page creation caps at 100 blocks; longer
  documents need ``blocks.children.append`` follow-ups.

This converter focuses on the high-frequency tags that real notes use. Tags it
does not recognise are flattened into plain text rather than dropped, so no
content is silently lost. Embedded resources (``<en-media>``) are emitted as
callout blocks describing the missing attachment, since uploading binary data
to Notion requires an external host.
"""

from __future__ import annotations

from typing import Iterable

from bs4 import BeautifulSoup, NavigableString, Tag


NOTION_TEXT_LIMIT = 2000


def enml_to_blocks(enml: str) -> list[dict]:
    """Parse an ENML string and return a list of Notion block dicts."""
    if not enml or not enml.strip():
        return []

    soup = BeautifulSoup(enml, "lxml-xml")
    root = soup.find("en-note")
    if root is None:
        # Some ENEX files store HTML without the wrapper; fall back to lxml HTML.
        soup = BeautifulSoup(enml, "lxml")
        root = soup.body or soup

    blocks: list[dict] = []
    for child in root.children:
        blocks.extend(_node_to_blocks(child))
    return _coalesce_empty(blocks)


def _coalesce_empty(blocks: list[dict]) -> list[dict]:
    """Drop empty paragraphs that appear back-to-back."""
    out: list[dict] = []
    last_empty = False
    for block in blocks:
        is_empty = (
            block.get("type") == "paragraph"
            and not block["paragraph"].get("rich_text")
        )
        if is_empty and last_empty:
            continue
        out.append(block)
        last_empty = is_empty
    return out


def _node_to_blocks(node) -> list[dict]:
    if isinstance(node, NavigableString):
        text = str(node)
        if not text.strip():
            return []
        return [_paragraph(_text_to_rich(text))]

    if not isinstance(node, Tag):
        return []

    name = node.name.lower() if node.name else ""

    if name in {"h1", "h2", "h3"}:
        rich = list(_inline_rich_text(node))
        return [_heading(name, rich)]

    if name in {"h4", "h5", "h6"}:
        # Notion only supports h1-h3; demote to h3 with bold.
        rich = list(_inline_rich_text(node))
        for r in rich:
            r["annotations"]["bold"] = True
        return [_heading("h3", rich)]

    if name in {"p", "div"}:
        # If the div only contains block-level children, descend.
        if _has_block_children(node):
            out: list[dict] = []
            for child in node.children:
                out.extend(_node_to_blocks(child))
            return out
        rich = list(_inline_rich_text(node))
        return [_paragraph(rich)]

    if name == "ul":
        return [_list_item("bulleted_list_item", li) for li in node.find_all("li", recursive=False)]

    if name == "ol":
        return [_list_item("numbered_list_item", li) for li in node.find_all("li", recursive=False)]

    if name == "li":
        return [_list_item("bulleted_list_item", node)]

    if name == "blockquote":
        rich = list(_inline_rich_text(node))
        return [{"object": "block", "type": "quote", "quote": {"rich_text": rich}}]

    if name in {"pre", "code"}:
        rich = [{
            "type": "text",
            "text": {"content": chunk},
            "annotations": _default_annotations(),
        } for chunk in _chunk_text(node.get_text())]
        return [{
            "object": "block",
            "type": "code",
            "code": {"rich_text": rich, "language": "plain text"},
        }]

    if name == "hr":
        return [{"object": "block", "type": "divider", "divider": {}}]

    if name == "br":
        return []

    if name == "table":
        # Notion table blocks require careful structure; fall back to text.
        rows = []
        for tr in node.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            rows.append(" | ".join(cells))
        text = "\n".join(rows)
        return [_paragraph(_text_to_rich(text))]

    if name == "en-media":
        mime = node.get("type", "unknown")
        hash_md5 = node.get("hash", "")
        return [{
            "object": "block",
            "type": "callout",
            "callout": {
                "icon": {"type": "emoji", "emoji": "📎"},
                "rich_text": _text_to_rich(
                    f"[Evernote attachment: {mime} hash={hash_md5}]"
                ),
            },
        }]

    if name == "en-todo":
        checked = node.get("checked", "false").lower() == "true"
        return [{
            "object": "block",
            "type": "to_do",
            "to_do": {
                "rich_text": list(_inline_rich_text(node)),
                "checked": checked,
            },
        }]

    if name in {"img"}:
        src = node.get("src")
        if src and src.startswith(("http://", "https://")):
            return [{
                "object": "block",
                "type": "image",
                "image": {"type": "external", "external": {"url": src}},
            }]
        return [_paragraph(_text_to_rich(f"[image: {src or 'embedded'}]"))]

    # Unknown tag - flatten inline.
    rich = list(_inline_rich_text(node))
    if rich:
        return [_paragraph(rich)]
    return []


def _has_block_children(node: Tag) -> bool:
    block_tags = {
        "p", "div", "ul", "ol", "li", "blockquote", "pre", "h1", "h2", "h3",
        "h4", "h5", "h6", "hr", "table",
    }
    return any(
        isinstance(c, Tag) and c.name and c.name.lower() in block_tags
        for c in node.children
    )


def _list_item(block_type: str, li: Tag) -> dict:
    rich = list(_inline_rich_text(li))
    return {
        "object": "block",
        "type": block_type,
        block_type: {"rich_text": rich},
    }


def _heading(name: str, rich: list[dict]) -> dict:
    block_type = {"h1": "heading_1", "h2": "heading_2", "h3": "heading_3"}[name]
    return {
        "object": "block",
        "type": block_type,
        block_type: {"rich_text": rich},
    }


def _paragraph(rich: list[dict]) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {"rich_text": rich},
    }


def _default_annotations() -> dict:
    return {
        "bold": False,
        "italic": False,
        "underline": False,
        "strikethrough": False,
        "code": False,
    }


def _chunk_text(text: str) -> list[str]:
    if len(text) <= NOTION_TEXT_LIMIT:
        return [text]
    return [
        text[i : i + NOTION_TEXT_LIMIT]
        for i in range(0, len(text), NOTION_TEXT_LIMIT)
    ]


def _text_to_rich(
    text: str,
    annotations: dict | None = None,
    link: str | None = None,
) -> list[dict]:
    annotations = annotations or _default_annotations()
    rich: list[dict] = []
    for chunk in _chunk_text(text):
        item = {
            "type": "text",
            "text": {"content": chunk},
            "annotations": dict(annotations),
        }
        if link:
            item["text"]["link"] = {"url": link}
        rich.append(item)
    return rich


_INLINE_STYLE_TAGS = {
    "b": {"bold": True},
    "strong": {"bold": True},
    "i": {"italic": True},
    "em": {"italic": True},
    "u": {"underline": True},
    "s": {"strikethrough": True},
    "strike": {"strikethrough": True},
    "del": {"strikethrough": True},
    "code": {"code": True},
    "tt": {"code": True},
}


def _inline_rich_text(
    node: Tag,
    annotations: dict | None = None,
    link: str | None = None,
) -> Iterable[dict]:
    annotations = annotations if annotations is not None else _default_annotations()
    for child in node.children:
        if isinstance(child, NavigableString):
            text = str(child)
            if text:
                yield from _text_to_rich(text, annotations, link)
            continue
        if not isinstance(child, Tag):
            continue
        name = (child.name or "").lower()
        if name == "br":
            yield from _text_to_rich("\n", annotations, link)
            continue
        if name == "a":
            yield from _inline_rich_text(child, annotations, child.get("href") or link)
            continue
        if name in _INLINE_STYLE_TAGS:
            new_annotations = dict(annotations)
            new_annotations.update(_INLINE_STYLE_TAGS[name])
            yield from _inline_rich_text(child, new_annotations, link)
            continue
        if name == "en-media":
            mime = child.get("type", "unknown")
            hash_md5 = child.get("hash", "")
            yield from _text_to_rich(
                f"[attachment {mime} {hash_md5}]", annotations, link
            )
            continue
        # Default: descend, preserving annotations.
        yield from _inline_rich_text(child, annotations, link)
