# Agency-Swarm Integration — Interview Transcript

> Conducted as part of deep-plan workflow for `specs/feature/027-AgencySwarm/spec.md`

---

## Q1: Database Ownership — How should Python access agency data?

**Options presented:** (A) Dual ORM — both Drizzle and SQLAlchemy access same tables, (B) Node.js gateway only — Python never touches agency DB directly, (C) Hybrid — Python owns runtime tables, Node.js owns config tables.

**Answer:** **C: Hybrid ownership**

Python owns runtime tables (agency_runs, agency_messages) while Node.js/Drizzle owns configuration tables (agencies, agency_agents, agency_tools, agency_communication_flows). Each side manages its own migrations for owned tables.

---

## Q2: MVP Integration Channels — Which channels for initial release?

**Options presented:** Chat UI only, Chat UI + Workflow, Chat UI + Workflow + Skill Trigger, All 8 channels.

**Answer:** **Chat UI + Workflow Node + Skill Auto-Trigger**

Three channels for initial release. Remaining 5 (Scheduled Messages, OpenAI API, MCP Server, Webhooks, Desktop App) deferred to later phases.

---

## Q3: Python Version Upgrade Strategy

**Options presented:** (A) Upgrade entire backend to 3.12, (B) Separate Python 3.12 service, (C) Separate venv in same container.

**Answer:** **A: Upgrade entire backend**

Single Python 3.12 container. Requires testing all existing code against 3.12 but keeps infrastructure simple.

---

## Q4: Table Ownership Split — Who owns agency_conversations?

**Options presented:** Python owns conversations too, Node.js owns conversations, Custom split.

**Answer:** **Node.js owns conversations**

Final table ownership:
- **Node.js (Drizzle):** agencies, agency_agents, agency_tools, agency_communication_flows, agency_conversations
- **Python (SQLAlchemy):** agency_messages, agency_runs

---

## Q5: Multi-Agent Credit Tracking Model

**Options presented:** (A) Per-call deduction through gateway, (B) Accumulate + deduct once at completion, (C) Reserve estimated credits upfront + reconcile at completion.

**Answer:** **C: Reserve + reconcile**

Reserve estimated credits upfront before starting the agency run. Track actual costs during the run. At completion, deduct actual cost and refund the difference between reserved and actual.

---

## Q6: Agency Tool Execution Routing

**Options presented:** Sandbox for all tools, Direct service calls, Hybrid by risk level.

**Answer:** **Hybrid by risk**

- Code-execution tools → route through OpenSandbox (maximum isolation)
- Data-access tools (search, fetch, library lookup) → direct HTTP service calls (lower latency)

---

## Q7: AgencyBuilder UX Sophistication

**Options presented:** (A) Form wizard, (B) Simple graph editor, (C) Full drag-and-drop canvas.

**Answer:** **C: Full drag-and-drop canvas**

Full canvas with property panels, similar in richness to the existing presentation editor. Most visual, highest dev effort.

---

## Q8: Conversation History Retention Policy

**Options presented:** (A) Keep everything indefinitely, (B) Keep last N conversations, (C) Time-based archival.

**Answer:** **C: Time-based archival**

Move to cold storage after 30 days. Keep last 7 days hot/active.

---

## Q9: OpenAI SDK Upgrade Risk Strategy

**Options presented:** (A) Upgrade in-place, (B) Separate pinning, (C) Feature flag rollback.

**Answer:** **C: Feature flag rollback**

Upgrade openai globally to >=2.2.0 but wrap agency features behind feature flags so they can be disabled if the upgrade causes issues in existing code paths. Allows safe rollback without reverting the SDK.

---

## Q10: Agency-Swarm Abstraction Level

**Options presented:** (A) Full abstraction of every class, (B) Wrap creation + execution only, (C) Minimal wrapping.

**Answer:** **B: Creation + execution only**

Wrap Agency/Agent construction and run methods behind SSP interfaces. Expose raw streaming event types for performance. Balance between isolation and development velocity.

