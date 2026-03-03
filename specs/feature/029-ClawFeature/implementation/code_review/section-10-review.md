# Code Review: Section 10 — Embeddable Chat Widget

## Critical (HIGH) Issues

1. **RBAC Not Enforced** — All tRPC procedures use `protectedProcedure` instead of `domainAdminProcedure`. Regular users can create/delete widgets.

2. **Credit Cap Dead Code** — `checkVisitorCaps()` in widgetService is implemented and tested but never called in the WebSocket handler. Per-visitor credit limits have no runtime effect.

3. **Race Condition in checkVisitorCaps** — INCRBY happens before cap check. Concurrent requests can exceed caps. Also, `EXPIRE` resets TTL on every call instead of only on first creation.

4. **Wildcard Origin Bypass** — `endsWith('.example.com')` matches `evil-example.com`. Needs full segment anchor.

5. **Token Expiry Before HMAC** — Timing oracle: attacker can distinguish expired-valid from tampered payloads. Should validate HMAC first, then expiry.

6. **WebSocket Never Returns AI Response** — `channelGateway.ingest()` response is discarded. Chat is one-way; users send messages but receive no replies. Functional crash.

7. **Origin Not Checked During WebSocket Upgrade** — `handleWidgetUpgrade` doesn't inspect `req.headers.origin`. Only the HTTP init endpoint checks origins.

## Medium Issues

8. **TOCTOU on System User Creation** — SELECT then INSERT without conflict handling. Concurrent first-connections cause race.

9. **Edit Form Doesn't Pre-populate** — `editWidgetId` set but `initialData` not passed to `WidgetFormDialog`. Editors always get default values.

10. **Hardcoded Theme in WidgetChat** — Colors hardcoded (`#6366f1`, `#ffffff`). Server theme config ignored.

11. **Lazy Redis Import in getUsageStats** — Dynamic import inside handler instead of static import at top.

## Low / Let Go

- Login prevention uses inlined regex instead of `isWidgetSystemEmail` export (minor duplication, functionally correct)
- DB migration (handled in section-01)
- Embed test coverage gaps (partial coverage acceptable)
- vite.config.widget.ts embed/React bundling (low risk for now)
