"""Régression — moteur cashback SB Pay (core/cashback.py).

Garantit le comportement AVANT refactoring : éligibilité, idempotence, plafond,
désactivation, normalisation des méthodes, bornes de mois et résumé.
Exécution in-process via le loop partagé de conftest (run_async).
"""
import uuid

from conftest import run_async
from core import cashback as cb


# ───────────── helpers purs (sans DB) ─────────────
def test_normalize_method_buckets():
    assert cb.normalize_method("wallet") == "sbpay"
    assert cb.normalize_method("SB_Pay") == "sbpay"
    assert cb.normalize_method("sbpaygo") == "sbpay"
    assert cb.normalize_method("Stripe") == "card"
    assert cb.normalize_method("CB") == "card"
    assert cb.normalize_method("espèces") == "cash"
    assert cb.normalize_method("cod") == "cash"
    assert cb.normalize_method("bitcoin") == "bitcoin"  # inconnu → tel quel (lower)


def test_month_bounds_normal_and_december_rollover():
    start, end = cb._month_bounds("2026-03")
    assert start.startswith("2026-03-01")
    assert end.startswith("2026-04-01")
    # rollover décembre → janvier année suivante
    ds, de = cb._month_bounds("2026-12")
    assert ds.startswith("2026-12-01")
    assert de.startswith("2027-01-01")


# ───────────── award_cashback (DB) ─────────────
async def _cleanup(uid):
    from core.config import db
    await db.cashback_ledger.delete_many({"user_id": uid})
    await db.wallet_transactions.delete_many({"user_id": uid})
    await db.wallets.delete_many({"user_id": uid})
    await db.cashback_monthly.delete_many({"user_id": uid})


def test_award_eligible_credits_and_is_idempotent():
    async def scenario():
        from core.config import db
        uid = f"cbtest_{uuid.uuid4().hex[:8]}"
        ref = f"ride_{uuid.uuid4().hex[:8]}"
        try:
            # éligible : 100€ en sbpay, rate 2% par défaut → 2.00€
            got = await cb.award_cashback(uid, 100.0, "sbpay", "ride", ref_id=ref)
            assert got == 2.0, got
            w = await db.wallets.find_one({"user_id": uid}, {"_id": 0})
            assert round(w["balance"], 2) == 2.0
            assert round(w["non_withdrawable"], 2) == 2.0
            led = await db.cashback_ledger.count_documents({"user_id": uid})
            assert led == 1
            tx = await db.wallet_transactions.count_documents({"user_id": uid, "type": "Cashback"})
            assert tx == 1
            # idempotence : même (service, ref_id) → 0, aucun double crédit
            again = await cb.award_cashback(uid, 100.0, "sbpay", "ride", ref_id=ref)
            assert again == 0.0
            assert await db.cashback_ledger.count_documents({"user_id": uid}) == 1
            w2 = await db.wallets.find_one({"user_id": uid}, {"_id": 0})
            assert round(w2["balance"], 2) == 2.0
        finally:
            await _cleanup(uid)
    run_async(scenario())


def test_award_ineligible_cases():
    async def scenario():
        from core.config import db
        uid = f"cbtest_{uuid.uuid4().hex[:8]}"
        try:
            # espèces non éligible
            assert await cb.award_cashback(uid, 100.0, "cash", "ride") == 0.0
            # sous le minimum (min_amount défaut 5€)
            assert await cb.award_cashback(uid, 2.0, "sbpay", "ride") == 0.0
            # montant nul / négatif / None
            assert await cb.award_cashback(uid, 0, "sbpay", "ride") == 0.0
            assert await cb.award_cashback(uid, -10, "sbpay", "ride") == 0.0
            assert await cb.award_cashback(uid, None, "sbpay", "ride") == 0.0
            # user_id manquant
            assert await cb.award_cashback("", 100.0, "sbpay", "ride") == 0.0
            # aucun crédit n'a eu lieu
            assert await db.cashback_ledger.count_documents({"user_id": uid}) == 0
        finally:
            await _cleanup(uid)
    run_async(scenario())


def test_award_respects_disabled_and_cap_config():
    async def scenario():
        from core.config import db
        uid = f"cbtest_{uuid.uuid4().hex[:8]}"
        orig = await db.cashback_config.find_one({"id": cb.CASHBACK_CFG_ID}, {"_id": 0})
        try:
            # désactivé → 0
            await db.cashback_config.update_one({"id": cb.CASHBACK_CFG_ID},
                                                {"$set": {**cb.DEFAULT_CASHBACK, "enabled": False}}, upsert=True)
            assert await cb.award_cashback(uid, 100.0, "sbpay", "ride") == 0.0
            # plafond par tx : rate 2% de 100 = 2€ mais cap à 1€ → 1.00€
            await db.cashback_config.update_one({"id": cb.CASHBACK_CFG_ID},
                                                {"$set": {**cb.DEFAULT_CASHBACK, "enabled": True, "max_per_tx": 1.0}}, upsert=True)
            assert await cb.award_cashback(uid, 100.0, "sbpay", "ride", ref_id=f"r_{uuid.uuid4().hex[:6]}") == 1.0
            # rate 0 → 0
            await db.cashback_config.update_one({"id": cb.CASHBACK_CFG_ID},
                                                {"$set": {**cb.DEFAULT_CASHBACK, "enabled": True, "rate_pct": 0.0}}, upsert=True)
            assert await cb.award_cashback(uid, 100.0, "sbpay", "ride", ref_id=f"r_{uuid.uuid4().hex[:6]}") == 0.0
        finally:
            # restaure la config d'origine (ou supprime si elle n'existait pas)
            if orig:
                await db.cashback_config.update_one({"id": cb.CASHBACK_CFG_ID}, {"$set": orig}, upsert=True)
            else:
                await db.cashback_config.delete_one({"id": cb.CASHBACK_CFG_ID})
            await _cleanup(uid)
    run_async(scenario())


def test_cashback_summary_sums_period_and_all_time():
    async def scenario():
        from core.config import db
        from datetime import datetime, timezone
        uid = f"cbtest_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            await db.cashback_ledger.insert_many([
                {"id": f"cb_{uuid.uuid4().hex[:8]}", "key": f"sum:{uuid.uuid4().hex}", "user_id": uid, "amount": 1.5, "created_at": now_iso},
                {"id": f"cb_{uuid.uuid4().hex[:8]}", "key": f"sum:{uuid.uuid4().hex}", "user_id": uid, "amount": 2.0, "created_at": now_iso},
                # ancien (2020) → compte all_time mais pas this_month
                {"id": f"cb_{uuid.uuid4().hex[:8]}", "key": f"sum:{uuid.uuid4().hex}", "user_id": uid, "amount": 5.0, "created_at": "2020-01-15T10:00:00+00:00"},
            ])
            s = await cb.get_cashback_summary(uid)
            assert round(s["this_month"], 2) == 3.5
            assert round(s["all_time"], 2) == 8.5
            assert s["currency"] == "EUR"
        finally:
            await _cleanup(uid)
    run_async(scenario())
