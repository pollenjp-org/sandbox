"""CLI entry point: migrate one or more .enex files into a Notion database."""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from enex_parser import parse_enex
from notion_migrator import NotionMigrator


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Migrate Evernote .enex files into a Notion database, "
        "preserving the original Evernote GUID and metadata as columns.",
    )
    parser.add_argument(
        "enex_files",
        nargs="+",
        type=Path,
        help="One or more Evernote .enex export files.",
    )
    parser.add_argument(
        "--database-title",
        default="Evernote Migration",
        help="Title used when creating a new Notion database.",
    )
    parser.add_argument(
        "--no-skip-existing",
        action="store_true",
        help="Re-migrate notes even if a row with the same Evernote GUID exists.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse the .enex file(s) without calling Notion. Useful for inspecting "
        "what GUIDs the parser would store.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N notes (per file). Helpful for smoke tests.",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Verbose logging."
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    load_dotenv()

    if args.dry_run:
        return _run_dry(args)

    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("NOTION_TOKEN is not set (see .env.example).", file=sys.stderr)
        return 2

    parent_page_id = os.environ.get("NOTION_PARENT_PAGE_ID")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not database_id and not parent_page_id:
        print(
            "Set NOTION_DATABASE_ID (to reuse a database) or "
            "NOTION_PARENT_PAGE_ID (to create one).",
            file=sys.stderr,
        )
        return 2

    total_success = 0
    total_failed = 0
    total_skipped = 0
    for enex in args.enex_files:
        if not enex.exists():
            print(f"File not found: {enex}", file=sys.stderr)
            return 2
        migrator = NotionMigrator(
            token=token,
            parent_page_id=parent_page_id,
            database_id=database_id,
            database_title=args.database_title,
            source_file=enex.name,
            skip_existing=not args.no_skip_existing,
        )
        notes_iter = parse_enex(enex)
        if args.limit is not None:
            notes_iter = _take(notes_iter, args.limit)

        results = migrator.migrate(notes_iter)
        # After the first file we always have a database id.
        database_id = migrator.database_id
        for r in results:
            if r.status == "Success":
                total_success += 1
            elif r.status == "Skipped":
                total_skipped += 1
            else:
                total_failed += 1
                print(
                    f"[{r.status}] {r.note.title} ({r.note.stable_id}): {r.error}",
                    file=sys.stderr,
                )

    print(
        f"Done. success={total_success} skipped={total_skipped} failed={total_failed} "
        f"database_id={database_id}"
    )
    return 0 if total_failed == 0 else 1


def _run_dry(args: argparse.Namespace) -> int:
    for enex in args.enex_files:
        if not enex.exists():
            print(f"File not found: {enex}", file=sys.stderr)
            return 2
        notes_iter = parse_enex(enex)
        if args.limit is not None:
            notes_iter = _take(notes_iter, args.limit)
        for note in notes_iter:
            payload = {
                "title": note.title,
                "evernote_guid": note.evernote_guid,
                "stable_id": note.stable_id,
                "guid_source": note.evernote_guid_source,
                "created": note.created.isoformat() if note.created else None,
                "updated": note.updated.isoformat() if note.updated else None,
                "tags": note.tags,
                "source_url": note.source_url,
                "author": note.author,
                "source_application": note.source_application,
                "resources": [
                    {"mime": r.mime, "filename": r.filename, "size": r.size}
                    for r in note.resources
                ],
            }
            print(json.dumps(payload, ensure_ascii=False))
    return 0


def _take(iterable, limit):
    for i, item in enumerate(iterable):
        if i >= limit:
            break
        yield item


if __name__ == "__main__":
    raise SystemExit(main())
