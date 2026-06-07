"""Iteration 150 — Validate App Settings feature flags actually gate platform behavior.

Focus:
- taxi_hail_option toggles 403 on POST /api/rides/taxi-hall
- ask_otp_before_start toggles 400 'Code requis' vs 200 on phase1 start-otp/verify
- App Settings GET/PUT persists & survives reload (re-GET)
- Restore defaults at the end.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}

DEFAULTS = {
    "taxi_hail_option": True,
    "ask_otp_before_start": True,
    "enable_pool": True,
    "enable_driver_wallet_withdrawal": False,
    "enable_donation": True,
    "enable_referral_system": True,
    "enable_gift_card": True,
    "enable_favorite_driver": False,
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(**ADMIN)


@pytest.fixture(scope="module")
def driver_token():
    return _login(**DRIVER)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def driver_h(driver_token):
    return {"Authorization": f"Bearer {driver_token}"}


def _get_settings():
    r = requests.get(f"{BASE_URL}/api/config/app-settings", timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _save_settings(admin_h, full_settings):
    r = requests.put(f"{BASE_URL}/api/config/admin/app-settings", json=full_settings, headers=admin_h, timeout=15)
    assert r.status_code == 200, f"save failed: {r.status_code} {r.text}"
    return r.json()


def _patch_flag(admin_h, key, value):
    """Merge value into full current settings then save (full body sent)."""
    cur = _get_settings()
    cur[key] = value
    return _save_settings(admin_h, cur)


@pytest.fixture(scope="module", autouse=True)
def restore_defaults_at_end(admin_h):
    yield
    cur = _get_settings()
    cur.update(DEFAULTS)
    _save_settings(admin_h, cur)


# ── Test 1: app-settings GET is public, returns dict with known flags
class TestAppSettingsBase:
    def test_public_get_returns_known_flags(self):
        s = _get_settings()
        assert isinstance(s, dict)
        for k in DEFAULTS:
            assert k in s, f"flag {k} missing from /api/config/app-settings"

    def test_admin_put_persists_across_reads(self, admin_h):
        cur = _get_settings()
        original = cur.get("enable_donation", True)
        new_val = not bool(original)
        cur["enable_donation"] = new_val
        _save_settings(admin_h, cur)
        again = _get_settings()
        assert again.get("enable_donation") == new_val
        # restore
        cur["enable_donation"] = original
        _save_settings(admin_h, cur)
        again2 = _get_settings()
        assert again2.get("enable_donation") == original

    def test_put_requires_admin(self):
        r = requests.put(f"{BASE_URL}/api/config/admin/app-settings", json={"taxi_hail_option": True}, timeout=15)
        assert r.status_code in (401, 403), f"unauth PUT should be denied: {r.status_code}"


# ── Test 2: taxi_hail_option gates /api/rides/taxi-hall
class TestTaxiHailFlag:
    def test_taxi_hall_403_when_disabled(self, admin_h, driver_h):
        _patch_flag(admin_h, "taxi_hail_option", False)
        time.sleep(0.3)
        r = requests.post(
            f"{BASE_URL}/api/rides/taxi-hall",
            json={"vehicle_type": "sb", "dropoff_address": "TEST"},
            headers=driver_h, timeout=15,
        )
        assert r.status_code == 403, f"expected 403 when disabled, got {r.status_code} {r.text}"
        assert "désactiv" in r.text.lower() or "disable" in r.text.lower()

    def test_taxi_hall_allowed_when_enabled(self, admin_h, driver_h):
        _patch_flag(admin_h, "taxi_hail_option", True)
        time.sleep(0.3)
        r = requests.post(
            f"{BASE_URL}/api/rides/taxi-hall",
            json={"vehicle_type": "sb", "dropoff_address": "TEST_HALL_GATING"},
            headers=driver_h, timeout=15,
        )
        # Should NOT be 403; either 200 success or other (e.g. 400) but never blocked by the flag
        assert r.status_code != 403, f"expected NOT 403 when enabled, got {r.status_code} {r.text}"
        # cleanup created ride if 200
        if r.status_code == 200:
            data = r.json()
            ride_id = data.get("id") or (data.get("ride") or {}).get("id")
            if ride_id:
                # try to cancel/complete — best effort
                requests.post(
                    f"{BASE_URL}/api/rides/{ride_id}/status",
                    json={"status": "cancelled", "cancel_reason": "test_cleanup"},
                    headers=driver_h, timeout=10,
                )


# ── Test 3: ask_otp_before_start gates phase1 start-otp/verify behavior
class TestAskOtpFlag:
    """We test the gating logic in isolation without needing a real accepted ride:
    sending a non-existent ride_id will short-circuit with 404 regardless of the
    flag. So we exercise the flag by sending an empty OTP with a known invalid
    ride and expect either 400 'Code requis' (flag=true) or 404 (flag=false →
    passes gating, hits ride lookup) — but driver auth check is BEFORE that.

    Order in code: auth -> driver-role -> ride lookup -> body parse -> phone/otp logic.
    So with no ride, we always get 404. To validate the gating end-to-end, we
    seed a minimal accepted ride in DB then test verify.
    """

    @pytest.fixture(scope="class")
    def seeded_ride(self, driver_h):
        # Create a ride as a fake passenger via /api/auth/register, request a ride,
        # then have the driver accept it.
        import uuid as _u
        rider_email = f"test_otp_rider_{_u.uuid4().hex[:8]}@test.sb"
        reg = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": rider_email, "password": "Rider2026!", "name": "OTP Rider",
            "phone": f"+33611{int(time.time()) % 100000:05d}", "role": "user",
        }, timeout=15)
        if reg.status_code not in (200, 201):
            pytest.skip(f"could not register rider: {reg.status_code} {reg.text[:200]}")
        rider_token = reg.json().get("access_token") or reg.json().get("token")
        rider_h = {"Authorization": f"Bearer {rider_token}"}

        ride_payload = {
            "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris C",
            "dropoff_lat": 48.86, "dropoff_lng": 2.36, "dropoff_address": "TEST_OTP_DROP",
            "vehicle_type": "sb", "payment_method": "cash",
        }
        cr = requests.post(f"{BASE_URL}/api/rides", json=ride_payload, headers=rider_h, timeout=15)
        if cr.status_code not in (200, 201):
            pytest.skip(f"could not create ride: {cr.status_code} {cr.text[:200]}")
        ride_id = cr.json().get("id")

        # Driver accepts
        ar = requests.post(f"{BASE_URL}/api/rides/{ride_id}/accept", headers=driver_h, timeout=15)
        if ar.status_code != 200:
            # cleanup
            requests.post(f"{BASE_URL}/api/rides/{ride_id}/cancel", json={"reason": "cleanup"}, headers=rider_h, timeout=10)
            pytest.skip(f"driver couldn't accept ride: {ar.status_code} {ar.text[:200]}")

        yield {"ride_id": ride_id, "rider_h": rider_h}

        # cleanup: cancel ride (if not yet completed)
        try:
            requests.post(f"{BASE_URL}/api/rides/{ride_id}/status",
                          json={"status": "cancelled", "cancel_reason": "test_cleanup"},
                          headers=driver_h, timeout=10)
        except Exception:
            pass

    def test_verify_requires_code_when_flag_true(self, admin_h, driver_h, seeded_ride):
        _patch_flag(admin_h, "ask_otp_before_start", True)
        time.sleep(0.3)
        ride_id = seeded_ride["ride_id"]
        r = requests.post(
            f"{BASE_URL}/api/phase1/rides/{ride_id}/start-otp/verify",
            json={},  # no OTP
            headers=driver_h, timeout=15,
        )
        assert r.status_code == 400, f"expected 400 'Code requis' when flag=true, got {r.status_code} {r.text}"
        assert "code" in r.text.lower() or "requis" in r.text.lower()

    def test_verify_allows_skip_when_flag_false(self, admin_h, driver_h, seeded_ride):
        _patch_flag(admin_h, "ask_otp_before_start", False)
        time.sleep(0.3)
        ride_id = seeded_ride["ride_id"]
        r = requests.post(
            f"{BASE_URL}/api/phase1/rides/{ride_id}/start-otp/verify",
            json={"skip_otp": True},  # empty otp + skip allowed
            headers=driver_h, timeout=15,
        )
        assert r.status_code == 200, f"expected 200 when flag=false, got {r.status_code} {r.text}"
        # ride should be in_progress now
        gr = requests.get(f"{BASE_URL}/api/rides/{ride_id}", headers=driver_h, timeout=10)
        assert gr.status_code == 200
        assert gr.json().get("status") == "in_progress"


# ── Test 4: Other gating flags are present and persistable
class TestOtherFlags:
    @pytest.mark.parametrize("flag", [
        "enable_pool", "enable_driver_wallet_withdrawal", "enable_donation",
        "enable_referral_system", "enable_gift_card", "enable_favorite_driver",
        "driver_wallet_withdrawal_restriction_min",
    ])
    def test_flag_persists(self, admin_h, flag):
        cur = _get_settings()
        assert flag in cur, f"flag {flag} missing in public app-settings"
        original = cur[flag]
        if isinstance(original, bool):
            new_val = not original
        elif isinstance(original, (int, float)):
            new_val = int(original) + 13
        else:
            new_val = "test_value"
        cur[flag] = new_val
        _save_settings(admin_h, cur)
        again = _get_settings()
        # int may come back as int
        if isinstance(original, (int, float)):
            assert int(again[flag]) == int(new_val), f"{flag} did not persist: got {again[flag]}"
        else:
            assert again[flag] == new_val, f"{flag} did not persist: got {again[flag]}"
        # restore
        cur[flag] = original
        _save_settings(admin_h, cur)
