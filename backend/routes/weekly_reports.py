"""Weekly automated reports — per-driver/courier/provider earnings + global business report.
Admin-configurable (recipients, timezone, commission, non-withdrawable floor, schedule).
Sent via Resend. Week = Monday 00:00 -> Sunday 23:59:59 in the configured local timezone.
"""
import os
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import resend
from fastapi import APIRouter, Request, HTTPException
from dotenv import load_dotenv

from core.config import db
from core.deps import require_role

load_dotenv()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/weekly-reports", tags=["weekly-reports"])

CONFIG_ID = "default"

DEFAULT_CONFIG = {
    "id": CONFIG_ID,
    "enabled": False,
    "provider": "resend",
    "resend_api_key": "",
    "sender_email": "onboarding@resend.dev",
    "sender_name": "SB Drive VTC",
    "admin_emails": ["admin@superapp.com"],
    "accountant_emails": [],
    "timezone": "America/Martinique",
    "send_day": 0,            # 0 = Monday
    "send_hour": 8,           # local hour
    "commission_rate": 15.0,  # percent platform takes
    "non_withdrawable_amount": 20.0,  # floor kept on the app, not transferable
    "send_to_drivers": True,
    "send_to_providers": True,
    "send_to_couriers": True,
    "last_sent_week": None,
}

# Earning sources: (collection, gross_field, completed_statuses, service_label)
SOURCES = [
    ("rides", "final_fare", {"completed"}, "Taxi / VTC"),
    ("parcels", "fare", {"delivered", "completed", "done"}, "Colis"),
    ("runner_orders", "estimated_fare", {"completed", "delivered", "done"}, "Runner / Genie"),
    ("orders", "delivery_fee", {"delivered", "completed", "done"}, "Boutiques"),
]


def _cash(pm):
    return pm in ("cash", "cash_to_driver")


def _card(pm):
    return pm == "card"


def _wallet(pm):
    return pm in ("wallet", "sbpaygo")


async def get_config():
    doc = await db.report_config.find_one({"id": CONFIG_ID}, {"_id": 0})
    if not doc:
        await db.report_config.insert_one({**DEFAULT_CONFIG})
        return {**DEFAULT_CONFIG}
    return {**DEFAULT_CONFIG, **doc}


