"""Tests for the conditional_branch evaluation logic."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.agency_conditional_branch import (
    evaluate_context_check,
    evaluate_llm_classify,
    evaluate_rule_based,
)


# ── rule_based ────────────────────────────────────────────────────────────────


class TestRuleBasedEvaluation:
    def test_equals_operator(self):
        rules = [{"field": "$.status", "operator": "equals", "value": "hello", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"status": "hello"}))
        assert result == "n1"

    def test_contains_operator(self):
        rules = [{"field": "$.msg", "operator": "contains", "value": "world", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"msg": "hello world"}))
        assert result == "n1"

    def test_regex_operator(self):
        rules = [{"field": "$.id", "operator": "regex", "value": r"order-\d+", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"id": "order-12345"}))
        assert result == "n1"

    def test_gt_operator(self):
        rules = [{"field": "$.count", "operator": "gt", "value": "5", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"count": 10}))
        assert result == "n1"

    def test_lt_operator(self):
        rules = [{"field": "$.count", "operator": "lt", "value": "5", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"count": 3}))
        assert result == "n1"

    def test_gte_operator_boundary(self):
        rules = [{"field": "$.count", "operator": "gte", "value": "5", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"count": 5}))
        assert result == "n1"

    def test_lte_operator_boundary(self):
        rules = [{"field": "$.count", "operator": "lte", "value": "5", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"count": 5}))
        assert result == "n1"

    def test_exists_operator_present(self):
        rules = [{"field": "$.name", "operator": "exists", "value": "", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"name": "test"}))
        assert result == "n1"

    def test_exists_operator_absent(self):
        rules = [{"field": "$.name", "operator": "exists", "value": "", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"other": "val"}))
        assert result is None

    def test_no_rule_matches_returns_none(self):
        rules = [{"field": "$.status", "operator": "equals", "value": "yes", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"status": "no"}))
        assert result is None

    def test_first_matching_rule_wins(self):
        rules = [
            {"field": "$.x", "operator": "equals", "value": "a", "targetNodeId": "first"},
            {"field": "$.x", "operator": "equals", "value": "a", "targetNodeId": "second"},
        ]
        result = evaluate_rule_based(rules, json.dumps({"x": "a"}))
        assert result == "first"

    def test_nested_jsonpath(self):
        rules = [{"field": "$.result.status", "operator": "equals", "value": "ok", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"result": {"status": "ok"}}))
        assert result == "n1"

    def test_invalid_jsonpath_returns_none(self):
        rules = [{"field": "$.[invalid", "operator": "equals", "value": "ok", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, json.dumps({"status": "ok"}))
        assert result is None

    def test_non_json_output_uses_raw_string(self):
        rules = [{"field": "", "operator": "contains", "value": "hello", "targetNodeId": "n1"}]
        result = evaluate_rule_based(rules, "hello world")
        assert result == "n1"


# ── llm_classify ──────────────────────────────────────────────────────────────


class TestLlmClassify:
    @pytest.mark.asyncio
    async def test_calls_llm_and_maps_category(self):
        config = {
            "classificationLabel": "sentiment",
            "classificationDescription": "Classify the sentiment.",
            "categories": [
                {"label": "positive", "targetNodeId": "n1"},
                {"label": "negative", "targetNodeId": "n2"},
            ],
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "positive"}}],
        }

        with patch("app.services.agency_conditional_branch.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await evaluate_llm_classify(config, "I love this!", "http://localhost:8000", "token")
            assert result == "n1"

    @pytest.mark.asyncio
    async def test_falls_back_to_none_on_unrecognized_category(self):
        config = {
            "classificationLabel": "sentiment",
            "classificationDescription": "Classify.",
            "categories": [
                {"label": "positive", "targetNodeId": "n1"},
                {"label": "negative", "targetNodeId": "n2"},
            ],
        }
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "choices": [{"message": {"content": "neutral"}}],
        }

        with patch("app.services.agency_conditional_branch.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await evaluate_llm_classify(config, "meh", "http://localhost:8000", "token")
            assert result is None

    @pytest.mark.asyncio
    async def test_falls_back_to_none_on_llm_error(self):
        config = {
            "classificationLabel": "sentiment",
            "classificationDescription": "Classify.",
            "categories": [
                {"label": "positive", "targetNodeId": "n1"},
                {"label": "negative", "targetNodeId": "n2"},
            ],
        }

        with patch("app.services.agency_conditional_branch.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.post.side_effect = httpx.ConnectError("fail")
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client_cls.return_value = mock_client

            result = await evaluate_llm_classify(config, "test", "http://localhost:8000", "token")
            assert result is None


# ── context_check ─────────────────────────────────────────────────────────────


class TestContextCheck:
    @pytest.mark.asyncio
    async def test_reads_key_and_matches(self):
        config = {
            "contextKey": "status",
            "contextConditions": [
                {"operator": "equals", "value": "ready", "targetNodeId": "n1"},
            ],
        }
        mock_ctx = AsyncMock()
        mock_ctx.get.return_value = "ready"

        result = await evaluate_context_check(config, mock_ctx)
        assert result == "n1"
        mock_ctx.get.assert_called_once_with("status")

    @pytest.mark.asyncio
    async def test_falls_back_when_key_missing(self):
        config = {
            "contextKey": "status",
            "contextConditions": [
                {"operator": "equals", "value": "ready", "targetNodeId": "n1"},
            ],
        }
        mock_ctx = AsyncMock()
        mock_ctx.get.return_value = None

        result = await evaluate_context_check(config, mock_ctx)
        assert result is None

    @pytest.mark.asyncio
    async def test_falls_back_when_no_condition_matches(self):
        config = {
            "contextKey": "status",
            "contextConditions": [
                {"operator": "equals", "value": "ready", "targetNodeId": "n1"},
            ],
        }
        mock_ctx = AsyncMock()
        mock_ctx.get.return_value = "pending"

        result = await evaluate_context_check(config, mock_ctx)
        assert result is None
