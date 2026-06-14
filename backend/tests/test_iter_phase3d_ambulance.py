"""Phase 3d — SB Urgences (ambulance) — backend pytest.
Couvre : types+frais, validation, demande (searching → repli simulé), espace
ambulancier réel (register→KYC→online 403→approve→online→feed→accept atomique→
ping/arrived), clôture avec débit SB Pay + split commission, admin KYC/revenue.
"""
import os
import time
import requests

def _read_env():
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                if line.startswith('REACT_APP_BACKEND_URL='):
                    return line.split('=', 1)[1].strip()
    except Exception:
        pass
    return ''


BASE = (os.environ.get('REACT_APP_BACKEND_URL') or _read_env()).rstrip('/')
API = f"{BASE}/api"

PAT = ("famtester@demo.sb", "FamTest123!")
OP = ("freeuser@demo.sb", "FreeUser123!")
ADM = ("admin@superapp.com", "SuperAdmin123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


def test_emergency_types_public():
    r = requests.get(f"{API}/ambulance/emergency-types", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert len(d["emergency_types"]) == 8
    assert all(t.get("base_fee", 0) > 0 for t in d["emergency_types"])
    assert {n["number"] for n in d["emergency_numbers"]} == {"15", "112", "18"}


def test_create_requires_position():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests", json={"emergency_type": "cardiac"}, timeout=15)
    assert r.status_code == 400


def test_create_invalid_type():
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests",
               json={"emergency_type": "nope", "pickup_lat": 48.85, "pickup_lng": 2.35}, timeout=15)
    assert r.status_code == 400


def test_create_searching_then_fallback():
    """Sans partenaire qui accepte, la demande reste 'searching' puis bascule
    sur une ambulance simulée après FALLBACK_SECONDS (~18s)."""
    s = _login(*PAT)
    r = s.post(f"{API}/ambulance/requests", json={
        "emergency_type": "burn", "pickup_lat": 48.80, "pickup_lng": 2.40,
        "payment_method": "cash"}, timeout=15)
    assert r.status_code == 200, r.text
    req = r.json()
    rid = req["id"]
    assert req["status"] == "searching"
    assert req["crew"] is None
    assert req["total_price"] > 0
    # Cancel to clean up (avoid waiting 18s).
    s.post(f"{API}/ambulance/requests/{rid}/cancel", timeout=15)


def test_operator_kyc_and_real_marketplace_flow():
    op = _login(*OP)
    adm = _login(*ADM)
    pat = _login(*PAT)

    # Register operator
    r = op.post(f"{API}/ambulance/operator/register", json={
        "company": "SOS Ambu Test", "phone": "0600", "plate": "AB-12-CD",
        "vehicle_type": "VSAV", "city": "Paris"}, timeout=15)
    assert r.status_code == 200

    # Force a non-approved state first (admin reject) so the gate is deterministic
    r = adm.get(f"{API}/admin/ambulance/operators", timeout=15)
    assert r.status_code == 200
    ops = r.json()["operators"]
    uid = next(o["user_id"] for o in ops if o.get("company") == "SOS Ambu Test")
    adm.post(f"{API}/admin/ambulance/operators/{uid}/verify", json={"action": "reject", "reason": "test"}, timeout=15)

    # Online while not approved → 403
    r = op.post(f"{API}/ambulance/operator/online", json={"online": True, "lat": 48.857, "lng": 2.354}, timeout=15)
    assert r.status_code == 403

    # Admin approves
    r = adm.post(f"{API}/admin/ambulance/operators/{uid}/verify", json={"action": "approve"}, timeout=15)
    assert r.status_code == 200 and r.json()["verification_status"] == "approved"

    # Online OK now
    r = op.post(f"{API}/ambulance/operator/online", json={"online": True, "lat": 48.857, "lng": 2.354}, timeout=15)
    assert r.status_code == 200 and r.json()["is_online"] is True

    # Patient creates a request (cash → completion never blocked by wallet balance;
    # the 15% commission split is computed & returned regardless of payment method)
    r = pat.post(f"{API}/ambulance/requests", json={
        "emergency_type": "cardiac", "pickup_lat": 48.8566, "pickup_lng": 2.3522,
        "payment_method": "cash", "patient_name": "Papa"}, timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    assert r.json()["status"] == "searching"

    # Operator sees it in feed (with distance)
    r = op.get(f"{API}/ambulance/operator/feed", timeout=15)
    feed = r.json()
    assert any(x["id"] == rid for x in feed)

    # Operator accepts (atomic, real)
    r = op.post(f"{API}/ambulance/requests/{rid}/accept", timeout=15)
    assert r.status_code == 200
    acc = r.json()
    assert acc["status"] == "en_route" and acc["operator_kind"] == "real"
    # Second accept → 409
    r = op.post(f"{API}/ambulance/requests/{rid}/accept", timeout=15)
    assert r.status_code == 409

    # Ping → ETA recomputed
    r = op.post(f"{API}/ambulance/requests/{rid}/operator-ping", json={"lat": 48.860, "lng": 2.358}, timeout=15)
    assert r.status_code == 200 and r.json()["eta_minutes"] >= 1

    # Mark arrived
    r = op.post(f"{API}/ambulance/requests/{rid}/operator-status", json={"status": "arrived"}, timeout=15)
    assert r.status_code == 200 and r.json()["status"] == "arrived"

    # Complete → commission split 15%
    r = pat.post(f"{API}/ambulance/requests/{rid}/complete", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert abs(body["commission"] - round(body["total"] * 0.15, 2)) < 0.01
    assert abs(body["operator_earning"] - round(body["total"] * 0.85, 2)) < 0.01

    # Admin revenue endpoint is reachable & well-formed
    r = adm.get(f"{API}/admin/ambulance/revenue", timeout=15)
    assert r.status_code == 200
    rev = r.json()
    assert {"count", "gmv", "commission", "operator_payout", "commission_pct"} <= set(rev)


def test_ownership_isolation():
    s1 = _login(*PAT)
    r = s1.post(f"{API}/ambulance/requests", json={
        "emergency_type": "accident", "pickup_lat": 48.80, "pickup_lng": 2.40, "payment_method": "cash"}, timeout=15)
    rid = r.json()["id"]
    s2 = _login(*OP)
    r = s2.get(f"{API}/ambulance/requests/{rid}", timeout=15)
    assert r.status_code == 404
    s1.post(f"{API}/ambulance/requests/{rid}/cancel", timeout=15)
