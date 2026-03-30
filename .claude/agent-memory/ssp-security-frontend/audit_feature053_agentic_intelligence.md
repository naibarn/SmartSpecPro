---
name: audit_feature053_agentic_intelligence
description: 2026-03-23 frontend security audit of feature-053 agentic intelligence components (NodePropertyPanel Intelligence section, AutonomousConfigPanel, ExecutionTimeline, MemoryViewer, AutonomousAgentNode)
type: project
---

Audit of 5 files for feature-053 (agentic intelligence) frontend components.

**Result: CONDITIONAL PASS — 2 HIGH findings block merge**

**Why:** No XSS, no localStorage token storage, no raw fetch() mutations. All tRPC-backed. Clean on 6/10 checklist items.

**Open items (blocking):**

- FE01 HIGH: `MemoryViewer.tsx` — `resetAgentMemories` is called without forwarding the `userId` prop when `isAdmin` is true. The `userId` prop is declared on the interface (line 17) and destructured (line 28) but never used in any mutation call. When a domain_admin views another user's memories and hits "Confirm Reset", the server defaults to the admin's own id, resetting the wrong user's memories silently. Fix: pass `userId: isAdmin ? userId : undefined` in the resetMutation.mutate() call.

- FE02 HIGH: `saveBuilder` server procedure (agency.ts:1148) — no feature-flag guard for `autonomous_agent` nodeType or `executionMode: "agentic"`. Any authenticated user on any tenant can persist autonomous/agentic configs regardless of tenant entitlement. Other sensitive operations (MCP bridge, Tool API) correctly check `getTenantFeatureFlag`. Fix: add `getTenantFeatureFlag("AGENCY_AGENTIC_MODE_ENABLED", tenantId)` check before persisting autonomous_agent or agentic executionMode nodes.

**Open items (non-blocking):**

- FE03 MEDIUM: `MemoryViewer.tsx:118` — memory list typed as `any`, `m.memoryType` used as CSS lookup key without TypeScript enforcement.
- FE04 MEDIUM: `AutonomousConfigPanel` sliders for `reflectAfterSteps`, `delegationMode`, `budgetAllocation` have no corresponding server-side validation in `saveBuilder` (unlike maxPlanDepth, maxTotalIterations, qualityThreshold which are validated).
- FE05 MEDIUM: `ExecutionTimeline.tsx` — no length cap on `evt.data.subtaskId` / `planVersion` / `tokensUsed` in display rendering.
- FE06 LOW: `MemoryViewer.tsx` — per-row trash delete fires immediately with no confirmation or pending-state guard on the button.
- FE07 LOW: `ExecutionTimeline` has no `aria-live` region; `AutonomousAgentNode` has no `aria-label`; decorative Brain icons not `aria-hidden`.

**How to apply:** In future audits of agentic/autonomous feature additions, always check: (1) saveBuilder feature-flag guard for new nodeTypes, (2) every destructured prop is actually used in mutations, (3) slider config fields have matching server-side superRefine validation.
