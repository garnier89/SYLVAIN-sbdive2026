"""Iter332 — Duffel HOLD ORDER (block fare without paying).

Tests:
- /api/flights/live/search — Business cabin offers expose hold_available / payment_required_by / price_guarantee_expires_at
- /api/flights/live/hold — creates a held booking with PNR, no wallet debit, status='held'
- /api/flights/live/hold — non-eligible (instant payment) offer -> 409
- /api/flights/live/bookings/{id}/pay — held -> confirmed, wallet debited only at this step
- /api/flights/live/bookings/{id}/pay — non-existent / already-paid -> 404
- /api/flights/live/bookings/{id}/pay — insufficient balance -> 400
- Regression: /live/book, /bookings/{id}/eticket, mock endpoints still work
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "client@test.sb"
CLIENT_PASSWORD = "Client123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"

FUTURE_DATE = "2026-09-15"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("session_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data


def _topup(admin_s, user_id, amount):
    return admin_s.post(f"{API}/admin/users/{user_id}/wallet/credit",
                        json={"amount": amount, "reason": "iter332 hold test top-up"}, timeout=15)


def _get_balance(s):
    r = s.get(f"{API}/wallet", timeout=15)
    if r.status_code == 200:
        d = r.json()
        return float(d.get("balance") or d.get("wallet", {}).get("balance") or 0)
    return None


@pytest.fixture(scope="module")
def client_session():
    s, _ = _login(CLIENT_EMAIL, CLIENT_PASSWORD)
    me = s.get(f"{API}/auth/me", timeout=15).json()
    user_id = me.get("id") or me.get("user", {}).get("id")
    admin_s, _ = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    # Ensure enough balance for a Business fare (~1300 EUR)
    _topup(admin_s, user_id, 5000)
    return s, user_id, admin_s


def _search_business(s, origin="LHR", destination="JFK"):
    r = s.get(f"{API}/flights/live/search",
              params={"origin": origin, "destination": destination, "date": FUTURE_DATE,
                      "passengers": 1, "cabin_class": "business"}, timeout=90)
    assert r.status_code == 200, f"search business failed: {r.status_code} {r.text[:300]}"
    return r.json()


def _search_economy(s, origin="LHR", destination="JFK"):
    r = s.get(f"{API}/flights/live/search",
              params={"origin": origin, "destination": destination, "date": FUTURE_DATE,
                      "passengers": 1, "cabin_class": "economy"}, timeout=90)
    assert r.status_code == 200
    return r.json()


def _pick_hold_offer(offers):
    for o in offers:
        if o.get("hold_available"):
            return o
    return None


def _pick_non_hold_offer(offers):
    for o in offers:
        if not o.get("hold_available"):
            return o
    return None


# ============================================================
# /live/search — hold metadata
# ============================================================
class TestSearchHoldMetadata:
    def test_business_offers_expose_hold_fields(self, client_session):
        s, _, _ = client_session
        data = _search_business(s)
        offers = data.get("offers") or []
        assert offers, "no business offers"
        for o in offers:
            for k in ("hold_available", "payment_required_by", "price_guarantee_expires_at"):
                assert k in o, f"missing key {k} in offer"
            assert isinstance(o["hold_available"], bool)
        # at least one offer must be hold-eligible on business
        hold_offers = [o for o in offers if o["hold_available"]]
        assert hold_offers, "expected >=1 hold-eligible business offer"
        # store
        pytest.iter332_search = data


# ============================================================
# /live/hold — happy path + edge cases
# ============================================================
class TestLiveHold:
    def test_hold_success_no_debit(self, client_session):
        s, _, _ = client_session
        bal_before = _get_balance(s)
        data = _search_business(s)
        offer = _pick_hold_offer(data["offers"])
        if not offer:
            pytest.skip("no hold-eligible offer in current Duffel response")
        payload = {
            "offer_request_id": data["offer_request_id"],
            "offer_id": offer["id"],
            "passengers": [{"title": "mr", "gender": "m", "given_name": "Marc",
                            "family_name": "Dupont", "born_on": "1985-03-20"}],
            "contact_email": "marc.dupont@example.com",
            "contact_phone": "+33612345678",
        }
        r = s.post(f"{API}/flights/live/hold", json=payload, timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        assert body.get("ok") is True
        bk = body.get("booking") or {}
        assert bk.get("status") == "held", f"expected status=held got {bk.get('status')}"
        assert bk.get("pnr"), "PNR must be present"
        assert bk.get("payment_required_by"), "payment_required_by must be present"
        assert bk.get("payment_status") == "awaiting_payment"
        pytest.iter332_booking_id = bk["id"]
        pytest.iter332_total = bk.get("total_price")
        # Wallet must NOT be debited
        bal_after = _get_balance(s)
        if bal_before is not None and bal_after is not None:
            assert abs(bal_after - bal_before) < 0.01, \
                f"wallet was debited on hold! before={bal_before} after={bal_after}"

    def test_hold_on_non_eligible_offer_returns_409(self, client_session):
        s, _, _ = client_session
        # Economy LHR->JFK typically requires_instant_payment=True
        data = _search_economy(s)
        offer = _pick_non_hold_offer(data["offers"])
        if not offer:
            pytest.skip("no instant-payment-only offer found")
        payload = {
            "offer_request_id": data["offer_request_id"],
            "offer_id": offer["id"],
            "passengers": [{"title": "mr", "gender": "m", "given_name": "Marc",
                            "family_name": "Dupont", "born_on": "1985-03-20"}],
            "contact_email": "marc@example.com",
            "contact_phone": "+33612345678",
        }
        r = s.post(f"{API}/flights/live/hold", json=payload, timeout=60)
        assert r.status_code == 409, f"expected 409, got {r.status_code}: {r.text[:200]}"


# ============================================================
# /live/bookings/{id}/pay
# ============================================================
class TestLivePay:
    def test_pay_held_booking_confirms_and_debits(self, client_session):
        s, _, _ = client_session
        booking_id = getattr(pytest, "iter332_booking_id", None)
        if not booking_id:
            pytest.skip("no held booking from previous test")
        bal_before = _get_balance(s)
        r = s.post(f"{API}/flights/live/bookings/{booking_id}/pay", timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        body = r.json()
        bk = body.get("booking") or {}
        assert bk.get("status") == "confirmed"
        assert bk.get("payment_status") == "paid"
        assert bk.get("pnr"), "PNR must be present after pay"
        new_balance = body.get("balance")
        assert isinstance(new_balance, (int, float))
        if bal_before is not None:
            expected_delta = float(bk.get("total_price") or 0)
            assert abs((bal_before - new_balance) - expected_delta) < 0.5, \
                f"unexpected debit delta: before={bal_before} after={new_balance} expected_debit={expected_delta}"

    def test_pay_already_paid_returns_404(self, client_session):
        s, _, _ = client_session
        booking_id = getattr(pytest, "iter332_booking_id", None)
        if not booking_id:
            pytest.skip("no booking")
        r = s.post(f"{API}/flights/live/bookings/{booking_id}/pay", timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_pay_nonexistent_returns_404(self, client_session):
        s, _, _ = client_session
        r = s.post(f"{API}/flights/live/bookings/fbk_doesnotexist/pay", timeout=30)
        assert r.status_code == 404

    def test_pay_insufficient_balance_returns_400(self, client_session):
        s, user_id, admin_s = client_session
        # create a fresh hold
        data = _search_business(s)
        offer = _pick_hold_offer(data["offers"])
        if not offer:
            pytest.skip("no hold-eligible offer")
        payload = {
            "offer_request_id": data["offer_request_id"],
            "offer_id": offer["id"],
            "passengers": [{"title": "ms", "gender": "f", "given_name": "Sophie",
                            "family_name": "Martin", "born_on": "1988-06-10"}],
            "contact_email": "sophie@example.com",
            "contact_phone": "+33612345679",
        }
        r = s.post(f"{API}/flights/live/hold", json=payload, timeout=90)
        if r.status_code != 200:
            pytest.skip(f"could not create second hold: {r.status_code}")
        bk = r.json()["booking"]
        bid = bk["id"]
        # drain wallet by debiting to 0 (use admin debit endpoint if exists, otherwise large credit reverse)
        cur_bal = _get_balance(s)
        if cur_bal and cur_bal > 0:
            # try debit endpoint
            dr = admin_s.post(f"{API}/admin/users/{user_id}/wallet/debit",
                              json={"amount": cur_bal, "reason": "iter332 drain"}, timeout=15)
            if dr.status_code != 200:
                # fallback: try negative credit
                admin_s.post(f"{API}/admin/users/{user_id}/wallet/credit",
                             json={"amount": -cur_bal, "reason": "iter332 drain"}, timeout=15)
        post_bal = _get_balance(s)
        if post_bal is None or post_bal >= float(bk.get("total_price") or 9999):
            pytest.skip(f"could not drain wallet (balance={post_bal})")
        r2 = s.post(f"{API}/flights/live/bookings/{bid}/pay", timeout=60)
        assert r2.status_code == 400, f"expected 400 got {r2.status_code}: {r2.text[:200]}"
        # restore balance
        _topup(admin_s, user_id, 5000)


# ============================================================
# Regression — /live/book + mock endpoints
# ============================================================
class TestRegression:
    def test_live_book_still_works(self, client_session):
        s, user_id, admin_s = client_session
        _topup(admin_s, user_id, 2000)
        data = _search_economy(s)
        offer = data["offers"][0]
        payload = {
            "offer_request_id": data["offer_request_id"],
            "offer_id": offer["id"],
            "passengers": [{"title": "mr", "gender": "m", "given_name": "Jean",
                            "family_name": "Dupont", "born_on": "1990-05-15"}],
            "contact_email": "jean.dupont@example.com",
            "contact_phone": "+33612345678",
        }
        r = s.post(f"{API}/flights/live/book", json=payload, timeout=90)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        bk = r.json().get("booking") or {}
        assert bk.get("pnr")
        pytest.iter332_live_book_id = bk["id"]

    def test_eticket_pdf(self, client_session):
        s, _, _ = client_session
        bid = getattr(pytest, "iter332_live_book_id", None) or getattr(pytest, "iter332_booking_id", None)
        if not bid:
            pytest.skip("no booking id")
        r = s.get(f"{API}/flights/bookings/{bid}/eticket", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_mock_airports(self, client_session):
        s, _, _ = client_session
        r = s.get(f"{API}/flights/airports", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "origins" in d and "destinations" in d

    def test_mock_search(self, client_session):
        s, _, _ = client_session
        r = s.get(f"{API}/flights", timeout=15)
        assert r.status_code == 200
        assert "flights" in r.json()
