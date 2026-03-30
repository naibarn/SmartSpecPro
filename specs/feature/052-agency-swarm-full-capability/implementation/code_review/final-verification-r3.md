# Final Verification — Round 3
**Date:** 2026-03-23
**Auditor:** CMD-6 (SSP Security Agent)
**Scope:** 8 targeted checks across agency stack

---

## Audit Methodology

Each file was read directly. Grep was used for pattern-level checks. All 8 check categories below are addressed in order.

---

## Check 1 — `dangerouslySetInnerHTML` without DOMPurify

**File:** `apps/web/client/src/components/agency/preview/TextContentPreviewContent.tsx:95`

**Finding: CLEAN (with annotation)**

The single `dangerouslySetInnerHTML` instance at line 95 renders `renderedHtml`, which is produced by one of two paths:

- `format === "html"` → `DOMPurify.sanitize(...)` with explicit `ALLOWED_TAGS`, `ALLOWED_ATTR`, and `ALLOWED_URI_REGEXP`. **Safe.**
- `format === "markdown"` → `renderMarkdown(text)`, a custom renderer that HTML-escapes the raw input (`&`, `<`, `>`) on lines 18–21 before applying regex transformations. All capture groups (`$1`, `$2`) in subsequent replacements operate on already-escaped content. The link handler (lines 38–46) allows only `https?://`, `mailto:`, and `#` prefixes; all other hrefs are stripped to plain text. **Safe, but narrower than DOMPurify.**

**Note for future maintainers:** The markdown path is not protected by DOMPurify. If the `renderMarkdown` function is extended by a contributor who adds a new regex pattern, the guarantee depends on that contributor remembering to HTML-escape captures. Consider running `DOMPurify.sanitize()` as a final pass on the markdown output as defense-in-depth. This is not a current vulnerability — it is a fragility risk.

**Status: No fix required now.**

---

## Check 2 — `getFeatureFlag("AGENCY_...")` global vs tenant-scoped

**Files checked:** `agencyStream.ts`, `agencyStreamProxy.ts`, `agencyToolsApi.ts`, `agency.ts`

**Finding: CLEAN**

All `getFeatureFlag("AGENCY_...")` calls in the Express route layer use infrastructure-level flags that apply globally: `AGENCY_STREAMING_ENABLED`, `AGENCY_SWARM_ENABLED`, `AGENCY_TOOL_API_ENABLED`. These are intentionally global (they gate whether a feature is deployed at all, not per-tenant behavior).

Tenant-behavioral flags correctly use `getTenantFeatureFlag(...)` (e.g., `agencyMcpBridge` at agency.ts line ~4032, `assertAgencyEnabled` which checks the tenant-scoped `AGENCY_SWARM_ENABLED` flag). The separation is intentional and correct.

**Status: No finding.**

---

## Check 3 — Raw SQL with f-string / string interpolation in Python agency files

**Files checked:** All `python-backend/app/services/agency_*.py`, `python-backend/app/tasks/agency_creator_task.py`

**Finding: CLEAN**

No f-string or `%-style` string interpolation was found constructing SQL queries in any agency Python file. SQLAlchemy `text()` is used where raw SQL is needed, and httpx calls use structured `json=` parameters, not string-interpolated query bodies.

**Status: No finding.**

---

## Check 4 — `.select()` returning encrypted columns to clients

**Finding: CLEAN**

Checked all column-projecting queries in `agency.ts`:

- `listTools` (line ~3344): Explicitly projects safe columns only; `headersEncrypted` is replaced with `hasHeaders: sql... IS NOT NULL`. Correct.
- `getTool` / `createTool` / `updateTool` (lines ~3229, ~3281): Both return `{ ...tool, headersEncrypted: undefined, hasHeaders: ... }`. Encrypted column is stripped. Correct.
- `testCustomTool` (line ~3382): Calls `db.select()` (wildcard) internally but only returns `{ status, durationMs, response }` — the full tool row is not forwarded to the client.
- `mcpServerTokensEncrypted` (line 4011): Stored in `agencyAgents` via `saveMcpServers`. The `getById` procedure was confirmed fixed (R3 confirmed) to strip MCP tokens. No query in the audit returns `mcpServerTokensEncrypted` to the client.

**Status: No finding.**

---

## Check 5 — tRPC procedures in `agency.ts` not using `protectedProcedure`

**Finding: TWO `publicProcedure` INSTANCES — INTENTIONAL, VERIFIED SAFE**

```
agency.ts:2720  listMarketplace:        publicProcedure
agency.ts:2769  getMarketplaceAgency:   publicProcedure
```

Both procedures are intentionally public — they expose published, visibility=`"public"` agencies for unauthenticated marketplace browsing. Both queries have explicit WHERE guards:

```typescript
eq(agencies.isPublished, true),
eq(agencies.visibility, "public"),
eq(agencies.status, "published"),
```

