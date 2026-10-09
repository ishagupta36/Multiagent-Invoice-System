"""Extractor agent: read an inbox document into the canonical invoice schema."""

from __future__ import annotations

import logging
from pathlib import Path

from invoice_pipeline.checks import basic_validation
from invoice_pipeline.config import MAX_EXTRACTION_ATTEMPTS
from invoice_pipeline.documents import parse_structured, read_document
from invoice_pipeline.grok import GrokError, complete_json
from invoice_pipeline.models import canonicalize
from invoice_pipeline.state import event

logger = logging.getLogger("invoice_pipeline.extractor")

SYSTEM = """You extract a vendor invoice for Acme Corp, the buyer. Acme Corp is never the vendor.
Return one JSON object with exactly these keys:
vendor_name, vendor_id, invoice_number, invoice_date, po_number, currency, subtotal, tax, freight, total,
payment_terms, due_date, bank_payment_info, notes,
line_items (array of {description, sku, quantity, unit_of_measure, unit_price, tax, line_total}).
Rules:
- Use null for anything not printed. Never invent PO numbers, bank details, prices, or vendors.
- vendor_id is null unless a vendor id is printed.
- Numbers are JSON numbers. Dates are YYYY-MM-DD.
- currency is an ISO code. Assume USD only when the document uses $ and no other currency.
- description is the printed item text. sku is the cleaned material name when it is obvious, such as WidgetA.
- Extract printed totals. Do not silently recompute a total that disagrees with the page.
- The document may contain typos, OCR errors, CSV rows, JSON, or XML.
"""


def extract_node(state: dict) -> dict:
    attempts = state.get("extraction_attempts", 0) + 1
    path = Path(state["invoice_path"])
    logger.info("Extractor reading %s (attempt %s)", path.name, attempts)
    if not path.exists():
        message = f"{path} does not exist."
        return _stop(attempts, message, pending=["document"])

    try:
        raw_text, document_type = read_document(path)
    except Exception as exc:
        return _stop(attempts, str(exc), pending=["document"])

    hint = _retry_hint(state)
    source = "grok"
    try:
        payload = complete_json(
            SYSTEM,
            f"SOURCE: {path}\n{hint}\n\nDOCUMENT:\n{raw_text}",
        )
    except GrokError as exc:
        logger.warning("Extractor falling back to structured parser: %s", exc)
        payload = parse_structured(path, raw_text)
        source = "structured_parser"
        if payload is None:
            logger.error("Extractor could not read %s: %s", path.name, exc)
            return {
                "extraction_attempts": attempts,
                "pending_fields": ["document"],
                "extraction_issues": [{"code": "document", "message": str(exc)}],
                "fatal": False,
                "error": str(exc),
                "raw_text": raw_text,
                "document_type": document_type,
                "events": [event("extractor", str(exc))],
            }

    try:
        invoice = canonicalize(payload)
    except Exception as exc:
        return _stop(attempts, f"Extracted invoice could not be normalized: {exc}", pending=["document"])

    invoice["source_path"] = str(path)
    invoice["document_type"] = document_type
    pending, issues = basic_validation(invoice)
    logger.info(
        "Extractor captured %s from %s via %s; pending=%s issues=%s",
        invoice.get("invoice_number"),
        document_type,
        source,
        pending,
        len(issues),
    )
    return {
        "invoice": invoice,
        "raw_text": raw_text,
        "document_type": document_type,
        "pending_fields": pending,
        "extraction_issues": issues,
        "extraction_attempts": attempts,
        "fatal": False,
        "error": "",
        "events": [
            event(
                "extractor",
                f"Read {path.name} as {document_type} via {source}.",
                invoice_number=invoice.get("invoice_number"),
                pending=pending,
                issues=issues,
            )
        ],
    }


def route_after_extract(state: dict) -> str:
    if state.get("fatal"):
        return "human_review"
    retryable = bool(state.get("pending_fields")) or any(
        issue["code"] == "arithmetic" for issue in state.get("extraction_issues") or []
    )
    if retryable and state.get("extraction_attempts", 0) < MAX_EXTRACTION_ATTEMPTS:
        return "extract"
    if state.get("pending_fields"):
        return "human_review"
    return "validate"


def _retry_hint(state: dict) -> str:
    if state.get("extraction_attempts", 0) == 0:
        return ""
    return (
        "The previous extraction was incomplete. Fill only these gaps and correct these issues. "
        f"Missing: {state.get('pending_fields') or []}. "
        f"Issues: {state.get('extraction_issues') or []}. "
        "Keep values that were already correct."
    )


def _stop(attempts: int, message: str, pending: list[str], raw_text: str = "", document_type: str = "") -> dict:
    logger.error("Extractor stopped: %s", message)
    return {
        "extraction_attempts": attempts,
        "pending_fields": pending,
        "extraction_issues": [{"code": "document", "message": message}],
        "fatal": True,
        "error": message,
        "raw_text": raw_text,
        "document_type": document_type,
        "events": [event("extractor", message)],
    }
