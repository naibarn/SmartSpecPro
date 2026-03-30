# Feature 053 — Frontend Security Audit Round 2

**Date:** 2026-03-23
**Auditor:** CMD-6 Frontend Security Auditor (SmartSpecPro)
**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** Feature 053 agentic intelligence frontend components — verify prior-audit fixes landed and check for remaining gaps.

---

## Prior-Audit Fix Verification

| Prior Finding | Expected Fix | Status |
|---|---|---|
| `resetAgentMemories` missing userId forwarding | Admin-only userId forwarding with `isDomainAdmin` gate | PASS |
| Delete button missing `disabled={isPending}` | `disabled={deleteMutation.isPending}` on Trash2 button | PASS |
| Memory items typed as `any` | `memories.map((m: Record<string, unknown>)` with explicit casts | PASS |
| Database icon missing `aria-hidden` | `aria-hidden="true"` on empty-state icon | PASS |
| `aria-live="polite"` missing on timeline | `role="log" aria-live="polite" aria-label="Execution timeline"` | PASS |
| `subtaskId` not truncated | `.slice(0, 128)` applied | PASS |
| `planVersion` not truncated | `.slice(0, 20)` applied | PASS |
| Brain icon missing `aria-hidden` in empty state | `aria-hidden="true"` on empty-state Brain icon | PASS |
| `agencyId` not uuid-validated | `z.string().uuid()` on all memory procedure inputs | PASS |
| `page` missing upper bound | `z.number().int().min(1).max(1000)` | PASS |
| `agentNodeId` missing max length | `z.string().min(1).max(200)` | PASS |
| `autonomous_agent` missing from node enum | Present in both `saveBuilder` and `createAgency` agent enum arrays | PASS |
| `reflectAfterSteps` not validated | `superRefine` enforces 1-10 integer | PASS |
| `budgetAllocation` not validated | `superRefine` enforces allowlist of three values | PASS |
| Entry-point message not updated for `autonomous_agent` | Zod `superRefine` message at line 1237 references `autonomous_agent` | PASS |

---

## New Findings

| ID | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|---|---|---|---|---|---|
| FE01 | HIGH | `apps/web/server/routers/agency.ts:1524–1531` | Missing feature-flag gate | `saveBuilder` accepts `autonomous_agent` nodes from any tenant with no feature-flag check. All other advanced node types (browser_session, etc.) share the same gap — none of the new 053 node types are gated by `getTenantFeatureFlag("AGENCY_AGENTIC")` server-side. A tenant without the feature enabled can persist autonomous_agent nodes by posting directly to the tRPC endpoint. | In the `saveBuilder` mutation body, after line 1531, add: `const agenticEnabled = await getTenantFeatureFlag(tenantId, "AGENCY_AGENTIC"); if (!agenticEnabled && input.agents.some(a => a.nodeType === "autonomous_agent")) throw new TRPCError({ code: "FORBIDDEN", message: "Autonomous agents are not enabled for your plan" });` |
| FE02 | MEDIUM | `apps/web/client/src/components/agency/MemoryViewer.tsx:36` | `as any` type cast | `memoryType: selectedType as any` bypasses the Zod enum expected by `listAgentMemories`. If the Zod schema for `memoryType` on the server is `z.enum(["constraint","preference","fact","skill"]).optional()` and the client passes an arbitrary string (e.g. from a tampered Select), the type cast prevents TypeScript from catching the mismatch at compile time. At runtime the server will reject it, but the cast also suppresses IDE safety checks for future callers who copy this pattern. | Type the state as `z.infer<typeof memoryTypeEnum> | undefined` or `"constraint" | "preference" | "fact" | "skill" | undefined` and remove the `as any` cast. |
| FE03 | MEDIUM | `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx:19–58` | Missing node-level `aria-label` | The root `<div>` of `AutonomousAgentNode` has no `aria-label` or `role` attribute. ReactFlow canvas nodes are rendered in a `div[role="presentation"]` context. Screen-reader users cannot identify this node as "Autonomous Agent" vs. the generic agent card. The `data.name` value (or fallback "Autonomous Agent") is displayed as visible text but not surfaced as an accessible label on the outermost focusable element. | Add `aria-label={data.name || "Autonomous Agent"}` to the root `<div className="relative rounded-lg ...">`, consistent with how other accessible interactive cards are labeled in this codebase. |
| FE04 | LOW | `apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx:51` | Decorative icon without `aria-hidden` | `<Database className="h-3 w-3 text-purple-400" />` renders an icon indicating long-term memory is enabled. The icon carries no label and is purely decorative in this context. Without `aria-hidden="true"` it appears in the accessibility tree as an unlabeled SVG, which screen readers may announce as "image" or skip unpredictably. | Add `aria-hidden="true"` to the `<Database>` icon at line 51. |
| FE05 | LOW | `apps/web/client/src/components/agency/__tests__/MemoryViewer.test.tsx:93–107` | Brittle delete-button selector | The test finds delete buttons by `b.classList.contains("h-5")` — a Tailwind size class that is likely to change with any UI update. When that class changes, the test silently passes without exercising the mutation path (the `if (firstTrash)` guard swallows the miss). | Use `data-testid="delete-memory-btn"` on each Trash2 button in `MemoryViewer` and select by `screen.getAllByTestId("delete-memory-btn")` in the test. |