def previous_week_bounds(tz_name: str, ref: datetime = None):
    """Return (start_utc_iso, end_utc_iso, label) for the previous full week in tz_name."""
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = (ref or datetime.now(timezone.utc)).astimezone(tz)
    # Monday of current local week
    this_monday = (now_local - timedelta(days=now_local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    start_local = this_monday - timedelta(days=7)
    end_local = this_monday - timedelta(microseconds=1)  # Sunday 23:59:59.999999
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)
    label = f"{start_local.strftime('%d/%m/%Y')} - {end_local.strftime('%d/%m/%Y')}"
    return start_utc.isoformat(), end_utc.isoformat(), label


async def _driver_email_map(driver_ids):
    """Map driver_id -> {email, name} via drivers->users."""
    out = {}
    drivers = await db.drivers.find({"id": {"$in": list(driver_ids)}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(None)
    user_ids = [d["user_id"] for d in drivers if d.get("user_id")]
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(None)
    umap = {u["id"]: u for u in users}
    for d in drivers:
        u = umap.get(d.get("user_id"), {})
        out[d["id"]] = {"email": u.get("email"), "name": u.get("name", "Chauffeur")}
    return out


async def compute_report(start_iso: str, end_iso: str, config: dict):
    """Compute global + per-driver weekly figures."""
    commission_rate = float(config.get("commission_rate", 15.0)) / 100.0
    floor = float(config.get("non_withdrawable_amount", 0.0))

    drivers = {}   # driver_id -> aggregates
    global_services = {}  # label -> {revenue, count}

    def _blank_driver():
        return {
            "completed": 0, "cancelled": 0, "refused": 0,
            "gross": 0.0, "cash": 0.0, "card": 0.0, "wallet": 0.0,
            "bonus": 0.0,
        }

    date_q = {"created_at": {"$gte": start_iso, "$lte": end_iso}}

    for col, fare_field, completed_set, label in SOURCES:
        svc = global_services.setdefault(label, {"revenue": 0.0, "count": 0})
        async for doc in db[col].find(date_q, {"_id": 0}):
            did = doc.get("driver_id")
            status = doc.get("status")
            fare = doc.get(fare_field) or 0
            pm = doc.get("payment_method")
            is_completed = status in completed_set
            # global
            if is_completed:
                svc["revenue"] += fare
                svc["count"] += 1
            # per-driver
            if not did:
                continue
            d = drivers.setdefault(did, _blank_driver())
            if is_completed:
                d["completed"] += 1
                d["gross"] += fare
                if _cash(pm):
                    d["cash"] += fare
                elif _card(pm):
                    d["card"] += fare
                elif _wallet(pm):
                    d["wallet"] += fare
            elif status == "cancelled":
                d["cancelled"] += 1

    # finalize per-driver computed fields
    email_map = await _driver_email_map(drivers.keys())
    driver_rows = []
    for did, d in drivers.items():
        gross = round(d["gross"], 2)
        commission = round(gross * commission_rate, 2)
        bonus = round(d["bonus"], 2)
        net = round(gross - commission + bonus, 2)
        cash_collected = round(d["cash"], 2)
        # cash already in driver's hands -> they owe commission on it; app-side payable excludes cash
        amount_on_app = round(net - cash_collected, 2)
        transfer = round(max(0.0, amount_on_app - floor), 2)
        info = email_map.get(did, {})
        driver_rows.append({
            "driver_id": did,
            "name": info.get("name", "Chauffeur"),
            "email": info.get("email"),
            "completed": d["completed"],
            "cancelled": d["cancelled"],
            "refused": d["refused"],
            "gross": gross,
            "cash": cash_collected,
            "card": round(d["card"], 2),
            "wallet": round(d["wallet"], 2),
            "bonus": bonus,
            "commission": commission,
            "net": net,
            "amount_on_app": amount_on_app,
            "non_withdrawable": floor,
            "transfer": transfer,
        })

    driver_rows.sort(key=lambda x: x["gross"], reverse=True)

    revenue_by_service = [
        {"service": k, "revenue": round(v["revenue"], 2), "count": v["count"]}
        for k, v in global_services.items()
    ]
    total_revenue = round(sum(v["revenue"] for v in global_services.values()), 2)
    total_commission = round(sum(r["commission"] for r in driver_rows), 2)

    return {
        "revenue_by_service": revenue_by_service,
        "total_revenue": total_revenue,
        "total_commission": total_commission,
        "total_transfers": round(sum(r["transfer"] for r in driver_rows), 2),
        "active_drivers": len(driver_rows),
        "drivers": driver_rows,
    }


# ---------------- Email rendering ----------------
def _money(n):
    return f"{float(n or 0):,.2f} €".replace(",", " ")


def _driver_email_html(row, week_label, sender_name):
    return f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <div style="background:#3b82f6;color:#fff;padding:20px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Rapport hebdomadaire — {sender_name}</h2>
    <p style="margin:4px 0 0;opacity:.9">Semaine du {week_label}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <p>Bonjour {row['name']},</p>
    <p>Voici le détail de votre activité de la semaine précédente.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Courses terminées</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right"><b>{row['completed']}</b></td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Courses annulées</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{row['cancelled']}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Courses refusées</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{row['refused']}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Chiffre d'affaires brut</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right"><b>{_money(row['gross'])}</b></td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">— dont espèces</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['cash'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">— dont carte (CB)</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['card'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">— dont portefeuille</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['wallet'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Bonus</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['bonus'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Commission plateforme</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#dc2626">- {_money(row['commission'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0"><b>Revenu net</b></td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right"><b>{_money(row['net'])}</b></td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Montant disponible sur l'app</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['amount_on_app'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Montant non retirable</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(row['non_withdrawable'])}</td></tr>
      <tr style="background:#ecfdf5"><td style="padding:12px 8px"><b>Virement à effectuer</b></td><td style="padding:12px 8px;text-align:right;color:#059669;font-size:16px"><b>{_money(row['transfer'])}</b></td></tr>
    </table>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px">Espèces déjà encaissées par vos soins : {_money(row['cash'])}. Le virement correspond au montant net disponible sur l'application, déduction faite du montant non retirable.</p>
  </div>
</div>
"""


def _global_email_html(report, week_label, sender_name):
    svc_rows = "".join(
        f"<tr><td style='padding:8px;border-bottom:1px solid #f0f0f0'>{s['service']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>{s['count']}</td>"
        f"<td style='padding:8px;border-bottom:1px solid #f0f0f0;text-align:right'>{_money(s['revenue'])}</td></tr>"
        for s in report["revenue_by_service"]
    )
    return f"""
<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">
  <div style="background:#111827;color:#fff;padding:20px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Rapport global — {sender_name}</h2>
    <p style="margin:4px 0 0;opacity:.85">Semaine du {week_label}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
      <tr><th style="text-align:left;padding:8px;background:#f9fafb">Service</th><th style="text-align:right;padding:8px;background:#f9fafb">Commandes</th><th style="text-align:right;padding:8px;background:#f9fafb">Revenu</th></tr>
      {svc_rows}
      <tr style="background:#eff6ff"><td style="padding:10px 8px"><b>Total</b></td><td style="padding:10px 8px;text-align:right"><b></b></td><td style="padding:10px 8px;text-align:right"><b>{_money(report['total_revenue'])}</b></td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Chauffeurs/prestataires actifs</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{report['active_drivers']}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Commissions encaissées</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right;color:#059669">{_money(report['total_commission'])}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #f0f0f0">Virements à effectuer (total)</td><td style="padding:8px;border-bottom:1px solid #f0f0f0;text-align:right">{_money(report['total_transfers'])}</td></tr>
    </table>
  </div>
</div>
"""


async def _send(api_key, sender, to_list, subject, html):
    if not api_key:
        raise HTTPException(status_code=400, detail="Clé API Resend manquante. Configurez-la dans Rapports hebdomadaires.")
    resend.api_key = api_key
    params = {"from": sender, "to": to_list, "subject": subject, "html": html}
    return await asyncio.to_thread(resend.Emails.send, params)


async def run_weekly_send(config: dict, test_email: str = None):
    """Compute previous week and send all emails. Returns summary."""
    start_iso, end_iso, week_label = previous_week_bounds(config.get("timezone", "UTC"))
    report = await compute_report(start_iso, end_iso, config)
    api_key = config.get("resend_api_key") or os.environ.get("RESEND_API_KEY")
    sender = f"{config.get('sender_name','SB Drive VTC')} <{config.get('sender_email')}>"

    sent, failed = 0, 0
    errors = []

    # Global report -> admin + accountant (or test address)
    global_to = ([test_email] if test_email else
                 list(config.get("admin_emails", [])) + list(config.get("accountant_emails", [])))
    global_to = [e for e in global_to if e]
    if global_to:
        try:
            await _send(api_key, sender, global_to,
                        f"Rapport global — semaine du {week_label}",
                        _global_email_html(report, week_label, config.get("sender_name", "SB Drive VTC")))
            sent += 1
        except Exception as e:
            failed += 1
            errors.append(f"global: {e}")

    # Per-driver reports
    if config.get("send_to_drivers", True):
        for row in report["drivers"]:
            to = test_email or row.get("email")
            if not to:
                continue
            try:
                await _send(api_key, sender, [to],
                            f"Votre rapport hebdo — semaine du {week_label}",
                            _driver_email_html(row, week_label, config.get("sender_name", "SB Drive VTC")))
                sent += 1
            except Exception as e:
                failed += 1
                errors.append(f"{row['driver_id']}: {e}")
            if test_email:
                break  # in test mode only send one driver sample

    return {"week": week_label, "sent": sent, "failed": failed,
            "active_drivers": report["active_drivers"], "errors": errors[:10]}


# ---------------- Endpoints ----------------
@router.get("/config")
async def get_report_config(request: Request):
    await require_role(request, ["admin"])
    cfg = await get_config()
    masked = {**cfg}
    if masked.get("resend_api_key"):
        masked["resend_api_key_set"] = True
        masked["resend_api_key"] = masked["resend_api_key"][:6] + "•••"
    else:
        masked["resend_api_key_set"] = False
        masked["resend_api_key"] = ""
    return masked


@router.put("/config")
async def update_report_config(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    allowed = {k for k in DEFAULT_CONFIG if k != "id"}
    update = {k: v for k, v in body.items() if k in allowed}
    # don't overwrite stored key with a masked value
    if "resend_api_key" in update and ("•" in str(update["resend_api_key"]) or update["resend_api_key"] == ""):
        update.pop("resend_api_key")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.report_config.update_one({"id": CONFIG_ID}, {"$set": update}, upsert=True)
    return {"ok": True}


@router.get("/preview")
async def preview_report(request: Request):
    await require_role(request, ["admin"])
    cfg = await get_config()
    start_iso, end_iso, week_label = previous_week_bounds(cfg.get("timezone", "UTC"))
    report = await compute_report(start_iso, end_iso, cfg)
    return {"week": week_label, "start": start_iso, "end": end_iso, **report}


@router.post("/send-now")
async def send_now(request: Request):
    await require_role(request, ["admin"])
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    cfg = await get_config()
    result = await run_weekly_send(cfg, test_email=body.get("test_email"))
    return result


# ---------------- Scheduler ----------------
async def weekly_report_loop():
    """Background loop: every 30 min, send if it's the configured day/hour and not already sent this week."""
    await asyncio.sleep(30)
    while True:
        try:
            cfg = await get_config()
            if cfg.get("enabled"):
                tz = cfg.get("timezone", "UTC")
                try:
                    now_local = datetime.now(ZoneInfo(tz))
                except Exception:
                    now_local = datetime.now(timezone.utc)
                # current week's Monday date (local) as marker
                this_monday = (now_local - timedelta(days=now_local.weekday())).strftime("%Y-%m-%d")
                if (now_local.weekday() == int(cfg.get("send_day", 0))
                        and now_local.hour == int(cfg.get("send_hour", 8))
                        and cfg.get("last_sent_week") != this_monday):
                    logger.info("Weekly report: triggering send for week marker %s", this_monday)
                    await run_weekly_send(cfg)
                    await db.report_config.update_one({"id": CONFIG_ID}, {"$set": {"last_sent_week": this_monday}})
        except Exception as e:
            logger.error("weekly_report_loop error: %s", e)
        await asyncio.sleep(1800)
