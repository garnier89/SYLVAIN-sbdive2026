"""Tests du calcul de durée/prix de la location moto self-drive (routes/moto_rental)."""
from routes.moto_rental import _compute_duration, _price_for


def test_compute_duration():
    d, rem, tot = _compute_duration("2026-06-20T09:00", "2026-06-22T09:00")
    assert d == 2 and rem == 0 and tot == 48.0
    d, rem, tot = _compute_duration("2026-06-20T09:00", "2026-06-20T14:00")
    assert d == 0 and round(rem) == 5 and tot == 5.0
    # période invalide
    assert _compute_duration("2026-06-22T09:00", "2026-06-20T09:00") == (0, 0, 0.0)
    assert _compute_duration(None, "2026-06-20T09:00") == (0, 0, 0.0)


def test_price_for():
    moto = {"price_per_day": 35, "price_per_hour": 6, "deposit_amount": 400}
    # 2 jours pleins
    price, days, rem, tot = _price_for(moto, "2026-06-20T09:00", "2026-06-22T09:00")
    assert price == 70.0 and days == 2
    # 5h -> 5*6=30 (sous le tarif jour 35)
    price, days, rem, tot = _price_for(moto, "2026-06-20T09:00", "2026-06-20T14:00")
    assert price == 30.0 and days == 0
    # 1 jour + 10h -> 10h*6=60 plafonné au tarif jour 35 -> 35+35=70
    price, days, rem, tot = _price_for(moto, "2026-06-20T09:00", "2026-06-21T19:00")
    assert days == 1 and price == 70.0
