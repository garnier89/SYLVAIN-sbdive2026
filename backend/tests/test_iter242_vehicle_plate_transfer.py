"""Driver vehicles — global plate uniqueness + ownership transfer via chassis photo."""
import os
import time
import requests
from pymongo import MongoClient

from _creds import DRIVER_PASSWORD

API = os.environ.get("TEST_API_URL", os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001"))
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
db = MongoClient(MONGO_URL)[DB_NAME]

DRIVER_A = "jean.dupont@demo.sb"
DRIVER_B = "amadou.diallo@demo.sb"


def _login(email):
    s = requests.Session()
    r = s.post(f"{API}/api/auth/login", json={"email": email, "password": DRIVER_PASSWORD})
    assert r.status_code == 200, r.text
    return s


def _cleanup(plate):
    db.driver_vehicles.delete_many({"plate": plate})


def test_global_plate_uniqueness_and_chassis_transfer():
    plate = f"TT-{int(time.time()) % 100000}-TT"
    _cleanup(plate)
    a, b = _login(DRIVER_A), _login(DRIVER_B)
    veh = {"brand": "Peugeot", "model": "308", "plate": plate, "year": 2020, "color": "Gris", "vehicle_type": "comfort"}
    try:
        # A registers + activates the plate
        ra = a.post(f"{API}/api/driver-pro/vehicles", json={**veh, "is_active": True})
        assert ra.status_code == 200 and ra.json()["is_active"] is True

        # B tries the same plate without proof → 409
        rb = b.post(f"{API}/api/driver-pro/vehicles", json={**veh, "brand": "Renault", "model": "Clio"})
        assert rb.status_code == 409

        # B claims ownership with a chassis photo → success + transfer
        rc = b.post(f"{API}/api/driver-pro/vehicles",
                    json={**veh, "brand": "Renault", "model": "Clio", "chassis_photo": "data:image/jpeg;base64,AAAA"})
        assert rc.status_code == 200
        bj = rc.json()
        assert bj["is_active"] is True and bj["is_primary"] is True and bj.get("chassis_photo")

        # A's vehicle is now deactivated
        a_items = a.get(f"{API}/api/driver-pro/vehicles").json()["items"]
        a_veh = [v for v in a_items if v["plate"] == plate]
        assert a_veh and a_veh[0]["is_active"] is False
    finally:
        _cleanup(plate)


def test_same_driver_cannot_register_plate_twice():
    plate = f"UU-{int(time.time()) % 100000}-UU"
    _cleanup(plate)
    a = _login(DRIVER_A)
    veh = {"brand": "Toyota", "model": "Yaris", "plate": plate, "year": 2021, "color": "Blanc", "vehicle_type": "economic"}
    try:
        assert a.post(f"{API}/api/driver-pro/vehicles", json=veh).status_code == 200
        dup = a.post(f"{API}/api/driver-pro/vehicles", json=veh)
        assert dup.status_code == 400
    finally:
        _cleanup(plate)
