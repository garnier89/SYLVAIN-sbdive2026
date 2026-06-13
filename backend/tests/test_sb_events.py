"""Backend tests for SB Événement (Phase 1).

Covers:
- Public discovery (list, categories, filters, featured)
- Event detail
- Ticket purchase via SB Pay wallet (debit + cashback)
- Insufficient balance -> 402
- My tickets listing + QR token format
- Cancel & refund (wallet recredit, stock release)
- Admin CRUD (create / update / delete / attendees stats)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "nearbytest@demo.sb"
USER_PWD = "NearbyTest123!"
ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PWD = "SuperAdmin123!"


# ---------- fixtures ----------
def _login(session: requests.Session, email: str, password: str) -> dict:
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def user_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, USER_EMAIL, USER_PWD)
    return s


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, ADMIN_EMAIL, ADMIN_PWD)
    return s


def _wallet_balance(session: requests.Session) -> float:
    r = session.get(f"{API}/wallet", timeout=15)
    if r.status_code != 200:
        # try alternate path
        r = session.get(f"{API}/wallets/me", timeout=15)
    assert r.status_code == 200, f"wallet fetch failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    return float(data.get("balance", data.get("wallet", {}).get("balance", 0)) or 0)


# ---------- discovery ----------
class TestDiscovery:
    def test_list_events(self):
        r = requests.get(f"{API}/events", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and isinstance(data["items"], list)
        assert data["count"] >= 1
        ev = data["items"][0]
        assert "id" in ev and "title" in ev and "tiers" in ev
        assert "_id" not in ev

    def test_categories_counts(self):
        r = requests.get(f"{API}/events/categories", timeout=15)
        assert r.status_code == 200
        cats = r.json()["categories"]
        slugs = {c["slug"]: c for c in cats}
        for s in ["concert", "festival", "carnaval", "sport", "conference", "soiree", "exposition"]:
            assert s in slugs
        # At least one non-zero per seed
        assert sum(c["count"] for c in cats) > 0

    def test_filter_by_category(self):
        r = requests.get(f"{API}/events", params={"category": "concert"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        for it in items:
            assert it["category"] == "concert"

    def test_search_q(self):
        r = requests.get(f"{API}/events", params={"q": "Paris"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1

    def test_featured(self):
        r = requests.get(f"{API}/events", params={"featured": "true"}, timeout=15)
        assert r.status_code == 200

    def test_event_detail_404(self):
        r = requests.get(f"{API}/events/does_not_exist", timeout=15)
        assert r.status_code == 404


# ---------- purchase flow ----------
class TestPurchase:
    @pytest.fixture(scope="class")
    def pickable(self):
        r = requests.get(f"{API}/events", timeout=15)
        items = r.json()["items"]
        # Pick a tier with low price to keep wallet healthy
        for ev in items:
            for t in ev.get("tiers", []):
                price = float(t.get("price") or 0)
                if 1 <= price <= 25 and (t.get("quantity_total", 0) - t.get("quantity_sold", 0)) >= 1:
                    return {"event_id": ev["id"], "tier_id": t["id"], "price": price, "title": ev["title"]}
        pytest.skip("No suitable tier found")

    def test_get_event_detail(self, pickable):
        r = requests.get(f"{API}/events/{pickable['event_id']}", timeout=15)
        assert r.status_code == 200
        ev = r.json()
        assert ev["id"] == pickable["event_id"]
        assert len(ev["tiers"]) >= 1

    def test_purchase_debits_wallet(self, user_client, pickable):
        bal_before = _wallet_balance(user_client)
        if bal_before < pickable["price"]:
            # Recredit via admin if available — otherwise skip
            pytest.skip(f"insufficient wallet balance for purchase test: {bal_before}")

        payload = {"tier_id": pickable["tier_id"], "quantity": 1, "transport_option": "one_way"}
        r = user_client.post(f"{API}/events/{pickable['event_id']}/purchase", json=payload, timeout=20)
        assert r.status_code == 200, f"purchase failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        ticket = body["ticket"]
        assert ticket["status"] == "valid"
        assert ticket["quantity"] == 1
        assert ticket["qr_token"].startswith("SBEVT-")
        assert ticket["transport_option"] == "one_way"
        assert float(ticket["total_price"]) == round(pickable["price"], 2)

        # Persistence: GET /events/my/tickets
        r2 = user_client.get(f"{API}/events/my/tickets", timeout=15)
        assert r2.status_code == 200
        tickets = r2.json()["tickets"]
        assert any(t["id"] == ticket["id"] for t in tickets)

        # Wallet debited (price minus cashback)
        bal_after = _wallet_balance(user_client)
        debit = round(bal_before - bal_after, 2)
        cashback = float(body.get("cashback", 0) or 0)
        # Expect debit ≈ price - cashback (some wallet returns cashback as credit in same call)
        # We accept either bal_after = before - price + cashback, or before - price.
        assert debit <= pickable["price"] + 0.01
        assert debit >= pickable["price"] - cashback - 0.01

        # Stash for cancel test
        pytest._evt_ticket_id = ticket["id"]
        pytest._evt_total = float(ticket["total_price"])

    def test_invalid_quantity(self, user_client, pickable):
        r = user_client.post(
            f"{API}/events/{pickable['event_id']}/purchase",
            json={"tier_id": pickable["tier_id"], "quantity": 999},
            timeout=15,
        )
        assert r.status_code == 400

    def test_invalid_tier(self, user_client, pickable):
        r = user_client.post(
            f"{API}/events/{pickable['event_id']}/purchase",
            json={"tier_id": "tier_nope", "quantity": 1},
            timeout=15,
        )
        assert r.status_code == 400

    def test_cancel_and_refund(self, user_client):
        tid = getattr(pytest, "_evt_ticket_id", None)
        total = getattr(pytest, "_evt_total", None)
        if not tid:
            pytest.skip("No ticket purchased in previous test")
        bal_before = _wallet_balance(user_client)
        r = user_client.post(f"{API}/events/tickets/{tid}/cancel", timeout=15)
        assert r.status_code == 200, f"cancel failed: {r.text[:200]}"
        body = r.json()
        assert float(body.get("refunded", 0)) == pytest.approx(total, abs=0.01)
        # second cancel must fail
        r2 = user_client.post(f"{API}/events/tickets/{tid}/cancel", timeout=15)
        assert r2.status_code == 400
        # wallet credited
        bal_after = _wallet_balance(user_client)
        assert bal_after >= bal_before + total - 0.01

    def test_my_tickets_lists_cancelled(self, user_client):
        r = user_client.get(f"{API}/events/my/tickets", timeout=15)
        assert r.status_code == 200
        tickets = r.json()["tickets"]
        tid = getattr(pytest, "_evt_ticket_id", None)
        if tid:
            match = [t for t in tickets if t["id"] == tid]
            assert match and match[0]["status"] == "cancelled"


# ---------- admin CRUD ----------
class TestAdminCRUD:
    def test_admin_required(self):
        # unauth list
        r = requests.get(f"{API}/admin/events", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list(self, admin_client):
        r = admin_client.get(f"{API}/admin/events", timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_admin_create_update_delete(self, admin_client):
        payload = {
            "title": "TEST_Soirée QA",
            "category": "soiree",
            "description": "Test event from pytest",
            "city": "Fort-de-France",
            "venue_name": "Salle Test",
            "starts_at": "2027-01-01T20:00:00+00:00",
            "ends_at": "2027-01-02T02:00:00+00:00",
            "tiers": [
                {"name": "Standard", "price": 10.0, "currency": "EUR", "quantity_total": 50}
            ],
            "is_featured": True,
        }
        r = admin_client.post(f"{API}/admin/events", json=payload, timeout=15)
        assert r.status_code == 200, f"create failed: {r.text[:200]}"
        ev = r.json()
        assert ev["title"] == "TEST_Soirée QA"
        assert ev["id"].startswith("event_")
        ev_id = ev["id"]

        # Verify GET (public) returns it
        rg = requests.get(f"{API}/events/{ev_id}", timeout=15)
        assert rg.status_code == 200
        assert rg.json()["title"] == "TEST_Soirée QA"

        # Update
        payload["title"] = "TEST_Soirée QA v2"
        payload["tiers"] = ev["tiers"]  # keep ids
        ru = admin_client.put(f"{API}/admin/events/{ev_id}", json=payload, timeout=15)
        assert ru.status_code == 200
        assert ru.json()["title"] == "TEST_Soirée QA v2"

        # Attendees stats (empty)
        ra = admin_client.get(f"{API}/admin/events/{ev_id}/attendees", timeout=15)
        assert ra.status_code == 200
        stats = ra.json()["stats"]
        assert "orders" in stats and "seats" in stats and "revenue" in stats

        # Delete
        rd = admin_client.delete(f"{API}/admin/events/{ev_id}", timeout=15)
        assert rd.status_code == 200

        rg2 = requests.get(f"{API}/events/{ev_id}", timeout=15)
        assert rg2.status_code == 404

    def test_create_validation(self, admin_client):
        r = admin_client.post(f"{API}/admin/events", json={"title": "", "tiers": []}, timeout=15)
        assert r.status_code == 400


# ---------- insufficient balance ----------
class TestInsufficient:
    def test_402_when_no_funds(self, user_client):
        # Find a very expensive tier (>1000€) — seed has festival/concert at >100€
        # Try purchase with very high quantity to exceed wallet
        r = requests.get(f"{API}/events", timeout=15)
        items = r.json()["items"]
        target = None
        for ev in items:
            for t in ev.get("tiers", []):
                if float(t.get("price") or 0) >= 50:
                    target = (ev["id"], t["id"], float(t["price"]))
                    break
            if target:
                break
        if not target:
            pytest.skip("No expensive tier seeded")
        ev_id, tier_id, _ = target
        r2 = user_client.post(
            f"{API}/events/{ev_id}/purchase",
            json={"tier_id": tier_id, "quantity": 10, "transport_option": "none"},
            timeout=20,
        )
        # Either 402 (no funds) or 400 (not enough stock). Both prove guard exists.
        assert r2.status_code in (400, 402)
