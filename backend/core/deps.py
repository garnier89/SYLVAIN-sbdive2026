import bcrypt
import jwt
import requests
from fastapi import HTTPException, Request
from datetime import datetime, timezone, timedelta
from typing import List
from math import radians, sin, cos, sqrt, atan2

from core.config import (
    db, JWT_SECRET, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS, STORAGE_URL, EMERGENT_LLM_KEY, APP_NAME,
    logger
)
import core.config as config


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_role(request: Request, roles: List[str], permission: str = None) -> dict:
    """Backwards-compatible role check + optional permission enforcement.

    If `permission` is provided, user must hold this specific permission via ACL roles
    (or super.all wildcard). Falls back to role-list check if no permission is given.
    """
    user = await get_current_user(request)
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if permission and user["role"] == "admin":
        # Resolve user permissions via ACL roles
        from core.config import db as _db
        u = await _db.users.find_one({"id": user["id"]}, {"_id": 0, "role_ids": 1})
        role_ids = (u or {}).get("role_ids") or []
        if not role_ids:
            # Legacy super-admin without role assignment -> allowed
            return user
        roles_docs = await _db.admin_roles.find({"id": {"$in": role_ids}}, {"_id": 0, "permissions": 1}).to_list(50)
        perms = set()
        for r in roles_docs:
            perms.update(r.get("permissions", []))
        if "super.all" not in perms and permission not in perms:
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    return user


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


def calculate_fare(distance_km: float, vehicle_type: str, duration_mins: int = 0, vtype_doc: dict = None) -> float:
    """
    V3Cube fare calculation logic supporting Regular/Fixed/Hourly fare types.
    If vtype_doc is provided (from DB), use its pricing. Otherwise fallback.
    """
    if vtype_doc:
        fare_type = vtype_doc.get("fare_type", "Regular")
        base = vtype_doc.get("base_fare", 1.0)
        per_km = vtype_doc.get("price_per_km", 1.0)
        per_min = vtype_doc.get("price_per_min", 0.1)
        per_hour = vtype_doc.get("price_per_hour", 0.0)
        min_fare = vtype_doc.get("min_fare", 5.0)
        pickup = vtype_doc.get("pickup_price", 0.0)

        if fare_type == "Fixed":
            total = vtype_doc.get("fixed_fare", 10.0)
        elif fare_type == "Hourly":
            hours = max(duration_mins / 60, vtype_doc.get("min_hour", 1))
            total = base + (hours * per_hour)
        else:
            total = base + pickup + (distance_km * per_km) + (duration_mins * per_min)

        return round(max(total, min_fare), 2)

    # Fallback pricing if no DB document
    base_fares = {"sb": 1.0, "confort": 2.0, "luxe": 5.0, "moto": 1.0, "pool": 0.5,
                  "car": 3.0, "motorcycle": 2.0, "bicycle": 1.5}
    per_km_rates = {"sb": 1.0, "confort": 1.5, "luxe": 2.5, "moto": 0.8, "pool": 0.7,
                    "car": 1.5, "motorcycle": 1.0, "bicycle": 0.8}
    base = base_fares.get(vehicle_type, 3.0)
    rate = per_km_rates.get(vehicle_type, 1.5)
    return round(base + (distance_km * rate), 2)


def init_storage():
    if config.storage_key:
        return config.storage_key
    if not EMERGENT_LLM_KEY:
        logger.warning("EMERGENT_LLM_KEY not set, storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        config.storage_key = resp.json()["storage_key"]
        return config.storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
