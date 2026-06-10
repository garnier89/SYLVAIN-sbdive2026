"""
P2.3 — IA Business commerçants (merchant business intelligence).

Tests the deterministic analytics engine (compute_analytics) and the
rule-based insight fallback against seeded delivered orders.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from pymongo import MongoClient

from core.merchant_ai import compute_analytics, _rule_based_insights

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture
def shop():
    cli = MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    sfx = uuid.uuid4().hex[:8]
    mid = f"bm_{sfx}"
    db.merchants.insert_one({"id": mid, "user_id": f"bmu_{sfx}", "store_name": "Test BI Shop", "lat": 48.8, "lng": 2.3})
    now = datetime.now(timezone.utc)
    # 3 delivered this week, 1 delivered last week (previous period).
    def order(days_ago, total, items):
        db.orders.insert_one({
            "id": f"bo_{uuid.uuid4().hex[:10]}", "merchant_id": mid, "user_id": "x",
            "status": "delivered", "total": total, "items": items,
            "created_at": (now - timedelta(days=days_ago)).isoformat(),
        })
    order(1, 20.0, [{"name": "Pizza", "quantity": 2, "total": 16.0}, {"name": "Coca", "quantity": 1, "total": 4.0}])
    order(2, 30.0, [{"name": "Pizza", "quantity": 3, "total": 24.0}, {"name": "Coca", "quantity": 1, "total": 6.0}])
    order(3, 10.0, [{"name": "Salade", "quantity": 1, "total": 10.0}])
    order(10, 50.0, [{"name": "Pizza", "quantity": 5, "total": 50.0}])  # previous period
    # A pending order must be ignored by revenue.
    db.orders.insert_one({"id": f"bo_{uuid.uuid4().hex[:10]}", "merchant_id": mid, "user_id": "x",
                          "status": "pending", "total": 999.0, "items": [], "created_at": now.isoformat()})
    # Stock: one out, one low.
    db.products.insert_one({"id": f"bp1_{sfx}", "merchant_id": mid, "name": "Pizza", "price": 8.0, "stock": 0})
    db.products.insert_one({"id": f"bp2_{sfx}", "merchant_id": mid, "name": "Coca", "price": 2.0, "stock": 3})
    db.products.insert_one({"id": f"bp3_{sfx}", "merchant_id": mid, "name": "Salade", "price": 10.0, "stock": 50})

    yield {"db": db, "mid": mid, "merchant": db.merchants.find_one({"id": mid}, {"_id": 0})}

    db.merchants.delete_one({"id": mid})
    db.orders.delete_many({"merchant_id": mid})
    db.products.delete_many({"merchant_id": mid})
    cli.close()


def test_analytics_revenue_and_trend(shop):
    a = _run(compute_analytics(shop["mid"], "week"))
    assert a["period"] == "week"
    assert a["revenue"] == 60.0          # 20+30+10 (pending 999 ignored)
    assert a["orders"] == 3
    assert a["avg_order_value"] == 20.0
    assert a["revenue_prev"] == 50.0     # the 10-day-old delivered order
    assert len(a["series"]) == 7         # 7 daily buckets


def test_analytics_top_products(shop):
    a = _run(compute_analytics(shop["mid"], "week"))
    names = [p["name"] for p in a["top_products"]]
    assert names[0] == "Pizza"           # 5 sold this week → top
    pizza = next(p for p in a["top_products"] if p["name"] == "Pizza")
    assert pizza["qty"] == 5
    assert pizza["revenue"] == 40.0      # 16 + 24


def test_analytics_stock_alerts(shop):
    a = _run(compute_analytics(shop["mid"], "week"))
    assert a["out_of_stock_count"] == 1  # Pizza stock 0
    low_names = {p["name"] for p in a["low_stock"]}
    assert "Pizza" in low_names and "Coca" in low_names
    assert "Salade" not in low_names     # stock 50 not low


def test_rule_based_insights(shop):
    a = _run(compute_analytics(shop["mid"], "week"))
    ins = _rule_based_insights(shop["merchant"], a)
    assert ins["source"] == "rules"
    assert "Pizza" in ins["popular"]
    assert any("Pizza" in s for s in ins["stock_alerts"])  # rupture alert


def test_year_period_has_12_months(shop):
    a = _run(compute_analytics(shop["mid"], "year"))
    assert len(a["series"]) == 12
