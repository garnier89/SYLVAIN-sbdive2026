"""Backend tests for SB Dépannage (towing) refonte — iter 392."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
CREDS = {"email": "famtester@demo.sb", "password": "FamTest123!"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=CREDS, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def ensure_wallet(auth_headers):
    """Ensure wallet has enough credit (>=200€) for completion tests."""
    from pymongo import MongoClient
    mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mongo[os.environ.get("DB_NAME", "test_database")]
    me = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=20).json()
    uid = me.get("id")
    db.wallets.update_one({"user_id": uid}, {"$set": {"balance": 500.0, "user_id": uid}}, upsert=True)
    mongo.close()
    return uid


# ── Problem catalog ─────────────────────────────────────────────────────────
def test_problem_types():
    r = requests.get(f"{API}/towing/problem-types", timeout=10)
    assert r.status_code == 200
    data = r.json()
    ids = [p["id"] for p in data["problem_types"]]
    for expected in ["battery", "tire", "fuel", "lockout", "nostart", "towing", "accident"]:
        assert expected in ids, f"Missing problem type: {expected}"
    assert "night_surcharge_pct" in data
    assert "is_night" in data
    assert isinstance(data["is_night"], bool)


# ── Estimate ────────────────────────────────────────────────────────────────
def test_estimate_towing_10km():
    r = requests.post(f"{API}/towing/estimate", json={"problem_type": "towing", "distance_km": 10}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    # base 90 + 2.5*10 = 115; +30% si nuit
    if data["is_night"]:
        assert data["total"] == round(115 * 1.3, 2)
    else:
        assert data["total"] == 115.0
    assert data["base_fee"] == 90.0
    assert data["distance_fee"] == 25.0


def test_estimate_battery_no_distance():
    r = requests.post(f"{API}/towing/estimate", json={"problem_type": "battery", "distance_km": 10}, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["distance_fee"] == 0.0
    base_expected = 50.0
    if data["is_night"]:
        assert data["total"] == round(base_expected * 1.3, 2)
    else:
        assert data["total"] == base_expected


def test_estimate_invalid_type():
    r = requests.post(f"{API}/towing/estimate", json={"problem_type": "invalid", "distance_km": 5}, timeout=10)
    assert r.status_code == 400


# ── Create request ───────────────────────────────────────────────────────────
def test_create_request_missing_pickup(auth_headers, ensure_wallet):
    r = requests.post(f"{API}/towing/requests", headers=auth_headers, json={"problem_type": "battery"}, timeout=10)
    assert r.status_code == 400


def test_create_request_invalid_type(auth_headers, ensure_wallet):
    r = requests.post(f"{API}/towing/requests", headers=auth_headers,
                      json={"problem_type": "xxx", "pickup_lat": 48.85, "pickup_lng": 2.35}, timeout=10)
    assert r.status_code == 400


def test_create_request_battery_assigns_operator(auth_headers, ensure_wallet):
    payload = {"problem_type": "battery", "pickup_lat": 48.85, "pickup_lng": 2.35,
               "pickup_address": "Paris", "vehicle_make": "Renault", "vehicle_model": "Clio",
               "vehicle_plate": "AA-001-BB", "payment_method": "sbpay"}
    r = requests.post(f"{API}/towing/requests", headers=auth_headers, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "searching"
    assert data["payment_status"] == "pending"
    op = data["operator"]
    for f in ["name", "company", "rating", "plate", "truck", "eta_minutes"]:
        assert f in op
    assert "_id" not in data


# ── Live progression ────────────────────────────────────────────────────────
def test_live_progression(auth_headers, ensure_wallet):
    payload = {"problem_type": "battery", "pickup_lat": 48.85, "pickup_lng": 2.35,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=auth_headers, json=payload, timeout=10).json()
    req_id = create["id"]

    # Immediately: should be 'searching'
    r1 = requests.get(f"{API}/towing/requests/{req_id}", headers=auth_headers, timeout=10).json()
    assert r1["live"]["status"] in ("searching", "en_route")

    # After ~7s should be en_route with a position
    time.sleep(7)
    r2 = requests.get(f"{API}/towing/requests/{req_id}", headers=auth_headers, timeout=10).json()
    assert r2["live"]["status"] in ("en_route", "arrived")
    if r2["live"]["status"] == "en_route":
        assert r2["live"]["operator_position"] is not None
        assert r2["live"]["progress"] > 0


# ── Complete with debit ─────────────────────────────────────────────────────
def _bal(auth_headers):
    return requests.get(f"{API}/wallet", headers=auth_headers, timeout=10).json().get("balance", 0)


def test_complete_debits_wallet(auth_headers, ensure_wallet):
    bal0 = _bal(auth_headers)

    payload = {"problem_type": "battery", "pickup_lat": 48.85, "pickup_lng": 2.35,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=auth_headers, json=payload, timeout=10).json()
    req_id = create["id"]
    total = create["total_price"]

    # No debit yet on creation
    bal_after_create = _bal(auth_headers)
    assert round(bal_after_create, 2) == round(bal0, 2), f"Wallet debited on create ({bal0} -> {bal_after_create})"

    # Complete
    r = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=auth_headers, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert round(data["total"], 2) == round(total, 2)

    bal1 = _bal(auth_headers)
    # Net debit = total - cashback (~2%). Accept range.
    net_debit = round(bal0 - bal1, 2)
    assert total - 5 <= net_debit <= total, f"Expected net debit ~{total} (minus cashback), got {net_debit}"

    # Idempotency
    r2 = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=auth_headers, timeout=10)
    assert r2.status_code == 200
    bal2 = _bal(auth_headers)
    assert round(bal1, 2) == round(bal2, 2), "Double debit detected"


def test_complete_insufficient_balance(auth_headers, ensure_wallet):
    from pymongo import MongoClient
    mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbn = mongo[os.environ.get("DB_NAME", "test_database")]

    payload = {"problem_type": "battery", "pickup_lat": 48.85, "pickup_lng": 2.35,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=auth_headers, json=payload, timeout=10).json()
    req_id = create["id"]

    dbn.wallets.update_one({"user_id": ensure_wallet}, {"$set": {"balance": 0.1}})
    r = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=auth_headers, timeout=10)
    assert r.status_code == 400
    assert "insuffisant" in r.text.lower() or "insufficient" in r.text.lower()

    # Restore
    dbn.wallets.update_one({"user_id": ensure_wallet}, {"$set": {"balance": 500.0}})
    mongo.close()


# ── Cancel + history ────────────────────────────────────────────────────────
def test_cancel_and_history(auth_headers, ensure_wallet):
    payload = {"problem_type": "battery", "pickup_lat": 48.85, "pickup_lng": 2.35,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=auth_headers, json=payload, timeout=10).json()
    req_id = create["id"]
    r = requests.post(f"{API}/towing/requests/{req_id}/cancel", headers=auth_headers, timeout=10)
    assert r.status_code == 200

    hist = requests.get(f"{API}/towing/requests", headers=auth_headers, timeout=10).json()
    assert isinstance(hist, list)
    found = [h for h in hist if h["id"] == req_id]
    assert len(found) == 1
    assert found[0]["status"] == "cancelled"
