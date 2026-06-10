"""Transactional email via Resend (SB Store onboarding).

Non-blocking, fire-and-forget helpers that NEVER raise into the request path:
if the API key is missing or Resend errors, we log and move on. In Resend
"testing" mode (no verified domain) emails are only delivered to the account
owner's verified address — production delivery requires verifying a domain.
"""
import os
import asyncio
import logging

import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FROM = f"SB Store <{SENDER_EMAIL}>"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


async def _send(to: str, subject: str, html: str) -> None:
    if not RESEND_API_KEY or not to:
        return
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {"from": FROM, "to": [to], "subject": subject, "html": html},
        )
        logger.info("Resend email sent to %s (%s)", to, subject)
    except Exception as e:
        logger.warning("Resend email failed for %s: %s", to, e)


def _shell(title: str, accent: str, body_html: str) -> str:
    """Minimal table-based, inline-CSS responsive email shell (SB Store brand)."""
    return f"""\
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">
      <tr><td style="background:{accent};padding:28px 32px;">
        <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SB Store</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;color:#0a0e1a;font-size:22px;">{title}</h1>
        {body_html}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f5f6f8;color:#8a909c;font-size:12px;text-align:center;">
        SB Drive VTC · Cet email vous est envoyé suite à votre activité sur SB Store.
      </td></tr>
    </table>
  </td></tr>
</table>"""


def fire(coro) -> None:
    """Schedule an email coroutine without blocking the caller."""
    try:
        asyncio.create_task(coro)
    except RuntimeError:
        # No running loop (e.g. called from sync context) — run it best-effort.
        asyncio.run(coro)


async def send_merchant_signup_received(to: str, owner_name: str, store_name: str) -> None:
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {owner_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Nous avons bien reçu votre demande d'ouverture de boutique
          <b>« {store_name} »</b> sur SB Store. 🎉
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Notre équipe examine votre boutique. Vous recevrez un email dès qu'elle
          sera <b>validée et mise en ligne</b>. En attendant, vous pouvez déjà
          préparer votre catalogue depuis votre espace marchand.
        </p>
        <p style="margin-top:24px;color:#444;font-size:15px;">À très vite,<br/>L'équipe SB Store</p>"""
    await _send(to, "Votre demande SB Store a bien été reçue", _shell("Demande reçue ✅", "#FF4500", body))


async def send_merchant_approved(to: str, owner_name: str, store_name: str, dashboard_url: str) -> None:
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {owner_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Excellente nouvelle ! Votre boutique <b>« {store_name} »</b> est désormais
          <b style="color:#16a34a;">validée et visible des clients</b> sur SB Store. 🚀
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Vous pouvez maintenant recevoir des commandes en temps réel, gérer votre
          stock et suivre vos performances.
        </p>
        <p style="text-align:center;margin:28px 0;">
          <a href="{dashboard_url}" style="background:#16a34a;color:#ffffff;text-decoration:none;
             padding:13px 26px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Accéder à mon espace
          </a>
        </p>
        <p style="color:#444;font-size:15px;">Bonnes ventes !<br/>L'équipe SB Store</p>"""
    await _send(to, "🎉 Votre boutique SB Store est validée", _shell("Boutique validée 🎉", "#16a34a", body))
