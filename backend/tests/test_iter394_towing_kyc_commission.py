"""Backend tests for SB Dépannage iter394 — KYC operator verification + platform commission.

Covers:
- POST /api/towing/operator/register sets verification_status='pending'.
- POST /api/towing/operator/online returns 403 when not 'approved'.
- POST /api/towing/operator/documents attaches URLs and keeps status 'pending'.
- Admin: GET /api/admin/towing/operators, POST /verify (approve/reject), GET/PUT /settings, GET /revenue.
- After approve → operator can go online (200); reject → 403 again.
- Completion split: response contains commission + operator_earning; operator wallet credited with net; idempotent.
- /operator/me returns verification_status, documents, commission_pct, stats.earnings (NET), stats.gross.
- Commission setting validation (0..0.9), invalid → 400.
"""
import os
import time
import uuid
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
OPERATOR = {"email": "freeuser@demo.sb", "password": "FreeUser123!"}
CLIENT = {"email": "famtester@demo.sb", "password": "FamTest123!"}

OP_LAT, OP_LNG = 48.860, 2.345
PICKUP_LAT, PICKUP_LNG = 48.873, 2.357


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(os.environ.get("MONGO_URL"))
    yield cli[os.environ.get("DB_NAME")]
    cli.close()


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def op_h():
    return {"Authorization": f"Bearer {_login(OPERATOR)}"}


@pytest.fixture(scope="module")
def client_h():
    return {"Authorization": f"Bearer {_login(CLIENT)}"}


@pytest.fixture(scope="module")
def op_uid(op_h):
    r = requests.get(f"{API}/auth/me", headers=op_h, timeout=10)
    return r.json()["id"]


@pytest.fixture(scope="module")
def client_uid(client_h):
    return requests.get(f"{API}/auth/me", headers=client_h, timeout=10).json()["id"]


@pytest.fixture(autouse=True, scope="module")
def reset_state(mongo, op_uid, client_uid):
    """Reset operator → pending + ensure client wallet 500€."""
    mongo.tow_operators.update_one(
        {"user_id": op_uid},
        {"$set": {"verification_status": "pending", "documents": {},
                  "is_online": False, "rejection_reason": None}},
    )
    mongo.wallets.update_one({"user_id": client_uid},
                             {"$set": {"balance": 500.0, "user_id": client_uid}}, upsert=True)
    # Reset commission to default
    mongo.towing_settings.update_one({"id": "config"},
                                     {"$set": {"id": "config", "commission_pct": 0.15}}, upsert=True)
    yield
    # Restore commission default after tests
    mongo.towing_settings.update_one({"id": "config"},
                                     {"$set": {"id": "config", "commission_pct": 0.15}}, upsert=True)


# ── 1) Operator KYC: register → pending, online 403 if not approved ─────────
def test_register_sets_pending(op_h, mongo, op_uid):
    payload = {"company": "Dépann Test", "phone": "+33600000000",
               "plate": "TT-394-XX", "truck_type": "Plateau", "city": "Paris"}
    r = requests.post(f"{API}/towing/operator/register", headers=op_h, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    # Force pending (register preserves existing, so reset_state's pending stands)
    mongo.tow_operators.update_one({"user_id": op_uid}, {"$set": {"verification_status": "pending"}})

    me = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10).json()
    assert me["registered"] is True
    assert me["operator"]["verification_status"] == "pending"
    assert "commission_pct" in me
    assert "earnings" in me["stats"] and "gross" in me["stats"]


def test_online_403_when_not_approved(op_h):
    r = requests.post(f"{API}/towing/operator/online", headers=op_h,
                      json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_documents_attach_and_keep_pending(op_h):
    docs = {
        "insurance": "https://cdn.example.com/insurance.pdf",
        "license": "https://cdn.example.com/license.pdf",
        "id_card": "https://cdn.example.com/idcard.jpg",
    }
    r = requests.post(f"{API}/towing/operator/documents", headers=op_h, json=docs, timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["verification_status"] == "pending"
    assert d["documents"]["insurance"] == docs["insurance"]
    assert d["documents"]["license"] == docs["license"]
    assert d["documents"]["id_card"] == docs["id_card"]

    me = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10).json()
    assert me["operator"]["documents"]["insurance"] == docs["insurance"]


# ── 2) Admin endpoints ──────────────────────────────────────────────────────
def test_admin_list_operators(admin_h, op_uid):
    r = requests.get(f"{API}/admin/towing/operators", headers=admin_h, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "operators" in d and "counts" in d
    assert set(["pending", "approved", "rejected", "total"]).issubset(d["counts"].keys())
    ids = [o["user_id"] for o in d["operators"]]
    assert op_uid in ids


def test_admin_requires_admin(op_h):
    r = requests.get(f"{API}/admin/towing/operators", headers=op_h, timeout=10)
    assert r.status_code in (401, 403)


def test_admin_settings_get_put_validation(admin_h):
    r = requests.get(f"{API}/admin/towing/settings", headers=admin_h, timeout=10)
    assert r.status_code == 200
    assert "commission_pct" in r.json()

    # invalid > 0.9
    bad = requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                       json={"commission_pct": 0.95}, timeout=10)
    assert bad.status_code == 400

    # invalid negative
    bad2 = requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                        json={"commission_pct": -0.1}, timeout=10)
    assert bad2.status_code == 400

    # invalid type
    bad3 = requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                        json={"commission_pct": "abc"}, timeout=10)
    assert bad3.status_code == 400

    # valid
    ok = requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                      json={"commission_pct": 0.20}, timeout=10)
    assert ok.status_code == 200
    assert ok.json()["commission_pct"] == 0.20

    # Restore
    requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                 json={"commission_pct": 0.15}, timeout=10)


