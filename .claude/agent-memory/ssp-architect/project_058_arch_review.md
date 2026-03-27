---
name: F058 Meta Channels Architecture Review
description: Structural gaps, scalability concerns, and missing components identified in the Feature 058 Meta Channels plan
type: project
---

Architecture review conducted 2026-03-23. Full findings in the chat output of that session.

**Why:** Pre-build review to prevent structural rework after implementation starts.

**Top criticals (must fix before build):**
- C-01: `internal_embeddings.py` has NO batch endpoint — section-13 calls a non-existent `/api/internal/embeddings/batch`. Must create the batch endpoint or rewrite archival to call single-text endpoint in a loop.
- C-02: Real-time trigger pub/sub subscriber has no specified host — the workflow LangGraph runtime is Celery-bound; an asyncio background subscriber cannot run inside a Celery worker. Architecture gap in trigger wiring.
- C-03: `socialHumanApprovals` bypasses the existing `ApprovalExecutor` (which uses LangGraph `interrupt()` + `approval_requests` DB table). Two separate approval systems will be out of sync.
- C-04: `unreadCount` column is a denormalized integer with atomic increment but no decrement/reset path specified. On bulk-mark-as-read there is no plan to zero out the counter safely.
- C-05: Dedup key `social:dedup:meta:{deliveryId}` is synthesized from `entry.id + messaging[].timestamp` — not globally unique under Meta's batched delivery model. Multi-entry payloads can collide.

**How to apply:** Block implementation on C-01 and C-02 — they affect every downstream section. C-03 to C-05 are resolvable at section level but must be tracked.
