diff --git a/python-backend/app/api/agency_creator.py b/python-backend/app/api/agency_creator.py
index ffad929b..8c1efced 100644
--- a/python-backend/app/api/agency_creator.py
+++ b/python-backend/app/api/agency_creator.py
@@ -8,14 +8,11 @@ Endpoints:
 
 import structlog
 from fastapi import APIRouter, Depends, HTTPException
-from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
 from pydantic import BaseModel, Field
 
 from app.core.auth import get_current_user
 from app.models.user import User
 
-_bearer_scheme = HTTPBearer()
-
 router = APIRouter()
 logger = structlog.get_logger(__name__)
 
@@ -37,7 +34,6 @@ class AgencyCreatorAnswerRequest(BaseModel):
 @router.post("/start")
 async def start_agency_creator(
     body: AgencyCreatorStartRequest,
-    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
     current_user: User = Depends(get_current_user),
 ):
     """Submit agency creation to Celery queue. Returns task_id immediately."""
@@ -66,12 +62,8 @@ async def start_agency_creator(
         payload["specFileBase64"] = body.spec_file_base64
 
     try:
-        # Get the bearer token from Authorization header
-        user_jwt = credentials.credentials
-
         create_agency_discover_task.delay(
             task_id=task_id,
-            user_jwt=user_jwt,
             user_id=current_user.id,
             payload=payload,
         )
@@ -88,7 +80,7 @@ async def start_agency_creator(
         })
         import threading
         t = threading.Thread(
-            target=lambda: _run_async(_discover_async(task_id, user_jwt, current_user.id, payload)),
+            target=lambda: _run_async(_discover_async(task_id, current_user.id, payload)),
             daemon=True,
         )
         t.start()
@@ -119,7 +111,6 @@ async def get_agency_creator_status(
 @router.post("/answer")
 async def submit_agency_creator_answers(
     body: AgencyCreatorAnswerRequest,
-    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
     current_user: User = Depends(get_current_user),
 ):
     """Store interview answers and dispatch the design task."""
@@ -142,8 +133,6 @@ async def submit_agency_creator_answers(
     payload = status.get("_payload", {})
     intent = status.get("_intent", {})
     model = status.get("_model", "gpt-4o")
-    user_jwt = credentials.credentials  # Use fresh token from current request
-
     design_payload = {**payload, "intent": intent, "answers": body.answers, "model": model}
 
     _set_status(body.task_id, {
@@ -156,7 +145,6 @@ async def submit_agency_creator_answers(
     try:
         create_agency_design_task.delay(
             task_id=body.task_id,
-            user_jwt=user_jwt,
             user_id=current_user.id,
             payload=design_payload,
         )
@@ -166,7 +154,7 @@ async def submit_agency_creator_answers(
         from app.tasks.agency_creator_task import _run_async, _design_async
         import threading
         t = threading.Thread(
-            target=lambda: _run_async(_design_async(body.task_id, user_jwt, current_user.id, design_payload)),
+            target=lambda: _run_async(_design_async(body.task_id, current_user.id, design_payload)),
             daemon=True,
         )
         t.start()
diff --git a/python-backend/app/tasks/agency_creator_task.py b/python-backend/app/tasks/agency_creator_task.py
index f3233a50..c62d7dc9 100644
--- a/python-backend/app/tasks/agency_creator_task.py
+++ b/python-backend/app/tasks/agency_creator_task.py
@@ -98,7 +98,6 @@ def create_task_id() -> str:
 def create_agency_discover_task(
     self,
     task_id: str,
-    user_jwt: str,
     user_id: int,
     payload: dict,
 ):
@@ -117,7 +116,7 @@ def create_agency_discover_task(
     })
 
     try:
-        result = _run_async(_discover_async(task_id, user_jwt, user_id, payload))
+        result = _run_async(_discover_async(task_id, user_id, payload))
         return result
     except Exception as exc:
         logger.error("agency_creator_discover_failed", task_id=task_id, error=str(exc)[:300])
@@ -129,7 +128,7 @@ def create_agency_discover_task(
         return {"status": "failed"}
 
 
-async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: dict) -> dict:
+async def _discover_async(task_id: str, user_id: int, payload: dict) -> dict:
     """Async implementation of DISCOVER + INTERVIEW phases."""
     requirement: str = payload.get("requirement", "")
     skip_interview: bool = payload.get("skipInterview", False)
@@ -143,7 +142,7 @@ async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: di
         "_user_id": user_id,
     })
 
-    intent = await _llm_discover(requirement, model, user_jwt)
+    intent = await _llm_discover(requirement, model, user_id)
 
     # Phase 2: INTERVIEW — decide if we need more info
     if skip_interview or intent.get("is_clear", True):
@@ -156,7 +155,6 @@ async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: di
         })
         create_agency_design_task.delay(
             task_id=task_id,
-            user_jwt=user_jwt,
             user_id=user_id,
             payload={**payload, "intent": intent, "answers": {}},
         )
@@ -167,7 +165,6 @@ async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: di
         # No questions → go straight to design
         create_agency_design_task.delay(
             task_id=task_id,
-            user_jwt=user_jwt,
             user_id=user_id,
             payload={**payload, "intent": intent, "answers": {}},
         )
@@ -182,7 +179,7 @@ async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: di
         "_payload": payload,  # stored for when design task is dispatched
         "_intent": intent,
         "_model": model,
-        "_user_jwt": user_jwt,
+        # _user_jwt intentionally omitted — never persist bearer tokens at rest in Redis
     })
     return {"status": "awaiting_answers", "questions": questions}
 
