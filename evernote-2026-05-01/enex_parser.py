"""Parse Evernote .enex export files into structured Note objects.

The official Notion importer drops the original Evernote GUID, so this parser
goes out of its way to recover it. The GUID is most reliably stored in the
``<note-attributes><source-url>`` field as an ``evernote:///view/...`` URL.
When that is missing we fall back to ``<application-data>`` keys, and finally
to a deterministic SHA-1 hash of (title|created|content) so every note still
has a stable, replayable identifier.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from dateutil import parser as dateparser
from lxml import etree


EVERNOTE_URL_GUID_RE = re.compile(
    r"evernote:/+view/\d+/[^/]+/([0-9a-f-]{8,})/", re.IGNORECASE
)


@dataclass(slots=True)
class Resource:
    mime: str | None = None
    filename: str | None = None
    hash_md5: str | None = None
    size: int | None = None


@dataclass(slots=True)
class Note:
    title: str
    content_enml: str
    created: datetime | None = None
    updated: datetime | None = None
    tags: list[str] = field(default_factory=list)
    source_url: str | None = None
    source: str | None = None
    source_application: str | None = None
    author: str | None = None
    reminder_time: datetime | None = None
    reminder_done_time: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    altitude: float | None = None
    evernote_guid: str | None = None
    evernote_guid_source: str = "unknown"
    application_data: dict[str, str] = field(default_factory=dict)
    resources: list[Resource] = field(default_factory=list)
    raw_attributes: dict[str, str] = field(default_factory=dict)

    @property
    def stable_id(self) -> str:
        """Return the Evernote GUID if known, otherwise a deterministic hash."""
        if self.evernote_guid:
            return self.evernote_guid
        digest = hashlib.sha1(
            "|".join(
                [
                    self.title or "",
                    self.created.isoformat() if self.created else "",
                    self.content_enml[:512],
                ]
            ).encode("utf-8")
        ).hexdigest()
        return f"sha1:{digest}"


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # Evernote uses YYYYMMDDTHHMMSSZ
        if re.fullmatch(r"\d{8}T\d{6}Z", value):
            return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            )
        return dateparser.parse(value)
    except (ValueError, TypeError):
        return None


def _text(elem: etree._Element | None) -> str | None:
    if elem is None:
        return None
    if elem.text is None:
        return None
    text = elem.text.strip()
    return text or None


def _extract_guid(
    source_url: str | None,
    application_data: dict[str, str],
) -> tuple[str | None, str]:
    """Return (guid, source_label)."""
    if source_url:
        match = EVERNOTE_URL_GUID_RE.search(source_url)
        if match:
            return match.group(1).lower(), "source-url"

    for key in ("evernote.guid", "guid", "noteGuid"):
        if key in application_data:
            value = application_data[key].strip()
            if value:
                return value.lower(), f"application-data[{key}]"

    return None, "missing"


def _parse_note(elem: etree._Element) -> Note:
    title = _text(elem.find("title")) or "(untitled)"
    content = elem.findtext("content") or ""
    created = _parse_datetime(_text(elem.find("created")))
    updated = _parse_datetime(_text(elem.find("updated")))
    tags = [t.text.strip() for t in elem.findall("tag") if t.text and t.text.strip()]

    raw_attributes: dict[str, str] = {}
    application_data: dict[str, str] = {}
    attrs = elem.find("note-attributes")
    if attrs is not None:
        for child in attrs:
            tag = etree.QName(child).localname
            if tag == "application-data":
                key = child.get("key") or ""
                if key:
                    application_data[key] = (child.text or "").strip()
                continue
            if child.text is not None:
                raw_attributes[tag] = child.text.strip()

    def _attr(name: str) -> str | None:
        value = raw_attributes.get(name)
        return value if value else None

    def _attr_float(name: str) -> float | None:
        value = _attr(name)
        if value is None:
            return None
        try:
            return float(value)
        except ValueError:
            return None

    source_url = _attr("source-url")
    guid, guid_source = _extract_guid(source_url, application_data)

    resources: list[Resource] = []
    for res in elem.findall("resource"):
        mime = _text(res.find("mime"))
        size = res.findtext("data/@size") if False else None
        data_elem = res.find("data")
        if data_elem is not None:
            size_attr = data_elem.get("size")
            if size_attr:
                try:
                    size = int(size_attr)
                except ValueError:
                    size = None
        rattrs = res.find("resource-attributes")
        filename = _text(rattrs.find("file-name")) if rattrs is not None else None
        hash_md5 = _text(rattrs.find("hash")) if rattrs is not None else None
        resources.append(
            Resource(mime=mime, filename=filename, hash_md5=hash_md5, size=size)
        )

    return Note(
        title=title,
        content_enml=content,
        created=created,
        updated=updated,
        tags=tags,
        source_url=source_url,
        source=_attr("source"),
        source_application=_attr("source-application"),
        author=_attr("author"),
        reminder_time=_parse_datetime(_attr("reminder-time")),
        reminder_done_time=_parse_datetime(_attr("reminder-done-time")),
        latitude=_attr_float("latitude"),
        longitude=_attr_float("longitude"),
        altitude=_attr_float("altitude"),
        evernote_guid=guid,
        evernote_guid_source=guid_source,
        application_data=application_data,
        resources=resources,
        raw_attributes=raw_attributes,
    )


def parse_enex(path: str | Path) -> Iterator[Note]:
    """Yield Notes from an .enex file. Streams the file to keep memory low."""
    path = Path(path)
    context = etree.iterparse(
        str(path),
        events=("end",),
        tag="note",
        huge_tree=True,
        resolve_entities=False,
    )
    for _, elem in context:
        try:
            yield _parse_note(elem)
        finally:
            elem.clear()
            # Free siblings already processed.
            while elem.getprevious() is not None:
                del elem.getparent()[0]
