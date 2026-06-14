"""PDF generation for SB Santé electronic prescriptions (ordonnance)."""
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

TEAL = colors.HexColor("#0D9488")
TEAL_DARK = colors.HexColor("#115E59")
LIGHT = colors.HexColor("#F0FDFA")


def _fmt(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return datetime.now(timezone.utc).strftime("%d/%m/%Y")


def prescription_pdf(rx: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm)
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("RxTitle", parent=ss["Title"], textColor=TEAL_DARK, fontSize=20, spaceAfter=2))
    ss.add(ParagraphStyle("RxSub", parent=ss["Normal"], textColor=colors.HexColor("#64748b"), fontSize=10))
    ss.add(ParagraphStyle("RxH2", parent=ss["Heading2"], textColor=TEAL_DARK, fontSize=13, spaceBefore=12, spaceAfter=4))
    ss.add(ParagraphStyle("RxBody", parent=ss["Normal"], textColor=colors.HexColor("#334155"), fontSize=11, leading=16))
    ss.add(ParagraphStyle("RxNote", parent=ss["Normal"], textColor=colors.HexColor("#94a3b8"), fontSize=8, leading=12))

    el = [
        Paragraph("Ordonnance médicale", ss["RxTitle"]),
        Paragraph(f"SB Santé · Émise le {_fmt(rx.get('created_at'))}", ss["RxSub"]),
        Spacer(1, 12),
    ]
    info = [
        ["Patient", rx.get("patient_name", "—")],
        ["Praticien", rx.get("practitioner_name", "—")],
        ["Spécialité", rx.get("specialty", "—")],
        ["Diagnostic", rx.get("diagnosis", "—") or "—"],
        ["Valable jusqu'au", _fmt(rx.get("valid_until")) if rx.get("valid_until") else "—"],
        ["Référence", str(rx.get("id", "—"))],
    ]
    tbl = Table(info, colWidths=[50 * mm, 115 * mm])
    tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10.5),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#64748b")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, LIGHT]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    el.append(tbl)

    el.append(Paragraph("Prescription", ss["RxH2"]))
    rows = [["Médicament", "Posologie", "Durée"]]
    for m in (rx.get("medications") or []):
        rows.append([m.get("name", ""), m.get("dosage", ""), m.get("duration", "")])
    mt = Table(rows, colWidths=[75 * mm, 55 * mm, 35 * mm])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    el.append(mt)

    if (rx.get("notes") or "").strip():
        el.append(Paragraph("Recommandations", ss["RxH2"]))
        el.append(Paragraph(rx["notes"], ss["RxBody"]))

    el.append(Spacer(1, 24))
    el.append(Paragraph(f"Signature du praticien : {rx.get('practitioner_name', '')}", ss["RxBody"]))
    el.append(Spacer(1, 14))
    el.append(Paragraph(
        "Ordonnance électronique émise via SB Santé. Présentez ce document en pharmacie. "
        "SB Drive est une plateforme de mise en relation ; la prescription engage le praticien signataire.", ss["RxNote"]))
    doc.build(el)
    return buf.getvalue()
