"""Paths and environment for the invoice pipeline."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
INVENTORY_DB = ROOT / "inventory.db"
PRICING_DB = ROOT / "pricing.db"
VENDOR_DB = ROOT / "vendor.db"

MAX_EXTRACTION_ATTEMPTS = 2
MAX_REFLECTIONS = 1

FLAG_TOTAL = 5_000
ELEVATED_TOTAL = 10_000
CRITICAL_TOTAL = 25_000
PRICE_TOLERANCE = 0.05
MATERIAL_FLAG = 500
MATERIAL_ELEVATED = 1_000


def load_env() -> None:
    load_dotenv(ROOT / ".env")


def grok_model() -> str:
    return os.getenv("GROK_MODEL", "grok-4.7")


def grok_base_url() -> str:
    return os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")


def reasoning_effort() -> str:
    return os.getenv("GROK_REASONING_EFFORT", "low")


def audit_db_path() -> Path:
    return Path(os.getenv("AUDIT_DB", ROOT / "output" / "audit.db"))


def output_dir() -> Path:
    path = Path(os.getenv("OUTPUT_DIR", ROOT / "output"))
    path.mkdir(parents=True, exist_ok=True)
    return path
