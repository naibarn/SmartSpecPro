# Code Review: Section 05 — Channel Adapter Refactor (F01-A)

## Overall Verdict
Conditional pass. Core adapter plumbing is correct and tests pass. Several correctness/security issues need fixing before merge.

## HIGH SEVERITY

### H1. CSRF regex not anchored (security)
`apps/web/server/_core/index.ts` — The new CSRF bypass regex `/^\\/webhooks\\/[a-z]+\\/[a-z0-9-]+/` has no end anchor (`$`). URLs like `/webhooks/telegram/conn-123?inject=path` still match. Fix: add `$` anchor.

### H2. `resolveChannelConfig` ignores tenantId for non-Telegram (security/correctness)
`apps/web/server/services/deliveryQueue.ts` — The `channelCredentials` query for non-Telegram channels filters only on `channelType + isActive`, NOT tenantId. In multi-tenant deployment, tenant A could deliver using tenant B's credentials. Must add `eq(channelCredentials.tenantId, tenantId)`.

### H3. Queue rename without drain strategy (deployment risk)
Queue renamed `telegram-delivery` → `channel-delivery`. No drain script or dual-startup period. Jobs in the old queue at deploy time will be silently abandoned.

## MEDIUM SEVERITY

### M1. Missing test: adapter-not-found throws UnrecoverableError
`deliveryQueue.test.ts` — Missing negative path test: when `adapterRegistry.get()` returns undefined, `processDeliveryJob` should throw `UnrecoverableError`.

### M2. Empty conversationId passes silently to gateway
`channelWebhook.ts` line ~125 — `connection.activeChannelId || ""` passes empty string `conversationId` to `channelGateway.ingest()` when unlinked. Should return early or log.

### M3. initialize()/shutdown() lifecycle hooks never called
`_core/index.ts` — Adapter `initialize()` and `shutdown()` hooks defined in the interface but never called at startup/shutdown. Will break stateful adapters in future sections.

### M4. Migration script missing lastSeenAt/metadata columns
`migrate-telegram-to-channel-connections.ts` — Plan's column mapping includes `lastSeenAt → last_seen_at` and `metadata → metadata`. Both are omitted from the INSERT.

### M5. Dual-write for new Telegram connections unimplemented
Plan section 5.5 requires enabling dual-write in `telegramCommands.ts` and connection-creation flows. Zero changes to those files in this diff. New connections post-migration won't be in `channel_connections`.

## LOW SEVERITY

### L1. Dead try/catch in registry.register()
`channelAdapters/registry.ts` — `Map.prototype.set()` never throws. The `channel_adapter_registration_failed` audit event can never fire. Was intended to wrap `adapter.initialize()`. Move initialize() call inside register() or remove the dead catch.

### L2. ParsedInboundEvent divergence lacks explanatory comment
`channelAdapters/types.ts` — Diverges from plan's `Omit<ChatIngressEvent, 'eventId' | 'idempotencyKey'>` intentionally (adapters don't know tenantId/userId). Needs inline comment explaining why.

### L3. Double initializePendingApprovalAlertJob in _core/index.ts
The diff shows two calls to `initializePendingApprovalAlertJob()`. Pre-existing issue; needs verification.

## ACCEPTABLE / LET GO

- Issue #4 (channelWebhook no telegramConnections fallback): Intentional — new route only serves migrated connections, legacy path continues via `telegramWebhook.ts`.
- Issue #9 (channelType cast unsound): Bounded at runtime by adapter registry lookup; acceptable.
- Issue #11 (agency endpoint in diff): Pre-existing code from section-04; not introduced by section-05.
- Issue #12 (vi.resetModules() fragility): Tests pass; acceptable risk for now.
