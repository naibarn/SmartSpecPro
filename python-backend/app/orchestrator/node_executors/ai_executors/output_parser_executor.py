"""Output Parser Executor - Parse and validate LLM outputs."""

import json
import logging
import re
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class OutputParserExecutor:
    """
    Parse and validate LLM outputs.

    Parsers:
    - json: Extract and parse JSON
    - regex: Extract with regex pattern
    - list: Parse numbered/bulleted lists
    - key_value: Parse key: value format
    """

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Parse LLM output."""
        text = data.inputs.get("text", "")
        parser_type = data.inputs.get("parser", "json")
        schema = data.inputs.get("schema")  # For validation

        if parser_type == "json":
            result = self._parse_json(text)
        elif parser_type == "regex":
            pattern = data.inputs.get("pattern", "")
            result = self._parse_regex(text, pattern)
        elif parser_type == "list":
            result = self._parse_list(text)
        elif parser_type == "key_value":
            result = self._parse_key_value(text)
        else:
            raise ValueError(f"Unknown parser: {parser_type}")

        # Validate against schema if provided
        if schema:
            is_valid, errors = self._validate_schema(result, schema)
            return {
                "parsed": result,
                "valid": is_valid,
                "validation_errors": errors,
            }

        return {"parsed": result}

    def _parse_json(self, text: str) -> Any:
        """Extract and parse JSON from text."""
        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find JSON in code blocks
        json_match = re.search(
            r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON object/array
        json_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        raise ValueError("Could not parse JSON from text")

    def _parse_regex(self, text: str, pattern: str) -> list:
        """Extract with regex pattern."""
        return re.findall(pattern, text)

    def _parse_list(self, text: str) -> list:
        """Parse numbered or bulleted lists."""
        lines = text.split("\n")
        items = []

        for line in lines:
            # Match: "1. item" or "- item" or "* item"
            match = re.match(r"^[\s]*(?:\d+[.\)]\s+|[-*]\s+)(.+)$", line)
            if match:
                items.append(match.group(1).strip())

        return items

    def _parse_key_value(self, text: str) -> dict:
        """Parse key: value format."""
        result = {}
        lines = text.split("\n")

        for line in lines:
            if ":" in line:
                key, value = line.split(":", 1)
                result[key.strip()] = value.strip()

        return result

    def _validate_schema(self, result: Any, schema: dict) -> tuple[bool, list]:
        """Validate result against schema (placeholder)."""
        # TODO: Implement JSON Schema validation
        return True, []
