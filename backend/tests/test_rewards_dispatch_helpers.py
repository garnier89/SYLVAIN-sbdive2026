"""
Characterization tests for the pure helpers extracted while reducing the
complexity of get_rewards_config (admin) and _process_pending_ride
(auto_dispatch). These run without a DB.
"""
from routes.admin import (
    _rewards_zone_candidates, _merge_rewards_settings, DEFAULT_REWARDS_CONFIG,
)
from routes.auto_dispatch import _dispatch_action


# ---- _rewards_zone_candidates -------------------------------------------------

def test_zone_candidates_none_or_empty():
    assert _rewards_zone_candidates(None) == []
    assert _rewards_zone_candidates({}) == []
    assert _rewards_zone_candidates({"country": "   "}) == []


def test_zone_candidates_country_only():
    assert _rewards_zone_candidates({"country": "fr"}) == ["FR"]


def test_zone_candidates_country_state():
    assert _rewards_zone_candidates({"country": "FR", "state": "Martinique"}) == [
        "FR|Martinique", "FR",
    ]


def test_zone_candidates_full_most_specific_first():
    assert _rewards_zone_candidates(
        {"country": " fr ", "state": "Martinique", "city": "Fort-de-France"}
    ) == ["FR|Martinique|Fort-de-France", "FR|Martinique", "FR"]


def test_zone_candidates_city_without_state_ignored():
    # city only meaningful with a state (mirrors original logic)
    assert _rewards_zone_candidates({"country": "FR", "city": "Fort-de-France"}) == ["FR"]


# ---- _merge_rewards_settings --------------------------------------------------

def test_merge_none_returns_defaults():
    assert _merge_rewards_settings(None) is DEFAULT_REWARDS_CONFIG
    assert _merge_rewards_settings({}) is DEFAULT_REWARDS_CONFIG


def test_merge_partial_keeps_custom_and_fills_defaults():
    custom_points = {"initial_points": 999}
    out = _merge_rewards_settings({"points": custom_points})
    assert out["points"] == custom_points
    # other keys fall back to defaults
    assert out["guarantees"] == DEFAULT_REWARDS_CONFIG["guarantees"]
    assert out["regard_vehicles"] == DEFAULT_REWARDS_CONFIG["regard_vehicles"]
    assert out["sub_category_bonus"] == DEFAULT_REWARDS_CONFIG["sub_category_bonus"]


def test_merge_falsy_field_falls_back():
    out = _merge_rewards_settings({"points": None, "guarantees": []})
    assert out["points"] == DEFAULT_REWARDS_CONFIG["points"]
    assert out["guarantees"] == DEFAULT_REWARDS_CONFIG["guarantees"]


# ---- _dispatch_action ---------------------------------------------------------

CFG = {
    "auto_cancel_after_seconds": 300,
    "second_escalation_seconds": 120,
    "first_escalation_seconds": 60,
}


def test_dispatch_none_when_young():
    assert _dispatch_action(30, 0, CFG) == "none"


def test_dispatch_first_escalation():
    assert _dispatch_action(70, 0, CFG) == "escalate_1"
    # already at tier 1 → nothing more for the first window
    assert _dispatch_action(70, 1, CFG) == "none"


def test_dispatch_second_escalation():
    assert _dispatch_action(130, 0, CFG) == "escalate_2"
    assert _dispatch_action(130, 1, CFG) == "escalate_2"
    assert _dispatch_action(130, 2, CFG) == "none"


def test_dispatch_cancel():
    assert _dispatch_action(350, 0, CFG) == "cancel"


def test_dispatch_cancel_skipped_for_tier_minus1():
    # tier == -1 means "no auto cancel"; falls through to escalation logic
    assert _dispatch_action(350, -1, CFG) == "escalate_2"
