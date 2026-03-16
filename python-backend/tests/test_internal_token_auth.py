"""Tests for internal token authentication pattern.

Verifies that LLMGatewayClient and internal API calls use
X-Internal-Token instead of Bearer JWT.
"""

import inspect


def test_llm_gateway_client_builds_internal_token_header():
    """LLMGatewayClient._build_headers must include X-Internal-Token."""
    from app.services.llm_gateway_client import LLMGatewayClient

    client = LLMGatewayClient(
        base_url="http://test:3000",
        token="test-token-12345",
        timeout=10,
        max_retries=0,
    )
    headers = client._build_headers(user_id=42, tenant_id="t1")

    assert headers["X-Internal-Token"] == "test-token-12345"
    assert headers["X-User-Id"] == "42"
    assert headers["X-Tenant-Id"] == "t1"
    assert "Authorization" not in headers, "Bearer auth found in internal headers"


def test_llm_gateway_client_no_bearer_auth():
    """LLMGatewayClient._build_headers must not construct Authorization: Bearer."""
    import pathlib
    from app.services.llm_gateway_client import LLMGatewayClient

    source_path = pathlib.Path(inspect.getfile(LLMGatewayClient)).resolve()
    source = source_path.read_text()

    # Check actual code lines (skip comments/docstrings)
    for line in source.split("\n"):
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'"):
            continue
        assert '"Authorization"' not in stripped, f"Authorization header in code: {stripped}"


def test_llm_gateway_chat_completion_accepts_max_tokens():
    """chat_completion must accept max_tokens parameter."""
    from app.services.llm_gateway_client import LLMGatewayClient

    sig = inspect.signature(LLMGatewayClient.chat_completion)
    assert "max_tokens" in sig.parameters, "max_tokens missing from chat_completion"


def test_no_user_jwt_in_task_files():
    """No Celery task file should reference user_jwt in function signatures."""
    import pathlib

    tasks_dir = pathlib.Path(__file__).resolve().parent.parent / "app" / "tasks"

    for task_file in tasks_dir.glob("*.py"):
        if task_file.name.startswith("_"):
            continue
        source = task_file.read_text()
        # Check for user_jwt as a parameter (not in comments or strings)
        lines = source.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            # Skip comments and docstrings
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("'"):
                continue
            # Check for user_jwt as a parameter definition
            if "user_jwt:" in stripped and "str" in stripped:
                assert False, f"user_jwt parameter found in {task_file.name}:{i}: {stripped}"