@@ -199,7 +196,6 @@ async def _discover_async(task_id: str, user_jwt: str, user_id: int, payload: di
 def create_agency_design_task(
     self,
     task_id: str,
-    user_jwt: str,
     user_id: int,
     payload: dict,
 ):
@@ -216,7 +212,7 @@ def create_agency_design_task(
     })
 
     try:
-        result = _run_async(_design_async(task_id, user_jwt, user_id, payload))
+        result = _run_async(_design_async(task_id, user_id, payload))
         return result
     except Exception as exc:
         logger.error("agency_creator_design_failed", task_id=task_id, error=str(exc)[:300])
@@ -228,7 +224,7 @@ def create_agency_design_task(
         return {"status": "failed"}
 
 
-async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict) -> dict:
+async def _design_async(task_id: str, user_id: int, payload: dict) -> dict:
     """Async implementation of DESIGN → DOCUMENT phases."""
     requirement: str = payload.get("requirement", "")
     intent: dict = payload.get("intent", {})
@@ -243,7 +239,7 @@ async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict
         "message": "Designing agency architecture...",
         "_user_id": user_id,
     })
-    spec = await _llm_design(requirement, intent, answers, model, user_jwt)
+    spec = await _llm_design(requirement, intent, answers, model, user_id)
 
     # Phase 4: VALIDATE (self-review)
     _set_status(task_id, {
@@ -262,7 +258,7 @@ async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict
         "_user_id": user_id,
         "previewJson": spec,
     })
-    agency_id = await _implement_agency(spec, user_jwt, tenant_id)
+    agency_id = await _implement_agency(spec, user_id, tenant_id)
 
     # Phase 6: VERIFY (basic sanity check — skip if no agency_id)
     if agency_id:
@@ -282,7 +278,7 @@ async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict
         "_user_id": user_id,
         "agencyId": agency_id,
     })
