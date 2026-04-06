from fastapi import WebSocket
from typing import Dict, Set
from datetime import datetime, timezone

from core.config import logger, db


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.driver_locations: Dict[str, Dict] = {}
        self.ride_rooms: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WS connected: {client_id}")

    def disconnect(self, client_id: str):
        self.active_connections.pop(client_id, None)
        for room_id, members in list(self.ride_rooms.items()):
            members.discard(client_id)
            if not members:
                del self.ride_rooms[room_id]
        logger.info(f"WS disconnected: {client_id}")

    def join_ride_room(self, ride_id: str, client_id: str):
        if ride_id not in self.ride_rooms:
            self.ride_rooms[ride_id] = set()
        self.ride_rooms[ride_id].add(client_id)

    def leave_ride_room(self, ride_id: str, client_id: str):
        if ride_id in self.ride_rooms:
            self.ride_rooms[ride_id].discard(client_id)

    async def send_personal_message(self, message: dict, client_id: str):
        ws = self.active_connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(client_id)

    async def send_to_ride_room(self, ride_id: str, message: dict, exclude: str = None):
        members = self.ride_rooms.get(ride_id, set())
        for member_id in list(members):
            if member_id != exclude:
                await self.send_personal_message(message, member_id)

    async def broadcast(self, message: dict):
        for cid in list(self.active_connections.keys()):
            await self.send_personal_message(message, cid)

    async def broadcast_to_drivers(self, message: dict):
        for cid in list(self.active_connections.keys()):
            if cid.startswith("driver_"):
                await self.send_personal_message(message, cid)

    def update_driver_location(self, driver_id: str, lat: float, lng: float):
        self.driver_locations[driver_id] = {
            "lat": lat, "lng": lng,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_driver_location(self, driver_id: str):
        return self.driver_locations.get(driver_id)

    def get_online_drivers_count(self):
        return sum(1 for cid in self.active_connections if cid.startswith("driver_"))


manager = ConnectionManager()
