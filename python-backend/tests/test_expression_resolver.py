"""Tests for expression resolver."""
import pytest
from app.orchestrator.expression_resolver import ExpressionResolver


def test_expression_resolver_simple():
    """Test simple expression resolution."""
    resolver = ExpressionResolver()
    state = {"node1": {"output": {"text": "Hello"}}}
    result = resolver.resolve("Value: {{node1.output.text}}", state)
    assert result == "Value: Hello"


def test_expression_resolver_multiple():
    """Test multiple expressions in same string."""
    resolver = ExpressionResolver()
    state = {"node1": {"output": {"a": "X"}}, "node2": {"output": {"b": "Y"}}}
    result = resolver.resolve("{{node1.output.a}} and {{node2.output.b}}", state)
    assert result == "X and Y"


def test_expression_resolver_missing_value():
    """Test expression with missing value returns original."""
    resolver = ExpressionResolver()
    state = {}
    result = resolver.resolve("Value: {{node1.output.text}}", state)
    assert "{{node1.output.text}}" in result
