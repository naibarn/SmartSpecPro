"""Tests for agency_data_transform — data transform functions."""

import json

import pytest

from app.services.agency_data_transform import (
    apply_filter,
    apply_jsonpath,
    apply_template,
    execute_data_transform,
)


@pytest.mark.unit
@pytest.mark.agency
class TestApplyJsonpath:
    def test_extracts_correct_fields(self):
        data = json.dumps({"results": [{"title": "A"}, {"title": "B"}]})
        result = apply_jsonpath(data, "$.results[*].title")
        parsed = json.loads(result)
        assert parsed == ["A", "B"]

    def test_handles_invalid_expression(self):
        data = json.dumps({"a": 1})
        result = apply_jsonpath(data, "$.[[[[")
        assert "Error" in result

    def test_handles_non_json_input(self):
        result = apply_jsonpath("not json", "$.title")
        assert "Error" in result
        assert "not valid JSON" in result

    def test_rejects_long_expression(self):
        data = json.dumps({"a": 1})
        result = apply_jsonpath(data, "$." + "a" * 600)
        assert "exceeds" in result


@pytest.mark.unit
@pytest.mark.agency
class TestApplyTemplate:
    def test_renders_with_html_escaping(self):
        data = json.dumps({"title": "<script>alert(1)</script>", "summary": "Safe text"})
        result = apply_template(data, "Title: {{title}}\nSummary: {{summary}}")
        assert "&lt;script&gt;" in result
        assert "Safe text" in result

    def test_handles_non_json_input(self):
        result = apply_template("not json", "{{foo}}")
        assert "Error" in result

    def test_handles_non_dict_input(self):
        result = apply_template(json.dumps([1, 2, 3]), "{{foo}}")
        assert "Error" in result
        assert "JSON object" in result


@pytest.mark.unit
@pytest.mark.agency
class TestApplyFilter:
    def test_filter_gt_operator(self):
        data = json.dumps([
            {"name": "A", "score": 0.9},
            {"name": "B", "score": 0.5},
            {"name": "C", "score": 0.85},
        ])
        condition = {"field": "score", "operator": "gt", "value": "0.8"}
        result = apply_filter(data, condition)
        parsed = json.loads(result)
        names = [item["name"] for item in parsed]
        assert names == ["A", "C"]

    def test_filter_equals_operator(self):
        data = json.dumps([{"status": "done"}, {"status": "pending"}])
        condition = {"field": "status", "operator": "equals", "value": "done"}
        result = apply_filter(data, condition)
        parsed = json.loads(result)
        assert len(parsed) == 1
        assert parsed[0]["status"] == "done"

    def test_filter_contains_operator(self):
        data = json.dumps([{"text": "hello world"}, {"text": "goodbye"}])
        condition = {"field": "text", "operator": "contains", "value": "hello"}
        result = apply_filter(data, condition)
        parsed = json.loads(result)
        assert len(parsed) == 1
        assert "hello" in parsed[0]["text"]

    def test_filter_lt_operator(self):
        data = json.dumps([{"val": 10}, {"val": 20}, {"val": 5}])
        condition = {"field": "val", "operator": "lt", "value": "15"}
        result = apply_filter(data, condition)
        parsed = json.loads(result)
        assert len(parsed) == 2

    def test_handles_non_json_input(self):
        result = apply_filter("not json", {"field": "x", "operator": "equals", "value": "1"})
        assert "Error" in result

    def test_handles_non_array_input(self):
        result = apply_filter(json.dumps({"a": 1}), {"field": "a", "operator": "equals", "value": "1"})
        assert "Error" in result


@pytest.mark.unit
@pytest.mark.agency
class TestExecuteDataTransform:
    def test_dispatches_to_jsonpath(self):
        data = json.dumps({"title": "Hello"})
        config = {"transformMode": "jsonpath", "jsonpathExpression": "$.title"}
        result = execute_data_transform(data, config)
        parsed = json.loads(result)
        assert parsed == ["Hello"]

    def test_dispatches_to_template(self):
        data = json.dumps({"name": "World"})
        config = {"transformMode": "template", "template": "Hello, {{name}}!"}
        result = execute_data_transform(data, config)
        assert result == "Hello, World!"

    def test_dispatches_to_filter(self):
        data = json.dumps([{"x": 1}, {"x": 2}])
        config = {
            "transformMode": "filter",
            "filterCondition": {"field": "x", "operator": "gt", "value": "1"},
        }
        result = execute_data_transform(data, config)
        parsed = json.loads(result)
        assert len(parsed) == 1

    def test_unknown_mode(self):
        result = execute_data_transform("{}", {"transformMode": "invalid"})
        assert "Error" in result
        assert "Unknown" in result

    def test_missing_jsonpath_expression(self):
        result = execute_data_transform("{}", {"transformMode": "jsonpath"})
        assert "Error" in result

    def test_missing_template(self):
        result = execute_data_transform("{}", {"transformMode": "template"})
        assert "Error" in result

    def test_missing_filter_field(self):
        result = execute_data_transform("[]", {"transformMode": "filter", "filterCondition": {}})
        assert "Error" in result

    def test_stores_output_key_in_context(self):
        """Test that execute_data_transform returns data correctly for context storage."""
        data = json.dumps({"val": 42})
        config = {
            "transformMode": "jsonpath",
            "jsonpathExpression": "$.val",
            "outputKey": "transformed_data",
        }
        result = execute_data_transform(data, config)
        parsed = json.loads(result)
        assert parsed == [42]
