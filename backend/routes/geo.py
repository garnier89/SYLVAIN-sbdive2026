"""
Geographic referentials seeded from V3Cube (countries, states, cities).

Iteration 77 — Provides public endpoints for cascading selectors (Country -> State -> City)
in registration / address forms.
"""
import json
import os
from fastapi import APIRouter
from typing import Optional

from core.config import db

router = APIRouter(prefix="/geo", tags=["geo"])

SEED_PATH = "/app/backend/seed_data/v3cube_countries.json"


async def seed_countries():
    """Idempotent seed of countries from V3Cube SQL dump (250 countries)."""
    if not os.path.exists(SEED_PATH):
        return
    # Skip if already seeded
    count = await db.countries.count_documents({})
    if count >= 250:
        return
    with open(SEED_PATH, "r", encoding="utf-8") as f:
        countries = json.load(f)
    # Bulk upsert by code
    for c in countries:
        await db.countries.update_one(
            {"code": c["code"]},
            {"$set": {
                "code": c["code"],
                "iso3": c.get("iso3"),
                "name": c.get("name"),
                "native": c.get("native"),
                "phone_code": c.get("phone_code"),
                "currency": c.get("currency"),
                "lat": float(c.get("lat") or 0),
                "lng": float(c.get("lng") or 0),
                "capital": c.get("capital"),
                "timezone": c.get("timezone"),
                "emergency_code": c.get("emergency_code"),
                "unit": c.get("unit", "KMs"),
                "tax1": c.get("tax1", 0.0),
                "tax2": c.get("tax2", 0.0),
                "enable_toll": c.get("enable_toll", False),
                "is_active": True,
            }},
            upsert=True,
        )


@router.get("/countries")
async def list_countries(active_only: bool = True, q: Optional[str] = None):
    """List all countries. Optional search filter by name/code."""
    query = {"is_active": True} if active_only else {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"code": {"$regex": q, "$options": "i"}},
            {"iso3": {"$regex": q, "$options": "i"}},
        ]
    items = await db.countries.find(query, {"_id": 0}).sort("name", 1).to_list(300)
    return {"items": items, "total": len(items)}


@router.get("/countries/{code}")
async def get_country(code: str):
    code = code.upper()
    item = await db.countries.find_one({"$or": [{"code": code}, {"iso3": code}]}, {"_id": 0})
    if not item:
        return {"item": None}
    return {"item": item}


@router.get("/phone-codes")
async def list_phone_codes():
    """Compact list for dropdown: country code + phone code + flag."""
    items = await db.countries.find({"is_active": True}, {"_id": 0, "code": 1, "name": 1, "phone_code": 1}).sort("name", 1).to_list(300)
    return {"items": items}
