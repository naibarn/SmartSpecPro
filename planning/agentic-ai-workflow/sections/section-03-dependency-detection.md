# Section 03: Smart Dependency Detection

**Phase**: 1 - Foundation
**Estimated Time**: 2-3 days
**Priority**: High
**Dependencies**: None

---

## Overview

Implement the smart dependency detection algorithm that determines which downstream workflow nodes are affected when a user requests changes at an approval gate. This prevents unnecessary re-execution of unaffected steps, preserving user work and reducing costs.

**Example**: If user requests change to image #4 in a 7-image workflow, only video #4 should be regenerated, not videos 1-3, 5-7.

**Algorithm**: Breadth-First Search (BFS) traversal of the workflow dependency graph.

---

## Goals

- ✅ DependencyAnalyzer class implemented
- ✅ BFS algorithm correctly identifies affected downstream nodes
- ✅ Item-specific invalidation works (e.g., only image_4 → video_4)
- ✅ Circular dependency detection prevents infinite loops
- ✅ All tests in `tests/test_dependency_analyzer.py` pass
- ✅ Performance: O(N+E) complexity for graph with N nodes, E edges

---

## Files to Create

### Python Backend

**Created**:
- `python-backend/app/orchestrator/dependency_analyzer.py` - Main implementation
- `python-backend/tests/test_dependency_analyzer.py` - Unit tests

---

## Implementation Steps

### Step 1: Create DependencyAnalyzer Class

**Create `python-backend/app/orchestrator/dependency_analyzer.py`**:

