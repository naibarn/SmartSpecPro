# TDD Plan — 052 Agency Swarm Full Capability Upgrade

Testing frameworks: **Vitest** (TypeScript/tRPC), **pytest** (Python)
Existing patterns: Vitest mocks for DB/services in `__tests__/`, pytest with markers (unit, integration, auth, credits)

---

## 2. Database Schema Changes

### Tests to write first:
```
# Test: Drizzle migration applies cleanly (no errors, row counts unchanged)
# Test: modelSettings snake_case → camelCase migration transforms correctly
# Test: modelSettings migration is idempotent (running twice doesn't corrupt)
# Test: New tables (agency_guardrails, agency_shared_tools, agency_run_traces) created with correct constraints
# Test: agency_agent_guardrails UNIQUE(agentId, guardrailId) enforced
# Test: agency_shared_tools UNIQUE(agencyId, toolId) enforced
# Test: ON DELETE CASCADE works for agency_guardrails when agency deleted
```

---

## 3. Phase 1 — Core Foundation

### 3.1 Custom Tool Creation (Feature 2.1)

```
# Vitest: createCustomTool validates name uniqueness per tenant
# Vitest: createCustomTool rejects endpoint with private IP (SSRF)
# Vitest: createCustomTool rejects endpoint with localhost
# Vitest: createCustomTool encrypts headers before storing
# Vitest: createCustomTool enforces max 50 tools per tenant
# Vitest: createCustomTool rate limits at 10/min per user
# Vitest: updateCustomTool increments version
# Vitest: deleteCustomTool soft-deletes and checks no agents reference it
# Vitest: testCustomTool validates input against inputSchema before HTTP call
# Vitest: listCustomTools filters by tenant, excludes disabled
# pytest: ToolBridge validates input against JSON Schema before HTTP call
# pytest: ToolBridge returns structured error on validation failure (not raw exception)
# pytest: ToolBridge respects strictSchema flag
# pytest: ToolBridge respects oneCallAtATime flag
# pytest: SSRF guard blocks private IPs, localhost, metadata endpoints
```

### 3.2 OpenAPI Import (Feature 2.2)

```
# Vitest: importOpenAPITools parses valid OpenAPI 3.0 JSON spec
# Vitest: importOpenAPITools parses valid OpenAPI 3.1 YAML spec
# Vitest: importOpenAPITools rejects circular $ref
# Vitest: importOpenAPITools rejects nesting depth >10
# Vitest: importOpenAPITools rejects >100 operations
# Vitest: importOpenAPITools rejects spec >500KB
# Vitest: importOpenAPITools + existing tools must not exceed 50-tool cap
# Vitest: importOpenAPITools extracts inputSchema from parameters + requestBody
# Vitest: importOpenAPITools SSRF-validates base URL
# Vitest: confirmOpenAPIImport bulk creates tools
```

### 3.3 Guardrails (Feature 2.3)

```
# Vitest: createGuardrail validates strategy against 7 allowed values
# Vitest: assignGuardrailToAgent blocks cross-tenant assignment (returns 403)
# Vitest: assignGuardrailToAgent enforces UNIQUE(agentId, guardrailId)
# pytest: keyword_block strategy blocks matching keywords (case-insensitive)
# pytest: regex_match strategy blocks matching pattern
# pytest: llm_classify strategy calls LLM Gateway and evaluates blockIf
# pytest: json_schema strategy validates output JSON against schema
# pytest: max_length strategy blocks messages exceeding maxChars
# pytest: pii_detection strategy detects email/phone/SSN patterns
# pytest: pii_detection with action=redact replaces PII with [REDACTED]
# pytest: custom_endpoint strategy calls SSRF-validated URL
# pytest: guardrail execution respects sortOrder
# pytest: strict mode raises exception, guidance mode returns message
# pytest: output guardrail retries up to validationAttempts
# pytest: enforceOnHandoff=true runs input guardrails on handoff messages
```

### 3.4 Agency Context (Feature 2.4)

```
# pytest: AgencyRunContext.get/set with asyncio lock is thread-safe
# pytest: AgencyRunContext concurrent read/write doesn't corrupt data
# pytest: AgencyRunContext initialized with user_context from agency
# pytest: AgencyRunContext snapshot persisted to trace at run end
# pytest: Tools can access context via self.context.get/set
```

