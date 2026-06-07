"""
WebSocket endpoint mounted under /api so it passes through the ingress.
Handles driver location streaming, ride rooms and ETA updates.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from core.config import db
from core.websocket import manager


def register_websocket(app: FastAPI) -> None:
    @app.websocket("/api/ws/{client_id}")
    async def websocket_endpoint(websocket: WebSocket, client_id: str):
        await manager.connect(websocket, client_id)
        # Register drivers by role so broadcast_to_drivers actually reaches them
        # (driver client_ids are raw user ids, not "driver_"-prefixed).
        try:
            u = await db.users.find_one({"id": client_id}, {"_id": 0, "role": 1})
            if u and u.get("role") == "driver":
                manager.register_driver(client_id)
        except Exception:
            pass
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "location_update":
                    manager.update_driver_location(client_id, data["lat"], data["lng"])
                    await db.drivers.update_one(
                        {"user_id": client_id},
                        {"$set": {"current_lat": data["lat"], "current_lng": data["lng"]}}
                    )
                    # Forward location to passenger if driver has active ride
                    ride = await db.rides.find_one(
                        {"driver_id": client_id, "status": {"$in": ["accepted", "arriving", "in_progress"]}},
                        {"_id": 0, "id": 1, "user_id": 1}
                    )
                    if ride:
                        await manager.send_to_ride_room(ride["id"], {
                            "type": "driver_location",
                            "lat": data["lat"],
                            "lng": data["lng"],
                            "ride_id": ride["id"],
                        }, exclude=client_id)
                        await manager.send_personal_message({
                            "type": "driver_location",
                            "lat": data["lat"],
                            "lng": data["lng"],
                            "ride_id": ride["id"],
                        }, ride["user_id"])

                elif msg_type == "join_ride":
                    ride_id = data.get("ride_id")
                    if ride_id:
                        manager.join_ride_room(ride_id, client_id)
                        await websocket.send_json({"type": "joined_ride", "ride_id": ride_id})

                elif msg_type == "leave_ride":
                    ride_id = data.get("ride_id")
                    if ride_id:
                        manager.leave_ride_room(ride_id, client_id)

                elif msg_type == "eta_update":
                    ride_id = data.get("ride_id")
                    if ride_id:
                        ride = await db.rides.find_one(
                            {"id": ride_id}, {"_id": 0, "user_id": 1, "id": 1}
                        )
                        if ride:
                            payload = {
                                "type": "eta_update",
                                "ride_id": ride_id,
                                "eta_min": data.get("eta_min"),
                                "distance_m": data.get("distance_m"),
                            }
                            await manager.send_personal_message(payload, ride["user_id"])
                            await manager.send_to_ride_room(ride_id, payload, exclude=client_id)
                            await manager.broadcast_to_admins(payload)

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

        except WebSocketDisconnect:
            manager.disconnect(client_id)
