"""Integration tests for workflow node executors."""

import pytest
from app.orchestrator.node_executors.integration_executors.http_executor import HTTPExecutor
from app.orchestrator.node_executors.integration_executors.email_executor import EmailExecutor
from app.orchestrator.node_executors.flow_executors.delay_executor import DelayExecutor
from app.orchestrator.node_executors.data_executors.csv_parser_executor import CSVParserExecutor
from app.orchestrator.node_executors.data_executors.template_engine_executor import TemplateEngineExecutor
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData


@pytest.fixture
def execution_context():
    """Create a test execution context."""
    return ExecutionContext(
        tenant_id="test_tenant",
        user_id="test_user",
        execution_id="test_exec_123",
    )


@pytest.mark.asyncio
async def test_http_executor_blocked_localhost(execution_context):
    """Test that localhost is blocked by HTTP executor."""
    executor = HTTPExecutor()
    
    with pytest.raises(ValueError, match="not allowed"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                "url": "http://localhost:3000/api",
                "method": "GET"
            }),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_http_executor_blocked_private_ip(execution_context):
    """Test that private IPs are blocked."""
    executor = HTTPExecutor()
    
    with pytest.raises(ValueError, match="not allowed"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                "url": "http://192.168.1.1/admin",
                "method": "GET"
            }),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_http_executor_invalid_scheme(execution_context):
    """Test that non-HTTP schemes are blocked."""
    executor = HTTPExecutor()
    
    with pytest.raises(ValueError, match="Invalid URL scheme"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                "url": "ftp://example.com/file.txt",
                "method": "GET"
            }),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_email_executor_validation(execution_context):
    """Test email validation."""
    executor = EmailExecutor()
    
    # Invalid email format
    with pytest.raises(ValueError, match="Invalid"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                "to": "invalid-email",
                "subject": "Test",
                "body_text": "Test body"
            }),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_email_executor_missing_fields(execution_context):
    """Test email validation for missing fields."""
    executor = EmailExecutor()
    
    # Missing subject and body
    with pytest.raises(ValueError, match="subject or body"):
        await executor.execute(
            data=NodeExecutionData(inputs={
                "to": "test@example.com",
            }),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_delay_executor_limits(execution_context):
    """Test delay duration limits."""
    executor = DelayExecutor()
    
    # Too short
    with pytest.raises(ValueError, match="between"):
        await executor.execute(
            data=NodeExecutionData(inputs={"duration": 0.01}),
            context=execution_context
        )
    
    # Too long
    with pytest.raises(ValueError, match="between"):
        await executor.execute(
            data=NodeExecutionData(inputs={"duration": 100000}),
            context=execution_context
        )


@pytest.mark.asyncio
async def test_delay_executor_success(execution_context):
    """Test successful delay execution."""
    executor = DelayExecutor()
    
    result = await executor.execute(
        data=NodeExecutionData(inputs={"duration": 0.1}),
        context=execution_context
    )
    
    assert result["delayed_seconds"] == 0.1
    assert "started_at" in result
    assert "ended_at" in result


@pytest.mark.asyncio
async def test_csv_parser_detects_delimiter(execution_context):
    """Test CSV delimiter auto-detection."""
    executor = CSVParserExecutor()
    
    # Comma-separated
    csv_comma = "name,age\nJohn,30\nJane,25"
    delimiter = executor._detect_delimiter(csv_comma)
    assert delimiter == ","
    
    # Semicolon-separated
    csv_semicolon = "name;age\nJohn;30\nJane;25"
    delimiter = executor._detect_delimiter(csv_semicolon)
    assert delimiter == ";"


@pytest.mark.asyncio
async def test_csv_parser_type_inference(execution_context):
    """Test CSV type inference."""
    executor = CSVParserExecutor()
    
    # Integer
    assert executor._infer_type("42") == 42
    
    # Float
    assert executor._infer_type("3.14") == 3.14
    
    # Boolean
    assert executor._infer_type("true") is True
    assert executor._infer_type("false") is False
    assert executor._infer_type("yes") is True
    assert executor._infer_type("no") is False
    
    # String
    assert executor._infer_type("hello") == "hello"
    
    # Empty
    assert executor._infer_type("") is None


@pytest.mark.asyncio
async def test_template_engine_mustache(execution_context):
    """Test Mustache template rendering."""
    executor = TemplateEngineExecutor()
    
    result = executor._render_mustache(
        "Hello {{name}}!",
        {"name": "World"}
    )
    assert result == "Hello World!"


@pytest.mark.asyncio
async def test_template_engine_fstring(execution_context):
    """Test f-string template rendering."""
    executor = TemplateEngineExecutor()
    
    result = executor._render_fstring(
        "Hello {name}!",
        {"name": "World"}
    )
    assert result == "Hello World!"


@pytest.mark.asyncio
async def test_template_engine_missing_variable(execution_context):
    """Test template with missing variable."""
    executor = TemplateEngineExecutor()
    
    with pytest.raises(ValueError, match="Missing"):
        executor._render_fstring(
            "Hello {name}!",
            {}  # Missing 'name'
        )
