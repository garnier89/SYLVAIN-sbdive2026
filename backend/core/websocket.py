from fastapi import WebSocket
from typing import Dict, Set, Optional
from datetime import datetime, timezone

from core.config import logger


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, WebSocket] = {}
        self.driver_locations: Dict[str, Dict] = {}
        self.ride_rooms: Dict[str, Set[str]] = {}
        # Client IDs of connected drivers (registered by role on connect).
        # Driver client_ids are raw user ids (user_xxx), not prefixed, so role
        # tracking is required to actually reach them via broadcast_to_drivers.
        self.driver_clients: Set[str] = set()

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"WS connected: {client_id}")

    def disconnect(self, client_id: str) -> None:
        self.active_connections.pop(client_id, None)
        self.driver_clients.discard(client_id)
        for room_id, members in list(self.ride_rooms.items()):
            members.discard(client_id)
            if not members:
                del self.ride_rooms[room_id]
        logger.info(f"WS disconnected: {client_id}")

    def join_ride_room(self, ride_id: str, client_id: str) -> None:
        if ride_id not in self.ride_rooms:
            self.ride_rooms[ride_id] = set()
        self.ride_rooms[ride_id].add(client_id)

    def leave_ride_room(self, ride_id: str, client_id: str) -> None:
        if ride_id in self.ride_rooms:
            self.ride_rooms[ride_id].discard(client_id)

    async def send_personal_message(self, message: dict, client_id: str) -> None:
        ws = self.active_connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(client_id)

    async def send_to_ride_room(self, ride_id: str, message: dict, exclude: Optional[str] = None) -> None:
        members = self.ride_rooms.get(ride_id, set())
        for member_id in list(members):
            if member_id != exclude:
                await self.send_personal_message(message, member_id)

    async def broadcast(self, message: dict) -> None:
        for cid in list(self.active_connections.keys()):
            await self.send_personal_message(message, cid)

    def register_driver(self, client_id: str) -> None:
        """Flag a connected client as a driver (looked up by role on connect)."""
        self.driver_clients.add(client_id)

    async def broadcast_to_drivers(self, message: dict, exclude: Optional[Set[str]] = None) -> None:
        # Reach clients registered as drivers (raw user ids) AND any legacy
        # "driver_"-prefixed client ids, restricted to live connections.
        # `exclude` (driver user ids) is used e.g. to NOT offer cash rides to
        # drivers whose wallet is below the cash-ride minimum balance.
        skip = exclude or set()
        targets = {
            cid for cid in self.active_connections
            if (cid in self.driver_clients or cid.startswith("driver_")) and cid not in skip
        }
        for cid in list(targets):
            await self.send_personal_message(message, cid)

    async def broadcast_to_admins(self, message: dict) -> None:
        for cid in list(self.active_connections.keys()):
            if cid.startswith("admin_"):
                await self.send_personal_message(message, cid)


    def update_driver_location(self, driver_id: str, lat: float, lng: float) -> None:
        self.driver_locations[driver_id] = {
            "lat": lat, "lng": lng,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_driver_location(self, driver_id: str) -> Optional[Dict]:
        return self.driver_locations.get(driver_id)

    def get_online_drivers_count(self) -> int:
        return sum(1 for cid in self.active_connections if cid.startswith("driver_"))


manager = ConnectionManager()
