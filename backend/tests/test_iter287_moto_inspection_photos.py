"""Tests de l'helper de nettoyage des photos d'état des lieux (routes/moto_rental)."""
from routes.moto_rental import _clean_photos, MIN_INSPECTION_PHOTOS


def test_min_constant():
    assert MIN_INSPECTION_PHOTOS == 2


def test_clean_photos_filters_and_trims():
    # garde les URLs non vides, ignore le vide / non-string
    out = _clean_photos(["https://a/1.jpg", "  ", "", None, 123, "https://a/2.jpg"])
    assert out == ["https://a/1.jpg", "https://a/2.jpg"]


def test_clean_photos_limit():
    urls = [f"https://a/{i}.jpg" for i in range(20)]
    out = _clean_photos(urls, limit=8)
    assert len(out) == 8


def test_clean_photos_non_list():
    assert _clean_photos(None) == []
    assert _clean_photos("nope") == []
    assert _clean_photos({}) == []
