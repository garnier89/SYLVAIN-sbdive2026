"""E2E: driver receives live new_parcel / new_transport over WebSocket."""
import asyncio
import json
import os
import httpx
import websockets

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com")
WS = BASE.replace("https://", "wss://").replace("http://", "ws://")
DRIVER_ID = "user_dcf7d4bc4de6"  # jean.dupont@demo.sb


async def run():
    async with httpx.AsyncClient(base_url=BASE, timeout=30) as client:
        # passenger login (rider QA) — create one if needed
        r = await client.post("/api/auth/login", json={"email": "rider.qa@demo.sb", "password": "Rider123!"})
        if r.status_code != 200:
            r = await client.post("/api/auth/register", json={
                "email": "wsrider@demo.sb", "password": "Rider123!", "name": "WS Rider", "role": "user"})
        token = r.json()["access_token"]
        hdr = {"Authorization": f"Bearer {token}"}

        # connect driver WS
        async with websockets.connect(f"{WS}/api/ws/{DRIVER_ID}") as ws:
            await asyncio.sleep(1)
            # create a parcel as passenger
            cr = await client.post("/api/parcels", headers=hdr, json={
                "pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Paris",
                "vehicle_type": "moto",
                "stops": [{"lat": 48.87, "lng": 2.34, "address": "Dest1", "recipient_name": "Bob"}],
            })
            assert cr.status_code == 200, cr.text
            print("parcel created:", cr.json()["id"])

            got_parcel = False
            for _ in range(10):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                print("WS recv:", msg.get("type"))
                if msg.get("type") == "new_parcel":
                    got_parcel = True
                    break
            assert got_parcel, "driver did not receive new_parcel"
            print("PASS: driver received new_parcel ✅")

            # create a medical transport
            tr = await client.post("/api/medical/transport", headers=hdr, json={
                "ambulance_type": "standard", "pickup_lat": 48.85, "pickup_lng": 2.35,
                "dest_lat": 48.88, "dest_lng": 2.36, "destination_name": "Hopital",
                "patient_name": "Alice", "urgency": "urgent",
            })
            assert tr.status_code == 200, tr.text
            got_tr = False
            for _ in range(10):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
                print("WS recv:", msg.get("type"))
                if msg.get("type") == "new_transport":
                    got_tr = True
                    break
            assert got_tr, "driver did not receive new_transport"
            print("PASS: driver received new_transport ✅")


if __name__ == "__main__":
    asyncio.run(run())
