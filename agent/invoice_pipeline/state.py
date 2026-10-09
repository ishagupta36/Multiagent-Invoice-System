"""Shared pipeline state."""

from __future__ import annotations

from typing import Annotated, TypedDict


def extend_events(left: list | None, right: list | None) -> list:
    return (left or []) + (right or [])


def event(agent: str, message: str, **data) -> dict:
    payload = {"agent": agent, "message": message}
    if data:
        payload["data"] = data
    return payload


class PipelineState(TypedDict, total=False):
    invoice_path: str
    raw_text: str
    document_type: str
    invoice: dict
    extraction_issues: list
    pending_fields: list
    extraction_attempts: int
    validation_report: dict
    findings: list
    commercial_review: dict
    critique: dict
    reflection_count: int
    decision: str
    decision_reason: str
    policy_override: bool
    payment_result: dict
    fatal: bool
    events: Annotated[list, extend_events]
    error: str


def initial_state(invoice_path: str) -> PipelineState:
    return {
        "invoice_path": invoice_path,
        "raw_text": "",
        "document_type": "",
        "invoice": {},
        "extraction_issues": [],
        "pending_fields": [],
        "extraction_attempts": 0,
        "validation_report": {},
        "findings": [],
        "commercial_review": {},
        "critique": {},
        "reflection_count": 0,
        "decision": "",
        "decision_reason": "",
        "policy_override": False,
        "payment_result": {},
        "fatal": False,
        "events": [],
        "error": "",
    }
