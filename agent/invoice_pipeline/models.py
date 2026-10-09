"""Canonical invoice schema shared by every agent."""

from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict, field_validator

from invoice_pipeline.normalize import parse_date, parse_money


def _blank(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    description: str | None = None
    sku: str | None = None
    item_id: int | None = None
    quantity: float | None = None
    unit_of_measure: str | None = None
    unit_price: float | None = None
    tax: float | None = None
    line_total: float | None = None

    @field_validator("description", "sku", "unit_of_measure", mode="before")
    @classmethod
    def clean_text(cls, value):
        return _blank(value)

    @field_validator("quantity", "unit_price", "tax", "line_total", mode="before")
    @classmethod
    def clean_number(cls, value):
        return parse_money(value)

    @field_validator("item_id", mode="before")
    @classmethod
    def clean_id(cls, value):
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None


class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")

    vendor_name: str | None = None
    vendor_id: int | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    po_number: str | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax: float | None = None
    freight: float | None = None
    total: float | None = None
    payment_terms: str | None = None
    due_date: str | None = None
    bank_payment_info: str | None = None
    notes: str | None = None
    line_items: list[LineItem] = []
    source_path: str | None = None
    document_type: str | None = None

    @field_validator(
        "vendor_name",
        "invoice_number",
        "po_number",
        "payment_terms",
        "notes",
        "currency",
        mode="before",
    )
    @classmethod
    def clean_text(cls, value):
        return _blank(value)

    @field_validator("currency", mode="after")
    @classmethod
    def upper_currency(cls, value: str | None):
        return value.upper() if value else None

    @field_validator("invoice_date", "due_date", mode="before")
    @classmethod
    def clean_date(cls, value):
        return parse_date(value)

    @field_validator("subtotal", "tax", "freight", "total", mode="before")
    @classmethod
    def clean_number(cls, value):
        return parse_money(value)

    @field_validator("vendor_id", mode="before")
    @classmethod
    def clean_vendor_id(cls, value):
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @field_validator("bank_payment_info", mode="before")
    @classmethod
    def clean_bank(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return str(value).strip() or None


def canonicalize(payload: dict) -> dict:
    invoice = Invoice.model_validate(payload or {})
    for line in invoice.line_items:
        if line.line_total is None and line.quantity is not None and line.unit_price is not None:
            line.line_total = round(line.quantity * line.unit_price, 2)
    return invoice.model_dump()
