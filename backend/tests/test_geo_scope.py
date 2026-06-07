"""Geo-scoping unit tests for admin configurations (promos/vouchers visible per zone)."""
from core.geo_scope import (
    resolve_zone_from_text, scope_matches, clean_scope, is_global_scope,
    list_states, list_cities,
)


def test_resolve_martinique_and_paris():
    mq = resolve_zone_from_text("Aeroport Aime Cesaire, Le Lamentin, Martinique")
    assert mq and mq["country"] == "MQ" and mq["city"] == "Le Lamentin"
    paris = resolve_zone_from_text("Tour Eiffel, Paris, France")
    assert paris and paris["country"] == "FR" and paris["city"] == "Paris"


def test_resolve_unknown_returns_none():
    assert resolve_zone_from_text("") is None
    assert resolve_zone_from_text("Somewhere unknown 12345") is None


def test_global_scope_matches_everything():
    g = clean_scope({})
    assert is_global_scope(g)
    assert scope_matches(g, None) is True
    assert scope_matches(g, {"country": "FR"}) is True


def test_country_scope_matches_only_that_country():
    mq = clean_scope({"country": "MQ"})
    assert scope_matches(mq, resolve_zone_from_text("Le Robert, Martinique")) is True
    assert scope_matches(mq, resolve_zone_from_text("Paris, France")) is False
    # Unknown zone never matches a non-global scope
    assert scope_matches(mq, None) is False


def test_city_scope_is_specific():
    fdf = clean_scope({"country": "MQ", "state": "Martinique", "city": "Fort-de-France"})
    assert scope_matches(fdf, resolve_zone_from_text("Fort-de-France, Martinique")) is True
    assert scope_matches(fdf, resolve_zone_from_text("Le Lamentin, Martinique")) is False


def test_clean_scope_drops_state_city_without_country():
    s = clean_scope({"state": "Martinique", "city": "Ducos"})
    assert s == {"country": "", "state": "", "city": ""}


def test_curated_lists():
    assert "Martinique" in list_states("MQ")
    cities = list_cities("MQ")
    assert "Fort-de-France" in cities and "Le Lamentin" in cities
