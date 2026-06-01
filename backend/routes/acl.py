"""
ACL granulaire — Iteration 74 (V3Cube admin_groups + admin_permissions integration).

Collections:
- admin_roles: { id, name, permissions: [str], is_system: bool, description }
- admin_permissions: référentiel des permissions (seedé au startup)
- users.role_ids[]: array de role_id sur le user (admin role)

Permission format: "panel.action" — ex: "dispatch.assign", "billing.read", "drivers.approve"
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.config import db
from core.deps import get_current_user

router = APIRouter(prefix="/acl", tags=["acl"])

# ===================== Seed referentials =====================

PERMISSION_REGISTRY = [
    # Dispatch
    ("dispatch.view", "Voir le panel dispatch"),
    ("dispatch.assign", "Assigner manuellement une course à un chauffeur"),
    ("dispatch.cancel", "Annuler une course en cours"),
    ("dispatch.sos.handle", "Traiter les alertes SOS"),
    # Billing
    ("billing.view", "Voir le panel facturation"),
    ("billing.settlements.process", "Traiter les versements chauffeurs"),
    ("billing.withdrawals.approve", "Approuver les retraits wallet"),
    ("billing.disputes.resolve", "Résoudre les litiges"),
    ("billing.promocodes.create", "Créer/modifier des codes promo"),
    # Server (Sys Admin)
    ("server.view", "Voir le panel système"),
    ("server.settings.edit", "Modifier les paramètres généraux"),
    ("server.geofences.edit", "Modifier les geofences/aéroports"),
    ("server.templates.edit", "Modifier templates email/SMS"),
    ("server.monitoring.view", "Voir monitoring"),
    # Users CRM
    ("users.view", "Voir les clients"),
    ("users.suspend", "Suspendre/réactiver un client"),
    ("users.newsletter.send", "Envoyer newsletter"),
    ("users.banners.edit", "Gérer les bannières"),
    # Drivers CRM
    ("drivers.view", "Voir les chauffeurs"),
    ("drivers.approve", "Approuver inscription chauffeur"),
    ("drivers.reject", "Rejeter inscription chauffeur"),
    ("drivers.documents.validate", "Valider documents (assurance, permis)"),
    ("drivers.priority.toggle", "Activer flag prioritaire VIP"),
    ("drivers.score.adjust", "Ajuster manuellement le score"),
    ("drivers.rewards.config", "Configurer les récompenses"),
    # Merchants CRM
    ("merchants.view", "Voir les marchands"),
    ("merchants.activate", "Activer/désactiver un marchand"),
    ("merchants.kiosks.manage", "Gérer bornes SB Drive Tab"),
    ("merchants.featured.toggle", "Activer Sponsoring marchand"),
    # Super Admin
    ("super.all", "Accès complet (super-admin)"),
    ("super.audit.view", "Voir les audit logs"),
    ("super.acl.edit", "Gérer rôles et permissions ACL"),
]

DEFAULT_ROLES = [
    ("super_admin", "Super Administrateur (tout accès)", ["super.all"], True),
    ("dispatcher", "Dispatcher (opérations courses)", ["dispatch.view", "dispatch.assign", "dispatch.cancel", "dispatch.sos.handle", "drivers.view"], True),
    ("billing", "Comptabilité", ["billing.view", "billing.settlements.process", "billing.withdrawals.approve", "billing.disputes.resolve", "billing.promocodes.create"], True),
    ("sysadmin", "Administrateur système", ["server.view", "server.settings.edit", "server.geofences.edit", "server.templates.edit", "server.monitoring.view"], True),
    ("crm_users", "CRM Clients", ["users.view", "users.suspend", "users.newsletter.send", "users.banners.edit"], True),
    ("crm_drivers", "CRM Chauffeurs", ["drivers.view", "drivers.approve", "drivers.reject", "drivers.documents.validate", "drivers.priority.toggle", "drivers.score.adjust", "drivers.rewards.config"], True),
    ("crm_merchants", "CRM Marchands", ["merchants.view", "merchants.activate", "merchants.kiosks.manage", "merchants.featured.toggle"], True),
]


async def seed_acl():
    """Seed permissions referentials + default roles. Idempotent."""
    # Permissions
    for key, label in PERMISSION_REGISTRY:
        await db.admin_permissions.update_one(
            {"key": key},
            {"$set": {"key": key, "label": label}},
            upsert=True,
        )
    # Roles
    for name, desc, perms, is_system in DEFAULT_ROLES:
        existing = await db.admin_roles.find_one({"name": name})
        if not existing:
            await db.admin_roles.insert_one({
                "id": f"role_{uuid.uuid4().hex[:10]}",
                "name": name,
                "description": desc,
                "permissions": perms,
                "is_system": is_system,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            # Keep custom perms but sync description if system role
            if is_system:
                await db.admin_roles.update_one(
                    {"name": name},
                    {"$set": {"description": desc, "permissions": perms, "is_system": True}},
                )

    # Map existing 6 panel demo accounts to their proper role
    panel_to_role = {
        "dispatch@superapp.com": "dispatcher",
        "billing@superapp.com": "billing",
        "sysadmin@superapp.com": "sysadmin",
        "crm-users@superapp.com": "crm_users",
        "crm-drivers@superapp.com": "crm_drivers",
        "crm-merchants@superapp.com": "crm_merchants",
    }
    for email, role_name in panel_to_role.items():
        role = await db.admin_roles.find_one({"name": role_name})
        if role:
            await db.users.update_one(
                {"email": email},
                {"$set": {"role_ids": [role["id"]], "role_name": role_name}},
            )
    # Super-admin gets super_admin role
    super_role = await db.admin_roles.find_one({"name": "super_admin"})
    if super_role:
        await db.users.update_one(
            {"email": "admin@superapp.com"},
            {"$set": {"role_ids": [super_role["id"]], "role_name": "super_admin"}},
        )


# ===================== Models =====================

class RoleCreate(BaseModel):
    name: str
    description: str
    permissions: List[str]


class RoleAssign(BaseModel):
    user_id: str
    role_ids: List[str]


# ===================== Endpoints =====================

async def require_super_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    # Check super.acl.edit permission
    user_perms = await get_user_permissions(current_user.get("id"))
    if "super.all" not in user_perms and "super.acl.edit" not in user_perms:
        raise HTTPException(403, "Missing super.acl.edit permission")
    return current_user


async def get_user_permissions(user_id: str) -> set:
    """Return the union of permissions across all roles assigned to the user."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role_ids": 1, "role": 1})
    if not user:
        return set()
    if not user.get("role_ids"):
        # Legacy super-admin without role assignment
        return {"super.all"} if user.get("role") == "admin" else set()
    roles = await db.admin_roles.find({"id": {"$in": user["role_ids"]}}, {"_id": 0, "permissions": 1}).to_list(50)
    perms = set()
    for r in roles:
        perms.update(r.get("permissions", []))
    return perms


