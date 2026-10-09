from __future__ import annotations

from pathlib import Path

import pytest

from invoice_pipeline.checks import basic_validation
from invoice_pipeline.documents import parse_structured, read_document
from invoice_pipeline.grok import set_json_override
from invoice_pipeline.models import canonicalize
from invoice_pipeline.policy import decide, evaluate_rules
from invoice_pipeline.graph import build_graph
from invoice_pipeline.state import initial_state

ROOT = Path(__file__).resolve().parents[1]
INVOICES = ROOT / "data" / "invoices"


def _review(recommendation: str = "approve", concern: str = "low") -> dict:
    return {
        "recommendation": recommendation,
        "reasoning": "Reviewed against normal plant replenishment.",
        "rules": [
            {"id": rule_id, "concern": concern, "assessment": "No extra commercial concern."}
            for rule_id in range(15, 25)
        ],
        "unresolved_questions": [],
    }


def _critique() -> dict:
    return {"revise": False, "contradictions": [], "notes": "Consistent with the controls."}


@pytest.fixture
def isolated_output(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_DB", str(tmp_path / "audit.db"))
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    yield tmp_path
    set_json_override(None)


def test_structured_json_invoice_ties_and_matches_master(isolated_output):
    path = INVOICES / "invoice_1004.json"
    text, _ = read_document(path)
    invoice = canonicalize(parse_structured(path, text))
    pending, issues = basic_validation(invoice)
    assert pending == []
    assert issues == []
    assert invoice["vendor_name"] == "Precision Parts Ltd."
    assert invoice["total"] == 1890


def test_negative_quantity_is_an_integrity_issue():
    invoice = canonicalize(
        {
            "vendor_name": "",
            "invoice_number": "INV-1009",
            "invoice_date": "2026-01-15",
            "total": -250,
            "line_items": [{"description": "WidgetA", "quantity": -5, "unit_price": 250}],
        }
    )
    pending, issues = basic_validation(invoice)
    assert "vendor_name" in pending
    assert any(issue["code"] == "integrity" for issue in issues)


def test_stock_shortfall_overrides_an_approval(isolated_output):
    invoice = {
        "vendor_name": "Gadgets Co.",
        "invoice_number": "INV-1002",
        "total": 15000,
        "currency": "USD",
    }
    validation = {
        "vendor": {"matched": True, "vendor_id": 5002, "name": "Gadgets Co."},
        "lines": [
            {
                "description": "GadgetX",
                "matched": True,
                "item": "GadgetX",
                "item_id": 1607,
                "quantity": 20,
                "stock": 5,
                "master_unit_price": 750,
                "price_variance_pct": 0,
                "price_variance_amount": 0,
            }
        ],
    }
    findings = evaluate_rules(invoice, validation, [])
    decision, reason, override = decide(findings, _review("approve"), _critique())
    assert decision == "rejected"
    assert override is True
    assert "stock" in reason


def test_split_lines_are_summed_before_the_stock_check(isolated_output):
    invoice = {"vendor_name": "Atlas Industrial Supply", "invoice_number": "INV-1013", "total": 1000, "currency": "USD"}
    validation = {
        "vendor": {"matched": True, "vendor_id": 5012, "name": "Atlas Industrial Supply"},
        "lines": [
            {"description": "WidgetA", "matched": True, "item": "WidgetA", "item_id": 4303, "quantity": 15, "stock": 15, "master_unit_price": 250, "price_variance_pct": 0, "price_variance_amount": 0},
            {"description": "WidgetA", "matched": True, "item": "WidgetA", "item_id": 4303, "quantity": 7, "stock": 15, "master_unit_price": 250, "price_variance_pct": 0, "price_variance_amount": 0},
        ],
    }
    findings = evaluate_rules(invoice, validation, [])
    stock = next(item for item in findings if item["rule_id"] == 6)
    assert stock["severity"] == "critical"
    assert "22" in stock["message"]


def test_clean_controls_can_approve(isolated_output):
    invoice = {"vendor_name": "Widgets Inc.", "invoice_number": "INV-1001", "total": 5000, "currency": "USD", "payment_terms": "Net 15"}
    validation = {
        "vendor": {"matched": True, "vendor_id": 5001, "name": "Widgets Inc."},
        "lines": [
            {"description": "WidgetA", "matched": True, "item": "WidgetA", "item_id": 4303, "quantity": 10, "stock": 15, "master_unit_price": 250, "price_variance_pct": 0, "price_variance_amount": 0},
            {"description": "WidgetB", "matched": True, "item": "WidgetB", "item_id": 1096, "quantity": 5, "stock": 10, "master_unit_price": 500, "price_variance_pct": 0, "price_variance_amount": 0},
        ],
    }
    findings = evaluate_rules(invoice, validation, [])
    decision, _, override = decide(findings, _review(), _critique())
    assert decision == "approved"
    assert override is False


def _fake_grok(system: str, user: str) -> dict:
    if "critique" in system.lower():
        return _critique() | {"agrees_with_recommendation": True, "missed_rule_ids": []}
    if "VP reviewer" in system:
        return _review()
    if "invoice_1002" in user:
        return {
            "vendor_name": "Gadgets Co.",
            "invoice_number": "INV-1002",
            "invoice_date": "2026-01-30",
            "due_date": "2026-01-30",
            "currency": "USD",
            "subtotal": 15000,
            "tax": 0,
            "total": 15000,
            "payment_terms": "Net 30",
            "line_items": [{"description": "GadgetX", "quantity": 20, "unit_price": 750, "line_total": 15000}],
        }
    if "invoice_1009" in user:
        return {
            "vendor_name": "",
            "invoice_number": "INV-1009",
            "invoice_date": "2026-01-15",
            "total": -250,
            "currency": "USD",
            "line_items": [{"description": "WidgetA", "quantity": -5, "unit_price": 250}],
        }
    return {
        "vendor_name": "Widgets Inc.",
        "invoice_number": "INV-1001",
        "invoice_date": "2026-01-15",
        "due_date": "2026-02-01",
        "currency": "USD",
        "subtotal": 5000,
        "tax": 0,
        "total": 5000,
        "payment_terms": "Net 15",
        "line_items": [
            {"description": "WidgetA", "quantity": 10, "unit_price": 250, "line_total": 2500},
            {"description": "WidgetB", "quantity": 5, "unit_price": 500, "line_total": 2500},
        ],
    }


def _run(name: str) -> dict:
    set_json_override(_fake_grok)
    graph = build_graph()
    return graph.invoke(initial_state(str(INVOICES / name)), config={"recursion_limit": 40})


def test_clean_invoice_is_paid(isolated_output, capsys):
    result = _run("invoice_1001.txt")
    assert result["decision"] == "approved"
    assert result["payment_result"]["status"] == "success"
    assert "Paid 5000" in capsys.readouterr().out


def test_stock_mismatch_is_rejected_without_payment(isolated_output, capsys):
    result = _run("invoice_1002.txt")
    assert result["decision"] == "rejected"
    assert result["policy_override"] is True
    assert not result["payment_result"]
    assert "Paid" not in capsys.readouterr().out


def test_missing_vendor_goes_to_human_review(isolated_output):
    result = _run("invoice_1009.json")
    assert result["decision"] == "human_review"
    assert "vendor_name" in result["pending_fields"]
    assert not result["payment_result"]
