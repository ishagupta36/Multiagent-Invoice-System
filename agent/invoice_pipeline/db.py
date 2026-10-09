"""Lookups against the local inventory, pricing, and vendor databases."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from invoice_pipeline.config import INVENTORY_DB, PRICING_DB, VENDOR_DB
from invoice_pipeline.normalize import item_key, vendor_key


def _rows(path: Path, query: str, params: tuple = ()) -> list[dict]:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in conn.execute(query, params)]
    finally:
        conn.close()


def _columns(path: Path, table: str) -> set[str]:
    conn = sqlite3.connect(path)
    try:
        return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    finally:
        conn.close()


def load_inventory() -> list[dict]:
    columns = _columns(INVENTORY_DB, "inventory")
    item_id = "item_id" if "item_id" in columns else "NULL AS item_id"
    return _rows(INVENTORY_DB, f"SELECT {item_id}, item, stock FROM inventory")


def load_prices() -> dict[int, dict]:
    rows = _rows(PRICING_DB, "SELECT item_id, unit_price, last_updated_on FROM pricing")
    return {int(row["item_id"]): row for row in rows}


def load_vendors() -> list[dict]:
    columns = _columns(VENDOR_DB, "vendor")
    contact = "primary_contact_name" if "primary_contact_name" in columns else "NULL AS primary_contact_name"
    former = "former_name" if "former_name" in columns else "NULL AS former_name"
    address = "address" if "address" in columns else "NULL AS address"
    email = "email" if "email" in columns else "NULL AS email"
    name = "name" if "name" in columns else "vendor_name"
    return _rows(
        VENDOR_DB,
        f"SELECT vendor_id, {name} AS name, {address}, {email}, {former}, {contact} FROM vendor",
    )


def lookup_vendor(name: str | None) -> dict:
    key = vendor_key(name)
    if not key:
        return {"matched": False, "query": name}
    for vendor in load_vendors():
        if vendor_key(vendor.get("name")) == key or vendor_key(vendor.get("former_name")) == key:
            return {"matched": True, "query": name, **vendor}
    return {"matched": False, "query": name}


def lookup_item(description: str | None) -> dict:
    key = item_key(description)
    if not key:
        return {"matched": False, "query": description}
    for row in load_inventory():
        if item_key(row["item"]) == key:
            return {"matched": True, "query": description, **row}
    return {"matched": False, "query": description}


def lookup_price(item_id: int | None) -> dict:
    if item_id is None:
        return {"matched": False, "item_id": None}
    price = load_prices().get(int(item_id))
    if not price:
        return {"matched": False, "item_id": item_id}
    return {"matched": True, **price}


def assert_master_data() -> None:
    missing = [str(path.name) for path in (INVENTORY_DB, PRICING_DB, VENDOR_DB) if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing master database(s): "
            + ", ".join(missing)
            + ". Create them with init_inventory.py, init_pricing.py, and init_vendor.py."
        )