---

## Q11: Multi-Agent Chat UI Display

**Options presented:** (A) Final response only, (B) Single thread + badges, (C) Split view.

**Answer:** **C: Split view**

Main conversation thread showing user messages and final agent responses, plus a collapsible side panel showing agent-to-agent activity, tool calls, and handoff events. Best transparency without cluttering the main conversation.

---

## Q12: Agency Sharing Scope for v1

**Options presented:** (A) Private only, (B) Tenant-level sharing, (C) Full marketplace.

**Answer:** **B: Tenant sharing**

Users can share agencies within their tenant/organization for v1. Full public marketplace deferred to a later release.

---

## Q13: Error Handling During Agency Runs

**Options presented:** (A) Fail fast + refund, (B) Retry then fail, (C) Skip + continue, (D) Pause + notify.

**Answer:** **Hybrid approach by error type:**

- **Transient errors** (timeout, 429, 503) → Retry 2-3 times with backoff
- **Permanent errors** (credit exhaustion, auth error, validation error) → Fail fast immediately
- **Optional agent failure** → Skip + continue only for agents explicitly marked as `optional`
- **Credits** → Deduct actual usage, refund remaining reserved credits

---

## Q14: Performance Targets

**Answer:** **Medium scale (B)**

- Max 50 concurrent agency runs
- Max 10 agents per run
- 10-minute timeout per run
- Queue/backpressure limits apply

---

## Q15: Approval Gates for High-Risk Tool Calls

**Options presented:** (A) Pre-configured whitelist, (B) Runtime approval, (C) Both.

**Answer:** **C: Both**

Pre-configured tool whitelist set by admin at agency creation time, plus runtime approval prompts for any high-risk action not in the whitelist (sandbox execution, external API calls, credit spend above threshold).

---

## Q16: v1 Starter Templates

**Answer:** 4 built-in templates:

1. **Research Agency** — Web search + summarize
2. **Content Writer Agency** — Draft + review + publish
3. **Spec Writer Agency** — Requirements + design
4. **Code Review Agency** — Analyze + suggest + test

---

## Q17: Degraded Runtime Fallback Strategy

**Answer:** **Context-dependent fallback:**

- **Interactive chat** → Fallback to single-agent chat mode (only if template is marked `fallback-safe`)
- **Async/background jobs** → Queue + retry when service recovers
- **High-risk / approval-required / critical workflow** → Fail closed with clear error

---

## Q18: PII Redaction in Agent Activity

**Options presented:** (A) Redact before storage, (B) Store raw, redact on display, (C) Tenant-configurable, (D) No redaction for v1.

**Answer:** **A: Redact before storage**

PII is never persisted in agent-to-agent activity logs. Strongest privacy guarantee. May lose some diagnostic context.

---

## Q19: Staged Rollout Sequence

**Options presented:** (A) Internal → beta → all, (B) Per-tenant flag, (C) Per-user flag.

**Answer:** **A: Staged (internal → beta → all)**

Progressive rollout with quality gates between stages.

---

## Q20: Additional Requirements (Open-Ended)

User provided comprehensive additional requirements:

1. **Performance targets** → Resolved in Q14 (medium scale)
2. **Admin controls** → Enable/disable agency by tenant, per-tenant quotas, max credit reserve, kill switch, allowed tools whitelist
3. **Observability/SLOs** → Run success rate, p95 latency, step failure rate, retry counts, credit reconciliation mismatch alerts
4. **Security/compliance** → PII redaction (resolved Q18), audit logs, retention override by tenant, archive/purge rules
5. **Template scope** → Resolved in Q16 (4 templates)
6. **Approval gates** → Resolved in Q15 (both whitelist + runtime)
7. **Fallback behavior** → Resolved in Q17 (context-dependent)
8. **Migration/testing plan** → Python 3.12 + OpenAI v2 contract tests, rollback path, staged rollout by feature flag (resolved Q9, Q19)
