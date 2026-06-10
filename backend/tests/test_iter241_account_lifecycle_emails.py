"""P2 — Account lifecycle emails (suspend / reactivate / delete) via Resend.

Verifies the admin suspend/delete endpoints fire the right side effects and that
the email helpers never raise (fire-and-forget, test-mode safe).
"""
import os
import time
import asyncio
import requests
from pymongo import MongoClient

import core.email as email
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
db = MongoClient(MONGO_URL)[DB_NAME]


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_lifecycle_email_helpers_never_raise():
    _run(email.send_account_suspended("x@y.com", "Test", "Motif test"))
    _run(email.send_account_suspended("x@y.com", "Test", ""))
    _run(email.send_account_reactivated("x@y.com", "Test"))
    _run(email.send_account_deleted("x@y.com", "Test"))


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def _new_user():
    e = f"lifecycle_{int(time.time()*1000)}@example.com"
    r = requests.post(f"{API}/api/auth/register",
                      json={"email": e, "password": "Secret123!", "name": "Lifecycle", "role": "user"})
    assert r.status_code == 200, r.text
    return e, r.json()["user"]["id"]


def test_admin_suspend_reactivate_delete_flow():
    s = _admin_session()
    email_addr, uid = _new_user()
    # suspend
    r = s.put(f"{API}/api/admin/users/{uid}", json={"is_active": False, "suspension_reason": "Test"})
    assert r.status_code == 200 and r.json().get("updated") is True
    assert db.users.find_one({"id": uid})["is_suspended"] is True
    # reactivate
    r = s.put(f"{API}/api/admin/users/{uid}", json={"is_active": True})
    assert r.status_code == 200
    assert db.users.find_one({"id": uid})["is_suspended"] is False
    # delete
    r = s.delete(f"{API}/api/admin/users/{uid}")
    assert r.status_code == 200 and r.json().get("deleted") is True
    assert db.users.find_one({"id": uid}) is None
