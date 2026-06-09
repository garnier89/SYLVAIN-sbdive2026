"""Iter 201 — Phase 4 dispatch: scheduled (planned) rides handling.

A planned ride must wait in the agenda pool until `scheduled_lead_minutes`
before its pickup. Before that it is NEVER escalated nor auto-cancelled. Once
due, it is activated (broadcast once) and follows the normal escalation timeline.

These are pure unit tests: `_process_pending_ride` is driven with stubbed
escalation/cancel/activate functions (no DB, no WebSocket).
"""
import asyncio
from datetime import datetime, timezone, timedelta

import routes.auto_dispatch as ad


def _now():
    return datetime.now(timezone.utc)


def _run(coro):
    return asyncio.run(coro)


class _Recorder:
    """Patches the side-effecting dispatch functions and records the calls."""

    def __init__(self, monkeypatch):
        self.escalated = []
        self.cancelled = []
        self.activated = []

        async def _esc(ride, tier, palettes, radius, points_cfg):
            self.escalated.append(tier)

        async def _cancel(ride):
            self.cancelled.append(ride["id"])

        async def _activate(ride):
            self.activated.append(ride["id"])
            ride["dispatch_activated"] = True

        async def _radius(ride, cfg):
            return cfg["radius_km"]

        async def _penalize(ride, cfg):
            return None

        monkeypatch.setattr(ad, "_escalate_ride", _esc)
        monkeypatch.setattr(ad, "_auto_cancel_ride", _cancel)
        monkeypatch.setattr(ad, "_activate_scheduled_ride", _activate)
        monkeypatch.setattr(ad, "_resolve_radius_km", _radius)
        monkeypatch.setattr(ad, "_penalize_non_responders", _penalize)


CFG = {
    **ad.DEFAULT_CONFIG,
    "first_escalation_seconds": 30,
    "second_escalation_seconds": 60,
    "auto_cancel_after_seconds": 120,
    "scheduled_lead_minutes": 15,
    "radius_km": 5,
}


def test_future_scheduled_ride_is_left_untouched(monkeypatch):
    """A ride scheduled 2h out must NOT be escalated or cancelled, even though it
    was created long ago (created_at would otherwise age past auto_cancel)."""
    rec = _Recorder(monkeypatch)
    now = _now()
    ride = {
        "id": "ride_future",
        "created_at": (now - timedelta(hours=3)).isoformat(),  # old, but irrelevant
        "scheduled_at": (now + timedelta(hours=2)).isoformat(),
        "auto_dispatch_tier": 0,
    }
    _run(ad._process_pending_ride(ride, now, CFG, {}))
    assert rec.escalated == []
    assert rec.cancelled == []
    assert rec.activated == []


def test_scheduled_ride_activates_when_due(monkeypatch):
    """Within the lead window the ride becomes due: it is activated (broadcast
    once) and escalated based on the lead-start age."""
    rec = _Recorder(monkeypatch)
    now = _now()
    # due_dt = scheduled_at - 15min = now - 40s -> age ~40s -> escalate_1 (30..60)
    ride = {
        "id": "ride_due",
        "created_at": (now - timedelta(minutes=1)).isoformat(),
        "scheduled_at": (now + timedelta(minutes=14, seconds=20)).isoformat(),
        "auto_dispatch_tier": 0,
    }
    _run(ad._process_pending_ride(ride, now, CFG, {}))
    assert rec.activated == ["ride_due"]
    assert rec.escalated == [1]
    assert rec.cancelled == []


def test_due_scheduled_ride_not_reactivated(monkeypatch):
    """Already-activated scheduled ride is not broadcast again on the next cycle."""
    rec = _Recorder(monkeypatch)
    now = _now()
    ride = {
        "id": "ride_act",
        "created_at": (now - timedelta(minutes=1)).isoformat(),
        "scheduled_at": (now + timedelta(minutes=10)).isoformat(),
        "auto_dispatch_tier": 2,
        "dispatch_activated": True,
    }
    _run(ad._process_pending_ride(ride, now, CFG, {}))
    assert rec.activated == []  # not re-activated


def test_overdue_scheduled_ride_auto_cancels(monkeypatch):
    """Pickup time well past with no driver -> auto-cancel kicks in."""
    rec = _Recorder(monkeypatch)
    now = _now()
    # due_dt = now - 30min -> age 1800s >> auto_cancel 120s
    ride = {
        "id": "ride_overdue",
        "created_at": (now - timedelta(minutes=40)).isoformat(),
        "scheduled_at": (now - timedelta(minutes=15)).isoformat(),
        "auto_dispatch_tier": 2,
        "dispatch_activated": True,
    }
    _run(ad._process_pending_ride(ride, now, CFG, {}))
    assert rec.cancelled == ["ride_overdue"]


def test_instant_ride_still_uses_created_at(monkeypatch):
    """Regression: instant (non-scheduled) ride escalates off created_at."""
    rec = _Recorder(monkeypatch)
    now = _now()
    ride = {
        "id": "ride_instant",
        "created_at": (now - timedelta(seconds=35)).isoformat(),  # >30s -> tier1
        "auto_dispatch_tier": 0,
    }
    _run(ad._process_pending_ride(ride, now, CFG, {}))
    assert rec.escalated == [1]
    assert rec.activated == []
    assert rec.cancelled == []