### 3.5 Agent Runtime Settings (Feature 2.16)

```
# Vitest: saveBuilder validates maxTurns z.number().int().min(1).max(100)
# Vitest: saveBuilder validates temperature z.number().min(0).max(2)
# Vitest: saveBuilder validates topP z.number().min(0).max(1)
# Vitest: saveBuilder validates reasoningEffort z.enum()
# pytest: orchestrator passes ModelSettings with parallel_tool_calls to adapter
# pytest: orchestrator passes max_turns to Agent constructor
# pytest: agent terminates when maxTurns exceeded
```

---

## 4. Phase 2 — Communication & Streaming

### 4.1 SSE Streaming (Feature 2.5)

```
# Vitest: POST /api/agency/:agencyId/stream requires JWT auth
# Vitest: SSE route sends heartbeat every 15s
# Vitest: SSE route subscribes to correct Redis channel
# Vitest: SSE events include id: field for replay
# Vitest: SSE route handles client disconnect gracefully
# Vitest: SSE backpressure: bounded buffer drops oldest when full
# pytest: AgencyEventEmitter publishes to Redis channel
# pytest: AgencyEventEmitter persists events to Redis list for replay
# pytest: orchestrator emits text_delta events during agent response
# pytest: orchestrator emits tool_start/tool_end around tool calls
# pytest: orchestrator emits agent_switch on handoff
# pytest: cancel sets cancellation flag and orchestrator checks between steps
```

### 4.2 Structured Output (Feature 2.6)

```
# pytest: agent response validated against outputSchema
# pytest: validation failure triggers retry with feedback
# pytest: successful structured output stored in context under {agentName}_output
# pytest: invalid JSON response retried (not just schema mismatch)
```

### 4.3 Custom Communication Flows (Feature 2.7)

```
# Vitest: saveBuilder validates flowConfig.maxRoundTrips as positive integer
# pytest: orchestrator enforces maxRoundTrips between agent pairs
# pytest: contextFields included in agent prompt during handoff
```

### 4.4 Dynamic Instructions (Feature 2.8)

```
# pytest: {agent_name} resolved to actual agent name
# pytest: {current_date} resolved to today's date
# pytest: {context.KEY} resolved from AgencyRunContext
# pytest: {user.KEY} resolved from user_context
# pytest: missing template variable returns literal {key} (not error)
# pytest: resolved instructions logged in trace
```

### 4.5 Topology & Human Approval (Feature 2.17)

```
# Vitest: submitApproval verifies ownership (createdBy or admin)
# Vitest: submitApproval rejects if run not in awaiting_approval state
# Vitest: submitApproval rejects double-approval (idempotency)
# Vitest: approvalKey is crypto.randomUUID() format
# pytest: approval_required SSE event emitted with correct approvalKey
# pytest: agent resumes after approval context flag set
# pytest: agent receives rejection feedback
# pytest: approval timeout (30min) terminates run with approval_timeout status
# pytest: approvalKey invalidated after single use
```

---

## 5. Phase 3 — Advanced Capabilities

### 5.1 Few-Shot Examples (Feature 2.9)

```
# Vitest: examples validated: max 10 pairs, max 2000 chars/message
# Vitest: prompt injection patterns stripped from examples
# pytest: examples prepended to agent history with system framing
# pytest: conversation starters cached in Redis when enabled
# pytest: cache invalidated when agency instructions change
```

### 5.2 Shared Instructions & Tools (Feature 2.10)

```
# pytest: sharedInstructions prepended to every agent's system prompt
# pytest: shared tools available to all agents without per-agent assignment
# Vitest: agency_shared_tools junction created correctly
```

### 5.3 MCP Tools Server (Feature 2.11)

```
# Vitest: MCP endpoint returns agency tools in MCP format
# pytest: external MCP server tool discovery returns tool list
# Vitest: MCP server tokens stored encrypted
```

### 5.6 Observability & Tracing (Feature 2.13)

```
# pytest: trace built during orchestrator run with correct span structure
# pytest: secret scrubbing strips sk-*, Bearer, Authorization from traces
# pytest: tool output truncated at 1000 chars in trace
# Vitest: listRunTraces filters by tenantId
# Vitest: retention cleanup deletes traces older than configured period
```

---