```python
from typing import Dict, List, Set
from collections import deque
import logging

logger = logging.getLogger(__name__)


class DependencyAnalyzer:
    """
    Analyzes workflow dependencies to determine which nodes are affected
    by changes at a specific node (smart invalidation).
    """

    def __init__(self, manifest: dict):
        """
        Initialize analyzer with workflow manifest.

        Args:
            manifest: Workflow manifest containing nodes and edges

        Raises:
            ValueError: If manifest contains circular dependencies
        """
        self.manifest = manifest
        self.graph = self._build_graph()

        # Detect circular dependencies upfront
        if self._has_cycle():
            raise ValueError("Circular dependency detected in workflow graph")

    def _build_graph(self) -> Dict[str, List[str]]:
        """
        Build adjacency list from manifest edges.

        Returns:
            Dict mapping source node ID to list of target node IDs
        """
        graph = {}

        for edge in self.manifest.get("edges", []):
            source = edge["source"]
            target = edge["target"]

            if source not in graph:
                graph[source] = []
            graph[source].append(target)

        return graph

    def get_affected_downstream(
        self,
        changed_node: str,
        change_notes: Dict[str, any] = None
    ) -> List[str]:
        """
        Find all downstream nodes affected by changes to `changed_node`.

        Uses breadth-first search to traverse dependency graph and identify
        all nodes that depend on the changed node.

        Args:
            changed_node: ID of node with changes
            change_notes: Optional per-item change notes (e.g., {"image_4": "..."})

        Returns:
            List of affected downstream node IDs

        Example:
            >>> analyzer = DependencyAnalyzer(manifest)
            >>> affected = analyzer.get_affected_downstream("render_images", {"image_4": "..."})
            >>> # Returns: ["render_video_shot_4"] (only video 4 affected)
        """
        affected = []
        queue = deque([changed_node])
        visited = set()

        while queue:
            current = queue.popleft()

            if current in visited:
                continue
            visited.add(current)

            # Check if current node is affected by the change
            if current != changed_node:  # Don't include the changed node itself
                if self._is_affected(current, changed_node, change_notes):
                    affected.append(current)

                    # Add downstream nodes to queue
                    for downstream in self.graph.get(current, []):
                        if downstream not in visited:
                            queue.append(downstream)
                else:
                    # If current node is not affected, don't traverse its children
                    # (they can't be affected either)
                    continue
            else:
                # For the changed node itself, always traverse its children
                for downstream in self.graph.get(current, []):
                    if downstream not in visited:
                        queue.append(downstream)

        logger.info(
            f"Dependency analysis: {changed_node} affects {len(affected)} downstream nodes: {affected}"
        )
        return affected

    def _is_affected(
        self,
        node: str,
        changed_node: str,
        change_notes: Dict[str, any] = None
    ) -> bool:
        """
        Determine if `node` is affected by changes to `changed_node`.

        Strategy:
        1. If no change_notes provided, assume all downstream nodes affected
        2. If change_notes specify items (e.g., {"image_4": ...}), check if
           node references those specific items

        Args:
            node: Node ID to check
            changed_node: Node that was changed
            change_notes: Optional item-specific notes

        Returns:
            True if node is affected and should be re-executed
        """
        if not change_notes:
            # No specific items mentioned, assume all downstream affected
            return True

        # Check if node ID contains any changed item IDs
        # Example: node="render_video_shot_4", change_notes={"image_4": ...}
        # Match: "4" appears in both
        for item_id in change_notes.keys():
            # Extract item number (e.g., "image_4" → "4")
            item_num = item_id.split("_")[-1] if "_" in item_id else item_id

            # Check if node ID contains this item number
            if item_num in node:
                return True

        return False

    def _has_cycle(self) -> bool:
        """
        Detect cycles in the workflow graph using DFS.

        Returns:
            True if cycle detected, False otherwise
        """
        visited = set()
        rec_stack = set()

        def dfs(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for neighbor in self.graph.get(node, []):
                if neighbor not in visited:
                    if dfs(neighbor):
                        return True
                elif neighbor in rec_stack:
                    # Back edge found - cycle detected
                    logger.error(f"Circular dependency detected: {node} → {neighbor}")
                    return True

            rec_stack.remove(node)
            return False

        # Check all nodes (graph may be disconnected)
        for node_id in self.graph.keys():
            if node_id not in visited:
                if dfs(node_id):
                    return True

        return False

    def get_all_downstream(self, node: str) -> List[str]:
        """
        Get all downstream nodes (regardless of change notes).

        Args:
            node: Starting node ID

        Returns:
            List of all reachable downstream node IDs
        """
        return self.get_affected_downstream(node, change_notes=None)

    def get_dependency_depth(self, node: str) -> int:
        """
        Calculate maximum depth from node to any leaf node.

        Args:
            node: Starting node ID

        Returns:
            Maximum depth (number of edges to deepest leaf)
        """
        def dfs_depth(current: str, visited: Set[str]) -> int:
            if current in visited:
                return 0  # Avoid cycles

            visited.add(current)
            children = self.graph.get(current, [])

            if not children:
                return 0  # Leaf node

            max_child_depth = max(
                dfs_depth(child, visited.copy()) for child in children
            )
            return 1 + max_child_depth

        return dfs_depth(node, set())

    def visualize_graph(self) -> str:
        """
        Generate ASCII visualization of dependency graph.

        Returns:
            String representation of graph
        """
        lines = ["Dependency Graph:"]
        for source, targets in sorted(self.graph.items()):
            for target in targets:
                lines.append(f"  {source} → {target}")
        return "\n".join(lines)
```

---

### Step 2: Write Comprehensive Tests

**Create `python-backend/tests/test_dependency_analyzer.py`**:

