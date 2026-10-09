"""LangGraph orchestration for the four invoice agents."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from invoice_pipeline.agents.approver import (
    commercial_review_node,
    critique_node,
    decide_node,
    route_after_critique,
    route_after_decide,
)
from invoice_pipeline.agents.extractor import extract_node, route_after_extract
from invoice_pipeline.agents.payment import finalize_node, human_review_node, pay_node, reject_node
from invoice_pipeline.agents.validator import route_after_validate, validate_node
from invoice_pipeline.state import PipelineState


def build_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("extract", extract_node)
    graph.add_node("validate", validate_node)
    graph.add_node("commercial_review", commercial_review_node)
    graph.add_node("critique", critique_node)
    graph.add_node("decide", decide_node)
    graph.add_node("pay", pay_node)
    graph.add_node("human_review", human_review_node)
    graph.add_node("reject", reject_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "extract")
    graph.add_conditional_edges(
        "extract",
        route_after_extract,
        {"extract": "extract", "validate": "validate", "human_review": "human_review"},
    )
    graph.add_conditional_edges(
        "validate",
        route_after_validate,
        {"extract": "extract", "validate": "validate", "human_review": "human_review", "commercial_review": "commercial_review"},
    )
    graph.add_edge("commercial_review", "critique")
    graph.add_conditional_edges(
        "critique",
        route_after_critique,
        {"commercial_review": "commercial_review", "decide": "decide"},
    )
    graph.add_conditional_edges(
        "decide",
        route_after_decide,
        {"pay": "pay", "human_review": "human_review", "reject": "reject"},
    )
    graph.add_edge("pay", "finalize")
    graph.add_edge("human_review", "finalize")
    graph.add_edge("reject", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()
