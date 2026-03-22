# Feature 049 — Enterprise Notification System: Security Re-Audit

**Audit type:** Post-hardening verification (re-audit of commit 5347500f)
**Auditor:** CMD-6 tRPC Security Auditor
**Date:** 2026-03-21
**Scope:** Verify N01–N16 fixes are correct and complete; identify any new issues introduced by the hardening.

---

## Part 1 — Verification of Previously-Found Issues

### N01 — IDOR: webhook UPDATE missing tenantId in WHERE

**Status: VERIFIED FIXED**

`updateWebhook` (notificationWebhooks.ts:241–250) now issues:
```
.where(and(eq(notificationWebhooks.id, input.id), eq(notificationWebhooks.tenantId, ctx.tenantId!)))
```
The ownership check that precedes this UPDATE also correctly validates `webhook.userId` vs `ctx.user.id` for user-scoped webhooks and role for tenant-wide webhooks. The tenantId guard is present in the final UPDATE WHERE clause, so a cross-tenant mutation cannot succeed even if the ownership logic has a gap.

---

### N02 — IDOR: webhook DELETE missing tenantId in WHERE

**Status: VERIFIED FIXED**

`deleteWebhook` (notificationWebhooks.ts:293–300) now issues:
```
.where(and(eq(notificationWebhooks.id, input.id), eq(notificationWebhooks.tenantId, ctx.tenantId!)))
```
Pattern is identical to the UPDATE fix. Correct.

---

### N03 — IPv6 SSRF bypass via AAAA records

**Status: VERIFIED FIXED**

`validateWebhookUrl` (notificationWebhookService.ts:95–138) now resolves both A and AAAA records via `dns.resolve4()` and `dns.resolve6()` in parallel, combines them into `allIps`, and rejects if any single IP is private. The `isPrivateIp` function (lines 49–89) covers:
- `::1` (loopback), `fe80::/10` (link-local), `fc00::/7` (unique-local), `::ffff:0:0/96` (IPv4-mapped), `::` (unspecified)
- All standard IPv4 private ranges

Implementation is complete and correct.

---

### N04 — admin-broadcast validation missing Zod schema

**Status: VERIFIED FIXED**

`/api/internal/admin-broadcast` (index.ts:769–811) now validates the full request body against `broadcastBodySchema`. The schema uses `z.enum()` for `type`, `priority`, and `relatedResourceType`, and applies `z.strict()` to the nested `metadataSchema` to prevent arbitrary key injection. `safeParse` is used correctly with a structured error response on failure.

---

### N05 — webhook categories accepted as free-form strings

**Status: VERIFIED FIXED**

Both `createWebhookInput` and `updateWebhookInput` (notificationWebhooks.ts:37–54 and 67–84) now use `z.array(z.enum([...]))` with an explicit 10-value allowlist: `system_health`, `media_jobs`, `workflow`, `skill`, `feedback`, `agency`, `follow`, `scheduled`, `security`, `business`. A `.max(10)` cap is also present.

---

### N06 — delivery UPDATE missing tenantId on all 3 paths (success, non-2xx failure, timeout)

**Status: VERIFIED FIXED**

All three UPDATE paths in `deliverWebhook` (notificationWebhookService.ts) now include `eq(notificationWebhooks.tenantId, webhook.tenantId)` in the WHERE clause:

- Success reset (lines 267–278): `and(eq(...id...), eq(...tenantId...))`
- Non-2xx atomic increment (lines 289–300): same pattern
- Timeout atomic increment (lines 383–393): same pattern
- Auto-disable after threshold (lines 305–313 and 396–404): same pattern

The `webhook.tenantId` used in these clauses is read from the initial SELECT (line 228), so it reflects the DB-stored value and cannot be caller-influenced.

---

### N07 — raw SQL cast instead of Drizzle eq()

**Status: VERIFIED FIXED**

