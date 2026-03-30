---
name: feature_052_agency_round2_audit
description: Round 2 deep security audit of agency tRPC/Express layer — agency.ts, agencyStream.ts, agencyToolsApi.ts, agencyStreamProxy.ts — 2026-03-23
type: project
---

# Feature 052 Agency Swarm — Round 2 Security Audit Findings

**Date:** 2026-03-23
**Report:** `specs/feature/052-agency-swarm-full-capability/implementation/code_review/deep-trpc-audit-r2.md`

## Critical/High Findings

### agencyStreamProxy.ts — Global feature flag (not tenant-scoped) + Missing agency ownership check
- `agencyStreamProxy.ts:67` uses `getFeatureFlag("AGENCY_SWARM_ENABLED")` (global) instead of `getTenantFeatureFlag(...)` (tenant-scoped). The newer `agencyStream.ts` already uses the tenant-scoped path.
- `agencyStreamProxy.ts` (`POST /api/v1/agency/stream`) does NOT verify that `agencyId` belongs to the user's tenant before forwarding to Python. Any authenticated user can run any agency by supplying its ID. `agencyStream.ts` added this DB check (lines 134–159); the proxy still lacks it.
- **Why:** Both routes are still registered in `index.ts` (lines 482, 491). The proxy is the legacy path; the newer Redis-backed stream added the check but the proxy was not updated.

### agencyStream.ts cancel route — runId ownership not verified
- `/api/agency/:agencyId/cancel` verifies agencyId belongs to tenant, but writes `agency:cancel:{runId}` to Redis using caller-supplied `runId` without verifying that the run belongs to the verified agencyId.
- **Fix:** Verify `runId` belongs to `agencyId` in DB before setting the Redis cancel key.

### agency.ts getById — SELECT before tenant check (TOCTOU pattern)
- `getById` fetches with `WHERE id = input.id` only, then checks `agency.tenantId !== tenantId` in JS. Defense-in-depth fix: add `AND tenantId = tenantId` to the SQL clause.

### agency.ts autoCreateStatus — taskId not bound to requesting user
- `autoCreateStatus` forwards any regex-valid taskId to Python using the caller's JWT. No server-side binding of `taskId → userId` exists. Any valid-JWT user can poll another user's task status (including the `previewJson` with full agency design).
- **Fix:** Store `agcreate:owner:{taskId} → userId` in Redis at `autoCreate` time. Verify on `autoCreateStatus`.

## Medium Findings

### routeResult — untyped envelope, no tenant check on agencyId
- `envelope: z.unknown()` with no size limit. `agencyId` is `.min(1).max(36)` but not UUID-enforced. No check that agencyId belongs to `ctx.tenantId` at the router layer.

### position.x / position.y accept NaN and Infinity
- Both `saveBuilder` and `create` use `z.number()` which passes IEEE 754 specials. Fix: `z.number().finite()`.
- Also present in `/api/internal/agency/create` body schema.

### toolIds has no max-length bound
- `toolIds: z.array(z.string().min(1).max(100)).optional()` in both `saveBuilder` and `create` lacks `.max(N)`. Fix: add `.max(50)`.

### nodeConfig / toolConfigs — unbounded free-form JSON, 3 node types unvalidated
- `aggregator`, `knowledge_base`, `human_approval` have **zero** superRefine rules. Entire nodeConfig stored as-is.
- No JSON size cap on nodeConfig or toolConfigs.

### instructions field — no HTML/XSS sanitisation
- `instructions: z.string().max(50000)` stored without HTML stripping. `sanitizeExamples` is called for examples but not instructions.

### agencyToolsApi.ts — `endpoint_url` vs `endpoint` key mismatch
- Tool config stored as `{ endpoint: ... }` (line 3331 agency.ts) but read as `config.endpoint_url` (line 142 agencyToolsApi.ts). The SSRF check is placed after the undefined guard and is thus unreachable if the key mismatch causes `endpointUrl` to be undefined.

### create procedure lacks superRefine parity with saveBuilder
- `create` has no agent-level `superRefine` block. Invalid nodeConfigs (e.g. `conditional_branch` with no `evaluationMode`) that `saveBuilder` rejects will be accepted by `create`.

## Confirmed Clean Areas
- `agencyStream.ts` stream route: agencyId verified against tenantId in SQL WHERE AND (lines 140–153).
- `agencyToolsApi.ts`: tenant-scoped WHERE with `isExposedAsApi = true AND isEnabled = true`. SSRF guard present (but see endpoint_url mismatch).
- `saveBuilder` tenant/ownership checks: functionally correct (JS-level check post-DB-fetch).
- Per-user concurrent stream limit: both stream handlers enforce MAX_STREAMS_PER_USER = 3.
- Internal `/api/internal/agency/create`: timing-safe token check + userId-to-tenant verification for internal auth path.