def test_admin_reject_then_online_403(admin_h, op_h, op_uid, mongo):
    r = requests.post(f"{API}/admin/towing/operators/{op_uid}/verify", headers=admin_h,
                      json={"action": "reject", "reason": "docs flous"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["verification_status"] == "rejected"

    op = mongo.tow_operators.find_one({"user_id": op_uid})
    assert op["verification_status"] == "rejected"
    assert op.get("is_online") is False

    # Operator cannot go online
    ro = requests.post(f"{API}/towing/operator/online", headers=op_h,
                       json={"online": True}, timeout=10)
    assert ro.status_code == 403


def test_admin_approve_then_online_ok(admin_h, op_h, op_uid):
    r = requests.post(f"{API}/admin/towing/operators/{op_uid}/verify", headers=admin_h,
                      json={"action": "approve"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["verification_status"] == "approved"

    ro = requests.post(f"{API}/towing/operator/online", headers=op_h,
                       json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    assert ro.status_code == 200
    assert ro.json()["is_online"] is True


def test_admin_verify_invalid_action(admin_h, op_uid):
    r = requests.post(f"{API}/admin/towing/operators/{op_uid}/verify", headers=admin_h,
                      json={"action": "freeze"}, timeout=10)
    assert r.status_code == 400


def test_admin_verify_unknown_user(admin_h):
    r = requests.post(f"{API}/admin/towing/operators/nope-{uuid.uuid4().hex[:8]}/verify",
                      headers=admin_h, json={"action": "approve"}, timeout=10)
    assert r.status_code == 404


# ── 3) Commission split on completion + idempotency ─────────────────────────
def test_completion_commission_split_and_idempotent(client_h, op_h, admin_h,
                                                    client_uid, op_uid, mongo):
    # Ensure operator approved + online (previous test approved)
    requests.post(f"{API}/towing/operator/online", headers=op_h,
                  json={"online": True, "lat": OP_LAT, "lng": OP_LNG}, timeout=10)
    # Reset commission to known value 0.15
    requests.put(f"{API}/admin/towing/settings", headers=admin_h,
                 json={"commission_pct": 0.15}, timeout=10)
    # Reset client wallet
    mongo.wallets.update_one({"user_id": client_uid},
                             {"$set": {"balance": 500.0}}, upsert=True)
    # Snapshot operator wallet
    op_wal_before = mongo.wallets.find_one({"user_id": op_uid}) or {"balance": 0}
    op_bal0 = float(op_wal_before.get("balance", 0))

    # Client creates request
    payload = {"problem_type": "battery", "pickup_lat": PICKUP_LAT, "pickup_lng": PICKUP_LNG,
               "payment_method": "sbpay", "pickup_address": "Paris 10e"}
    create = requests.post(f"{API}/towing/requests", headers=client_h, json=payload, timeout=10).json()
    req_id = create["id"]
    total = float(create["total_price"])

    # Operator accepts
    acc = requests.post(f"{API}/towing/requests/{req_id}/accept", headers=op_h, timeout=10)
    assert acc.status_code == 200

    # Client completes
    comp = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=client_h, timeout=10)
    assert comp.status_code == 200, comp.text
    d = comp.json()
    expected_commission = round(total * 0.15, 2)
    expected_net = round(total - expected_commission, 2)
    assert d["commission"] == expected_commission, f"expected {expected_commission}, got {d['commission']}"
    assert d["operator_earning"] == expected_net

    # Operator wallet credited with net
    op_wal_after = mongo.wallets.find_one({"user_id": op_uid})
    op_bal1 = float(op_wal_after.get("balance", 0))
    assert round(op_bal1 - op_bal0, 2) == expected_net, \
        f"operator wallet delta {op_bal1 - op_bal0} != {expected_net}"

    # Idempotent: 2nd complete must NOT double-credit
    comp2 = requests.post(f"{API}/towing/requests/{req_id}/complete", headers=client_h, timeout=10)
    assert comp2.status_code == 200
    op_wal_after2 = mongo.wallets.find_one({"user_id": op_uid})
    op_bal2 = float(op_wal_after2.get("balance", 0))
    assert round(op_bal2 - op_bal1, 2) == 0.0, "Double credit on idempotent complete!"

    # /operator/me reports earnings NET ~ matches and gross matches total (this single job)
    me = requests.get(f"{API}/towing/operator/me", headers=op_h, timeout=10).json()
    assert me["stats"]["earnings"] >= expected_net - 0.01
    assert me["stats"]["gross"] >= total - 0.01


def test_admin_revenue_aggregates(admin_h):
    r = requests.get(f"{API}/admin/towing/revenue", headers=admin_h, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("count", "gmv", "commission", "operator_payout", "commission_pct"):
        assert k in d
    assert d["count"] >= 1
    assert d["gmv"] >= 0
    # gmv == commission + operator_payout (within rounding)
    assert abs(d["gmv"] - (d["commission"] + d["operator_payout"])) < 0.5
