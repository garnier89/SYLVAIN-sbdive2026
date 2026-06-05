"""iter116 — unified Service Settings panel: backend coverage."""
import os
import pytest
import requests

BASE = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/') + '/api'
ADMIN = {'email': 'admin@superapp.com', 'password': 'SuperAdmin123!'}
USER = {'email': 'rx.qa@demo.sb', 'password': 'RxQa123!'}

EXPECTED_KEYS = {'taxi', 'moto', 'parcels', 'food', 'delivery', 'medical_transport', 'pharmacy'}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope='module')
def admin():
    return _login(ADMIN)


@pytest.fixture(scope='module')
def user():
    return _login(USER)


# ───────────────── admin list ─────────────────
def test_admin_list_returns_seven_services(admin):
    r = admin.get(f"{BASE}/admin/services/settings", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    keys = {svc['service_key'] for svc in data}
    assert EXPECTED_KEYS.issubset(keys), f"missing: {EXPECTED_KEYS - keys}"
    by_key = {svc['service_key']: svc for svc in data}
    for k in EXPECTED_KEYS:
        s = by_key[k]
        assert 'label' in s and 'icon' in s
        assert 'fields_schema' in s and isinstance(s['fields_schema'], list)
        assert 'active' in s and 'info_note' in s and 'fields' in s
        if k == 'pharmacy':
            assert s['advanced_link'] == '/admin/pharmacy'
            assert s['fields_schema'] == []
        else:
            assert s.get('advanced_link') in (None,)


# ───────────────── admin update taxi ─────────────────
def test_admin_update_taxi_whitelist_and_persist(admin):
    payload = {
        'active': False,
        'info_note': 'TEST_iter116_note',
        'fields': {
            'base_fare': 3.333,         # will be rounded to 3.33
            'per_km': '1.45',           # string coerced
            'per_min': 0.5,
            'min_fare': 7,
            'booking_fee': 0.25,
            'cancellation_fee': 1.5,
            'unknown_field': 999,       # must be ignored (whitelist)
            'evil': 'haxx',
        },
    }
    r = admin.put(f"{BASE}/admin/services/settings/taxi", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['active'] is False
    assert body['info_note'] == 'TEST_iter116_note'
    assert 'unknown_field' not in body['fields']
    assert 'evil' not in body['fields']
    assert body['fields']['base_fare'] == 3.33
    assert body['fields']['per_km'] == 1.45

    # Re-GET reflects values
    r2 = admin.get(f"{BASE}/admin/services/settings/taxi", timeout=15)
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2['active'] is False
    assert b2['info_note'] == 'TEST_iter116_note'
    assert b2['fields']['base_fare'] == 3.33
    assert b2['fields']['per_km'] == 1.45
    assert b2['fields']['min_fare'] == 7.0


# ───────────────── public reflects admin ─────────────────
def test_public_taxi_reflects_admin(user):
    r = user.get(f"{BASE}/services/taxi/settings", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body['service_key'] == 'taxi'
    assert body['active'] is False
    assert body['info_note'] == 'TEST_iter116_note'
    assert body['fields']['base_fare'] == 3.33


# ───────────────── 404 / 403 ─────────────────
def test_unknown_service_404(admin):
    r = admin.get(f"{BASE}/admin/services/settings/zzz", timeout=15)
    assert r.status_code == 404
    r2 = admin.put(f"{BASE}/admin/services/settings/zzz", json={'active': True, 'info_note': '', 'fields': {}}, timeout=15)
    assert r2.status_code == 404


def test_user_put_forbidden(user):
    r = user.put(f"{BASE}/admin/services/settings/taxi", json={'active': True, 'info_note': '', 'fields': {}}, timeout=15)
    assert r.status_code == 403


# ───────────────── teardown: restore taxi defaults ─────────────────
def test_zz_restore_taxi_defaults(admin):
    payload = {
        'active': True, 'info_note': '',
        'fields': {
            'base_fare': 2.5, 'per_km': 1.2, 'per_min': 0.3,
            'min_fare': 5, 'booking_fee': 0, 'cancellation_fee': 0,
        },
    }
    r = admin.put(f"{BASE}/admin/services/settings/taxi", json=payload, timeout=15)
    assert r.status_code == 200
    b = r.json()
    assert b['active'] is True and b['info_note'] == ''
    assert b['fields']['base_fare'] == 2.5
