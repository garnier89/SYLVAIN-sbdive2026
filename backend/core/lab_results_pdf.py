"""PDF generation for SB Labo analysis results (compte rendu d'analyses)."""
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

INDIGO = colors.HexColor("#4F46E5")
INDIGO_DARK = colors.HexColor("#3730A3")
LIGHT = colors.HexColor("#EEF2FF")
RED = colors.HexColor("#DC2626")


def _fmt(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return datetime.now(timezone.utc).strftime("%d/%m/%Y")


def lab_results_pdf(order: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=18 * mm, bottomMargin=16 * mm)
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("LTitle", parent=ss["Title"], textColor=INDIGO_DARK, fontSize=20, spaceAfter=2))
    ss.add(ParagraphStyle("LSub", parent=ss["Normal"], textColor=colors.HexColor("#64748b"), fontSize=10))
    ss.add(ParagraphStyle("LH2", parent=ss["Heading2"], textColor=INDIGO_DARK, fontSize=13, spaceBefore=12, spaceAfter=4))
    ss.add(ParagraphStyle("LBody", parent=ss["Normal"], textColor=colors.HexColor("#334155"), fontSize=11, leading=16))
    ss.add(ParagraphStyle("LNote", parent=ss["Normal"], textColor=colors.HexColor("#94a3b8"), fontSize=8, leading=12))

    el = [
        Paragraph("Compte rendu d'analyses", ss["LTitle"]),
        Paragraph(f"SB Labo · Édité le {_fmt(order.get('results_at') or order.get('created_at'))}", ss["LSub"]),
        Spacer(1, 12),
    ]
    info = [
        ["Patient", order.get("patient_name", "—")],
        ["Laboratoire", order.get("provider_name", "—")],
        ["Prélèvement", _fmt(order.get("scheduled_date"))],
        ["Référence", str(order.get("id", "—"))],
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

    el.append(Paragraph("Résultats", ss["LH2"]))
    rows = [["Analyse", "Résultat", "Unité", "Valeurs de référence"]]
    flags = []
    for r in (order.get("results") or []):
        rows.append([r.get("name", ""), r.get("value", ""), r.get("unit", ""), r.get("ref_range", "")])
        flags.append((r.get("flag") or "normal").lower())
    rt = Table(rows, colWidths=[58 * mm, 28 * mm, 24 * mm, 55 * mm])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]
    for i, f in enumerate(flags, start=1):
        if f in ("high", "low", "abnormal"):
            style.append(("TEXTCOLOR", (1, i), (1, i), RED))
            style.append(("FONTNAME", (1, i), (1, i), "Helvetica-Bold"))
    rt.setStyle(TableStyle(style))
    el.append(rt)

    if (order.get("conclusion") or "").strip():
        el.append(Paragraph("Conclusion / Commentaire", ss["LH2"]))
        el.append(Paragraph(order["conclusion"], ss["LBody"]))

    el.append(Spacer(1, 22))
    el.append(Paragraph(
        "Document généré par SB Labo. Les résultats marqués en rouge sont hors des valeurs de référence. "
        "Consultez votre médecin pour l'interprétation. SB Drive est une plateforme de mise en relation.", ss["LNote"]))
    doc.build(el)
    return buf.getvalue()
