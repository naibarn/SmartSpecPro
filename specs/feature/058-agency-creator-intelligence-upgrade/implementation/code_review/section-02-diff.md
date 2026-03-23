diff --git a/python-backend/app/api/agency_creator.py b/python-backend/app/api/agency_creator.py
index 93cf57f4..2dfadb41 100644
--- a/python-backend/app/api/agency_creator.py
+++ b/python-backend/app/api/agency_creator.py
@@ -129,11 +129,15 @@ async def submit_agency_creator_answers(
 
     store_answers(body.task_id, body.answers)
 
-    # Retrieve stored payload + intent, dispatch design task
+    # Retrieve stored payload + intent + discover_analysis, dispatch design task
     payload = status.get("_payload", {})
     intent = status.get("_intent", {})
     model = status.get("_model", "gpt-4o")
-    design_payload = {**payload, "intent": intent, "answers": body.answers, "model": model}
+    discover_analysis = status.get("_discover_analysis", {})
+    design_payload = {
+        **payload, "intent": intent, "answers": body.answers,
+        "model": model, "discover_analysis": discover_analysis,
+    }
 
     _set_status(body.task_id, {
         "status": "processing",
diff --git a/python-backend/app/tasks/agency_creator_task.py b/python-backend/app/tasks/agency_creator_task.py
index 601b7f21..1d709c6d 100644
--- a/python-backend/app/tasks/agency_creator_task.py
+++ b/python-backend/app/tasks/agency_creator_task.py
@@ -30,6 +30,21 @@ logger = structlog.get_logger(__name__)
 REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
 RESULT_TTL = 7200  # 2 hours
 MAX_DISCOVER_CALLS = 2  # Budget cap: max LLM calls during discover phase
+MAX_GOAL_QUESTIONS = 3  # Max goal-clarification questions to present
+
+TECHNICAL_KEYWORDS = [
+    "execution mode", "model", "planning strategy", "capability",
+    "memory", "agentic", "react", "single_shot",
+]
+
+
+def _filter_goal_questions(questions: list) -> list:
+    """Keep only goal-clarification questions, remove technical ones."""
+    filtered = [
+        q for q in questions
+        if not any(kw in q.get("question", "").lower() for kw in TECHNICAL_KEYWORDS)
+    ]
+    return filtered[:MAX_GOAL_QUESTIONS]
 
 _redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
 
@@ -146,9 +161,16 @@ async def _discover_async(task_id: str, user_id: int, payload: dict) -> dict:
 
     intent = await _llm_discover(requirement, model, user_id)
 
+    # Extract discover analysis for design phase
+    discover_analysis = {
+        "recommended_capabilities": intent.get("recommended_capabilities", {}),
+        "complexity_level": intent.get("complexity_level", "moderate"),
+        "memory_recommendation": intent.get("memory_recommendation", True),
+    }
+
     # Phase 2: INTERVIEW — decide if we need more info
     if skip_interview or intent.get("is_clear", True):
-        # Immediately dispatch design task
+        # Immediately dispatch design task with discover_analysis
         _set_status(task_id, {
             "status": "processing",
             "phase": "design",
@@ -158,17 +180,18 @@ async def _discover_async(task_id: str, user_id: int, payload: dict) -> dict:
         create_agency_design_task.delay(
             task_id=task_id,
             user_id=user_id,
-            payload={**payload, "intent": intent, "answers": {}},
+            payload={**payload, "intent": intent, "answers": {}, "discover_analysis": discover_analysis},
         )
         return {"status": "dispatched"}
 
-    questions = intent.get("questions", [])
+    # Filter out technical questions, keep only goal-clarification ones
+    questions = _filter_goal_questions(intent.get("questions", []))
     if not questions:
-        # No questions → go straight to design
+        # No goal questions remain → go straight to design
         create_agency_design_task.delay(
             task_id=task_id,
             user_id=user_id,
-            payload={**payload, "intent": intent, "answers": {}},
+            payload={**payload, "intent": intent, "answers": {}, "discover_analysis": discover_analysis},
         )
         return {"status": "dispatched"}
 
@@ -181,6 +204,7 @@ async def _discover_async(task_id: str, user_id: int, payload: dict) -> dict:
         "_payload": payload,  # stored for when design task is dispatched
         "_intent": intent,
         "_model": model,
+        "_discover_analysis": discover_analysis,
         # _user_jwt intentionally omitted — never persist bearer tokens at rest in Redis
     })
     return {"status": "awaiting_answers", "questions": questions}
@@ -232,6 +256,7 @@ async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
     requirement: str = payload.get("requirement", "")
     intent: dict = payload.get("intent", {})
     answers: dict = payload.get("answers", {})
+    discover_analysis: dict = payload.get("discover_analysis", {})
     raw_model: str = payload.get("model", "gpt-4o")
     # SECURITY: Restrict model to known safe models to prevent cost bypass
     ALLOWED_CREATOR_MODELS = {"gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"}
diff --git a/python-backend/tests/test_agency_creator_v2.py b/python-backend/tests/test_agency_creator_v2.py
index e29c7a7a..83fe984d 100644
--- a/python-backend/tests/test_agency_creator_v2.py
+++ b/python-backend/tests/test_agency_creator_v2.py
@@ -6,7 +6,9 @@ import pytest
 from unittest.mock import AsyncMock, MagicMock, patch
 
 from app.tasks.agency_creator_task import (
+    _discover_async,
     _fallback_plan,
+    _filter_goal_questions,
     _llm_discover,
     _llm_plan,
     _llm_review_plan,
@@ -14,6 +16,8 @@ from app.tasks.agency_creator_task import (
     _validate_spec,
     _safe_json_parse,
     MAX_DISCOVER_CALLS,
+    MAX_GOAL_QUESTIONS,
+    TECHNICAL_KEYWORDS,
 )
 
 
@@ -127,6 +131,125 @@ class TestLlmDiscover:
         assert "Do NOT ask technical questions" in system_prompt
 
 
+@pytest.mark.unit
+@pytest.mark.agency
+class TestFilterGoalQuestions:
+    def test_technical_questions_filtered(self):
+        questions = [
+            {"id": "q1", "question": "Who is the target audience?", "type": "text"},
+            {"id": "q2", "question": "Which execution mode do you want?", "type": "text"},
+            {"id": "q3", "question": "What model should be used?", "type": "text"},
+            {"id": "q4", "question": "What is the main goal?", "type": "text"},
+        ]
+        filtered = _filter_goal_questions(questions)
+        assert len(filtered) == 2
+        assert filtered[0]["id"] == "q1"
+        assert filtered[1]["id"] == "q4"
+
+    def test_filters_all_technical_keywords(self):
+        for kw in TECHNICAL_KEYWORDS:
+            questions = [{"id": "q1", "question": f"Should we use {kw}?", "type": "text"}]
+            filtered = _filter_goal_questions(questions)
+            assert len(filtered) == 0, f"Keyword '{kw}' was not filtered"
+
+    def test_limits_to_max_goal_questions(self):
+        questions = [
+            {"id": f"q{i}", "question": f"Goal question {i}?", "type": "text"}
+            for i in range(10)
+        ]
+        filtered = _filter_goal_questions(questions)
+        assert len(filtered) == MAX_GOAL_QUESTIONS
+
+    def test_empty_questions_returns_empty(self):
+        assert _filter_goal_questions([]) == []
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestDiscoverAnalysisPassthrough:
+    @pytest.mark.asyncio
+    async def test_discover_analysis_passed_to_design_on_skip_interview(self):
+        discover_response = json.dumps({
+            "is_clear": True, "domain": "research", "estimated_agents": 2,
+            "questions": [], "notes": "",
+            "recommended_capabilities": {
+                "web_search": True, "thinking": True, "vision": False,
+                "code_execution": False, "computer_use": False,
+            },
+            "complexity_level": "moderate", "memory_recommendation": True,
+            "domain_insights": "Research benefits from web search",
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_llm, \
+             patch("app.tasks.agency_creator_task.create_agency_design_task") as mock_design, \
+             patch("app.tasks.agency_creator_task._set_status"):
+            mock_llm.return_value = discover_response
+            await _discover_async("test-task", 1, {
+                "requirement": "Build a research team",
+                "skipInterview": True,
+                "model": "gpt-4o",
+            })
+
+        mock_design.delay.assert_called_once()
+        call_payload = mock_design.delay.call_args.kwargs["payload"]
+        assert "discover_analysis" in call_payload
+        da = call_payload["discover_analysis"]
+        assert da["recommended_capabilities"]["web_search"] is True
+        assert da["complexity_level"] == "moderate"
+
+    @pytest.mark.asyncio
+    async def test_discover_analysis_passed_when_is_clear(self):
+        discover_response = json.dumps({
+            "is_clear": True, "domain": "general", "estimated_agents": 2,
+            "questions": [], "notes": "",
+            "recommended_capabilities": {
+                "web_search": False, "thinking": False, "vision": False,
+                "code_execution": True, "computer_use": False,
+            },
+            "complexity_level": "simple", "memory_recommendation": False,
+            "domain_insights": "",
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_llm, \
+             patch("app.tasks.agency_creator_task.create_agency_design_task") as mock_design, \
+             patch("app.tasks.agency_creator_task._set_status"):
+            mock_llm.return_value = discover_response
+            await _discover_async("test-task", 1, {
+                "requirement": "Build a calculator", "model": "gpt-4o",
+            })
+
+        call_payload = mock_design.delay.call_args.kwargs["payload"]
+        assert call_payload["discover_analysis"]["recommended_capabilities"]["code_execution"] is True
+
+    @pytest.mark.asyncio
+    async def test_discover_analysis_stored_in_redis_for_interview(self):
+        discover_response = json.dumps({
+            "is_clear": False, "domain": "general", "estimated_agents": 2,
+            "questions": [{"id": "q1", "question": "What is the goal?", "type": "text"}],
+            "notes": "",
+            "recommended_capabilities": {
+                "web_search": True, "thinking": False, "vision": False,
+                "code_execution": False, "computer_use": False,
+            },
+            "complexity_level": "simple", "memory_recommendation": True,
+            "domain_insights": "",
+        })
+
+        status_calls = []
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_llm, \
+             patch("app.tasks.agency_creator_task._set_status", side_effect=lambda tid, s: status_calls.append(s)):
+            mock_llm.return_value = discover_response
+            result = await _discover_async("test-task", 1, {
+                "requirement": "Build something", "model": "gpt-4o",
+            })
+
+        assert result["status"] == "awaiting_answers"
+        # The last _set_status call should have _discover_analysis
+        awaiting_status = status_calls[-1]
+        assert "_discover_analysis" in awaiting_status
+        assert awaiting_status["_discover_analysis"]["recommended_capabilities"]["web_search"] is True
+
+
 @pytest.mark.unit
 @pytest.mark.agency
 class TestValidateSpecComputerUseGuardrail:
