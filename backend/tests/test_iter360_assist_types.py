"""Iteration 360 — SB Access editable assist types (admin CRUD + public list)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read frontend .env directly as fallback
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids


# -------- Public --------
def test_public_list_returns_seed_six():
    r = requests.get(f"{BASE_URL}/api/assist-types", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "types" in data and isinstance(data["types"], list)
    keys = [t["key"] for t in data["types"]]
    for required in ["wheelchair", "pmr", "access", "elderly", "medical", "luggage"]:
        assert required in keys, f"missing seed key {required}, got {keys}"
    # Validate shape: only key and label
    for t in data["types"]:
        assert "key" in t and "label" in t


# -------- Admin gating --------
def test_admin_endpoints_require_auth():
    r = requests.get(f"{BASE_URL}/api/admin/assist-types", timeout=15)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# -------- Admin CRUD --------
def test_admin_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/admin/assist-types", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "types" in data and isinstance(data["types"], list)
    assert data.get("count", 0) >= 6


def test_admin_create_label_only_autokey(admin_session, created_ids):
    payload = {"label": "TEST_AssistType_AutoKey"}
    r = admin_session.post(f"{BASE_URL}/api/admin/assist-types", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["label"] == "TEST_AssistType_AutoKey"
    assert doc["key"] == "test_assisttype_autokey"
    assert doc["active"] is True
    assert "id" in doc and doc["id"].startswith("assist_")
    created_ids.append(doc["id"])

    # GET public to verify it shows up
    r2 = requests.get(f"{BASE_URL}/api/assist-types", timeout=15)
    keys = [t["key"] for t in r2.json()["types"]]
    assert "test_assisttype_autokey" in keys


def test_admin_update(admin_session, created_ids):
    assert created_ids, "needs prior create"
    type_id = created_ids[0]
    r = admin_session.put(
        f"{BASE_URL}/api/admin/assist-types/{type_id}",
        json={"label": "TEST_AssistType_Updated"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # Verify persisted
    r2 = admin_session.get(f"{BASE_URL}/api/admin/assist-types", timeout=15)
    found = [t for t in r2.json()["types"] if t["id"] == type_id]
    assert found and found[0]["label"] == "TEST_AssistType_Updated"


def test_admin_toggle_hides_from_public(admin_session, created_ids):
    type_id = created_ids[0]
    r = admin_session.patch(f"{BASE_URL}/api/admin/assist-types/{type_id}/toggle", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["active"] is False

    # Public must no longer expose this key
    pub = requests.get(f"{BASE_URL}/api/assist-types", timeout=15).json()["types"]
    keys = [t["key"] for t in pub]
    assert "test_assisttype_updated" not in keys
    assert "test_assisttype_autokey" not in keys


def test_admin_delete(admin_session, created_ids):
    type_id = created_ids[0]
    r = admin_session.delete(f"{BASE_URL}/api/admin/assist-types/{type_id}", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

    # Confirm gone
    r2 = admin_session.get(f"{BASE_URL}/api/admin/assist-types", timeout=15)
    ids = [t["id"] for t in r2.json()["types"]]
    assert type_id not in ids


def test_admin_create_missing_label_400(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/admin/assist-types", json={"label": "  "}, timeout=15)
    assert r.status_code == 400


def test_admin_update_404(admin_session):
    r = admin_session.put(
        f"{BASE_URL}/api/admin/assist-types/assist_does_not_exist",
        json={"label": "X"},
        timeout=15,
    )
    assert r.status_code == 404


def test_cleanup_any_test_data(admin_session):
    """Safety net: remove any TEST_ prefixed leftovers."""
    r = admin_session.get(f"{BASE_URL}/api/admin/assist-types", timeout=15)
    for t in r.json().get("types", []):
        if (t.get("label") or "").startswith("TEST_"):
            admin_session.delete(f"{BASE_URL}/api/admin/assist-types/{t['id']}", timeout=15)
