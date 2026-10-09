"""Field cleanup for amounts, dates, and master-data keys."""

from __future__ import annotations

import re
from datetime import datetime

_DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%d-%b-%Y",
    "%d-%B-%Y",
    "%b %d %Y",
    "%B %d, %Y",
    "%B %d %Y",
    "%d %b %Y",
    "%d %B %Y",
)


def parse_money(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    text = str(value).strip()
    if not text:
        return None
    negative = text.startswith("(") and text.endswith(")")
    text = text.replace("$", "").replace(",", "").replace(" ", "").replace("(", "").replace(")", "")
    text = re.sub(r"(?<=\d)[Oo](?=\d)", "0", text)
    try:
        amount = round(float(text), 2)
    except ValueError:
        return None
    return -amount if negative else amount


def parse_date(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"(?<=\d)[Oo](?=\d)", "0", text)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def item_key(description: str | None) -> str:
    text = description or ""
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"\brush order\b", " ", text, flags=re.IGNORECASE)
    return re.sub(r"[^a-z0-9]", "", text.lower())


def vendor_key(name: str | None) -> str:
    text = (name or "").lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]", "", text)


def invoice_key(number: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (number or "").upper())
