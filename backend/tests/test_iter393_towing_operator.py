"""Backend tests for SB Dépannage — REAL operator partners (iter 393).

Covers:
- /api/towing/operator/register, /me, /online, /feed, /jobs
- /api/towing/requests/{id}/accept (atomic claim, 409 on 2nd accept)
- /api/towing/requests/{id}/operator-ping, /operator-status
- End-to-end real flow: client create → operator feed → accept → ping → arrived
  → client complete (wallet debit) → operator stats (completed +1, earnings +montant)
- Fallback simulated assignment when no real operator accepts within ~18s
"""
import os
import time
import requests
import pytest
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
CLIENT = {"email": "famtester@demo.sb", "password": "FamTest123!"}
OPERATOR = {"email": "freeuser@demo.sb", "password": "FreeUser123!"}

# Two distinct pickup points (close to operator's "last position")
OP_LAT, OP_LNG = 48.860, 2.345
PICKUP_LAT, PICKUP_LNG = 48.873, 2.357  # ~1.7km away


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed: {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def client_h():
    t = _login(CLIENT)
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def op_h():
    t = _login(OPERATOR)
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ensure_wallet(client_h):
    from pymongo import MongoClient
    mongo = MongoClient(os.environ.get("MONGO_URL"))
    db = mongo[os.environ.get("DB_NAME")]
    me = requests.get(f"{API}/auth/me", headers=client_h, timeout=20).json()
    uid = me.get("id")
    db.wallets.update_one({"user_id": uid}, {"$set": {"balance": 500.0, "user_id": uid}}, upsert=True)
    mongo.close()
    return uid


# ── 1) Operator register / me / online ─────────────────────────────────────
def test_operator_register_idempotent(op_h):
    payload = {"company": "Dépann Test", "phone": "+33600000000",
               "plate": "TT-393-XX", "truck_type": "Plateau", "city": "Paris"}
    r = requests.post(f"{API}/towing/operator/register", headers=op_h, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["company"] == "Dépann Test"
    assert "_id" not in d


def test_operator_me_returns_stats(op_h):
    r = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["registered"] is True
    assert "operator" in d and "stats" in d
    for k in ("completed", "active", "earnings"):
        assert k in d["stats"]


def test_operator_online_requires_registration(client_h):
    # famtester is NOT a registered operator → should 400
    r = requests.post(f"{API}/towing/operator/online", headers=client_h,
                      json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    assert r.status_code == 400


def test_operator_online_toggle(op_h):
    r = requests.post(f"{API}/towing/operator/online", headers=op_h,
                      json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    assert r.status_code == 200
    assert r.json()["is_online"] is True


# ── 2) Feed + accept (atomic claim, 409 on 2nd) ─────────────────────────────
def test_feed_and_accept_atomic(client_h, op_h, ensure_wallet):
    # Ensure online with known position
    requests.post(f"{API}/towing/operator/online", headers=op_h,
                  json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)

    # Client creates a request
    payload = {"problem_type": "battery", "pickup_lat": PICKUP_LAT, "pickup_lng": PICKUP_LNG,
               "pickup_address": "Paris 10e", "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=client_h, json=payload, timeout=10).json()
    req_id = create["id"]
    assert create["status"] == "searching"

    # Operator sees it in feed with distance_km
    feed = requests.get(f"{API}/towing/operator/feed", headers=op_h, timeout=10).json()
    ours = [f for f in feed if f["id"] == req_id]
    assert len(ours) == 1, "Request not visible in operator feed"
    assert "distance_km" in ours[0]
    assert ours[0]["distance_km"] < 5  # ~1.7km expected

    # Accept → en_route + operator_kind real
    acc = requests.post(f"{API}/towing/requests/{req_id}/accept", headers=op_h, timeout=10)
    assert acc.status_code == 200, acc.text
    d = acc.json()
    assert d["status"] == "en_route"
    assert d["operator_kind"] == "real"
    assert d["operator"]["company"] == "Dépann Test"

    # 2nd accept → 409
    acc2 = requests.post(f"{API}/towing/requests/{req_id}/accept", headers=op_h, timeout=10)
    assert acc2.status_code == 409

    # Client GET sees real operator
    cli = requests.get(f"{API}/towing/requests/{req_id}", headers=client_h, timeout=10).json()
    assert cli["operator_kind"] == "real"
    assert cli["operator"]["company"] == "Dépann Test"

    # Operator ping updates position + ETA
    pg = requests.post(f"{API}/towing/requests/{req_id}/operator-ping", headers=op_h,
                       json={"lat": OP_LAT + 0.005, "lng": OP_LNG + 0.005}, timeout=10)
    assert pg.status_code == 200
    assert "eta_minutes" in pg.json()

    # Operator marks arrived
    st = requests.post(f"{API}/towing/requests/{req_id}/operator-status", headers=op_h,
                       json={"status": "arrived"}, timeout=10)
    assert st.status_code == 200
    assert st.json()["status"] == "arrived"

    # Client sees arrived
    cli2 = requests.get(f"{API}/towing/requests/{req_id}", headers=client_h, timeout=10).json()
    assert cli2["live"]["status"] == "arrived"

    # ── End-to-end: client completes → wallet debit + operator earnings ──
    bal0 = requests.get(f"{API}/wallet", headers=client_h, timeout=10).json().get("balance", 0)
    me0 = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10).json()
    earn0 = me0["stats"]["earnings"]
    comp0 = me0["stats"]["completed"]
    total = cli2["total_price"]

    comp = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=client_h, timeout=10)
    assert comp.status_code == 200, comp.text

    bal1 = requests.get(f"{API}/wallet", headers=client_h, timeout=10).json().get("balance", 0)
    net = round(bal0 - bal1, 2)
    assert total - 5 <= net <= total, f"Expected net ~{total}, got {net}"

    me1 = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10).json()
    assert me1["stats"]["completed"] == comp0 + 1
    assert round(me1["stats"]["earnings"] - earn0, 2) == round(total, 2)

    # Operator jobs lists this one
    jobs = requests.get(f"{API}/towing/operator/jobs", headers=op_h, timeout=10).json()
    assert any(j["id"] == req_id for j in jobs)


# ── 3) Fallback simulated when no real op accepts in 18s ───────────────────
def test_fallback_simulated_after_18s(client_h, op_h, ensure_wallet):
    # Operator OFFLINE so feed isn't claimed
    requests.post(f"{API}/towing/operator/online", headers=op_h, json={"online": False}, timeout=10)

    payload = {"problem_type": "battery", "pickup_lat": 48.81, "pickup_lng": 2.30,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=client_h, json=payload, timeout=10).json()
    req_id = create["id"]
    assert create["status"] == "searching"

    # Before 18s → still searching
    r1 = requests.get(f"{API}/towing/requests/{req_id}", headers=client_h, timeout=10).json()
    assert r1["live"]["status"] == "searching"

    # Wait past fallback window
    time.sleep(19)
    r2 = requests.get(f"{API}/towing/requests/{req_id}", headers=client_h, timeout=10).json()
    assert r2["operator_kind"] == "simulated"
    assert r2["live"]["status"] in ("en_route", "arrived")
    assert r2.get("operator") and r2["operator"].get("name")

    # Cleanup: cancel
    requests.post(f"{API}/towing/requests/{req_id}/cancel", headers=client_h, timeout=10)


# ── 4) Validation: invalid status ───────────────────────────────────────────
def test_operator_status_invalid(op_h, client_h, ensure_wallet):
    # Create + accept a fresh request
    requests.post(f"{API}/towing/operator/online", headers=op_h,
                  json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    payload = {"problem_type": "battery", "pickup_lat": PICKUP_LAT, "pickup_lng": PICKUP_LNG,
               "payment_method": "sbpay"}
    create = requests.post(f"{API}/towing/requests", headers=client_h, json=payload, timeout=10).json()
    req_id = create["id"]
    requests.post(f"{API}/towing/requests/{req_id}/accept", headers=op_h, timeout=10)

    r = requests.post(f"{API}/towing/requests/{req_id}/operator-status", headers=op_h,
                      json={"status": "bogus"}, timeout=10)
    assert r.status_code == 400

    # Cleanup
    requests.post(f"{API}/towing/requests/{req_id}/cancel", headers=client_h, timeout=10)