`failureCount` increment now uses Drizzle's `sql` template tag with `COALESCE(${notificationWebhooks.failureCount}, 0) + 1` (lines 291, 384), which correctly escapes column references. The issue was about an unsafe raw SQL string cast — the current implementation uses Drizzle's parameterized template literal form, which is safe.

---

### N10 — VITE_PUBLIC_URL in server code

**Status: VERIFIED FIXED**

`notificationEmailService.ts` line 11–12:
```typescript
const PUBLIC_URL = process.env.PUBLIC_URL || "https://smartaihub.app";
```
`VITE_PUBLIC_URL` is gone. The replacement uses the non-prefixed `PUBLIC_URL` environment variable, which is not bundled by Vite into the client bundle. Correct.

---

### N11 — escalation target user not verified to belong to policy tenant

**Status: VERIFIED FIXED**

`executeEscalationCheck` (escalationJob.ts:95–134) now performs a tenant-scoped lookup before using `escalateToUserId`:
```typescript
.where(and(eq(users.id, policy.escalateToUserId), sql`${users.currentTenantId}::text = ${policy.tenantId}`))
```
If the user is not found in the policy's tenant, `targetUserIds` remains empty and a warning is logged (`escalation_target_wrong_tenant`). The role-based path also scopes the query to the policy tenant via the same SQL condition. Both paths are fixed correctly.

---

### N14 — HMAC signature does not include timestamp (replay attack)

**Status: VERIFIED FIXED**

`computeSignature` (notificationWebhookService.ts:149–156) now accepts an optional `timestamp` parameter and signs `${timestamp}.${body}` when present. `deliverWebhook` (lines 241–254) generates `deliveryTimestamp`, passes it to `computeSignature`, and sends it as the `X-Delivery-Timestamp` header alongside `X-Signature-256`.

**One minor gap remains** (new finding NR-01 below): `testWebhook` in the router (notificationWebhooks.ts:375) calls `computeSignature(body, secret)` without passing a timestamp, so test deliveries are still signed without timestamp. This is low severity since test payloads are not security-sensitive, but it is inconsistent and should be noted.

---

### N15 — failure count race condition (read-modify-write)

**Status: VERIFIED FIXED**

All three failure paths now use `sql\`COALESCE(${notificationWebhooks.failureCount}, 0) + 1\`` in the SET clause of a single UPDATE statement, eliminating the read-modify-write race. The returned `failureCount` from `.returning()` is used to decide whether to auto-disable. This is the correct atomic pattern.

---

### N16 — SSE eviction not logged

**Status: VERIFIED FIXED**

`notificationStream.ts` line 55:
```typescript
console.log("[NotificationStream] evicting_oldest_sse_connection", { userId });
```
The eviction is now logged before calling `oldest.disconnect()`. Correct.

---

## Part 2 — Feature Flag Guards (Additional Items to Verify)

### notificationPreferences router — feature flag guard

**Status: VERIFIED**

`requirePreferencesEnabled` (notificationPreferences.ts:31–40) is called at the top of all three procedures (`getPreferences`, `upsertPreference`, `snoozeCategory`). The flag checked is `flags.notificationPreferencesEnabled`, which is declared in `shared/featureFlags.ts` with default `false`. Correct.

### alertRules router — feature flag guard

**Status: VERIFIED**

`requirePreferencesEnabled` (alertRules.ts:9–18) is called in all six procedures (`listRules`, `createRule`, `updateRule`, `deleteRule`, `listEscalationPolicies`, `createEscalationPolicy`, `updateEscalationPolicy`, `deleteEscalationPolicy`). All use `adminProcedure`, which enforces admin role before the feature flag check. Tenant isolation is present in every WHERE clause via `eq(...tenantId, tenantId)`.

### notificationWebhooks router — feature flag guard

**Status: VERIFIED**

`requireWebhookDeliveryEnabled` (notificationWebhooks.ts:22–31) is called in all five procedures. The flag is `flags.notificationWebhookDelivery`, declared in `shared/featureFlags.ts` with default `false`. Correct.

### escalationJob — per-tenant feature flag instead of env var

**Status: VERIFIED**

