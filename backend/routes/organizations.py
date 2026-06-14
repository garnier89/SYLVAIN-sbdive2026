"""
Organizations (V3Cube company + organization).

Iteration 75 — Multi-tenant : un hôtel/entreprise peut avoir ses propres chauffeurs,
tarifs spéciaux, et facturation séparée.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrgCreate(BaseModel):
    name: str
    type: str = "company"  # company | hotel | airport | corporate
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    address: Optional[str] = None
    commission_pct: float = 15.0
    parent_org_id: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None


@router.post("/admin")
async def admin_create_org(body: OrgCreate, current_user: dict = Depends(require_permission("merchants.activate"))):
    org = {
        "id": f"org_{uuid.uuid4().hex[:10]}",
        **body.model_dump(),
        "linked_drivers": [],
        "linked_kiosks": [],
        "total_rides": 0,
        "total_revenue": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.organizations.insert_one(org)
    org.pop("_id", None)
    return org


@router.get("/admin")
async def admin_list_orgs(
    type: Optional[str] = None,
    current_user: dict = Depends(require_permission("merchants.view")),
):
    query = {}
    if type:
        query["type"] = type
    items = await db.organizations.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return {"items": items, "total": len(items)}


@router.put("/admin/{org_id}")
async def admin_update_org(org_id: str, body: OrgCreate, current_user: dict = Depends(require_permission("merchants.activate"))):
    res = await db.organizations.update_one({"id": org_id}, {"$set": body.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(404, "Organization not found")
    return {"updated": True}


@router.delete("/admin/{org_id}")
async def admin_delete_org(org_id: str, current_user: dict = Depends(require_permission("merchants.activate"))):
    res = await db.organizations.delete_one({"id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Organization not found")
    return {"deleted": True}


@router.post("/admin/{org_id}/link-driver/{driver_id}")
async def admin_link_driver(org_id: str, driver_id: str, current_user: dict = Depends(require_permission("merchants.activate"))):
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organization not found")
    await db.organizations.update_one({"id": org_id}, {"$addToSet": {"linked_drivers": driver_id}})
    await db.drivers.update_one({"user_id": driver_id}, {"$set": {"org_id": org_id, "org_name": org["name"]}})
    return {"linked": True}


@router.post("/admin/{org_id}/link-kiosk/{kiosk_id}")
async def admin_link_kiosk(org_id: str, kiosk_id: str, current_user: dict = Depends(require_permission("merchants.activate"))):
    org = await db.organizations.find_one({"id": org_id})
    if not org:
        raise HTTPException(404, "Organization not found")
    await db.organizations.update_one({"id": org_id}, {"$addToSet": {"linked_kiosks": kiosk_id}})
    await db.kiosks.update_one({"id": kiosk_id}, {"$set": {"org_id": org_id, "org_name": org["name"]}})
    return {"linked": True}
