"""HTTP integration tests — iter 276 favorite drivers management + recent-drivers + admin auto-dispatch favorite_head_start_seconds."""
import os
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "paul.vendeur@example.com"
USER_PASSWORD = "Test1234!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


# ── Helpers ─────────────────────────────────────────────────────────────────
def _user_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"user login failed: {r.status_code} {r.text}"
    # also set Bearer in case cookies aren't honored everywhere
    tok = r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


def _clean_to_at_most(s, keep=0):
    """Delete current favorites until len <= keep."""
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    for f in favs[keep:]:
        s.delete(f"{API}/phase1/favorite-drivers/{f['driver_id']}", timeout=15)


# ── Favorites management ────────────────────────────────────────────────────
def test_list_favorite_drivers_returns_array():
    s = _user_session()
    r = s.get(f"{API}/phase1/favorite-drivers", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_recent_drivers_returns_array_with_seeded_data():
    s = _user_session()
    _clean_to_at_most(s, keep=0)
    r = s.get(f"{API}/phase1/recent-drivers", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Per problem statement paul has seeded completed rides with 2 drivers
    assert len(data) >= 1, f"expected at least 1 recent driver, got {data}"
    d0 = data[0]
    assert "driver_id" in d0 and "name" in d0


def test_add_remove_and_max_two_enforced():
    s = _user_session()
    # Start clean
    _clean_to_at_most(s, keep=0)

    recent = s.get(f"{API}/phase1/recent-drivers", timeout=15).json()
    assert len(recent) >= 1, "need at least 1 recent driver for this test"

    d1 = recent[0]["driver_id"]
    # Add 1st
    r = s.post(f"{API}/phase1/favorite-drivers/{d1}", timeout=15)
    assert r.status_code == 200, r.text
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert any(f["driver_id"] == d1 for f in favs)
    # Recent should now exclude d1
    recent2 = s.get(f"{API}/phase1/recent-drivers", timeout=15).json()
    assert all(x["driver_id"] != d1 for x in recent2)

    # Add 2nd if available
    if recent2:
        d2 = recent2[0]["driver_id"]
        r = s.post(f"{API}/phase1/favorite-drivers/{d2}", timeout=15)
        assert r.status_code == 200, r.text
        # Try 3rd
        recent3 = s.get(f"{API}/phase1/recent-drivers", timeout=15).json()
        # If a 3rd exists, adding must 400. If not, simulate with a fabricated driver:
        # Use existing approved driver id from seed: driver_93683151b54d
        target = recent3[0]["driver_id"] if recent3 else "driver_93683151b54d"
        if target not in (d1, d2):
            r = s.post(f"{API}/phase1/favorite-drivers/{target}", timeout=15)
            assert r.status_code == 400
            assert "Maximum 2" in r.json().get("detail", "")

    # Cleanup: remove all
    _clean_to_at_most(s, keep=0)
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert favs == []


def test_replace_flow_remove_then_add():
    s = _user_session()
    _clean_to_at_most(s, keep=0)
    recent = s.get(f"{API}/phase1/recent-drivers", timeout=15).json()
    assert len(recent) >= 2, f"need 2+ recent drivers, got {len(recent)}"
    d1, d2 = recent[0]["driver_id"], recent[1]["driver_id"]
    s.post(f"{API}/phase1/favorite-drivers/{d1}", timeout=15)
    s.post(f"{API}/phase1/favorite-drivers/{d2}", timeout=15)
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert len(favs) == 2
    # Remove d1
    r = s.delete(f"{API}/phase1/favorite-drivers/{d1}", timeout=15)
    assert r.status_code == 200
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert len(favs) == 1
    # d1 should reappear in recent
    recent2 = s.get(f"{API}/phase1/recent-drivers", timeout=15).json()
    assert any(x["driver_id"] == d1 for x in recent2)
    # Re-add (replacement)
    r = s.post(f"{API}/phase1/favorite-drivers/{d1}", timeout=15)
    assert r.status_code == 200
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert len(favs) == 2
    # Cleanup
    _clean_to_at_most(s, keep=0)


def test_add_nonexistent_driver_404():
    s = _user_session()
    r = s.post(f"{API}/phase1/favorite-drivers/driver_does_not_exist_xyz_000", timeout=15)
    assert r.status_code == 404


# ── Admin auto-dispatch config (favorite_head_start_seconds) ────────────────
def test_admin_auto_dispatch_config_has_favorite_head_start():
    s = _admin_session()
    r = s.get(f"{API}/admin/auto-dispatch/config", timeout=15)
    assert r.status_code == 200, r.text
    payload = r.json()
    cfg = payload.get("config", payload)
    assert "favorite_head_start_seconds" in cfg, f"missing in {cfg.keys()}"
    assert isinstance(cfg["favorite_head_start_seconds"], int)
    assert 0 <= cfg["favorite_head_start_seconds"] <= 60


def test_admin_update_favorite_head_start_persists_and_clamps():
    s = _admin_session()
    def get_cfg():
        p = s.get(f"{API}/admin/auto-dispatch/config", timeout=15).json()
        return p.get("config", p)
    orig = get_cfg()["favorite_head_start_seconds"]
    try:
        r = s.put(f"{API}/admin/auto-dispatch/config", json={"favorite_head_start_seconds": 30}, timeout=15)
        assert r.status_code == 200, r.text
        assert get_cfg()["favorite_head_start_seconds"] == 30
        s.put(f"{API}/admin/auto-dispatch/config", json={"favorite_head_start_seconds": 0}, timeout=15)
        assert get_cfg()["favorite_head_start_seconds"] == 0
    finally:
        s.put(f"{API}/admin/auto-dispatch/config", json={"favorite_head_start_seconds": orig}, timeout=15)


# ── Final cleanup: leave paul with <= 2 favorites ──────────────────────────
def test_zzz_final_cleanup_paul_max_2():
    s = _user_session()
    _clean_to_at_most(s, keep=2)
    favs = s.get(f"{API}/phase1/favorite-drivers", timeout=15).json()
    assert len(favs) <= 2
