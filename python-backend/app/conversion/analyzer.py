"""Workflow Conversion Analyzer."""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


class CompatibilityLevel(Enum):
    FULLY_COMPATIBLE = "fully_compatible"  # 90-100 points
    ADAPTER_REQUIRED = "adapter_required"  # 50-89 points
    NOT_COMPATIBLE = "not_compatible"  # 0-49 points


@dataclass
class NodeCompatibility:
    node_id: str
    node_type: str
    supported: bool
    adapter_required: Optional[str]
    reason: Optional[str]
    score_impact: int


@dataclass
class ConversionAnalysis:
    workflow_id: int
    eligible: bool
    compatibility_score: int  # 0-100
    level: CompatibilityLevel
    unsupported_nodes: List[NodeCompatibility]
    adapters_required: List[NodeCompatibility]
    complexity_score: int
    recommendations: List[str]


class ConversionAnalyzer:
    """
    Analyze workflow for conversion to agent skill.

    Scoring:
    - Base score: 100
    - Each unsupported node: -20 points
    - Each adapter required: -10 points
    - Parallel branches: -10 points
    - Complex loops: -5 points
    """

    NODE_COMPATIBILITY: dict[str, dict[str, Any]] = {
        # AI Nodes (Fully Compatible)
        "llm_call": {"supported": True, "adapter": None, "score": 0},
        "rag_query": {"supported": True, "adapter": None, "score": 0},
        "prompt_template": {"supported": True, "adapter": None, "score": 0},
        "output_parser": {"supported": True, "adapter": None, "score": 0},
        "multi_model_router": {"supported": True, "adapter": None, "score": 0},
        # Flow Control (Compatible with limitations)
        "conditional": {"supported": True, "adapter": None, "score": 0},
        "delay": {"supported": True, "adapter": None, "score": 0},
        "try_catch": {"supported": True, "adapter": None, "score": 0},
        "retry": {"supported": True, "adapter": None, "score": 0},
        "circuit_breaker": {"supported": True, "adapter": None, "score": 0},
        "parallel": {
            "supported": False,
            "adapter": None,
            "score": -20,
            "reason": "Chat requires sequential processing",
        },
        "subworkflow": {"supported": True, "adapter": None, "score": 0},
        # Input Nodes (Require Adapters)
        "form_input": {
            "supported": True,
            "adapter": "conversational_input",
            "score": -10,
            "reason": "UI form needs conversational adaptation",
        },
        "text_input": {"supported": True, "adapter": None, "score": 0},
        "file_upload": {
            "supported": True,
            "adapter": "file_attachment",
            "score": -10,
            "reason": "File upload via chat attachment",
        },
        # Human Interaction (Require Adapters)
        "approval_gate": {
            "supported": True,
            "adapter": "chat_approval",
            "score": -10,
            "reason": "Approval via chat interaction",
        },
        "human_task": {
            "supported": True,
            "adapter": "chat_task",
            "score": -10,
            "reason": "Task assignment via chat",
        },
        # Output Nodes (Compatible)
        "webhook_response": {
            "supported": False,
            "adapter": None,
            "score": -20,
            "reason": "No webhook context in chat",
        },
        "send_email": {"supported": True, "adapter": None, "score": 0},
        "write_file": {"supported": True, "adapter": None, "score": 0},
        # Integration (Compatible)
        "http_request": {"supported": True, "adapter": None, "score": 0},
        "graphql_request": {"supported": True, "adapter": None, "score": 0},
        "websocket_client": {"supported": True, "adapter": None, "score": 0},
        # Data (Compatible)
        "csv_parser": {"supported": True, "adapter": None, "score": 0},
        "template_engine": {"supported": True, "adapter": None, "score": 0},
        "read_file": {"supported": True, "adapter": None, "score": 0},
        # Trigger Nodes (NOT Compatible)
        "webhook_trigger": {
            "supported": False,
            "adapter": None,
            "score": -20,
            "reason": "Cannot trigger via webhook in chat",
        },
        "schedule_trigger": {
            "supported": False,
            "adapter": None,
            "score": -20,
            "reason": "Cannot trigger via schedule in chat",
        },
        # Skills (Compatible)
        "skill": {"supported": True, "adapter": None, "score": 0},
    }

    def analyze(self, workflow: dict[str, Any]) -> ConversionAnalysis:
        """Analyze workflow for conversion."""
        nodes: list[dict[str, Any]] = workflow.get("nodes", [])
        edges: list[dict[str, Any]] = workflow.get("edges", [])

        base_score = 100
        unsupported: list[NodeCompatibility] = []
        adapters_required: list[NodeCompatibility] = []

        for node in nodes:
            node_type = str(node.get("type", ""))
            node_id = str(node.get("id", ""))

            compat_raw = self.NODE_COMPATIBILITY.get(
                node_type,
                {
                    "supported": False,
                    "adapter": None,
                    "score": -20,
                    "reason": "Unknown node type",
                },
            )
            compat: dict[str, Any] = compat_raw if compat_raw is not None else {
                "supported": False,
                "adapter": None,
                "score": -20,
                "reason": "Unknown node type",
            }

            node_compat = NodeCompatibility(
                node_id=node_id,
                node_type=node_type,
                supported=compat["supported"],
                adapter_required=compat.get("adapter"),
                reason=compat.get("reason"),
                score_impact=compat.get("score", 0),
            )

            base_score += compat.get("score", 0)

            if not compat["supported"]:
                unsupported.append(node_compat)
            elif compat.get("adapter"):
                adapters_required.append(node_compat)

        # Check for parallel branches
        parallel_count = len([n for n in nodes if n.get("type") == "parallel"])
        base_score -= parallel_count * 10

        # Calculate complexity
        complexity = self._calculate_complexity(nodes, edges)

        # Determine eligibility
        if unsupported:
            eligible = False
            level = CompatibilityLevel.NOT_COMPATIBLE
        elif adapters_required:
            eligible = True
            level = CompatibilityLevel.ADAPTER_REQUIRED
        else:
            eligible = True
            level = CompatibilityLevel.FULLY_COMPATIBLE

        final_score = max(0, min(100, base_score))

        # Generate recommendations
        recommendations = self._generate_recommendations(
            unsupported, adapters_required, complexity
        )

        return ConversionAnalysis(
            workflow_id=int(workflow.get("id") or 0),
            eligible=eligible,
            compatibility_score=final_score,
            level=level,
            unsupported_nodes=unsupported,
            adapters_required=adapters_required,
            complexity_score=complexity,
            recommendations=recommendations,
        )

    def _calculate_complexity(self, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> int:
        """Calculate workflow complexity score."""
        score = 0

        # Node count
        score += len(nodes) * 2

        # Edge count (connections)
        score += len(edges)

        # Decision points
        conditionals = len([n for n in nodes if n.get("type") == "conditional"])
        score += conditionals * 5

        return min(score, 100)

    def _generate_recommendations(
        self,
        unsupported: list[NodeCompatibility],
        adapters: list[NodeCompatibility],
        complexity: int,
    ) -> List[str]:
        """Generate conversion recommendations."""
        recommendations = []

        if unsupported:
            node_types = sorted({n.node_type for n in unsupported})
            recommendations.append(
                f"Remove or replace unsupported nodes: {', '.join(node_types)}"
            )

        if adapters:
            adapter_types = sorted(
                {n.adapter_required for n in adapters if n.adapter_required is not None}
            )
            recommendations.append(
                f"The following adapters will be applied: {', '.join(adapter_types)}"
            )

        if complexity > 50:
            recommendations.append(
                "Workflow is complex. Consider simplifying for better chat experience."
            )

        if not recommendations:
            recommendations.append("Workflow is ready for conversion!")

        return recommendations
