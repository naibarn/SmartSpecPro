# tRPC Security Audit — Feature 058: Agency Creator Intelligence Upgrade

**Auditor:** CMD-6 tRPC Security Auditor
**Date:** 2026-03-24
**Branch:** `codex/feature-044-multimodal-chat-memory`
**Scope:** `apps/web/server/routers/agency.ts` (autoCreate, autoCreateStatus, autoCreateAnswer, saveAsTemplate, resolveModel) + `apps/web/server/_core/index.ts` (`/api/internal/agency/create`)

---

## Executive Summary

The five new/modified tRPC procedures and the internal Express endpoint are broadly well-structured. The most important functional security controls — tenant isolation on `saveAsTemplate`, rate limiting on `autoCreate`, and `change`-field stripping from suggestions — are correctly implemented. Two issues require attention before merge: a dead ownership check in `autoCreateStatus` that provides false assurance, and missing per-answer size constraints in `autoCreateAnswer`. Two lower-severity observations are also recorded.

---

## Findings

| ID  | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|-----|----------|-----------|--------------|-------------|-----------------|
| F01 | HIGH | `apps/web/server/routers/agency.ts:2916` | IDOR — ownership check is a dead no-op | `autoCreateStatus` checks `data._user_id !== ctx.user!.id` but `data` has already had all `_`-prefixed keys stripped by the Python API before the response reaches the tRPC layer (`agency_creator.py:108`: `{k: v for k, v in data.items() if not k.startswith("_")}`). `data._user_id` is therefore always `undefined`, so the condition `data._user_id !== undefined` is always `false`, and the ownership guard is never executed. The real enforcement happens at `get_status(task_id, user_id=current_user.id)` on the Python side (task.py:76-88), which returns `null` if user IDs don't match. The tRPC check creates a false sense of a defense-in-depth layer that does not actually exist. If the Python layer were ever changed to return status without the ownership check (e.g., a new unauthenticated cache path), the tRPC layer would provide no backstop. | Either: (a) remove the dead tRPC check and add a comment documenting that ownership enforcement is entirely delegated to the Python `get_status` call; or (b) if true defense-in-depth is desired, have the Python API return `_user_id` in a separate header (not the body) which the tRPC proxy can read and compare before forwarding `safeData`. Do not check `data._user_id` on the already-stripped object. |
| F02 | MEDIUM | `apps/web/server/routers/agency.ts:2983` | Missing input size limits on `answers` values | `autoCreateAnswer.input` validates `answers` as `z.record(z.string(), z.string())` with no bounds on key count, key length, or value length. A single call can submit hundreds of arbitrarily long answer strings (e.g., 100 keys × 10 MB each), which are serialised as JSON and forwarded verbatim to Python in the fetch body. The tRPC JSON body-size limit is the only backstop. | Add: `answers: z.record(z.string().max(100), z.string().max(5000)).refine(v => Object.keys(v).length <= 20, "Too many answers")`. This caps keys at 100 chars, values at 5 000 chars (generous for interview answers), and the record at 20 entries. |
| F03 | LOW | `apps/web/server/routers/agency.ts:2921-2938` | `change` field not explicitly stripped at tRPC boundary | The type-cast return at line 2922 (`return safeData as { ... }`) does not include `change` in the `suggestions` array shape, but TypeScript `as` casts are erased at runtime — `safeData` is forwarded as-is including any fields the Python response happens to include. The `change` field is stripped by the Python API layer (`agency_creator.py:114`), so the field does not currently reach the browser. However, there is no enforcement at the tRPC boundary: if the Python stripping is ever removed or bypassed, the raw `change` payload (which contains typed action instructions for agency mutation) would silently reach the client. | Apply an explicit allowlist projection before returning: `suggestions: (safeData.suggestions ?? []).map(({ category, title, description, impact, targetNodeId }) => ({ category, title, description, impact, targetNodeId }))`. This makes the tRPC layer independently safe regardless of what the Python API returns. |
| F04 | LOW | `apps/web/server/_core/index.ts:937-950` | Bearer-to-cookie conversion in internal endpoint fallback | The legacy fallback at lines 942-950 rewrites `req.headers.cookie` to `app_session_id=<token>` when a Bearer JWT is presented. This means that if `ENV.webGatewayToken` is unset (empty string), the `if (internalToken && ENV.webGatewayToken)` guard at line 922 is skipped entirely, and the endpoint is accessible to any user with a valid session JWT via the Bearer header. In that configuration the `/api/internal/agency/create` endpoint is functionally identical to a normal user-authenticated endpoint, with no indication in the code path that the caller is an ordinary user rather than a trusted internal service. The `__internalAuth: true` flag on the user object (line 931) — which gates the tenant-verification check at line 1018 — is only set on the internal-token path; the JWT fallback path never sets it, so the tenant-ownership check is skipped for external JWT callers. While the downstream Zod validation and DB write still enforce `tenantId` from `validatedBody.tenantId || tenantReq.tenant?.id || String(user.currentTenantId ?? "")`, an authenticated user can supply an arbitrary `tenantId` in the request body and it will be used verbatim if neither tenant middleware nor `currentTenantId` overrides it. | Ensure `ENV.webGatewayToken` is required in production. Alternatively, in the JWT fallback path, resolve `tenantId` exclusively from the authenticated session (ignore `validatedBody.tenantId` when `__internalAuth` is not set), so that external JWT callers cannot cross-tenant-create agencies via this endpoint. |

