"""Merchant Business Intelligence (P2.3 — IA Business commerçants).

Real analytics (revenue, orders, AOV, time-series, trend vs previous period,
top products) computed from the merchant's real orders/products, plus an
AI insights layer (Gemini 3 Flash via the Emergent LLM key) that is GROUNDED
on those real numbers — sales forecast, popular products, promo ideas and
stock alerts. Nothing is invented: the model only reasons over the data we feed.
"""
import os
import re
import json
import logging
from datetime import datetime, timezone, timedelta

from core.config import db

logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
MODEL_PROVIDER, MODEL_NAME = "gemini", "gemini-3-flash-preview"

PERIOD_DAYS = {"week": 7, "month": 30, "year": 365}
_DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
_MONTH_FR = ["", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]


def _parse_dt(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _build_series(delivered: list, period: str, now: datetime) -> list:
    """Time-series buckets of delivered revenue: week→7 days, month→30 days, year→12 months."""
    series = []
    if period == "year":
        # last 12 months
        cursor = now.replace(day=1)
        months = []
        for _ in range(12):
            months.append((cursor.year, cursor.month))
            cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
        months = list(reversed(months))
        totals = {(y, m): 0.0 for y, m in months}
        for o in delivered:
            d = _parse_dt(o.get("created_at"))
            if d and (d.year, d.month) in totals:
                totals[(d.year, d.month)] += float(o.get("total") or 0)
        series = [{"label": _MONTH_FR[m], "value": round(totals[(y, m)], 2)} for y, m in months]
    else:
        days = PERIOD_DAYS[period]
        start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        buckets = {}
        for i in range(days):
            d = start + timedelta(days=i)
            buckets[d.date()] = 0.0
        for o in delivered:
            dt = _parse_dt(o.get("created_at"))
            if dt and dt.date() in buckets:
                buckets[dt.date()] += float(o.get("total") or 0)
        for d in sorted(buckets):
            label = _DOW_FR[d.weekday()] if period == "week" else f"{d.day:02d}/{d.month:02d}"
            series.append({"label": label, "value": round(buckets[d], 2)})
    return series


async def compute_analytics(mid: str, period: str) -> dict:
    period = period if period in PERIOD_DAYS else "week"
    now = datetime.now(timezone.utc)
    days = PERIOD_DAYS[period]
    cur_start = now - timedelta(days=days)
    prev_start = now - timedelta(days=days * 2)

    orders = await db.orders.find({"merchant_id": mid}, {"_id": 0}).to_list(5000)

    def delivered_in(start, end):
        out = []
        for o in orders:
            if o.get("status") != "delivered":
                continue
            d = _parse_dt(o.get("created_at"))
            if d and start <= d < end:
                out.append(o)
        return out

    cur = delivered_in(cur_start, now)
    prev = delivered_in(prev_start, cur_start)

    cur_rev = round(sum(float(o.get("total") or 0) for o in cur), 2)
    prev_rev = round(sum(float(o.get("total") or 0) for o in prev), 2)
    rev_trend = round((cur_rev - prev_rev) / prev_rev * 100, 1) if prev_rev > 0 else (100.0 if cur_rev > 0 else 0.0)
    orders_trend = round((len(cur) - len(prev)) / len(prev) * 100, 1) if prev else (100.0 if cur else 0.0)
    aov = round(cur_rev / len(cur), 2) if cur else 0.0

    # Top products (qty) within the period.
    counts, revenue_by_product = {}, {}
    for o in cur:
        for it in (o.get("items") or []):
            name = it.get("name") or it.get("product_name") or "—"
            qty = int(it.get("quantity") or 1)
            counts[name] = counts.get(name, 0) + qty
            revenue_by_product[name] = revenue_by_product.get(name, 0) + float(it.get("total") or (it.get("price", 0) * qty))
    top = sorted(counts.items(), key=lambda x: -x[1])[:5]
    top_products = [{"name": n, "qty": q, "revenue": round(revenue_by_product.get(n, 0), 2)} for n, q in top]

    # Orders per day-of-week (busiest days insight).
    dow = {i: 0 for i in range(7)}
    for o in cur:
        d = _parse_dt(o.get("created_at"))
        if d:
            dow[d.weekday()] += 1
    busiest = max(dow, key=dow.get) if cur else None

    series = _build_series(cur, period, now)

    products_total = await db.products.count_documents({"merchant_id": mid})
    low_stock = await db.products.find(
        {"merchant_id": mid, "stock": {"$ne": None, "$lte": 5, "$gte": 0}},
        {"_id": 0, "name": 1, "stock": 1},
    ).to_list(50)
    out_of_stock = [p for p in low_stock if (p.get("stock") or 0) <= 0]

    return {
        "period": period,
        "revenue": cur_rev,
        "revenue_prev": prev_rev,
        "revenue_trend_pct": rev_trend,
        "orders": len(cur),
        "orders_prev": len(prev),
        "orders_trend_pct": orders_trend,
        "avg_order_value": aov,
        "series": series,
        "top_products": top_products,
        "busiest_dow": _DOW_FR[busiest] if busiest is not None else None,
        "products_total": products_total,
        "low_stock": [{"name": p.get("name"), "stock": int(p.get("stock") or 0)} for p in low_stock],
        "out_of_stock_count": len(out_of_stock),
    }


def _parse_json(raw: str) -> dict:
    if not raw:
        return {}
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = re.sub(r"^json\s*", "", raw, flags=re.I)
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    try:
        return json.loads(m.group(0)) if m else {}
    except (json.JSONDecodeError, ValueError):
        return {}


async def ai_insights(merchant: dict, analytics: dict) -> dict:
    """Gemini-grounded business insights. Falls back to a deterministic
    rule-based summary if the LLM is unavailable — never raises."""
    fallback = _rule_based_insights(merchant, analytics)
    if not EMERGENT_LLM_KEY:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys = (
            "Tu es l'analyste business de l'app SB pour un commerçant. À partir UNIQUEMENT des "
            "données chiffrées fournies (ne RIEN inventer), renvoie un objet JSON valide, sans texte "
            "autour, avec ces clés : "
            '{"summary": "<2 phrases en français>", '
            '"forecast": "<prévision de ventes pour la prochaine période, en français>", '
            '"popular": ["<produit phare 1>", "..."], '
            '"promos": ["<reco promo concrète 1>", "..."], '
            '"stock_alerts": ["<alerte stock 1>", "..."]}. '
            "Sois concret, actionnable et bref. Base-toi sur la tendance, le panier moyen, les top produits, "
            "le jour le plus actif et les stocks faibles."
        )
        ctx = {
            "commerce": merchant.get("store_name"),
            "periode": analytics["period"],
            "revenu": analytics["revenue"],
            "revenu_precedent": analytics["revenue_prev"],
            "tendance_revenu_pct": analytics["revenue_trend_pct"],
            "commandes": analytics["orders"],
            "panier_moyen": analytics["avg_order_value"],
            "top_produits": analytics["top_products"],
            "jour_plus_actif": analytics["busiest_dow"],
            "stocks_faibles": analytics["low_stock"],
            "ruptures": analytics["out_of_stock_count"],
        }
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"mbi-{merchant.get('id')}-{analytics['period']}",
                       system_message=sys).with_model(MODEL_PROVIDER, MODEL_NAME)
        raw = await chat.send_message(UserMessage(text=f"Données: {json.dumps(ctx, ensure_ascii=False)}\nDonne tes insights en JSON."))
        data = _parse_json(raw)
        if not data.get("summary"):
            return fallback
        return {
            "summary": str(data.get("summary", ""))[:400],
            "forecast": str(data.get("forecast", fallback["forecast"]))[:300],
            "popular": [str(x)[:80] for x in (data.get("popular") or [])][:5] or fallback["popular"],
            "promos": [str(x)[:120] for x in (data.get("promos") or [])][:5] or fallback["promos"],
            "stock_alerts": [str(x)[:120] for x in (data.get("stock_alerts") or [])][:5] or fallback["stock_alerts"],
            "source": "ai",
        }
    except Exception:
        logger.warning("merchant ai_insights failed, using fallback", exc_info=True)
        return fallback


