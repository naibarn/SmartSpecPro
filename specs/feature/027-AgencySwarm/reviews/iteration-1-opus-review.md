# Agency-Swarm Integration — Plan Review (Iteration 1)

**Reviewer:** Claude Opus subagent
**Date:** 2026-02-27

---

## HIGH Severity Findings

### H1. openai v2 upgrade has cascading dependency conflicts not addressed

**Affected:** Plan Section 2.2

`requirements.txt` includes `langchain-openai>=0.2.0`, `anthropic==0.8.1` (very old), `chromadb>=0.5.0`, `sentence-transformers>=2.2.0` — all with their own openai/pydantic version constraints. The plan only audits files importing `openai` but ignores transitive dependency conflicts.

**Recommendation:** Before Phase 0, run `pip install agency-swarm==1.8.0 openai>=2.2 pydantic>=2.11` in an isolated venv to discover all conflicts. The `anthropic==0.8.1` pin especially needs auditing. Add explicit Phase 0 task: "Resolve all pip dependency conflicts."

### H2. OpenAIError import renamed in openai v2 — production code will break

**Affected:** Plan Section 2.2

`openai.OpenAIError` used in `python-backend/app/llm_proxy/openrouter_wrapper.py` was renamed to `openai.APIError` in v2. The plan only mentions `.output` type changes.

**Recommendation:** Grep for `OpenAIError` across all Python files and replace with v2 equivalents.

### H3. Credit reserve/reconcile contradicts spec's corrected approach

**Affected:** Plan Sections 4.4, 5.5

The spec's Appendix C.2 explicitly corrected: "credits are post-hoc, no reservation." The plan re-introduces reservation. The existing credit service has no reservation concept — only `deductCredits()` and `addCredits()`.

**Recommendation:** Align with spec: individual LLM calls charged at gateway as usual (per-call deduction). Agency credit multiplier markup calculated and charged at run completion. No reservation system needed.

### H4. Dual-ORM cross-database FK integrity is unenforceable

**Affected:** Plan Section 3.1, 3.3

SQLAlchemy tables (`agency_messages`, `agency_runs`) have FK constraints pointing to Drizzle-owned `agency_conversations`. Alembic cannot manage FKs to tables it doesn't own. Migration ordering issues will arise.

**Recommendation:** Define FKs without `ForeignKey()` constraints in SQLAlchemy — use plain integer/string columns. Enforce referential integrity at application level. Document migration ordering: Drizzle MUST run before Alembic.

### H5. Agency objects not thread-safe — 50 concurrent runs may corrupt state

**Affected:** Plan Section 14.2

agency-swarm's `Agency` object may use mutable shared state. 50 concurrent `get_response()` calls could corrupt state. Plan does not address this.

**Recommendation:** Validate thread safety in Phase 1. Mandate per-request Agency instantiation (never reuse). Size httpx connection pool for 50+ concurrent outbound connections.

### H6. Approval gate "pause" mechanism is architecturally undefined

**Affected:** Plan Section 8.2

Pausing an agency-swarm run mid-execution requires a checkpoint/resume mechanism that doesn't exist. agency-swarm has no built-in "pause and wait for external input" (unlike LangGraph's `interrupt()`).

**Recommendation:** Descope runtime approval gates from MVP. Only support pre-configured whitelists (static, no pausing needed). If runtime approval is critical, design a proper async pause/resume architecture as its own section.

### H7. `CreditSourceType` needs "agency" value added

**Affected:** Plan Sections 5.4, 5.5

`CreditSourceType` in `creditService.ts` has a fixed set of values. The plan adds "agency" to sandbox `featureType` but never adds "agency" to `CreditSourceType`. Agency credit usage would be tracked as "chat" or "other", losing analytics capability.

**Recommendation:** Add `"agency"` to `CreditSourceType` union. Pass through gateway request headers for proper attribution.

---

## MEDIUM Severity Findings

### M1. Feature flag system is underspecified

**Affected:** Plan Section 2.4

`system_settings` has no per-tenant override, no rollout percentages. Existing sandbox feature flags use `process.env`, not `system_settings`. Two inconsistent patterns.

**Recommendation:** Define flag evaluation hierarchy: `env var > tenant setting > global setting > default`. Specify how Python reads these flags.

### M2. Python HTTP calls to Node.js for config adds latency per run

**Affected:** Plan Section 4.2

Every agency run starts with HTTP call from Python to Node.js to load config. Python already reads from the same PostgreSQL DB for other tables. No technical reason it can't read Drizzle-owned tables directly.

**Recommendation:** Allow Python to read agency config tables directly via read-only SQLAlchemy models. Reserve HTTP bridge for mutations only.

### M3. PII redaction via regex may corrupt structured agent data

**Affected:** Plan Section 4.6

Regex patterns will match version numbers, UUIDs, code variables. If tool output JSON is corrupted by PII redactor, downstream agents fail.

**Recommendation:** Apply PII redaction only to human-readable message content, not `tool_calls` JSON or system messages. Consider "store raw, redact on display" for inter-agent messages.

### M4. 8-week timeline omits large portions of spec without acknowledgment

**Affected:** Plan Section 13

The plan omits ISC integration, group-scoped sharing, onboarding tutorials, scheduled messages — all in the original spec. Creates ambiguity about actual scope.

**Recommendation:** Add explicit "Scope Boundary" section listing what is in-scope vs. deferred.

### M5. React Flow is a new dependency not currently in the project

**Affected:** Plan Section 6.2

The spec says "No New Frontend Dependencies" but React Flow adds ~50-80KB gzipped. Needs verification and explicit acknowledgment.

**Recommendation:** Verify if `@xyflow/react` is in `apps/web/package.json`. Document bundle size impact.

### M6. SSE proxy chain is fragile without heartbeat/reconnection

**Affected:** Plan Section 5.3

3 long-lived HTTP connections with no heartbeat. Nginx may buffer SSE by default.

**Recommendation:** Add heartbeat events, client reconnection via run status endpoint, `proxy_buffering off` in Nginx, `X-Accel-Buffering: no` header.

### M7. Inconsistent ID strategy (serial vs UUID)

**Affected:** Plan Section 3.2

`agencies.id` is UUID but `agency_conversations.id` is serial integer. Serial IDs are predictable (IDOR risk in multi-tenant context).

**Recommendation:** Use UUIDs consistently for all new table primary keys.

### M8. No rate limiting on Python FastAPI agency endpoints

**Affected:** Plan Section 4.7

Rate limits defined on Node.js side only. Python endpoints unprotected against internal misconfiguration or bugs.

**Recommendation:** Add rate limiting to Python router. Add per-user concurrent run limit (not just global 50).

---

## LOW Severity Findings

### L1. Template storage location (skills directory) is semantically wrong

Agencies are not skills. Store templates in DB or `apps/web/agency-templates/`.

### L2. 10-minute default timeout too low for complex agencies with sandbox tools

Default to 1800s (30 min). Add warning when configured below 600s with sandbox tools.

### L3. `agency_agents.tools` JSON column creates denormalized relationship

Use junction table `agency_agent_tools(agentId, toolId)` for FK integrity and bidirectional queries.

### L4. Data retention archival lacks implementation detail

Specify mechanism: table partitioning by `created_at` month is simplest.

### L5. No test strategy described

Add testing strategy: mock agency-swarm classes in unit tests, mock gateway in integration tests, in-process FastAPI test client for SSE.

### L6. Missing Nginx configuration for SSE proxying

Add `proxy_buffering off;` to Nginx location block for agency stream endpoint.
