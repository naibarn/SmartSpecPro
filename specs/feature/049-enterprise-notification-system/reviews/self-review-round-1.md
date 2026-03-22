# Self-Review Round 1 — Adversarial Review

## Findings

### Finding 1: Dedup race condition with dismiss (LOW)
The unique partial index `WHERE isDismissed = false` means a concurrent dismiss + new notification could create an extra notification. This is benign (user gets one extra notification after dismissing a group) and acceptable. No fix needed — documented as known behavior.

### Finding 2: Escalation job query performance (OK)
Escalation job queries match the existing index `(userId, isRead, priority)` on userNotifications. No performance concern at medium scale.

### Finding 3: Unified query performance (OK)
Plan specifies `idx_orch_notif_user_created` index. Verified sufficient.

### Finding 4: Email digest last-sent tracking [FIXED]
Plan was ambiguous about storage. Fixed: use Redis key `notification:digest:last:{userId}` with 7-day TTL.

### Finding 5: Preferences cache invalidation [FIXED]
Plan specified cache but not invalidation. Fixed: `upsertPreference` mutation invalidates Redis cache immediately after DB write.

## Changes Made
- Clarified digest last-sent tracking to use Redis with specific key pattern
- Added cache invalidation requirement for preference updates
- Previously in Round 1: added Python groupKey update, digest storage fields, BullMQ registration pattern, webhook data flow, DNS rebind protection

## Verdict
Plan is solid. 5 findings, 4 auto-fixed, 1 documented as acceptable. No remaining issues.
