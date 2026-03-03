# Code Review Interview: Section 10 — Embeddable Chat Widget

## Summary of Decisions

### AUTO-FIXES Applied

1. **RBAC enforced** — Changed all `protectedProcedure` to `domainAdminProcedure` in `server/routers/widget.ts`. Regular users can no longer access widget management endpoints.

2. **Token validation order fixed** — HMAC signature is now verified BEFORE expiry check in `validateInitToken()`. Prevents timing oracle attacks.

3. **Wildcard origin bypass fixed** — `isOriginAllowed()` now checks `normalizedOrigin.length > suffix.length` in addition to `endsWith()`. `evil-example.com` no longer matches `*.example.com`.

4. **WebSocket response routing implemented** — Added `widgetConnections: Map<string, WebSocket>` registry. WS connections are registered on auth and cleaned up on close. `channelGateway.processMessageServerSide()` is called directly (bypasses the `channel_connections` lookup which widget traffic doesn't use), and response is sent back through the registered WS.

5. **Lazy conversation creation** — First message creates a chat conversation via `createConversation()` with the system user as owner. Session stores `conversationId` for subsequent messages.

6. **Credit cap wired** — `checkVisitorCaps()` is now called in the WS message handler before routing to channelGateway.

7. **Credit cap GET-check-INCR pattern** — Fixed race condition: now does `GET` first, checks if adding would exceed cap, then `INCRBY`. TTL set only on first creation (`total === creditCost`).

8. **Origin check during WS upgrade** — `handleWidgetUpgrade` now rejects connections with no `Origin` header. Per-widget origin validation happens after token auth during the auth message phase.

9. **Edit form pre-populates** — `AdminWidgets.tsx` now maps widget row data to `WidgetFormData` and passes as `initialData` when editing.

10. **Theme applied from server** — `WidgetChat.tsx` now accepts theme via `auth_ok` WS message. All hardcoded colors replaced with `theme.primaryColor`, `theme.backgroundColor`, `theme.textColor`. Default theme object used as fallback.

11. **Static Redis import** — `getCacheClient` moved from dynamic import inside handler to static import at module top level in `widget.ts`.

12. **Widget audit event types added** — `widget_origin_rejected`, `widget_init_error`, `widget_ingest_error` added to `AuditEventType` union in `auditLogger.ts`.

### USER DECISIONS

**WS Response Routing**: User chose "Store WS by sessionId (Recommended)". Implemented as `Map<string, WebSocket>` with `widgetConnections` registry.

**Credit Cap Atomicity**: User chose "Fix with GETSET pattern". Implemented GET-check-INCR with TTL on first creation only.

### LET GO

- Login prevention uses inlined regex in `routers.ts` instead of importing `isWidgetSystemEmail` from widgetService (minor duplication, correct behavior)
- Embed test coverage gaps (resize test, autoInit test) — partial coverage acceptable for this phase
- DB migration in section-01 (already handled)
- vite.config.widget.ts single bundle config (low risk)

## Tests Updated

- `widgetService.test.ts`: Updated 3 cap enforcement tests to mock `redis.get` for the GET-check-INCR pattern
- `widget.test.ts`: Added `domainAdminProcedure` to trpc mock, added `redisClients` mock for static import

## Final Test Status: 37/37 passing
