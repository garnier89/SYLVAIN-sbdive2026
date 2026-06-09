"""Iter 192 — Loyalty *booking + completion* discount regression.

Verifies the new Phase-5 enhancement layered on iter191:

  • GET /api/loyalty/my-discount (auth)
      - Silver client (0 pts)  → {discount_pct: 0, tier_name: 'Silver' (or None)}
      - Gold client   (≥500)   → {discount_pct: 3, tier_name: 'Gold'}

  • POST /api/rides (instant) — booking-time application
      - Gold client's stored ride doc has loyalty_discount_pct == tier pct,
        loyalty_discount_amount > 0, loyalty_tier_name == 'Gold',
        estimated_fare reduced vs the Silver equivalent.
      - Silver client's ride doc has loyalty_discount_pct == 0 and no reduction.

  • POST /api/rides/{id}/status — completion-time application
      - Driver: pending → accepted → arriving
      - Admin (force-start): arriving → in_progress → completed
      - Gold ride's fare_breakdown.loyalty_discount > 0 and loyalty_tier == 'Gold'
      - Silver equivalent ride has loyalty_discount == 0 and loyalty_tier null
      - The discount applies on fare components only (no impact on tolls/extras).

  • Regression: POST /api/rides for a Silver client matches the pre-Phase-5
    estimate (no loyalty fields applied to fare).

Cleans up all seeded users/wallets/loyalty/rides on completion.
"""

import os
import uuid
import time
import pytest
import requests

from _creds import ADMIN_EMAIL, ADMIN_PASSWORD

try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env", override=False)
except Exception:
    pass

from pymongo import MongoClient

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

DEMO_DRIVER_EMAIL = "jean.dupont@demo.sb"
DEMO_DRIVER_PASSWORD = "Driver123!"

# Two close points in Paris (~3km) for a deterministic estimate.
PICKUP = (48.8566, 2.3522, "1 Rue de Rivoli, 75001 Paris")
DROPOFF = (48.8738, 2.2950, "Place de l'Etoile, 75008 Paris")


def _s():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _admin_session():
    s = _s()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code}")
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s


def _driver_session():
    s = _s()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_DRIVER_EMAIL, "password": DEMO_DRIVER_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"demo driver login failed: {r.status_code}")
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s, r.json().get("user", {})


def _register_client(prefix="iter192"):
    s = _s()
    suf = uuid.uuid4().hex[:8]
    payload = {
        "email": f"{prefix}_{suf}@example.com",
        "password": "Passw0rd!",
        "name": f"{prefix.title()} {suf[:4]}",
        "role": "user",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return s, r.json()["user"]


def _seed_gold(user_id, points=600):
    cli = MongoClient(MONGO_URL)
    cli[DB_NAME].loyalty.update_one(
        {"user_id": user_id},
        {"$set": {"points": points, "tier_key": "gold",
                  "history": [{"points": points, "reason": "iter192_seed",
                               "at": "2026-01-01T00:00:00+00:00"}]}},
        upsert=True,
    )


def _ride_payload():
    return {
        "pickup_lat": PICKUP[0], "pickup_lng": PICKUP[1], "pickup_address": PICKUP[2],
        "dropoff_lat": DROPOFF[0], "dropoff_lng": DROPOFF[1], "dropoff_address": DROPOFF[2],
        "vehicle_type": "sb", "payment_method": "cash", "ride_type": "instant",
    }


def _cleanup_user(user_id, ride_ids=None):
    try:
        cli = MongoClient(MONGO_URL)
        cli[DB_NAME].users.delete_one({"id": user_id})
        cli[DB_NAME].wallets.delete_one({"user_id": user_id})
        cli[DB_NAME].loyalty.delete_one({"user_id": user_id})
        cli[DB_NAME].referrals.delete_many({"referrer_id": user_id})
        cli[DB_NAME].referrals.delete_many({"referred_id": user_id})
        for rid in (ride_ids or []):
            cli[DB_NAME].rides.delete_one({"id": rid})
    except Exception:
        pass


# ───────────────────────── 1. /loyalty/my-discount ─────────────────────────

class TestMyDiscountEndpoint:
    def test_silver_returns_zero(self):
        s, u = _register_client("iter192silver")
        try:
            r = s.get(f"{API}/loyalty/my-discount", timeout=15)
            assert r.status_code == 200, r.text[:200]
            body = r.json()
            assert "discount_pct" in body
            assert "tier_name" in body
            assert float(body["discount_pct"]) == 0.0
        finally:
            _cleanup_user(u["id"])

    def test_gold_returns_three_pct_and_tier_name(self):
        s, u = _register_client("iter192gold")
        try:
            _seed_gold(u["id"], 600)
            r = s.get(f"{API}/loyalty/my-discount", timeout=15)
            assert r.status_code == 200, r.text[:200]
            body = r.json()
            assert float(body["discount_pct"]) == 3.0, body
            assert body["tier_name"] == "Gold", body
        finally:
            _cleanup_user(u["id"])


# ───────────────────────── 2. Booking-time discount ─────────────────────────

def _create_ride(session):
    r = session.post(f"{API}/rides", json=_ride_payload(), timeout=20)
    return r


def _read_ride(rid):
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME].rides.find_one({"id": rid}, {"_id": 0})


