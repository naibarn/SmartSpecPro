diff --git a/apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx b/apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx
index 31b56f4d..4c933128 100644
--- a/apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx
+++ b/apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx
@@ -46,7 +46,10 @@ const MAX_POLL_WAIT_MS = 5 * 60 * 1000; // 5 minutes
 const PHASES = [
   { id: "discover", label: "Discover" },
   { id: "interview", label: "Interview" },
+  { id: "plan", label: "Plan" },
+  { id: "review_plan", label: "Review Plan" },
   { id: "design", label: "Design" },
+  { id: "review_design", label: "Review Design" },
   { id: "validate", label: "Validate" },
   { id: "implement", label: "Implement" },
   { id: "verify", label: "Verify" },
diff --git a/python-backend/app/tasks/agency_creator_task.py b/python-backend/app/tasks/agency_creator_task.py
index 9f66089f..1247b443 100644
--- a/python-backend/app/tasks/agency_creator_task.py
+++ b/python-backend/app/tasks/agency_creator_task.py
@@ -227,23 +227,79 @@ def create_agency_design_task(
 
 
 async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
-    """Async implementation of DESIGN → DOCUMENT phases."""
+    """Async implementation of PLAN → DOCUMENT phases (10-phase pipeline v2)."""
     requirement: str = payload.get("requirement", "")
     intent: dict = payload.get("intent", {})
     answers: dict = payload.get("answers", {})
     model: str = payload.get("model", "gpt-4o")
     tenant_id: str = payload.get("tenantId", "")
 
-    # Phase 3: DESIGN
+    # Budget tracking
+    llm_call_count = 0
+    MAX_LLM_CALLS = 12
+
+    async def _budget_llm_call(system_prompt, user_message, max_tokens=4000, timeout=120.0):
+        nonlocal llm_call_count
+        if llm_call_count >= MAX_LLM_CALLS:
+            logger.warning("agency_creator_budget_exhausted", task_id=task_id, calls=llm_call_count)
+            return None
+        llm_call_count += 1
+        return await _llm_call(system_prompt, user_message, model, user_id, max_tokens, timeout)
+
+    # Fetch available skills for the plan phase
+    available_skills = await _fetch_available_skills(tenant_id)
+
+    # Phase 3: PLAN
+    _set_status(task_id, {
+        "status": "processing",
+        "phase": "plan",
+        "message": "Planning agency architecture...",
+        "_user_id": user_id,
+    })
+    plan = await _llm_plan(requirement, intent, answers, available_skills, model, user_id)
+
+    # Phase 4: REVIEW_PLAN (max 3 iterations)
+    for iteration in range(1, 4):
+        if llm_call_count >= MAX_LLM_CALLS:
+            break
+        _set_status(task_id, {
+            "status": "processing",
+            "phase": "review_plan",
+            "message": f"Reviewing plan (iteration {iteration}/3)...",
+            "_user_id": user_id,
+        })
+        review = await _llm_review_plan(plan, model, user_id)
+        if not review or review.get("verdict") == "pass":
+            break
+        if review.get("fixedPlan"):
+            plan = review["fixedPlan"]
+
+    # Phase 5: DESIGN
     _set_status(task_id, {
         "status": "processing",
         "phase": "design",
         "message": "Designing agency architecture...",
         "_user_id": user_id,
     })
-    spec = await _llm_design(requirement, intent, answers, model, user_id)
+    spec = await _llm_design(requirement, intent, answers, model, user_id, plan_steps=plan.get("planSteps"))
+
+    # Phase 6: REVIEW_DESIGN (max 3 iterations)
+    for iteration in range(1, 4):
+        if llm_call_count >= MAX_LLM_CALLS:
+            break
+        _set_status(task_id, {
+            "status": "processing",
+            "phase": "review_design",
+            "message": f"Reviewing design (iteration {iteration}/3)...",
+            "_user_id": user_id,
+        })
+        review = await _llm_review_design(spec, model, user_id)
+        if not review or review.get("verdict") == "pass":
+            break
+        if review.get("fixedSpec"):
+            spec = review["fixedSpec"]
 
-    # Phase 4: VALIDATE (self-review)
+    # Phase 7: VALIDATE
     _set_status(task_id, {
         "status": "processing",
         "phase": "validate",
@@ -252,7 +308,7 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
     })
     spec = _validate_spec(spec)
 
-    # Phase 5: IMPLEMENT — call Node.js internal API to create agency
+    # Phase 8: IMPLEMENT — call Node.js internal API to create agency
     _set_status(task_id, {
         "status": "processing",
         "phase": "implement",
@@ -273,7 +329,7 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
         logger.error("agency_creator_implement_returned_none", task_id=task_id)
         return {"status": "failed", "error": "Agency creation failed"}
 
-    # Phase 6: VERIFY
+    # Phase 9: VERIFY
     _set_status(task_id, {
         "status": "processing",
         "phase": "verify",
@@ -282,7 +338,7 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
         "agencyId": agency_id,
     })
 
-    # Phase 7: DOCUMENT
+    # Phase 10: DOCUMENT
     _set_status(task_id, {
         "status": "processing",
         "phase": "document",
@@ -300,7 +356,10 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
         "guide": guide,
         "_user_id": user_id,
     })
-    logger.info("agency_creator_completed", task_id=task_id, agency_id=agency_id)
+    logger.info(
+        "agency_creator_completed",
+        task_id=task_id, agency_id=agency_id, llm_calls=llm_call_count,
+    )
     return {"status": "completed", "agencyId": agency_id}
 
 
@@ -381,8 +440,202 @@ Only ask questions that are truly necessary to design the agency. Skip if the re
     return {"is_clear": True, "domain": "general", "estimated_agents": 3, "questions": []}
 
 
-async def _llm_design(requirement: str, intent: dict, answers: dict, model: str, user_id: int) -> dict:
-    """Phase 3: Design the agency architecture as JSON spec."""
+async def _fetch_available_skills(tenant_id: str) -> list[dict]:
+    """Fetch available skills from internal API for plan phase."""
+    try:
+        import httpx
+
+        internal_token = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
+        base_url = os.getenv("INTERNAL_API_BASE", "http://localhost:3000")
+        async with httpx.AsyncClient(timeout=10.0) as client:
+            resp = await client.get(
+                f"{base_url}/api/internal/skills/list",
+                params={"tenantId": tenant_id} if tenant_id else {},
+                headers={"X-Internal-Token": internal_token},
+            )
+            if resp.status_code == 200:
+                data = resp.json()
+                return data.get("skills", data) if isinstance(data, dict) else data
+    except Exception as exc:
+        logger.warning("agency_creator_fetch_skills_error", error=str(exc)[:200])
+    return []
+
+
+NODE_TYPE_CATALOG = """AVAILABLE NODE TYPES (use these in planSteps):
+- agent: General-purpose AI worker with tools
+- supervisor: Coordinates other agents, delegates tasks
+- router: Routes messages to different agents based on content
+- aggregator: Collects outputs from multiple agents, synthesizes
+- conditional_branch: Branches execution based on rules, LLM classification, or context
+- parallel_fan_out: Runs N branches concurrently, merges results
+- loop_retry: Repeats a sub-flow until exit condition met
+- knowledge_base: Injects RAG knowledge into the flow
+- skill_call: Executes a specific SmartSpecPro skill with input mapping
+- skill_discovery: Auto-detects the best skill for a task
+- data_transform: Transforms data between nodes (JSONPath, template, filter)
+- error_handler: Catches errors from watched nodes, applies retry/fallback/skip
+- human_approval: Pauses execution for human review
+- browser_session: Opens interactive browser session"""
+
+
+async def _llm_plan(
+    requirement: str,
+    intent: dict,
+    answers: dict,
+    available_skills: list[dict],
+    model: str,
+    user_id: int,
+) -> dict:
+    """Phase 3: Plan the agency architecture with all 14 node types."""
+    skills_text = ""
+    if available_skills:
+        skills_text = "\n\nAVAILABLE SKILLS:\n" + "\n".join(
+            f"- {s.get('name', s.get('id', 'unknown'))}: {s.get('description', '')[:100]}"
+            for s in available_skills[:20]
+        )
+
+    answers_text = ""
+    if answers:
+        answers_text = "\n\nClarification answers:\n" + "\n".join(
+            f"- {k}: {v}" for k, v in answers.items()
+        )
+
+    system_prompt = f"""You are an AI agency architect. Plan a multi-agent agency architecture.
+
+{NODE_TYPE_CATALOG}
+{skills_text}
+
+Return JSON:
+{{
+  "topology": "orchestrator_worker" | "handoff_chain" | "hybrid" | "custom",
+  "planSteps": [
+    {{
+      "nodeType": "agent",
+      "name": "Step Name",
+      "purpose": "What this step does",
+      "skillId": null,
+      "connections": ["other-step-name"]
+    }}
+  ],
+  "rationale": "Brief explanation of design decisions"
+}}
+
+RULES:
+- Use the most appropriate node type for each step
+- Include error_handler for critical steps
+- Use conditional_branch when decisions are needed
+- Use parallel_fan_out when tasks are independent
+- Keep it practical: 3-8 nodes is usually best
+- Entry point must be agent or supervisor"""
+
+    user_message = f"Requirement: {requirement}{answers_text}\n\nDomain analysis: {json.dumps(intent)}"
+
+    content = await _llm_call(
+        system_prompt=system_prompt,
+        user_message=user_message,
+        model=model,
+        user_id=user_id,
+        max_tokens=2000,
+        timeout=90.0,
+    )
+    if content:
+        plan = _safe_json_parse(content, None)
+        if plan and "planSteps" in plan:
+            return plan
+
+    # Fallback: minimal plan
+    return _fallback_plan(requirement, intent)
+
+
+def _fallback_plan(requirement: str, intent: dict) -> dict:
+    """Minimal fallback plan when PLAN LLM call fails."""
+    return {
+        "topology": "orchestrator_worker",
+        "planSteps": [
+            {"nodeType": "supervisor", "name": "Coordinator", "purpose": "Coordinates the workflow", "connections": ["Worker"]},
+            {"nodeType": "agent", "name": "Worker", "purpose": requirement[:200], "connections": []},
+        ],
+        "rationale": "Fallback minimal plan",
+    }
+
+
+async def _llm_review_plan(plan: dict, model: str, user_id: int) -> dict | None:
+    """Phase 4: Review the plan for completeness and correctness."""
+    system_prompt = """You are an AI agency plan reviewer. Review the following plan for quality.
+
+Check these criteria:
+1. Completeness: Does the plan cover all aspects of the requirement?
+2. Dependencies: Are node connections logical?
+3. Node types: Are the right node types used for each step?
+4. Error handling: Are error_handler nodes included for critical steps?
+5. Quality gates: Are review/approval steps needed?
+6. Human oversight: Should human_approval be added anywhere?
+7. Skills usage: Are available skills leveraged when appropriate?
+8. Efficiency: Can the plan be simplified without losing quality?
+
+Return JSON:
+{
+  "verdict": "pass" | "needs_fix",
+  "issues": ["list of issues found"],
+  "fixedPlan": { ... }  // only if verdict is "needs_fix" — the corrected plan
+}"""
+
+    content = await _llm_call(
+        system_prompt=system_prompt,
+        user_message=f"Plan to review:\n{json.dumps(plan, indent=2)}",
+        model=model,
+        user_id=user_id,
+        max_tokens=3000,
+        timeout=90.0,
+    )
+    if content:
+        return _safe_json_parse(content, None)
+    return None
+
+
+async def _llm_review_design(spec: dict, model: str, user_id: int) -> dict | None:
+    """Phase 6: Review the design spec for correctness and completeness."""
+    system_prompt = """You are an AI agency design reviewer. Review the agency spec for production readiness.
+
+Check these criteria:
+1. Connectivity: All nodes reachable from entry point
+2. Entry point: Exactly one, must be agent or supervisor
+3. Conditional completeness: All conditional_branch nodes have defaultTargetNodeId
+4. Loop safety: All loop_retry nodes have maxIterations <= 20
+5. Parallel completeness: parallel_fan_out nodes have >= 2 branches and mergeStrategy
+6. Error coverage: Critical agent nodes have error_handler watching them
+7. Skill configs: skill_call nodes have valid skillId or skillSlug
+8. Edge types: Edges reference valid node IDs
+9. Tool assignments: Agents have appropriate tools for their role
+10. Credit safety: No excessive loops or parallel branches
+
+Return JSON:
+{
+  "verdict": "pass" | "needs_fix",
+  "issues": ["list of issues found"],
+  "fixedSpec": { ... }  // only if verdict is "needs_fix" — the corrected spec
+}"""
+
+    # Truncate spec to fit in context
+    spec_str = json.dumps(spec, indent=2)
+    if len(spec_str) > 8000:
+        spec_str = spec_str[:8000] + "\n... (truncated)"
+
+    content = await _llm_call(
+        system_prompt=system_prompt,
+        user_message=f"Spec to review:\n{spec_str}",
+        model=model,
+        user_id=user_id,
+        max_tokens=4000,
+        timeout=120.0,
+    )
+    if content:
+        return _safe_json_parse(content, None)
+    return None
+
+
+async def _llm_design(requirement: str, intent: dict, answers: dict, model: str, user_id: int, plan_steps: list | None = None) -> dict:
+    """Phase 5: Design the agency architecture as JSON spec."""
     answers_text = ""
     if answers:
         answers_text = "\n\nClarification answers:\n" + "\n".join(
@@ -448,7 +701,11 @@ OTHER RULES:
 - Model defaults to gpt-4o if not specified
 - Keep it simple: 2-6 nodes is usually best"""
 
-    user_message = f"Requirement: {requirement}{answers_text}\n\nDomain analysis: {json.dumps(intent)}"
+    plan_text = ""
+    if plan_steps:
+        plan_text = f"\n\nArchitecture plan (follow this structure):\n{json.dumps(plan_steps, indent=2)}"
+
+    user_message = f"Requirement: {requirement}{answers_text}\n\nDomain analysis: {json.dumps(intent)}{plan_text}"
 
     content = await _llm_call(
         system_prompt=system_prompt,
@@ -510,6 +767,64 @@ def _validate_spec(spec: dict) -> dict:
                 if non_router:
                     cfg["defaultTargetNodeId"] = non_router[-1]["id"]
 
+    # Validate new node types (sections 17-21)
+    non_tool_node_types = {
+        "skill_call", "skill_discovery", "data_transform", "error_handler",
+        "knowledge_base", "human_approval", "browser_session",
+    }
+    for node in nodes:
+        nt = node.get("nodeType", "agent")
+        cfg = node.setdefault("nodeConfig", {})
+
+        if nt == "conditional_branch":
+            if not cfg.get("defaultTargetNodeId") and len(nodes) > 1:
+                non_cond = [n for n in nodes if n.get("nodeType") != "conditional_branch"]
+                if non_cond:
+                    cfg["defaultTargetNodeId"] = non_cond[0]["id"]
+
+        elif nt == "parallel_fan_out":
+            branches = cfg.get("branches", [])
+            if len(branches) < 2:
+                # Ensure at least 2 branches
+                while len(branches) < 2:
+                    branches.append({"targetNodeId": "", "label": f"Branch {len(branches) + 1}"})
+                cfg["branches"] = branches
+            if not cfg.get("mergeStrategy"):
+                cfg["mergeStrategy"] = "wait_all"
+            max_c = cfg.get("maxConcurrent")
+            if isinstance(max_c, (int, float)):
+                cfg["maxConcurrent"] = max(2, min(10, int(max_c)))
+
+        elif nt == "loop_retry":
+            exit_cond = cfg.setdefault("exitCondition", {"mode": "max_iterations"})
+            max_iter = exit_cond.get("maxIterations", 5)
+            if isinstance(max_iter, (int, float)):
+                exit_cond["maxIterations"] = max(1, min(20, int(max_iter)))
+
+        elif nt == "error_handler":
+            watched = cfg.get("watchedNodeIds", [])
+            if isinstance(watched, list):
+                cfg["watchedNodeIds"] = [w for w in watched if w in node_ids]
+            max_retries = cfg.get("retryConfig", {}).get("maxRetries")
+            if isinstance(max_retries, (int, float)):
+                cfg.setdefault("retryConfig", {})["maxRetries"] = max(0, min(5, int(max_retries)))
+
+        elif nt == "skill_discovery":
+            if "confidenceThreshold" not in cfg:
+                cfg["confidenceThreshold"] = 0.7
+            if "maxResults" not in cfg:
+                cfg["maxResults"] = 5
+
+        elif nt == "data_transform":
+            if not cfg.get("transformMode"):
+                cfg["transformMode"] = "jsonpath"
+            if not cfg.get("outputKey"):
+                cfg["outputKey"] = "transform_result"
+
+        # Strip toolIds from non-tool node types
+        if nt in non_tool_node_types:
+            node["toolIds"] = []
+
     # Validate toolIds — only allow known builtin IDs
     valid_tool_ids = {
         "builtin-web-search", "builtin-code-interpreter", "builtin-file-reader",
@@ -518,11 +833,12 @@ def _validate_spec(spec: dict) -> dict:
         "builtin-webhook", "builtin-slack-message", "builtin-document-search",
     }
     for node in nodes:
-        tool_ids = node.get("toolIds", node.get("tools", []))
-        if isinstance(tool_ids, list):
-            node["toolIds"] = [t for t in tool_ids if isinstance(t, str) and t in valid_tool_ids]
-        else:
-            node["toolIds"] = []
+        if node.get("nodeType") not in non_tool_node_types:
+            tool_ids = node.get("toolIds", node.get("tools", []))
+            if isinstance(tool_ids, list):
+                node["toolIds"] = [t for t in tool_ids if isinstance(t, str) and t in valid_tool_ids]
+            else:
+                node["toolIds"] = []
 
     spec["nodes"] = nodes
     return spec
diff --git a/python-backend/tests/test_agency_creator_v2.py b/python-backend/tests/test_agency_creator_v2.py
new file mode 100644
index 00000000..cbe9891f
--- /dev/null
+++ b/python-backend/tests/test_agency_creator_v2.py
@@ -0,0 +1,214 @@
+"""Tests for AI Creator v2 — 10-phase pipeline with PLAN, REVIEW_PLAN, REVIEW_DESIGN."""
+
+import json
+
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from app.tasks.agency_creator_task import (
+    _fallback_plan,
+    _llm_plan,
+    _llm_review_plan,
+    _llm_review_design,
+    _validate_spec,
+    _safe_json_parse,
+)
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestLlmPlan:
+    @pytest.mark.asyncio
+    async def test_plan_generates_plan_steps_with_valid_node_types(self):
+        valid_types = {
+            "agent", "supervisor", "router", "aggregator",
+            "knowledge_base", "skill_call", "human_approval", "browser_session",
+            "conditional_branch", "parallel_fan_out", "loop_retry", "skill_discovery",
+            "data_transform", "error_handler",
+        }
+        plan_response = json.dumps({
+            "topology": "hybrid",
+            "planSteps": [
+                {"nodeType": "supervisor", "name": "Coordinator", "purpose": "Coordinates", "connections": ["Worker"]},
+                {"nodeType": "agent", "name": "Worker", "purpose": "Does work", "connections": []},
+                {"nodeType": "conditional_branch", "name": "Router", "purpose": "Routes", "connections": []},
+            ],
+            "rationale": "Test plan",
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = plan_response
+            result = await _llm_plan("test requirement", {}, {}, [], "gpt-4o", 1)
+
+        assert "planSteps" in result
+        for step in result["planSteps"]:
+            assert step["nodeType"] in valid_types
+
+    @pytest.mark.asyncio
+    async def test_plan_fallback_on_llm_failure(self):
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = None
+            result = await _llm_plan("test", {}, {}, [], "gpt-4o", 1)
+
+        assert "planSteps" in result
+        assert len(result["planSteps"]) >= 2
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestLlmReviewPlan:
+    @pytest.mark.asyncio
+    async def test_review_plan_catches_issues(self):
+        review_response = json.dumps({
+            "verdict": "needs_fix",
+            "issues": ["no error handler for critical agent"],
+            "fixedPlan": {"planSteps": [{"nodeType": "agent", "name": "Fixed"}]},
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = review_response
+            result = await _llm_review_plan({"planSteps": []}, "gpt-4o", 1)
+
+        assert result["verdict"] == "needs_fix"
+        assert len(result["issues"]) > 0
+
+    @pytest.mark.asyncio
+    async def test_review_plan_passes_clean_plan(self):
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = json.dumps({"verdict": "pass"})
+            result = await _llm_review_plan({"planSteps": []}, "gpt-4o", 1)
+
+        assert result["verdict"] == "pass"
+        assert mock_call.call_count == 1
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestLlmReviewDesign:
+    @pytest.mark.asyncio
+    async def test_review_design_catches_orphan_nodes(self):
+        review_response = json.dumps({
+            "verdict": "needs_fix",
+            "issues": ["node-5 is orphaned"],
+            "fixedSpec": {"nodes": [], "edges": []},
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = review_response
+            result = await _llm_review_design({"nodes": [], "edges": []}, "gpt-4o", 1)
+
+        assert result["verdict"] == "needs_fix"
+        assert any("orphan" in issue.lower() for issue in result["issues"])
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestValidateSpecV2:
+    def test_conditional_branch_gets_default_target(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "conditional_branch", "name": "Branch", "nodeConfig": {}},
+            ],
+            "edges": [{"fromNodeId": "n1", "toNodeId": "n2"}],
+        }
+        result = _validate_spec(spec)
+        branch = next(n for n in result["nodes"] if n["nodeType"] == "conditional_branch")
+        assert branch["nodeConfig"].get("defaultTargetNodeId") is not None
+
+    def test_loop_retry_clamps_max_iterations(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "loop_retry", "name": "Loop", "nodeConfig": {
+                    "exitCondition": {"mode": "max_iterations", "maxIterations": 50},
+                }},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        loop = next(n for n in result["nodes"] if n["nodeType"] == "loop_retry")
+        assert loop["nodeConfig"]["exitCondition"]["maxIterations"] <= 20
+
+    def test_parallel_fan_out_ensures_min_branches(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "parallel_fan_out", "name": "Fan Out", "nodeConfig": {
+                    "branches": [{"targetNodeId": "n1", "label": "Branch 1"}],
+                }},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        fan_out = next(n for n in result["nodes"] if n["nodeType"] == "parallel_fan_out")
+        assert len(fan_out["nodeConfig"]["branches"]) >= 2
+        assert fan_out["nodeConfig"]["mergeStrategy"] == "wait_all"
+
+    def test_error_handler_clamps_max_retries(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "error_handler", "name": "Handler", "nodeConfig": {
+                    "watchedNodeIds": ["n1"],
+                    "retryConfig": {"maxRetries": 10},
+                }},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        handler = next(n for n in result["nodes"] if n["nodeType"] == "error_handler")
+        assert handler["nodeConfig"]["retryConfig"]["maxRetries"] <= 5
+
+    def test_skill_discovery_gets_defaults(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "skill_discovery", "name": "Discover", "nodeConfig": {}},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        sd = next(n for n in result["nodes"] if n["nodeType"] == "skill_discovery")
+        assert sd["nodeConfig"]["confidenceThreshold"] == 0.7
+        assert sd["nodeConfig"]["maxResults"] == 5
+
+    def test_data_transform_gets_defaults(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent"},
+                {"id": "n2", "nodeType": "data_transform", "name": "Transform", "nodeConfig": {}},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        dt = next(n for n in result["nodes"] if n["nodeType"] == "data_transform")
+        assert dt["nodeConfig"]["transformMode"] == "jsonpath"
+        assert dt["nodeConfig"]["outputKey"] == "transform_result"
+
+    def test_non_tool_nodes_stripped_of_tool_ids(self):
+        spec = {
+            "nodes": [
+                {"id": "n1", "nodeType": "agent", "isEntryPoint": True, "name": "Agent",
+                 "toolIds": ["builtin-web-search"]},
+                {"id": "n2", "nodeType": "skill_call", "name": "Skill",
+                 "toolIds": ["builtin-web-search"], "nodeConfig": {}},
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        agent = next(n for n in result["nodes"] if n["nodeType"] == "agent")
+        skill = next(n for n in result["nodes"] if n["nodeType"] == "skill_call")
+        assert len(agent["toolIds"]) > 0  # Agent keeps tools
+        assert len(skill["toolIds"]) == 0  # skill_call stripped
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestFallbackPlan:
+    def test_fallback_returns_valid_plan(self):
+        plan = _fallback_plan("test requirement", {})
+        assert "planSteps" in plan
+        assert len(plan["planSteps"]) >= 2
+        types = {s["nodeType"] for s in plan["planSteps"]}
+        assert "supervisor" in types or "agent" in types