-    guide = await _llm_document(spec, model, user_jwt)
+    guide = await _llm_document(spec, model, user_id)
 
     _set_status(task_id, {
         "status": "completed",
@@ -299,68 +295,47 @@ async def _design_async(task_id: str, user_jwt: str, user_id: int, payload: dict
 # ─── LLM helpers ─────────────────────────────────────────────────────────────
 
 
-def _get_web_gateway_url() -> str:
-    """Return the Node.js web gateway URL for LLM calls.
-
-    The web gateway (/v1/chat/completions) uses the working OpenRouter key
-    from the llm_providers table and handles credit deduction automatically.
-    """
-    return (
-        os.getenv("SMARTSPEC_INTERNAL_URL")
-        or os.getenv("SMARTSPEC_WEB_GATEWAY_URL", "http://127.0.0.1:3000")
-    )
-
 
 async def _llm_call(
     system_prompt: str,
     user_message: str,
     model: str,
-    user_jwt: str,
+    user_id: int,
     max_tokens: int = 4000,
     timeout: float = 120.0,
 ) -> str | None:
-    """Call LLM via the Node.js web gateway (OpenAI-compatible endpoint).
+    """Call LLM via LLMGatewayClient (X-Internal-Token auth).
 
     Returns the assistant message content on success, or None on failure.
     """
-    import httpx
+    from app.services.llm_gateway_client import LLMGatewayClient
 
-    gateway_url = _get_web_gateway_url()
     messages = [
         {"role": "system", "content": system_prompt},
         {"role": "user", "content": user_message},
     ]
 
+    gateway = LLMGatewayClient()
     try:
-        async with httpx.AsyncClient(timeout=timeout) as client:
-            resp = await client.post(
-                f"{gateway_url}/v1/chat/completions",
-                json={
-                    "model": model,
-                    "messages": messages,
-                    "max_tokens": max_tokens,
-                    "temperature": 0.7,
-                },
-                headers={"Authorization": f"Bearer {user_jwt}"},
-            )
-            if resp.status_code == 200:
-                data = resp.json()
-                choices = data.get("choices", [])
-                if choices:
-                    return choices[0].get("message", {}).get("content", "")
-            else:
-                logger.warning(
-                    "agency_creator_llm_call_failed",
-                    status=resp.status_code,
-                    body=resp.text[:300],
-                )
+        data = await gateway.chat_completion(
+            messages=messages,
+            model=model,
+            user_id=user_id,
+            temperature=0.7,
+            timeout=int(timeout),
+        )
+        choices = data.get("choices", [])
+        if choices:
+            return choices[0].get("message", {}).get("content", "")
     except Exception as exc:
         logger.warning("agency_creator_llm_call_error", error=str(exc)[:200])
+    finally:
+        await gateway.aclose()
 
     return None
 
 
-async def _llm_discover(requirement: str, model: str, user_jwt: str) -> dict:
+async def _llm_discover(requirement: str, model: str, user_id: int) -> dict:
     """Phase 1: Analyse requirement and generate interview questions if needed."""
 
     system_prompt = """You are an AI agency architect. Analyse the user's requirement for building a multi-agent AI agency.
@@ -382,7 +357,7 @@ Only ask questions that are truly necessary to design the agency. Skip if the re
         system_prompt=system_prompt,
         user_message=f"Requirement: {requirement}",
         model=model,
-        user_jwt=user_jwt,
+        user_id=user_id,
         max_tokens=1000,
         timeout=60.0,
     )
@@ -393,7 +368,7 @@ Only ask questions that are truly necessary to design the agency. Skip if the re
     return {"is_clear": True, "domain": "general", "estimated_agents": 3, "questions": []}
 
 
-async def _llm_design(requirement: str, intent: dict, answers: dict, model: str, user_jwt: str) -> dict:
+async def _llm_design(requirement: str, intent: dict, answers: dict, model: str, user_id: int) -> dict:
     """Phase 3: Design the agency architecture as JSON spec."""
     answers_text = ""
     if answers:
@@ -466,7 +441,7 @@ OTHER RULES:
         system_prompt=system_prompt,
         user_message=user_message,
         model=model,
-        user_jwt=user_jwt,
+        user_id=user_id,
         max_tokens=4000,
         timeout=120.0,
     )
@@ -540,7 +515,7 @@ def _validate_spec(spec: dict) -> dict:
     return spec
 
 
-async def _implement_agency(spec: dict, user_jwt: str, tenant_id: str = "") -> str | None:
+async def _implement_agency(spec: dict, user_id: int, tenant_id: str = "") -> str | None:
     """Phase 5: Create agency in database via Node.js internal API."""
     import httpx
 
@@ -611,7 +586,7 @@ async def _implement_agency(spec: dict, user_jwt: str, tenant_id: str = "") -> s
     return None
 
 
-async def _llm_document(spec: dict, model: str, user_jwt: str) -> str:
+async def _llm_document(spec: dict, model: str, user_id: int) -> str:
     """Phase 7: Generate usage guide for the created agency."""
     system_prompt = "Write a concise usage guide (max 300 words) for this AI agency. Include: purpose, how to start a conversation, and 3 example prompts."
     user_message = f"Agency: {spec.get('name')}\nDescription: {spec.get('description')}\nNodes: {[n.get('name') for n in spec.get('nodes', [])]}"
@@ -620,7 +595,7 @@ async def _llm_document(spec: dict, model: str, user_jwt: str) -> str:
         system_prompt=system_prompt,
         user_message=user_message,
         model=model,
-        user_jwt=user_jwt,
+        user_id=user_id,
         max_tokens=500,
         timeout=60.0,
     )
