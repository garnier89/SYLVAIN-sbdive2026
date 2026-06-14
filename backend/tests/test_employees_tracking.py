"""Backend tests for SB Tracking — Module Employés (iteration 376)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


def _session(email=EMAIL, password=PASSWORD, name="Fam Tester"):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        s.post(f"{API}/auth/register", json={"email": email, "password": password, "name": name}, timeout=20)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


def test_context_autocreate():
    s = _session()
    r = s.get(f"{API}/employees/context", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "org" in body and "counts" in body
    assert set(["employees", "present", "routes_today", "pending_stops"]).issubset(body["counts"].keys())


def test_seed_and_list():
    s = _session()
    assert s.post(f"{API}/employees/seed-demo", timeout=20).status_code == 200
    r = s.get(f"{API}/employees", timeout=20)
    assert r.status_code == 200
    emps = r.json()["employees"]
    assert len(emps) >= 3
    e = emps[0]
    assert "on_shift" in e and "minutes_today" in e and "live" in e


def test_add_and_delete_employee():
    s = _session()
    add = s.post(f"{API}/employees", json={"name": "TEST_Emp", "role": "Testeur", "phone": "0600"}, timeout=20)
    assert add.status_code == 200, add.text
    eid = add.json()["id"]
    assert add.json()["invite_code"].startswith("EMP")
    assert s.delete(f"{API}/employees/{eid}", timeout=20).status_code == 200


def test_add_employee_requires_name():
    s = _session()
    assert s.post(f"{API}/employees", json={"name": ""}, timeout=20).status_code == 400


def test_join_invalid_code():
    s = _session()
    assert s.post(f"{API}/employees/join", json={"code": "NOPE123"}, timeout=20).status_code == 404


def test_clock_in_requires_linked_slot():
    """A user with no linked employee slot cannot clock in."""
    s = _session(email="empnoclock@demo.sb", password="EmpNo123!", name="No Clock")
    # ensure no linked slots: this brand-new user owns an org but is not a member anywhere
    r = s.post(f"{API}/employees/clock-in", json={}, timeout=20)
    assert r.status_code == 400


def test_clock_in_out_flow():
    """Owner adds slot -> second user joins -> clocks in -> ping -> clocks out (shift recorded)."""
    owner = _session()
    add = owner.post(f"{API}/employees", json={"name": "TEST_ClockSlot", "role": "Livreur"}, timeout=20)
    assert add.status_code == 200
    code, eid = add.json()["invite_code"], add.json()["id"]

    emp = _session(email="empjoiner@demo.sb", password="EmpJoin123!", name="Emp Joiner")
    assert emp.post(f"{API}/employees/join", json={"code": code}, timeout=20).status_code == 200
    ci = emp.post(f"{API}/employees/clock-in", json={"lat": 14.6, "lng": -61.06}, timeout=20)
    assert ci.status_code == 200, ci.text
    assert emp.post(f"{API}/employees/ping", json={"lat": 14.61, "lng": -61.07}, timeout=20).status_code == 200
    co = emp.post(f"{API}/employees/clock-out", json={"lat": 14.61, "lng": -61.07}, timeout=20)
    assert co.status_code == 200 and co.json()["closed"] >= 1

    ts = owner.get(f"{API}/employees/{eid}/timesheet", timeout=20)
    assert ts.status_code == 200
    assert len(ts.json()["shifts"]) >= 1
    owner.delete(f"{API}/employees/{eid}", timeout=20)


def test_routes_crud_and_toggle():
    s = _session()
    r = s.post(f"{API}/employees/routes", json={
        "name": "TEST_Route",
        "stops": [{"name": "Arrêt 1", "address": "Rue A", "lat": 14.6, "lng": -61.06},
                  {"name": "Arrêt 2"}]}, timeout=20)
    assert r.status_code == 200, r.text
    route = r.json()
    rid = route["id"]
    assert len(route["stops"]) == 2
    sid = route["stops"][0]["id"]
    tog = s.post(f"{API}/employees/routes/{rid}/stops/{sid}/toggle", timeout=20)
    assert tog.status_code == 200
    assert any(st["id"] == sid and st["done"] for st in tog.json()["stops"])
    assert s.delete(f"{API}/employees/routes/{rid}", timeout=20).status_code == 200


def test_route_requires_name():
    s = _session()
    assert s.post(f"{API}/employees/routes", json={"name": "", "stops": []}, timeout=20).status_code == 400


def test_reports_structure():
    s = _session()
    r = s.get(f"{API}/employees/reports", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert len(body["day_keys"]) == 7
    for row in body["rows"]:
        assert len(row["days"]) == 7
        assert "total_min" in row


def test_clock_out_notifies_owner():
    """Clock-out from a linked employee creates a notification for the org owner."""
    owner = _session()
    add = owner.post(f"{API}/employees", json={"name": "TEST_NotifSlot", "role": "Livreur"}, timeout=20)
    code, eid = add.json()["invite_code"], add.json()["id"]
    emp = _session(email="empjoiner@demo.sb", password="EmpJoin123!", name="Emp Joiner")
    emp.post(f"{API}/employees/join", json={"code": code}, timeout=20)
    before = len(owner.get(f"{API}/push/list", timeout=20).json())
    emp.post(f"{API}/employees/clock-in", json={"lat": 14.6, "lng": -61.06}, timeout=20)
    emp.post(f"{API}/employees/clock-out", json={"lat": 14.6, "lng": -61.06}, timeout=20)
    notifs = owner.get(f"{API}/push/list", timeout=20).json()
    assert len(notifs) > before
    assert any(n.get("type", "").startswith("emp_") for n in notifs[:5])
    owner.delete(f"{API}/employees/{eid}", timeout=20)


def test_invite_employee_sends_and_creates_slot():
    s = _session()
    r = s.post(f"{API}/employees/invite", json={"name": "TEST_Invited", "role": "Livreur", "email": "test.invite@example.com"}, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("email") == "test.invite@example.com"
    assert body["employee"]["invite_code"].startswith("EMP")
    s.delete(f"{API}/employees/{body['employee']['id']}", timeout=20)


def test_invite_requires_valid_email():
    s = _session()
    assert s.post(f"{API}/employees/invite", json={"name": "TEST_X", "email": "notanemail"}, timeout=20).status_code == 400
    assert s.post(f"{API}/employees/invite", json={"name": "", "email": "ok@x.com"}, timeout=20).status_code == 400


def test_employees_report_pdf():
    s = _session()
    s.post(f"{API}/employees/seed-demo", timeout=20)
    r = s.get(f"{API}/employees/report.pdf", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_fleet_report_pdf():
    s = _session()
    s.post(f"{API}/fleet/seed-demo", timeout=20)
    r = s.get(f"{API}/fleet/report.pdf", timeout=30)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_cleanup():
    s = _session()
    for e in s.get(f"{API}/employees", timeout=20).json().get("employees", []):
        if str(e.get("name", "")).startswith("TEST_"):
            s.delete(f"{API}/employees/{e['id']}", timeout=20)
    for r in s.get(f"{API}/employees/routes", timeout=20).json().get("routes", []):
        if str(r.get("name", "")).startswith("TEST_"):
            s.delete(f"{API}/employees/routes/{r['id']}", timeout=20)
