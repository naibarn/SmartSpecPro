---
name: Feature 058 Agency Creator Intelligence Upgrade — tRPC audit
description: Security audit of autoCreate, autoCreateStatus, autoCreateAnswer, saveAsTemplate, resolveModel, /api/internal/agency/create — 2026-03-24
type: project
---

Feature 058 tRPC audit completed 2026-03-24. Report at: specs/feature/058-agency-creator-intelligence-upgrade/implementation/code_review/security-audit-trpc.md

## Key findings

### F01 (HIGH) — Dead ownership check in autoCreateStatus
- `agency.ts:2916`: checks `data._user_id !== ctx.user!.id` but `data` is already stripped of all `_`-prefixed keys by the Python API (`agency_creator.py:108`). `data._user_id` is always `undefined`; the guard never fires.
- The real ownership enforcement is at `get_status(task_id, user_id=current_user.id)` on the Python side (`agency_creator_task.py:76-88`), which correctly returns `null` if user IDs differ.
- **Fix:** Remove the dead tRPC check and document that enforcement is delegated to Python, OR implement true defense-in-depth via a separate channel.

### F02 (MEDIUM) — Missing size limits on `answers` in autoCreateAnswer
- `agency.ts:2983`: `answers: z.record(z.string(), z.string())` has no key count, key length, or value length constraints.
- **Fix:** `z.record(z.string().max(100), z.string().max(5000)).refine(v => Object.keys(v).length <= 20, "Too many answers")`

### F03 (LOW) — No tRPC-layer allowlist projection of suggestion fields
- `agency.ts:2921`: `safeData` forwarded via `as` cast with no runtime projection. `change` field is stripped at Python layer, but tRPC provides no independent backstop.
- **Fix:** Explicit destructuring of suggestion fields before return.

### F04 (LOW) — Internal endpoint tenant enforcement gap on JWT fallback path
- `index.ts:937-950`: If `ENV.webGatewayToken` is empty, the endpoint falls back to JWT auth; the `__internalAuth` flag is not set; the tenant-ownership DB check (line 1018) is skipped; `validatedBody.tenantId` from the request body is used verbatim.
- **Fix:** Require webGatewayToken in production, or ignore caller-supplied tenantId for non-internal-auth callers.

## Items confirmed clean
- `autoCreate` rate limiting: 5/min via createRateLimitMiddleware — PASS
- `saveAsTemplate` tenant isolation + ownership check — PASS
- `saveAsTemplate` sensitive field (mcpServers, encrypted tokens) exclusion via explicit allowlist projection — PASS
- `change` field stripped from suggestions at Python layer (agency_creator.py:114) — PASS (but not enforced at tRPC layer — see F03)
- `/api/internal/agency/create` Zod validation, timing-safe token compare, error message sanitisation — PASS

## Advisory notes
- `saveAsTemplate` uses plain `protectedProcedure` instead of `agencyTemplateProcedure` (5/day cap at line 219) — resource-control gap, not a blocking security issue
- `autoCreateAnswer` has no rate limiter — lower risk because Python validates state and ownership, but inconsistent with other mutations
