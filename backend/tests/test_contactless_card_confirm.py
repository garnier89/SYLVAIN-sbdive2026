"""
Phase D / Pourboire — chemin CARTE : confirmation Stripe → crédit bénéficiaire.

Le paiement Stripe réel ne peut pas être complété en automatisation, mais la
logique exécutée APRÈS que Stripe répond "paid" (gate atomique anti-double
crédit, prélèvement de commission, crédit du net au bénéficiaire, cashback au
payeur) peut être validée directement. C'est la seule partie du chemin carte
qui n'était pas couverte par les autres tests.
"""
import os
import uuid
import asyncio

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def test_contactless_card_confirmation_credits_payee_net_and_is_idempotent():
    async def scenario():
        # core.config.db binds to THIS loop on first use (test process is fresh).
        from core.config import db
        from routes.contactless import _credit_payee, get_contactless_config
        from core.cashback import award_cashback

        sfx = uuid.uuid4().hex[:8]
        payer = f"cc_payer_{sfx}"
        payee = f"cc_payee_{sfx}"
        req_id = f"cl_{sfx}"
        session_id = f"sess_{sfx}"
        amount = 50.0

        # Force a known 10% commission + cashback enabled.
        await db.contactless_config.update_one(
            {"id": "contactless"},
            {"$set": {"id": "contactless", "enabled": True, "commission_percent": 10.0,
                      "expiry_minutes": 15, "max_amount": 2000.0, "min_card": 1.0}},
            upsert=True,
        )
        await db.users.insert_one({"id": payee, "email": f"{payee}@x", "role": "driver"})
        await db.drivers.insert_one({"id": f"d_{sfx}", "user_id": payee, "earnings": 0})
        await db.wallets.insert_one({"user_id": payee, "balance": 0.0, "currency": "EUR"})
        await db.wallets.insert_one({"user_id": payer, "balance": 0.0, "currency": "EUR"})
        req = {"id": req_id, "code": "000000", "payee_id": payee, "payee_role": "driver",
               "payee_name": "Carte Payee", "amount": amount, "status": "pending",
               "payment_method": "card", "session_id": session_id}
        await db.contactless_payments.insert_one(dict(req))
        await db.payment_transactions.insert_one({
            "id": f"pay_{sfx}", "session_id": session_id, "user_id": payer,
            "contactless_id": req_id, "amount": amount, "type": "contactless",
            "payment_status": "pending", "status": "initiated",
        })

        try:
            # ── Simulate Stripe == "paid": the exact code path of GET /status ──
            gate = await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"payment_status": "paid", "status": "complete"}},
            )
            assert gate.modified_count == 1, "first confirmation must pass the gate"

            await db.contactless_payments.update_one({"id": req_id}, {"$set": {"status": "paid"}})
            split = await _credit_payee(req, amount, "card", req_id)
            cashback = await award_cashback(payer, amount, "card", "contactless", ref_id=req_id)

            # Commission 10% of 50 = 5 → net 45 credited to payee.
            assert split["commission"] == 5.0 and split["net"] == 45.0
            payee_w = await db.wallets.find_one({"user_id": payee}, {"_id": 0})
            assert round(payee_w["balance"], 2) == 45.0
            # Cashback awarded to payer (2% of 50 = 1.0 by default config).
            assert cashback > 0
            assert await db.cashback_ledger.count_documents({"user_id": payer, "service": "contactless"}) == 1

            # ── Idempotency: a second confirmation must NOT pass the gate ──
            gate2 = await db.payment_transactions.update_one(
                {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                {"$set": {"payment_status": "paid"}},
            )
            assert gate2.modified_count == 0, "second confirmation must be blocked (no double credit)"
            # award_cashback is idempotent per (service, ref_id).
            again = await award_cashback(payer, amount, "card", "contactless", ref_id=req_id)
            assert again == 0.0
            payee_w2 = await db.wallets.find_one({"user_id": payee}, {"_id": 0})
            assert round(payee_w2["balance"], 2) == 45.0  # unchanged
        finally:
            await db.users.delete_many({"id": payee})
            await db.drivers.delete_many({"user_id": payee})
            await db.wallets.delete_many({"user_id": {"$in": [payer, payee]}})
            await db.wallet_transactions.delete_many({"user_id": {"$in": [payer, payee]}})
            await db.cashback_ledger.delete_many({"user_id": payer})
            await db.contactless_payments.delete_many({"id": req_id})
            await db.payment_transactions.delete_many({"session_id": session_id})

    from conftest import run_async
    run_async(scenario())
