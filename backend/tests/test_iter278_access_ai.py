"""Tests unitaires du moteur d'IA d'attribution PMR (core/access_ai)."""
from core.access_ai import (
    _haversine_km, _need_categories, _needs_match_score, _ai_config, DEFAULT_AI_CONFIG,
)


def test_haversine_known_distance():
    # Paris ↔ ~ proche : Notre-Dame → Tour Eiffel ≈ 4 km
    d = _haversine_km(48.8530, 2.3499, 48.8584, 2.2945)
    assert 3.5 < d < 4.5
    # coords manquantes → None
    assert _haversine_km(None, 2.0, 48.0, 2.0) is None


def test_need_categories_mapping():
    cats = _need_categories(["wheelchair_manual", "blind", "deaf", "enhanced_assistance"])
    assert cats == {"wheelchair", "visual", "auditory", "cognitive"}
    assert _need_categories([]) == set()


def test_needs_match_full_partial_none():
    trainings = ["Manipulation fauteuil roulant PMR", "Langue des signes LSF"]
    # wheelchair + auditory couverts → 2/2
    score, covered = _needs_match_score(["wheelchair_manual", "deaf"], trainings)
    assert score == 1.0 and set(covered) == {"wheelchair", "auditory"}
    # wheelchair couvert, visual non → 1/2
    score, covered = _needs_match_score(["wheelchair_manual", "blind"], trainings)
    assert score == 0.5 and covered == ["wheelchair"]
    # besoin non couvert → 0
    score, covered = _needs_match_score(["blind"], trainings)
    assert score == 0.0 and covered == []


def test_needs_match_no_needs_is_neutral():
    score, covered = _needs_match_score([], ["quoi que ce soit"])
    assert score == 1.0 and covered == []


def test_ai_config_merge_defaults():
    cfg = _ai_config({"ai_allocation": {"weight_distance": 0.9}})
    assert cfg["weight_distance"] == 0.9
    assert cfg["weight_rating"] == DEFAULT_AI_CONFIG["weight_rating"]
    assert cfg["enabled"] is True
    # absence de config → tous les défauts
    assert _ai_config({}) == DEFAULT_AI_CONFIG
