"""
Tests for dependency analyzer.

Tests BFS algorithm for identifying affected downstream nodes.
"""

import pytest
from app.orchestrator.dependency_analyzer import DependencyAnalyzer


@pytest.mark.unit
def test_dependency_analyzer_simple_chain():
    """Test linear dependency chain A -> B -> C"""
    manifest = {
        "nodes": [
            {"id": "node_a"},
            {"id": "node_b"},
            {"id": "node_c"},
        ],
        "edges": [
            {"source": "node_a", "target": "node_b"},
            {"source": "node_b", "target": "node_c"},
        ]
    }

    analyzer = DependencyAnalyzer(manifest)
    affected = analyzer.get_affected_downstream("node_a")

    assert "node_b" in affected
    assert "node_c" in affected
    assert len(affected) == 2


@pytest.mark.unit
def test_dependency_analyzer_multiple_dependencies():
    """Test node with multiple downstream dependencies"""
    manifest = {
        "nodes": [
            {"id": "source"},
            {"id": "dep1"},
            {"id": "dep2"},
            {"id": "dep3"},
        ],
        "edges": [
            {"source": "source", "target": "dep1"},
            {"source": "source", "target": "dep2"},
            {"source": "dep1", "target": "dep3"},
        ]
    }

    analyzer = DependencyAnalyzer(manifest)
    affected = analyzer.get_affected_downstream("source")

    assert "dep1" in affected
    assert "dep2" in affected
    assert "dep3" in affected


@pytest.mark.unit
def test_circular_dependency_detection():
    """Test that circular dependencies are detected"""
    manifest = {
        "nodes": [
            {"id": "node_a"},
            {"id": "node_b"},
        ],
        "edges": [
            {"source": "node_a", "target": "node_b"},
            {"source": "node_b", "target": "node_a"},  # Circular!
        ]
    }

    with pytest.raises(ValueError, match="Circular dependency"):
        DependencyAnalyzer(manifest)


@pytest.mark.unit
def test_no_dependencies():
    """Test node with no downstream dependencies"""
    manifest = {
        "nodes": [
            {"id": "isolated"},
        ],
        "edges": []
    }

    analyzer = DependencyAnalyzer(manifest)
    affected = analyzer.get_affected_downstream("isolated")

    assert len(affected) == 0
