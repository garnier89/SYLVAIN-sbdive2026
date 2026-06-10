"""
Pharmacy / Medication ordering (V3Cube "Pharmacy" — 3rd medical tile).
Two complementary flows:
  1. Prescription (sur ordonnance): the customer uploads a prescription photo,
     a partner pharmacy reviews it and sets a price quote, then a courier delivers.
  2. OTC Catalog (catalogue): the customer browses para-pharmacy products,
     adds them to a cart, pays and gets them delivered.
Delivery lifecycle mirrors the parcel courier flow (accept → picked_up → delivered).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field

from core.config import db
from core.deps import get_current_user, calculate_distance
from core.websocket import manager

router = APIRouter(prefix="/pharmacy", tags=["pharmacy"])
admin_router = APIRouter(prefix="/admin/pharmacy", tags=["pharmacy-admin"])

# Order lifecycle: pending(quote/payment) → confirmed → preparing → accepted(courier)
#                  → picked_up → in_transit → delivered ; or cancelled
PHARM_FLOW = ["pending", "confirmed", "preparing", "accepted", "picked_up", "in_transit", "delivered", "cancelled"]

# Default product categories — seeded into db.pharmacy_categories (admin-managed thereafter)
DEFAULT_CATEGORIES = [
    {"key": "pain", "label": "Antidouleurs & Fièvre"},
    {"key": "cold", "label": "Rhume & Toux"},
    {"key": "digestion", "label": "Digestion"},
    {"key": "vitamins", "label": "Vitamines & Compléments"},
    {"key": "hygiene", "label": "Hygiène & Soins"},
    {"key": "baby", "label": "Bébé & Maman"},
    {"key": "firstaid", "label": "Premiers secours"},
    {"key": "dermo", "label": "Dermo-cosmétique"},
]

# Default service settings — fully admin-configurable via /admin/pharmacy/settings
DEFAULT_SETTINGS = {
    "id": "default",
    "active": True,
    "info_note": "Livraison à domicile sous ~45 min.",
    "delivery": {"base": 2.0, "per_km": 0.7, "min": 2.5, "free_threshold": 0.0},
}


async def get_settings() -> dict:
    """Load (or lazily create) the singleton pharmacy settings document."""
    s = await db.pharmacy_settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = {**DEFAULT_SETTINGS, "created_at": datetime.now(timezone.utc).isoformat()}
        await db.pharmacy_settings.insert_one(dict(s))
        s.pop("_id", None)
    # ensure delivery keys exist (forward-compatible defaults)
    d = {**DEFAULT_SETTINGS["delivery"], **(s.get("delivery") or {})}
    s["delivery"] = d
    return s


async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user["role"] not in ("admin", "dispatcher"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    return user


async def _debit_user(user_id: str, amount: float, method: str, description: str):
    """Atomically debit the user's unified SB Pay wallet. Raises 400 if insufficient.
    ('wallet' and 'sbpaygo' are now the same single wallet — db.wallets)."""
    ts = datetime.now(timezone.utc).isoformat()
    res = await db.wallets.update_one(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant")
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Booking",
        "amount": -amount, "balance_after": round(w["balance"], 2),
        "description": description, "status": "completed", "created_at": ts,
    })


async def _refund_user(user_id: str, amount: float, method: str, description: str):
    """Credit back the user's unified SB Pay wallet (used on cancellation of a paid order)."""
    if amount <= 0:
        return
    ts = datetime.now(timezone.utc).isoformat()
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": amount}}, upsert=True)
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user_id, "type": "Refund",
        "amount": amount, "balance_after": round((w or {}).get("balance", 0), 2),
        "description": description, "status": "completed", "created_at": ts,
    })


