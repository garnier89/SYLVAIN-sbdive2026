"""
WebSocket endpoint mounted under /api so it passes through the ingress.
Handles driver location streaming, ride rooms and ETA updates.

Each inbound message type has its own small async handler; the endpoint loop
just dispatches via _HANDLERS, keeping nesting shallow and each unit testable.
"""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from core.config import db
from core.websocket import manager

_ACTIVE_RIDE_STATUSES = ["accepted", "arriving", "in_progress"]


async def _register_if_driver(client_id: str) -> None:
    """Drivers connect with their raw user id; register them so broadcasts reach them."""
    try:
        u = await db.users.find_one({"id": client_id}, {"_id": 0, "role": 1})
        if u and u.get("role") == "driver":
            manager.register_driver(client_id)
    except Exception:
        pass


async def _handle_location_update(websocket: WebSocket, client_id: str, data: dict) -> None:
    lat, lng = data["lat"], data["lng"]
    manager.update_driver_location(client_id, lat, lng)
    await db.drivers.update_one(
        {"user_id": client_id},
        {"$set": {"current_lat": lat, "current_lng": lng}},
    )
    # Forward location to passenger only if the driver has an active ride
    ride = await db.rides.find_one(
        {"driver_id": client_id, "status": {"$in": _ACTIVE_RIDE_STATUSES}},
        {"_id": 0, "id": 1, "user_id": 1},
    )
    if not ride:
        return
    payload = {"type": "driver_location", "lat": lat, "lng": lng, "ride_id": ride["id"]}
    await manager.send_to_ride_room(ride["id"], payload, exclude=client_id)
    await manager.send_personal_message(payload, ride["user_id"])


async def _handle_join_ride(websocket: WebSocket, client_id: str, data: dict) -> None:
    ride_id = data.get("ride_id")
    if ride_id:
        manager.join_ride_room(ride_id, client_id)
        await websocket.send_json({"type": "joined_ride", "ride_id": ride_id})


async def _handle_leave_ride(websocket: WebSocket, client_id: str, data: dict) -> None:
    ride_id = data.get("ride_id")
    if ride_id:
        manager.leave_ride_room(ride_id, client_id)


async def _handle_eta_update(websocket: WebSocket, client_id: str, data: dict) -> None:
    ride_id = data.get("ride_id")
    if not ride_id:
        return
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "id": 1})
    if not ride:
        return
    payload = {
        "type": "eta_update",
        "ride_id": ride_id,
        "eta_min": data.get("eta_min"),
        "distance_m": data.get("distance_m"),
    }
    await manager.send_personal_message(payload, ride["user_id"])
    await manager.send_to_ride_room(ride_id, payload, exclude=client_id)
    await manager.broadcast_to_admins(payload)


async def _handle_ping(websocket: WebSocket, client_id: str, data: dict) -> None:
    await websocket.send_json({"type": "pong"})


_HANDLERS = {
    "location_update": _handle_location_update,
    "join_ride": _handle_join_ride,
    "leave_ride": _handle_leave_ride,
    "eta_update": _handle_eta_update,
    "ping": _handle_ping,
}


def register_websocket(app: FastAPI) -> None:
    @app.websocket("/api/ws/{client_id}")
    async def websocket_endpoint(websocket: WebSocket, client_id: str):
        await manager.connect(websocket, client_id)
        await _register_if_driver(client_id)
        try:
            while True:
                data = await websocket.receive_json()
                handler = _HANDLERS.get(data.get("type"))
                if handler:
                    await handler(websocket, client_id, data)
        except WebSocketDisconnect:
            manager.disconnect(client_id)
