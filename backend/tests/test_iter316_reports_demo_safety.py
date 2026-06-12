"""Iter 316 — P2 batch: report charts, scheduled email reports, global demo
mode toggle, and driver safety audio recordings.

Run: pytest backend/tests/test_iter316_reports_demo_safety.py -v
"""
import os
import io
import wave
import struct
import uuid
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
DRIVER = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}


def _session(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


def _wav_bytes():
    buf = io.BytesIO()
    w = wave.open(buf, "wb")
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
    for i in range(4000):
        w.writeframes(struct.pack("<h", (i % 50) * 200))
    w.close()
    return buf.getvalue()


def test_reports_include_chart():
    s = _session(ADMIN)
    for kind in ("results", "payments", "exceptional", "refused-cancelled", "other",
                 "referral", "wallet", "rewards", "insurance"):
        r = s.get(f"{API}/admin/reports/{kind}", params={"date_from": "2026-05-01", "date_to": "2026-06-12"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "chart" in body and body["chart"], f"{kind} missing chart"
        ch = body["chart"]
        assert ch["type"] in ("line", "bar")
        assert isinstance(ch.get("series"), list) and ch["series"]
        assert "data" in ch
        assert isinstance(body.get("kpis"), list) and body["kpis"], f"{kind} missing kpis"


def test_report_schedule_crud_and_send():
    s = _session(ADMIN)
    created = s.post(f"{API}/admin/reports/schedules", json={
        "name": "Pytest schedule", "kinds": ["results", "payments"],
        "recipients": ["somosylv@gmail.com"], "frequency": "weekly", "window": "last_7d",
        "send_hour": 8, "send_day": 0,
    }, timeout=20)
    assert created.status_code == 200, created.text
    sid = created.json()["id"]

    # list
    lst = s.get(f"{API}/admin/reports/schedules", timeout=20)
    assert any(x["id"] == sid for x in lst.json())

    # update
    upd = s.put(f"{API}/admin/reports/schedules/{sid}", json={
        "name": "Pytest updated", "kinds": ["results"], "recipients": ["somosylv@gmail.com"],
        "frequency": "daily", "window": "yesterday", "send_hour": 9, "enabled": True,
    }, timeout=20)
    assert upd.status_code == 200
    assert upd.json()["frequency"] == "daily"

    # send-now to the verified sandbox address -> should actually send
    sent = s.post(f"{API}/admin/reports/schedules/{sid}/send-now", json={"test_email": "somosylv@gmail.com"}, timeout=60)
    assert sent.status_code == 200, sent.text
    assert sent.json().get("status") == "sent", sent.json()

    # delete
    d = s.delete(f"{API}/admin/reports/schedules/{sid}", timeout=20)
    assert d.status_code == 200


def test_export_all_zip():
    import io, zipfile
    s = _session(ADMIN)
    r = s.get(f"{API}/admin/reports/export-zip", params={"date_from": "2026-05-01", "date_to": "2026-06-12"}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type") == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = set(z.namelist())
    for kind in ("results", "payments", "exceptional", "refused-cancelled", "other",
                 "referral", "wallet", "rewards", "insurance"):
        assert f"{kind}.csv" in names, f"missing {kind}.csv in zip"
    # CSV starts with BOM
    assert z.read("results.csv").startswith("\ufeff".encode("utf-8"))


def test_demo_mode_toggle():
    s = _session(ADMIN)
    on = s.put(f"{API}/demo-mode/config", json={"enabled": True, "wallet_credit": 120}, timeout=20)
    assert on.status_code == 200 and on.json()["enabled"] is True
    assert on.json()["wallet_credit"] == 120
    st = s.get(f"{API}/demo-mode/status", timeout=20)
    assert st.json()["enabled"] is True
    off = s.put(f"{API}/demo-mode/config", json={"enabled": False}, timeout=20)
    assert off.json()["enabled"] is False


def test_safety_audio_upload_list_access_control():
    drv = _session(DRIVER)
    ride_id = f"pytest_ride_{uuid.uuid4().hex[:8]}"
    files = {"file": ("clip.wav", _wav_bytes(), "audio/wav")}
    data = {"ride_id": ride_id, "kind": "ride", "duration_sec": "0.5"}
    up = drv.post(f"{API}/safety/audio/upload", files=files, data=data, timeout=60)
    assert up.status_code == 200, up.text
    rec_id = up.json()["id"]

    # driver lists for ride
    lst = drv.get(f"{API}/safety/audio/ride/{ride_id}", timeout=20)
    assert lst.status_code == 200 and len(lst.json()) >= 1

    # driver can serve own bytes
    served = drv.get(f"{API}/safety/audio/{rec_id}", timeout=20)
    assert served.status_code == 200 and len(served.content) > 100

    # admin can list + serve
    adm = _session(ADMIN)
    al = adm.get(f"{API}/admin/safety/recordings", params={"ride_id": ride_id}, timeout=20)
    assert al.status_code == 200 and len(al.json()) >= 1

    # an anonymous request is rejected
    anon = requests.get(f"{API}/safety/audio/{rec_id}", timeout=20)
    assert anon.status_code in (401, 403)
