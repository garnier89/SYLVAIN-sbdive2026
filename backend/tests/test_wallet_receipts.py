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
