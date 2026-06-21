"""Push parsed Evernote notes into a Notion database.

The database schema deliberately surfaces every Evernote-specific identifier
the official importer drops:

* ``Evernote GUID`` - canonical identifier (preserved as a column for queries)
* ``Evernote GUID Source`` - tells you whether the GUID came from a real
  ``source-url``, an ``application-data`` key, or the SHA-1 fallback
* ``Source URL`` - raw ``evernote://`` link if any
* ``Source``, ``Source Application``, ``Author``
* ``Created`` / ``Updated`` - original Evernote timestamps
* ``Tags`` - multi-select
* ``Reminder`` / ``Reminder Done`` - reminders
* ``Latitude`` / ``Longitude`` / ``Altitude`` - geo
* ``Source File`` - the .enex file the note came from
* ``Migrated At`` - when this row was written
* ``Migration Status`` - Success / Partial / Failed
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from notion_client import Client
from notion_client.errors import APIResponseError

from enex_parser import Note
from enml_converter import enml_to_blocks


log = logging.getLogger(__name__)

DATABASE_TITLE_DEFAULT = "Evernote Migration"
NOTION_BLOCK_BATCH = 100


@dataclass
class MigrationResult:
    note: Note
    page_id: str | None
    status: str  # Success | Partial | Failed | Skipped
    error: str | None = None


class NotionMigrator:
    def __init__(
        self,
        token: str,
        *,
        parent_page_id: str | None = None,
        database_id: str | None = None,
        database_title: str = DATABASE_TITLE_DEFAULT,
        source_file: str | Path | None = None,
        skip_existing: bool = True,
    ) -> None:
        if not database_id and not parent_page_id:
            raise ValueError(
                "Either database_id or parent_page_id must be provided."
            )
        self.client = Client(auth=token)
        self.parent_page_id = parent_page_id
        self.database_id = database_id
        self.database_title = database_title
        self.source_file = str(source_file) if source_file else ""
        self.skip_existing = skip_existing

    # ------------------------------------------------------------------ database

    def ensure_database(self) -> str:
        if self.database_id:
            return self.database_id
        log.info("Creating Notion database under page %s", self.parent_page_id)
        response = self.client.databases.create(
            parent={"type": "page_id", "page_id": self.parent_page_id},
            title=[{"type": "text", "text": {"content": self.database_title}}],
            properties=self._database_properties(),
        )
        self.database_id = response["id"]
        log.info("Created database %s", self.database_id)
        return self.database_id

    @staticmethod
    def _database_properties() -> dict:
        return {
            "Title": {"title": {}},
            "Evernote GUID": {"rich_text": {}},
            "Evernote GUID Source": {
                "select": {
                    "options": [
                        {"name": "source-url", "color": "green"},
                        {"name": "application-data", "color": "blue"},
                        {"name": "sha1-fallback", "color": "yellow"},
                        {"name": "missing", "color": "red"},
                    ]
                }
            },
            "Source URL": {"url": {}},
            "Source": {"rich_text": {}},
            "Source Application": {"rich_text": {}},
            "Author": {"rich_text": {}},
            "Created": {"date": {}},
            "Updated": {"date": {}},
            "Tags": {"multi_select": {}},
            "Reminder": {"date": {}},
            "Reminder Done": {"date": {}},
            "Latitude": {"number": {"format": "number"}},
            "Longitude": {"number": {"format": "number"}},
            "Altitude": {"number": {"format": "number"}},
            "Source File": {"rich_text": {}},
            "Migrated At": {"date": {}},
            "Migration Status": {
                "select": {
                    "options": [
                        {"name": "Success", "color": "green"},
                        {"name": "Partial", "color": "yellow"},
                        {"name": "Failed", "color": "red"},
                    ]
                }
            },
        }

    # --------------------------------------------------------------- migration

    def migrate(self, notes: Iterable[Note]) -> list[MigrationResult]:
        self.ensure_database()
        results: list[MigrationResult] = []
        for note in notes:
            results.append(self.migrate_note(note))
        return results

    def migrate_note(self, note: Note) -> MigrationResult:
        if self.skip_existing:
            existing = self.find_existing_page(note.stable_id)
            if existing:
                log.info("Skipping existing note %s -> %s", note.title, existing)
                return MigrationResult(note, existing, "Skipped")

        blocks = enml_to_blocks(note.content_enml)
        first_batch = blocks[:NOTION_BLOCK_BATCH]
        rest = blocks[NOTION_BLOCK_BATCH:]
        properties = self._note_properties(note)

        try:
            page = self._with_retry(
                self.client.pages.create,
                parent={"database_id": self.database_id},
                properties=properties,
                children=first_batch,
            )
        except APIResponseError as exc:
            log.error("Failed to create page for %s: %s", note.title, exc)
            return MigrationResult(note, None, "Failed", str(exc))

        page_id = page["id"]
        partial = False
        for i in range(0, len(rest), NOTION_BLOCK_BATCH):
            chunk = rest[i : i + NOTION_BLOCK_BATCH]
            try:
                self._with_retry(
                    self.client.blocks.children.append,
                    block_id=page_id,
                    children=chunk,
                )
            except APIResponseError as exc:
                log.warning("Failed to append blocks to %s: %s", page_id, exc)
                partial = True
                break

        status = "Partial" if partial else "Success"
        if status == "Partial":
            self._safe_update_status(page_id, status)
        return MigrationResult(note, page_id, status)

    # -------------------------------------------------------------- properties

    def _note_properties(self, note: Note) -> dict:
        guid_source_label = (
            "sha1-fallback"
            if note.evernote_guid is None
            else (
                "source-url"
                if note.evernote_guid_source == "source-url"
                else "application-data"
            )
        )
        properties = {
            "Title": _title(note.title),
            "Evernote GUID": _rich_text(note.stable_id),
            "Evernote GUID Source": _select(guid_source_label),
            "Tags": {
                "multi_select": [{"name": _safe_select_name(t)} for t in note.tags]
            },
            "Source File": _rich_text(self.source_file),
            "Migrated At": _date(datetime.now(timezone.utc)),
            "Migration Status": _select("Success"),
        }
        if note.source_url:
            properties["Source URL"] = {"url": note.source_url}
        if note.source:
            properties["Source"] = _rich_text(note.source)
        if note.source_application:
            properties["Source Application"] = _rich_text(note.source_application)
        if note.author:
            properties["Author"] = _rich_text(note.author)
        if note.created:
            properties["Created"] = _date(note.created)
        if note.updated:
            properties["Updated"] = _date(note.updated)
        if note.reminder_time:
            properties["Reminder"] = _date(note.reminder_time)
        if note.reminder_done_time:
            properties["Reminder Done"] = _date(note.reminder_done_time)
        if note.latitude is not None:
            properties["Latitude"] = {"number": note.latitude}
        if note.longitude is not None:
            properties["Longitude"] = {"number": note.longitude}
        if note.altitude is not None:
            properties["Altitude"] = {"number": note.altitude}
        return properties

    def _safe_update_status(self, page_id: str, status: str) -> None:
        try:
            self.client.pages.update(
                page_id=page_id,
                properties={"Migration Status": _select(status)},
            )
        except APIResponseError:
            pass

    # --------------------------------------------------------------- queries

    def find_existing_page(self, evernote_id: str) -> str | None:
        try:
            response = self.client.databases.query(
                database_id=self.database_id,
                filter={
                    "property": "Evernote GUID",
                    "rich_text": {"equals": evernote_id},
                },
                page_size=1,
            )
        except APIResponseError as exc:
            log.warning("Query failed when checking for duplicate %s: %s", evernote_id, exc)
            return None
        results = response.get("results", [])
        return results[0]["id"] if results else None

    # ----------------------------------------------------------------- retry

    @staticmethod
    def _with_retry(func, *args, max_attempts: int = 4, **kwargs):
        delay = 1.0
        for attempt in range(1, max_attempts + 1):
            try:
                return func(*args, **kwargs)
            except APIResponseError as exc:
                status = getattr(exc, "status", None)
                if status in {429, 500, 502, 503, 504} and attempt < max_attempts:
                    log.warning(
                        "Notion API %s, retrying in %.1fs (attempt %d/%d)",
                        status, delay, attempt, max_attempts,
                    )
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise


# --------------------------------------------------------------------- helpers


def _title(text: str) -> dict:
    return {"title": [{"type": "text", "text": {"content": text[:2000]}}]}


def _rich_text(text: str) -> dict:
    return {
        "rich_text": [{"type": "text", "text": {"content": (text or "")[:2000]}}]
    }


def _date(value: datetime) -> dict:
    return {"date": {"start": value.isoformat()}}


def _select(name: str) -> dict:
    return {"select": {"name": name}}


def _safe_select_name(name: str) -> str:
    # Notion rejects commas in select names.
    cleaned = name.replace(",", " ").strip()
    return cleaned[:100] or "untagged"
