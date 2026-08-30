# Section 02 — Story Source Pack Contracts

Create a normalized `Story Source Pack` aggregate scoped to tenant, user, and
series or pre-series draft session. It contains versioned slots, managed asset references, source metadata,
analysis records, approvals, and usage bindings.

The slot is the narrative authority. A file without a slot title and narrative
description is an unprepared reference and cannot enter a non-fiction draft.

Pack lifecycle is explicit:

`draft -> analyzing -> needs_review -> draft_ready -> production_ready`, with
`failed`, `stale`, and `blocked` side states. `draft_ready` permits text drafting
under the factual/disclosure rules; `production_ready` additionally requires
production-approved rights for every bound media asset. A pack can return from
`failed` or `stale` to `analyzing`; it cannot return to either readiness state
without re-checking the affected slot and asset versions. Slot and asset
approval is independent, so one rejected asset does not erase the rest of the
pack.

Each transition records the pack/profile/source version, actor, reason, and
timestamp. Only the server can set `draft_ready` or `production_ready`; stale
or partially failed content always returns actionable repair items. Pack
mutations use an optimistic version and idempotency key so retries cannot
duplicate slots, links, approvals, or charges.

Minimum slot fields:

- stable ID/key and order;
- title and narrative description;
- asset kind: image, video, or either;
- source mode and provenance;
- required/optional status;
- story function and B-roll usage policy;
- analysis, approval, stale, and repair status.

Unlimited creator-added slots are supported at the UX level. API payloads,
storage, credit, and rate limits remain bounded safeguards.

The wizard may stage one pack by owner-scoped `draftSessionId` before a series
exists. Series creation atomically attaches that pack; failed creation keeps it
recoverable and abandoned sessions are soft-archived after a configurable
retention period (30 days by default).
The session identifier is server-issued/unguessable and cannot be rebound to a
different owner or series after attachment.

The normalized aggregate is backed by pack, slot, asset, analysis, usage, and
append-only event records. Required invariants are tenant/series/session indexes,
unique `(packId, slotKey)`, one active staged pack per owner/session, stable slot
IDs across story revisions, soft delete, attach-once binding, and authoritative
managed `mediaAssetId` ownership checks.
