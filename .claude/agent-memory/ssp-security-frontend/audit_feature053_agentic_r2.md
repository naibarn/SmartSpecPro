---
name: audit_feature053_agentic_r2
description: Round 2 verification audit of feature-053 agentic intelligence frontend — all prior fixes confirmed landed, one new HIGH (saveBuilder feature-flag bypass), two MEDIUMs, two LOWs
type: project
---

Round 2 audit of feature-053 components on branch codex/feature-044-multimodal-chat-memory (2026-03-23).

All 15 prior-audit findings verified as fixed (MemoryViewer userId forwarding, isPending disable, Record typing, aria-hidden icons, aria-live timeline, subtaskId/planVersion truncation, uuid validation, page max, agentNodeId max, autonomous_agent enum, reflectAfterSteps/budgetAllocation superRefine, entry-point message update).

**Why:** Verifying pre-merge readiness for feature-053.

**How to apply:** When the next feature-053 patch audit runs, these prior findings are closed — focus only on open items below.

## Open findings after Round 2

FE01 HIGH — `apps/web/server/routers/agency.ts:1497–1531`
`saveBuilder` accepts `autonomous_agent` node type from any tenant without checking `AGENCY_AGENTIC` feature flag server-side. Frontend guards the UI but the tRPC endpoint is unprotected. Fix: add `getTenantFeatureFlag(tenantId, "AGENCY_AGENTIC")` check in saveBuilder body before persisting autonomous_agent nodes.

FE02 MEDIUM — `apps/web/client/src/components/agency/MemoryViewer.tsx:36`
`memoryType: selectedType as any` — suppresses tRPC type safety. Fix: type selectedType as the enum union.

FE03 MEDIUM — `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx:19`
Root `<div>` has no `aria-label`. Fix: add `aria-label={data.name || "Autonomous Agent"}`.

FE04 LOW — `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx:51`
Decorative `<Database>` icon missing `aria-hidden="true"`.

FE05 LOW — `apps/web/client/src/components/agency/__tests__/MemoryViewer.test.tsx:99`
Delete button found by brittle `h-5` class selector inside an `if (firstTrash)` guard that swallows misses. Fix: use `data-testid`.
