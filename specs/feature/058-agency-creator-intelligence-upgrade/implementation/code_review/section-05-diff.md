diff --git a/python-backend/app/tasks/agency_creator_task.py b/python-backend/app/tasks/agency_creator_task.py
index 5157356b..0f689cd3 100644
--- a/python-backend/app/tasks/agency_creator_task.py
+++ b/python-backend/app/tasks/agency_creator_task.py
@@ -31,6 +31,9 @@ REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
 RESULT_TTL = 7200  # 2 hours
 MAX_DISCOVER_CALLS = 2  # Budget cap: max LLM calls during discover phase
 MAX_GOAL_QUESTIONS = 3  # Max goal-clarification questions to present
+MAX_SUGGESTIONS = 5  # Cap on improvement suggestions
+RATE_LIMIT_MAX = 5  # Max agency creations per hour per user
+RATE_LIMIT_TTL = 3600  # 1 hour
 
 TECHNICAL_KEYWORDS = [
     "execution mode", "model", "planning strategy", "capability",
@@ -98,6 +101,42 @@ def get_answers(task_id: str) -> dict[str, str]:
     return json.loads(raw) if raw else {}
 
 
+def store_suggestions(task_id: str, suggestions: list[dict]) -> None:
+    """Store improvement suggestions in a separate Redis key (F09 isolation)."""
+    try:
+        r = _get_redis()
+        r.set(f"agency-creator:{task_id}:suggestions", json.dumps(suggestions, default=str), ex=RESULT_TTL)
+    except Exception as exc:
+        logger.error("agency_creator_store_suggestions_failed", task_id=task_id, error=str(exc)[:200])
+
+
+def get_suggestions(task_id: str) -> list[dict]:
+    """Read improvement suggestions from Redis."""
+    r = _get_redis()
+    raw = r.get(f"agency-creator:{task_id}:suggestions")
+    if raw is None:
+        return []
+    try:
+        data = json.loads(raw)
+        return data if isinstance(data, list) else []
+    except (json.JSONDecodeError, ValueError):
+        return []
+
+
+def check_rate_limit(user_id: int) -> None:
+    """Enforce per-user rate limit on agency creation (F10).
+
+    Raises ValueError if user has exceeded RATE_LIMIT_MAX creations in the TTL window.
+    """
+    r = _get_redis()
+    rate_key = f"agency-creator:ratelimit:{user_id}"
+    current = int(r.get(rate_key) or 0)
+    if current >= RATE_LIMIT_MAX:
+        raise ValueError("Rate limit exceeded — max 5 agency creations per hour")
+    r.incr(rate_key)
+    r.expire(rate_key, RATE_LIMIT_TTL)
+
+
 def create_task_id() -> str:
     return f"agcreate-{uuid.uuid4().hex[:12]}"
 
@@ -208,6 +247,19 @@ def create_agency_discover_task(
     Otherwise returns with status='awaiting_answers' + questions for the frontend to render.
     """
     logger.info("agency_creator_discover_started", task_id=task_id)
+
+    # F10: Rate limit check before any LLM calls
+    try:
+        check_rate_limit(user_id)
+    except ValueError as exc:
+        logger.warning("agency_creator_rate_limited", task_id=task_id, user_id=user_id)
+        _set_status(task_id, {
+            "status": "failed",
+            "error": str(exc),
+            "_user_id": user_id,
+        })
+        return {"status": "failed", "error": str(exc)}
+
     _set_status(task_id, {
         "status": "processing",
         "phase": "discover",
@@ -348,7 +400,7 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
 
     # Budget tracking
     llm_call_count = 0
-    MAX_LLM_CALLS = 12
+    MAX_LLM_CALLS = 18
 
     async def _budget_llm_call(system_prompt, user_message, max_tokens=4000, timeout=120.0):
         nonlocal llm_call_count
@@ -460,17 +512,36 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
     })
     guide = await _llm_document(spec, model, user_id)
 
+    # Phase 11: SUGGEST — generate optional improvement suggestions
+    suggestions: list[dict] = []
+    try:
+        _set_status(task_id, {
+            "status": "processing",
+            "phase": "suggest",
+            "message": "Generating improvement suggestions...",
+            "_user_id": user_id,
+            "agencyId": agency_id,
+        })
+        suggestions = await _llm_suggest_improvements(spec, model, user_id)
+        if suggestions:
+            store_suggestions(task_id, suggestions)
+    except Exception as exc:
+        logger.warning("agency_creator_suggest_failed", task_id=task_id, error=str(exc)[:200])
+        # Non-fatal — continue to completion
+
     _set_status(task_id, {
         "status": "completed",
         "phase": "done",
         "agencyId": agency_id,
         "previewJson": spec,
         "guide": guide,
+        "hasSuggestions": len(suggestions) > 0,
         "_user_id": user_id,
     })
     logger.info(
         "agency_creator_completed",
         task_id=task_id, agency_id=agency_id, llm_calls=llm_call_count,
+        suggestions_count=len(suggestions),
     )
     return {"status": "completed", "agencyId": agency_id}
 
@@ -1359,6 +1430,80 @@ async def _llm_document(spec: dict, model: str, user_id: int) -> str:
     return content or f"Agency '{spec.get('name')}' created successfully. Start a conversation to begin using it."
 
 
+async def _llm_suggest_improvements(spec: dict, model: str, user_id: int) -> list[dict]:
+    """Generate optional improvement suggestions for a newly created agency.
+
+    Returns list of suggestion dicts (max 5), or empty list on failure.
+    """
+    system_prompt = """You are an AI agency improvement advisor. Given a completed agency spec, suggest 3-5 optional improvements.
+
+Return JSON array:
+[
+  {
+    "category": "add_capability" | "add_node" | "upgrade_mode" | "add_tool" | "improve_flow",
+    "title": "Short title (max 50 chars)",
+    "description": "What to change and why (max 200 chars)",
+    "impact": "high" | "medium" | "low",
+    "targetNodeId": "node-id or null for agency-level",
+    "change": { ... specific typed action ... }
+  }
+]
+
+CATEGORY ACTIONS (return the specific typed field, NOT arbitrary JSON):
+- add_capability: {"capability": "supportsVision"} — set modelRequirements.supportsX = true
+- upgrade_mode: {"executionMode": "agentic", "planningStrategy": "plan_and_solve"} — change execution mode
+- add_tool: {"toolId": "builtin-web-search"} — add a tool to the agent
+- add_node: description only — user applies manually in builder
+- improve_flow: description only — user applies manually
+
+Only suggest genuinely valuable improvements. Don't suggest things already in the spec."""
+
+    nodes_summary = [{"id": n.get("id"), "name": n.get("name"), "nodeType": n.get("nodeType")} for n in spec.get("nodes", [])]
+    user_message = (
+        f"Agency: {spec.get('name')}\n"
+        f"Description: {spec.get('description')}\n"
+        f"Nodes: {json.dumps(nodes_summary)}"
+    )
+
+    content = await _llm_call(
+        system_prompt=system_prompt,
+        user_message=user_message,
+        model=model,
+        user_id=user_id,
+        max_tokens=1500,
+        timeout=60.0,
+    )
+
+    if not content:
+        return []
+
+    parsed = _safe_json_parse(content, None)
+    if not isinstance(parsed, list):
+        return []
+
+    # Validate and cap
+    valid_categories = {"add_capability", "add_node", "upgrade_mode", "add_tool", "improve_flow"}
+    valid_impacts = {"high", "medium", "low"}
+    suggestions = []
+    for item in parsed[:MAX_SUGGESTIONS]:
+        if not isinstance(item, dict):
+            continue
+        if item.get("category") not in valid_categories:
+            continue
+        if item.get("impact") not in valid_impacts:
+            item["impact"] = "medium"
+        suggestions.append({
+            "category": item["category"],
+            "title": str(item.get("title", ""))[:50],
+            "description": str(item.get("description", ""))[:200],
+            "impact": item["impact"],
+            "targetNodeId": item.get("targetNodeId"),
+            "change": item.get("change", {}),
+        })
+
+    return suggestions
+
+
 # ─── Helpers ─────────────────────────────────────────────────────────────────
 
 def _safe_json_parse(content: str, default: Any) -> Any:
diff --git a/python-backend/tests/test_agency_creator_v2.py b/python-backend/tests/test_agency_creator_v2.py
index 1e469ea6..509c7179 100644
--- a/python-backend/tests/test_agency_creator_v2.py
+++ b/python-backend/tests/test_agency_creator_v2.py
@@ -13,8 +13,10 @@ from app.tasks.agency_creator_task import (
     _llm_plan,
     _llm_review_plan,
     _llm_review_design,
+    _llm_suggest_improvements,
     _validate_spec,
     _safe_json_parse,
+    check_rate_limit,
     MAX_DISCOVER_CALLS,
     MAX_GOAL_QUESTIONS,
     TECHNICAL_KEYWORDS,
@@ -722,3 +724,151 @@ class TestFallbackPlan:
         assert len(plan["planSteps"]) >= 2
         types = {s["nodeType"] for s in plan["planSteps"]}
         assert "supervisor" in types or "agent" in types
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestSuggestImprovements:
+    @pytest.mark.asyncio
+    async def test_suggest_returns_list(self):
+        """_llm_suggest_improvements returns a list of dicts with required fields."""
+        suggestions = json.dumps([
+            {
+                "category": "add_capability",
+                "title": "Enable vision for image analysis",
+                "description": "Add vision to the researcher node for chart analysis",
+                "impact": "high",
+                "targetNodeId": "agent-1",
+                "change": {"capability": "supportsVision"},
+            },
+            {
+                "category": "add_tool",
+                "title": "Add web search",
+                "description": "Enable web search for real-time data",
+                "impact": "medium",
+                "targetNodeId": "agent-2",
+                "change": {"toolId": "builtin-web-search"},
+            },
+        ])
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = suggestions
+            result = await _llm_suggest_improvements(
+                {"name": "Test Agency", "nodes": [{"id": "agent-1", "name": "Researcher"}]},
+                "gpt-4o", 1,
+            )
+
+        assert isinstance(result, list)
+        assert len(result) == 2
+        for s in result:
+            assert "category" in s
+            assert "title" in s
+            assert "description" in s
+            assert "impact" in s
+
+    @pytest.mark.asyncio
+    async def test_suggest_max_5(self):
+        """Suggestions are capped at 5 even if LLM returns more."""
+        many = [
+            {"category": "add_tool", "title": f"Suggestion {i}", "description": "desc",
+             "impact": "low", "targetNodeId": None, "change": {}}
+            for i in range(10)
+        ]
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = json.dumps(many)
+            result = await _llm_suggest_improvements({"name": "Test", "nodes": []}, "gpt-4o", 1)
+
+        assert len(result) <= 5
+
+    @pytest.mark.asyncio
+    async def test_suggest_fallback_empty_on_failure(self):
+        """Returns empty list when LLM call fails."""
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = None
+            result = await _llm_suggest_improvements({"name": "Test", "nodes": []}, "gpt-4o", 1)
+
+        assert result == []
+
+    @pytest.mark.asyncio
+    async def test_suggest_fallback_on_bad_json(self):
+        """Returns empty list when LLM returns non-JSON."""
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = "This is not JSON"
+            result = await _llm_suggest_improvements({"name": "Test", "nodes": []}, "gpt-4o", 1)
+
+        assert result == []
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestRateLimit:
+    def test_rate_limit_allows_under_threshold(self):
+        """Rate limit passes when under 5 calls per hour."""
+        mock_redis = MagicMock()
+        mock_redis.get.return_value = "3"
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            # Should not raise
+            check_rate_limit(user_id=42)
+
+    def test_rate_limit_blocks_at_threshold(self):
+        """Rate limit raises when at 5 calls."""
+        mock_redis = MagicMock()
+        mock_redis.get.return_value = "5"
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            with pytest.raises(ValueError, match="Rate limit exceeded"):
+                check_rate_limit(user_id=42)
+
+    def test_rate_limit_increments_and_sets_ttl(self):
+        """Rate limit increments counter and sets 1h TTL."""
+        mock_redis = MagicMock()
+        mock_redis.get.return_value = None  # First call
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            check_rate_limit(user_id=42)
+
+        mock_redis.incr.assert_called_once_with("agency-creator:ratelimit:42")
+        mock_redis.expire.assert_called_once_with("agency-creator:ratelimit:42", 3600)
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestSuggestionsRedisIsolation:
+    def test_suggestions_stored_in_separate_key(self):
+        """Suggestions are stored in a separate Redis key, not in main status."""
+        mock_redis = MagicMock()
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            from app.tasks.agency_creator_task import store_suggestions, get_suggestions
+
+            suggestions = [{"category": "add_tool", "title": "Test"}]
+            store_suggestions("task-123", suggestions)
+
+            mock_redis.set.assert_called_once()
+            call_args = mock_redis.set.call_args
+            assert call_args[0][0] == "agency-creator:task-123:suggestions"
+
+    def test_get_suggestions_returns_list(self):
+        """get_suggestions returns parsed list from Redis."""
+        mock_redis = MagicMock()
+        mock_redis.get.return_value = json.dumps([{"category": "add_tool", "title": "Test"}])
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            from app.tasks.agency_creator_task import get_suggestions
+            result = get_suggestions("task-123")
+
+        assert isinstance(result, list)
+        assert len(result) == 1
+
+    def test_get_suggestions_returns_empty_on_missing(self):
+        """get_suggestions returns empty list when key doesn't exist."""
+        mock_redis = MagicMock()
+        mock_redis.get.return_value = None
+
+        with patch("app.tasks.agency_creator_task._get_redis", return_value=mock_redis):
+            from app.tasks.agency_creator_task import get_suggestions
+            result = get_suggestions("task-123")
+
+        assert result == []
