"""
End-to-end regression test for the Food delivery lifecycle.
Runs against the local backend (no Cloudflare). Skips gracefully if accounts
or backend are unavailable.

Lifecycle covered: customer order -> merchant accept/preparing/ready
-> driver available-deliveries/claim/picked_up/delivered -> live track.
"""
import json
import urllib.request
import urllib.error
import pytest

API = "http://localhost:8001/api"


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except urllib.error.URLError:
        pytest.skip("backend not reachable on localhost:8001")


def login(email, pw):
    s, d = call("POST", "/auth/login", body={"email": email, "password": pw})
    if s != 200:
        pytest.skip(f"account unavailable: {email} ({s})")
    return d["access_token"], d["user"]


def test_food_delivery_full_lifecycle():
    cust_t, _ = login("coherence@demo.sb", "Client123!")
    merch_t, merch = login("merchant@example.com", "Merchant123!")
    drv_t, _ = login("jean.dupont@demo.sb", "Driver123!")

    # merchant store + product
    s, merchants = call("GET", "/merchants")
    owned = [m for m in merchants if m.get("user_id") == merch["id"]]
    if owned:
        mid = owned[0]["id"]
    else:
        s, reg = call("POST", "/merchants/register", token=merch_t, body={
            "store_name": "Resto Demo SB", "store_type": "restaurant",
            "address": "5 Avenue Demo, Paris", "lat": 48.8606, "lng": 2.3376, "description": "test"})
        assert s == 200, reg
        mid = reg["id"]
    s, prods = call("GET", f"/merchants/{mid}/products")
    if not prods:
        call("POST", "/merchants/products", token=merch_t, body={
            "name": "Menu Test", "price": 9.9, "description": "x", "category": "Test", "is_available": True})
        s, prods = call("GET", f"/merchants/{mid}/products")
    pid = prods[0]["id"]

    # customer order
    s, order = call("POST", "/orders", token=cust_t, body={
        "merchant_id": mid, "items": [{"product_id": pid, "quantity": 2}],
        "delivery_address": "12 Rue Test", "delivery_lat": 48.8566, "delivery_lng": 2.3522,
        "order_type": "food", "payment_method": "cash"})
    assert s == 200, order
    oid = order["id"]
    assert order["total"] == round(order["subtotal"] + order["delivery_fee"], 2)

    # merchant lifecycle
    for st in ["accepted", "preparing", "ready"]:
        s, r = call("POST", f"/orders/{oid}/status", token=merch_t, body={"status": st})
        assert s == 200, (st, r)

    # driver: job appears, claim, deliver
    s, jobs = call("GET", "/orders/available-deliveries", token=drv_t)
    assert s == 200 and any(j["id"] == oid for j in jobs), jobs
    s, r = call("POST", f"/orders/{oid}/claim", token=drv_t)
    assert s == 200, r
    for st in ["picked_up", "delivered"]:
        s, r = call("POST", f"/orders/{oid}/status", token=drv_t, body={"status": st})
        assert s == 200, (st, r)

    # track
    s, tr = call("GET", f"/orders/{oid}/track", token=cust_t)
    assert s == 200 and tr["status"] == "delivered", tr
    assert tr["driver"] is not None
