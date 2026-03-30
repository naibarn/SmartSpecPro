diff --git a/python-backend/app/tasks/agency_creator_task.py b/python-backend/app/tasks/agency_creator_task.py
index ae78bd3e..b411720c 100644
--- a/python-backend/app/tasks/agency_creator_task.py
+++ b/python-backend/app/tasks/agency_creator_task.py
@@ -29,6 +29,7 @@ logger = structlog.get_logger(__name__)
 
 REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
 RESULT_TTL = 7200  # 2 hours
+MAX_DISCOVER_CALLS = 2  # Budget cap: max LLM calls during discover phase
 
 _redis_pool = sync_redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
 
@@ -411,7 +412,7 @@ async def _llm_call(
 
 
 async def _llm_discover(requirement: str, model: str, user_id: int) -> dict:
-    """Phase 1: Analyse requirement and generate interview questions if needed."""
+    """Phase 1: Analyse requirement, generate capability analysis, and goal-clarification questions."""
 
     system_prompt = """You are an AI agency architect. Analyse the user's requirement for building a multi-agent AI agency.
 
@@ -423,11 +424,48 @@ Return JSON with these fields:
   "questions": [            // list of clarifying questions (empty if is_clear=true), max 7
     {"id": "q1", "question": "...", "type": "text"}
   ],
-  "notes": "..."            // brief analysis notes
+  "notes": "...",            // brief analysis notes
+  "recommended_capabilities": {
+    "web_search": true/false,     // needs real-time internet data
+    "thinking": true/false,       // needs deep reasoning / complex analysis
+    "vision": true/false,         // needs to process images
+    "code_execution": true/false, // needs to run code / calculations
+    "computer_use": true/false    // needs browser automation
+  },
+  "complexity_level": "simple" | "moderate" | "complex",
+  "memory_recommendation": true/false,  // should agents learn across runs
+  "domain_insights": "..."  // domain-specific observations
 }
 
+CAPABILITY ANALYSIS:
+Analyze the requirement and determine which capabilities are needed:
+- web_search: true if agents need to find real-time information, trends, news, prices
+- thinking: true if agents need to analyze data, make strategic decisions, solve complex problems
+- vision: true if agents need to analyze images, screenshots, designs, charts
+- code_execution: true if agents need to calculate, process data, generate code
+- computer_use: true if agents need to browse websites, fill forms, interact with web UIs
+
+COMPLEXITY ASSESSMENT:
+- "simple": 1-2 agents, straightforward task, no iteration needed
+- "moderate": 2-4 agents, some coordination, may need reasoning
+- "complex": 4+ agents, multi-step workflow, needs planning + review
+
+IMPORTANT: Do NOT ask technical questions. Only ask questions about the user's GOAL if unclear.
+Bad question: "Which execution mode do you want?"
+Good question: "Who is the target audience for this content?"
+
 Only ask questions that are truly necessary to design the agency. Skip if the requirement is already clear."""
 
+    _default_capabilities = {
+        "web_search": False, "thinking": False, "vision": False,
+        "code_execution": False, "computer_use": False,
+    }
+    _fallback = {
+        "is_clear": True, "domain": "general", "estimated_agents": 3, "questions": [],
+        "recommended_capabilities": _default_capabilities,
+        "complexity_level": "moderate", "memory_recommendation": True, "domain_insights": "",
+    }
+
     content = await _llm_call(
         system_prompt=system_prompt,
         user_message=f"Requirement: {requirement}",
@@ -437,10 +475,23 @@ Only ask questions that are truly necessary to design the agency. Skip if the re
         timeout=60.0,
     )
     if content:
-        return _safe_json_parse(content, {"is_clear": True, "questions": []})
+        result = _safe_json_parse(content, _fallback)
+        # Ensure new fields always present with safe defaults
+        if "recommended_capabilities" not in result or not isinstance(result.get("recommended_capabilities"), dict):
+            result["recommended_capabilities"] = _default_capabilities
+        else:
+            for k in _default_capabilities:
+                if k not in result["recommended_capabilities"]:
+                    result["recommended_capabilities"][k] = False
+        if result.get("complexity_level") not in ("simple", "moderate", "complex"):
+            result["complexity_level"] = "moderate"
+        if "memory_recommendation" not in result:
+            result["memory_recommendation"] = True
+        if "domain_insights" not in result:
+            result["domain_insights"] = ""
+        return result
 
-    # Fallback: treat as clear
-    return {"is_clear": True, "domain": "general", "estimated_agents": 3, "questions": []}
+    return _fallback
 
 
 async def _fetch_available_skills(tenant_id: str) -> list[dict]:
@@ -647,64 +698,116 @@ async def _llm_design(requirement: str, intent: dict, answers: dict, model: str,
             f"- {k}: {v}" for k, v in answers.items()
         )
 
-    system_prompt = """You are an AI agency architect. Design a multi-agent agency based on the requirement.
+    system_prompt = """You are an expert AI agency architect. Design a complete multi-agent agency based on the user's requirement.
+
+YOUR JOB: Analyse what the user needs and make ALL technical decisions yourself:
+- How many agents to create and what each one does
+- What capabilities each agent needs (web search, code execution, vision, deep thinking)
+- What execution mode is best (simple response vs multi-step reasoning vs autonomous planning)
+- Whether agents should remember across conversations
+- What the routing/flow logic should be
 
 Return JSON with this exact structure:
 {
   "name": "Agency Name",
   "description": "What this agency does",
+  "objective": "The primary goal/purpose of this agency (used for continuous improvement)",
+  "sharedInstructions": "Instructions that apply to ALL agents in this agency",
   "nodes": [
     {
       "id": "node-1",
-      "nodeType": "agent",  // one of: agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval
+      "nodeType": "agent",
       "name": "Agent Name",
       "description": "What this agent does",
-      "instructions": "Detailed instructions for this agent",
-      "model": "gpt-4o",
-      "isEntryPoint": true,   // only ONE node should be entry point, must be agent or supervisor
-      "toolIds": [],           // array of builtin tool IDs this agent should use (see list below)
-      "nodeConfig": {}         // type-specific config
+      "instructions": "Detailed, specific instructions for this agent",
+      "isEntryPoint": true,
+      "toolIds": [],
+      "modelRequirements": {
+        "strategy": "balanced",
+        "supportsVision": false,
+        "supportsThinking": false,
+        "supportsFunctionTools": true,
+        "supportsWebSearch": false,
+        "supportsCodeExecution": false,
+        "supportsComputerUse": false
+      },
+      "nodeConfig": {
+        "executionMode": "agentic",
+        "planningStrategy": "react",
+        "enableLongTermMemory": true,
+        "memoryScope": "agency",
+        "maxReflectionCycles": 3
+      }
     }
   ],
   "edges": [
     {
       "fromNodeId": "node-1",
       "toNodeId": "node-2",
-      "flowType": "delegation"  // delegation | handoff | parallel
+      "flowType": "delegation"
     }
   ],
-  "rationale": "Brief explanation of the design decisions"
+  "rationale": "Brief explanation of WHY you made these design decisions"
 }
 
-AVAILABLE TOOLS (use these exact IDs in "toolIds"):
-- "builtin-web-search"       → Search the internet for real-time information (for research, data collection, news)
-- "builtin-code-interpreter"  → Execute Python code in a sandbox (for calculations, data processing)
-- "builtin-file-reader"       → Read files from the workspace
-- "builtin-file-writer"       → Create or modify files
-- "builtin-rag-knowledge"     → Search uploaded knowledge base documents
-- "builtin-http-request"      → Make HTTP requests to external REST APIs
-- "builtin-email-notify"      → Send email notifications
-- "builtin-webhook"           → Send data to a webhook URL
-- "builtin-slack-message"     → Send messages to Slack channels
-- "builtin-document-search"   → Search across document collections
-
-TOOL ASSIGNMENT RULES:
-- Assign tools that match each agent's role and responsibility
-- Research/data agents → "builtin-web-search", "builtin-http-request"
-- Communication agents → "builtin-email-notify", "builtin-slack-message", "builtin-webhook"
-- Analysis/coding agents → "builtin-code-interpreter", "builtin-web-search"
-- Document/knowledge agents → "builtin-rag-knowledge", "builtin-document-search", "builtin-file-reader"
-- Content creation agents → "builtin-file-writer", "builtin-web-search"
-- ALWAYS assign at least "builtin-web-search" to agents that need real-time data
-- ALWAYS assign "builtin-email-notify" when the requirement mentions email/notification/alert
-- Supervisors and coordinators may need tools too if they perform direct work
-
-OTHER RULES:
-- Exactly ONE entry point (agent or supervisor only)
-- Router nodes need nodeConfig.routingMode + nodeConfig.routes + nodeConfig.defaultTargetNodeId
-- All node IDs must be unique strings
-- Model defaults to gpt-4o if not specified
-- Keep it simple: 2-6 nodes is usually best"""
+═══ NODE TYPES ═══
+- "agent"            — Standard AI agent (most common)
+- "supervisor"       — Coordinates other agents, delegates and reviews
+- "router"           — Routes to different paths based on conditions
+- "aggregator"       — Merges results from multiple nodes
+- "knowledge_base"   — Injects domain documents into context
+- "skill_call"       — Calls a specific skill/API
+- "human_approval"   — Pauses for human review before proceeding
+
+═══ EXECUTION MODE DECISION ═══
+Choose based on task complexity:
+- "single_shot" — Simple Q&A, translation, formatting (1 LLM call)
+- "agentic" with planningStrategy "basic" — Multi-step but straightforward tasks
+- "agentic" with planningStrategy "cot" — Tasks requiring step-by-step reasoning
+- "agentic" with planningStrategy "react" — Tasks requiring tool use + reasoning loops (RECOMMENDED for most work)
+
+═══ CAPABILITY REQUIREMENTS ═══
+Decide for EACH agent what it needs:
+- supportsVision: true    — When agent analyzes images, screenshots, charts
+- supportsThinking: true  — When agent needs deep reasoning, complex analysis, math
+- supportsFunctionTools: true — When agent uses tools (MOST agents need this)
+- supportsWebSearch: true — When agent needs real-time internet data
+- supportsCodeExecution: true — When agent runs code, calculates, processes data
+- supportsComputerUse: true — When agent controls a browser
+
+Model strategy:
+- "cheapest"  — Simple/repetitive tasks (formatting, extraction)
+- "balanced"  — Most tasks (DEFAULT — good quality at reasonable cost)
+- "best"      — Critical tasks (final output, quality review, complex reasoning)
+
+═══ MEMORY DECISIONS ═══
+- enableLongTermMemory: true — When agent should learn and improve over time (RECOMMENDED)
+- memoryScope: "agency" — Agents share knowledge across the team (DEFAULT)
+- memoryScope: "node"   — Agent keeps private memory (rare, for specialized agents)
+
+═══ TOOLS ═══
+- "builtin-web-search"       → Real-time internet search
+- "builtin-code-interpreter"  → Execute Python code in sandbox
+- "builtin-file-reader"       → Read workspace files
+- "builtin-file-writer"       → Create/modify files
+- "builtin-rag-knowledge"     → Search knowledge base documents
+- "builtin-http-request"      → Call external APIs
+- "builtin-email-notify"      → Send emails
+- "builtin-webhook"           → Send webhook data
+- "builtin-slack-message"     → Post to Slack
+- "builtin-document-search"   → Search document collections
+
+═══ DESIGN PRINCIPLES ═══
+1. ALWAYS set objective — this is critical for the agency's self-improvement loop
+2. ALWAYS enable long-term memory for agents that produce or consume knowledge
+3. Use "react" planning for agents that need to search, analyze, or create
+4. Use "best" model strategy for the final output node (quality matters most)
+5. Use "cheapest" for utility nodes (routing, formatting, extraction)
+6. Assign web-search to research agents, code-interpreter to analysis agents
+7. Set supportsThinking=true for complex reasoning tasks (math, logic, strategy)
+8. Router nodes need nodeConfig.routingMode + nodeConfig.routes
+9. Keep it focused: 2-6 nodes is optimal
+10. Entry point must be agent or supervisor type"""
 
     plan_text = ""
     if plan_steps:
@@ -723,12 +826,89 @@ OTHER RULES:
     if content:
         spec = _safe_json_parse(content, None)
         if spec and "nodes" in spec and "edges" in spec:
+            # Self-review loop: LLM checks its own design for completeness (max 2 rounds)
+            spec = await _self_review_spec(spec, requirement, model, user_id, max_rounds=2)
             return spec
 
     # Fallback: minimal agency
     return _fallback_agency_spec(requirement)
 
 
+async def _self_review_spec(
+    spec: dict, requirement: str, model: str, user_id: int, max_rounds: int = 2,
+) -> dict:
+    """Self-review loop: LLM checks its own agency design and fixes gaps.
+
+    Ensures completeness of:
+    - Every agent has appropriate executionMode + planningStrategy
+    - Capability requirements match agent responsibilities
+    - Memory settings are appropriate
+    - Agency has a clear objective
+    - Tools match agent roles
+    """
+    review_prompt = """You are reviewing an AI agency design for completeness and quality.
+
+Check the spec against the original requirement and fix any gaps. Return the IMPROVED spec.
+
+CHECKLIST — verify each item:
+1. Does every agent have appropriate nodeConfig.executionMode? (single_shot for simple, agentic for complex)
+2. Does every agentic agent have a planningStrategy? (react for tool-using, cot for reasoning-only)
+3. Does every agent have modelRequirements with correct capabilities?
+   - Research agents MUST have supportsWebSearch: true
+   - Analysis agents MUST have supportsCodeExecution: true or supportsThinking: true
+   - Agents processing images MUST have supportsVision: true
+   - Critical output agents should use strategy: "best"
+4. Is enableLongTermMemory: true for agents that should learn over time?
+5. Is the agency objective clear and specific?
+6. Does each agent have the right tools assigned?
+7. Are the edges/flow logical? Does data flow make sense?
+8. Could any agent benefit from additional capabilities not yet assigned?
+
+IMPORTANT: Return the COMPLETE spec JSON with all fixes applied. Do NOT return just the issues — return the full corrected spec.
+If everything looks good, return the spec unchanged."""
+
+    current_spec = spec
+    for round_num in range(1, max_rounds + 1):
+        try:
+            review_content = await _llm_call(
+                system_prompt=review_prompt,
+                user_message=(
+                    f"Original requirement: {requirement}\n\n"
+                    f"Current agency spec:\n{json.dumps(current_spec, indent=2, default=str)}"
+                ),
+                model=model,
+                user_id=user_id,
+                max_tokens=4000,
+                timeout=90.0,
+            )
+
+            if review_content:
+                reviewed = _safe_json_parse(review_content, None)
+                if reviewed and "nodes" in reviewed and "edges" in reviewed:
+                    # Check if meaningful changes were made
+                    old_nodes = len(current_spec.get("nodes", []))
+                    new_nodes = len(reviewed.get("nodes", []))
+                    if abs(old_nodes - new_nodes) <= 3:  # Sanity check — don't accept radical changes
+                        current_spec = reviewed
+                        logger.info(
+                            "agency_creator_self_review",
+                            round=round_num,
+                            nodes=new_nodes,
+                        )
+                    else:
+                        logger.debug("agency_creator_review_rejected_radical_change", round=round_num)
+                        break
+                else:
+                    break  # Parse failed — keep current
+            else:
+                break  # LLM returned nothing — keep current
+        except Exception as exc:
+            logger.debug("agency_creator_review_failed", round=round_num, error=str(exc)[:100])
+            break
+
+    return current_spec
+
+
 def _validate_spec(spec: dict) -> dict:
     """Phase 4: Self-review and fix common spec issues."""
     nodes = spec.get("nodes", [])
@@ -830,6 +1010,40 @@ def _validate_spec(spec: dict) -> dict:
         if nt in non_tool_node_types:
             node["toolIds"] = []
 
+    # ── Intelligence defaults (spec 053/056) ──
+    # If LLM didn't set these, apply smart defaults
+    for node in nodes:
+        nt = node.get("nodeType", "agent")
+        cfg = node.setdefault("nodeConfig", {})
+
+        if nt in ("agent", "supervisor"):
+            # Execution mode: default to agentic + react for agents
+            if "executionMode" not in cfg:
+                cfg["executionMode"] = "agentic"
+            if cfg.get("executionMode") == "agentic" and "planningStrategy" not in cfg:
+                cfg["planningStrategy"] = "react"
+            if "maxReflectionCycles" not in cfg:
+                cfg["maxReflectionCycles"] = 3
+
+            # Memory: default to enabled + agency-wide scope
+            if "enableLongTermMemory" not in cfg:
+                cfg["enableLongTermMemory"] = True
+            if "memoryScope" not in cfg:
+                cfg["memoryScope"] = "agency"
+
+        # Model requirements: default to balanced auto-selection
+        if nt in ("agent", "supervisor") and "modelRequirements" not in node:
+            node["modelRequirements"] = {"strategy": "balanced", "supportsFunctionTools": True}
+
+        # Security guardrail: strip computer_use unless explicitly flag-enabled
+        if node.get("modelRequirements", {}).get("supportsComputerUse"):
+            node["modelRequirements"]["supportsComputerUse"] = False
+            logger.info("computer_use_stripped_by_validate_spec", node_id=node.get("id"))
+
+    # Agency objective: infer from description if not set
+    if not spec.get("objective") and spec.get("description"):
+        spec["objective"] = spec["description"]
+
     # Validate toolIds — only allow known builtin IDs
     valid_tool_ids = {
         "builtin-web-search", "builtin-code-interpreter", "builtin-file-reader",
@@ -878,12 +1092,11 @@ async def _implement_agency(spec: dict, user_id: int, tenant_id: str = "") -> st
             else:
                 tool_ids = []
 
-            agents.append({
+            agent_data: dict = {
                 "id": node.get("id", ""),
                 "name": node.get("name", "Agent"),
                 "description": node.get("description", ""),
                 "instructions": node.get("instructions", ""),
-                "model": node.get("model", "gpt-4o"),
                 "nodeType": node.get("nodeType", "agent"),
                 "nodeConfig": node.get("nodeConfig", {}),
                 "isEntryPoint": node.get("isEntryPoint", False),
@@ -891,7 +1104,17 @@ async def _implement_agency(spec: dict, user_id: int, tenant_id: str = "") -> st
                 "position": {"x": 400, "y": 80 + idx * 200},
                 "toolIds": tool_ids,
                 "toolConfigs": {},
-            })
+            }
+
+            # Model: use auto-selection (modelRequirements) if available, else manual
+            model_reqs = node.get("modelRequirements")
+            if model_reqs and isinstance(model_reqs, dict):
+                agent_data["modelRequirements"] = model_reqs
+                # Don't set model — let auto-selection resolve it
+            else:
+                agent_data["model"] = node.get("model", "")
+
+            agents.append(agent_data)
 
         edges = []
         for edge in spec.get("edges", []):
@@ -905,6 +1128,8 @@ async def _implement_agency(spec: dict, user_id: int, tenant_id: str = "") -> st
         body_json: dict = {
             "name": spec.get("name", "AI-Generated Agency"),
             "description": spec.get("description", ""),
+            "objective": spec.get("objective", spec.get("description", "")),
+            "sharedInstructions": spec.get("sharedInstructions", ""),
             "agents": agents,
             "communicationFlows": edges,
         }
diff --git a/python-backend/tests/test_agency_creator_v2.py b/python-backend/tests/test_agency_creator_v2.py
index cbe9891f..f4200647 100644
--- a/python-backend/tests/test_agency_creator_v2.py
+++ b/python-backend/tests/test_agency_creator_v2.py
@@ -7,14 +7,137 @@ from unittest.mock import AsyncMock, MagicMock, patch
 
 from app.tasks.agency_creator_task import (
     _fallback_plan,
+    _llm_discover,
     _llm_plan,
     _llm_review_plan,
     _llm_review_design,
     _validate_spec,
     _safe_json_parse,
+    MAX_DISCOVER_CALLS,
 )
 
 
+@pytest.mark.unit
+@pytest.mark.agency
+class TestLlmDiscover:
+    @pytest.mark.asyncio
+    async def test_discover_returns_capability_fields(self):
+        discover_response = json.dumps({
+            "is_clear": True,
+            "domain": "content_creation",
+            "estimated_agents": 3,
+            "questions": [],
+            "notes": "Content pipeline",
+            "recommended_capabilities": {
+                "web_search": True,
+                "thinking": True,
+                "vision": False,
+                "code_execution": False,
+                "computer_use": False,
+            },
+            "complexity_level": "moderate",
+            "memory_recommendation": True,
+            "domain_insights": "Content workflows benefit from web research",
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = discover_response
+            result = await _llm_discover("Create a content marketing team", "gpt-4o", 1)
+
+        assert "recommended_capabilities" in result
+        caps = result["recommended_capabilities"]
+        assert isinstance(caps, dict)
+        for key in ("web_search", "thinking", "vision", "code_execution", "computer_use"):
+            assert key in caps
+        assert result["complexity_level"] in ("simple", "moderate", "complex")
+        assert isinstance(result["memory_recommendation"], bool)
+        assert "domain_insights" in result
+
+    @pytest.mark.asyncio
+    async def test_discover_fallback_has_capability_fields(self):
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = None
+            result = await _llm_discover("test requirement", "gpt-4o", 1)
+
+        assert result["is_clear"] is True
+        assert "recommended_capabilities" in result
+        caps = result["recommended_capabilities"]
+        assert all(caps[k] is False for k in ("web_search", "thinking", "vision", "code_execution", "computer_use"))
+        assert result["complexity_level"] == "moderate"
+        assert result["memory_recommendation"] is True
+
+    @pytest.mark.asyncio
+    async def test_discover_budget_cap(self):
+        assert MAX_DISCOVER_CALLS == 2
+
+    @pytest.mark.asyncio
+    async def test_discover_no_technical_questions(self):
+        discover_response = json.dumps({
+            "is_clear": False,
+            "domain": "general",
+            "estimated_agents": 2,
+            "questions": [
+                {"id": "q1", "question": "Who is the target audience?", "type": "text"},
+            ],
+            "notes": "Need more info",
+            "recommended_capabilities": {
+                "web_search": False, "thinking": False, "vision": False,
+                "code_execution": False, "computer_use": False,
+            },
+            "complexity_level": "simple",
+            "memory_recommendation": False,
+            "domain_insights": "",
+        })
+
+        with patch("app.tasks.agency_creator_task._llm_call", new_callable=AsyncMock) as mock_call:
+            mock_call.return_value = discover_response
+            result = await _llm_discover("Build an agency", "gpt-4o", 1)
+
+        # Verify the prompt instructs no technical questions
+        call_args = mock_call.call_args
+        system_prompt = call_args.kwargs.get("system_prompt", call_args[1].get("system_prompt", ""))
+        if not system_prompt:
+            system_prompt = call_args[0][0] if call_args[0] else ""
+        assert "Do NOT ask technical questions" in system_prompt
+
+
+@pytest.mark.unit
+@pytest.mark.agency
+class TestValidateSpecComputerUseGuardrail:
+    def test_computer_use_stripped_when_present(self):
+        spec = {
+            "nodes": [
+                {
+                    "id": "n1", "nodeType": "agent", "isEntryPoint": True,
+                    "name": "Browser Agent",
+                    "modelRequirements": {"supportsComputerUse": True, "supportsFunctionTools": True},
+                    "nodeConfig": {},
+                },
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        agent = result["nodes"][0]
+        # Without feature flag enabled, computer_use should be stripped
+        assert agent["modelRequirements"]["supportsComputerUse"] is False
+
+    def test_computer_use_not_stripped_when_absent(self):
+        spec = {
+            "nodes": [
+                {
+                    "id": "n1", "nodeType": "agent", "isEntryPoint": True,
+                    "name": "Normal Agent",
+                    "modelRequirements": {"supportsFunctionTools": True},
+                    "nodeConfig": {},
+                },
+            ],
+            "edges": [],
+        }
+        result = _validate_spec(spec)
+        agent = result["nodes"][0]
+        assert agent["modelRequirements"].get("supportsComputerUse") is None
+
+
 @pytest.mark.unit
 @pytest.mark.agency
 class TestLlmPlan:
