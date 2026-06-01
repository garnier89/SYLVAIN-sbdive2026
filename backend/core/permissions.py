"""
Permission helper for ACL granular routes.

Usage:
    from core.permissions import require_permission

    @router.post("/admin/drivers/{id}/approve")
    async def approve(id: str, current_user: dict = Depends(require_permission("drivers.approve"))):
        ...
"""
from fastapi import Depends, HTTPException
from core.deps import get_current_user
from core.config import db


async def _user_permissions(user_id: str) -> set:
    """Same logic as routes.acl.get_user_permissions but isolated to avoid circular import."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role_ids": 1, "role": 1})
    if not user:
        return set()
    if not user.get("role_ids"):
        return {"super.all"} if user.get("role") == "admin" else set()
    roles = await db.admin_roles.find({"id": {"$in": user["role_ids"]}}, {"_id": 0, "permissions": 1}).to_list(50)
    perms = set()
    for r in roles:
        perms.update(r.get("permissions", []))
    return perms


def require_permission(permission: str):
    """FastAPI dependency factory enforcing a specific permission."""
    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") != "admin":
            raise HTTPException(403, "Admin role required")
        perms = await _user_permissions(current_user.get("id"))
        if "super.all" in perms or permission in perms:
            return current_user
        raise HTTPException(403, f"Missing permission: {permission}")
    return _check


def require_any_permission(*permissions: str):
    """At least one of the permissions must be granted."""
    async def _check(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") != "admin":
            raise HTTPException(403, "Admin role required")
        perms = await _user_permissions(current_user.get("id"))
        if "super.all" in perms or any(p in perms for p in permissions):
            return current_user
        raise HTTPException(403, f"Missing one of: {', '.join(permissions)}")
    return _check
