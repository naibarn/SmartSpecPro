# Spec 209 runtime gap matrix

This matrix maps the seven reported runtime gaps plus the critical editor
interaction gap to the additive implementation sections, dependencies and proof
required before the feature can be called complete. The supplied Spec 209
mockups remain the visual source of truth.

| Current gap | Target behavior | Primary sections | Must be proven |
|---|---|---|---|
| Library/Marketplace is partial | Exact immutable version detail, dependency/readiness, entitlement, pricing disclosure, run history and safe preflight | 01 → 02 → 03 → 07 | Published-only and tenant-safe reads; blocked states explain why; card cannot bypass server checks |
| Real Workflow run is unavailable | Exact run intent compiles to an approved plan and canonical Feature 195 Job/run projection | 01 → 03 | Valid run creates one authoritative Job reference; invalid/unready input creates no Job |
| Marketplace Run is unavailable | Marketplace invoke rechecks version, access, dependency, policy and Spec 207 economics before admission | 02 → 03 → 08 | Same invoke is idempotent; entitlement/budget denial leaves no execution or orphan reservation |
| Partial/run-from/run-until are unavailable | Full, run-until, run-from, node and subflow modes use immutable version/input-bound checkpoints | 03 → 04 → 05 | Checkpoint mismatch/stale/cross-tenant cases fail closed; valid upstream work is reused by default |
| Approval/retry/cancel/resume are unavailable | Durable, actor-scoped, revision/fenced controls over canonical Job lifecycle | 03 → 04 → 05 → 07 | Refresh/reconnect preserves state; retry preserves attempts; cancel unknown finality is pending, not success |
| Output/artifact/preview are unavailable | Version-bound output schema and manifest backed by authorized artifact publication/preview | 03 → 05 → 06 → 07 | Pending/partial/ready/expired/failed/reconciliation states are distinct; raw provider URLs never reach UI |
| Trace/logs/events are incomplete | Ordered, idempotent, redacted workflow projections over canonical Job events/attempts | 01 → 03 → 05 → 06 → 07 | Duplicate/out-of-order/stale/unknown events do not corrupt state; admitted/effect-verified/completed are distinct |
| Builder UI is a static shell | Real graph editing, edges, node Properties, draft persistence and command-backed CTAs | 01 → 02 → 03 → 07 | Drag/reconnect/edit/save/reload and every visible action work in browser evidence; no enabled no-op remains |

## Completion rule

The addendum is not complete when only the UI or local mocks work. Each row
requires focused tests, browser evidence for the specified mockup-led route,
and real-environment evidence for canonical Job, Runner/provider, artifact and
economic integration. Any unsupported external gate remains explicitly
reconciliation-required or release-blocked.
