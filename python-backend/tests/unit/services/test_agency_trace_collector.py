"""Tests for agency_trace_collector.py — TraceCollector and secret scrubbing."""

import asyncio
import time

import pytest

from app.services.agency_trace_collector import (
    TraceCollector,
    scrub_secrets,
)


@pytest.mark.unit
class TestScrubSecrets:
    def test_none_input(self):
        assert scrub_secrets(None) is None

    def test_empty_input(self):
        assert scrub_secrets("") == ""

    def test_openai_key(self):
        text = "Using key sk-example-redacted"
        result = scrub_secrets(text)
        assert "sk-abc123" not in result
        assert "[REDACTED]" in result

    def test_bearer_token(self):
        text = "Header: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload"
        result = scrub_secrets(text)
        assert "eyJhbGciOi" not in result
        assert "[REDACTED]" in result

    def test_authorization_header(self):
        text = "Authorization: Basic dXNlcjpwYXNz"
        result = scrub_secrets(text)
        assert "dXNlcjpwYXNz" not in result
        assert "[REDACTED]" in result

    def test_generic_key_pattern(self):
        text = "api_key=key-abcdefghij0123456789ab"
        result = scrub_secrets(text)
        assert "key-abcdefghij" not in result
        assert "[REDACTED]" in result

    def test_connection_string(self):
        text = "db: postgresql://user:pass@host:5432/mydb"
        result = scrub_secrets(text)
        assert "postgresql://" not in result
        assert "[REDACTED]" in result

    def test_no_secrets_unchanged(self):
        text = "This is a normal output with no secrets."
        assert scrub_secrets(text) == text


@pytest.mark.unit
class TestTraceCollector:
    def test_builds_correct_span_hierarchy(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        agent_span = tc.start_span(name="agent:Researcher", type="agent_turn")
        tool_span = tc.start_span(
            name="tool:web-search", type="tool_call", parent_span_id=agent_span
        )

        tc.end_span(tool_span, output="results...", tokens=150, cost=0.002)
        tc.end_span(agent_span, output="summary...", tokens=300, cost=0.005)

        summary = tc.get_trace_summary()
        spans = summary["trace"]["spans"]
        assert len(spans) == 2

        tool = next(s for s in spans if s["type"] == "tool_call")
        agent = next(s for s in spans if s["type"] == "agent_turn")
        assert tool["parentSpanId"] == agent["spanId"]
        assert tool["durationMs"] is not None
        assert tool["durationMs"] >= 0
        assert agent["durationMs"] is not None

    def test_secret_scrubbing_on_end_span(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        span_id = tc.start_span(name="agent:test", type="agent_turn")
        tc.end_span(
            span_id,
            output="Key is sk-example-redacted and Bearer eyJhbGciOi.token",
        )

        summary = tc.get_trace_summary()
        output = summary["trace"]["spans"][0]["output"]
        assert "sk-abc123" not in output
        assert "eyJhbGciOi" not in output
        assert "[REDACTED]" in output

    def test_truncates_tool_output_at_1000_chars(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        span_id = tc.start_span(name="tool:big", type="tool_call")
        tc.end_span(span_id, output="x" * 2000)

        span = tc.get_trace_summary()["trace"]["spans"][0]
        assert len(span["output"]) <= 1003  # 1000 + "..."

    def test_truncates_agent_output_at_2000_chars(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        span_id = tc.start_span(name="agent:big", type="agent_turn")
        tc.end_span(span_id, output="y" * 5000)

        span = tc.get_trace_summary()["trace"]["spans"][0]
        assert len(span["output"]) <= 2003

    def test_get_trace_summary_returns_correct_structure(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1", user_id=42)
        agent_span = tc.start_span(name="agent:A", type="agent_turn")
        tool_span = tc.start_span(
            name="tool:T", type="tool_call", parent_span_id=agent_span
        )
        tc.end_span(tool_span, tokens=100, cost=0.001)
        tc.end_span(agent_span, tokens=200, cost=0.003)
        tc.set_status("completed")

        summary = tc.get_trace_summary()
        assert summary["runId"] == "r1"
        assert summary["agencyId"] == "a1"
        assert summary["tenantId"] == "t1"
        assert summary["createdBy"] == 42
        assert summary["status"] == "completed"
        assert summary["totalTokens"] == 300
        assert abs(summary["totalCost"] - 0.004) < 1e-6
        assert summary["durationMs"] >= 0
        assert summary["trace"]["version"] == 1
        assert len(summary["trace"]["spans"]) == 2

    def test_end_span_with_error(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        span_id = tc.start_span(name="agent:fail", type="agent_turn")
        tc.end_span(span_id, error="Something went wrong")

        span = tc.get_trace_summary()["trace"]["spans"][0]
        assert span["error"] == "Something went wrong"

    def test_end_span_unknown_id_no_error(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        # Should not raise, just log warning
        tc.end_span("nonexistent-id", output="test")

    def test_set_status(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        tc.set_status("failed")
        assert tc.get_trace_summary()["status"] == "failed"

    def test_tool_calls_and_guardrails(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")
        span_id = tc.start_span(name="agent:A", type="agent_turn")
        tc.end_span(
            span_id,
            tool_calls=[{"toolId": "builtin-web-search", "name": "web_search", "durationMs": 800}],
            guardrails=[{"name": "pii_check", "passed": True, "durationMs": 5}],
        )

        span = tc.get_trace_summary()["trace"]["spans"][0]
        assert len(span["toolCalls"]) == 1
        assert span["toolCalls"][0]["toolId"] == "builtin-web-search"
        assert len(span["guardrails"]) == 1
        assert span["guardrails"][0]["passed"] is True


@pytest.mark.asyncio
@pytest.mark.unit
class TestTraceCollectorAsync:
    async def test_concurrent_spans_safely(self):
        tc = TraceCollector(run_id="r1", agency_id="a1", tenant_id="t1")

        async def create_and_end_span(idx: int) -> None:
            span_id = await tc.start_span_async(
                name=f"tool:concurrent-{idx}", type="tool_call"
            )
            await asyncio.sleep(0.01)  # simulate work
            await tc.end_span_async(span_id, output=f"result-{idx}", tokens=10)

        tasks = [create_and_end_span(i) for i in range(10)]
        await asyncio.gather(*tasks)

        summary = tc.get_trace_summary()
        assert len(summary["trace"]["spans"]) == 10
        assert summary["totalTokens"] == 100
