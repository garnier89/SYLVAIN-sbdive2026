"""PDF generation for SB Consultation video-call reports (compte-rendu).

Uses ReportLab (already a project dependency). Returns raw PDF bytes so routes
can stream them with a `Response(media_type="application/pdf")` or attach them
to an email.
"""
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

BRAND = colors.HexColor("#F97316")        # orange
BRAND_DARK = colors.HexColor("#9A3412")
LIGHT = colors.HexColor("#FFF7ED")
TEAL = colors.HexColor("#0D9488")

_CAT_FR = {
    "doctor": "Médecin", "lawyer": "Avocat", "tutor": "Tuteur",
    "astrologer": "Astrologue", "fitness": "Coach Fitness",
}


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("CTitle", parent=ss["Title"], textColor=BRAND_DARK, fontSize=20, spaceAfter=2))
    ss.add(ParagraphStyle("CSub", parent=ss["Normal"], textColor=colors.HexColor("#64748b"), fontSize=10))
    ss.add(ParagraphStyle("CH2", parent=ss["Heading2"], textColor=BRAND_DARK, fontSize=13, spaceBefore=12, spaceAfter=4))
    ss.add(ParagraphStyle("CBody", parent=ss["Normal"], textColor=colors.HexColor("#334155"), fontSize=11, leading=16))
    ss.add(ParagraphStyle("CNote", parent=ss["Normal"], textColor=colors.HexColor("#94a3b8"), fontSize=8, leading=12))
    return ss


def _fmt_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d/%m/%Y à %H:%M")
    except Exception:
        return datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M")


def _money(v) -> str:
    try:
        return f"{float(v):.2f} €"
    except (TypeError, ValueError):
        return "—"


def consultation_report_pdf(session: dict, patient_name: str = "") -> bytes:
    """Build a 1-page consultation report: expert, date, duration, amount, notes."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm)
    st = _styles()
    cat = _CAT_FR.get(session.get("category", ""), session.get("category", "") or "Expert")
    date_iso = session.get("ended_at") or session.get("started_at") or session.get("created_at")

    el = [
        Paragraph("Compte-rendu de consultation", st["CTitle"]),
        Paragraph(f"SB Consultation · Document généré le {_fmt_date(None)}", st["CSub"]),
        Spacer(1, 12),
    ]

    info = [
        ["Patient", patient_name or session.get("user_name", "—")],
        ["Expert", session.get("provider_name", "—")],
        ["Spécialité", cat],
        ["Date de la consultation", _fmt_date(date_iso)],
        ["Durée", f"{int(session.get('duration_min', 0) or 0)} min"],
        ["Montant payé", _money(session.get("total_price", 0))],
        ["Référence", str(session.get("id", "—"))],
    ]
    tbl = Table(info, colWidths=[55 * mm, 110 * mm])
    tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10.5),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#0f172a")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LIGHT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    el.append(tbl)

    patient_notes = (session.get("notes") or "").strip()
    el.append(Paragraph("Motif / Notes du patient", st["CH2"]))
    el.append(Paragraph(patient_notes or "<i>Aucune note renseignée.</i>", st["CBody"]))

    provider_notes = (session.get("provider_notes") or "").strip()
    if provider_notes:
        el.append(Paragraph("Notes de l'expert", st["CH2"]))
        el.append(Paragraph(provider_notes, st["CBody"]))

    el.append(Spacer(1, 18))
    el.append(Paragraph(
        "Ce compte-rendu est généré automatiquement par SB Consultation à l'issue de votre consultation vidéo. "
        "SB Drive est une plateforme de mise en relation ; la prestation a été réalisée par l'expert indiqué ci-dessus. "
        "Ce document ne constitue pas une ordonnance ni un avis officiel.", st["CNote"]))
    doc.build(el)
    return buf.getvalue()
