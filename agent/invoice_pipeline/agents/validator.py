"""Validator agent: compare the invoice with inventory, pricing, and vendor masters."""

from __future__ import annotations

import logging

from invoice_pipeline.config import MAX_EXTRACTION_ATTEMPTS
from invoice_pipeline.db import lookup_item, lookup_price, lookup_vendor
from invoice_pipeline.state import event

logger = logging.getLogger("invoice_pipeline.validator")


def validate_node(state: dict) -> dict:
    invoice = dict(state.get("invoice") or {})
    lines = [dict(line) for line in invoice.get("line_items") or []]
    vendor = lookup_vendor(invoice.get("vendor_name"))
    if vendor.get("matched"):
        invoice["vendor_id"] = vendor.get("vendor_id")

    checked_lines = []
    for line in lines:
        item = lookup_item(line.get("description"))
        checked = {
            "description": line.get("description"),
            "quantity": line.get("quantity"),
            "unit_price": line.get("unit_price"),
            "matched": bool(item.get("matched")),
            "item": item.get("item"),
            "item_id": item.get("item_id"),
            "stock": item.get("stock"),
            "master_unit_price": None,
            "price_updated_on": None,
            "price_variance_pct": None,
            "price_variance_amount": None,
        }
        if item.get("matched"):
            line["sku"] = item.get("item")
            line["item_id"] = item.get("item_id")
            price = lookup_price(item.get("item_id"))
            master = price.get("unit_price")
            checked["master_unit_price"] = master
            checked["price_updated_on"] = price.get("last_updated_on")
            invoice_price = line.get("unit_price")
            quantity = line.get("quantity") or 0
            if master not in (None, 0) and invoice_price is not None:
                delta = invoice_price - master
                checked["price_variance_pct"] = delta / master
                checked["price_variance_amount"] = round(delta * quantity, 2)
        checked_lines.append(checked)

    invoice["line_items"] = lines
    report = {"vendor": vendor, "lines": checked_lines}
    logger.info(
        "Validator vendor_matched=%s lines=%s",
        vendor.get("matched"),
        len(checked_lines),
    )
    return {
        "invoice": invoice,
        "validation_report": report,
        "events": [
            event(
                "validator",
                _summary(vendor, checked_lines),
                vendor_id=invoice.get("vendor_id"),
            )
        ],
    }


def route_after_validate(state: dict) -> str:
    if state.get("pending_fields") and state.get("extraction_attempts", 0) < MAX_EXTRACTION_ATTEMPTS:
        return "extract"
    if state.get("pending_fields"):
        return "human_review"
    return "commercial_review"


def _summary(vendor: dict, lines: list[dict]) -> str:
    vendor_text = (
        f"vendor {vendor.get('vendor_id')} {vendor.get('name')}"
        if vendor.get("matched")
        else f"vendor {vendor.get('query')!r} not in vendor master"
    )
    unknown = [line["description"] for line in lines if not line["matched"]]
    short = [line for line in lines if line["matched"] and (line["quantity"] or 0) > (line["stock"] or 0)]
    priced = [
        line["description"]
        for line in lines
        if line["price_variance_pct"] is not None and abs(line["price_variance_pct"]) > 0.05
    ]
    parts = [vendor_text]
    if unknown:
        parts.append("unknown items: " + ", ".join(str(name) for name in unknown))
    if short:
        parts.append("stock shortfalls: " + ", ".join(str(line["description"]) for line in short))
    if priced:
        parts.append("price variances: " + ", ".join(str(name) for name in priced))
    if len(parts) == 1 and not unknown:
        parts.append(f"{len(lines)} lines matched inventory and pricing")
    return "; ".join(parts) + "."
