"""Tests for skill versioning logic (Section 08)"""
import pytest
import re


@pytest.mark.unit
def test_semver_pattern():
    """Test semantic versioning pattern matching"""
    pattern = r"^\d+\.\d+\.\d+$"
    assert re.match(pattern, "1.0.0")
    assert re.match(pattern, "2.3.15")
    assert not re.match(pattern, "1.0")
    assert not re.match(pattern, "v1.0.0")


@pytest.mark.unit
def test_version_comparison():
    """Test version comparison logic"""
    from packaging.version import Version

    assert Version("2.0.0") > Version("1.9.9")
    assert Version("1.1.0") > Version("1.0.9")
    assert Version("1.0.1") > Version("1.0.0")
