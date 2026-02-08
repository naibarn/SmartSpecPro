"""
Tests for skill API manifest validation integration.

Verifies that skill create/update endpoints properly validate manifests.
"""

import json
import pytest
from app.api.v1.skills import _extract_and_validate_manifest
from app.api.v1.admin_skills import (
    _extract_and_validate_manifest as admin_extract_and_validate,
)
from app.services.manifest_validator import ManifestValidationError
from fastapi import HTTPException


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def valid_manifest():
    """Valid skill manifest for testing."""
    return {
        "name": "test_skill",
        "version": "1.0.0",
        "description": "Test skill",
        "author": "Test Author",
        "nodes": [
            {"id": "node1", "type": "llm_call", "config": {"prompt": "Hello"}},
            {"id": "node2", "type": "format_text", "config": {"template": "Result: {0}"}},
        ],
        "edges": [{"from": "node1", "to": "node2"}],
        "inputs": {},
        "outputs": {},
    }


@pytest.fixture
def invalid_manifest_disallowed_tool():
    """Manifest with disallowed tool."""
    return {
        "name": "malicious_skill",
        "version": "1.0.0",
        "description": "Malicious skill",
        "author": "Attacker",
        "nodes": [
            {"id": "node1", "type": "execute_code", "config": {"code": "print('pwned')"}},
        ],
        "edges": [],
        "inputs": {},
        "outputs": {},
    }


@pytest.fixture
def invalid_manifest_circular_dep():
    """Manifest with circular dependency."""
    return {
        "name": "circular_skill",
        "version": "1.0.0",
        "description": "Circular dependency",
        "author": "Test",
        "nodes": [
            {"id": "node1", "type": "llm_call", "config": {}},
            {"id": "node2", "type": "llm_call", "config": {}},
        ],
        "edges": [{"from": "node1", "to": "node2"}, {"from": "node2", "to": "node1"}],
        "inputs": {},
        "outputs": {},
    }


# ============================================================================
# Skills API Validation Tests
# ============================================================================


def test_extract_valid_manifest_from_json(valid_manifest):
    """Valid manifest as JSON should pass validation."""
    content = json.dumps(valid_manifest)

    # Should not raise
    _extract_and_validate_manifest(content)


def test_extract_valid_manifest_from_yaml_frontmatter(valid_manifest):
    """Valid manifest in YAML frontmatter should pass validation."""
    import yaml

    frontmatter = {"manifest": valid_manifest}
    yaml_str = yaml.dump(frontmatter)
    content = f"---\n{yaml_str}---\n\n# Skill content here"

    # Should not raise
    _extract_and_validate_manifest(content)


def test_extract_no_manifest_passes():
    """Content without manifest should pass (no validation needed)."""
    content = "This is just regular skill content without a manifest."

    # Should not raise
    _extract_and_validate_manifest(content)


def test_extract_invalid_manifest_fails(invalid_manifest_disallowed_tool):
    """Invalid manifest should raise HTTPException."""
    content = json.dumps(invalid_manifest_disallowed_tool)

    with pytest.raises(HTTPException) as exc_info:
        _extract_and_validate_manifest(content)

    assert exc_info.value.status_code == 400
    assert "manifest validation failed" in str(exc_info.value.detail).lower()
    assert "disallowed tools" in str(exc_info.value.detail).lower()


def test_extract_circular_dependency_fails(invalid_manifest_circular_dep):
    """Manifest with circular dependency should fail validation."""
    content = json.dumps(invalid_manifest_circular_dep)

    with pytest.raises(HTTPException) as exc_info:
        _extract_and_validate_manifest(content)

    assert exc_info.value.status_code == 400
    assert "circular dependency" in str(exc_info.value.detail).lower()


# ============================================================================
# Admin Skills API Validation Tests
# ============================================================================


def test_admin_extract_valid_manifest(valid_manifest):
    """Admin endpoint should also validate manifests correctly."""
    content = json.dumps(valid_manifest)

    # Should not raise
    admin_extract_and_validate(content)


def test_admin_extract_invalid_manifest_fails(invalid_manifest_disallowed_tool):
    """Admin endpoint should reject invalid manifests."""
    content = json.dumps(invalid_manifest_disallowed_tool)

    with pytest.raises(HTTPException) as exc_info:
        admin_extract_and_validate(content)

    assert exc_info.value.status_code == 400
    assert "manifest validation failed" in str(exc_info.value.detail).lower()


# ============================================================================
# Edge Cases
# ============================================================================


def test_extract_malformed_json_passes():
    """Malformed JSON should be treated as non-manifest content (pass)."""
    content = '{"incomplete": json without closing brace'

    # Should not raise - just treated as regular content
    _extract_and_validate_manifest(content)


def test_extract_malformed_yaml_passes():
    """Malformed YAML should be treated as non-manifest content (pass)."""
    content = "---\ninvalid: yaml: structure:\n---\nContent"

    # Should not raise - YAML parse failure means no manifest to validate
    _extract_and_validate_manifest(content)


def test_extract_json_without_nodes_passes():
    """JSON that doesn't look like a manifest should pass."""
    content = json.dumps({"some": "data", "but": "not a manifest"})

    # Should not raise - doesn't have nodes/edges, so not a manifest
    _extract_and_validate_manifest(content)