---

## Items Verified Clean

| Procedure | Check | Verdict |
|-----------|-------|---------|
| `autoCreate` | Rate limiting | PASS — `createRateLimitMiddleware({ namespace: "agency-create", limit: 5, windowMs: 60_000 })` applied at line 2854. |
| `autoCreate` | Input validation | PASS — `requirement` min/max, `specFileBase64` max 10 MB, `model` max 100, `skipInterview` boolean all validated. |
| `autoCreateStatus` | `taskId` format | PASS — `z.string().regex(/^agcreate-[a-f0-9]{12}$/)` enforced. |
| `autoCreateStatus` | `change` field reaching browser | PASS (at Python layer) — `agency_creator.py:114` strips `change` from every suggestion item before returning. |
| `autoCreateAnswer` | `taskId` format | PASS — same regex as `autoCreateStatus`. |
| `autoCreateAnswer` | Task ownership before accepting answers | PASS (at Python layer) — `get_status(body.task_id, user_id=current_user.id)` at `agency_creator.py:135` returns 404 if user IDs differ. |
| `autoCreateAnswer` | Rate limiting | NOTE — no explicit rate limit middleware. `autoCreate` is limited to 5/min; `autoCreateAnswer` has no limiter. This is lower-risk because the Python endpoint already validates task ownership and `awaiting_answers` state, limiting abuse surface. Not flagged as a finding at this time, but worth adding a limiter (e.g., 20/min) for consistency. |
| `saveAsTemplate` | Tenant isolation on agency SELECT | PASS — `and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId))` at line 4906. |
| `saveAsTemplate` | Ownership check | PASS — `agency.createdBy === userId || role === "admin" || role === "domain_admin"` at line 4916. |
| `saveAsTemplate` | Sensitive field leakage (mcpServers, encrypted tokens) | PASS — explicit allowlist projection at lines 4963-4972 prevents any spread of agent row fields. Comment at line 4959 documents the rationale. |
| `saveAsTemplate` | Rate limiting | NOTE — uses `protectedProcedure` directly without a rate limiter. `agencyTemplateProcedure` (line 219) exists with a 5/day limit but is not used here. Recommend switching the procedure to `agencyTemplateProcedure` to apply the existing daily cap. Not a blocking security issue but a gap in resource controls. |
| `resolveModel` | Input validation | PASS — all fields enumerated with `z.enum` / `z.boolean().optional()` / `z.number().int().min(0).max(2000000)`. |
| `resolveModel` | Information disclosure | PASS — returns only `modelId`, `modelName`, `provider`. No pricing or internal routing data exposed. |
| `/api/internal/agency/create` | Zod validation | PASS — `agencyCreateSchema` at line 956 with length limits on all string fields. |
| `/api/internal/agency/create` | Tenant-ownership verification (internal-token path) | PASS — DB lookup at lines 1020-1026 verifies the authenticated user's `currentTenantId` matches the requested `tenantId` before proceeding. |
| `/api/internal/agency/create` | Token comparison timing safety | PASS — `crypto.timingSafeEqual` used at line 926. Length pre-check is guarded by the timing-safe comparator. |
| `/api/internal/agency/create` | Error message leakage | PASS — catch block at line 1128 returns generic "Internal server error"; `err.message` is truncated to 200 chars for internal debug logging only. |

---

## Recommendations Summary

1. **F01 (HIGH):** Remove or correct the dead `data._user_id` ownership check in `autoCreateStatus`. Document clearly that ownership is enforced by the Python `get_status` call.
2. **F02 (MEDIUM):** Add explicit size constraints to the `answers` record in `autoCreateAnswer.input` before the next Python-side change could amplify the surface.
3. **F03 (LOW):** Add an explicit allowlist projection of suggestion fields in `autoCreateStatus` so the tRPC boundary is independently safe from future Python API changes.
4. **F04 (LOW):** Either require `webGatewayToken` in production config, or ignore caller-supplied `tenantId` in the JWT fallback path of `/api/internal/agency/create`.
5. **(Advisory):** Switch `saveAsTemplate` to use `agencyTemplateProcedure` (5/day cap already defined) and add a modest rate limiter to `autoCreateAnswer` (20/min) for resource consistency.
