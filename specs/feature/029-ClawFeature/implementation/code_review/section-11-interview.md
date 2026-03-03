# Code Review Interview: Section 11 — Inbound Webhook & Event Triggers

## User Decisions

**H1 — Timing oracle in verifyTokenAuth**
Decision: Reject if lengths differ, then compare equal-length buffers with timingSafeEqual.
Action: AUTO-FIX — decrypt stored secret, reject if `providedToken.length !== decryptedSecret.length`, then compare with timingSafeEqual.

**H6 — No credit deduction**
Decision: Keep hasEnoughCredits() check, add a TODO deductCredits call stub.
Action: AUTO-FIX — add a comment + TODO placeholder for deductCredits after the check; log creditCost=0 for now.

## Auto-Fixes Applied

**H2** — Added explicit byte-length check after hex decode in verifyHmacAuth (belt-and-suspenders).

**H3** — For token-auth requests, dedup key now uses only server-synthesized timestamp (ignores caller-supplied X-Webhook-Timestamp).

**H4** — totalTriggers increment uses SQL `totalTriggers + 1` instead of in-memory read-modify-write.

**H5** — Fixed wrong auditLogger eventType: now uses `webhook_dispatch_stub` instead of `webhook_ingest_error`.

**H7** — Removed dead `req.path.startsWith('/webhooks/trigger/')` CSRF bypass; kept only `req.originalUrl` check.

**M2** — Added userId check in requireTriggerOwnership: regular users can only manage their own triggers.

**M3** — Added feature flag guard on WebhookTriggers.tsx frontend page (shows placeholder if flag disabled).

**M4** — Fixed rate limit race: `expire` is now set unconditionally in a Redis pipeline (INCR + EXPIRE together).

**M6** — `list` procedure now explicitly excludes `authSecretEncrypted` from the SELECT.

**M7** — `stripSecrets` is now recursive: traverses nested objects and arrays.

**L1** — Replaced `window.confirm()` with Radix `AlertDialog` for delete confirmation.

**L2** — New secret displayed in a modal dialog with a copyable input field instead of a toast.

## Let Go

- M1: Soft-delete by plan design (acceptable for now, logs retained for audit)
- M5: testTrigger procedure deferred to future section
- L3: authType locked at create-time — undocumented but acceptable limitation
- L4: testTrigger test skeleton — deferred with M5
- L5: validateTemplate surface broader than substituteTemplateObject — safe as-is
- L6: monthlyTriggerBudget enforcement deferred to future section