@router.get("/permissions/registry")
async def get_permissions_registry(current_user: dict = Depends(require_super_admin)):
    """All available permissions in the system."""
    items = await db.admin_permissions.find({}, {"_id": 0}).sort("key", 1).to_list(500)
    return {"items": items, "total": len(items)}


@router.get("/roles")
async def list_roles(current_user: dict = Depends(get_current_user)):
    """List all roles. Read-only for any admin."""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    items = await db.admin_roles.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"items": items, "total": len(items)}


@router.post("/roles")
async def create_role(body: RoleCreate, current_user: dict = Depends(require_super_admin)):
    if await db.admin_roles.find_one({"name": body.name}):
        raise HTTPException(400, "Role name already exists")
    role = {
        "id": f"role_{uuid.uuid4().hex[:10]}",
        "name": body.name,
        "description": body.description,
        "permissions": body.permissions,
        "is_system": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.admin_roles.insert_one(role)
    role.pop("_id", None)
    return role


@router.put("/roles/{role_id}")
async def update_role(role_id: str, body: RoleCreate, current_user: dict = Depends(require_super_admin)):
    existing = await db.admin_roles.find_one({"id": role_id})
    if not existing:
        raise HTTPException(404, "Role not found")
    if existing.get("is_system"):
        raise HTTPException(400, "System role cannot be modified (clone it instead)")
    await db.admin_roles.update_one({"id": role_id}, {"$set": {
        "name": body.name, "description": body.description, "permissions": body.permissions,
    }})
    return {"updated": True}


@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, current_user: dict = Depends(require_super_admin)):
    existing = await db.admin_roles.find_one({"id": role_id})
    if not existing:
        raise HTTPException(404, "Role not found")
    if existing.get("is_system"):
        raise HTTPException(400, "System role cannot be deleted")
    # Detach from users
    await db.users.update_many({"role_ids": role_id}, {"$pull": {"role_ids": role_id}})
    await db.admin_roles.delete_one({"id": role_id})
    return {"deleted": True}


