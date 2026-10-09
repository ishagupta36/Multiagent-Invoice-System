"""Processed-invoice log used for duplicate and spend-pattern checks."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from invoice_pipeline.config import audit_db_path
from invoice_pipeline.normalize import invoice_key, vendor_key


def _connect() -> sqlite3.Connection:
    path = audit_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS processed_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_name TEXT,
            vendor_key TEXT,
            vendor_id INTEGER,
            invoice_number TEXT,
            invoice_key TEXT,
            invoice_date TEXT,
            total REAL,
            decision TEXT,
            reason TEXT,
            source_path TEXT,
            processed_at TEXT
        )
        """
    )
    return conn


def history_for_vendor(name: str | None) -> list[dict]:
    key = vendor_key(name)
    if not key:
        return []
    conn = _connect()
    try:
        rows = conn.execute(
            """
            SELECT vendor_name, invoice_number, invoice_key, invoice_date, total, decision, processed_at
            FROM processed_invoices
            WHERE vendor_key = ?
            ORDER BY invoice_date
            """,
            (key,),
        )
        return [dict(row) for row in rows]
    finally:
        conn.close()


def record_decision(invoice: dict, decision: str, reason: str) -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            INSERT INTO processed_invoices (
                vendor_name, vendor_key, vendor_id, invoice_number, invoice_key,
                invoice_date, total, decision, reason, source_path, processed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                invoice.get("vendor_name"),
                vendor_key(invoice.get("vendor_name")),
                invoice.get("vendor_id"),
                invoice.get("invoice_number"),
                invoice_key(invoice.get("invoice_number")),
                invoice.get("invoice_date"),
                invoice.get("total"),
                decision,
                reason,
                invoice.get("source_path"),
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        conn.commit()
    finally:
        conn.close()
