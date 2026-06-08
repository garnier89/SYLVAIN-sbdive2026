"""Iter181 — Unit tests for the GTFS-Realtime (TripUpdates) overlay layer.

These test the pure parsing/overlay helpers with a synthetic protobuf feed, so
the realtime pipeline is validated even though no live GTFS-RT feed is published
for Martinique yet. (Imports the route module directly.)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # /app/backend

from google.transit import gtfs_realtime_pb2  # noqa: E402
from routes.transport import parse_gtfs_rt, _apply_rt  # noqa: E402


def _build_feed():
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.header.gtfs_realtime_version = "2.0"
    # delayed trip (+5 min at S1)
    e1 = msg.entity.add(); e1.id = "1"
    tu = e1.trip_update; tu.trip.trip_id = "T1"
    stu = tu.stop_time_update.add(); stu.stop_id = "S1"; stu.departure.delay = 300
    # cancelled trip
    e2 = msg.entity.add(); e2.id = "2"
    e2.trip_update.trip.trip_id = "T2"
    e2.trip_update.trip.schedule_relationship = 3  # CANCELED
    # skipped stop
    e3 = msg.entity.add(); e3.id = "3"
    tu3 = e3.trip_update; tu3.trip.trip_id = "T3"
    s3 = tu3.stop_time_update.add(); s3.stop_id = "S3"; s3.schedule_relationship = 1  # SKIPPED
    return msg.SerializeToString()


def test_parse_gtfs_rt():
    data = parse_gtfs_rt(_build_feed())
    assert "T2" in data["canceled"]
    assert data["updates"][("T1", "S1")]["delay"] == 300
    assert data["updates"][("T3", "S3")]["skipped"] is True


def test_apply_rt_delay():
    rt = {"updates": {("T1", "S1"): {"delay": 300, "time": None}}, "canceled": set()}
    adj, is_rt = _apply_rt(28800, "T1", "S1", rt)  # 08:00:00 + 300s
    assert adj == 28800 + 300 and is_rt is True


def test_apply_rt_cancelled_returns_none():
    rt = {"updates": {}, "canceled": {"T2"}}
    adj, is_rt = _apply_rt(28800, "T2", "S1", rt)
    assert adj is None and is_rt is True


def test_apply_rt_skipped_returns_none():
    rt = {"updates": {("T3", "S3"): {"skipped": True}}, "canceled": set()}
    adj, is_rt = _apply_rt(28800, "T3", "S3", rt)
    assert adj is None and is_rt is True


def test_apply_rt_no_feed_is_theoretical():
    adj, is_rt = _apply_rt(28800, "T1", "S1", None)
    assert adj == 28800 and is_rt is False


def test_apply_rt_unknown_trip_unchanged():
    rt = {"updates": {("T1", "S1"): {"delay": 120, "time": None}}, "canceled": set()}
    adj, is_rt = _apply_rt(28800, "OTHER", "S9", rt)
    assert adj == 28800 and is_rt is False
