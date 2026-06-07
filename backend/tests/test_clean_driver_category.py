"""
Characterization tests for routes.admin._clean_driver_category.

Captures the exact current behaviour BEFORE refactoring so the
complexity reduction is provably behaviour-preserving.
Pure sync function (no DB / no async) — fast to test in isolation.
"""
import pytest
from fastapi import HTTPException

from routes.admin import _clean_driver_category


def test_valid_taxi_car_keeps_taxi_sub():
    out = _clean_driver_category({
        "service": "Taxi", "vehicle_class": "Car", "taxi_sub": "vtc",
        "label": "  VTC Car ", "documents": [{"key": "permis", "label": "Permis B"}],
        "order": "3", "active": True,
    })
    assert out == {
        "service": "taxi", "vehicle_class": "car", "taxi_sub": "vtc",
        "label": "VTC Car", "documents": [{"key": "permis", "label": "Permis B"}],
        "order": 3, "active": True,
    }


def test_taxi_sub_cleared_when_not_taxi_car():
    # moto taxi → taxi_sub forced None
    out = _clean_driver_category({
        "service": "taxi", "vehicle_class": "moto", "taxi_sub": "vtc",
        "label": "Moto", "documents": [{"key": "k", "label": "L"}],
    })
    assert out["taxi_sub"] is None
    # courier car → taxi_sub forced None
    out2 = _clean_driver_category({
        "service": "courier", "vehicle_class": "car", "taxi_sub": "vtc",
        "label": "Courier", "documents": [{"key": "k", "label": "L"}],
    })
    assert out2["taxi_sub"] is None


@pytest.mark.parametrize("sentinel", ["", "none", "null"])
def test_taxi_sub_sentinels_become_none(sentinel):
    out = _clean_driver_category({
        "service": "taxi", "vehicle_class": "car", "taxi_sub": sentinel,
        "label": "Taxi", "documents": [{"key": "k", "label": "L"}],
    })
    assert out["taxi_sub"] is None


def test_invalid_service_raises_400():
    with pytest.raises(HTTPException) as ei:
        _clean_driver_category({"service": "boat", "vehicle_class": "car",
                                "label": "X", "documents": [{"key": "k", "label": "L"}]})
    assert ei.value.status_code == 400


def test_invalid_vehicle_class_raises_400():
    with pytest.raises(HTTPException) as ei:
        _clean_driver_category({"service": "taxi", "vehicle_class": "truck",
                                "label": "X", "documents": [{"key": "k", "label": "L"}]})
    assert ei.value.status_code == 400


def test_invalid_taxi_sub_raises_400():
    with pytest.raises(HTTPException) as ei:
        _clean_driver_category({"service": "taxi", "vehicle_class": "car", "taxi_sub": "bogus",
                                "label": "X", "documents": [{"key": "k", "label": "L"}]})
    assert ei.value.status_code == 400


def test_missing_label_raises_400():
    with pytest.raises(HTTPException) as ei:
        _clean_driver_category({"service": "taxi", "vehicle_class": "car",
                                "label": "   ", "documents": [{"key": "k", "label": "L"}]})
    assert ei.value.status_code == 400


def test_documents_dedup_and_strip():
    out = _clean_driver_category({
        "service": "taxi", "vehicle_class": "car", "label": "X",
        "documents": [
            {"key": " permis ", "label": " Permis "},
            {"key": "permis", "label": "Dup"},          # duplicate key → skipped
            {"key": "carte", "label": ""},               # empty label → skipped
            {"key": "", "label": "NoKey"},               # empty key → skipped
            {"key": "assurance", "label": "Assurance"},
        ],
    })
    assert out["documents"] == [
        {"key": "permis", "label": "Permis"},
        {"key": "assurance", "label": "Assurance"},
    ]


def test_no_valid_documents_raises_400():
    with pytest.raises(HTTPException) as ei:
        _clean_driver_category({"service": "taxi", "vehicle_class": "car", "label": "X",
                                "documents": [{"key": "", "label": ""}]})
    assert ei.value.status_code == 400


def test_order_invalid_falls_back_to_99():
    out = _clean_driver_category({
        "service": "taxi", "vehicle_class": "car", "label": "X",
        "documents": [{"key": "k", "label": "L"}], "order": "abc",
    })
    assert out["order"] == 99


def test_active_coerced_to_bool():
    out = _clean_driver_category({
        "service": "taxi", "vehicle_class": "car", "label": "X",
        "documents": [{"key": "k", "label": "L"}], "active": 0,
    })
    assert out["active"] is False


def test_existing_merge_when_body_partial():
    existing = {
        "service": "taxi", "vehicle_class": "car", "taxi_sub": "vtc",
        "label": "Old", "documents": [{"key": "k", "label": "L"}],
        "order": 5, "active": True,
    }
    # body only overrides the label; rest inherited from existing
    out = _clean_driver_category({"label": "New"}, existing)
    assert out["service"] == "taxi"
    assert out["vehicle_class"] == "car"
    assert out["taxi_sub"] == "vtc"
    assert out["label"] == "New"
    assert out["order"] == 5
    assert out["active"] is True
