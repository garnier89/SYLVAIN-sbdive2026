"""Tests des helpers du centre SOS SB Access (routes/sb_access)."""
from routes.sb_access import _maps_link, _sos_share_message


def test_maps_link():
    assert _maps_link(48.8566, 2.3522) == "https://maps.google.com/?q=48.8566,2.3522"
    assert _maps_link(None, 2.0) == ""
    assert _maps_link(1.0, None) == ""


def test_sos_share_message_with_and_without_location():
    m = _sos_share_message("Paul Vendeur", 48.8566, 2.3522)
    assert "Paul Vendeur" in m and "SOS" in m
    assert "maps.google.com/?q=48.8566,2.3522" in m
    assert "SB Drive Access" in m

    m2 = _sos_share_message("", None, None)
    assert "usager SB Access" in m2
    assert "Position en direct" not in m2
