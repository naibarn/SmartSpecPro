# TDD Plan — Feature 172

## Section 1 — Shared contracts

- Schema accepts versioned Worker inventory/model/invoke/result payloads and rejects secrets,
  invalid capabilities, oversized fields, unknown required versions, and mismatched task/model.
- Existing local-client contract tests remain unchanged and pass.
- Worker scope/type unions include inventory and LLM job capabilities without removing legacy values.

## Section 2 — Projection, inventory and authorization

- Migration/schema exposes required columns, FKs, partial uniqueness and event identity uniqueness.
- Same inventory replay is idempotent; same key/different hash, lower revision, and concurrent
  revision races are rejected safely.
- Owner-created same-tenant Groups pass; active non-owner group selection, cross-tenant,
  deleted, removed-member, tenant-mode and heartbeat ACL tampering fail.
- Projection mapping is stable and no secret/endpoint/prompt leaks in response or logs.

## Section 3 — Catalog and routing

- Owner and active selected-group member receive the same enabled Worker models; all other
  actors are excluded without cross-tenant existence leaks.
- Offline/stale/missing models remain visible but not selectable; task capability filtering works.
- Worker refs route to pinned Worker jobs; global refs retain the existing gateway path; explicit
  Worker requests never fallback.
- Every direct selector consumer uses the shared catalog and preserves source metadata.

## Section 4 — Worker App

- Atomic profile/model persistence and keyring/session-only behavior never serialize secrets.
- Multiple profiles/models, discovery/manual entries, capability overrides, mapping, and stale
  inventory behavior are covered.
- Adapter normalizes completion/stream/errors, rejects unsupported required parameters, honors
  `allowCloudJobs`, bounded queue, cancellation-before-send, and no-double-inference retry.
- Worker rejects wrong modelRef/provider/revision/lease/tenant and old protocol versions.

## Section 5 — UI

- Settings supports add/edit/delete/test/discover/enable/disable and Group sharing with owner-only
  authorization and localized validation/error copy.
- Selectors group Worker models, show badges/privacy, filter by task capability, and render all
  loading/empty/error/offline/stale/selected states.
- Component tests cover keyboard/focus/status semantics; browser evidence covers required viewports.

## Section 6 — Billing/lifecycle/operations

- Reservation/reconciliation is once per logical request; local inference cost is zero by default.
- Queued jobs are re-evaluated on revoke/disable; active cancellation and late completion are safe.
- Stream events deduplicate atomically and reconnect from cursor; retention/export/delete and
  audit redaction are verified.
- Feature flags, quota/backpressure, metrics, old Worker compatibility, and rollback are tested.
