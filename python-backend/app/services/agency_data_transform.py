"""
agency_data_transform — Data transform functions for agency graph data_transform nodes.

Supports three transform modes:
  - jsonpath: Extract fields using JSONPath expressions (jsonpath_ng)
  - template: Render Mustache templates with HTML escaping (pystache)
  - filter:   Filter JSON arrays by field conditions
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from jsonpath_ng import parse as jsonpath_parse
import pystache

logger = structlog.get_logger(__name__)

MAX_JSONPATH_LENGTH = 500


def apply_jsonpath(data_str: str, expression: str) -> str:
    """Parse data_str as JSON, apply jsonpath_ng expression, return JSON string of matches.

    On parse error or invalid expression, return a descriptive error string.
    """
    if len(expression) > MAX_JSONPATH_LENGTH:
        return f"Error: JSONPath expression exceeds {MAX_JSONPATH_LENGTH} character limit"

    try:
        data = json.loads(data_str)
    except (json.JSONDecodeError, TypeError):
        return "Error: Input is not valid JSON"

    try:
        expr = jsonpath_parse(expression)
        matches = [match.value for match in expr.find(data)]
        return json.dumps(matches)
    except Exception as e:
        return f"Error: Invalid JSONPath expression — {str(e)[:200]}"


def apply_template(data_str: str, template: str) -> str:
    """Parse data_str as JSON dict, render Mustache template with HTML escaping.

    HTML-escapes all interpolated values to prevent injection.
    """
    try:
        data = json.loads(data_str)
    except (json.JSONDecodeError, TypeError):
        return "Error: Input is not valid JSON"

    if not isinstance(data, dict):
        return "Error: Template mode requires a JSON object as input"

    try:
        # SECURITY: Replace triple-mustache {{{ }}} with double {{ }} to prevent
        # unescaped HTML injection. Triple-mustache bypasses pystache's escape function.
        safe_template = template.replace("{{{", "{{").replace("}}}", "}}")
        renderer = pystache.Renderer(escape=lambda u: _html_escape(str(u)))
        return renderer.render(safe_template, data)
    except Exception as e:
        return f"Error: Template rendering failed — {str(e)[:200]}"


def _html_escape(s: str) -> str:
    """Escape HTML special characters."""
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


def apply_filter(data_str: str, condition: dict[str, Any]) -> str:
    """Parse data_str as JSON array, filter items by condition.

    condition: { "field": str, "operator": "gt"|"lt"|"equals"|"contains", "value": str }
    Returns JSON string of filtered array.
    """
    try:
        data = json.loads(data_str)
    except (json.JSONDecodeError, TypeError):
        return "Error: Input is not valid JSON"

    if not isinstance(data, list):
        return "Error: Filter mode requires a JSON array as input"

    # Check if all items are non-dict (would silently produce empty result)
    if data and all(not isinstance(item, dict) for item in data):
        return "Error: Filter requires an array of objects; received primitive values"

    field = condition.get("field", "")
    operator = condition.get("operator", "equals")
    compare_value = condition.get("value", "")

    filtered: list[Any] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        item_value = item.get(field)
        if item_value is None:
            continue

        try:
            if operator == "equals":
                if str(item_value) == str(compare_value):
                    filtered.append(item)
            elif operator == "contains":
                if str(compare_value) in str(item_value):
                    filtered.append(item)
            elif operator == "gt":
                if float(item_value) > float(compare_value):
                    filtered.append(item)
            elif operator == "lt":
                if float(item_value) < float(compare_value):
                    filtered.append(item)
        except (ValueError, TypeError):
            continue

    return json.dumps(filtered)


def execute_data_transform(input_data: str, config: dict[str, Any]) -> str:
    """Dispatch to the correct transform function based on config['transformMode']."""
    mode = config.get("transformMode", "")

    if mode == "jsonpath":
        expression = config.get("jsonpathExpression", "")
        if not expression:
            return "Error: JSONPath expression is required"
        return apply_jsonpath(input_data, expression)

    elif mode == "template":
        template = config.get("template", "")
        if not template:
            return "Error: Template is required"
        return apply_template(input_data, template)

    elif mode == "filter":
        condition = config.get("filterCondition", {})
        if not condition.get("field"):
            return "Error: Filter condition requires a field"
        return apply_filter(input_data, condition)

    else:
        return f"Error: Unknown transform mode '{mode}'"
