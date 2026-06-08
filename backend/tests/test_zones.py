"""Unit tests for zone resolution + programmed shortcut scheduling (Iter zones)."""
from routes.zones import resolve_zone, _entry_active, _haversine_km

ZONES = [
    {"id": "z1", "name": "Pointe-à-Pitre", "city": "Pointe-à-Pitre", "country": "Guadeloupe",
     "lat": 16.2412, "lng": -61.534, "radius_km": 20, "aliases": ["abymes"], "display_order": 0},
    {"id": "z2", "name": "Dakar", "city": "Dakar", "country": "Sénégal",
     "lat": 14.7167, "lng": -17.4677, "radius_km": 30, "aliases": ["senegal"], "display_order": 1},
]


def test_geo_match_picks_within_radius():
    z = resolve_zone(ZONES, 14.72, -17.46, None)
    assert z and z["id"] == "z2"


def test_geo_no_match_outside_radius_falls_to_none():
    # Middle of the Atlantic, far from any zone, no label
    assert resolve_zone(ZONES, 0.0, -30.0, None) is None


def test_label_match_by_city():
    z = resolve_zone(ZONES, None, None, "12 rue X, Pointe-à-Pitre, Guadeloupe")
    assert z and z["id"] == "z1"


def test_label_match_by_alias():
    z = resolve_zone(ZONES, None, None, "Quartier Abymes, 97139")
    assert z and z["id"] == "z1"


def test_no_match_returns_none():
    assert resolve_zone(ZONES, None, None, "Tokyo, Japan") is None


def test_haversine_zero():
    assert _haversine_km(0, 0, 0, 0) == 0


def test_schedule_disabled_is_always_active():
    assert _entry_active({"enabled": False}, 1, 600, "2026-06-08") is True
    assert _entry_active(None, 1, 600, "2026-06-08") is True


def test_schedule_day_filter():
    sched = {"enabled": True, "days": [4, 5, 6]}
    assert _entry_active(sched, 5, 1140, "2026-06-12") is True   # Friday
    assert _entry_active(sched, 1, 1140, "2026-06-08") is False  # Monday


def test_schedule_time_window():
    sched = {"enabled": True, "start_time": "18:00", "end_time": "23:00"}
    assert _entry_active(sched, None, 1140, None) is True   # 19:00
    assert _entry_active(sched, None, 600, None) is False   # 10:00


def test_schedule_overnight_window():
    sched = {"enabled": True, "start_time": "22:00", "end_time": "04:00"}
    assert _entry_active(sched, None, 1380, None) is True   # 23:00
    assert _entry_active(sched, None, 120, None) is True    # 02:00
    assert _entry_active(sched, None, 720, None) is False   # 12:00


def test_schedule_date_range():
    sched = {"enabled": True, "start_date": "2026-06-01", "end_date": "2026-06-30"}
    assert _entry_active(sched, None, None, "2026-06-15") is True
    assert _entry_active(sched, None, None, "2026-07-01") is False
    assert _entry_active(sched, None, None, "2026-05-31") is False
