# Code Review: Section 11 — Inbound Webhook & Event Triggers

## HIGH Severity

**H1 — Timing oracle in verifyTokenAuth**
The padding approach for `timingSafeEqual` is semantically broken. When `providedToken` is shorter than `storedSecret`, `bPadded` is zero-padded and compared against the real secret bytes — leaking secret length implicitly. The correct fix is to reject on length mismatch first (after decryption), then compare equal-length buffers, or use HMAC-based constant-time comparison.
File: `webhookTriggerService.ts`

**H2 — HMAC hex buffer edge case (low actual impact)**
`Buffer.from(signature, 'hex')` silently truncates invalid hex characters. Length guard at the string level (`signature.length === expectedSig.length`) saves it, but the code is fragile. The string-length guard compares 64-char hex strings correctly (both sides decoded to 32 bytes). Low actual impact but confusing.
File: `webhookTriggerService.ts`

**H3 — Dedup uses caller-supplied `X-Webhook-Timestamp` for token-auth requests**
Token auth does not validate `X-Webhook-Timestamp`, so a malicious caller can supply any value to craft dedup keys — either forcing dedup (DoS via reused timestamp+hash) or bypassing dedup by varying the timestamp. For token auth, the dedup key should use only a server-synthesized timestamp.
File: `webhookTrigger.ts` (lines ~156-160)

**H4 — Non-atomic `totalTriggers` read-modify-write**
The async dispatch block reads `trigger.totalTriggers` from the in-memory object (fetched at step 1) and writes `count + 1`. Under concurrent load both simultaneous requests write `count + 1`, losing increments. Fix: use SQL `SET totalTriggers = totalTriggers + 1`.
File: `webhookTrigger.ts` (lines ~244-251)

**H5 — Dispatch is a stub using wrong eventType; credits charged for undelivered value**
The actual dispatch (chat/agency/workflow) is deferred to section 12+. The `success` log is written and credits consumed but no message is delivered. `auditLogger.log` uses `eventType: 'webhook_ingest_error'` for a successful dispatch — wrong event type that corrupts audit analysis.
File: `webhookTrigger.ts` (lines ~222-231)

**H6 — No credit deduction occurs after credit check**
`hasEnoughCredits()` gates the request but there is no matching `deductCredits()` call anywhere. Credits are checked but never spent, allowing unlimited free invocations.
File: `webhookTrigger.ts`

**H7 — CSRF bypass `req.path` dead code**
The bypass at `req.path.startsWith('/webhooks/trigger/')` is missing the `/api` prefix; app-level middleware sees the full path including `/api`. Only `req.originalUrl.startsWith('/api/webhooks/trigger/')` matches. The `req.path` line is dead code.
File: `_core/index.ts`

## MEDIUM Severity

**M1 — Soft-delete leaves orphan logs (by design?)**
`delete` sets `is_active = false`. The plan mentioned FK cascade-delete on a hard delete. Soft delete leaves logs forever.

**M2 — Any user in same tenant can manage another user's triggers**
`requireTriggerOwnership` checks `tenantId` but not `userId`. A regular user can update/delete/regenerate secrets of other tenant members' triggers. Fix: add `userId` check unless caller is `domain_admin`.

**M3 — No feature flag guard on the frontend page**
Menu entry uses `requiresFeature: 'webhookTriggers'` but navigating to `/webhook-triggers` directly bypasses it. Page should show a placeholder if the flag is disabled.

**M4 — Rate limit race condition under concurrent load**
`INCR` followed by conditional `EXPIRE` (only when count===1) is a known Redis race: two concurrent first-requests both increment to 1 or 2, neither sets TTL. Rate limit keys live forever, disabling all future requests for that trigger.
File: `webhookTriggerService.ts`

**M5 — `testTrigger` procedure absent**
The plan requires a `testTrigger` mutation. Not implemented; the test describe block is an empty stub.

**M6 — `list` procedure returns `authSecretEncrypted` field**
`db.select().from(webhookTriggers)` returns all columns including the encrypted secret. `getById` correctly strips it; `list` does not.

**M7 — `stripSecrets` is shallow**
Only checks top-level keys. Nested values like `{ auth: { token: 'sk-abc' } }` are not redacted.

## LOW Severity

**L1** — `window.confirm()` used for delete; should use Radix `AlertDialog`.
**L2** — New secret shown in toast (not copyable); should use a modal with copy button.
**L3** — `authType` locked at create-time, cannot change on edit. Undocumented limitation.
**L4** — `testTrigger` test block is an empty stub (related to M5).
**L5** — `validateTemplate` runs on full JSON string, `substituteTemplateObject` only substitutes values. Inconsistent but safe.
**L6** — `monthlyTriggerBudget` stored but never enforced in route handler.
