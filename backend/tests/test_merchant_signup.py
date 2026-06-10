"""
SB Store — inscription self-service marchand + validation admin.

Couvre POST /merchants/signup (création compte+boutique en attente, non listée
publiquement, auto-login cookie), GET /admin/merchants?status=pending, et
POST /admin/merchants/{id}/approval (approve/reject).
"""
import os
import uuid
import requests
import pytest
from pymongo import MongoClient

from core.deps import create_access_token

API = os.environ.get("TEST_API_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture
def cleanup():
    created = {"emails": [], "merchant_ids": []}
    yield created
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    if created["emails"]:
        users = list(db.users.find({"email": {"$in": created["emails"]}}, {"_id": 0, "id": 1}))
        uids = [u["id"] for u in users]
        db.users.delete_many({"email": {"$in": created["emails"]}})
        db.wallets.delete_many({"user_id": {"$in": uids}})
        db.merchants.delete_many({"user_id": {"$in": uids}})
    if created["merchant_ids"]:
        db.merchants.delete_many({"id": {"$in": created["merchant_ids"]}})
    cli.close()


def _admin_token():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    admin = db.users.find_one({"role": "admin"}, {"_id": 0, "id": 1, "email": 1})
    cli.close()
    return create_access_token(admin["id"], admin["email"], "admin")


def _signup(email):
    return requests.post(f"{API}/api/merchants/signup", json={
        "name": "Owner", "email": email, "password": "Store123!", "phone": "+33600000000",
        "store_name": "Test Self-Serve Shop", "store_type": "bakery",
        "address": "1 rue du Test", "description": "desc",
    })


def test_signup_creates_pending_hidden_merchant(cleanup):
    email = f"selfserve_{uuid.uuid4().hex[:8]}@test.com"
    cleanup["emails"].append(email)
    r = _signup(email)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["merchant"]["approval_status"] == "pending"
    mid = body["merchant"]["id"]
    cleanup["merchant_ids"].append(mid)
    # Auto-login cookie set.
    assert "access_token" in r.cookies

    # NOT visible in the public list.
    pub = requests.get(f"{API}/api/merchants").json()
    ids = [m["id"] for m in (pub if isinstance(pub, list) else pub.get("merchants", []))]
    assert mid not in ids


def test_signup_duplicate_email_rejected(cleanup):
    email = f"dup_{uuid.uuid4().hex[:8]}@test.com"
    cleanup["emails"].append(email)
    assert _signup(email).status_code == 200
    r2 = _signup(email)
    assert r2.status_code == 400


def test_signup_short_password_rejected(cleanup):
    email = f"short_{uuid.uuid4().hex[:8]}@test.com"
    r = requests.post(f"{API}/api/merchants/signup", json={
        "name": "x", "email": email, "password": "123", "store_name": "S", "address": "a",
    })
    assert r.status_code == 400


def test_admin_approval_flow(cleanup):
    email = f"approve_{uuid.uuid4().hex[:8]}@test.com"
    cleanup["emails"].append(email)
    mid = _signup(email).json()["merchant"]["id"]
    cleanup["merchant_ids"].append(mid)
    headers = {"Authorization": f"Bearer {_admin_token()}"}

    # Pending list contains it.
    lst = requests.get(f"{API}/api/admin/merchants?status=pending", headers=headers).json()
    assert any(m["id"] == mid for m in lst["merchants"])
    assert lst["pending_count"] >= 1

    # Approve → becomes active + publicly listed.
    ap = requests.post(f"{API}/api/admin/merchants/{mid}/approval", json={"action": "approve"}, headers=headers)
    assert ap.status_code == 200 and ap.json()["approval_status"] == "approved"
    pub = requests.get(f"{API}/api/merchants").json()
    ids = [m["id"] for m in (pub if isinstance(pub, list) else pub.get("merchants", []))]
    assert mid in ids


def test_admin_reject_flow(cleanup):
    email = f"reject_{uuid.uuid4().hex[:8]}@test.com"
    cleanup["emails"].append(email)
    mid = _signup(email).json()["merchant"]["id"]
    cleanup["merchant_ids"].append(mid)
    headers = {"Authorization": f"Bearer {_admin_token()}"}
    rj = requests.post(f"{API}/api/admin/merchants/{mid}/approval", json={"action": "reject"}, headers=headers)
    assert rj.status_code == 200 and rj.json()["approval_status"] == "rejected"
    # Still hidden from public list.
    pub = requests.get(f"{API}/api/merchants").json()
    ids = [m["id"] for m in (pub if isinstance(pub, list) else pub.get("merchants", []))]
    assert mid not in ids
