"""
Drive billing formula functions.

Pure functions for calculating credit costs of Google Drive operations.
Used by MCP handlers and the indexing pipeline.
"""

import math


def calculate_drive_index_cost(chunk_count: int, cost_per_chunk: int = 2) -> int:
    """Calculate credits for indexing a Drive file.

    Formula: ceil(chunk_count) * cost_per_chunk.
    Returns 0 if chunk_count <= 0.
    """
    if chunk_count <= 0:
        return 0
    return math.ceil(chunk_count) * cost_per_chunk


def calculate_mcp_read_cost(text_length: int, max_cost: int = 5) -> int:
    """Calculate credits for reading a Drive file via MCP.

    Formula: max(1, ceil(text_length / 2000)), capped at max_cost.
    """
    if text_length <= 0:
        return 1
    return min(max(1, math.ceil(text_length / 2000)), max_cost)


def calculate_mcp_sheet_cost(cell_count: int, max_cost: int = 3) -> int:
    """Calculate credits for reading a spreadsheet via MCP.

    Formula: max(1, ceil(cell_count / 500)), capped at max_cost.
    """
    if cell_count <= 0:
        return 1
    return min(max(1, math.ceil(cell_count / 500)), max_cost)