`getMarketplaceAgency` returns only: `id`, `name`, `description`, `previewSvg`, `creatorFeeCredits`, `ownerName`, `createdAt`, and agent name/nodeType/isEntryPoint. No instructions, system prompts, tools, or tenant-private data are exposed. `previewSvg` has a `<script` tag filter at lines 2800–2803. The SVG is rendered as a data-URL `<img>` on the frontend (not `dangerouslySetInnerHTML`), which prevents SVG script execution.

**Status: No finding — by design.**

---

## Check 6 — Express routes in agency files without authentication

### NEW FINDING — MEDIUM SEVERITY

**File:** `apps/web/server/routes/agencyStream.ts`
**Route:** `POST /api/agency/:agencyId/cancel` (lines 294–333)
**Severity:** MEDIUM

**Description:**

The cancel route authenticates the caller (line 304) and validates the `agencyId` format (line 309), but it does **not verify that the `agencyId` or `runId` belongs to the authenticated user's tenant.** Any authenticated user who knows (or guesses) a `runId` can set `agency:cancel:<runId>` in Redis, which causes the Python orchestrator (`agency_event_emitter.py:100`) to terminate an arbitrary run:

```typescript
// agencyStream.ts line 325 — no ownership check before writing
await redis.set(`agency:cancel:${runId}`, mode, "EX", 300);
```

The stream route (lines 126–151) correctly verifies agency ownership via a `WHERE agencies.id = agencyId AND agencies.tenantId = tenantId` query before subscribing. The cancel route lacks an equivalent check.

**Risk:** An authenticated user on a different tenant can cancel another tenant's active agency run if they learn the `runId`. `runId` values are UUIDs, but they are transmitted over SSE and may appear in logs, audit records, or error messages visible to the owning user.

**Remediation:** Add a tenant ownership verification block between steps 3 and 4 of the cancel route, identical to the check already present in the stream route:

```typescript
// After agencyId format validation, before Redis write:
const tenantReq = req as TenantRequest;
const tenantId = resolveTenantIdVarchar(
  tenantReq.tenant?.id ?? null,
  user.currentTenantId,
);
if (!tenantId) {
  return res.status(403).json({ error: "Tenant context required" });
}
const { getDb } = await import("../db");
const { agencies } = await import("../../drizzle/schema");
const { eq, and } = await import("drizzle-orm");
const db = await getDb();
if (db) {
  const [agency] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, tenantId)))
    .limit(1);
  if (!agency) {
    return res.status(404).json({ error: "Agency not found" });
  }
}
```

**Status: OPEN — fix required.**

---

## Check 7 — Python files calling external URLs without SSRF validation

**Files checked:** `agency_tools.py`, `agency_creator_task.py`

**Finding: CLEAN**

`agency_tools.py`: All three httpx call sites (`_execute_custom_tool` line 241, `_execute_http` line 422, `_execute_sandbox` line 451) are preceded by `_validate_tool_url(...)` calls that check against `_BLOCKED_HOSTS` and `_BLOCKED_NETWORKS`. The validation uses `ipaddress.ip_network` for proper CIDR matching.

`agency_creator_task.py`:
- `_implement_agency` (line 909): Calls `http://127.0.0.1:3000` (the Node.js internal service). This is an internal service-to-service call using `X-Internal-Token`, not a user-supplied URL. No SSRF risk.
- `_fetch_available_skills` (line 450): Calls `http://localhost:3000` via `INTERNAL_API_BASE` env var default. Same pattern — internal loopback to Node.js, protected by `X-Internal-Token`. No user-controlled URL component. No SSRF risk.

**Status: No finding.**

---

## Check 8 — User input rendered as innerHTML on the frontend

**Finding: CLEAN**

Systematic search for `dangerouslySetInnerHTML` and `.innerHTML` across all agency components produced a single result (TextContentPreviewContent.tsx, covered in Check 1). All other user-input display — agent names, descriptions, instructions, tool names — is rendered as React text nodes (JSX expression interpolation), which React automatically escapes.

**Status: No finding.**

---

## Risk Register

| ID | File | Line | Severity | Category | Description | Status |
|----|------|------|----------|----------|-------------|--------|
| R3-01 | `apps/web/server/routes/agencyStream.ts` | 294–333 | MEDIUM | Auth/IDOR | Cancel route lacks agency ownership check — any authenticated user can cancel any run by runId | **OPEN** |
| R3-NOTE | `apps/web/client/src/components/agency/preview/TextContentPreviewContent.tsx` | 17–56 | LOW (fragility) | XSS risk surface | Markdown renderer does not run DOMPurify as final pass; safe today but fragile to future changes | Accepted / monitor |

---

## Summary

**1 new finding** requiring a code fix:

- **R3-01 (MEDIUM):** The `/api/agency/:agencyId/cancel` Express route in `agencyStream.ts` authenticates the caller but does not verify that `agencyId` belongs to the caller's tenant. A cross-tenant authenticated user who knows a `runId` can terminate another tenant's agency run. Fix: add the same `agencies WHERE id = agencyId AND tenantId = tenantId` ownership check that already exists in the stream route.

All other checks across the 8 categories are clean.
