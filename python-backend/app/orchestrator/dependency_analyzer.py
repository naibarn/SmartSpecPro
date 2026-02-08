"""
Dependency Analyzer for Workflow Graphs

Implements BFS-based algorithm to identify affected downstream nodes
when changes are made at an approval gate.
"""

from typing import Dict, List, Set, Any, Optional
from collections import deque
import structlog

logger = structlog.get_logger(__name__)


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
        graph: Dict[str, List[str]] = {}

        for edge in self.manifest.get("edges", []):
            source = edge["source"]
            target = edge["target"]

            if source not in graph:
                graph[source] = []
            graph[source].append(target)

        return graph

    def _has_cycle(self) -> bool:
        """
        Detect cycles in the dependency graph using DFS.

        Returns:
            True if cycle exists, False otherwise
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
                    return True

            rec_stack.remove(node)
            return False

        # Check all nodes (graph may not be fully connected)
        for node in self.graph.keys():
            if node not in visited:
                if dfs(node):
                    return True

        return False

    def get_affected_downstream(
        self,
        changed_node: str,
        change_notes: Optional[Dict[str, Any]] = None
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
            >>> affected = analyzer.get_affected_downstream("render_images")
            >>> # Returns: ["combine_videos", "final_output"]
        """
        affected = []
        queue = deque([changed_node])
        visited = set()

        while queue:
            current = queue.popleft()

            if current in visited:
                continue
            visited.add(current)

            # Don't include the changed node itself in results
            if current != changed_node:
                affected.append(current)

            # Add all downstream nodes to queue
            for downstream in self.graph.get(current, []):
                if downstream not in visited:
                    queue.append(downstream)

        logger.info(
            "dependency_analysis_complete",
            changed_node=changed_node,
            affected_count=len(affected),
            affected_nodes=affected
        )

        return affected

    def get_all_dependencies(self, node: str) -> Set[str]:
        """
        Get all upstream dependencies for a node (reverse BFS).

        Args:
            node: Node ID

        Returns:
            Set of all upstream node IDs that this node depends on
        """
        # Build reverse graph
        reverse_graph: Dict[str, List[str]] = {}
        for source, targets in self.graph.items():
            for target in targets:
                if target not in reverse_graph:
                    reverse_graph[target] = []
                reverse_graph[target].append(source)

        # BFS traversal in reverse
        dependencies = set()
        queue = deque([node])
        visited = set()

        while queue:
            current = queue.popleft()

            if current in visited:
                continue
            visited.add(current)

            if current != node:
                dependencies.add(current)

            for upstream in reverse_graph.get(current, []):
                if upstream not in visited:
                    queue.append(upstream)

        return dependencies
