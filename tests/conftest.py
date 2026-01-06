"""
Pytest configuration and shared fixtures for SmartSpec Autopilot tests.
"""

import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_dir():
    """Create a temporary directory for tests"""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield tmp_dir


@pytest.fixture
def temp_file():
    """Create a temporary file for tests"""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
        temp_path = f.name
    yield temp_path
    # Cleanup
    if os.path.exists(temp_path):
        os.unlink(temp_path)


@pytest.fixture
def sample_text_content():
    """Sample text content for testing"""
    return "Hello, World!\nThis is a test file.\n"


@pytest.fixture
def sample_json_content():
    """Sample JSON content for testing"""
    return '{"key": "value", "number": 42, "array": [1, 2, 3]}'


@pytest.fixture
def sample_unicode_content():
    """Sample Unicode content for testing"""
    return "สวัสดี 你好 مرحبا Hello"


@pytest.fixture
def mock_spec_id():
    """Mock spec ID for testing"""
    return "spec-core-001-authentication"


@pytest.fixture
def mock_workflow_name():
    """Mock workflow name for testing"""
    return "smartspec_generate_spec"

def pytest_configure(config):
    config.addinivalue_line("markers", "integration: Integration tests that require running services")
    config.addinivalue_line("markers", "e2e: End-to-end tests")
    config.addinivalue_line("markers", "slow: Slow tests")


def pytest_collection_modifyitems(config, items):
    # Skip integration/e2e unless explicitly enabled
    run_integration = os.getenv("RUN_INTEGRATION_TESTS", "0") == "1"
    if run_integration:
        return

    skip_integration = pytest.mark.skip(reason="integration tests disabled (set RUN_INTEGRATION_TESTS=1)")
    for item in items:
        if "integration" in item.keywords or "e2e" in item.keywords:
            item.add_marker(skip_integration)
