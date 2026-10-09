"""Payment agent and the terminal decision logs."""

from __future__ import annotations

import json
import logging

from invoice_pipeline.audit import record_decision
from invoice_pipeline.config import output_dir
from invoice_pipeline.report import write_report
from invoice_pipeline.state import event

logger = logging.getLogger("invoice_pipeline.payment")


def mock_payment(vendor, amount):
    print(f"Paid {amount} to {vendor}")
    return {"status": "success"}


def pay_node(state: dict) -> dict:
    invoice = state.get("invoice") or {}
    amount = invoice.get("total")
    vendor = invoice.get("vendor_name")
    if amount is None or not vendor:
        reason = "Payment was not sent because the vendor or total is missing."
        return {
            "decision": "human_review",
            "decision_reason": reason,
            "events": [event("payment", reason)],
        }
    result = mock_payment(vendor, amount)
    logger.info("Paid %s to %s", amount, vendor)
    return {"payment_result": result, "events": [event("payment", f"Paid {amount} to {vendor}")]}


def human_review_node(state: dict) -> dict:
    reason = state.get("decision_reason")
    if not reason:
        missing = ", ".join(state.get("pending_fields") or []) or "none"
        problems = "; ".join(issue["message"] for issue in state.get("extraction_issues") or []) or "none"
        reason = f"Held for human review. Missing fields: {missing}. Extraction issues: {problems}."
    logger.info("Human review: %s", reason)
    return {
        "decision": "human_review",
        "decision_reason": reason,
        "events": [event("human_review", reason)],
    }


def reject_node(state: dict) -> dict:
    reason = state.get("decision_reason") or "Rejected."
    logger.info("Rejected: %s", reason)
    return {"events": [event("payment", reason)]}


def finalize_node(state: dict) -> dict:
    invoice = state.get("invoice") or {}
    decision = state.get("decision") or "human_review"
    reason = state.get("decision_reason") or ""
    record_decision(invoice, decision, reason)
    destination = output_dir()
    stem = _stem(invoice, state.get("invoice_path", "invoice"))
    payload = {
        "decision": decision,
        "decision_reason": reason,
        "policy_override": state.get("policy_override", False),
        "payment_result": state.get("payment_result") or {},
        "invoice": invoice,
        "validation_report": state.get("validation_report") or {},
        "findings": state.get("findings") or [],
        "commercial_review": state.get("commercial_review") or {},
        "critique": state.get("critique") or {},
        "events": state.get("events") or [],
        "error": state.get("error") or "",
    }
    json_path = destination / f"{stem}.json"
    html_path = destination / f"{stem}.html"
    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    write_report(payload, html_path)
    logger.info("Wrote %s", json_path.name)
    return {"events": [event("audit", f"Logged {decision} to {json_path.name}")]}


def _stem(invoice: dict, source: str) -> str:
    number = invoice.get("invoice_number") or "unnumbered"
    safe = "".join(character if character.isalnum() or character in "-_" else "_" for character in str(number))
    source_name = source.replace("\\", "/").rsplit("/", 1)[-1]
    source_stem = source_name.rsplit(".", 1)[0]
    if source_stem and source_stem not in safe:
        return f"{source_stem}_{safe}"
    return safe
