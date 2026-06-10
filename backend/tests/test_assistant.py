"""
SB Assistant — grounding logic (deterministic parts, no LLM cost).

The LLM only extracts intent + writes the reply; the actual products/merchants
shown come from these DB-backed search functions. We test that they return real,
correctly-filtered catalog data and that keyword cleaning removes stopwords.
"""
import os
import uuid

from conftest import run_async


def test_clean_keywords_strips_stopwords():
    from routes.assistant import _clean_keywords
    assert _clean_keywords("un restaurant ouvert") == ""        # all stopwords
    assert _clean_keywords("restaurant japonais") == "japonais"  # keeps cuisine
    assert _clean_keywords("une baguette pas chère") == "baguette"
    assert _clean_keywords("") == ""


def test_is_open_safe_defaults():
    from routes.assistant import _is_open
    assert _is_open("00:00-23:59") is True   # effectively always open
    assert _is_open("") is True              # unknown hours → not claimed closed
    assert _is_open(None) is True
    assert _is_open("garbage") is True       # malformed → not claimed closed


def test_search_products_is_grounded_on_real_catalog():
    async def scenario():
        from core.config import db
        from routes.assistant import search_products
        sfx = uuid.uuid4().hex[:8]
        mid = f"am_{sfx}"
        await db.merchants.insert_one({"id": mid, "user_id": f"u_{mid}", "store_name": "Cave Test", "store_type": "wine",
                                       "is_active": True, "opening_hours": "00:00-23:59", "eta_min": 20})
        await db.products.insert_one({"id": f"ap_{sfx}", "merchant_id": mid, "name": f"Bordeaux Test {sfx}",
                                      "price": 12.5, "category": "Vin", "is_available": True})
        await db.products.insert_one({"id": f"ap2_{sfx}", "merchant_id": mid, "name": f"Bordeaux Cher {sfx}",
                                      "price": 99.0, "category": "Vin", "is_available": True})
        try:
            res = await search_products({"intent": "search_products", "keywords": f"Bordeaux Test {sfx}"})
            assert any(p["name"] == f"Bordeaux Test {sfx}" and p["merchant_name"] == "Cave Test" for p in res)
            # max_price filter excludes the expensive one.
            cheap = await search_products({"keywords": "Bordeaux", "max_price": 20, "sort": "cheapest"})
            names = [p["name"] for p in cheap]
            assert f"Bordeaux Test {sfx}" in names and f"Bordeaux Cher {sfx}" not in names
        finally:
            await db.merchants.delete_many({"id": mid})
            await db.products.delete_many({"merchant_id": mid})
    run_async(scenario())


def test_search_merchants_filters_type_and_open():
    async def scenario():
        from core.config import db
        from routes.assistant import search_merchants
        sfx = uuid.uuid4().hex[:8]
        open_id, closed_id = f"mo_{sfx}", f"mc_{sfx}"
        await db.merchants.insert_one({"id": open_id, "user_id": f"u_{open_id}", "store_name": f"Resto Ouvert {sfx}", "store_type": "restaurant",
                                       "is_active": True, "opening_hours": "00:00-23:59", "rating": 4.9})
        await db.merchants.insert_one({"id": closed_id, "user_id": f"u_{closed_id}", "store_name": f"Resto Fermé {sfx}", "store_type": "restaurant",
                                       "is_active": True, "opening_hours": "03:00-03:01", "rating": 4.0})
        try:
            res = await search_merchants({"intent": "search_merchants", "store_type": "restaurant", "open_now": True})
            ids = [m["id"] for m in res]
            assert open_id in ids and closed_id not in ids
        finally:
            await db.merchants.delete_many({"id": {"$in": [open_id, closed_id]}})
    run_async(scenario())


def test_parse_json_handles_fenced_output():
    from routes.assistant import _parse_json
    assert _parse_json('```json\n{"intent": "chat"}\n```')["intent"] == "chat"
    assert _parse_json('voici: {"intent": "search_products", "keywords": "pizza"}')["keywords"] == "pizza"
    assert _parse_json("pas de json") == {}
