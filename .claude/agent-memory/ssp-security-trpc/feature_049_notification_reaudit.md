---
name: Feature 049 Notification System Re-Audit
description: Post-hardening verification audit of Enterprise Notification System (commit 5347500f) — all 11 prior findings fixed, 3 new LOW findings
type: project
---

All 11 previously-found issues (N01–N16 subset) verified fixed in commit 5347500f.

**Why:** Re-audit dispatched by orchestra after security hardening pass to confirm fixes before merge.

**How to apply:** If Feature 049 notification code is revisited, start from the 3 open LOW findings below rather than re-checking closed items.

### Confirmed Fixed (2026-03-21)
- N01/N02: IDOR webhook UPDATE/DELETE — tenantId now in WHERE on both
- N03: IPv6 SSRF — dns.resolve6() added, isPrivateIp covers all IPv6 private ranges
- N04: admin-broadcast — full Zod broadcastBodySchema with .strict() metadata
- N05: webhook categories — z.enum() allowlist on both create and update inputs
- N06: delivery UPDATE tenantId — all 3 paths (success, non-2xx, timeout) now have tenantId
- N07: raw SQL cast — replaced with Drizzle sql template COALESCE increment
- N10: VITE_PUBLIC_URL — removed; uses process.env.PUBLIC_URL with hardcoded fallback
- N11: escalation target — verified tenant membership before use; logs warning on mismatch
- N14: HMAC replay — computeSignature now accepts timestamp; deliverWebhook passes X-Delivery-Timestamp
- N15: failure count race — atomic SQL increment in single UPDATE; no read-modify-write
- N16: SSE eviction — eviction now logged before disconnect

### New Findings (all LOW — defense-in-depth gaps, not exploitable)
- NR-01: testWebhook calls computeSignature without timestamp → no X-Delivery-Timestamp header on test payloads (notificationWebhooks.ts:375)
- NR-02: testWebhook SELECT uses id only, no tenantId guard — ownership enforced at app layer but SELECT leaks cross-tenant webhook existence (notificationWebhooks.ts:311–315)
- NR-03: updateWebhook and deleteWebhook initial SELECTs also use id only — mutation is tenant-isolated at UPDATE/DELETE level, but SELECT creates an ID-enumeration oracle (notificationWebhooks.ts:188–193, 261–265)

Report: specs/feature/049-enterprise-notification-system/implementation/code_review/security-reaudit.md
