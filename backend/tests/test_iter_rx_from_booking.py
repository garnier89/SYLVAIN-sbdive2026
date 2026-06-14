"""Ordonnance post-consultation en 1 clic : le praticien délivre une ordonnance
liée à un RDV médical (pro_services) → patient/spécialité auto-dérivés, PDF, le
patient la reçoit, le RDV est marqué. Sécurité : non-praticien refusé.
"""
import os
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
PRAC = ("freeuser@demo.sb", "FreeUser123!")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return s


def test_prescription_from_consultation_booking():
    pat = _login(*PAT)
    prac = _login(*PRAC)

    # Find the practitioner's real medical provider (has user_id)
    provs = requests.get(f"{API}/pro-services/medical/providers", timeout=15).json()
    real = [p for p in provs if p.get("user_id")]
    assert real, "no real medical provider seeded"
    pid = real[0]["id"]

    # Patient books a consultation with that practitioner
    r = pat.post(f"{API}/pro-services/medical/bookings", json={
        "service_id": "m_generaliste", "provider_id": pid,
        "scheduled_date": "2026-07-01", "scheduled_time": "09:00",
        "payment_method": "cash", "at_home": False}, timeout=15)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]

    # Practitioner sees the job
    jobs = prac.get(f"{API}/pro-services/medical/provider/jobs", timeout=15).json()
    assert any(j["id"] == bid for j in jobs)

    # 1-click prescription via booking_id (no email needed)
    r = prac.post(f"{API}/medical/prescriptions", json={
        "booking_id": bid, "diagnosis": "Angine",
        "medications": [{"name": "Amoxicilline 1g", "dosage": "1 cp x2/j", "duration": "7 j"}],
        "notes": "Repos"}, timeout=15)
    assert r.status_code == 200, r.text
    rx = r.json()
    assert rx["patient_name"]
    assert rx["specialty"] == "Médecine générale"
    assert rx["booking_id"] == bid

    # Patient receives it + PDF downloadable
    mine = pat.get(f"{API}/medical/prescriptions", timeout=15).json()
    assert any(x["id"] == rx["id"] for x in mine)
    pdf = pat.get(f"{API}/medical/prescriptions/{rx['id']}/pdf", timeout=20)
    assert pdf.status_code == 200 and pdf.headers.get("content-type", "").startswith("application/pdf")

    # Booking is now linked to the prescription
    jobs = prac.get(f"{API}/pro-services/medical/provider/jobs", timeout=15).json()
    linked = next(j for j in jobs if j["id"] == bid)
    assert linked.get("prescription_id") == rx["id"]


def test_non_practitioner_cannot_issue():
    pat = _login(*PAT)
    # famtester is not an approved practitioner
    r = pat.post(f"{API}/medical/prescriptions", json={
        "booking_id": "psb_doesnotexist",
        "medications": [{"name": "X"}]}, timeout=15)
    assert r.status_code == 403


def test_prescription_with_lab_analyses_bridge():
    """Le praticien prescrit des analyses → l'ordonnance les porte (résolues du
    catalogue labo) → PDF OK → le patient peut les réserver (pré-remplissage)."""
    pat = _login(*PAT)
    prac = _login(*PRAC)
    provs = requests.get(f"{API}/pro-services/medical/providers", timeout=15).json()
    pid = next(p["id"] for p in provs if p.get("user_id"))
    bid = pat.post(f"{API}/pro-services/medical/bookings", json={
        "service_id": "m_generaliste", "provider_id": pid,
        "scheduled_date": "2026-07-09", "scheduled_time": "10:00",
        "payment_method": "cash", "at_home": False}, timeout=15).json()["id"]

    # rx with meds + analyses (bad id filtered out)
    r = prac.post(f"{API}/medical/prescriptions", json={
        "booking_id": bid, "diagnosis": "Fatigue",
        "medications": [{"name": "Fer", "dosage": "1/j", "duration": "30j"}],
        "analysis_ids": ["l_nfs", "l_ferritine", "NOPE"]}, timeout=15)
    assert r.status_code == 200, r.text
    rx = r.json()
    assert len(rx["analyses"]) == 2
    assert {a["id"] for a in rx["analyses"]} == {"l_nfs", "l_ferritine"}
    assert all("name" in a and "price" in a for a in rx["analyses"])

    # PDF still downloadable (now with analyses section)
    pdf = pat.get(f"{API}/medical/prescriptions/{rx['id']}/pdf", timeout=20)
    assert pdf.status_code == 200 and pdf.headers.get("content-type", "").startswith("application/pdf")

    # rx with ONLY analyses (no meds) is allowed
    r = prac.post(f"{API}/medical/prescriptions", json={
        "booking_id": bid, "analysis_ids": ["l_glycemie"]}, timeout=15)
    assert r.status_code == 200 and len(r.json()["analyses"]) == 1 and r.json()["medications"] == []

    # rx with neither meds nor analyses → 400
    r = prac.post(f"{API}/medical/prescriptions", json={"booking_id": bid}, timeout=15)
    assert r.status_code == 400