def _delivery_fee(settings: dict, pharmacy: Optional[dict], lat: Optional[float], lng: Optional[float], subtotal: float = 0.0) -> float:
    d = settings["delivery"]
    threshold = float(d.get("free_threshold") or 0)
    if threshold > 0 and subtotal >= threshold:
        return 0.0
    if pharmacy and pharmacy.get("lat") is not None and lat is not None and lng is not None:
        km = calculate_distance(pharmacy["lat"], pharmacy["lng"], lat, lng)
        return round(max(float(d["min"]), float(d["base"]) + float(d["per_km"]) * km), 2)
    return round(float(d["min"]), 2)


# ─────────────────────────── Public: settings, pharmacies & catalog ───────────────────────────
@router.get("/settings")
async def public_settings(request: Request):
    await get_current_user(request)
    s = await get_settings()
    return {"active": s["active"], "info_note": s.get("info_note", ""), "delivery": s["delivery"]}


@router.get("/pharmacies")
async def list_pharmacies(request: Request):
    await get_current_user(request)
    items = await db.pharmacies.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(100)
    return items


@router.get("/categories")
async def list_categories():
    cats = await db.pharmacy_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    if not cats:
        cats = DEFAULT_CATEGORIES
    return {"categories": [{"key": c["key"], "label": c["label"]} for c in cats]}


@router.get("/products")
async def list_products(request: Request, category: Optional[str] = None, search: Optional[str] = None, pharmacy_id: Optional[str] = None):
    await get_current_user(request)
    query = {"in_stock": {"$ne": False}}
    if category and category != "all":
        query["category"] = category
    if pharmacy_id:
        query["$or"] = [{"pharmacy_id": pharmacy_id}, {"pharmacy_id": None}]
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    items = await db.pharmacy_products.find(query, {"_id": 0}).sort("name", 1).to_list(300)
    return items


# ─────────────────────────── Orders (customer) ───────────────────────────
class OrderItem(BaseModel):
    product_id: str
    qty: int = Field(1, ge=1)


class OrderEstimate(BaseModel):
    items: List[OrderItem] = []
    pharmacy_id: Optional[str] = None
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None


class OrderCreate(BaseModel):
    order_type: str  # 'catalog' | 'prescription'
    items: List[OrderItem] = []
    prescription_image: Optional[str] = None   # base64 data URL
    prescription_note: Optional[str] = None
    pharmacy_id: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    recipient_name: Optional[str] = None
    recipient_phone: Optional[str] = None
    payment_method: str = "cash"


async def _resolve_items(items: List[OrderItem]):
    """Validate items against stored products; compute server-side line totals."""
    resolved, subtotal = [], 0.0
    for it in items:
        prod = await db.pharmacy_products.find_one({"id": it.product_id}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail=f"Produit introuvable: {it.product_id}")
        line = round(float(prod["price"]) * it.qty, 2)
        subtotal += line
        resolved.append({
            "product_id": prod["id"], "name": prod["name"], "price": float(prod["price"]),
            "qty": it.qty, "line_total": line, "image_url": prod.get("image_url"),
        })
    return resolved, round(subtotal, 2)


@router.get("/payment-methods")
async def payment_methods(request: Request):
    """Return the user's available balances for catalog order payment (SB Pay wallet)."""
    user = await get_current_user(request)
    w = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    bal = (w or {}).get("balance", 0.0)
    return {
        "methods": [
            {"id": "cash", "label": "Espèces à la livraison", "balance": None},
            {"id": "card", "label": "Carte à la livraison", "balance": None},
            {"id": "wallet", "label": "SB Pay", "balance": bal, "currency": "EUR"},
        ],
    }


@router.post("/orders/estimate")
async def estimate_order(data: OrderEstimate, request: Request):
    await get_current_user(request)
    settings = await get_settings()
    _, subtotal = await _resolve_items(data.items)
    pharmacy = await db.pharmacies.find_one({"id": data.pharmacy_id}, {"_id": 0}) if data.pharmacy_id else None
    fee = _delivery_fee(settings, pharmacy, data.delivery_lat, data.delivery_lng, subtotal)
    return {"subtotal": subtotal, "delivery_fee": fee, "total": round(subtotal + fee, 2)}


