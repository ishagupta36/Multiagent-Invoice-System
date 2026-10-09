"""Run one invoice, or every document in the simulated inbox."""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

from invoice_pipeline.config import grok_model, load_env
from invoice_pipeline.db import assert_master_data
from invoice_pipeline.documents import list_inbox
from invoice_pipeline.graph import build_graph
from invoice_pipeline.state import initial_state

logger = logging.getLogger("invoice_pipeline")


def run_invoice(invoice_path: str | Path) -> dict:
    graph = build_graph()
    return graph.invoke(initial_state(str(invoice_path)), config={"recursion_limit": 40})


def print_result(result: dict) -> None:
    invoice = result.get("invoice") or {}
    print("=" * 72)
    print(f"Invoice {invoice.get('invoice_number') or '(unnumbered)'}  |  {invoice.get('vendor_name') or 'unknown vendor'}")
    print(f"Decision: {(result.get('decision') or '').upper()}")
    print(result.get("decision_reason") or "")
    payment = result.get("payment_result") or {}
    if payment:
        print(f"Payment status: {payment.get('status')}")
    fired = [item for item in result.get("findings") or [] if item.get("severity") != "not_applicable"]
    if fired:
        print("Controls:")
        for item in fired:
            print(f"  R{item['rule_id']} [{item['severity']}] {item['message']}")
    print("Trace:")
    for item in result.get("events") or []:
        print(f"  [{item['agent']}] {item['message']}")


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Process Acme Corp invoices with the multi-agent pipeline.")
    parser.add_argument("--invoice_path", help="Path to one invoice file.")
    parser.add_argument("--inbox", help="Folder of invoices to process, for example data/invoices.")
    args = parser.parse_args(argv)
    if not args.invoice_path and not args.inbox:
        parser.error("Pass --invoice_path or --inbox.")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not os.getenv("XAI_API_KEY"):
        logger.error("XAI_API_KEY is missing. Add it to .env. See .env.example.")
        return 1
    assert_master_data()
    paths = [Path(args.invoice_path)] if args.invoice_path else list_inbox(args.inbox)
    if not paths:
        logger.error("No invoice files found.")
        return 1

    logger.info("Using %s", grok_model())
    failures = 0
    for path in paths:
        try:
            result = run_invoice(path)
        except Exception:
            logger.exception("Pipeline failed for %s", path)
            failures += 1
            continue
        print_result(result)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
