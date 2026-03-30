"""Tests for MCP monitoring — nginx config, health endpoint, and Prometheus metrics."""

import pytest


# ---------------------------------------------------------------------------
# Nginx Config
# ---------------------------------------------------------------------------

class TestNginxConfig:

    def test_nginx_has_mcp_location_block_with_proxy_buffering_off(self):
        """nginx has /api/v1/mcp/ location block with proxy_buffering off."""
        import os
        nginx_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..", "..", "nginx", "conf.d", "dev-host.conf"
        )
        # Normalize path
        nginx_path = os.path.normpath(nginx_path)
        with open(nginx_path) as f:
            content = f.read()

        # Check the location block exists
        assert "location ~ ^/api/v1/mcp/" in content
        # proxy_buffering off should appear after the MCP location
        mcp_idx = content.index("location ~ ^/api/v1/mcp/")
        # Find the next closing brace after MCP block
        block_end = content.index("}", mcp_idx)
        mcp_block = content[mcp_idx:block_end]
        assert "proxy_buffering off" in mcp_block
        assert "proxy_cache off" in mcp_block


# ---------------------------------------------------------------------------
# Health Endpoint
# ---------------------------------------------------------------------------

class TestHealthMcp:

    def test_health_mcp_returns_expected_fields(self):
        """health/mcp returns server count, active connections, stdio process count."""
        from app.services.mcp_metrics import get_mcp_health

        health = get_mcp_health()
        assert "server_count" in health
        assert "active_connections" in health
        assert "stdio_process_count" in health


# ---------------------------------------------------------------------------
# Prometheus Metrics
# ---------------------------------------------------------------------------

class TestPrometheusMetrics:

    def test_mcp_tool_call_duration_histogram_registered(self):
        """mcp_tool_call_duration_seconds histogram registered."""
        from app.services.mcp_metrics import mcp_tool_call_duration
        assert mcp_tool_call_duration is not None
        assert mcp_tool_call_duration._name == "mcp_tool_call_duration_seconds"

    def test_mcp_tool_call_errors_counter_registered(self):
        """mcp_tool_call_errors_total counter registered."""
        from app.services.mcp_metrics import mcp_tool_call_errors
        assert mcp_tool_call_errors is not None
        assert mcp_tool_call_errors._name == "mcp_tool_call_errors"
