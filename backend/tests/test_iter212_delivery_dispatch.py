"""P0.2 — Livraison Marketplace ↔ réseau SB Drive.

Covers: delivery-speed options + surcharges, order creation with speed,
courier dispatchability (express lined up from 'accepted', standard at 'ready'),
priority ordering in the available list, and claim (incl. double-claim 409).
"""
import os
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MERCHANT = {"email": "merchant@example.com", "password": "Merchant123!"}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}
MID = "merchant_d3cc002c7d87"


def _session(creds):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return s


def _customer():
    s = requests.Session()
    import uuid
    email = f"cust_{uuid.uuid4().hex[:8]}@demo.sb"
    r = s.post(f"{API}/api/auth/register", json={"email": email, "password": "Buyer2026!", "name": "Cust"}, timeout=30)
    assert r.status_code in (200, 201), r.text
    return s


def _a_product():
    ps = requests.get(f"{API}/api/merchants/{MID}/products", timeout=30).json()
    avail = [p for p in ps if p.get("stock") is None or p.get("stock") > 0]
    assert avail, "merchant has no in-stock product"
    return avail[0]["id"]


def _create_order(cust, pid, speed):
    r = cust.post(f"{API}/api/orders", json={
        "merchant_id": MID, "items": [{"product_id": pid, "quantity": 1}],
        "delivery_address": "10 rue Test", "delivery_lat": 14.6, "delivery_lng": -61.0,
        "order_type": "food", "payment_method": "cash", "delivery_speed": speed,
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def test_delivery_options():
    cust = _customer()
    r = cust.get(f"{API}/api/orders/delivery-options", timeout=30)
    assert r.status_code == 200
    opts = {o["id"]: o for o in r.json()["options"]}
    assert opts["express"]["surcharge"] == 3.0
    assert opts["priority"]["surcharge"] == 2.0
    assert opts["standard"]["surcharge"] == 0.0
    assert "scheduled" in opts


def test_order_surcharge_and_priority():
    cust, pid = _customer(), _a_product()
    exp = _create_order(cust, pid, "express")
    assert exp["delivery_speed"] == "express"
    assert exp["delivery_surcharge"] == 3.0
    assert exp["priority"] is True
    std = _create_order(cust, pid, "standard")
    assert std["delivery_surcharge"] == 0.0
    assert std["priority"] is False
    # express fee = standard fee + 3
    assert round(exp["delivery_fee"] - std["delivery_fee"], 2) == 3.0


def test_dispatch_and_claim():
    cust, pid = _customer(), _a_product()
    merchant = _session(MERCHANT)
    driver = _session(DRIVER)

    exp = _create_order(cust, pid, "express")
    std = _create_order(cust, pid, "standard")

    # Express lined up from 'accepted'; standard NOT yet (only at 'ready').
    merchant.post(f"{API}/api/orders/{exp['id']}/status", json={"status": "accepted"}, timeout=30)
    merchant.post(f"{API}/api/orders/{std['id']}/status", json={"status": "accepted"}, timeout=30)

    avail = driver.get(f"{API}/api/orders/available-deliveries", timeout=30).json()
    ids = [o["id"] for o in avail]
    assert exp["id"] in ids, "express order should be dispatchable at 'accepted'"
    assert std["id"] not in ids, "standard order must wait for 'ready'"
    # priority orders surface first
    assert avail[0]["priority"] is True

    # standard becomes dispatchable at 'ready'
    merchant.post(f"{API}/api/orders/{std['id']}/status", json={"status": "ready"}, timeout=30)
    avail2 = driver.get(f"{API}/api/orders/available-deliveries", timeout=30).json()
    assert std["id"] in [o["id"] for o in avail2]

    # Claim the express order; a second claim must 409.
    r1 = driver.post(f"{API}/api/orders/{exp['id']}/claim", timeout=30)
    assert r1.status_code == 200, r1.text
    r2 = driver.post(f"{API}/api/orders/{exp['id']}/claim", timeout=30)
    assert r2.status_code == 409


def test_admin_surcharge_settings():
    admin = _session({"email": "admin@superapp.com", "password": "SuperAdmin123!"})
    r = admin.get(f"{API}/api/orders/admin/delivery-settings", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "express_surcharge" in d and "priority_surcharge" in d
    # round-trip update then restore
    orig = d["express_surcharge"]
    up = admin.put(f"{API}/api/orders/admin/delivery-settings", json={"express_surcharge": 4.5}, timeout=30)
    assert up.status_code == 200 and up.json()["express_surcharge"] == 4.5
    admin.put(f"{API}/api/orders/admin/delivery-settings", json={"express_surcharge": orig}, timeout=30)
