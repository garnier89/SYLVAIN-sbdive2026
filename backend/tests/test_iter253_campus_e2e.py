"""Iteration 253 — SB Student Phase 2 Pass Campus + Recurring (HTTP e2e).

Covers:
- GET /api/student/campus/plans (seeded monthly + semester)
- POST /api/student/campus/subscribe (400 no-funds; 200 funded → debit + credit;
  409 already-active)
- GET /api/student/campus/subscription
- POST /api/student/campus/subscription/cancel (→ cancelled)
- Recurring CRUD (POST/GET/PUT/DELETE) + book-next
- Admin Pass CRUD + non-admin guard
"""
import os
import uuid
import time
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _new_user_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    suffix = uuid.uuid4().hex[:8]
    email = f"campus_e2e_{suffix}@example.com"
    pw = "TestPass123!"
    r = s.post(f"{API}/auth/register", json={"name": "Campus E2E", "email": email, "password": pw, "role": "user"})
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    # Some apps auto-login on register; ensure session
    r2 = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r2.status_code == 200, f"login failed: {r2.status_code} {r2.text}"
    return s, email


def _admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": "admin@superapp.com", "password": "SuperAdmin123!"})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# ---------- PLANS ----------
def test_list_plans_returns_seeded():
    s, _ = _new_user_session()
    r = s.get(f"{API}/student/campus/plans")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "plans" in data
    plans = data["plans"]
    ids = {p["id"] for p in plans}
    assert "plan_monthly" in ids
    assert "plan_semester" in ids
    pm = next(p for p in plans if p["id"] == "plan_monthly")
    ps = next(p for p in plans if p["id"] == "plan_semester")
    assert pm["price"] == 19.99
    assert pm["discount_pct"] == 25.0
    assert ps["price"] == 89.99
    assert ps["discount_pct"] == 30.0


# ---------- SUBSCRIBE NO FUNDS ----------
def test_subscribe_without_funds_400():
    s, _ = _new_user_session()
    r = s.post(f"{API}/student/campus/subscribe", json={"plan_id": "plan_monthly"})
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


# ---------- SUBSCRIBE WITH FUNDS + DOUBLE SUBSCRIBE ----------
def test_subscribe_with_funds_then_409_then_cancel():
    s, _ = _new_user_session()
    # Top up wallet 50€
    r = s.post(f"{API}/wallet/topup", json={"amount": 50, "method": "cash"})
    assert r.status_code == 200, r.text

    # Subscribe monthly
    r = s.post(f"{API}/student/campus/subscribe", json={"plan_id": "plan_monthly"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    sub = body["subscription"]
    assert sub["status"] == "active"
    assert sub["plan_id"] == "plan_monthly"
    assert sub["discount_pct"] == 25.0
    # Balance: 50 - 19.99 + 5.0 (included credits) = 35.01
    assert abs(body["balance"] - 35.01) < 0.02, f"balance={body['balance']}"

    # GET subscription
    r = s.get(f"{API}/student/campus/subscription")
    assert r.status_code == 200
    got = r.json().get("subscription")
    assert got and got["status"] == "active" and got["plan_id"] == "plan_monthly"

    # Re-subscribe → 409
    r = s.post(f"{API}/student/campus/subscribe", json={"plan_id": "plan_monthly"})
    assert r.status_code == 409, f"expected 409 got {r.status_code}: {r.text}"

    # Cancel
    r = s.post(f"{API}/student/campus/subscription/cancel")
    assert r.status_code == 200
    r = s.get(f"{API}/student/campus/subscription")
    assert r.status_code == 200
    assert r.json().get("subscription") is None


# ---------- RECURRING CRUD ----------
def test_recurring_crud_and_book_next():
    s, _ = _new_user_session()
    payload = {
        "label": "Campus → Résidence",
        "pickup": {"address": "Campus Antilles"},
        "dropoff": {"address": "Résidence Etudiante"},
        "mode": "moto",
        "frequency": "weekdays",
        "time": "08:00",
    }
    r = s.post(f"{API}/student/campus/recurring", json=payload)
    assert r.status_code == 200, r.text
    rec = r.json()["recurring"]
    assert rec["label"] == "Campus → Résidence"
    assert rec["frequency"] == "weekdays"
    assert "id" in rec
    occ = rec.get("next_occurrences", [])
    assert len(occ) >= 1
    # all weekdays only
    from datetime import datetime
    for iso in occ:
        wd = datetime.fromisoformat(iso).weekday()
        assert wd < 5, f"expected weekday only, got wd={wd} for {iso}"

    rid = rec["id"]

    # GET list
    r = s.get(f"{API}/student/campus/recurring")
    assert r.status_code == 200
    items = r.json()["recurring"]
    assert any(it["id"] == rid for it in items)

    # PUT toggle active false
    r = s.put(f"{API}/student/campus/recurring/{rid}", json={"active": False})
    assert r.status_code == 200, r.text
    assert r.json()["recurring"]["active"] is False

    # book-next
    r = s.get(f"{API}/student/campus/recurring/{rid}/book-next")
    assert r.status_code == 200, r.text
    bn = r.json()
    assert "occurrence_at" in bn and "booking_payload" in bn
    assert bn["booking_payload"]["pickup"]["address"] == "Campus Antilles"
    assert bn["booking_payload"]["dropoff"]["address"] == "Résidence Etudiante"

    # DELETE
    r = s.delete(f"{API}/student/campus/recurring/{rid}")
    assert r.status_code == 200
    assert r.json().get("deleted", 0) == 1

    # Verify gone (book-next → 404)
    r = s.get(f"{API}/student/campus/recurring/{rid}/book-next")
    assert r.status_code == 404


# ---------- ADMIN PASS CRUD ----------
def test_admin_plan_crud_and_guard():
    # Non-admin guard
    s_user, _ = _new_user_session()
    r = s_user.get(f"{API}/student/campus/admin/plans")
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    s = _admin_session()
    r = s.get(f"{API}/student/campus/admin/plans")
    assert r.status_code == 200, r.text
    plans = r.json()["plans"]
    assert any(p["id"] == "plan_monthly" for p in plans)

    # Create a new pass
    new_plan = {
        "name": f"TEST_Pass_{uuid.uuid4().hex[:6]}",
        "type": "monthly",
        "price": 9.99,
        "duration_days": 30,
        "discount_pct": 15.0,
        "included_credits": 2.0,
        "enabled": True,
        "perks": ["Test perk"],
    }
    r = s.post(f"{API}/student/campus/admin/plans", json=new_plan)
    assert r.status_code == 200, r.text
    created = r.json()["plan"]
    pid = created["id"]
    assert created["price"] == 9.99
    assert created["discount_pct"] == 15.0

    # PUT modify
    r = s.put(f"{API}/student/campus/admin/plans/{pid}", json={"price": 12.50, "discount_pct": 18.0, "enabled": False})
    assert r.status_code == 200, r.text
    p2 = r.json()["plan"]
    assert p2["price"] == 12.50
    assert p2["discount_pct"] == 18.0
    assert p2["enabled"] is False

    # DELETE
    r = s.delete(f"{API}/student/campus/admin/plans/{pid}")
    assert r.status_code == 200
    assert r.json().get("deleted", 0) == 1