---

## Detailed Notes

### FE01 — `saveBuilder` autonomous_agent feature-flag bypass (HIGH)

`saveBuilder` at line 1497 calls `assertAgencyEnabled(tenantId)` which checks the global agency feature flag but does not check the tenant-scoped `AGENCY_AGENTIC` flag introduced for feature 053. The `autonomous_agent` nodeType is accepted in the Zod schema (line 1164) and persisted to `agency_agents.nodeType` without any flag gate at the server layer.

The frontend `AgencyBuilder` guards the UI via the feature flag, but any authenticated user can bypass the UI and POST directly to the `agency.saveBuilder` tRPC procedure. The result is that autonomous_agent nodes are silently persisted and will be executed by the Python orchestrator whenever the agency runs, accruing up to 20x the expected credits with no plan-level check.

This is the highest-severity remaining finding.

### FE02 — `as any` on `memoryType` query param (MEDIUM)

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/MemoryViewer.tsx`, line 36.

```tsx
memoryType: selectedType as any,
```

`selectedType` is typed as `string | undefined` and comes from a controlled Select. While the Select options are hardcoded to the four valid enum values, the `as any` cast prevents tRPC's generated types from validating the field. Future developers extending the filter may not notice the server-side enum constraint.

### FE03 — AutonomousAgentNode missing root aria-label (MEDIUM)

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx`, lines 19–26.

The outer wrapper `<div>` has no `aria-label`. Compare with `AutonomousAgentNode`'s visual text at line 32 (`data.name || "Autonomous Agent"`) which is inside the card but not attached as an accessible name to the node container. The node's visible role and name need to be accessible to assistive technology users navigating the ReactFlow canvas via keyboard.

### FE04 — Decorative Database icon without aria-hidden (LOW)

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/AutonomousAgentNode.tsx`, line 51.

```tsx
{enableMemory && (
  <Database className="h-3 w-3 text-purple-400" />
)}
```

No `aria-hidden="true"`. The Brain icon in the same file (line 31) also lacks `aria-hidden` when it appears as a pure visual indicator inside the card alongside text.

### FE05 — Brittle test selector for delete button (LOW)

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/__tests__/MemoryViewer.test.tsx`, lines 99–106.

The `h-5` class is a Tailwind sizing class applied to the Button wrapper; if the size variant changes this selector silently finds nothing and the `if (firstTrash)` guard causes the assertion to never run rather than fail the test.

---

## Components Verified Clean

| Component | Check | Result |
|---|---|---|
| `MemoryViewer.tsx` | No `dangerouslySetInnerHTML` — memory content rendered as `{content}` text node | PASS |
| `ExecutionTimeline.tsx` | No `dangerouslySetInnerHTML` — all SSE event data cast via `String()` | PASS |
| `AutonomousConfigPanel.tsx` | No `dangerouslySetInnerHTML`, no raw HTML rendering, no user-controlled HTML | PASS |
| `AgencySidebar.tsx` | `autonomous_agent` present in `NODE_TYPE_SECTIONS` with Brain icon | PASS |
| `TextContentPreviewContent.tsx` | `dangerouslySetInnerHTML` at line 95 is DOMPurify-sanitized (lines 67–68) | PASS |
| `MemoryViewer.tsx` | No JWT/token in localStorage | PASS |
| `AutonomousConfigPanel.tsx` | All values come from controlled inputs (range/select); no free-form HTML | PASS |
| `resetAgentMemories` router | `isDomainAdmin` gate correctly restricts userId forwarding | PASS |
| `deleteAgentMemory` router | Non-admin path appends `eq(userId, ctx.user.id)` to WHERE clause | PASS |
| `listAgentMemories` router | Non-admin path appends `eq(userId, ctx.user.id)` to WHERE clause | PASS |
| Test files | Both `AutonomousConfigPanel.test.tsx` and `MemoryViewer.test.tsx` exist with meaningful coverage | PASS |

---

## Summary

**CONDITIONAL PASS** — No CRITICAL findings. One HIGH finding (FE01) that must be resolved before merging to production: `saveBuilder` accepts `autonomous_agent` nodes without checking the `AGENCY_AGENTIC` tenant feature flag server-side, allowing plan-level bypass. Two MEDIUMs (FE02 type-safety, FE03 accessibility) and two LOWs (FE04 aria-hidden, FE05 brittle test) are present but do not block merge if tracked.

The XSS surface is clean: no unsanitized `dangerouslySetInnerHTML`, no `innerHTML` assignments, no dynamic `<script>` injection. Auth token storage, CSRF, and VITE_ secret exposure are all unchanged from the passing baseline established in prior audits.
