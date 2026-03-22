"""
Conditional Branch evaluation logic for the Agency orchestrator.

Three evaluation modes:
  - rule_based: JSONPath field extraction + operator comparison
  - llm_classify: LLM-based classification into categories
  - context_check: AgencyRunContext key lookup + operator comparison

All functions return a targetNodeId (str) or None (fall through to default).
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

import httpx
import structlog

if TYPE_CHECKING:
    from app.services.agency_run_context import AgencyRunContext

logger = structlog.get_logger(__name__)

# ── Shared operator comparison ────────────────────────────────────────────────


def _compare(operator: str, field_value: Any, rule_value: str) -> bool:
    """Apply a comparison operator. Returns True if match."""
    if operator == "exists":
        return field_value is not None

    if field_value is None:
        return False

    str_val = str(field_value)

    if operator == "equals":
        return str_val == rule_value
    if operator == "contains":
        return rule_value in str_val
    if operator == "regex":
        if len(rule_value) > 200:
            return False
        try:
            return bool(re.search(rule_value, str_val[:10000]))
        except re.error:
            return False

    # Numeric operators
    try:
        num_field = float(str_val)
        num_rule = float(rule_value)
    except (ValueError, TypeError):
        return False

    if operator == "gt":
        return num_field > num_rule
    if operator == "lt":
        return num_field < num_rule
    if operator == "gte":
        return num_field >= num_rule
    if operator == "lte":
        return num_field <= num_rule

    return False


# ── JSONPath extraction ───────────────────────────────────────────────────────


def _extract_jsonpath(data: Any, path: str) -> Any:
    """Extract a value from data using JSONPath. Returns None on failure."""
    try:
        from jsonpath_ng import parse as jp_parse

        expr = jp_parse(path)
        matches = expr.find(data)
        if matches:
            return matches[0].value
        return None
    except Exception:
        return None


# ── Rule-based evaluation ─────────────────────────────────────────────────────


def evaluate_rule_based(
    rules: list[dict],
    previous_output: str,
) -> str | None:
    """Evaluate rules in order against previous node output. First match wins."""
    # Parse previous output as JSON if possible
    data: Any
    try:
        data = json.loads(previous_output)
    except (json.JSONDecodeError, TypeError):
        data = previous_output

    for rule in rules:
        field_path = rule.get("field", "")
        operator = rule.get("operator", "equals")
        rule_value = rule.get("value", "")
        target = rule.get("targetNodeId")

        field_value = _extract_jsonpath(data, field_path) if field_path.startswith("$") else data
        if _compare(operator, field_value, rule_value):
            return target

    return None


# ── LLM classify evaluation ──────────────────────────────────────────────────


async def evaluate_llm_classify(
    config: dict,
    previous_output: str,
    llm_gateway_url: str,
    user_token: str,
) -> str | None:
    """Classify the previous output using an LLM and return the matching category's targetNodeId."""
    categories = config.get("categories", [])
    if len(categories) < 2:
        return None

    label = config.get("classificationLabel", "content")
    description = config.get("classificationDescription", "Classify the following content.")

    category_labels = [c["label"] for c in categories]
    category_list = "\n".join(f"- {lbl}" for lbl in category_labels)

    system_message = (
        f"You are a classifier for '{label}'. {description}\n\n"
        f"Valid categories:\n{category_list}\n\n"
        "Respond with ONLY the category label that best matches. "
        "Do not include any other text."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{llm_gateway_url}/api/llm/chat",
                json={
                    "messages": [
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": previous_output[:2000]},
                    ],
                },
                headers={"Authorization": f"Bearer {user_token}"},
            )
            resp.raise_for_status()
            body = resp.json()

        llm_text = (
            body.get("choices", [{}])[0].get("message", {}).get("content", "")
            or body.get("content", "")
            or ""
        ).strip()

        # Case-insensitive match
        for cat in categories:
            if cat["label"].strip().lower() == llm_text.lower():
                return cat.get("targetNodeId")

        logger.warning(
            "conditional_branch_llm_no_match",
            llm_response=llm_text[:100],
            valid_labels=category_labels,
        )
        return None
    except Exception as exc:
        logger.error("conditional_branch_llm_error", error=str(exc))
        return None


# ── Context check evaluation ─────────────────────────────────────────────────


async def evaluate_context_check(
    config: dict,
    context: AgencyRunContext,
) -> str | None:
    """Read a context key and evaluate conditions against it."""
    context_key = config.get("contextKey", "")
    if not context_key:
        return None

    value = await context.get(context_key)
    conditions = config.get("contextConditions", [])

    for cond in conditions:
        operator = cond.get("operator", "equals")
        cond_value = cond.get("value", "")
        target = cond.get("targetNodeId")
        if _compare(operator, value, cond_value):
            return target

    return None
