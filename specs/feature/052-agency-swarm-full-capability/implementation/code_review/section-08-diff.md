diff --git a/apps/web/client/src/components/agency/AgentNode.tsx b/apps/web/client/src/components/agency/AgentNode.tsx
index ed3d255c..fcd8dd4f 100644
--- a/apps/web/client/src/components/agency/AgentNode.tsx
+++ b/apps/web/client/src/components/agency/AgentNode.tsx
@@ -10,7 +10,7 @@ export interface AgentNodeData {
   description: string;
   instructions: string;
   model: string;
-  modelSettings: { max_tokens?: number; temperature?: number; top_p?: number };
+  modelSettings: { maxTokens?: number; temperature?: number; topP?: number; reasoningEffort?: string };
   isEntryPoint: boolean;
   isOptional: boolean;
   tools: Array<{ toolId: string; toolName: string }>;
diff --git a/apps/web/client/src/components/agency/AgentPropertyPanel.tsx b/apps/web/client/src/components/agency/AgentPropertyPanel.tsx
index 87203113..8090e8fd 100644
--- a/apps/web/client/src/components/agency/AgentPropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/AgentPropertyPanel.tsx
@@ -126,12 +126,12 @@ export function AgentPropertyPanel({
                   <Input
                     id="max-tokens"
                     type="number"
-                    value={agent.modelSettings?.max_tokens ?? ""}
+                    value={agent.modelSettings?.maxTokens ?? ""}
                     onChange={(e) =>
                       onChange({
                         modelSettings: {
                           ...agent.modelSettings,
-                          max_tokens: e.target.value
+                          maxTokens: e.target.value
                             ? Number(e.target.value)
                             : undefined,
                         },
@@ -164,7 +164,7 @@ export function AgentPropertyPanel({
                 </div>
                 <div className="space-y-1.5">
                   <Label htmlFor="top-p">
-                    Top P ({agent.modelSettings?.top_p ?? 1})
+                    Top P ({agent.modelSettings?.topP ?? 1})
                   </Label>
                   <input
                     id="top-p"
@@ -172,12 +172,12 @@ export function AgentPropertyPanel({
                     min="0"
                     max="1"
                     step="0.05"
-                    value={agent.modelSettings?.top_p ?? 1}
+                    value={agent.modelSettings?.topP ?? 1}
                     onChange={(e) =>
                       onChange({
                         modelSettings: {
                           ...agent.modelSettings,
-                          top_p: Number(e.target.value),
+                          topP: Number(e.target.value),
                         },
                       })
                     }
diff --git a/apps/web/client/src/components/agency/NodePropertyPanel.tsx b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
index 7de72c02..1ff85760 100644
--- a/apps/web/client/src/components/agency/NodePropertyPanel.tsx
+++ b/apps/web/client/src/components/agency/NodePropertyPanel.tsx
@@ -633,12 +633,12 @@ function AgentSupervisorForm({
               <Label>Max Tokens</Label>
               <Input
                 type="number"
-                value={node.modelSettings?.max_tokens ?? ""}
+                value={node.modelSettings?.maxTokens ?? ""}
                 onChange={(e) =>
                   onChange({
                     modelSettings: {
                       ...node.modelSettings,
-                      max_tokens: e.target.value ? Number(e.target.value) : undefined,
+                      maxTokens: e.target.value ? Number(e.target.value) : undefined,
                     },
                   })
                 }
@@ -665,24 +665,78 @@ function AgentSupervisorForm({
               />
             </div>
             <div className="space-y-1.5">
-              <Label>Top P ({node.modelSettings?.top_p ?? 1})</Label>
+              <Label>Top P ({node.modelSettings?.topP ?? 1})</Label>
               <input
                 type="range"
                 min="0"
                 max="1"
                 step="0.05"
-                value={node.modelSettings?.top_p ?? 1}
+                value={node.modelSettings?.topP ?? 1}
                 onChange={(e) =>
                   onChange({
                     modelSettings: {
                       ...node.modelSettings,
-                      top_p: Number(e.target.value),
+                      topP: Number(e.target.value),
                     },
                   })
                 }
                 className="w-full"
               />
             </div>
+            <div className="space-y-1.5">
+              <Label>Reasoning Effort</Label>
+              <select
+                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
+                value={node.modelSettings?.reasoningEffort ?? ""}
+                onChange={(e) =>
+                  onChange({
+                    modelSettings: {
+                      ...node.modelSettings,
+                      reasoningEffort: e.target.value || undefined,
+                    },
+                  })
+                }
+              >
+                <option value="">Default</option>
+                <option value="minimal">Minimal</option>
+                <option value="low">Low</option>
+                <option value="medium">Medium</option>
+                <option value="high">High</option>
+              </select>
+            </div>
+            <div className="space-y-1.5">
+              <div className="flex items-center justify-between">
+                <Label>Parallel Tool Calls</Label>
+                <input
+                  type="checkbox"
+                  checked={node.parallelToolCalls ?? true}
+                  onChange={(e) => onChange({ parallelToolCalls: e.target.checked })}
+                  className="rounded"
+                />
+              </div>
+              <p className="text-xs text-slate-500">Allow multiple tools to execute simultaneously</p>
+              {(node.parallelToolCalls === false) && (node.toolIds?.length ?? 0) > 5 && (
+                <p className="text-xs text-amber-600">Sequential execution with many tools may be slow</p>
+              )}
+            </div>
+            <div className="space-y-1.5">
+              <Label>Max Turns</Label>
+              <Input
+                type="number"
+                min={1}
+                max={100}
+                value={node.maxTurns ?? 25}
+                onChange={(e) => {
+                  const val = parseInt(e.target.value, 10);
+                  if (!isNaN(val)) onChange({ maxTurns: Math.min(100, Math.max(1, val)) });
+                }}
+                placeholder="25"
+              />
+              <p className="text-xs text-slate-500">Maximum number of LLM turns per run</p>
+              {(node.maxTurns ?? 25) < 5 && (
+                <p className="text-xs text-amber-600">Low turn limit may prevent complex tasks from completing</p>
+              )}
+            </div>
           </div>
         )}
       </div>
diff --git a/apps/web/client/src/components/agency/nodes/types.ts b/apps/web/client/src/components/agency/nodes/types.ts
index 69d739a9..1e25d0c7 100644
--- a/apps/web/client/src/components/agency/nodes/types.ts
+++ b/apps/web/client/src/components/agency/nodes/types.ts
@@ -14,10 +14,13 @@ export interface AgencyNodeData {
   description?: string;
   instructions?: string;
   model?: string;
-  modelSettings?: { max_tokens?: number; temperature?: number; top_p?: number };
+  modelSettings?: { maxTokens?: number; temperature?: number; topP?: number; reasoningEffort?: "minimal" | "low" | "medium" | "high" };
+  parallelToolCalls?: boolean;
+  maxTurns?: number;
   isEntryPoint?: boolean;
   isOptional?: boolean;
   tools?: Array<{ toolId: string; toolName: string; toolConfig?: Record<string, unknown> }>;
+  toolIds?: string[];
   nodeConfig?: Record<string, unknown>;
   guardrailIds?: string[];
   validationErrors?: string[];
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index b301f272..1509fb19 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -797,11 +797,14 @@ export const agencyRouter = router({
               model: z.string().max(100).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid model identifier").optional(),
               modelSettings: z
                 .object({
-                  max_tokens: z.number().optional(),
+                  maxTokens: z.number().optional(),
                   temperature: z.number().min(0).max(2).optional(),
-                  top_p: z.number().min(0).max(1).optional(),
+                  topP: z.number().min(0).max(1).optional(),
+                  reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
                 })
                 .optional(),
+              parallelToolCalls: z.boolean().default(true),
+              maxTurns: z.number().int().min(1).max(100).default(25),
               isEntryPoint: z.boolean().default(false),
               isOptional: z.boolean().default(false),
               position: z.object({ x: z.number(), y: z.number() }).optional(),
@@ -906,6 +909,8 @@ export const agencyRouter = router({
             instructions: agent.instructions ?? null,
             model: agent.model ?? null,
             modelSettings: agent.modelSettings ?? null,
+            parallelToolCalls: agent.parallelToolCalls,
+            maxTurns: agent.maxTurns,
             isEntryPoint: agent.isEntryPoint,
             isOptional: agent.isOptional,
             position: agent.position ?? null,
@@ -1201,6 +1206,8 @@ export const agencyRouter = router({
             instructions: agent.instructions ?? null,
             model: agent.model ?? null,
             modelSettings: agent.modelSettings ?? null,
+            parallelToolCalls: agent.parallelToolCalls,
+            maxTurns: agent.maxTurns,
             isEntryPoint: agent.isEntryPoint,
             isOptional: agent.isOptional,
             position: agent.position ?? null,
@@ -2014,6 +2021,8 @@ export const agencyRouter = router({
             instructions: node.instructions ?? null,
             model: node.model ?? null,
             modelSettings: node.modelSettings ?? null,
+            parallelToolCalls: node.parallelToolCalls ?? true,
+            maxTurns: node.maxTurns ?? 25,
             isEntryPoint: node.isEntryPoint ?? false,
             isOptional: node.isOptional ?? false,
             position: node.position ?? null,
@@ -2572,6 +2581,8 @@ export const agencyRouter = router({
             instructions: agent.instructions,
             model: agent.model,
             modelSettings: agent.modelSettings as any,
+            parallelToolCalls: agent.parallelToolCalls,
+            maxTurns: agent.maxTurns,
             isEntryPoint: agent.isEntryPoint,
             isOptional: agent.isOptional,
             position: agent.position as any,
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index 6fe6bec3..956e5a4f 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -339,6 +339,8 @@ class AgencyOrchestrator:
                     model_settings=node.get("model_settings"),
                     tools=tools,
                     is_entry_point=node.get("is_entry_point", False),
+                    parallel_tool_calls=node.get("parallel_tool_calls"),
+                    max_turns=node.get("max_turns"),
                 ),
                 user_token=ctx.user_token,
             )
diff --git a/python-backend/app/services/agency_service.py b/python-backend/app/services/agency_service.py
index eb207fd5..994feaa4 100644
--- a/python-backend/app/services/agency_service.py
+++ b/python-backend/app/services/agency_service.py
@@ -460,7 +460,9 @@ class AgencyService:
                        "modelSettings" as model_settings,
                        "isEntryPoint" as is_entry_point,
                        "nodeType" as node_type,
-                       "nodeConfig" as node_config
+                       "nodeConfig" as node_config,
+                       "parallelToolCalls" as parallel_tool_calls,
+                       "maxTurns" as max_turns
                 FROM agency_agents
                 WHERE "agencyId" = :agency_id
                 ORDER BY "createdAt" ASC
@@ -477,6 +479,8 @@ class AgencyService:
                 "is_entry_point": row.is_entry_point,
                 "node_type": row.node_type or "agent",
                 "node_config": row.node_config or {},
+                "parallel_tool_calls": row.parallel_tool_calls,
+                "max_turns": row.max_turns,
             }
             for row in result.all()
         ]
diff --git a/python-backend/app/services/agency_swarm_adapter.py b/python-backend/app/services/agency_swarm_adapter.py
index 9f6d3d1c..617e725c 100644
--- a/python-backend/app/services/agency_swarm_adapter.py
+++ b/python-backend/app/services/agency_swarm_adapter.py
@@ -91,6 +91,9 @@ class AgentConfig(BaseModel):
     mcp_config: Any | None = None
     # Agent hooks for lifecycle callbacks
     hooks: Any | None = None
+    # v1.8: Runtime settings
+    parallel_tool_calls: bool | None = None
+    max_turns: int | None = None
 
 
 class AgencyConfig(BaseModel):
@@ -221,10 +224,23 @@ class AgencySwarmAdapter:
             agent_kwargs["description"] = config.description
 
         if config.model_settings:
+            ms_kwargs = dict(config.model_settings)
+            # Map reasoningEffort to reasoning dict for ModelSettings
+            reasoning_effort = ms_kwargs.pop("reasoningEffort", None)
+            if reasoning_effort:
+                ms_kwargs["reasoning"] = {"effort": reasoning_effort}
+            # Map parallel_tool_calls from AgentConfig into ModelSettings
+            if config.parallel_tool_calls is not None:
+                ms_kwargs["parallel_tool_calls"] = config.parallel_tool_calls
+            agent_kwargs["model_settings"] = ModelSettings(**ms_kwargs)
+        elif config.parallel_tool_calls is not None:
             agent_kwargs["model_settings"] = ModelSettings(
-                **config.model_settings
+                parallel_tool_calls=config.parallel_tool_calls,
             )
 
+        if config.max_turns is not None:
+            agent_kwargs["max_turns"] = config.max_turns
+
         # v1.7-1.8: Conversation starters and quick replies
         if config.conversation_starters:
             agent_kwargs["conversation_starters"] = config.conversation_starters
diff --git a/python-backend/tests/unit/test_agent_runtime_settings.py b/python-backend/tests/unit/test_agent_runtime_settings.py
new file mode 100644
index 00000000..629d74de
--- /dev/null
+++ b/python-backend/tests/unit/test_agent_runtime_settings.py
@@ -0,0 +1,103 @@
+"""
+Tests for agent runtime settings: parallelToolCalls, maxTurns, reasoningEffort.
+"""
+
+from unittest.mock import MagicMock, patch, call
+import pytest
+
+import app.services.agency_swarm_adapter as adapter_mod
+from app.services.agency_swarm_adapter import AgentConfig
+
+
+def _create_agent_with_mocks(config: AgentConfig):
+    """Helper to create an agent with adapter internals mocked."""
+    adapter = adapter_mod.AgencySwarmAdapter()
+    mock_agent = MagicMock()
+
+    with (
+        patch.object(adapter_mod, "Agent", return_value=mock_agent) as MockAgent,
+        patch.object(adapter_mod, "OpenAIChatCompletionsModel") as MockModel,
+    ):
+        MockModel.return_value = MagicMock()
+        adapter.create_agent(config=config, user_token="tok")
+        return MockAgent, mock_agent
+
+
+# ── Test 1: ModelSettings includes parallel_tool_calls ─────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_model_settings_includes_parallel_tool_calls():
+    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
+        name="TestAgent",
+        instructions="Do stuff",
+        model="gpt-4o",
+        model_settings={"temperature": 0.7},
+        parallel_tool_calls=False,
+    ))
+    call_kwargs = MockAgent.call_args[1]
+    ms = call_kwargs["model_settings"]
+    assert ms.parallel_tool_calls is False
+    assert ms.temperature == 0.7
+
+
+# ── Test 2: AgentConfig receives max_turns ───────────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_agent_config_receives_max_turns():
+    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
+        name="TestAgent",
+        instructions="Do stuff",
+        model="gpt-4o",
+        max_turns=10,
+    ))
+    call_kwargs = MockAgent.call_args[1]
+    assert call_kwargs["max_turns"] == 10
+
+
+# ── Test 3: Default max_turns not passed ─────────────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_default_max_turns_not_passed():
+    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
+        name="TestAgent",
+        instructions="Do stuff",
+        model="gpt-4o",
+    ))
+    call_kwargs = MockAgent.call_args[1]
+    assert "max_turns" not in call_kwargs
+
+
+# ── Test 4: ModelSettings includes reasoning effort ──────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_model_settings_includes_reasoning_effort():
+    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
+        name="TestAgent",
+        instructions="Think hard",
+        model="o3",
+        model_settings={"reasoningEffort": "high"},
+    ))
+    call_kwargs = MockAgent.call_args[1]
+    ms = call_kwargs["model_settings"]
+    assert ms.reasoning is not None
+    assert ms.reasoning.effort == "high"
+
+
+# ── Test 5: ModelSettings without reasoning effort omits it ──────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_model_settings_without_reasoning_effort():
+    MockAgent, _ = _create_agent_with_mocks(AgentConfig(
+        name="TestAgent",
+        instructions="Normal stuff",
+        model="gpt-4o",
+        model_settings={"temperature": 0.7},
+    ))
+    call_kwargs = MockAgent.call_args[1]
+    ms = call_kwargs["model_settings"]
+    assert ms.reasoning is None
