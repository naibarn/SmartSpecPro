diff --git a/python-backend/app/api/workflows.py b/python-backend/app/api/workflows.py
index 036e735..7a81c60 100644
--- a/python-backend/app/api/workflows.py
+++ b/python-backend/app/api/workflows.py
@@ -85,15 +85,7 @@ class WorkflowGenerateSubmitResponse(BaseModel):
     status: str  # "queued"
 
 
-class WorkflowGenerateStatusResponse(BaseModel):
-    """Response from workflow generation status polling."""
-
-    status: str  # queued | processing | completed | failed
-    message: str | None = None
-    error: str | None = None
-    nodes: list[dict[str, Any]] | None = None
-    edges: list[dict[str, Any]] | None = None
-    description: str | None = None
+from app.orchestrator.workflow_validator import WorkflowGenerateStatusResponse  # noqa: E402
 
 
 class ExecuteWorkflowRequest(BaseModel):
diff --git a/python-backend/app/orchestrator/workflow_validator.py b/python-backend/app/orchestrator/workflow_validator.py
new file mode 100644
index 0000000..e30db08
--- /dev/null
+++ b/python-backend/app/orchestrator/workflow_validator.py
@@ -0,0 +1,184 @@
+"""
+workflow_validator.py — Pydantic v2 models for validating AI-generated workflow JSON.
+
+Used by WorkflowGenerator (workflow_generator.py) to validate LLM output before
+returning it to the caller. On validation failure the error is fed back to the LLM
+as a correction instruction (see workflow_generator.py retry loop in section-08).
+
+Do NOT import NodeRegistry here — circular dependency risk.
+The KNOWN_NODE_TYPES set is a hardcoded copy of the 57 registered type strings.
+"""
+from __future__ import annotations
+
+from typing import Any
+
+from pydantic import BaseModel, model_validator
+
+
+# ---------------------------------------------------------------------------
+# Known node types — hardcoded from node_registry.py, do NOT import
+# ---------------------------------------------------------------------------
+
+KNOWN_NODE_TYPES: frozenset[str] = frozenset({
+    # Triggers
+    "manual_trigger", "schedule_trigger", "webhook_trigger", "event_trigger",
+    "queue_trigger", "file_upload_trigger", "error_trigger",
+    # AI
+    "llm_call", "rag_query", "prompt_template", "output_parser",
+    "multi_model_router",
+    # Flow control
+    "conditional", "loop", "parallel", "join", "subworkflow",
+    "retry", "circuit_breaker", "try_catch", "delay", "switch", "wait",
+    "split", "batch", "execution_timeout",
+    # Data
+    "database_query", "transformer", "filter", "set_variable", "merge_data",
+    "code_runner", "map_array", "validator",
+    "csv_parser", "template_engine", "read_file", "write_file",
+    # Integrations
+    "http_request", "graphql_request", "websocket_client",
+    "storage_action", "mcp_connector",
+    # Outputs
+    "send_email", "send_notification", "workflow_response", "webhook_response",
+    # Observability / reliability
+    "metrics_collector", "secrets_vault", "dead_letter_queue", "run_history",
+    "rate_limiter", "idempotency",
+    # Media / Skills / Human
+    "generate_image", "skill", "approval_gate", "form_input",
+})
+
+TRIGGER_NODE_TYPES: frozenset[str] = frozenset({
+    "manual_trigger",
+    "schedule_trigger",
+    "webhook_trigger",
+    "event_trigger",
+    "queue_trigger",
+    "file_upload_trigger",
+    "error_trigger",
+})
+
+
+# ---------------------------------------------------------------------------
+# Pydantic v2 models
+# ---------------------------------------------------------------------------
+
+
+class NodeData(BaseModel):
+    """Data payload carried by each ReactFlow workflow node."""
+
+    nodeType: str
+    label: str
+    config: dict[str, Any] = {}
+
+
+class WorkflowNode(BaseModel):
+    """A single node in the ReactFlow workflow graph.
+
+    The 'type' field is the ReactFlow component name — it should be "workflow"
+    (the registered custom renderer key). The validator does NOT enforce this
+    as an enum because wrong values (e.g. "workflowNode") are a UX issue, not
+    a structural error; correcting them is done elsewhere.
+    """
+
+    id: str
+    type: str = "workflow"
+    position: dict[str, float]
+    data: NodeData
+
+
+class WorkflowEdge(BaseModel):
+    """A directed edge connecting two nodes in the workflow graph."""
+
+    id: str
+    source: str
+    target: str
+    sourceHandle: str = "output"
+    targetHandle: str = "input"
+
+
+class GeneratedWorkflow(BaseModel):
+    """Top-level model for an AI-generated workflow JSON object.
+
+    Validates the structural invariants required for a workflow to be usable:
+    1. At least one trigger node must be present.
+    2. All edge source/target IDs must reference existing node IDs.
+    3. All data.nodeType values must be in KNOWN_NODE_TYPES.
+
+    Usage (Pydantic v2):
+        workflow = GeneratedWorkflow.model_validate(parsed_dict)
+        result = workflow.model_dump()
+    """
+
+    nodes: list[WorkflowNode]
+    edges: list[WorkflowEdge]
+
+    @model_validator(mode="after")
+    def validate_workflow(self) -> "GeneratedWorkflow":
+        """Run all three structural validators after field parsing."""
+        node_ids: set[str] = {n.id for n in self.nodes}
+        node_types: set[str] = {n.data.nodeType for n in self.nodes}
+
+        # --- Validator 1: at least one trigger node ---
+        if not node_types & TRIGGER_NODE_TYPES:
+            raise ValueError(
+                f"Workflow must have at least one trigger node. "
+                f"Known trigger types: {sorted(TRIGGER_NODE_TYPES)}. "
+                f"Found nodeTypes: {sorted(node_types)}"
+            )
+
+        # --- Validator 2: edge IDs reference existing node IDs ---
+        for edge in self.edges:
+            if edge.source not in node_ids:
+                raise ValueError(
+                    f"Edge '{edge.id}' has source '{edge.source}' which does not "
+                    f"match any node id. Available node ids: {sorted(node_ids)}"
+                )
+            if edge.target not in node_ids:
+                raise ValueError(
+                    f"Edge '{edge.id}' has target '{edge.target}' which does not "
+                    f"match any node id. Available node ids: {sorted(node_ids)}"
+                )
+
+        # --- Validator 3: all nodeType values are known ---
+        for node in self.nodes:
+            if node.data.nodeType not in KNOWN_NODE_TYPES:
+                raise ValueError(
+                    f"Node '{node.id}' has unknown nodeType '{node.data.nodeType}'. "
+                    f"Use one of the registered node types from KNOWN_NODE_TYPES."
+                )
+
+        return self
+
+
+# ---------------------------------------------------------------------------
+# Status response model extension
+# ---------------------------------------------------------------------------
+
+
+class WorkflowGenerateStatusResponse(BaseModel):
+    """Response model for GET /api/v1/workflows/generate/status/{task_id}.
+
+    Extended with structured error fields so the frontend can display
+    specific corrective guidance instead of a generic failure message.
+
+    Fields preserved from original (apps/api/workflows.py):
+        status, message, error, nodes, edges, description
+
+    New fields (added in feature-017):
+        result: Alternative combined result dict (nodes + edges + description)
+        validationError: The specific Pydantic validation message after 3 failed
+                         attempts, e.g. "Workflow must have at least one trigger node."
+        hint: A user-facing corrective suggestion derived from the error type,
+              e.g. "Try describing when the workflow should start."
+
+    Pydantic v2 note: Use .model_dump() (not .dict()) when serializing.
+    """
+
+    status: str  # "pending" | "running" | "completed" | "failed"
+    message: str | None = None
+    error: str | None = None
+    nodes: list[dict[str, Any]] | None = None
+    edges: list[dict[str, Any]] | None = None
+    description: str | None = None
+    result: dict[str, Any] | None = None
+    validationError: str | None = None
+    hint: str | None = None
diff --git a/python-backend/tests/test_workflow_validator.py b/python-backend/tests/test_workflow_validator.py
new file mode 100644
index 0000000..fb8b47a
--- /dev/null
+++ b/python-backend/tests/test_workflow_validator.py
@@ -0,0 +1,264 @@
+"""
+Unit tests for GeneratedWorkflow Pydantic v2 validator.
+Run: cd python-backend && uv run pytest tests/test_workflow_validator.py -m unit -v
+"""
+import pytest
+from pydantic import ValidationError
+
+from app.orchestrator.workflow_validator import GeneratedWorkflow, WorkflowGenerateStatusResponse
+
+
+# ---------------------------------------------------------------------------
+# Fixtures — minimal valid workflow data
+# ---------------------------------------------------------------------------
+
+VALID_MINIMAL = {
+    "nodes": [
+        {
+            "id": "trigger_1",
+            "type": "workflow",
+            "position": {"x": 0, "y": 0},
+            "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
+        },
+        {
+            "id": "llm_1",
+            "type": "workflow",
+            "position": {"x": 280, "y": 0},
+            "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
+        },
+    ],
+    "edges": [
+        {
+            "id": "edge-trigger_1-llm_1",
+            "source": "trigger_1",
+            "target": "llm_1",
+        }
+    ],
+}
+
+
+# ---------------------------------------------------------------------------
+# GeneratedWorkflow validation
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+def test_valid_minimal_workflow_passes():
+    """Valid workflow with trigger + one action passes without error."""
+    workflow = GeneratedWorkflow.model_validate(VALID_MINIMAL)
+    assert len(workflow.nodes) == 2
+    assert len(workflow.edges) == 1
+
+
+@pytest.mark.unit
+def test_zero_nodes_raises_validation_error():
+    """Workflow with zero nodes raises ValidationError."""
+    data = {"nodes": [], "edges": []}
+    with pytest.raises(ValidationError):
+        GeneratedWorkflow.model_validate(data)
+
+
+@pytest.mark.unit
+def test_no_trigger_node_raises_with_trigger_message():
+    """Workflow with nodes but no trigger nodeType raises ValidationError mentioning 'trigger'."""
+    data = {
+        "nodes": [
+            {
+                "id": "llm_1",
+                "type": "workflow",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
+            }
+        ],
+        "edges": [],
+    }
+    with pytest.raises(ValidationError) as exc_info:
+        GeneratedWorkflow.model_validate(data)
+    assert "trigger" in str(exc_info.value).lower()
+
+
+@pytest.mark.unit
+def test_hallucinated_node_type_raises_with_bad_type_in_message():
+    """Workflow with unknown nodeType raises ValidationError naming the bad type."""
+    data = {
+        "nodes": [
+            {
+                "id": "trigger_1",
+                "type": "workflow",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
+            },
+            {
+                "id": "fake_1",
+                "type": "workflow",
+                "position": {"x": 280, "y": 0},
+                "data": {"nodeType": "fake_node_xyz", "label": "Fake", "config": {}},
+            },
+        ],
+        "edges": [],
+    }
+    with pytest.raises(ValidationError) as exc_info:
+        GeneratedWorkflow.model_validate(data)
+    assert "fake_node_xyz" in str(exc_info.value)
+
+
+@pytest.mark.unit
+def test_edge_with_nonexistent_source_raises():
+    """Edge referencing a non-existent source node ID raises ValidationError."""
+    data = {
+        "nodes": [
+            {
+                "id": "trigger_1",
+                "type": "workflow",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
+            }
+        ],
+        "edges": [
+            {"id": "e1", "source": "nonexistent_node", "target": "trigger_1"}
+        ],
+    }
+    with pytest.raises(ValidationError) as exc_info:
+        GeneratedWorkflow.model_validate(data)
+    assert "nonexistent_node" in str(exc_info.value)
+
+
+@pytest.mark.unit
+def test_edge_with_nonexistent_target_raises():
+    """Edge referencing a non-existent target node ID raises ValidationError."""
+    data = {
+        "nodes": [
+            {
+                "id": "trigger_1",
+                "type": "workflow",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
+            }
+        ],
+        "edges": [
+            {"id": "e1", "source": "trigger_1", "target": "ghost_node"}
+        ],
+    }
+    with pytest.raises(ValidationError) as exc_info:
+        GeneratedWorkflow.model_validate(data)
+    assert "ghost_node" in str(exc_info.value)
+
+
+@pytest.mark.unit
+def test_parallel_branches_with_join_passes():
+    """Workflow with parallel branches (two sources feeding a join) passes validation."""
+    # A → B, A → C, B → D, C → D (join pattern)
+    data = {
+        "nodes": [
+            {
+                "id": "trigger_1",
+                "type": "workflow",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "schedule_trigger", "label": "Daily", "config": {}},
+            },
+            {
+                "id": "llm_b",
+                "type": "workflow",
+                "position": {"x": 280, "y": -100},
+                "data": {"nodeType": "llm_call", "label": "Path B", "config": {}},
+            },
+            {
+                "id": "llm_c",
+                "type": "workflow",
+                "position": {"x": 280, "y": 100},
+                "data": {"nodeType": "llm_call", "label": "Path C", "config": {}},
+            },
+            {
+                "id": "join_1",
+                "type": "workflow",
+                "position": {"x": 560, "y": 0},
+                "data": {"nodeType": "join", "label": "Merge", "config": {}},
+            },
+        ],
+        "edges": [
+            {"id": "e1", "source": "trigger_1", "target": "llm_b"},
+            {"id": "e2", "source": "trigger_1", "target": "llm_c"},
+            {"id": "e3", "source": "llm_b", "target": "join_1"},
+            {"id": "e4", "source": "llm_c", "target": "join_1"},
+        ],
+    }
+    workflow = GeneratedWorkflow.model_validate(data)
+    assert len(workflow.nodes) == 4
+
+
+@pytest.mark.unit
+def test_node_type_field_workflow_is_accepted():
+    """Node with type='workflow' (correct ReactFlow value) is accepted."""
+    workflow = GeneratedWorkflow.model_validate(VALID_MINIMAL)
+    assert workflow.nodes[0].type == "workflow"
+
+
+@pytest.mark.unit
+def test_node_type_field_workflownode_does_not_break_validator():
+    """
+    Node with type='workflowNode' (wrong but sometimes generated) is still
+    parsed without crashing. The 'type' field is informational for ReactFlow;
+    the validator only checks data.nodeType against KNOWN_NODE_TYPES.
+    """
+    data = {
+        "nodes": [
+            {
+                "id": "trigger_1",
+                # Wrong value — should be "workflow" — but validator must not crash
+                "type": "workflowNode",
+                "position": {"x": 0, "y": 0},
+                "data": {"nodeType": "manual_trigger", "label": "Start", "config": {}},
+            }
+        ],
+        "edges": [],
+    }
+    # Should not raise — type string on node is not validated against an enum
+    workflow = GeneratedWorkflow.model_validate(data)
+    assert workflow.nodes[0].type == "workflowNode"
+
+
+# ---------------------------------------------------------------------------
+# WorkflowGenerateStatusResponse model
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+def test_status_response_has_validation_error_field():
+    """WorkflowGenerateStatusResponse includes validationError field defaulting to None."""
+    resp = WorkflowGenerateStatusResponse(status="pending")
+    assert hasattr(resp, "validationError")
+    assert resp.validationError is None
+
+
+@pytest.mark.unit
+def test_status_response_has_hint_field():
+    """WorkflowGenerateStatusResponse includes hint field defaulting to None."""
+    resp = WorkflowGenerateStatusResponse(status="pending")
+    assert hasattr(resp, "hint")
+    assert resp.hint is None
+
+
+@pytest.mark.unit
+def test_status_response_serializes_none_fields():
+    """model_dump() includes validationError=None and hint=None when not set."""
+    resp = WorkflowGenerateStatusResponse(status="completed", result={"nodes": [], "edges": []})
+    dumped = resp.model_dump()
+    assert "validationError" in dumped
+    assert dumped["validationError"] is None
+    assert "hint" in dumped
+    assert dumped["hint"] is None
+
+
+@pytest.mark.unit
+def test_status_response_failed_with_structured_error():
+    """Failed status response carries validationError and hint."""
+    resp = WorkflowGenerateStatusResponse(
+        status="failed",
+        error="Workflow generation failed after 3 attempts.",
+        validationError="Workflow must have at least one trigger node.",
+        hint="Try describing when the workflow should start, e.g., 'every morning at 7 AM'.",
+    )
+    dumped = resp.model_dump()
+    assert dumped["status"] == "failed"
+    assert "trigger" in dumped["validationError"]
+    assert dumped["hint"] is not None
