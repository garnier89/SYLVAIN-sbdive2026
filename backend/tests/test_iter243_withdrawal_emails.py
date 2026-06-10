"""Withdrawal lifecycle emails — helper must never raise for any status."""
import asyncio
import core.email as email


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_withdrawal_update_email_all_statuses():
    _run(email.send_withdrawal_update("x@y.com", "Jean", status="requested", amount=30.0, ref="wr_1", eta_hours=24, wallet_url="http://x/wallet", method="RIB"))
    _run(email.send_withdrawal_update("x@y.com", "Jean", status="paid", amount=30.0, ref="wr_1", wallet_url="http://x/wallet", method="WAVE"))
    _run(email.send_withdrawal_update("x@y.com", "Jean", status="rejected", amount=30.0, ref="wr_1", reason="Document manquant", wallet_url="http://x/wallet"))
