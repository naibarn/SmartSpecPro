diff --git a/apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx b/apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx
index f784f31..e03fffe 100644
--- a/apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx
+++ b/apps/web/client/src/components/workflow/AutoCreateWorkflowModal.tsx
@@ -93,6 +93,8 @@ export function AutoCreateWorkflowModal({
   } | null>(null);
   const [phase, setPhase] = useState<GenerationPhase>("idle");
   const [errorMessage, setErrorMessage] = useState("");
+  const [validationError, setValidationError] = useState<string | null>(null);
+  const [hint, setHint] = useState<string | null>(null);
   const [elapsedSeconds, setElapsedSeconds] = useState(0);
   const [taskId, setTaskId] = useState<string | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
@@ -156,6 +158,8 @@ export function AutoCreateWorkflowModal({
           setTaskId(null);
         } else if (status.status === "failed") {
           setErrorMessage(status.error || "Unknown error occurred");
+          setValidationError(status.validationError ?? null);
+          setHint(status.hint ?? null);
           setPhase("error");
           setTaskId(null);
         }
@@ -227,6 +231,8 @@ export function AutoCreateWorkflowModal({
     setPhase("sending");
     setResult(null);
     setErrorMessage("");
+    setValidationError(null);
+    setHint(null);
 
     try {
       const data = await generateMutation.mutateAsync({
@@ -269,6 +275,8 @@ export function AutoCreateWorkflowModal({
     setPhase("idle");
     setTaskId(null);
     setErrorMessage("");
+    setValidationError(null);
+    setHint(null);
   };
 
   const isGenerating =
@@ -456,20 +464,37 @@ export function AutoCreateWorkflowModal({
           {phase === "error" && !result && (
             <div className="border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-3">
               <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
-              <div>
+              <div className="flex-1">
                 <p className="text-sm font-medium text-red-800 dark:text-red-200">
                   Generation failed
                 </p>
                 <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                   {errorMessage ||
-                    "The LLM did not return a valid workflow. Try simplifying your description or using a different model."}
+                    "The LLM did not return a valid workflow. Try simplifying your description."}
                 </p>
+                {validationError && (
+                  <details className="mt-2">
+                    <summary className="text-xs text-red-500 cursor-pointer">
+                      Technical details
+                    </summary>
+                    <pre className="text-xs text-red-500 mt-1 whitespace-pre-wrap font-mono">
+                      {validationError}
+                    </pre>
+                  </details>
+                )}
+                {hint && (
+                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
+                    Suggestion: {hint}
+                  </p>
+                )}
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => {
                     setPhase("idle");
                     setErrorMessage("");
+                    setValidationError(null);
+                    setHint(null);
                   }}
                   className="mt-2 h-7 text-xs border-red-300 text-red-700"
                 >
diff --git a/apps/web/server/routers/workflow.ts b/apps/web/server/routers/workflow.ts
index 4edc69c..182d6cc 100644
--- a/apps/web/server/routers/workflow.ts
+++ b/apps/web/server/routers/workflow.ts
@@ -496,6 +496,8 @@ export const workflowRouter = router({
           nodes?: unknown[];
           edges?: unknown[];
           description?: string;
+          validationError?: string;
+          hint?: string;
         };
       } catch (error: any) {
         if (error instanceof TRPCError) throw error;
diff --git a/python-backend/app/api/workflows.py b/python-backend/app/api/workflows.py
index 89a46d0..9868ae9 100644
--- a/python-backend/app/api/workflows.py
+++ b/python-backend/app/api/workflows.py
@@ -284,6 +284,8 @@ async def get_generate_status(
         return WorkflowGenerateStatusResponse(
             status="failed",
             error=status_data.get("error", "Unknown error"),
+            validationError=status_data.get("validationError"),
+            hint=status_data.get("hint"),
         )
     else:
         return WorkflowGenerateStatusResponse(
diff --git a/python-backend/app/orchestrator/workflow_generator.py b/python-backend/app/orchestrator/workflow_generator.py
index c7262ed..62e5cec 100644
--- a/python-backend/app/orchestrator/workflow_generator.py
+++ b/python-backend/app/orchestrator/workflow_generator.py
@@ -8,6 +8,7 @@ centrally — exactly the same as every other LLM call in the platform.
 from __future__ import annotations
 
 import json
+import os
 import re
 import time
 from typing import Any
@@ -15,9 +16,28 @@ from typing import Any
 import structlog
 
 from app.clients.web_gateway import forward_chat_json
+from app.orchestrator.workflow_validator import GeneratedWorkflow
 
 logger = structlog.get_logger(__name__)
 
+# ---------------------------------------------------------------------------
+# Few-shot cache — populated from database, refreshed every 24h
+# ---------------------------------------------------------------------------
+_few_shot_cache: list[dict[str, Any]] = []
+_few_shot_loaded_at: float = 0.0
+_FEW_SHOT_TTL = 86400.0  # 24 hours
+
+# Static selection — one per major category from the 60 seeded templates
+_FEW_SHOT_TEMPLATE_KEYS: list[str] = [
+    "tpl-055",  # Customer Service (onboarding sequence)
+    "tpl-019",  # IT & DevOps (error log analysis)
+    "tpl-039",  # Logistics (shipment status notification)
+    "tpl-032",  # Personal Productivity (news digest)
+    "tpl-048",  # Customer Service (support ticket triage)
+]
+
+_MAX_FEW_SHOT_TOKENS = 3000
+
 # ---------------------------------------------------------------------------
 # System prompt
 # ---------------------------------------------------------------------------
@@ -97,6 +117,11 @@ OUTPUT FORMAT
   "description": "<one sentence summary>"
 }
 
+"""
+
+# The examples section is dynamically injected via _build_system_prompt().
+# Keep the built-in examples as a fallback when DB is unavailable.
+_BUILTIN_EXAMPLES = """\
 ════════════════════════════════════════
 BUILT-IN EXAMPLES (study these carefully)
 ════════════════════════════════════════
@@ -203,10 +228,133 @@ EXAMPLE C — Workflow with User Input Form (form_input):
 """
 
 
+# ---------------------------------------------------------------------------
+# Few-shot helpers
+# ---------------------------------------------------------------------------
+
+
+def _load_from_db() -> list[dict[str, Any]]:
+    """Synchronous DB query for Celery worker context."""
+    database_url = os.getenv("DATABASE_URL", "")
+    if not database_url:
+        return []
+    sync_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
+    try:
+        from sqlalchemy import create_engine, text
+
+        engine = create_engine(sync_url, pool_pre_ping=True)
+        with engine.connect() as conn:
+            rows = conn.execute(
+                text(
+                    'SELECT name, description, "workflowJson" FROM workflow_templates '
+                    'WHERE "templateKey" = ANY(:keys) AND "isPublic" = true '
+                    "LIMIT 5"
+                ),
+                {"keys": _FEW_SHOT_TEMPLATE_KEYS},
+            ).fetchall()
+        engine.dispose()
+        return [{"name": r[0], "description": r[1], "workflowJson": r[2]} for r in rows]
+    except Exception as exc:
+        logger.warning("few_shot_db_load_failed", error=str(exc)[:200])
+        return []
+
+
+def _truncate_to_token_budget(
+    examples: list[dict[str, Any]],
+    max_tokens: int = _MAX_FEW_SHOT_TOKENS,
+) -> list[dict[str, Any]]:
+    """Trim few-shot examples to fit within the token budget."""
+    if not examples:
+        return []
+
+    # Truncate long config strings in workflowJson
+    trimmed = []
+    for ex in examples:
+        wf = ex.get("workflowJson")
+        if isinstance(wf, dict):
+            wf = json.loads(json.dumps(wf))  # deep copy
+            for node in wf.get("nodes", []):
+                config = node.get("data", {}).get("config", {})
+                for k, v in list(config.items()):
+                    if isinstance(v, str) and len(v) > 100:
+                        config[k] = v[:97] + "..."
+        trimmed.append({"name": ex["name"], "description": ex["description"], "workflowJson": wf})
+
+    total_tokens = len(json.dumps(trimmed)) // 4
+    if total_tokens <= max_tokens:
+        return trimmed
+
+    # Reduce to 3 examples if still over budget
+    trimmed = trimmed[:3]
+    return trimmed
+
+
+def load_few_shot_examples(force: bool = False) -> list[dict[str, Any]]:
+    """Load few-shot workflow examples from the database with 24h cache."""
+    global _few_shot_cache, _few_shot_loaded_at
+
+    now = time.monotonic()
+    if not force and _few_shot_cache and (now - _few_shot_loaded_at) < _FEW_SHOT_TTL:
+        return _few_shot_cache
+
+    raw = _load_from_db()
+    _few_shot_cache = _truncate_to_token_budget(raw)
+    _few_shot_loaded_at = now
+    return _few_shot_cache
+
+
+def _build_system_prompt(few_shot_examples: list[dict[str, Any]]) -> str:
+    """Build the system prompt, injecting few-shot examples or falling back to built-in."""
+    if not few_shot_examples:
+        return _SYSTEM_PROMPT + "\n" + _BUILTIN_EXAMPLES
+
+    examples_text = (
+        "════════════════════════════════════════\n"
+        "CURATED EXAMPLES (study these carefully)\n"
+        "════════════════════════════════════════\n\n"
+    )
+    for i, ex in enumerate(few_shot_examples, 1):
+        examples_text += f"# Example {i}: {ex['name']}\n"
+        examples_text += f"Description: {ex['description']}\n"
+        examples_text += f"Workflow JSON:\n{json.dumps(ex['workflowJson'], indent=2)}\n\n"
+
+    return _SYSTEM_PROMPT + "\n" + examples_text
+
+
+def _derive_hint(validation_error: str | None) -> str:
+    """Derive a user-facing hint from a validation error message."""
+    if not validation_error:
+        return "Try rephrasing your request with more specific steps and tools."
+    ve_lower = validation_error.lower()
+    if "trigger" in ve_lower:
+        return (
+            "Try describing when the workflow should start "
+            "(e.g., 'every morning at 7 AM' or 'when a webhook is received')."
+        )
+    if "unknown nodetype" in ve_lower or "nodeType" in validation_error:
+        return (
+            "Be more specific about which tools or apps are involved. "
+            "Use standard node types like 'llm_call', 'http_request', or 'send_email'."
+        )
+    if "source" in ve_lower or "target" in ve_lower:
+        return (
+            "Try simplifying the workflow description — "
+            "fewer branching paths make it easier to generate correctly."
+        )
+    return "Try rephrasing your request with more specific steps and tools."
+
+
 class WorkflowGenerationError(Exception):
-    def __init__(self, message: str) -> None:
+    def __init__(
+        self,
+        message: str,
+        validation_error: str | None = None,
+        hint: str | None = None,
+    ) -> None:
         super().__init__(message)
         self.message = message
+        self.validation_error = validation_error
+        self.hint = hint
 
 
 class WorkflowGenerator:
@@ -263,7 +411,7 @@ class WorkflowGenerator:
 
         payload: dict[str, Any] = {
             "messages": [
-                {"role": "system", "content": _SYSTEM_PROMPT},
+                {"role": "system", "content": _build_system_prompt(load_few_shot_examples())},
                 {"role": "user", "content": user_message},
             ],
             "temperature": 0.1,
@@ -634,3 +782,159 @@ class WorkflowGenerator:
                     "workflow_generator_form_input_default",
                     message="Added default form field configuration"
                 )
+
+    # ------------------------------------------------------------------
+    # _call_llm_once — single LLM call extracted from generate()
+    # ------------------------------------------------------------------
+
+    async def _call_llm_once(
+        self,
+        prompt: str,
+        node_types: list[dict[str, Any]] | None = None,
+        model: str | None = None,
+        user_token: str | None = None,
+        default_model: str | None = None,
+    ) -> dict[str, Any]:
+        """Make a single LLM call and return the parsed workflow dict."""
+        effective_node_types = node_types or []
+        node_types_text = self._format_node_types(effective_node_types)
+        workflow_model = default_model or model or "gpt-4o-mini"
+
+        user_message = (
+            "════════════════════════════════════════\n"
+            "AVAILABLE NODE TYPES\n"
+            "════════════════════════════════════════\n"
+            f"{node_types_text}\n\n"
+            "════════════════════════════════════════\n"
+            "WORKFLOW SETTINGS\n"
+            "════════════════════════════════════════\n"
+            f'WORKFLOW_DEFAULT_MODEL: "{workflow_model}"\n\n'
+            "════════════════════════════════════════\n"
+            "USER REQUEST\n"
+            "════════════════════════════════════════\n"
+            f"{prompt}\n\n"
+            "Generate the complete, fully-connected workflow JSON now.\n"
+            "• Every node must have at least one edge.\n"
+            "• Use ONLY port names listed in the node specs above.\n"
+            "• Populate ALL config fields with sensible defaults.\n"
+            f'• For every llm_call node set config.model to "{workflow_model}".'
+        )
+
+        payload: dict[str, Any] = {
+            "messages": [
+                {"role": "system", "content": _build_system_prompt(load_few_shot_examples())},
+                {"role": "user", "content": user_message},
+            ],
+            "temperature": 0.1,
+            "max_tokens": 6000,
+        }
+        if model:
+            payload["model"] = model
+
+        t0 = time.monotonic()
+        try:
+            response = await forward_chat_json(payload=payload, user_token=user_token)
+        except Exception as exc:
+            logger.error("workflow_generator_gateway_error", error=str(exc))
+            raise WorkflowGenerationError(f"Gateway call failed: {exc}") from exc
+
+        elapsed_ms = int((time.monotonic() - t0) * 1000)
+
+        if response.status_code != 200:
+            body_text = response.text[:500]
+            raise WorkflowGenerationError(
+                f"Gateway returned HTTP {response.status_code}: {body_text}"
+            )
+
+        try:
+            resp_json = response.json()
+            raw = resp_json["choices"][0]["message"]["content"]
+        except (KeyError, IndexError, ValueError) as exc:
+            raise WorkflowGenerationError(
+                f"Unexpected gateway response format: {exc}"
+            ) from exc
+
+        logger.info(
+            "workflow_generator_response",
+            elapsed_ms=elapsed_ms,
+            model=resp_json.get("model", model),
+            chars=len(raw),
+        )
+
+        return self._parse_and_validate(raw, effective_node_types, workflow_model)
+
+    # ------------------------------------------------------------------
+    # _build_retry_prompt — append correction context for retries
+    # ------------------------------------------------------------------
+
+    def _build_retry_prompt(
+        self,
+        original_prompt: str,
+        previous_error: str | None,
+        attempt: int,
+    ) -> str:
+        """Append validation error context to prompt for retry attempts."""
+        if previous_error is None or attempt == 1:
+            return original_prompt
+        return (
+            f"{original_prompt}\n\n"
+            f"[CORRECTION REQUIRED — Attempt {attempt}]\n"
+            f"Your previous response failed validation with this error:\n"
+            f"{previous_error}\n"
+            f"Fix ONLY the specific issue described above. Do not change other parts of the workflow."
+        )
+
+    # ------------------------------------------------------------------
+    # generate_with_retry — retry loop with Pydantic v2 validation
+    # ------------------------------------------------------------------
+
+    async def generate_with_retry(
+        self,
+        prompt: str,
+        node_types: list[dict[str, Any]] | None = None,
+        model: str | None = None,
+        user_token: str | None = None,
+        default_model: str | None = None,
+        max_attempts: int = 3,
+    ) -> dict[str, Any]:
+        """Generate a workflow with up to max_attempts LLM calls.
+
+        On each failed attempt, the Pydantic ValidationError message is fed
+        back to the LLM as a correction instruction.
+        """
+        from pydantic import ValidationError
+
+        last_validation_error: str | None = None
+
+        for attempt in range(1, max_attempts + 1):
+            full_prompt = self._build_retry_prompt(
+                original_prompt=prompt,
+                previous_error=last_validation_error,
+                attempt=attempt,
+            )
+
+            raw_dict = await self._call_llm_once(
+                prompt=full_prompt,
+                node_types=node_types,
+                model=model,
+                user_token=user_token,
+                default_model=default_model,
+            )
+
+            try:
+                workflow = GeneratedWorkflow.model_validate(raw_dict)
+                return workflow.model_dump()
+            except ValidationError as e:
+                last_validation_error = str(e)
+                logger.warning(
+                    "workflow_generator_validation_failure",
+                    attempt=attempt,
+                    max_attempts=max_attempts,
+                    error=last_validation_error[:200],
+                )
+
+        raise WorkflowGenerationError(
+            message=f"Workflow generation failed after {max_attempts} attempts.",
+            validation_error=last_validation_error,
+            hint=_derive_hint(last_validation_error),
+        )
diff --git a/python-backend/app/tasks/workflow_gen_tasks.py b/python-backend/app/tasks/workflow_gen_tasks.py
index 17cecd7..c298e5b 100644
--- a/python-backend/app/tasks/workflow_gen_tasks.py
+++ b/python-backend/app/tasks/workflow_gen_tasks.py
@@ -69,7 +69,7 @@ def create_task_id() -> str:
 
 @celery_app.task(
     bind=True,
-    max_retries=1,
+    max_retries=0,  # Application-level retry loop in generate_with_retry() handles retries
     name="app.tasks.workflow_gen_tasks.generate_workflow",
     soft_time_limit=540,   # 9 min soft limit
     time_limit=600,        # 10 min hard limit
@@ -88,6 +88,7 @@ def generate_workflow_task(
 
     Runs the LLM call in a background worker so the API can return immediately.
     Status is tracked in Redis for frontend polling.
+    Uses generate_with_retry() for up to 3 LLM attempts with validation feedback.
     """
     logger.info(
         "workflow_gen_task_started",
@@ -99,11 +100,11 @@ def generate_workflow_task(
     _set_status(task_id, {"status": "processing", "message": "Generating workflow via LLM..."})
 
     try:
-        from app.orchestrator.workflow_generator import WorkflowGenerator
+        from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError
 
         generator = WorkflowGenerator()
         result = _run_async(
-            generator.generate(
+            generator.generate_with_retry(
                 prompt=prompt,
                 node_types=node_types,
                 model=model,
@@ -125,21 +126,23 @@ def generate_workflow_task(
         )
         return result
 
+    except WorkflowGenerationError as e:
+        logger.error("workflow_gen_task_failed", task_id=task_id, error=e.message)
+        _set_status(task_id, {
+            "status": "failed",
+            "error": e.message,
+            "validationError": e.validation_error,
+            "hint": e.hint,
+        })
+        return {"status": "failed", "error": e.message}
+
     except Exception as e:
         error_msg = str(e)
         logger.error("workflow_gen_task_failed", task_id=task_id, error=error_msg)
-
         _set_status(task_id, {
             "status": "failed",
             "error": error_msg,
+            "validationError": None,
+            "hint": None,
         })
-
-        # Retry once on transient failures
-        if self.request.retries < self.max_retries:
-            _set_status(task_id, {
-                "status": "processing",
-                "message": "Retrying after transient error...",
-            })
-            raise self.retry(exc=e, countdown=5)
-
         return {"status": "failed", "error": error_msg}
diff --git a/python-backend/tests/test_workflow_generator.py b/python-backend/tests/test_workflow_generator.py
new file mode 100644
index 0000000..4cb5db5
--- /dev/null
+++ b/python-backend/tests/test_workflow_generator.py
@@ -0,0 +1,277 @@
+"""
+Unit tests for workflow generator retry loop and few-shot cache.
+All LLM gateway calls are mocked — no network calls.
+Run: cd python-backend && uv run pytest tests/test_workflow_generator.py -m unit -v
+"""
+import json
+import time
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+from pydantic import ValidationError
+
+
+# --- Valid workflow fixture ---
+VALID_WORKFLOW = {
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
+            "data": {"nodeType": "llm_call", "label": "Generate", "config": {"model": "gpt-4o-mini", "temperature": 0.7, "maxTokens": 1000}},
+        },
+        {
+            "id": "resp_1",
+            "type": "workflow",
+            "position": {"x": 560, "y": 0},
+            "data": {"nodeType": "workflow_response", "label": "Output", "config": {"status": "success"}},
+        },
+    ],
+    "edges": [
+        {"id": "e1", "source": "trigger_1", "target": "llm_1", "sourceHandle": "params", "targetHandle": "prompt", "type": "smoothstep"},
+        {"id": "e2", "source": "llm_1", "target": "resp_1", "sourceHandle": "response", "targetHandle": "data", "type": "smoothstep"},
+    ],
+    "description": "Simple LLM workflow",
+}
+
+# Missing trigger node — will fail validation
+INVALID_WORKFLOW_NO_TRIGGER = {
+    "nodes": [
+        {
+            "id": "llm_1",
+            "type": "workflow",
+            "position": {"x": 0, "y": 0},
+            "data": {"nodeType": "llm_call", "label": "Generate", "config": {}},
+        },
+    ],
+    "edges": [],
+    "description": "Missing trigger",
+}
+
+
+def _make_gateway_response(workflow_dict: dict, status_code: int = 200) -> MagicMock:
+    """Create a mock HTTP response from the gateway."""
+    resp = MagicMock()
+    resp.status_code = status_code
+    resp.json.return_value = {
+        "choices": [{"message": {"content": json.dumps(workflow_dict)}}],
+        "model": "test-model",
+    }
+    resp.text = json.dumps(workflow_dict)
+    return resp
+
+
+# ---------------------------------------------------------------------------
+# Retry loop tests
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_first_attempt_success_returns_immediately():
+    """If the first LLM response is valid, result is returned with exactly 1 LLM call."""
+    from app.orchestrator.workflow_generator import WorkflowGenerator
+
+    generator = WorkflowGenerator()
+    mock_response = _make_gateway_response(VALID_WORKFLOW)
+
+    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
+        mock_gateway.return_value = mock_response
+        result = await generator.generate_with_retry(
+            prompt="Make a simple workflow",
+            max_attempts=3,
+        )
+
+    assert mock_gateway.call_count == 1
+    assert "nodes" in result
+    assert len(result["nodes"]) == 3
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_second_attempt_success_after_first_failure():
+    """If attempt 1 fails validation and attempt 2 succeeds, result returned, LLM called twice."""
+    from app.orchestrator.workflow_generator import WorkflowGenerator
+
+    generator = WorkflowGenerator()
+    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
+    good_response = _make_gateway_response(VALID_WORKFLOW)
+
+    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
+        mock_gateway.side_effect = [bad_response, good_response]
+        result = await generator.generate_with_retry(
+            prompt="Make a simple workflow",
+            max_attempts=3,
+        )
+
+    assert mock_gateway.call_count == 2
+    assert len(result["nodes"]) == 3
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_all_three_attempts_fail_raises_error():
+    """After 3 failed attempts, WorkflowGenerationError is raised with the last error details."""
+    from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError
+
+    generator = WorkflowGenerator()
+    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
+
+    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
+        mock_gateway.return_value = bad_response
+        with pytest.raises(WorkflowGenerationError) as exc_info:
+            await generator.generate_with_retry(
+                prompt="Make a workflow",
+                max_attempts=3,
+            )
+
+    assert mock_gateway.call_count == 3
+    assert "3 attempts" in str(exc_info.value)
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_error_raised_includes_validation_error_and_hint():
+    """WorkflowGenerationError from 3 failures must carry .validation_error and .hint attributes."""
+    from app.orchestrator.workflow_generator import WorkflowGenerator, WorkflowGenerationError
+
+    generator = WorkflowGenerator()
+    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
+
+    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
+        mock_gateway.return_value = bad_response
+        with pytest.raises(WorkflowGenerationError) as exc_info:
+            await generator.generate_with_retry(prompt="Make a workflow", max_attempts=3)
+
+    assert exc_info.value.validation_error is not None
+    assert "trigger" in exc_info.value.validation_error.lower()
+    assert exc_info.value.hint is not None
+
+
+@pytest.mark.unit
+@pytest.mark.asyncio
+async def test_retry_prompt_includes_previous_error_message():
+    """On retry, the previous ValidationError message is appended to the LLM prompt."""
+    from app.orchestrator.workflow_generator import WorkflowGenerator
+
+    generator = WorkflowGenerator()
+    bad_response = _make_gateway_response(INVALID_WORKFLOW_NO_TRIGGER)
+    good_response = _make_gateway_response(VALID_WORKFLOW)
+
+    with patch("app.orchestrator.workflow_generator.forward_chat_json", new_callable=AsyncMock) as mock_gateway:
+        mock_gateway.side_effect = [bad_response, good_response]
+        await generator.generate_with_retry(prompt="Make a workflow", max_attempts=3)
+
+    # Second call should include correction instruction in the user message
+    second_call_payload = mock_gateway.call_args_list[1]
+    payload = second_call_payload[1].get("payload") or second_call_payload[0][0]
+    user_msg = payload["messages"][-1]["content"]
+    assert "CORRECTION REQUIRED" in user_msg
+
+
+@pytest.mark.unit
+def test_celery_task_max_retries_is_zero():
+    """Celery task must have max_retries=0 — application retry loop handles retries."""
+    from app.tasks.workflow_gen_tasks import generate_workflow_task
+    assert generate_workflow_task.max_retries == 0
+
+
+# ---------------------------------------------------------------------------
+# Few-shot cache tests
+# ---------------------------------------------------------------------------
+
+
+@pytest.mark.unit
+def test_few_shot_cache_populated_after_first_call():
+    """Module-level few-shot cache is set after the first call to load_few_shot_examples()."""
+    import app.orchestrator.workflow_generator as wg
+
+    # Reset cache
+    wg._few_shot_cache = []
+    wg._few_shot_loaded_at = 0.0
+
+    mock_examples = [
+        {"name": "Test WF", "description": "Test", "workflowJson": VALID_WORKFLOW}
+    ]
+
+    with patch.object(wg, "_load_from_db", return_value=mock_examples):
+        result = wg.load_few_shot_examples(force=True)
+
+    assert len(result) > 0
+    assert wg._few_shot_cache == result
+
+
+@pytest.mark.unit
+def test_few_shot_cache_not_refreshed_within_24_hours():
+    """If cache was loaded less than 24h ago, it is not re-queried from the database."""
+    import app.orchestrator.workflow_generator as wg
+
+    cached = [{"name": "Cached", "description": "Cached", "workflowJson": VALID_WORKFLOW}]
+    wg._few_shot_cache = cached
+    wg._few_shot_loaded_at = time.monotonic()  # just now
+
+    with patch.object(wg, "_load_from_db") as mock_db:
+        result = wg.load_few_shot_examples()
+
+    mock_db.assert_not_called()
+    assert result == cached
+
+
+@pytest.mark.unit
+def test_few_shot_cache_refreshed_after_24_hours():
+    """If 24+ hours have elapsed since last load, cache is refreshed from the database."""
+    import app.orchestrator.workflow_generator as wg
+
+    wg._few_shot_cache = [{"name": "Old", "description": "Old", "workflowJson": {}}]
+    wg._few_shot_loaded_at = time.monotonic() - 90000  # 25 hours ago
+
+    new_examples = [{"name": "New", "description": "New", "workflowJson": VALID_WORKFLOW}]
+    with patch.object(wg, "_load_from_db", return_value=new_examples):
+        result = wg.load_few_shot_examples()
+
+    assert result[0]["name"] == "New"
+
+
+@pytest.mark.unit
+def test_few_shot_examples_within_token_budget():
+    """Combined token count of loaded few-shot examples must be <= 3000."""
+    import app.orchestrator.workflow_generator as wg
+
+    result = wg._truncate_to_token_budget([
+        {"name": "Ex1", "description": "D1", "workflowJson": VALID_WORKFLOW},
+        {"name": "Ex2", "description": "D2", "workflowJson": VALID_WORKFLOW},
+        {"name": "Ex3", "description": "D3", "workflowJson": VALID_WORKFLOW},
+        {"name": "Ex4", "description": "D4", "workflowJson": VALID_WORKFLOW},
+        {"name": "Ex5", "description": "D5", "workflowJson": VALID_WORKFLOW},
+    ])
+
+    total_tokens = len(json.dumps(result)) // 4
+    assert total_tokens <= 3000
+
+
+@pytest.mark.unit
+def test_builtin_examples_removed_when_curated_loaded():
+    """When few-shot examples are loaded, the built-in EXAMPLE A/B/C blocks are absent from the prompt."""
+    import app.orchestrator.workflow_generator as wg
+
+    curated = [
+        {"name": "Curated WF", "description": "Test curated", "workflowJson": VALID_WORKFLOW}
+    ]
+    prompt = wg._build_system_prompt(curated)
+    assert "EXAMPLE A" not in prompt
+    assert "Curated WF" in prompt
+
+
+@pytest.mark.unit
+def test_builtin_examples_present_when_no_curated():
+    """When no curated examples are available, the built-in EXAMPLE A/B/C blocks remain."""
+    import app.orchestrator.workflow_generator as wg
+
+    prompt = wg._build_system_prompt([])
+    assert "EXAMPLE A" in prompt
