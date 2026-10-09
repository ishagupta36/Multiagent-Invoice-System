"""Read inbox documents and parse the structured formats directly."""

from __future__ import annotations

import csv
import io
import json
import xml.etree.ElementTree as ET
from pathlib import Path

SUPPORTED_SUFFIXES = {".txt", ".json", ".csv", ".xml", ".pdf"}


def list_inbox(folder: str | Path) -> list[Path]:
    root = Path(folder)
    files = [
        path
        for path in root.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    return sorted(files, key=lambda path: path.name.lower())


def identify_document_type(path: Path, text: str) -> str:
    suffix = path.suffix.lower()
    stripped = text.lstrip()
    if suffix == ".pdf":
        return "pdf"
    if suffix == ".xml" or stripped.startswith("<"):
        return "xml"
    if suffix == ".json" or stripped.startswith("{"):
        return "json"
    if suffix == ".csv":
        return "csv"
    return "text"


def read_document(path: Path) -> tuple[str, str]:
    if path.suffix.lower() == ".pdf":
        text = _read_pdf(path)
    else:
        text = path.read_text(encoding="utf-8", errors="replace")
    return text, identify_document_type(path, text)


def _read_pdf(path: Path) -> str:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("pdfplumber is required to read PDF invoices.") from exc
    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return "\n".join(pages)


def parse_structured(path: Path, text: str) -> dict | None:
    kind = identify_document_type(path, text)
    try:
        if kind == "json":
            return _from_mapping(json.loads(text))
        if kind == "xml":
            return _from_xml(text)
        if kind == "csv":
            return _from_csv(text)
    except (json.JSONDecodeError, ET.ParseError, csv.Error, UnicodeError, ValueError):
        return None
    return None


def _from_mapping(data: dict) -> dict:
    vendor = data.get("vendor")
    if isinstance(vendor, dict):
        vendor_name = vendor.get("name")
    else:
        vendor_name = vendor or data.get("vendor_name")
    raw_lines = data.get("line_items") or data.get("items") or []
    lines = []
    for raw in raw_lines:
        if not isinstance(raw, dict):
            continue
        lines.append(
            {
                "description": raw.get("description") or raw.get("item") or raw.get("name"),
                "sku": raw.get("sku"),
                "quantity": raw.get("quantity", raw.get("qty")),
                "unit_of_measure": raw.get("unit_of_measure") or raw.get("uom"),
                "unit_price": raw.get("unit_price", raw.get("price")),
                "tax": raw.get("tax"),
                "line_total": raw.get("line_total", raw.get("amount")),
            }
        )
    tax = data.get("tax_amount", data.get("tax"))
    return {
        "vendor_name": vendor_name,
        "invoice_number": data.get("invoice_number"),
        "invoice_date": data.get("invoice_date") or data.get("date"),
        "due_date": data.get("due_date"),
        "po_number": data.get("po_number") or data.get("po"),
        "currency": data.get("currency"),
        "subtotal": data.get("subtotal"),
        "tax": tax,
        "freight": data.get("freight", data.get("shipping")),
        "total": data.get("total"),
        "payment_terms": data.get("payment_terms"),
        "bank_payment_info": data.get("bank_payment_info"),
        "notes": data.get("notes"),
        "line_items": lines,
    }


def _from_xml(text: str) -> dict:
    root = ET.fromstring(text)
    header = root.find("header")
    vendor_name = _xml_text(header, "vendor") if header is not None else None
    lines = []
    for item in root.findall("./line_items/item"):
        lines.append(
            {
                "description": _xml_text(item, "name") or _xml_text(item, "description"),
                "quantity": _xml_text(item, "quantity"),
                "unit_price": _xml_text(item, "unit_price"),
            }
        )
    totals = root.find("totals")
    return {
        "vendor_name": vendor_name,
        "invoice_number": _xml_text(header, "invoice_number") if header is not None else None,
        "invoice_date": _xml_text(header, "date") if header is not None else None,
        "due_date": _xml_text(header, "due_date") if header is not None else None,
        "currency": _xml_text(header, "currency") if header is not None else None,
        "subtotal": _xml_text(totals, "subtotal") if totals is not None else None,
        "tax": _xml_text(totals, "tax_amount") if totals is not None else None,
        "total": _xml_text(totals, "total") if totals is not None else None,
        "payment_terms": _xml_text(root, "payment_terms"),
        "line_items": lines,
    }


def _xml_text(node, name: str) -> str | None:
    if node is None:
        return None
    child = node.find(name)
    if child is None or child.text is None:
        return None
    return child.text.strip()


def _from_csv(text: str) -> dict:
    sample = text.lstrip().splitlines()[0] if text.strip() else ""
    if sample.lower().startswith("field,value"):
        return _from_field_value_csv(text)
    return _from_grid_csv(text)


def _from_field_value_csv(text: str) -> dict:
    rows = list(csv.reader(io.StringIO(text)))
    invoice: dict = {"line_items": []}
    current: dict | None = None
    for row in rows[1:]:
        if len(row) < 2:
            continue
        field, value = row[0].strip().lower(), row[1].strip()
        if field == "item":
            if current:
                invoice["line_items"].append(current)
            current = {"description": value}
        elif field == "quantity" and current is not None:
            current["quantity"] = value
        elif field == "unit_price" and current is not None:
            current["unit_price"] = value
        elif field in {"invoice_number", "vendor", "date", "due_date", "subtotal", "tax", "total", "payment_terms"}:
            if current:
                invoice["line_items"].append(current)
                current = None
            key = {
                "vendor": "vendor_name",
                "date": "invoice_date",
            }.get(field, field)
            invoice[key] = value
    if current:
        invoice["line_items"].append(current)
    return invoice


def _from_grid_csv(text: str) -> dict:
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return {"line_items": []}
    header = [cell.strip().lower() for cell in rows[0]]
    invoice: dict = {"line_items": []}
    for row in rows[1:]:
        if not any(cell.strip() for cell in row):
            continue
        padded = row + [""] * (len(header) - len(row))
        record = {header[i]: padded[i].strip() for i in range(len(header)) if header[i]}
        item = record.get("item", "")
        if not item or item.endswith(":"):
            label = item[:-1].lower() if item.endswith(":") else ""
            amount = record.get("line total") or record.get("qty") or ""
            if "subtotal" in label:
                invoice["subtotal"] = amount
            elif "tax" in label:
                invoice["tax"] = amount
            elif "total" in label:
                invoice["total"] = amount
            continue
        if not invoice.get("invoice_number"):
            invoice["invoice_number"] = record.get("invoice number")
            invoice["vendor_name"] = record.get("vendor")
            invoice["invoice_date"] = record.get("date")
            invoice["due_date"] = record.get("due date")
        invoice["line_items"].append(
            {
                "description": item,
                "quantity": record.get("qty"),
                "unit_price": record.get("unit price"),
                "line_total": record.get("line total"),
            }
        )
    return invoice