```python
import pytest
from app.orchestrator.dependency_analyzer import DependencyAnalyzer


class TestDependencyAnalyzer:
    """Tests for smart dependency detection algorithm"""

    @pytest.fixture
    def linear_flow(self):
        """Fixture: Simple linear flow A → B → C → D"""
        return {
            "nodes": [
                {"id": "A", "type": "llm_call"},
                {"id": "B", "type": "llm_call"},
                {"id": "C", "type": "llm_call"},
                {"id": "D", "type": "llm_call"}
            ],
            "edges": [
                {"source": "A", "target": "B"},
                {"source": "B", "target": "C"},
                {"source": "C", "target": "D"}
            ]
        }

    @pytest.fixture
    def parallel_flow(self):
        """Fixture: Parallel flow A → B → [C1, C2, C3] → D"""
        return {
            "nodes": [
                {"id": "A", "type": "llm_call"},
                {"id": "B", "type": "llm_call"},
                {"id": "C1", "type": "generate_image"},
                {"id": "C2", "type": "generate_image"},
                {"id": "C3", "type": "generate_image"},
                {"id": "D", "type": "combine_videos"}
            ],
            "edges": [
                {"source": "A", "target": "B"},
                {"source": "B", "target": "C1"},
                {"source": "B", "target": "C2"},
                {"source": "B", "target": "C3"},
                {"source": "C1", "target": "D"},
                {"source": "C2", "target": "D"},
                {"source": "C3", "target": "D"}
            ]
        }

    @pytest.fixture
    def video_workflow(self):
        """Fixture: 7-image video workflow"""
        nodes = [{"id": "plan_script", "type": "llm_call"}]
        edges = []

        # 7 image nodes
        for i in range(1, 8):
            nodes.append({"id": f"render_image_shot_{i}", "type": "generate_image"})
            edges.append({"source": "plan_script", "target": f"render_image_shot_{i}"})

        # 7 video nodes
        for i in range(1, 8):
            nodes.append({"id": f"render_video_shot_{i}", "type": "generate_video"})
            edges.append({"source": f"render_image_shot_{i}", "target": f"render_video_shot_{i}"})

        return {"nodes": nodes, "edges": edges}

    def test_linear_flow_invalidation(self, linear_flow):
        """Test that changing B invalidates C and D, but not A"""
        analyzer = DependencyAnalyzer(linear_flow)
        affected = analyzer.get_affected_downstream("B")

        assert "C" in affected
        assert "D" in affected
        assert "A" not in affected
        assert len(affected) == 2

    def test_parallel_flow_selective_invalidation(self, parallel_flow):
        """Test that changing C2 only invalidates D, not C1 or C3"""
        analyzer = DependencyAnalyzer(parallel_flow)
        affected = analyzer.get_affected_downstream("C2")

        assert "D" in affected
        assert "C1" not in affected
        assert "C3" not in affected

    def test_item_specific_invalidation(self, video_workflow):
        """Test that changing image_4 only invalidates video_4"""
        analyzer = DependencyAnalyzer(video_workflow)

        change_notes = {"image_4": "Brighter lighting"}
        affected = analyzer.get_affected_downstream(
            "render_image_shot_4",
            change_notes
        )

        # Only video_shot_4 should be affected
        assert "render_video_shot_4" in affected
        assert "render_video_shot_1" not in affected
        assert "render_video_shot_2" not in affected
        assert "render_video_shot_3" not in affected
        assert "render_video_shot_5" not in affected

    def test_no_change_notes_invalidates_all(self, video_workflow):
        """Test that without change_notes, all downstream nodes invalidated"""
        analyzer = DependencyAnalyzer(video_workflow)

        # No change_notes provided
        affected = analyzer.get_affected_downstream("plan_script")

        # All images and videos should be affected
        assert len(affected) == 14  # 7 images + 7 videos

    def test_circular_dependency_detection(self):
        """Test that circular dependencies raise ValueError"""
        circular_manifest = {
            "nodes": [
                {"id": "A", "type": "llm_call"},
                {"id": "B", "type": "llm_call"},
                {"id": "C", "type": "llm_call"}
            ],
            "edges": [
                {"source": "A", "target": "B"},
                {"source": "B", "target": "C"},
                {"source": "C", "target": "A"}  # Cycle!
            ]
        }

        with pytest.raises(ValueError, match="Circular dependency"):
            DependencyAnalyzer(circular_manifest)

    def test_self_loop_detection(self):
        """Test that self-loops are detected as circular dependencies"""
        self_loop_manifest = {
            "nodes": [{"id": "A", "type": "loop"}],
            "edges": [{"source": "A", "target": "A"}]  # Self-loop
        }

        with pytest.raises(ValueError, match="Circular dependency"):
            DependencyAnalyzer(self_loop_manifest)

    def test_dependency_depth_calculation(self, linear_flow):
        """Test dependency depth calculation"""
        analyzer = DependencyAnalyzer(linear_flow)

        assert analyzer.get_dependency_depth("A") == 3  # A → B → C → D
        assert analyzer.get_dependency_depth("B") == 2  # B → C → D
        assert analyzer.get_dependency_depth("C") == 1  # C → D
        assert analyzer.get_dependency_depth("D") == 0  # Leaf node

    def test_empty_graph(self):
        """Test analyzer with no edges"""
        empty_manifest = {
            "nodes": [{"id": "A", "type": "llm_call"}],
            "edges": []
        }

        analyzer = DependencyAnalyzer(empty_manifest)
        affected = analyzer.get_affected_downstream("A")

        assert len(affected) == 0  # No downstream nodes

    def test_disconnected_graph(self):
        """Test analyzer with disconnected components"""
        disconnected_manifest = {
            "nodes": [
                {"id": "A", "type": "llm_call"},
                {"id": "B", "type": "llm_call"},
                {"id": "C", "type": "llm_call"},
                {"id": "D", "type": "llm_call"}
            ],
            "edges": [
                {"source": "A", "target": "B"},
                {"source": "C", "target": "D"}
            ]
        }

        analyzer = DependencyAnalyzer(disconnected_manifest)

        # Changing A only affects B, not C or D
        affected = analyzer.get_affected_downstream("A")
        assert "B" in affected
        assert "C" not in affected
        assert "D" not in affected
```

