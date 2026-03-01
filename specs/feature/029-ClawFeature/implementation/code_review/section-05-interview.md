# Code Review Interview: Section 05 — Channel Adapter Refactor (F01-A)

## Interview Summary

Two items were surfaced for user decision. All other findings were either auto-fixed or let go.

---

## Item 1: H3 — Queue rename without drain strategy

**Finding:** Queue renamed from `telegram-delivery` → `channel-delivery`. No drain script or dual-startup period. Jobs in the old queue at deploy time will be silently abandoned.

**Risk:** Low in practice — this is a development/staging environment. Any messages in-flight at deploy time that are in the old queue will not be delivered.

**User Decision:** "Accept the risk (dev only)"

**Action:** No drain script implemented. Deployment risk noted; a migration runbook can be created before production cutover.

---

## Item 2: M5 — Dual-write for new Telegram connections unimplemented

**Finding:** Plan section 5.5 requires enabling dual-write in `telegramLinkService.ts` so new connections created via `/start` deep link also appear in `channel_connections`. Zero changes to this file in the original diff.

**Risk:** New connections created post-migration won't be visible to the generic channel webhook router until a second migration is run.

**User Decision:** "Yes — fix it now"

**Action Applied:** Added dual-write in `telegramLinkService.ts` inside the transaction:

```typescript
// Dual-write: also register in channel_connections for generic channel routing
try {
  await tx.insert(channelConnections).values({
    id: connectionId,
    tenantId,
    userId: tokenRecord.userId,
    channelType: "telegram",
    externalUserId: telegramUserId,
    externalChatId: chatId,
    connectionConfig: { botId },
    status: "active",
    linkedAt: now,
    linkedBy: "deep_link",
  });
} catch {
  // Non-critical — channel_connections dual-write failure must not break the link flow
}
```

Also added `activeChannelId` sync when conversation binding is created:

```typescript
try {
  await tx
    .update(channelConnections)
    .set({ activeChannelId: channelId })
    .where(eq(channelConnections.id, connectionId));
} catch {
  // Non-critical
}
```

---

## Auto-fixes Applied (no user input required)

| Issue | Fix |
|-------|-----|
| H1: CSRF regex not anchored | Added `$` end anchor to prevent matching query-string paths |
| H2: resolveChannelConfig ignores tenantId | Added `eq(channelCredentials.tenantId, tenantId)` to WHERE clause |
| M1: Missing test for adapter-not-found | Added `processDeliveryJob (no adapter)` test case in `deliveryQueue.test.ts` |
| M2: Empty conversationId passes silently | Added early return in `channelWebhook.ts` when `activeChannelId` is null |
| M3: initialize()/shutdown() hooks never called | Wired adapter lifecycle in `_core/index.ts` startup and shutdown handlers |
| M4: Migration missing lastSeenAt/metadata | Added both columns to INSERT in migration script |
| L1: Dead try/catch in registry.register() | Removed dead try/catch around `Map.prototype.set()` |
| L2: ParsedInboundEvent missing comment | Added explanatory comment about why it's narrower than ChatIngressEvent |

## Let Go (acceptable / pre-existing)

- H3 queue drain: accepted as dev-only risk
- L3 double initializePendingApprovalAlertJob: pre-existing, not introduced by this section
- Issue #4 (no telegramConnections fallback in channelWebhook): intentional — legacy path continues
- Issue #9 (channelType cast): bounded at runtime by adapter registry lookup
- Issue #12 (vi.resetModules() fragility): tests pass; acceptable risk
