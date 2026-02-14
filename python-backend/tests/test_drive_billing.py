"""Tests for Drive billing formula functions."""

import pytest
from app.services.drive_billing import (
    calculate_drive_index_cost,
    calculate_mcp_read_cost,
    calculate_mcp_sheet_cost,
)


@pytest.mark.unit
class TestDriveBillingFormulas:
    """Pure function tests -- no async or DB needed."""

    def test_drive_index_cost_basic(self):
        assert calculate_drive_index_cost(chunk_count=7) == 14
        assert calculate_drive_index_cost(chunk_count=1) == 2

    def test_drive_index_cost_zero(self):
        assert calculate_drive_index_cost(chunk_count=0) == 0

    def test_drive_index_cost_negative(self):
        assert calculate_drive_index_cost(chunk_count=-1) == 0

    def test_drive_index_cost_custom_rate(self):
        assert calculate_drive_index_cost(chunk_count=5, cost_per_chunk=3) == 15

    def test_mcp_read_cost_small(self):
        assert calculate_mcp_read_cost(text_length=100) == 1

    def test_mcp_read_cost_boundary(self):
        assert calculate_mcp_read_cost(text_length=2000) == 1

    def test_mcp_read_cost_over_boundary(self):
        assert calculate_mcp_read_cost(text_length=2001) == 2

    def test_mcp_read_cost_large(self):
        assert calculate_mcp_read_cost(text_length=10000) == 5  # cap

    def test_mcp_read_cost_very_large(self):
        assert calculate_mcp_read_cost(text_length=20000) == 5  # cap

    def test_mcp_sheet_cost_small(self):
        assert calculate_mcp_sheet_cost(cell_count=100) == 1

    def test_mcp_sheet_cost_boundary(self):
        assert calculate_mcp_sheet_cost(cell_count=500) == 1

    def test_mcp_sheet_cost_over_boundary(self):
        assert calculate_mcp_sheet_cost(cell_count=501) == 2

    def test_mcp_sheet_cost_large(self):
        assert calculate_mcp_sheet_cost(cell_count=1500) == 3  # cap

    def test_mcp_sheet_cost_very_large(self):
        assert calculate_mcp_sheet_cost(cell_count=5000) == 3  # cap
