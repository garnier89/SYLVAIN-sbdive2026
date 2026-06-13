"""Iter356 — parking day/night pricing + opening hours + proximity helpers."""
import sys

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from routes.gojek_services import (  # noqa: E402
    _is_night_hour, _is_open_now, compute_parking_price, _apply_defaults,
)


def test_night_window_overnight():
    spot = {"night_start": "20:00", "night_end": "06:00"}
    assert _is_night_hour(spot, 22) is True
    assert _is_night_hour(spot, 3) is True
    assert _is_night_hour(spot, 12) is False
    assert _is_night_hour(spot, 20) is True
    assert _is_night_hour(spot, 6) is False


def test_open_24h_always_open():
    assert _is_open_now({"open_24h": True}) is True


def test_apply_defaults_backfills_legacy_spot():
    s = _apply_defaults({"price_per_hour": 4.0})
    assert s["open_24h"] is True
    assert s["price_per_hour_night"] == 4.0
    assert s["night_start"] == "20:00"


def test_price_pure_day():
    spot = {"price_per_hour": 5.0, "price_per_hour_night": 2.0, "night_start": "22:00", "night_end": "06:00"}
    # 14:00 + 3h → all day hours (14,15,16)
    assert compute_parking_price(spot, "2026-06-13T14:00:00+00:00", 3) == 15.0


def test_price_pure_night():
    spot = {"price_per_hour": 5.0, "price_per_hour_night": 2.0, "night_start": "22:00", "night_end": "06:00"}
    # 23:00 + 3h → 23,0,1 all night
    assert compute_parking_price(spot, "2026-06-13T23:00:00+00:00", 3) == 6.0


def test_price_spanning_day_and_night():
    spot = {"price_per_hour": 5.0, "price_per_hour_night": 2.0, "night_start": "22:00", "night_end": "06:00"}
    # 21:00 + 3h → 21(day=5) + 22(night=2) + 23(night=2) = 9
    assert compute_parking_price(spot, "2026-06-13T21:00:00+00:00", 3) == 9.0
