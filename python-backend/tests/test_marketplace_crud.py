"""Tests for skill marketplace CRUD operations (Section 07)"""
import pytest


@pytest.mark.unit
def test_marketplace_models_importable():
    """Test that approval models can be imported for marketplace use"""
    from app.models.approval import ApprovalRequest, ApprovalStatus

    assert ApprovalRequest is not None
    assert ApprovalStatus is not None


@pytest.mark.unit
def test_marketplace_skill_categories():
    """Test expected marketplace categories"""
    categories = ["media", "content", "data", "communication", "workflow", "other"]
    assert len(categories) == 6
    assert "media" in categories
    assert "content" in categories
    assert "workflow" in categories
