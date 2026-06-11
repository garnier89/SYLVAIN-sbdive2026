"""KYC driver-document lifecycle emails (received / approved / rejected).

The helper is fire-and-forget and must NEVER raise (Resend may be in test mode
or the API key missing). These tests assert the 3 templates render and send
without throwing.
"""
import asyncio

from core.email import send_document_update


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_received_email_no_crash():
    _run(send_document_update("driver@example.com", "Jean", "received", "Permis de conduire",
                              docs_url="https://drive.test/chauffeur/documents"))


def test_approved_email_no_crash():
    _run(send_document_update("driver@example.com", "Jean", "approved", "Carte grise",
                              docs_url="https://drive.test/chauffeur/documents"))


def test_rejected_email_no_crash():
    _run(send_document_update("driver@example.com", "Jean", "rejected", "Assurance",
                              reason="Document illisible", docs_url="https://drive.test/chauffeur/documents"))


def test_missing_recipient_is_safe():
    # Empty recipient must short-circuit silently.
    _run(send_document_update("", "Jean", "approved", "Permis"))
