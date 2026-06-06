"""Tests for driver sub-category (Particulier / VTC / Taxi) ↔ ride gamme gating.

Covers the pure gating helpers and the DB-backed restricted-gammes map used by
the dispatch filters (list_rides / get_available_rides / accept_ride).
"""
import asyncio
import pytest

from routes.rides import (
    gamme_restricted_subs,
    driver_sub_allowed,
    restricted_gammes_map,
    ALL_TAXI_SUBS,
)


# ── Pure helper: gamme_restricted_subs ───────────────────────────────────
def test_open_gamme_all_three_subs_is_unrestricted():
    assert gamme_restricted_subs({"allowed_taxi_subs": ["particulier", "vtc", "taxi"]}) is None


def test_missing_or_empty_field_is_unrestricted():
    assert gamme_restricted_subs({}) is None
    assert gamme_restricted_subs({"allowed_taxi_subs": []}) is None
    assert gamme_restricted_subs(None) is None


def test_vtc_only_gamme_is_restricted():
    assert gamme_restricted_subs({"allowed_taxi_subs": ["vtc"]}) == {"vtc"}


def test_taxi_only_gamme_is_restricted():
    assert gamme_restricted_subs({"allowed_taxi_subs": ["Taxi"]}) == {"taxi"}  # case-insensitive


def test_two_subs_subset_is_restricted():
    assert gamme_restricted_subs({"allowed_taxi_subs": ["vtc", "taxi"]}) == {"vtc", "taxi"}


# ── Pure helper: driver_sub_allowed ──────────────────────────────────────
def test_unrestricted_allows_any_driver_even_none():
    assert driver_sub_allowed(None, None) is True
    assert driver_sub_allowed("particulier", None) is True


def test_restricted_blocks_wrong_sub():
    assert driver_sub_allowed("particulier", {"vtc"}) is False
    assert driver_sub_allowed(None, {"vtc"}) is False


def test_restricted_allows_matching_sub():
    assert driver_sub_allowed("vtc", {"vtc"}) is True
    assert driver_sub_allowed("VTC", {"vtc"}) is True  # case-insensitive


def test_all_subs_constant():
    assert ALL_TAXI_SUBS == {"particulier", "vtc", "taxi"}


# ── DB-backed: restricted_gammes_map reflects seeded VTC/Taxi gammes ──────
def test_restricted_gammes_map_contains_vtc_and_taxi():
    m = asyncio.get_event_loop().run_until_complete(restricted_gammes_map())
    assert m.get("vtc") == {"vtc"}
    assert m.get("taxi") == {"taxi"}
    # Open gammes must NOT appear in the restricted map
    assert "sb" not in m
    assert "confort" not in m


# ── End-to-end gating decision (combines map + driver sub) ────────────────
@pytest.mark.parametrize("driver_sub,gamme,expected", [
    ("particulier", "sb", True),     # SB open to all
    ("vtc", "sb", True),
    ("taxi", "sb", True),
    ("particulier", "vtc", False),   # VTC gamme reserved for VTC drivers
    ("vtc", "vtc", True),
    ("taxi", "vtc", False),          # a Taxi driver cannot serve a VTC gamme
    ("particulier", "taxi", False),  # Taxi gamme reserved for licensed Taxi drivers
    ("vtc", "taxi", False),
    ("taxi", "taxi", True),
])
def test_dispatch_decision(driver_sub, gamme, expected):
    m = asyncio.get_event_loop().run_until_complete(restricted_gammes_map())
    assert driver_sub_allowed(driver_sub, m.get(gamme)) is expected
