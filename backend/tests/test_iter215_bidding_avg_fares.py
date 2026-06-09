"""Enchère: average accepted fare per vehicle (fair-price hint)."""
import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


def _customer():
    import uuid
    s = requests.Session()
    s.post(f"{API}/api/auth/register", json={"email": f"avg_{uuid.uuid4().hex[:8]}@demo.sb", "password": "Buyer2026!", "name": "Avg"}, timeout=30)
    return s


def test_bidding_avg_fares_shape():
    s = _customer()
    r = s.get(f"{API}/api/rides/bidding/avg-fares", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "fares" in d and isinstance(d["fares"], dict)
    assert "counts" in d and d["sample_days"] == 30
    # all fares are positive numbers keyed by lowercase vehicle slug
    for slug, val in d["fares"].items():
        assert slug == slug.lower()
        assert isinstance(val, (int, float)) and val > 0


def test_bidding_avg_fares_requires_auth():
    r = requests.get(f"{API}/api/rides/bidding/avg-fares", timeout=30)
    assert r.status_code in (401, 403)
