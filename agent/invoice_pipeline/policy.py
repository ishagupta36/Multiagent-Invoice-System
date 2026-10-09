"""Deterministic VP controls and the final approve / reject / hold decision."""

from __future__ import annotations

from invoice_pipeline.audit import history_for_vendor
from invoice_pipeline.config import (
    CRITICAL_TOTAL,
    ELEVATED_TOTAL,
    FLAG_TOTAL,
    MATERIAL_ELEVATED,
    MATERIAL_FLAG,
    PRICE_TOLERANCE,
)
from invoice_pipeline.normalize import invoice_key

_URGENT_WORDS = ("immediate", "wire", "urgent", "due on receipt", "prepaid", "prepayment", "advance")
_RUSH_WORDS = ("rush", "expedite", "expedited", "premium freight")
_COMMERCIAL_RULES = set(range(15, 25))


def _finding(rule_id: int, rule: str, severity: str, message: str) -> dict:
    return {"rule_id": rule_id, "rule": rule, "severity": severity, "message": message}


def _blob(*parts: str | None) -> str:
    return " ".join(part.lower() for part in parts if part)


def evaluate_rules(invoice: dict, validation: dict, extraction_issues: list[dict]) -> list[dict]:
    findings: list[dict] = []
    findings.extend(_integrity(extraction_issues, invoice))
    findings.append(_high_value(invoice.get("total")))
    findings.append(_vendor(validation.get("vendor") or {}, invoice))
    findings.extend(_lines(validation.get("lines") or []))
    findings.append(_vendor_item())
    findings.append(_payment_terms())
    findings.extend(_history(invoice))
    findings.extend(_payment_destination(invoice))
    findings.append(_rush(invoice, validation.get("lines") or []))
    return findings


def _integrity(issues: list[dict], invoice: dict) -> list[dict]:
    findings = []
    for issue in issues:
        severity = "critical" if issue["code"] == "integrity" else "elevated" if issue["code"] == "arithmetic" else "flag"
        findings.append(_finding(0, "Data integrity", severity, issue["message"]))
    if invoice.get("currency") and invoice["currency"] != "USD":
        findings.append(
            _finding(
                0,
                "Data integrity",
                "elevated",
                f"Invoice currency is {invoice['currency']}. Pricing master data is stored in USD.",
            )
        )
    return findings


def _high_value(total: float | None) -> dict:
    if total is None:
        return _finding(1, "High-value invoice", "not_applicable", "No invoice total is available.")
    if total > CRITICAL_TOTAL:
        severity, band = "critical", f"critical threshold of ${CRITICAL_TOTAL:,.0f}"
    elif total > ELEVATED_TOTAL:
        severity, band = "elevated", f"elevated threshold of ${ELEVATED_TOTAL:,.0f}"
    elif total > FLAG_TOTAL:
        severity, band = "flag", f"flag threshold of ${FLAG_TOTAL:,.0f}"
    else:
        return _finding(
            1,
            "High-value invoice",
            "not_applicable",
            f"Total ${total:,.2f} is inside the standard approval band.",
        )
    return _finding(1, "High-value invoice", severity, f"Total ${total:,.2f} exceeds the {band}.")


def _vendor(vendor: dict, invoice: dict) -> dict:
    if not invoice.get("vendor_name"):
        return _finding(2, "Unknown / inactive vendor", "critical", "Vendor name was not captured.")
    if not vendor.get("matched"):
        return _finding(
            2,
            "Unknown / inactive vendor",
            "critical",
            f"{invoice['vendor_name']} is not in the vendor master.",
        )
    return _finding(
        2,
        "Unknown / inactive vendor",
        "not_applicable",
        f"Matched vendor master record {vendor.get('vendor_id')} {vendor.get('name')}.",
    )


