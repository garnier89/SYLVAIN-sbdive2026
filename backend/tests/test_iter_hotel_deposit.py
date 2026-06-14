"""SB Travel — Hôtels : caution/dépôt simulé (SB Pay). Tests HTTP.

Cycle : devis (deposit_amount) → réservation (débit séjour + caution bloquée) →
clôture admin (restitution caution − dommages) ; et annulation (remboursement séjour + caution).
"""
import os
import uuid
import requests
import pytest


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
USER = ("famtester@demo.sb", "FamTest123!")
ADMIN = ("admin@superapp.com", "SuperAdmin123!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _credit(admin_tok, user_id, amount):
    requests.post(f"{API}/admin/users/{user_id}/wallet/credit", headers=_h(admin_tok),
                  json={"amount": amount, "note": "TEST_hotel_deposit"}, timeout=10)


def _balance(tok):
    return requests.get(f"{API}/wallet", headers=_h(tok), timeout=15).json().get("balance")


def _make_room(admin_tok, deposit):
    """Crée un hôtel + chambre dédiés avec une caution donnée."""
    r = requests.post(f"{API}/hotels/admin/hotels", headers=_h(admin_tok),
                      json={"name": f"TEST_Hotel_{uuid.uuid4().hex[:6]}", "city": "TestVille", "stars": 3}, timeout=15)
    assert r.status_code == 200, r.text
    hid = r.json()["hotel"]["id"]
    r = requests.post(f"{API}/hotels/admin/hotels/{hid}/rooms", headers=_h(admin_tok),
                      json={"name": "Chambre Test", "capacity": 2, "price_per_night": 50,
                            "deposit_amount": deposit, "total_units": 3}, timeout=15)
    assert r.status_code == 200, r.text
    return hid, r.json()["room"]["id"]


@pytest.fixture(scope="module")
def ctx():
    user_tok, user = _login(*USER)
    admin_tok, _ = _login(*ADMIN)
    _credit(admin_tok, user["id"], 1000)
    return {"user_tok": user_tok, "user": user, "admin_tok": admin_tok}


def test_quote_exposes_deposit(ctx):
    _hid, room_id = _make_room(ctx["admin_tok"], deposit=120)
    r = requests.post(f"{API}/hotels/quote", headers=_h(ctx["user_tok"]),
                      json={"room_id": room_id, "check_in": "2027-05-10", "check_out": "2027-05-12", "rooms_count": 1}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["nights"] == 2
    assert d["total_price"] == 100.0           # 50 × 2 nuits
    assert d["deposit_amount"] == 120.0
    assert d["total_with_deposit"] == 220.0


def test_book_blocks_deposit_then_checkout_releases_minus_damage(ctx):
    _hid, room_id = _make_room(ctx["admin_tok"], deposit=120)
    # solde avant
    bal0 = _balance(ctx["user_tok"])
    r = requests.post(f"{API}/hotels/book", headers=_h(ctx["user_tok"]),
                      json={"room_id": room_id, "check_in": "2027-06-10", "check_out": "2027-06-12", "rooms_count": 1, "guests": 2}, timeout=15)
    assert r.status_code == 200, r.text
    bk = r.json()["booking"]
    assert bk["deposit_status"] == "held"
    assert bk["deposit_held_amount"] == 120.0
    assert bk["total_price"] == 100.0
    # 100 (séjour) + 120 (caution) = 220 débités
    assert round(bal0 - r.json()["balance"], 2) == 220.0

    # clôture admin avec 30€ de dommages → restitue 90€
    r = requests.post(f"{API}/hotels/admin/bookings/{bk['id']}/checkout", headers=_h(ctx["admin_tok"]),
                      json={"damage_fees": 30}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["deposit_refunded"] == 90.0
    assert r.json()["damage_fees"] == 30.0
    assert r.json()["status"] == "completed"

    # la réservation reflète released
    mine = requests.get(f"{API}/hotels/bookings/my", headers=_h(ctx["user_tok"]), timeout=15).json()["bookings"]
    got = next(b for b in mine if b["id"] == bk["id"])
    assert got["deposit_status"] == "released"
    assert got["deposit_refunded"] == 90.0


def test_cancel_refunds_room_and_deposit(ctx):
    _hid, room_id = _make_room(ctx["admin_tok"], deposit=120)
    bal0 = _balance(ctx["user_tok"])
    r = requests.post(f"{API}/hotels/book", headers=_h(ctx["user_tok"]),
                      json={"room_id": room_id, "check_in": "2027-07-10", "check_out": "2027-07-11", "rooms_count": 1}, timeout=15)
    assert r.status_code == 200, r.text
    bk = r.json()["booking"]
    bal_after_book = r.json()["balance"]
    assert round(bal0 - bal_after_book, 2) == 170.0   # 50 séjour + 120 caution

    r = requests.post(f"{API}/hotels/bookings/{bk['id']}/cancel", headers=_h(ctx["user_tok"]), json={}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["refunded"] == 170.0              # séjour + caution remboursés (annulation avant arrivée)
    bal_final = _balance(ctx["user_tok"])
    assert round(bal_final, 2) == round(bal0, 2)


def test_checkout_damage_capped_at_deposit(ctx):
    _hid, room_id = _make_room(ctx["admin_tok"], deposit=100)
    r = requests.post(f"{API}/hotels/book", headers=_h(ctx["user_tok"]),
                      json={"room_id": room_id, "check_in": "2027-08-10", "check_out": "2027-08-11", "rooms_count": 1}, timeout=15)
    bk = r.json()["booking"]
    # dommages 500€ > caution 100€ → plafonné à 100, restitution 0
    r = requests.post(f"{API}/hotels/admin/bookings/{bk['id']}/checkout", headers=_h(ctx["admin_tok"]),
                      json={"damage_fees": 500}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["damage_fees"] == 100.0
    assert r.json()["deposit_refunded"] == 0.0