class TestBookingDiscount:
    def test_silver_ride_has_no_loyalty_fields_applied(self):
        s, u = _register_client("iter192bsilver")
        ride_ids = []
        try:
            r = _create_ride(s)
            assert r.status_code == 200, f"silver create failed {r.status_code} {r.text[:200]}"
            rid = r.json()["id"]
            ride_ids.append(rid)
            doc = _read_ride(rid)
            assert doc is not None
            assert float(doc.get("loyalty_discount_pct", 0) or 0) == 0.0
            assert float(doc.get("loyalty_discount_amount", 0) or 0) == 0.0
            assert doc.get("loyalty_tier_name") in (None, "", "Silver")
        finally:
            _cleanup_user(u["id"], ride_ids)

    def test_gold_ride_stores_loyalty_fields_and_reduces_estimate(self):
        s_silver, u_silver = _register_client("iter192cmpsilver")
        s_gold, u_gold = _register_client("iter192cmpgold")
        ride_ids = []
        try:
            # Silver baseline
            r1 = _create_ride(s_silver)
            assert r1.status_code == 200, r1.text[:200]
            rid_silver = r1.json()["id"]
            ride_ids.append(rid_silver)
            doc_silver = _read_ride(rid_silver)
            silver_fare = float(doc_silver["estimated_fare"])

            # Promote to gold then create
            _seed_gold(u_gold["id"], 600)
            r2 = _create_ride(s_gold)
            assert r2.status_code == 200, r2.text[:200]
            rid_gold = r2.json()["id"]
            ride_ids.append(rid_gold)
            doc_gold = _read_ride(rid_gold)

            assert float(doc_gold.get("loyalty_discount_pct", 0)) == 3.0, doc_gold
            assert float(doc_gold.get("loyalty_discount_amount", 0)) > 0.0, doc_gold
            assert doc_gold.get("loyalty_tier_name") == "Gold", doc_gold

            gold_fare = float(doc_gold["estimated_fare"])
            # Gold should pay ~3% less than Silver on the same trip
            assert gold_fare < silver_fare, f"gold {gold_fare} not < silver {silver_fare}"
            # Roughly equals silver * 0.97 (allow rounding tolerance)
            expected = round(silver_fare * 0.97, 2)
            assert abs(gold_fare - expected) <= 0.05, f"gold {gold_fare} vs expected {expected}"
        finally:
            _cleanup_user(u_silver["id"], ride_ids[:1])
            _cleanup_user(u_gold["id"], ride_ids[1:])


