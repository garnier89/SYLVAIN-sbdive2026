"""
Taxi Service extra modules (V3Cube parity):
 • Rental Packages — per Vehicle Type (× location), Add/View counts.
 • Ride Profile Type — profils de course (Business / Personal…).
 • Business Trip Reason — motifs de déplacement pro.
Admin CRUD + public getters (consumed by the client app).
"""
from fastapi import APIRouter, Request, HTTPException
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import require_role

admin_router = APIRouter(prefix="/admin", tags=["taxi-extra-admin"])
public_router = APIRouter(prefix="/config", tags=["taxi-extra-public"])


# ───────────────────────── Seed ─────────────────────────
async def seed_taxi_extra():
    if await db.ride_profiles.count_documents({}) == 0:
        await db.ride_profiles.insert_many([
            {"id": f"rp_{uuid.uuid4().hex[:10]}", "short_name": "Business", "org_type": "Business",
             "profile_title": "Ajoutez votre profil professionnel", "title_description": "Triez vos courses pour faciliter vos notes de frais",
             "status": "active", "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": f"rp_{uuid.uuid4().hex[:10]}", "short_name": "Personnel", "org_type": "Personal",
             "profile_title": "Profil personnel", "title_description": "Vos trajets du quotidien",
             "status": "active", "created_at": datetime.now(timezone.utc).isoformat()},
        ])
    if await db.business_trip_reasons.count_documents({}) == 0:
        base = {"profile_short_name": "Business", "org_type": "Business",
                "profile_title": "Ajoutez votre profil professionnel",
                "title_description": "Triez vos courses pour faciliter vos notes de frais", "status": "active"}
        await db.business_trip_reasons.insert_many([
            {"id": f"btr_{uuid.uuid4().hex[:10]}", "trip_reason": "Bureau ⇄ Domicile", **base, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": f"btr_{uuid.uuid4().hex[:10]}", "trip_reason": "Visite client / partenaire", **base, "created_at": datetime.now(timezone.utc).isoformat()},
            {"id": f"btr_{uuid.uuid4().hex[:10]}", "trip_reason": "Trajet aéroport / gare", **base, "created_at": datetime.now(timezone.utc).isoformat()},
        ])
    # Forfaits Moto « Mise à dispo » dédiés (avec chauffeur) — seed si absents.
    if await db.rental_packages.count_documents({"vehicle_type": "moto"}) == 0:
        _now = datetime.now(timezone.utc).isoformat()
        await db.rental_packages.insert_many([
            {"id": f"rpkg_{uuid.uuid4().hex[:10]}", "vehicle_type": "moto", "location_name": "Tous les lieux",
             "label": "1h", "hours": 1, "km": 15, "price": 12, "extra_hour_rate": 10, "extra_km_rate": 0.5,
             "with_driver": True, "status": "active", "created_at": _now},
            {"id": f"rpkg_{uuid.uuid4().hex[:10]}", "vehicle_type": "moto", "location_name": "Tous les lieux",
             "label": "2h", "hours": 2, "km": 30, "price": 22, "extra_hour_rate": 10, "extra_km_rate": 0.5,
             "with_driver": True, "status": "active", "created_at": _now},
            {"id": f"rpkg_{uuid.uuid4().hex[:10]}", "vehicle_type": "moto", "location_name": "Tous les lieux",
             "label": "4h", "hours": 4, "km": 60, "price": 40, "extra_hour_rate": 9, "extra_km_rate": 0.5,
             "with_driver": True, "status": "active", "created_at": _now},
            {"id": f"rpkg_{uuid.uuid4().hex[:10]}", "vehicle_type": "moto", "location_name": "Tous les lieux",
             "label": "Journée 8h", "hours": 8, "km": 120, "price": 75, "extra_hour_rate": 8, "extra_km_rate": 0.4,
             "with_driver": True, "status": "active", "created_at": _now},
        ])


# ═══════════════════════ Rental Packages (per vehicle) ═══════════════════════
@admin_router.get("/rental-packages/vehicles")
async def rental_vehicles(request: Request):
    """List vehicle types with their rental package count (V3Cube list view)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    vtypes = await db.vehicle_types.find({}, {"_id": 0, "slug": 1, "name_fr": 1, "name": 1}).to_list(200)
    out = []
    for v in vtypes:
        count = await db.rental_packages.count_documents({"vehicle_type": v["slug"]})
        out.append({"slug": v["slug"], "name": v.get("name_fr") or v.get("name") or v["slug"], "count": count})
    return out


@admin_router.get("/rental-packages")
async def list_rental_packages(request: Request, vehicle_type: str = None):
    await require_role(request, ["admin"], permission="server.settings.edit")
    q = {"vehicle_type": vehicle_type} if vehicle_type else {}
    return await db.rental_packages.find(q, {"_id": 0}).sort("hours", 1).to_list(300)


@admin_router.post("/rental-packages")
async def create_rental_package(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    if not body.get("vehicle_type"):
        raise HTTPException(status_code=400, detail="vehicle_type requis")
    vt = body["vehicle_type"]
    if vt != "all" and not await db.vehicle_types.find_one({"slug": vt}):
        raise HTTPException(status_code=400, detail="Type de véhicule inconnu")
    doc = {
        "id": f"rpkg_{uuid.uuid4().hex[:10]}",
        "vehicle_type": body["vehicle_type"],
        "location_name": body.get("location_name", "Tous les lieux"),
        "label": body.get("label") or "",
        "hours": float(body.get("hours", 1)),
        "km": float(body.get("km", 10)),
        "price": float(body.get("price", 0)),
        "extra_hour_rate": float(body.get("extra_hour_rate", 18) or 0),
        "extra_km_rate": float(body.get("extra_km_rate", 0.8) or 0),
        "with_driver": bool(body.get("with_driver", True)),
        "status": body.get("status", "active"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.rental_packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@admin_router.put("/rental-packages/{pkg_id}")
async def update_rental_package(pkg_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    allowed = {f: body[f] for f in ("location_name", "label", "hours", "km", "price",
                                    "extra_hour_rate", "extra_km_rate", "with_driver", "status") if f in body}
    if not allowed:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    res = await db.rental_packages.update_one({"id": pkg_id}, {"$set": allowed})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Forfait introuvable")
    return await db.rental_packages.find_one({"id": pkg_id}, {"_id": 0})


@admin_router.delete("/rental-packages/{pkg_id}")
async def delete_rental_package(pkg_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    await db.rental_packages.delete_one({"id": pkg_id})
    return {"deleted": True}


@public_router.get("/rental-packages")
async def public_rental_packages(vehicle_type: str = None):
    q = {"status": "active"}
    if vehicle_type:
        q["vehicle_type"] = vehicle_type
    return await db.rental_packages.find(q, {"_id": 0}).sort("hours", 1).to_list(300)


# ═══════════════════════ Generic CRUD helper for profiles ═══════════════════════
def _make_crud(collection, prefix, fields, id_prefix):
    @admin_router.get(f"/{prefix}")
    async def _list(request: Request):
        await require_role(request, ["admin"], permission="server.settings.edit")
        return await getattr(db, collection).find({}, {"_id": 0}).sort("created_at", 1).to_list(300)

    @admin_router.post(f"/{prefix}")
    async def _create(request: Request):
        await require_role(request, ["admin"], permission="server.settings.edit")
        body = await request.json()
        doc = {"id": f"{id_prefix}_{uuid.uuid4().hex[:10]}", "status": body.get("status", "active"),
               "created_at": datetime.now(timezone.utc).isoformat()}
        for f in fields:
            doc[f] = body.get(f, "")
        await getattr(db, collection).insert_one(doc)
        doc.pop("_id", None)
        return doc

    @admin_router.put(f"/{prefix}/{{item_id}}")
    async def _update(item_id: str, request: Request):
        await require_role(request, ["admin"], permission="server.settings.edit")
        body = await request.json()
        allowed = {f: body[f] for f in (fields + ["status"]) if f in body}
        if not allowed:
            raise HTTPException(status_code=400, detail="Rien à mettre à jour")
        res = await getattr(db, collection).update_one({"id": item_id}, {"$set": allowed})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Introuvable")
        return await getattr(db, collection).find_one({"id": item_id}, {"_id": 0})

    @admin_router.delete(f"/{prefix}/{{item_id}}")
    async def _delete(item_id: str, request: Request):
        await require_role(request, ["admin"], permission="server.settings.edit")
        await getattr(db, collection).delete_one({"id": item_id})
        return {"deleted": True}

    @admin_router.post(f"/{prefix}/{{item_id}}/toggle")
    async def _toggle(item_id: str, request: Request):
        await require_role(request, ["admin"], permission="server.settings.edit")
        item = await getattr(db, collection).find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Introuvable")
        new_status = "inactive" if item.get("status") == "active" else "active"
        await getattr(db, collection).update_one({"id": item_id}, {"$set": {"status": new_status}})
        return {"id": item_id, "status": new_status}


# Ride Profile Type
_make_crud("ride_profiles", "ride-profiles",
           ["short_name", "org_type", "profile_title", "title_description"], "rp")
# Business Trip Reason
_make_crud("business_trip_reasons", "business-trip-reasons",
           ["trip_reason", "profile_short_name", "org_type", "profile_title", "title_description"], "btr")


# Public getters
@public_router.get("/ride-profiles")
async def public_ride_profiles():
    return await db.ride_profiles.find({"status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(100)


@public_router.get("/business-trip-reasons")
async def public_business_trip_reasons():
    return await db.business_trip_reasons.find({"status": "active"}, {"_id": 0}).sort("created_at", 1).to_list(100)
