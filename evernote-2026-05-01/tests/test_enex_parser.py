from datetime import datetime, timezone
from pathlib import Path

from enex_parser import parse_enex


SAMPLE = Path(__file__).parent / "sample.enex"


def test_parses_all_notes():
    notes = list(parse_enex(SAMPLE))
    assert len(notes) == 3
    assert [n.title for n in notes] == [
        "Hello Notion",
        "No GUID note",
        "GUID via application-data",
    ]


def test_extracts_guid_from_source_url():
    notes = list(parse_enex(SAMPLE))
    n = notes[0]
    assert n.evernote_guid == "abcdef12-3456-7890-abcd-ef1234567890"
    assert n.evernote_guid_source == "source-url"
    assert n.stable_id == n.evernote_guid


def test_extracts_guid_from_application_data():
    notes = list(parse_enex(SAMPLE))
    n = notes[2]
    assert n.evernote_guid == "deadbeef-dead-beef-dead-beefdeadbeef"
    assert n.evernote_guid_source == "application-data[evernote.guid]"


def test_falls_back_to_stable_hash():
    notes = list(parse_enex(SAMPLE))
    n = notes[1]
    assert n.evernote_guid is None
    assert n.evernote_guid_source == "missing"
    assert n.stable_id.startswith("sha1:")
    # Stable across re-parses.
    again = list(parse_enex(SAMPLE))[1]
    assert n.stable_id == again.stable_id


def test_parses_metadata():
    n = list(parse_enex(SAMPLE))[0]
    assert n.created == datetime(2024, 1, 15, 10, 15, 30, tzinfo=timezone.utc)
    assert n.updated == datetime(2024, 2, 10, 9, 12, 0, tzinfo=timezone.utc)
    assert n.author == "jane@example.com"
    assert n.source == "desktop.mac"
    assert n.source_application == "evernote.mac"
    assert n.tags == ["migration", "demo"]
    assert n.latitude == 35.6812
    assert n.longitude == 139.7671