diff --git a/python-backend/tests/test_agency_creator_security.py b/python-backend/tests/test_agency_creator_security.py
new file mode 100644
index 00000000..b96c2714
--- /dev/null
+++ b/python-backend/tests/test_agency_creator_security.py
@@ -0,0 +1,70 @@
+"""Security tests: verify user_jwt has been removed from agency creator tasks."""
+
+import inspect
+
+from app.tasks.agency_creator_task import create_agency_discover_task, create_agency_design_task
+
+
+def test_discover_task_no_jwt_param():
+    """create_agency_discover_task must not accept user_jwt."""
+    sig = inspect.signature(create_agency_discover_task.run)
+    assert "user_jwt" not in sig.parameters, "user_jwt still in create_agency_discover_task signature"
+
+
+def test_design_task_no_jwt_param():
+    """create_agency_design_task must not accept user_jwt."""
+    sig = inspect.signature(create_agency_design_task.run)
+    assert "user_jwt" not in sig.parameters, "user_jwt still in create_agency_design_task signature"
+
+
+def test_llm_call_no_bearer_jwt():
+    """The _llm_call function must not accept user_jwt or use Bearer auth."""
+    from app.tasks.agency_creator_task import _llm_call
+
+    sig = inspect.signature(_llm_call)
+    assert "user_jwt" not in sig.parameters, "user_jwt still in _llm_call signature"
+    assert "user_id" in sig.parameters, "user_id missing from _llm_call signature"
+
+
+def test_llm_discover_no_jwt():
+    """_llm_discover must take user_id not user_jwt."""
+    from app.tasks.agency_creator_task import _llm_discover
+
+    sig = inspect.signature(_llm_discover)
+    assert "user_jwt" not in sig.parameters
+    assert "user_id" in sig.parameters
+
+
+def test_llm_design_no_jwt():
+    """_llm_design must take user_id not user_jwt."""
+    from app.tasks.agency_creator_task import _llm_design
+
+    sig = inspect.signature(_llm_design)
+    assert "user_jwt" not in sig.parameters
+    assert "user_id" in sig.parameters
+
+
+def test_llm_document_no_jwt():
+    """_llm_document must take user_id not user_jwt."""
+    from app.tasks.agency_creator_task import _llm_document
+
+    sig = inspect.signature(_llm_document)
+    assert "user_jwt" not in sig.parameters
+    assert "user_id" in sig.parameters
+
+
+def test_no_bearer_header_in_llm_calls():
+    """LLM helper functions must not use Bearer JWT auth."""
+    import pathlib
+
+    source_path = pathlib.Path(inspect.getfile(create_agency_discover_task.run)).resolve()
+    source = source_path.read_text()
+
+    # Extract the _llm_call function source and check it doesn't use Bearer
+    llm_call_start = source.index("async def _llm_call(")
+    llm_call_end = source.index("\n\nasync def _llm_discover(")
+    llm_call_source = source[llm_call_start:llm_call_end]
+
+    assert "Bearer" not in llm_call_source, "Bearer JWT auth found in _llm_call"
+    assert "Authorization" not in llm_call_source, "Authorization header found in _llm_call"
+    assert "LLMGatewayClient" in llm_call_source, "LLMGatewayClient not used in _llm_call"
