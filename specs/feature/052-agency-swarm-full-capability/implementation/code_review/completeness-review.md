# Spec 052 — Completeness Review

## Verdict: APPROVE_WITH_FIXES

## Findings

| Severity | Area | Issue | Fix |
|---|---|---|---|
| HIGH | `agency.ts` custom tool procedures | Feature flag `agencyCustomTools` (F30) registered but **never enforced** in createCustomTool, updateCustomTool, deleteCustomTool, listCustomTools, importOpenApiSpec | Add `requireFeatureFlag("agencyCustomTools")` guard |
| HIGH | `agency.ts` guardrail procedures | Feature flag `agencyGuardrails` (F31) registered but **never enforced** in any guardrail CRUD procedure | Add `requireFeatureFlag("agencyGuardrails")` guard |
| HIGH | `agencyStream.ts:88` | Streaming uses global `AGENCY_STREAMING_ENABLED` instead of tenant-scoped `agencyStreaming` (F32) | Replace with `getTenantFeatureFlag("agencyStreaming", tenantId)` |
| MEDIUM | `agencyToolsApi.ts` | `agencyToolApi` (F34) uses global flag instead of tenant-scoped | Replace with tenant-scoped check |
| MEDIUM | Tests | Missing Vitest tests for section-18 (parallel_fan_out) and section-21 (error_handler/data_transform) saveBuilder validation | Create test files |
| LOW | `drizzle/schema.ts` | `nodeType varchar(30)` has no CHECK constraint — any string ≤30 chars stored | Add pgCheck or convert to pgEnum |
| LOW | `NodePropertyPanel.tsx` | Emoji/label map missing entries for skill_discovery, data_transform, error_handler | Add entries |

## Contract Compliance

### Node Type Integration
- [x] All 14 types in `AgencyNodeType` union — PASS
- [x] All 14 types in `BaseAgencyNode.tsx` switch — PASS
- [x] All 14 types in `NodePropertyPanel.tsx` forms — PASS
- [x] All 14 types in Python `match node_type:` — PASS
- [ ] All 14 types in DB CHECK constraint — FAIL (unconstrained varchar)

### Feature Flag Guards
- [ ] `agencyCustomTools` enforced — FAIL (never read)
- [ ] `agencyGuardrails` enforced — FAIL (never read)
- [ ] `agencyStreaming` enforced — FAIL (uses wrong global flag)
- [x] `agencyMcpBridge` enforced — PASS
- [ ] `agencyToolApi` enforced with tenant scope — PARTIAL (uses global flag)

### SSE Event Registry
- [x] All 12 event types registered — PASS
- [x] `error_handled` event present — PASS

### Database Schema
- [x] All node type configs documented — PASS
- [x] Sections 17-21 nodeConfig keys — PASS