**Run tests**:
```bash
pytest tests/test_dependency_analyzer.py -v
```

---

### Step 3: Integrate with Approval Service

**Update `approval_service.py` to use DependencyAnalyzer**:

```python
from app.orchestrator.dependency_analyzer import DependencyAnalyzer

async def handle_change_request(
    request_id: str,
    change_notes: dict,
    manifest: dict
) -> List[str]:
    """
    Handle change request by determining affected nodes.

    Args:
        request_id: Approval request ID
        change_notes: Per-item change notes
        manifest: Workflow manifest

    Returns:
        List of affected node IDs to invalidate
    """
    request = await get_request(request_id)
    gate_id = request.gate_id

    # Convert gate_id to node_id (e.g., "approve_script" → "plan_script")
    node_id = gate_id.replace("approve_", "")

    # Analyze dependencies
    analyzer = DependencyAnalyzer(manifest)
    affected_nodes = analyzer.get_affected_downstream(node_id, change_notes)

    logger.info(f"Change request at {gate_id} affects {len(affected_nodes)} nodes: {affected_nodes}")

    return affected_nodes
```

---

## Test Requirements

All tests in `tests/test_dependency_analyzer.py` must pass:

- ✅ Linear flow invalidation
- ✅ Parallel flow selective invalidation
- ✅ Item-specific invalidation (image_4 → video_4)
- ✅ Circular dependency detection
- ✅ Self-loop detection
- ✅ Dependency depth calculation
- ✅ Empty and disconnected graphs

**Coverage**:
```bash
pytest tests/test_dependency_analyzer.py --cov=app.orchestrator.dependency_analyzer --cov-fail-under=90
```

---

## Verification

### Manual Testing

```python
# Test in Python shell
from app.orchestrator.dependency_analyzer import DependencyAnalyzer

# Simple test
manifest = {
    "nodes": [
        {"id": "A", "type": "llm"},
        {"id": "B", "type": "llm"},
        {"id": "C", "type": "llm"}
    ],
    "edges": [
        {"source": "A", "target": "B"},
        {"source": "B", "target": "C"}
    ]
}

analyzer = DependencyAnalyzer(manifest)
affected = analyzer.get_affected_downstream("A")
print(f"Affected: {affected}")  # Should be ["B", "C"]

# Visualize
print(analyzer.visualize_graph())
```

### Performance Testing

```python
import time

# Large graph (100 nodes, 200 edges)
large_manifest = generate_large_manifest(nodes=100, edges=200)

analyzer = DependencyAnalyzer(large_manifest)

start = time.perf_counter()
affected = analyzer.get_affected_downstream("node_1")
end = time.perf_counter()

print(f"Analysis time: {(end - start) * 1000:.2f}ms")
# Should be < 10ms for 100 nodes
```

---

## Dependencies

**Required Before**: None
**Enables**: Smart invalidation in approval workflows

---

## Completion Checklist

- [ ] DependencyAnalyzer class implemented
- [ ] BFS algorithm works correctly
- [ ] Circular dependency detection implemented
- [ ] Item-specific invalidation works
- [ ] All unit tests pass (90%+ coverage)
- [ ] Performance test passes (<10ms for 100 nodes)
- [ ] Integration with approval service complete
- [ ] Manual verification successful

**Estimated Completion**: 2-3 days
