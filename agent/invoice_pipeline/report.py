"""One-page HTML result for a processed invoice."""

from __future__ import annotations

from html import escape
from pathlib import Path


def write_report(result: dict, path: Path) -> None:
    invoice = result.get("invoice") or {}
    decision = result.get("decision") or "human_review"
    color = {"approved": "#0f7b4c", "rejected": "#a12626", "human_review": "#8a5a00"}.get(decision, "#333")
    findings = [
        item
        for item in result.get("findings") or []
        if item.get("severity") != "not_applicable"
    ]
    finding_rows = "".join(
        "<tr><td>R{rule_id}</td><td>{severity}</td><td>{rule}</td><td>{message}</td></tr>".format(
            rule_id=escape(str(item.get("rule_id"))),
            severity=escape(str(item.get("severity"))),
            rule=escape(str(item.get("rule"))),
            message=escape(str(item.get("message"))),
        )
        for item in findings
    ) or "<tr><td colspan='4'>No control exceptions.</td></tr>"
    line_rows = []
    for line in (result.get("validation_report") or {}).get("lines") or []:
        variance = line.get("price_variance_pct")
        variance_text = "" if variance is None else f"{variance:.1%}"
        line_rows.append(
            "<tr><td>{description}</td><td>{quantity}</td><td>{stock}</td><td>{unit_price}</td><td>{master}</td><td>{variance}</td></tr>".format(
                description=escape(str(line.get("description"))),
                quantity=escape(_num(line.get("quantity"))),
                stock=escape(_num(line.get("stock"))),
                unit_price=escape(_num(line.get("unit_price"))),
                master=escape(_num(line.get("master_unit_price"))),
                variance=escape(variance_text),
            )
        )
    events = "".join(
        f"<li><strong>{escape(str(item.get('agent')))}</strong> {escape(str(item.get('message')))}</li>"
        for item in result.get("events") or []
    )
    commercial = (result.get("commercial_review") or {}).get("reasoning") or ""
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{escape(str(invoice.get("invoice_number") or "Invoice"))}</title>
  <style>
    body {{ font-family: Georgia, serif; margin: 2rem auto; max-width: 920px; color: #1c1c1c; }}
    h1 {{ font-size: 1.6rem; margin-bottom: 0.2rem; }}
    .decision {{ color: {color}; font-weight: 700; letter-spacing: 0.04em; }}
    table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }}
    th, td {{ border-bottom: 1px solid #ddd; text-align: left; padding: 0.4rem; vertical-align: top; }}
    th {{ font-size: 0.85rem; }}
  </style>
</head>
<body>
  <p class="decision">{escape(decision.replace("_", " ").upper())}</p>
  <h1>{escape(str(invoice.get("invoice_number") or "Unnumbered invoice"))}</h1>
  <p>{escape(str(invoice.get("vendor_name") or "Unknown vendor"))}
     · {escape(str(invoice.get("currency") or ""))} {escape(_num(invoice.get("total")))}</p>
  <p>{escape(str(result.get("decision_reason") or ""))}</p>
  <h2>Lines against master data</h2>
  <table>
    <tr><th>Item</th><th>Qty</th><th>Stock</th><th>Invoice price</th><th>Master price</th><th>Variance</th></tr>
    {"".join(line_rows) or "<tr><td colspan='6'>No lines were checked.</td></tr>"}
  </table>
  <h2>Controls</h2>
  <table>
    <tr><th>Rule</th><th>Severity</th><th>Control</th><th>Result</th></tr>
    {finding_rows}
  </table>
  <h2>Commercial review</h2>
  <p>{escape(str(commercial)) or "Not run."}</p>
  <h2>Trace</h2>
  <ol>{events}</ol>
</body>
</html>
"""
    path.write_text(html, encoding="utf-8")


def _num(value) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)