## 6. Phase 4 — Polish

### 6.1 Tool Progress Streaming (Feature 2.14)

```
# pytest: emit_progress publishes tool_progress SSE event
# pytest: builtin-web-search emits progress during execution
```

### 6.2 Standalone Tool API (Feature 2.15)

```
# Vitest: POST /api/v1/agency-tools/:toolId/execute requires API key with scope
# Vitest: tenant isolation: tool.tenantId must match apiKey.tenantId
# Vitest: request body validated against tool's inputSchema
# Vitest: rate limit 100 req/min per key
# Vitest: GET /api/v1/agency-tools/openapi.json returns valid OpenAPI spec
```

---

## 7. Phase 5 — New Node Types & Skill Integration

### 7.1 Conditional Branch Node (Feature 2.18)

```
# pytest: rule_based evaluation with equals operator
# pytest: rule_based evaluation with contains operator
# pytest: rule_based evaluation with regex operator
# pytest: rule_based evaluation with gt/lt/gte/lte operators
# pytest: rule_based evaluation with exists operator
# pytest: llm_classify calls LLM Gateway with fixed template
# pytest: context_check reads AgencyRunContext key
# pytest: default branch used when no rule matches
# pytest: defaultTargetNodeId validated to exist in agency
```

### 7.2 Parallel Fan-Out & Merge (Feature 2.19)

```
# pytest: N branches execute concurrently via asyncio.gather
# pytest: wait_all merge waits for all branches
# pytest: first_complete returns immediately on first branch completion
# pytest: custom_prompt merge calls LLM Gateway
# pytest: timeout per branch enforced
# pytest: continueOnError=true doesn't stop on branch failure
# pytest: maxConcurrent capped at 10 server-side
# pytest: credits tracked per branch separately
# pytest: ExecutionContext.clone() deep-copies results but shares AgencyRunContext
# pytest: budget exceeded mid-branch cancels remaining branches
```

### 7.3 Loop / Retry Node (Feature 2.20)

```
# pytest: loop exits when max_iterations reached
# pytest: loop exits when exit condition met
# pytest: maxIterations server-side capped at 20
# pytest: feedback injected between iterations
# pytest: total timeout enforced
# pytest: every iteration logged in trace
# pytest: credit cap of 50 per loop node enforced
# pytest: loopTargetNodeId validated to exist in same agency
```

### 7.4 Enhanced Skill Integration (Feature 2.21)

```
# pytest: skill input mapping resolves static values
# pytest: skill input mapping resolves node output references
# pytest: skill input mapping resolves context keys
# pytest: backward compatible: unmapped skill_call sends full context
# pytest: skill_discovery returns ranked skills with confidence
# pytest: skill_discovery respects confidenceThreshold
# pytest: skill_discovery maxResults capped at 10
```

### 7.5 Error Handler & Data Transform (Feature 2.22)

```
# pytest: error_handler retries with exponential backoff
# pytest: error_handler fallback routes to alternative node
# pytest: error_handler skip returns skipMessage
# pytest: error_handler scrubs stack traces from fallback payload
# pytest: maxRetries capped at 5 server-side
# pytest: data_transform jsonpath extracts correct fields
# pytest: data_transform template renders with HTML escaping
# pytest: data_transform filter reduces array by condition
```

### 7.6 AI Agency Creator v2 (Feature 2.23)

```
# pytest: PLAN phase generates planSteps with valid nodeTypes
# pytest: REVIEW_PLAN phase catches missing error handler
# pytest: REVIEW_PLAN exits after 1 iteration if first verdict = "pass"
# pytest: REVIEW_PLAN max 3 loops
# pytest: DESIGN phase generates nodeConfig for conditional_branch
# pytest: DESIGN phase generates nodeConfig for parallel_fan_out
# pytest: REVIEW_DESIGN validates all nodes connected (no orphans)
# pytest: VALIDATE catches conditional_branch without default target
# pytest: VALIDATE catches loop_retry with maxIterations > 20
# pytest: VALIDATE catches parallel_fan_out with < 2 branches
# pytest: total LLM calls capped at 12 per creation
# pytest: total credits capped at 50 per creation
# pytest: fallback uses prior phase result on LLM failure
# pytest: requirement "quality check + parallel research" produces agency with conditional + parallel nodes
```