def _lines(lines: list[dict]) -> list[dict]:
    findings = [
        _finding(
            3,
            "New vendor + material spend",
            "not_applicable",
            "Vendor master has no created date, so a new-vendor test cannot be applied.",
        )
    ]
    price_hits = []
    exposure_hits = []
    stock_hits = []
    unknown_hits = []
    missing_price = []
    for line in lines:
        label = line.get("description") or "line"
        if not line.get("matched"):
            unknown_hits.append(label)
            continue
        pct = line.get("price_variance_pct")
        exposure = line.get("price_variance_amount")
        if line.get("master_unit_price") is None:
            missing_price.append(label)
        elif pct is not None and abs(pct) > PRICE_TOLERANCE:
            price_hits.append(
                f"{label} is {pct:.1%} from master ${line['master_unit_price']:,.2f}"
            )
        if exposure is not None and abs(exposure) > MATERIAL_FLAG:
            exposure_hits.append(f"{label} variance is ${exposure:,.2f}")
    grouped: dict = {}
    for line in lines:
        if not line.get("matched"):
            continue
        key = line.get("item_id") or line.get("item")
        bucket = grouped.setdefault(
            key,
            {"item": line.get("item") or line.get("description"), "quantity": 0, "stock": line.get("stock")},
        )
        bucket["quantity"] += line.get("quantity") or 0
    for bucket in grouped.values():
        if bucket["stock"] is not None and bucket["quantity"] > bucket["stock"]:
            stock_hits.append(
                f"{bucket['item']} requests {bucket['quantity']:g} against stock {bucket['stock']:g}"
            )
    if unknown_hits:
        findings.append(
            _finding(7, "Item not found / mismatched item", "critical", "No inventory match for " + ", ".join(unknown_hits) + ".")
        )
    else:
        findings.append(_finding(7, "Item not found / mismatched item", "not_applicable", "Every line maps to inventory."))
    if stock_hits:
        findings.append(
            _finding(6, "Quantity exceeds inventory evidence", "critical", "; ".join(stock_hits) + ".")
        )
    else:
        findings.append(_finding(6, "Quantity exceeds inventory evidence", "not_applicable", "Requested quantities are within stock."))
    if price_hits or missing_price:
        message = "; ".join(price_hits + [f"{name} has no pricing-master row" for name in missing_price])
        findings.append(_finding(4, "Unit-price variance", "elevated", message + "."))
    else:
        findings.append(_finding(4, "Unit-price variance", "not_applicable", "Unit prices are within 5% of the pricing master."))
    material_severity = "elevated" if any(
        abs(line.get("price_variance_amount") or 0) > MATERIAL_ELEVATED for line in lines
    ) else "flag"
    if exposure_hits:
        findings.append(_finding(5, "Material total price variance", material_severity, "; ".join(exposure_hits) + "."))
    else:
        findings.append(
            _finding(5, "Material total price variance", "not_applicable", "Extended price variance is under $500.")
        )
    return findings


def _vendor_item() -> dict:
    return _finding(
        8,
        "Vendor-item mismatch",
        "not_applicable",
        "Vendor master has no approved-item list, so supplier authorization for the item cannot be confirmed.",
    )


def _payment_terms() -> dict:
    return _finding(
        9,
        "Payment-term deterioration",
        "not_applicable",
        "Vendor master has no agreed payment terms to compare against this invoice.",
    )


