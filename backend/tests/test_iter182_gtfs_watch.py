"""Iter182 — GTFS-RT auto-watch: detection + auto-activation logic.

Simulates a GTFS-RT feed appearing on transport.data.gouv.fr (by patching the
datasets API call) and verifies the watcher auto-activates it and records an
admin alert. Restores transport_meta afterwards so the system stays in its
default (theoretical) state.
"""
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # /app/backend

import scripts.import_gtfs_martinique as gimp  # noqa: E402

META_ID = "gtfs_martinique"

FAKE_DATASETS = [{
    "slug": "gtfs-urbain-de-la-zone-centre",
    "title": "Réseau urbain de la zone Centre",
    "resources": [
        {"format": "GTFS", "title": "GTFS statique", "original_url": "https://example.com/centre.zip"},
        {"format": "gtfs-rt", "title": "GTFS-RT TripUpdates",
         "original_url": "https://example.com/centre-rt.pb"},
    ],
}]


class _FakeResp:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data

    def raise_for_status(self):
        return None


def test_watch_detects_and_auto_activates():
    db = gimp._db()
    original = db.transport_meta.find_one({"id": META_ID}) or {}
    try:
        with patch.object(gimp.requests, "get", return_value=_FakeResp(FAKE_DATASETS)):
            newly = gimp.detect_realtime(db)
        assert any(d["feed"] == "mq-centre" for d in newly)
        det = next(d for d in newly if d["feed"] == "mq-centre")
        assert det["auto_activated"] is True
        assert det["acknowledged"] is False
        assert det["url"] == "https://example.com/centre-rt.pb"

        meta = db.transport_meta.find_one({"id": META_ID})
        # auto-activated → URL written into realtime_urls
        assert meta["realtime_urls"]["mq-centre"] == "https://example.com/centre-rt.pb"
        # detection recorded for the admin dashboard bell
        assert any(d["url"] == "https://example.com/centre-rt.pb" for d in meta.get("rt_detections", []))

        # idempotent: re-scanning the same feed does not duplicate the alert
        with patch.object(gimp.requests, "get", return_value=_FakeResp(FAKE_DATASETS)):
            newly2 = gimp.detect_realtime(db)
        assert newly2 == []
    finally:
        # restore default (theoretical) state
        db.transport_meta.update_one(
            {"id": META_ID},
            {"$set": {"realtime_urls": original.get("realtime_urls", {}),
                      "rt_detections": original.get("rt_detections", [])}},
            upsert=True,
        )

    meta = db.transport_meta.find_one({"id": META_ID})
    assert meta.get("realtime_urls", {}).get("mq-centre") in (None, "")
