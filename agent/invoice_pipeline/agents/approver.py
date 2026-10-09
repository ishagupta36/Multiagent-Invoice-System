"""Approver agent: deterministic VP controls, then a Grok critique loop."""

from __future__ import annotations

import json
import logging

from invoice_pipeline.config import MAX_REFLECTIONS
from invoice_pipeline.db import lookup_item, lookup_price, lookup_vendor
from invoice_pipeline.grok import GrokError, complete_json
from invoice_pipeline.policy import decide, evaluate_rules
from invoice_pipeline.state import event

logger = logging.getLogger("invoice_pipeline.approver")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_vendor",
            "description": "Look up a vendor in vendor.db by name.",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_item",
            "description": "Look up a material in inventory.db by the printed description.",
            "parameters": {
                "type": "object",
                "properties": {"description": {"type": "string"}},
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_price",
            "description": "Look up the master unit price in pricing.db by item_id.",
            "parameters": {
                "type": "object",
                "properties": {"item_id": {"type": "integer"}},
                "required": ["item_id"],
            },
        },
    },
]

COMMERCIAL_SYSTEM = """You are the VP reviewer for Acme Corp, a manufacturing company with about $10M revenue.
The deterministic controls have already run. Do not ignore them.
Judge the commercial questions below and return one JSON object:
{
  "recommendation": "approve" | "reject" | "human_review",
  "reasoning": "short paragraph",
  "rules": [{"id": 15, "concern": "low"|"medium"|"high"|"not_applicable", "assessment": "..."}],
  "unresolved_questions": ["..."]
}
Cover every rule id from 15 through 24 exactly once.
15 commercially reasonable spend
16 large quantity versus normal consumption
17 price exception with a plausible explanation
18 new or unfamiliar supplier
19 urgent or accelerated payment
20 advance or prepayment
21 premium freight or expedite
22 material spend spike by vendor or item
23 unusual purchase for this plant
24 weak justification despite clean data
Use low when the invoice is routine. Use medium or high only when a person should pause. Use not_applicable when the document has no signal.
You may call lookup_vendor, lookup_item, and lookup_price if you need to re-check a master record.
"""

CRITIQUE_SYSTEM = """You critique a VP invoice recommendation. Return one JSON object:
{
  "revise": true | false,
  "agrees_with_recommendation": true | false,
  "missed_rule_ids": [15],
  "contradictions": ["..."],
  "notes": "..."
}
Set revise to true when a rule from 15 through 24 is missing, when the recommendation contradicts a critical or elevated control, or when the reasoning approves spend that the controls say is unsupported.
Set revise to false when the recommendation is consistent with the controls.
"""


def commercial_review_node(state: dict) -> dict:
    findings = evaluate_rules(
        state.get("invoice") or {},
        state.get("validation_report") or {},
        state.get("extraction_issues") or [],
    )
    reflection_count = state.get("reflection_count", 0)
    critique = state.get("critique") or {}
    if critique.get("revise"):
        reflection_count += 1
    packet = {
        "invoice": state.get("invoice"),
        "validation": state.get("validation_report"),
        "deterministic_findings": findings,
        "prior_critique": critique if critique.get("revise") else None,
    }
    logger.info("Approver commercial review reflection=%s", reflection_count)
    try:
        review = complete_json(
            COMMERCIAL_SYSTEM,
            "Review this invoice.\n" + json.dumps(packet, default=str),
            tools=TOOLS,
            dispatch=_dispatch,
        )
    except GrokError as exc:
        review = {
            "recommendation": "human_review",
            "reasoning": str(exc),
            "rules": [
                {"id": rule_id, "concern": "not_applicable", "assessment": "Commercial review unavailable."}
                for rule_id in range(15, 25)
            ],
            "unresolved_questions": [str(exc)],
        }
    return {
        "findings": findings,
        "commercial_review": review,
        "reflection_count": reflection_count,
        "events": [
            event(
                "approver",
                f"Commercial review recommends {review.get('recommendation')}.",
                reflection=reflection_count,
            )
        ],
    }


def critique_node(state: dict) -> dict:
    packet = {
        "deterministic_findings": state.get("findings"),
        "commercial_review": state.get("commercial_review"),
    }
    logger.info("Approver critique pass %s", state.get("reflection_count", 0))
    try:
        critique = complete_json(CRITIQUE_SYSTEM, json.dumps(packet, default=str))
    except GrokError as exc:
        critique = {
            "revise": False,
            "agrees_with_recommendation": False,
            "missed_rule_ids": [],
            "contradictions": [str(exc)],
            "notes": str(exc),
        }
    revise = bool(critique.get("revise")) and state.get("reflection_count", 0) < MAX_REFLECTIONS
    critique["revise"] = revise
    return {
        "critique": critique,
        "events": [event("approver", "Critique requested a revision." if revise else "Critique accepted the recommendation.")],
    }


def decide_node(state: dict) -> dict:
    decision, reason, override = decide(
        state.get("findings") or [],
        state.get("commercial_review") or {},
        state.get("critique") or {},
    )
    logger.info("Approver decision=%s override=%s", decision, override)
    return {
        "decision": decision,
        "decision_reason": reason,
        "policy_override": override,
        "events": [event("approver", reason, override=override)],
    }


def route_after_critique(state: dict) -> str:
    if (state.get("critique") or {}).get("revise"):
        return "commercial_review"
    return "decide"


def route_after_decide(state: dict) -> str:
    if state.get("decision") == "approved":
        return "pay"
    if state.get("decision") == "human_review":
        return "human_review"
    return "reject"


def _dispatch(name: str, arguments: dict) -> dict:
    logger.info("Approver tool %s", name)
    if name == "lookup_vendor":
        return lookup_vendor(arguments.get("name"))
    if name == "lookup_item":
        return lookup_item(arguments.get("description"))
    if name == "lookup_price":
        return lookup_price(arguments.get("item_id"))
    return {"error": f"Unknown tool {name}"}
