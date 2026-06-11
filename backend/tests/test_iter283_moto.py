"""Tests de l'isolation deux-roues au dispatch (routes/auto_dispatch._vehicle_compatible)
et de la résolution des forfaits moto (location)."""
from routes.auto_dispatch import _vehicle_compatible, _is_two_wheeler


def test_is_two_wheeler():
    assert _is_two_wheeler("moto") is True
    assert _is_two_wheeler("Moto") is True
    assert _is_two_wheeler("tuktuk") is True
    assert _is_two_wheeler("confort") is False
    assert _is_two_wheeler("") is False
    assert _is_two_wheeler(None) is False


def test_vehicle_compatibility_moto_isolation():
    # moto ride -> moto driver OK, car driver NON
    assert _vehicle_compatible("moto", "moto") is True
    assert _vehicle_compatible("moto", "confort") is False
    # car ride -> car driver OK, moto driver NON
    assert _vehicle_compatible("confort", "luxe") is True
    assert _vehicle_compatible("sb", "moto") is False
    # car-to-car reste flexible (types différents acceptés)
    assert _vehicle_compatible("sb", "van") is True
    # ride sans vehicle_type -> pas de filtre
    assert _vehicle_compatible(None, "moto") is True
