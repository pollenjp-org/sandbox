from enml_converter import enml_to_blocks


SIMPLE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <h1>Title</h1>
  <p>Hello <b>world</b> with <a href="https://example.com">link</a>.</p>
  <ul>
    <li>one</li>
    <li>two</li>
  </ul>
  <en-todo checked="true"/>finished
  <pre>code</pre>
</en-note>
"""


def _types(blocks):
    return [b["type"] for b in blocks]


def test_basic_block_types():
    blocks = enml_to_blocks(SIMPLE)
    types = _types(blocks)
    assert "heading_1" in types
    assert "paragraph" in types
    assert types.count("bulleted_list_item") == 2
    assert "code" in types


def test_link_and_bold_annotations():
    blocks = enml_to_blocks(SIMPLE)
    paragraph = next(b for b in blocks if b["type"] == "paragraph")
    rich = paragraph["paragraph"]["rich_text"]
    assert any(r["annotations"]["bold"] for r in rich), rich
    assert any(
        r.get("text", {}).get("link", {}).get("url") == "https://example.com"
        for r in rich
    ), rich


def test_long_text_chunks():
    long_text = "x" * 5000
    enml = (
        '<?xml version="1.0" encoding="UTF-8"?><en-note><p>'
        + long_text
        + "</p></en-note>"
    )
    blocks = enml_to_blocks(enml)
    paragraph = blocks[0]
    rich = paragraph["paragraph"]["rich_text"]
    assert all(len(r["text"]["content"]) <= 2000 for r in rich)
    assert sum(len(r["text"]["content"]) for r in rich) == 5000


def test_empty_input_returns_empty():
    assert enml_to_blocks("") == []
    assert enml_to_blocks("   ") == []
