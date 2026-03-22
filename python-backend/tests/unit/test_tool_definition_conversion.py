"""Tests for tool_config_to_function conversion."""

from app.services.react_executor import tool_config_to_function


def test_tool_config_to_function_basic():
    result = tool_config_to_function(
        tool_id="test-tool",
        description="A test",
        input_schema={"type": "object", "properties": {"q": {"type": "string"}}},
    )
    assert result["type"] == "function"
    assert result["function"]["name"] == "test-tool"
    assert result["function"]["description"] == "A test"


def test_tool_config_with_input_schema():
    schema = {"type": "object", "properties": {"q": {"type": "string"}}}
    result = tool_config_to_function("t", "d", schema)
    assert result["function"]["parameters"] == schema


def test_tool_config_without_schema():
    result = tool_config_to_function("t", "d", None)
    assert result["function"]["parameters"] == {"type": "object", "properties": {}}
