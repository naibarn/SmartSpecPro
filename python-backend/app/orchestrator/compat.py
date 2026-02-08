"""
Backward compatibility adapter for the workflow engine rebuild (Section 16).

TODO: Full implementation required. This module should:
1. Map old WorkflowOrchestrator API to new LangGraphRuntime
2. Convert step-based workflows to ReactFlow JSON format
3. Provide ExecutionState format conversion

See planning/workflow-langgraph-rag/sections/16-backward-compatibility.md for details.
"""

import warnings

warnings.warn(
    "Backward compatibility layer not yet fully implemented. "
    "Old workflows may not function correctly.",
    FutureWarning,
    stacklevel=2,
)


def steps_to_reactflow_json(steps: list[dict], parallel_steps: list[str] | None = None) -> dict:
    """Convert old step-based workflow to ReactFlow JSON format.

    TODO: Implement conversion logic as specified in Section 16.
    """
    raise NotImplementedError("Section 16 backward compat stub - implementation required")