def _rule_based_insights(merchant: dict, a: dict) -> dict:
    trend = a["revenue_trend_pct"]
    if trend > 5:
        summary = f"Vos ventes progressent de {trend:.0f}% sur la période. Bon élan à entretenir."
    elif trend < -5:
        summary = f"Vos ventes reculent de {abs(trend):.0f}%. Une promo ciblée peut relancer la demande."
    else:
        summary = "Vos ventes sont stables. C'est le bon moment pour tester une offre."
    forecast = (f"À ce rythme, prévoyez ~{round(a['revenue'] * (1 + trend / 100), 0):.0f} € la prochaine période."
                if a["revenue"] else "Pas assez de données pour une prévision fiable.")
    popular = [p["name"] for p in a["top_products"][:3]] or ["Aucune vente sur la période"]
    promos = []
    if a["busiest_dow"]:
        promos.append(f"Lancez une offre le {a['busiest_dow']} (votre jour le plus actif).")
    if a["top_products"]:
        promos.append(f"Mettez « {a['top_products'][0]['name']} » en avant (best-seller).")
    if a["avg_order_value"]:
        promos.append(f"Proposez un menu/lot pour pousser le panier au-dessus de {a['avg_order_value']:.0f} €.")
    stock_alerts = [f"Rupture : {p['name']}" for p in a["low_stock"] if p["stock"] <= 0][:3]
    stock_alerts += [f"Stock faible : {p['name']} ({p['stock']})" for p in a["low_stock"] if p["stock"] > 0][:3]
    if not stock_alerts:
        stock_alerts = ["Aucune alerte de stock."]
    return {
        "summary": summary, "forecast": forecast, "popular": popular,
        "promos": promos or ["Ajoutez des produits pour générer des recommandations."],
        "stock_alerts": stock_alerts, "source": "rules",
    }
