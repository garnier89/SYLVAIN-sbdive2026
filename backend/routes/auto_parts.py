"""SB Auto Pièces — e-commerce de pièces & accessoires auto/moto.

Catalogue (auto_parts_products) auto-seedé avec ~24 produits de démo, commandes
(auto_parts_orders) avec débit wallet à la commande + décrément de stock, et un
back-office admin (catalogue + statuts de commande).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification

router = APIRouter(prefix="/auto-parts", tags=["auto-parts"])
admin_router = APIRouter(prefix="/admin/auto-parts", tags=["admin-auto-parts"])

DELIVERY_FEE = 5.90
ORDER_STATUSES = ["confirmed", "preparing", "shipped", "ready", "delivered", "cancelled"]

CATEGORIES = [
    {"id": "moteur", "label": "Pièces moteur", "type": "auto", "icon": "Engine"},
    {"id": "freinage", "label": "Freinage", "type": "auto", "icon": "Disc"},
    {"id": "pneus", "label": "Pneus", "type": "auto", "icon": "Tire"},
    {"id": "batteries", "label": "Batteries", "type": "auto", "icon": "CarBattery"},
    {"id": "filtres", "label": "Filtres", "type": "auto", "icon": "Funnel"},
    {"id": "huiles", "label": "Huiles & fluides", "type": "auto", "icon": "Drop"},
    {"id": "accessoires_auto", "label": "Accessoires auto", "type": "auto", "icon": "Car"},
    {"id": "pieces_moto", "label": "Pièces moto", "type": "moto", "icon": "Motorcycle"},
    {"id": "casques", "label": "Casques & équipement", "type": "moto", "icon": "Helmet"},
    {"id": "accessoires_moto", "label": "Accessoires moto", "type": "moto", "icon": "Wrench"},
]
_CAT_IDS = {c["id"] for c in CATEGORIES}

_SEED = [
    # ── AUTO ──
    ("Plaquettes de frein avant", "Bosch", "freinage", "auto", 34.90, 40, ["Renault", "Peugeot", "Citroën"], "Jeu de 4 plaquettes haute performance."),
    ("Disques de frein ventilés (x2)", "Brembo", "freinage", "auto", 79.00, 25, ["Renault", "Peugeot", "Volkswagen"], "Paire de disques ventilés Ø 280 mm."),
    ("Pneu été 205/55 R16", "Michelin", "pneus", "auto", 92.50, 60, ["Universel"], "Pneu tourisme, excellente adhérence."),
    ("Pneu hiver 195/65 R15", "Continental", "pneus", "auto", 84.00, 35, ["Universel"], "Pneu hiver certifié 3PMSF."),
    ("Batterie 60Ah 540A", "Varta", "batteries", "auto", 109.00, 20, ["Universel"], "Batterie de démarrage sans entretien."),
    ("Batterie 70Ah 640A", "Bosch", "batteries", "auto", 129.00, 15, ["Universel"], "Forte puissance de démarrage."),
    ("Filtre à huile", "Mann-Filter", "filtres", "auto", 8.90, 120, ["Renault", "Peugeot", "Citroën"], "Filtration optimale du moteur."),
    ("Filtre à air sport", "K&N", "filtres", "auto", 49.00, 30, ["Universel"], "Filtre lavable longue durée."),
    ("Filtre habitacle charbon actif", "Mann-Filter", "filtres", "auto", 14.50, 80, ["Universel"], "Anti-pollen et anti-odeurs."),
    ("Huile moteur 5W30 synthétique 5L", "Total", "huiles", "auto", 42.00, 70, ["Universel"], "Lubrifiant 100% synthèse."),
    ("Liquide de refroidissement 5L", "Motul", "huiles", "auto", 19.90, 50, ["Universel"], "Protection -35°C, longue durée."),
    ("Courroie de distribution + kit", "SKF", "moteur", "auto", 89.00, 18, ["Renault", "Peugeot"], "Kit complet galets + courroie."),
    ("Bougies d'allumage (x4)", "NGK", "moteur", "auto", 24.00, 90, ["Universel"], "Jeu de 4 bougies iridium."),
    ("Alternateur 120A", "Valeo", "moteur", "auto", 189.00, 8, ["Renault", "Peugeot", "Citroën"], "Alternateur reconditionné garanti."),
    ("Essuie-glaces avant (x2)", "Bosch", "accessoires_auto", "auto", 21.90, 100, ["Universel"], "Balais aérodynamiques flat blade."),
    ("Tapis de sol caoutchouc (x4)", "PetexAuto", "accessoires_auto", "auto", 29.90, 45, ["Universel"], "Sur-mesure, faciles à nettoyer."),
    ("Chargeur USB double 36W", "Anker", "accessoires_auto", "auto", 17.50, 75, ["Universel"], "Charge rapide allume-cigare."),
    # ── MOTO ──
    ("Casque intégral fibre", "Shoei", "casques", "moto", 299.00, 12, ["Universel"], "Casque homologué ECE 22.06."),
    ("Casque modulable", "Shark", "casques", "moto", 179.00, 16, ["Universel"], "Confort touring, écran solaire."),
    ("Gants cuir racing", "Alpinestars", "casques", "moto", 89.00, 30, ["Universel"], "Protection renforcée aux phalanges."),
    ("Blouson textile imperméable", "Dainese", "casques", "moto", 199.00, 14, ["Universel"], "Coque dorsale incluse."),
    ("Plaquettes frein moto", "Brembo", "pieces_moto", "moto", 32.00, 40, ["Yamaha", "Honda", "Kawasaki"], "Frittées haute température."),
    ("Kit chaîne + pignons", "DID", "pieces_moto", "moto", 119.00, 10, ["Yamaha", "Honda"], "Chaîne renforcée joints toriques."),
    ("Pneu moto sport 180/55 ZR17", "Michelin", "pieces_moto", "moto", 139.00, 22, ["Universel"], "Adhérence sportive route."),
    ("Antivol U haute sécurité", "Kryptonite", "accessoires_moto", "moto", 64.00, 35, ["Universel"], "Niveau de sécurité SRA."),
    ("Top-case 45L", "GIVI", "accessoires_moto", "moto", 149.00, 18, ["Universel"], "Étanche, 2 casques intégraux."),
    ("Support téléphone guidon", "Quad Lock", "accessoires_moto", "moto", 54.90, 50, ["Universel"], "Verrouillage anti-vibration."),
]


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _ensure_seed():
    if await db.auto_parts_products.count_documents({}) > 0:
        return
    docs = []
    for i, (name, brand, cat, typ, price, stock, compat, desc) in enumerate(_SEED):
        docs.append({
            "id": f"part_{i+1:03d}", "name": name, "brand": brand, "category": cat,
            "type": typ, "price": float(price), "stock": int(stock), "image": "",
            "compat": compat, "description": desc, "rating": round(4.3 + (i % 6) * 0.1, 1),
            "active": True, "created_at": _now(),
        })
    if docs:
        await db.auto_parts_products.insert_many(docs)


def _pub(p: dict) -> dict:
    p = dict(p)
    p.pop("_id", None)
    return p


# ── Public catalog ──────────────────────────────────────────────────────────
@router.get("/categories")
async def list_categories():
    return {"categories": CATEGORIES, "delivery_fee": DELIVERY_FEE}


@router.get("/brands")
async def list_brands():
    await _ensure_seed()
    brands = await db.auto_parts_products.distinct("compat", {"active": True})
    flat = sorted({b for b in brands if b and b != "Universel"})
    return {"brands": flat}


@router.get("/products")
async def list_products(type: str = None, category: str = None, brand: str = None, q: str = None):
    await _ensure_seed()
    query = {"active": True}
    if type:
        query["type"] = type
    if category:
        query["category"] = category
    if brand:
        query["compat"] = {"$in": [brand, "Universel"]}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}},
                        {"brand": {"$regex": q, "$options": "i"}}]
    products = await db.auto_parts_products.find(query).sort("created_at", 1).to_list(300)
    return [_pub(p) for p in products]


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    p = await db.auto_parts_products.find_one({"id": product_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return p


# ── Orders ──────────────────────────────────────────────────────────────────
@router.post("/orders")
async def create_order(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    items_in = body.get("items") or []
    if not items_in:
        raise HTTPException(status_code=400, detail="Votre panier est vide")
    fulfillment = body.get("fulfillment", "delivery")
    if fulfillment == "delivery" and not (body.get("address") or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez une adresse de livraison")

    line_items, subtotal = [], 0.0
    for it in items_in:
        prod = await db.auto_parts_products.find_one({"id": it.get("product_id"), "active": True}, {"_id": 0})
        if not prod:
            raise HTTPException(status_code=400, detail="Produit indisponible")
        qty = max(1, int(it.get("qty", 1)))
        if prod["stock"] < qty:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {prod['name']}")
        line_items.append({"product_id": prod["id"], "name": prod["name"], "brand": prod["brand"],
                           "price": prod["price"], "qty": qty, "image": prod.get("image", "")})
        subtotal += prod["price"] * qty

    delivery_fee = DELIVERY_FEE if fulfillment == "delivery" else 0.0
    total = round(subtotal + delivery_fee, 2)
    payment_method = body.get("payment_method", "sbpay")

    new_balance, payment_status = None, "on_delivery"
    if payment_method == "sbpay" and total > 0:
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}}, {"$inc": {"balance": -total}})
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Auto Pièces · {len(line_items)} article(s)",
            "status": "completed", "created_at": _now()})
        payment_status = "paid"
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "auto_parts", ref_id=None)
        except Exception:
            pass

    # Decrement stock.
    for li in line_items:
        await db.auto_parts_products.update_one({"id": li["product_id"]}, {"$inc": {"stock": -li["qty"]}})

    order = {
        "id": f"apo_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "user_name": user.get("name", ""),
        "items": line_items, "subtotal": round(subtotal, 2), "delivery_fee": delivery_fee,
        "total": total, "fulfillment": fulfillment, "address": body.get("address", ""),
        "payment_method": payment_method, "payment_status": payment_status,
        "status": "confirmed", "notes": body.get("notes", ""), "created_at": _now(),
    }
    await db.auto_parts_orders.insert_one(dict(order))
    return {**_pub(order), "balance": new_balance}


@router.get("/orders")
async def list_orders(request: Request):
    user = await get_current_user(request)
    orders = await db.auto_parts_orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders


@router.get("/orders/{order_id}")
async def get_order(order_id: str, request: Request):
    user = await get_current_user(request)
    o = await db.auto_parts_orders.find_one({"id": order_id, "user_id": user["id"]}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return o


# ── Admin back-office ───────────────────────────────────────────────────────
@admin_router.get("/products")
async def admin_products(request: Request):
    await require_role(request, ["admin"])
    await _ensure_seed()
    products = await db.auto_parts_products.find({}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"products": products, "categories": CATEGORIES}


@admin_router.post("/products")
async def admin_create_product(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    if not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    if body.get("category") not in _CAT_IDS:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    cat = next(c for c in CATEGORIES if c["id"] == body["category"])
    prod = {
        "id": f"part_{uuid.uuid4().hex[:8]}", "name": body["name"].strip(),
        "brand": body.get("brand", ""), "category": body["category"], "type": cat["type"],
        "price": round(float(body.get("price", 0) or 0), 2), "stock": int(body.get("stock", 0) or 0),
        "image": body.get("image", ""), "compat": body.get("compat", ["Universel"]),
        "description": body.get("description", ""), "rating": 5.0, "active": True, "created_at": _now(),
    }
    await db.auto_parts_products.insert_one(dict(prod))
    return _pub(prod)


@admin_router.put("/products/{product_id}")
async def admin_update_product(product_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    fields = {}
    for k in ("name", "brand", "price", "stock", "image", "compat", "description", "active"):
        if k in body:
            fields[k] = body[k]
    if "category" in body and body["category"] in _CAT_IDS:
        fields["category"] = body["category"]
        fields["type"] = next(c for c in CATEGORIES if c["id"] == body["category"])["type"]
    if "price" in fields:
        fields["price"] = round(float(fields["price"] or 0), 2)
    if "stock" in fields:
        fields["stock"] = int(fields["stock"] or 0)
    res = await db.auto_parts_products.update_one({"id": product_id}, {"$set": fields})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    p = await db.auto_parts_products.find_one({"id": product_id}, {"_id": 0})
    return p


@admin_router.delete("/products/{product_id}")
async def admin_delete_product(product_id: str, request: Request):
    await require_role(request, ["admin"])
    res = await db.auto_parts_products.update_one({"id": product_id}, {"$set": {"active": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    return {"ok": True}


@admin_router.get("/orders")
async def admin_orders(request: Request):
    await require_role(request, ["admin"])
    orders = await db.auto_parts_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    revenue = round(sum(float(o.get("total", 0) or 0) for o in orders
                        if o.get("status") != "cancelled" and o.get("payment_status") == "paid"), 2)
    return {"orders": orders, "revenue": revenue, "statuses": ORDER_STATUSES}


@admin_router.post("/orders/{order_id}/status")
async def admin_update_status(order_id: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    status = body.get("status")
    if status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    order = await db.auto_parts_orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")

    # Cancel → refund wallet (if paid) + restock.
    if status == "cancelled" and order.get("status") != "cancelled":
        if order.get("payment_method") == "sbpay" and order.get("payment_status") == "paid":
            total = round(float(order.get("total", 0) or 0), 2)
            await db.wallets.update_one({"user_id": order["user_id"]}, {"$inc": {"balance": total}}, upsert=True)
            wallet = await db.wallets.find_one({"user_id": order["user_id"]}, {"_id": 0})
            await db.wallet_transactions.insert_one({
                "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": order["user_id"], "type": "Refund",
                "amount": total, "balance_after": round((wallet or {}).get("balance", 0), 2),
                "description": "Remboursement · SB Auto Pièces", "status": "completed", "created_at": _now()})
        for li in order.get("items", []):
            await db.auto_parts_products.update_one({"id": li["product_id"]}, {"$inc": {"stock": li["qty"]}})

    await db.auto_parts_orders.update_one({"id": order_id}, {"$set": {"status": status, "updated_at": _now()}})
    labels = {"preparing": "📦 Commande en préparation", "shipped": "🚚 Commande expédiée",
              "ready": "✅ Commande prête au retrait", "delivered": "🎉 Commande livrée",
              "cancelled": "❌ Commande annulée"}
    if status in labels:
        try:
            await create_notification(order["user_id"], "auto_parts_order", labels[status],
                                      f"Commande {order_id[-6:]}", {"order_id": order_id, "url": "/auto-parts"})
        except Exception:
            pass
    return {"ok": True, "status": status}