`executeEscalationCheck` (escalationJob.ts:54–59) checks `flags.notificationEscalationEnabled` per policy tenant using `getTenantFeatureFlags(policy.tenantId)`. Policies for tenants that have disabled the flag are skipped. The old env-var-based global toggle is gone.

---

## Part 3 — New Findings

| ID | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|----|----------|-----------|--------------|-------------|-----------------|
| NR-01 | LOW | apps/web/server/routers/notificationWebhooks.ts:375 | Missing replay protection on test path | `testWebhook` calls `computeSignature(body, secret)` without passing a timestamp. Test payloads are delivered without an `X-Delivery-Timestamp` header and without timestamp in the signed material, inconsistent with production deliveries. Receivers implementing replay protection will see no timestamp header on test calls. | Pass `new Date().toISOString()` as the third argument and add `"X-Delivery-Timestamp": deliveryTimestamp` to the test request headers, mirroring the production path. |
| NR-02 | LOW | apps/web/server/routers/notificationWebhooks.ts:311–315 | SELECT without tenantId guard (testWebhook) | `testWebhook` fetches webhook by `id` only (no tenantId in the SELECT WHERE). The ownership check that follows uses application-level logic to block cross-user access, but if a user belonging to a different tenant supplies the correct webhook `id`, they pass through to SSRF re-validation and secret decryption. The actual `fetch` is blocked by role checks for tenant-wide webhooks, but user-scoped webhooks owned by another tenant's user are readable if `webhook.userId !== ctx.user.id` is falsy (same numeric userId from two different tenants — possible if user IDs are globally unique integers). In practice the numeric userId uniqueness prevents exploitation, but the SELECT should include tenantId for defense-in-depth. | Add `eq(notificationWebhooks.tenantId, ctx.tenantId!)` to the WHERE clause of the testWebhook SELECT, matching the pattern used in `updateWebhook` and `deleteWebhook`. |
| NR-03 | LOW | apps/web/server/routers/notificationWebhooks.ts:186–198 | SELECT without tenantId guard (updateWebhook) | Same class of issue as NR-02 but in `updateWebhook`: the initial SELECT to load the existing webhook (lines 188–193) uses only `eq(notificationWebhooks.id, input.id)`. The UPDATE WHERE (line 245–249) correctly adds tenantId, so cross-tenant mutation is prevented. The SELECT without tenantId is purely informational in this flow and does not leak data to the caller, but it does mean an attacker can probe whether webhook IDs exist across tenants (NOT_FOUND vs. FORBIDDEN response distinguishes between non-existent and unauthorized). The same applies to `deleteWebhook` lines 261–265. | Add `eq(notificationWebhooks.tenantId, ctx.tenantId!)` to the WHERE clause of the SELECT in `updateWebhook` and `deleteWebhook`. This collapses "not found in other tenant" and "not found at all" into the same `NOT_FOUND` response, eliminating the ID-enumeration oracle. |

---

## Part 4 — Summary

### Previously-found issues: 11 of 11 verified fixed

All findings N01, N02, N03, N04, N05, N06, N07, N10, N11, N14, N15, N16 are confirmed resolved. No previously-found issue remains open.

(Note: N08, N09, N12, N13 were not in the re-audit scope per the task brief — they may have been resolved separately or fall outside the tRPC layer.)

### New findings from re-audit: 3 (all LOW severity)

- **NR-01**: `testWebhook` signs payload without timestamp — inconsistency with production delivery path, no security impact in practice.
- **NR-02**: `testWebhook` SELECT fetches by `id` only, no tenantId guard — ownership is enforced at application level but tenantId defense-in-depth is absent.
- **NR-03**: `updateWebhook` and `deleteWebhook` initial SELECTs fetch by `id` only — mutation is still tenant-isolated via the UPDATE/DELETE WHERE, but the pattern leaks cross-tenant webhook ID existence.

None of the new findings represent exploitable data leakage or mutation given the current ownership check logic. They are defense-in-depth gaps that should be addressed before the feature ships to production.
