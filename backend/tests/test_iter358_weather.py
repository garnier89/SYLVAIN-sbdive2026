"""Iter358 — weather surcharge: seed idempotency + multiplier application."""
import sys
import asyncio

import pytest
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from core.config import db  # noqa: E402
from routes import pricing as P  # noqa: E402

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)


def run(coro):
    return _LOOP.run_until_complete(coro)


def test_seed_is_idempotent():
    run(P.seed_weather_surcharges())
    n1 = run(db.weather_surcharges.count_documents({}))
    assert n1 >= 1
    run(P.seed_weather_surcharges())  # must not duplicate
    assert run(db.weather_surcharges.count_documents({})) == n1


def test_active_rule_covers_all_conditions():
    rules = run(db.weather_surcharges.find({"status": "active"}, {"_id": 0}).to_list(100))
    conds = {}
    for r in rules:
        conds.update(r.get("conditions") or {})
    for c in ("Rain", "Drizzle", "Thunderstorm", "Snow", "Mist"):
        assert c in conds, f"{c} manquant"
    assert conds["Thunderstorm"] >= conds["Rain"]  # orage plus cher que pluie


def test_multiplier_applies_for_rain(monkeypatch):
    monkeypatch.setattr(P, "get_current_condition", lambda lat, lng: "Rain")
    mult, cond = run(P._weather_multiplier(48.85, 2.35, "all"))
    assert cond == "Rain"
    assert mult == 1.2


def test_no_surcharge_when_clear(monkeypatch):
    monkeypatch.setattr(P, "get_current_condition", lambda lat, lng: "Clear")
    mult, cond = run(P._weather_multiplier(48.85, 2.35, "all"))
    assert mult == 1.0


def test_compute_pricing_applies_weather(monkeypatch):
    monkeypatch.setattr(P, "get_current_condition", lambda lat, lng: "Snow")
    # neutralise le surge pour isoler la météo
    async def _no_surge(lat, lng, vt):
        return 1.0, None
    async def _no_auto(lat, lng):
        return 1.0, None
    monkeypatch.setattr(P, "_surge_multiplier", _no_surge)
    monkeypatch.setattr(P, "_auto_commune_surge", _no_auto)
    res = run(P.compute_pricing_adjustment(10.0, 48.85, 2.35, "all"))
    assert res["weather_multiplier"] == 1.6
    assert res["fare"] == 16.0
    assert any("météo" in r.lower() for r in res["reasons"])