def _history(invoice: dict) -> list[dict]:
    prior = history_for_vendor(invoice.get("vendor_name"))
    number = invoice_key(invoice.get("invoice_number"))
    duplicates = [row for row in prior if number and row.get("invoice_key") == number]
    near = [
        row
        for row in prior
        if row.get("invoice_date") == invoice.get("invoice_date")
        and invoice.get("total") is not None
        and row.get("total") is not None
        and abs(row["total"] - invoice["total"]) < 0.01
        and row.get("invoice_key") != number
    ]
    if duplicates:
        duplicate = _finding(
            10,
            "Duplicate / near-duplicate invoice",
            "critical",
            f"Invoice {invoice.get('invoice_number')} was already processed for this vendor.",
        )
    elif near:
        duplicate = _finding(
            10,
            "Duplicate / near-duplicate invoice",
            "elevated",
            "Another invoice for this vendor has the same date and amount.",
        )
    elif prior:
        duplicate = _finding(10, "Duplicate / near-duplicate invoice", "not_applicable", "No prior invoice matches this number, date, and amount.")
    else:
        duplicate = _finding(10, "Duplicate / near-duplicate invoice", "not_applicable", "No prior invoices are on file for this vendor.")

    if len(prior) >= 3:
        frequency = _finding(
            12,
            "Unusual invoice frequency / split pattern",
            "flag",
            f"{len(prior)} prior invoices are already on file for this vendor.",
        )
    else:
        frequency = _finding(
            12,
            "Unusual invoice frequency / split pattern",
            "not_applicable",
            "Not enough invoice history to call this a split or frequency pattern.",
        )

    totals = [row["total"] for row in prior if row.get("total") is not None]
    current = invoice.get("total")
    if len(totals) >= 2 and current is not None:
        median = sorted(totals)[len(totals) // 2]
        if median > 0 and current > max(2 * median, median + 1_000):
            anomaly = _finding(
                13,
                "Historical spend anomaly",
                "elevated",
                f"Total ${current:,.2f} is well above the vendor median of ${median:,.2f}.",
            )
        else:
            anomaly = _finding(13, "Historical spend anomaly", "not_applicable", "Total is inside the vendor's recent range.")
    else:
        anomaly = _finding(
            13,
            "Historical spend anomaly",
            "not_applicable",
            "Fewer than two priced invoices are on file, so there is no historical range yet.",
        )
    return [duplicate, frequency, anomaly]


def _payment_destination(invoice: dict) -> list[dict]:
    text = _blob(invoice.get("payment_terms"), invoice.get("bank_payment_info"), invoice.get("notes"))
    if invoice.get("bank_payment_info"):
        bank = _finding(
            11,
            "Vendor bank-detail change",
            "elevated",
            "Invoice includes payment destination details, and the vendor master has no approved bank record to match.",
        )
    else:
        bank = _finding(
            11,
            "Vendor bank-detail change",
            "not_applicable",
            "No payment destination was extracted, and the vendor master has no bank record on file.",
        )
    if any(word in text for word in _URGENT_WORDS):
        method = _finding(
            14,
            "Unusual payment method",
            "elevated",
            "Invoice asks for immediate, wire, advance, or off-cycle payment.",
        )
    else:
        method = _finding(
            14,
            "Unusual payment method",
            "not_applicable",
            "No wire, manual, or off-cycle payment instruction was extracted.",
        )
    return [bank, method]


def _rush(invoice: dict, lines: list[dict]) -> dict:
    text = _blob(invoice.get("notes"), *(line.get("description") for line in lines))
    varied = any(abs(line.get("price_variance_pct") or 0) > 0 for line in lines)
    if any(word in text for word in _RUSH_WORDS) and varied:
        return _finding(
            21,
            "Premium freight / expedite costs",
            "elevated",
            "A line is marked rush or expedited and its unit price differs from the pricing master.",
        )
    if any(word in text for word in _RUSH_WORDS):
        return _finding(
            21,
            "Premium freight / expedite costs",
            "flag",
            "Invoice language mentions rush or expedited handling.",
        )
    return _finding(21, "Premium freight / expedite costs", "not_applicable", "No rush or expedite language was extracted.")


def decide(findings: list[dict], commercial: dict, critique: dict) -> tuple[str, str, bool]:
    """Return decision, reason, and whether policy overrode the model."""
    fired = [item for item in findings if item["severity"] != "not_applicable"]
    critical = [item for item in fired if item["severity"] == "critical"]
    elevated = [item for item in fired if item["severity"] == "elevated"]
    flags = [item for item in fired if item["severity"] == "flag"]
    recommendation = str((commercial or {}).get("recommendation") or "human_review").strip().lower()
    reasoning = (commercial or {}).get("reasoning") or "The commercial review did not explain its recommendation."
    rules = (commercial or {}).get("rules") or []
    covered = {int(rule["id"]) for rule in rules if str(rule.get("id", "")).isdigit()}
    concerns = {str(rule.get("concern") or "").lower() for rule in rules}
    unresolved = (commercial or {}).get("unresolved_questions") or []
    contradictions = (critique or {}).get("contradictions") or []

    def listed(items: list[dict]) -> str:
        return "; ".join(f"R{item['rule_id']} {item['message']}" for item in items)

    if critical:
        return (
            "rejected",
            "Rejected. Critical controls fired: " + listed(critical),
            recommendation == "approve",
        )
    if elevated:
        return (
            "human_review",
            "Held for VP review. Elevated controls fired: " + listed(elevated),
            recommendation == "approve",
        )
    if not _COMMERCIAL_RULES.issubset(covered):
        missing = ", ".join(str(rule_id) for rule_id in sorted(_COMMERCIAL_RULES - covered))
        return (
            "human_review",
            f"Held for VP review. The commercial review did not address judgment rules {missing}.",
            False,
        )
    if contradictions:
        return (
            "human_review",
            "Held for VP review. The critique still contradicts the recommendation: " + "; ".join(map(str, contradictions)),
            recommendation == "approve",
        )
    if "high" in concerns or "medium" in concerns or unresolved:
        return (
            "human_review",
            "Held for VP review. " + reasoning,
            recommendation == "approve",
        )
    if recommendation == "reject":
        return ("human_review", "Held for VP review. Rejection was recommended without a cited commercial concern. " + reasoning, False)
    flag_note = (" Flags acknowledged: " + listed(flags)) if flags else ""
    return (
        "approved",
        "Approved. Master data and invoice math support payment." + flag_note + " " + reasoning,
        False,
    )