@router.post("/orders")
async def create_order(data: OrderCreate, request: Request):
    user = await get_current_user(request)
    settings = await get_settings()
    if not settings.get("active", True):
        raise HTTPException(status_code=400, detail="Le service Pharmacie est momentanément indisponible")
    if data.order_type not in ("catalog", "prescription"):
        raise HTTPException(status_code=400, detail="Type de commande invalide")
    if data.delivery_lat is None or data.delivery_lng is None:
        raise HTTPException(status_code=400, detail="Adresse de livraison requise")

    pharmacy = await db.pharmacies.find_one({"id": data.pharmacy_id}, {"_id": 0}) if data.pharmacy_id else None

    if data.order_type == "catalog":
        if not data.items:
            raise HTTPException(status_code=400, detail="Panier vide")
        items, subtotal = await _resolve_items(data.items)
        medication_total = subtotal
        status = "confirmed"   # priced → ready for the pharmacy to prepare
    else:  # prescription
        if not data.prescription_image:
            raise HTTPException(status_code=400, detail="Photo de l'ordonnance requise")
        items, medication_total = [], 0.0
        status = "pending"     # awaiting pharmacy price quote

    fee = _delivery_fee(settings, pharmacy, data.delivery_lat, data.delivery_lng, medication_total)
    total = round(medication_total + fee, 2)

    # Catalog orders paid up-front by wallet / SB PayGo are debited atomically now.
    payment_status = "pending"
    if data.order_type == "catalog" and data.payment_method in ("wallet", "sbpaygo") and total > 0:
        await _debit_user(user["id"], total, data.payment_method, f"Commande pharmacie — {len(items)} article(s)")
        payment_status = "paid"

    order = {
        "id": f"rx_{uuid.uuid4().hex[:12]}",
        "user_id": user["id"],
        "driver_id": None,
        "order_type": data.order_type,
        "items": items,
        "prescription_image": data.prescription_image,
        "prescription_note": data.prescription_note,
        "pharmacy_id": data.pharmacy_id,
        "pharmacy_name": (pharmacy or {}).get("name"),
        "delivery_address": data.delivery_address,
        "delivery_lat": data.delivery_lat,
        "delivery_lng": data.delivery_lng,
        "recipient_name": data.recipient_name,
        "recipient_phone": data.recipient_phone,
        "medication_total": medication_total,
        "delivery_fee": fee,
        "total": total,
        "payment_method": data.payment_method,
        "payment_status": payment_status,
        "status": status,
        "needs_quote": data.order_type == "prescription",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pharmacy_orders.insert_one(order)
    order.pop("_id", None)
    try:
        await manager.broadcast_to_drivers({"type": "new_pharmacy_order", "order_id": order["id"], "total": total})
    except Exception:
        pass
    return order


@router.get("/orders")
async def list_my_orders(request: Request, limit: int = 30):
    user = await get_current_user(request)
    items = await db.pharmacy_orders.find({"user_id": user["id"]}, {"_id": 0, "prescription_image": 0}).sort("created_at", -1).to_list(limit)
    return items


async def _driver_live_location(driver_id):
    if not driver_id:
        return None
    loc = manager.get_driver_location(driver_id)
    if loc and loc.get("lat") is not None:
        return {"lat": loc["lat"], "lng": loc["lng"]}
    drv = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0, "current_lat": 1, "current_lng": 1})
    if drv and drv.get("current_lat") is not None:
        return {"lat": drv["current_lat"], "lng": drv["current_lng"]}
    return None


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order["user_id"] != user["id"] and user["role"] not in ("admin", "dispatcher", "driver"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    order["driver_location"] = await _driver_live_location(order.get("driver_id"))
    return order


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if order["status"] in ("in_transit", "delivered"):
        raise HTTPException(status_code=400, detail="Commande déjà en cours de livraison")
    # Refund up-front payment (wallet / SB PayGo) when cancelling a paid order.
    if order.get("payment_status") == "paid" and order.get("payment_method") in ("wallet", "sbpaygo"):
        await _refund_user(order["user_id"], round(float(order.get("total", 0)), 2), order["payment_method"], f"Remboursement commande pharmacie {order_id}")
    await db.pharmacy_orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "payment_status": "refunded" if order.get("payment_status") == "paid" else order.get("payment_status", "pending")}})
    return {"id": order_id, "status": "cancelled"}


