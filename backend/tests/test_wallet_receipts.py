"""Wallet/billing — atomic sequential reference numbers (core/billing.next_number)."""
import os
import asyncio
import uuid
from datetime import datetime, timezone
from pymongo import MongoClient

from core.billing import next_number

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_next_number_format_and_increment():
    prefix = f"TST{uuid.uuid4().hex[:4].upper()}"
    year = datetime.now(timezone.utc).year
    a = _run(next_number(prefix))
    b = _run(next_number(prefix))
    assert a == f"{prefix}-{year}-000001"
    assert b == f"{prefix}-{year}-000002"
    # cleanup
    MongoClient(MONGO_URL)[DB_NAME].counters.delete_one({"id": f"{prefix}_{year}"})


def test_next_number_no_year():
    prefix = f"NOYR{uuid.uuid4().hex[:4].upper()}"
    a = _run(next_number(prefix, with_year=False))
    assert a == f"{prefix}-000001"
    MongoClient(MONGO_URL)[DB_NAME].counters.delete_one({"id": prefix})


def test_wallet_receipt_email_no_crash_without_key(monkeypatch):
    # send_wallet_receipt must never raise even with an unknown kind / no key.
    import core.email as email
    _run(email.send_wallet_receipt("x@y.com", "Test", kind="unknown_kind", amount=10,
                                   balance_after=10, ref="R", wallet_url="http://x"))


def test_ride_invoice_email_renders_without_crash():
    # send_ride_invoice builds the HTML invoice and must never raise.
    import core.email as email
    breakdown = {"vehicle_label": "Berline", "base_fare": 3.0, "distance_km": 8.4,
                 "distance_charge": 10.5, "time_seconds": 1140, "time_charge": 4.2,
                 "extra_total": 2.0, "loyalty_discount": 1.5}
    _run(email.send_ride_invoice(
        "rider@y.com", "Alice", invoice_no="SB-C-2026-000001",
        pickup="12 rue A", dropoff="30 av B", distance_km=8.4, breakdown=breakdown,
        total=18.2, driver_name="Jean", vehicle_label="Berline", ride_url="http://x/ride/1",
    ))


def test_fmt_duration():
    from core.email import _fmt_duration
    assert _fmt_duration(1140) == "19 min"
    assert _fmt_duration(3720) == "1 h 02"
    assert _fmt_duration(None) == "0 min"