@router.get("/users")
async def list_admin_users(current_user: dict = Depends(get_current_user)):
    """List admin users with their roles."""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    users = await db.users.find({"role": "admin"}, {"_id": 0, "password_hash": 0}).sort("email", 1).to_list(200)
    # Resolve roles
    role_cache = {r["id"]: r for r in await db.admin_roles.find({}, {"_id": 0}).to_list(100)}
    for u in users:
        u["roles_resolved"] = [role_cache.get(rid) for rid in (u.get("role_ids") or []) if rid in role_cache]
    return {"items": users, "total": len(users)}


@router.post("/users/{user_id}/roles")
async def assign_roles_to_user(user_id: str, body: RoleAssign, current_user: dict = Depends(require_super_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    # Validate all role_ids exist
    valid_roles = await db.admin_roles.find({"id": {"$in": body.role_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
    valid_ids = [r["id"] for r in valid_roles]
    role_name = valid_roles[0]["name"] if valid_roles else None
    await db.users.update_one({"id": user_id}, {"$set": {"role_ids": valid_ids, "role_name": role_name}})
    return {"updated": True, "roles_assigned": valid_ids}


@router.get("/me/permissions")
async def my_permissions(current_user: dict = Depends(get_current_user)):
    """Return permissions for the current user (for frontend route guards)."""
    perms = await get_user_permissions(current_user.get("id"))
    return {"permissions": sorted(perms), "user_id": current_user.get("id"), "email": current_user.get("email")}


# ===================== ADMIN USER CRUD (matches XJekPlus "Administrator" page) =====================

class AdminUserCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str
    role_id: str  # FK to admin_roles


class AdminUserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[str] = None
    is_active: Optional[bool] = None


@router.post("/admins")
async def create_admin(body: AdminUserCreate, current_user: dict = Depends(require_super_admin)):
    from core.deps import hash_password
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(400, "Email déjà utilisé")
    role = await db.admin_roles.find_one({"id": body.role_id}, {"_id": 0})
    if not role:
        raise HTTPException(400, "Rôle introuvable")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "name": f"{body.first_name} {body.last_name}".strip(),
        "first_name": body.first_name,
        "last_name": body.last_name,
        "phone": None,
        "role": "admin",
        "role_ids": [body.role_id],
        "role_name": role["name"],
        "is_verified": True,
        "is_active": True,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.put("/admins/{user_id}")
async def update_admin(user_id: str, body: AdminUserUpdate, current_user: dict = Depends(require_super_admin)):
    from core.deps import hash_password
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "Admin introuvable")
    updates = {}
    if body.first_name is not None:
        updates["first_name"] = body.first_name
    if body.last_name is not None:
        updates["last_name"] = body.last_name
    if body.first_name is not None or body.last_name is not None:
        updates["name"] = f"{body.first_name or user.get('first_name','')} {body.last_name or user.get('last_name','')}".strip()
    if body.email is not None:
        if await db.users.find_one({"email": body.email.lower(), "id": {"$ne": user_id}}):
            raise HTTPException(400, "Email déjà utilisé")
        updates["email"] = body.email.lower()
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if body.role_id is not None:
        role = await db.admin_roles.find_one({"id": body.role_id}, {"_id": 0})
        if not role:
            raise HTTPException(400, "Rôle introuvable")
        updates["role_ids"] = [body.role_id]
        updates["role_name"] = role["name"]
    if body.is_active is not None:
        updates["is_active"] = bool(body.is_active)
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    return {"updated": True}


@router.delete("/admins/{user_id}")
async def delete_admin(user_id: str, current_user: dict = Depends(require_super_admin)):
    if user_id == current_user.get("id"):
        raise HTTPException(400, "Impossible de se supprimer soi-même")
    res = await db.users.delete_one({"id": user_id, "role": "admin"})
    if res.deleted_count == 0:
        raise HTTPException(404, "Admin introuvable")
    return {"deleted": True}


@router.post("/admins/{user_id}/toggle-status")
async def toggle_admin_status(user_id: str, current_user: dict = Depends(require_super_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_active": 1})
    if not user:
        raise HTTPException(404, "Admin introuvable")
    new_status = not bool(user.get("is_active", True))
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": new_status}})
    return {"is_active": new_status}