@router.post("/orders/{order_id}/pay")
async def pay_order(order_id: str, request: Request):
    """Customer settles an unpaid order (e.g. a quoted prescription).
    wallet / SB PayGo are debited now ; cash / card are settled at delivery (COD)."""
    user = await get_current_user(request)
    body = await request.json()
    method = body.get("payment_method")
    if method not in ("wallet", "sbpaygo", "cash", "card"):
        raise HTTPException(status_code=400, detail="Méthode de paiement invalide")
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if order.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Commande déjà payée")
    if order.get("needs_quote") or order.get("status") == "pending":
        raise HTTPException(status_code=400, detail="En attente du devis de la pharmacie")
    if order.get("status") in ("cancelled", "delivered"):
        raise HTTPException(status_code=400, detail="Commande non payable")
    amount = round(float(order.get("total", 0)), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    # Cash / card → paid at delivery, no debit now (COD = cash on delivery).
    if method in ("cash", "card"):
        await db.pharmacy_orders.update_one({"id": order_id}, {"$set": {"payment_method": method, "payment_status": "cod"}})
        return {"id": order_id, "payment_status": "cod", "payment_method": method, "total": amount, "cash_on_delivery": True}
    await _debit_user(user["id"], amount, method, f"Commande pharmacie {order_id}")
    await db.pharmacy_orders.update_one({"id": order_id}, {"$set": {"payment_status": "paid", "payment_method": method}})
    return {"id": order_id, "payment_status": "paid", "payment_method": method, "total": amount}


# ─────────────────────────── Driver side ───────────────────────────
@router.get("/driver/available")
async def driver_available(request: Request):
    await get_current_user(request)
    items = await db.pharmacy_orders.find(
        {"status": {"$in": ["confirmed", "preparing"]}, "driver_id": None},
        {"_id": 0, "prescription_image": 0},
    ).sort("created_at", -1).to_list(30)
    return items


@router.get("/driver/active")
async def driver_active(request: Request):
    user = await get_current_user(request)
    items = await db.pharmacy_orders.find(
        {"driver_id": user["id"], "status": {"$nin": ["delivered", "cancelled"]}},
        {"_id": 0, "prescription_image": 0},
    ).sort("created_at", -1).to_list(30)
    return items


@router.post("/orders/{order_id}/accept")
async def driver_accept(order_id: str, request: Request):
    user = await get_current_user(request)
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order.get("driver_id"):
        raise HTTPException(status_code=400, detail="Commande déjà prise en charge")
    await db.pharmacy_orders.update_one(
        {"id": order_id},
        {"$set": {"driver_id": user["id"], "status": "accepted", "accepted_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {**order, "driver_id": user["id"], "status": "accepted"}


@router.post("/orders/{order_id}/status")
async def driver_update_status(order_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in PHARM_FLOW:
        raise HTTPException(status_code=400, detail="Statut invalide")
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    update = {"status": new_status}
    if new_status == "delivered":
        update["payment_status"] = "paid"
    await db.pharmacy_orders.update_one({"id": order_id}, {"$set": update})
    return {"id": order_id, "status": new_status}


# ─────────────────────────── Admin: pharmacies CRUD ───────────────────────────
class PharmacyModel(BaseModel):
    name: str = Field(..., min_length=2)
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    open_hours: Optional[str] = None
    image_url: Optional[str] = None
    rating: Optional[float] = 4.7
    active: bool = True


@admin_router.get("/pharmacies")
async def admin_list_pharmacies(request: Request):
    await _require_admin(request)
    return await db.pharmacies.find({}, {"_id": 0}).sort("name", 1).to_list(200)


@admin_router.post("/pharmacies")
async def admin_create_pharmacy(data: PharmacyModel, request: Request):
    await _require_admin(request)
    doc = {"id": f"phm_{uuid.uuid4().hex[:10]}", **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.pharmacies.insert_one(doc)
    doc.pop("_id", None)
    return doc


@admin_router.put("/pharmacies/{pharmacy_id}")
async def admin_update_pharmacy(pharmacy_id: str, data: PharmacyModel, request: Request):
    await _require_admin(request)
    r = await db.pharmacies.update_one({"id": pharmacy_id}, {"$set": data.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pharmacie introuvable")
    return {"id": pharmacy_id, **data.model_dump()}


@admin_router.delete("/pharmacies/{pharmacy_id}")
async def admin_delete_pharmacy(pharmacy_id: str, request: Request):
    await _require_admin(request)
    await db.pharmacies.delete_one({"id": pharmacy_id})
    return {"ok": True}


# ─────────────────────────── Admin: products CRUD ───────────────────────────
class ProductModel(BaseModel):
    name: str = Field(..., min_length=2)
    category: str = "pain"
    price: float = Field(..., ge=0)
    description: Optional[str] = None
    image_url: Optional[str] = None
    pharmacy_id: Optional[str] = None   # None = available everywhere
    in_stock: bool = True


@admin_router.get("/products")
async def admin_list_products(request: Request, category: Optional[str] = None):
    await _require_admin(request)
    query = {}
    if category and category != "all":
        query["category"] = category
    return await db.pharmacy_products.find(query, {"_id": 0}).sort("name", 1).to_list(500)


@admin_router.post("/products")
async def admin_create_product(data: ProductModel, request: Request):
    await _require_admin(request)
    doc = {"id": f"prod_{uuid.uuid4().hex[:10]}", **data.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.pharmacy_products.insert_one(doc)
    doc.pop("_id", None)
    return doc


@admin_router.put("/products/{product_id}")
async def admin_update_product(product_id: str, data: ProductModel, request: Request):
    await _require_admin(request)
    r = await db.pharmacy_products.update_one({"id": product_id}, {"$set": data.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return {"id": product_id, **data.model_dump()}


@admin_router.delete("/products/{product_id}")
async def admin_delete_product(product_id: str, request: Request):
    await _require_admin(request)
    await db.pharmacy_products.delete_one({"id": product_id})
    return {"ok": True}


# ─────────────────────────── Admin: settings ───────────────────────────
class DeliveryConfig(BaseModel):
    base: float = Field(2.0, ge=0)
    per_km: float = Field(0.7, ge=0)
    min: float = Field(2.5, ge=0)
    free_threshold: float = Field(0.0, ge=0)  # 0 = disabled


class SettingsModel(BaseModel):
    active: bool = True
    info_note: str = ""
    delivery: DeliveryConfig


@admin_router.get("/settings")
async def admin_get_settings(request: Request):
    await _require_admin(request)
    return await get_settings()


@admin_router.put("/settings")
async def admin_update_settings(data: SettingsModel, request: Request):
    await _require_admin(request)
    payload = {"active": data.active, "info_note": data.info_note, "delivery": data.delivery.model_dump(),
               "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.pharmacy_settings.update_one({"id": "default"}, {"$set": payload}, upsert=True)
    return {"id": "default", **payload}


# ─────────────────────────── Admin: categories CRUD ───────────────────────────
class CategoryModel(BaseModel):
    key: str = Field(..., min_length=2, pattern=r"^[a-z0-9_]+$")
    label: str = Field(..., min_length=2)
    order: int = 0


@admin_router.get("/categories")
async def admin_list_categories(request: Request):
    await _require_admin(request)
    cats = await db.pharmacy_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return cats


@admin_router.post("/categories")
async def admin_create_category(data: CategoryModel, request: Request):
    await _require_admin(request)
    if await db.pharmacy_categories.find_one({"key": data.key}):
        raise HTTPException(status_code=400, detail="Cette clé de catégorie existe déjà")
    doc = {"id": f"cat_{uuid.uuid4().hex[:8]}", **data.model_dump()}
    await db.pharmacy_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@admin_router.put("/categories/{key}")
async def admin_update_category(key: str, data: CategoryModel, request: Request):
    await _require_admin(request)
    r = await db.pharmacy_categories.update_one({"key": key}, {"$set": {"label": data.label, "order": data.order}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    return {"key": key, "label": data.label, "order": data.order}


@admin_router.delete("/categories/{key}")
async def admin_delete_category(key: str, request: Request):
    await _require_admin(request)
    if await db.pharmacy_products.count_documents({"category": key}) > 0:
        raise HTTPException(status_code=400, detail="Des produits utilisent cette catégorie")
    await db.pharmacy_categories.delete_one({"key": key})
    return {"ok": True}




# ─────────────────────────── Admin: orders & price quote ───────────────────────────
@admin_router.get("/orders")
async def admin_list_orders(request: Request, status: Optional[str] = None):
    await _require_admin(request)
    query = {}
    if status:
        query["status"] = status
    items = await db.pharmacy_orders.find(query, {"_id": 0, "prescription_image": 0}).sort("created_at", -1).to_list(200)
    return items


@admin_router.get("/orders/{order_id}")
async def admin_get_order(order_id: str, request: Request):
    await _require_admin(request)
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return order


@admin_router.post("/orders/{order_id}/quote")
async def admin_quote_order(order_id: str, request: Request):
    """Pharmacy sets the medication price for a prescription order and confirms it."""
    await _require_admin(request)
    body = await request.json()
    medication_total = round(float(body.get("medication_total", 0)), 2)
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    total = round(medication_total + float(order.get("delivery_fee", 0)), 2)
    await db.pharmacy_orders.update_one(
        {"id": order_id},
        {"$set": {"medication_total": medication_total, "total": total, "needs_quote": False, "status": "confirmed"}},
    )
    # Notify the customer that the quote is ready (real-time → "Payer maintenant")
    try:
        await manager.send_personal_message({
            "type": "pharmacy_quote_ready",
            "order_id": order_id,
            "medication_total": medication_total,
            "total": total,
        }, order["user_id"])
    except Exception:
        pass
    # Remote push (Expo) — alerts the customer even if the app is closed.
    try:
        from core.push import notify_user
        await notify_user(
            order["user_id"],
            title="💊 Devis pharmacie prêt",
            body=f"Votre commande est prête à être payée : {total:.2f} €.",
            data={"type": "pharmacy_quote_ready", "order_id": order_id, "total": total},
        )
    except Exception:
        pass
    return {"id": order_id, "medication_total": medication_total, "total": total, "status": "confirmed"}


@admin_router.post("/orders/{order_id}/status")
async def admin_update_order_status(order_id: str, request: Request):
    await _require_admin(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in PHARM_FLOW:
        raise HTTPException(status_code=400, detail="Statut invalide")
    order = await db.pharmacy_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    update = {"status": new_status}
    if new_status == "delivered":
        update["payment_status"] = "paid"
    await db.pharmacy_orders.update_one({"id": order_id}, {"$set": update})
    return {"id": order_id, "status": new_status}


# ─────────────────────────── Seed (idempotent) ───────────────────────────
SEED_PHARMACIES = [
    {"name": "Pharmacie du Centre", "address": "12 Rue de Rivoli, Paris", "city": "Paris", "phone": "+33140000001", "lat": 48.8566, "lng": 2.3522, "open_hours": "8h-20h (Lun-Sam)", "rating": 4.8, "image_url": "https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400"},
    {"name": "Grande Pharmacie de la Gare", "address": "5 Place de la Gare, Paris", "city": "Paris", "phone": "+33140000002", "lat": 48.8443, "lng": 2.3744, "open_hours": "24h/24", "rating": 4.6, "image_url": "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=400"},
    {"name": "Pharmacie Saint-Louis", "address": "Fort-de-France", "city": "Martinique", "phone": "+596596000003", "lat": 14.6161, "lng": -61.0588, "open_hours": "8h30-19h", "rating": 4.7, "image_url": "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400"},
]

SEED_PRODUCTS = [
    {"name": "Paracétamol 1g (8 cp)", "category": "pain", "price": 2.50, "description": "Douleurs et fièvre", "image_url": "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300"},
    {"name": "Ibuprofène 400mg (12 cp)", "category": "pain", "price": 3.20, "description": "Anti-inflammatoire", "image_url": "https://images.unsplash.com/photo-1550572017-edd951aa8f7b?w=300"},
    {"name": "Sirop antitussif 150ml", "category": "cold", "price": 5.90, "description": "Toux sèche", "image_url": "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?w=300"},
    {"name": "Spray nasal décongestionnant", "category": "cold", "price": 4.50, "description": "Nez bouché", "image_url": "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=300"},
    {"name": "Pansements gastriques (20 sachets)", "category": "digestion", "price": 6.80, "description": "Brûlures d'estomac", "image_url": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300"},
    {"name": "Vitamine C 1000mg (20 cp)", "category": "vitamins", "price": 7.50, "description": "Tonus & immunité", "image_url": "https://images.unsplash.com/photo-1577563908411-5077b6dc7624?w=300"},
    {"name": "Magnésium B6 (60 gél.)", "category": "vitamins", "price": 9.90, "description": "Fatigue & stress", "image_url": "https://images.unsplash.com/photo-1626716493137-b67fe9501e76?w=300"},
    {"name": "Gel hydroalcoolique 500ml", "category": "hygiene", "price": 4.20, "description": "Désinfection des mains", "image_url": "https://images.unsplash.com/photo-1584634731339-252c581abfc5?w=300"},
    {"name": "Sérum physiologique (40 unidoses)", "category": "baby", "price": 3.90, "description": "Hygiène nez/yeux bébé", "image_url": "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300"},
    {"name": "Thermomètre digital", "category": "firstaid", "price": 8.50, "description": "Mesure rapide", "image_url": "https://images.unsplash.com/photo-1606206522398-de26c5b91d99?w=300"},
    {"name": "Compresses stériles (25)", "category": "firstaid", "price": 3.40, "description": "Soins des plaies", "image_url": "https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=300"},
    {"name": "Crème hydratante visage 50ml", "category": "dermo", "price": 12.90, "description": "Peaux sensibles", "image_url": "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300"},
]


async def seed_pharmacy():
    if await db.pharmacies.count_documents({}) == 0:
        docs = [{"id": f"phm_{uuid.uuid4().hex[:10]}", **p, "active": True, "created_at": datetime.now(timezone.utc).isoformat()} for p in SEED_PHARMACIES]
        await db.pharmacies.insert_many(docs)
    if await db.pharmacy_products.count_documents({}) == 0:
        docs = [{"id": f"prod_{uuid.uuid4().hex[:10]}", **p, "pharmacy_id": None, "in_stock": True, "created_at": datetime.now(timezone.utc).isoformat()} for p in SEED_PRODUCTS]
        await db.pharmacy_products.insert_many(docs)
    if await db.pharmacy_categories.count_documents({}) == 0:
        docs = [{"id": f"cat_{uuid.uuid4().hex[:8]}", "key": c["key"], "label": c["label"], "order": i} for i, c in enumerate(DEFAULT_CATEGORIES)]
        await db.pharmacy_categories.insert_many(docs)
    # ensure the settings singleton exists
    await get_settings()