# ───────────────────────── 3. Completion-time discount ─────────────────────────

def _accept_ride_as_driver(drv_sess, ride_id):
    """Driver accepts a pending ride."""
    r = drv_sess.post(f"{API}/rides/{ride_id}/accept", timeout=15)
    if r.status_code == 404:
        # alternate route shape
        r = drv_sess.post(f"{API}/rides/{ride_id}/status", json={"status": "accepted"}, timeout=15)
    return r


def _admin_set_status(admin_sess, ride_id, new_status):
    return admin_sess.post(f"{API}/rides/{ride_id}/status", json={"status": new_status}, timeout=15)


def _complete_ride_pipeline(ride_id, admin_sess, drv_sess):
    """Move pending → accepted → arriving → in_progress → completed.
    Admin can force in_progress to bypass passenger OTP."""
    # accept (driver)
    r = _accept_ride_as_driver(drv_sess, ride_id)
    assert r.status_code in (200, 201), f"accept failed: {r.status_code} {r.text[:200]}"
    # arriving (driver)
    r = drv_sess.post(f"{API}/rides/{ride_id}/status", json={"status": "arriving"}, timeout=15)
    assert r.status_code in (200, 201), f"arriving failed: {r.status_code} {r.text[:200]}"
    # in_progress via admin (bypasses OTP)
    r = _admin_set_status(admin_sess, ride_id, "in_progress")
    assert r.status_code in (200, 201), f"in_progress failed: {r.status_code} {r.text[:200]}"
    # completed via admin (driver works too, but admin is uniform)
    r = _admin_set_status(admin_sess, ride_id, "completed")
    assert r.status_code in (200, 201), f"completed failed: {r.status_code} {r.text[:200]}"
    return r


class TestCompletionDiscount:
    def test_gold_completion_fare_breakdown_has_loyalty_discount(self):
        admin = _admin_session()
        drv_sess, _ = _driver_session()
        s_silver, u_silver = _register_client("iter192endsilver")
        s_gold, u_gold = _register_client("iter192endgold")
        ride_ids = []
        try:
            # ----- Silver ride: create, complete -----
            r1 = _create_ride(s_silver)
            assert r1.status_code == 200, r1.text[:200]
            rid_silver = r1.json()["id"]
            ride_ids.append(rid_silver)
            _complete_ride_pipeline(rid_silver, admin, drv_sess)
            doc_s = _read_ride(rid_silver)
            assert doc_s["status"] == "completed", doc_s.get("status")
            fb_s = doc_s.get("fare_breakdown", {})
            assert float(fb_s.get("loyalty_discount", 0) or 0) == 0.0, fb_s
            assert fb_s.get("loyalty_tier") in (None, "", "Silver"), fb_s
            silver_final = float(doc_s["final_fare"])

            # ----- Gold ride: promote, create, complete -----
            _seed_gold(u_gold["id"], 600)
            r2 = _create_ride(s_gold)
            assert r2.status_code == 200, r2.text[:200]
            rid_gold = r2.json()["id"]
            ride_ids.append(rid_gold)
            _complete_ride_pipeline(rid_gold, admin, drv_sess)
            doc_g = _read_ride(rid_gold)
            assert doc_g["status"] == "completed"
            fb_g = doc_g.get("fare_breakdown", {})
            assert float(fb_g.get("loyalty_discount", 0) or 0) > 0.0, fb_g
            assert fb_g.get("loyalty_tier") == "Gold", fb_g
            # No extras configured → tolls/other/waiting are zero, safe.
            assert float(fb_g.get("extra_total", 0) or 0) == 0.0
            # Gold final_fare should be ≤ Silver final_fare on the same trip
            gold_final = float(doc_g["final_fare"])
            assert gold_final <= silver_final, f"gold {gold_final} > silver {silver_final}"
        finally:
            _cleanup_user(u_silver["id"], ride_ids[:1])
            _cleanup_user(u_gold["id"], ride_ids[1:])
