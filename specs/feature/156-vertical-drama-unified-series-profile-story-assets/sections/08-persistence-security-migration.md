# Section 08 — Persistence, Security, Cost, and Migration

Use normalized tenant-scoped rows for packs, slots, asset references, analyses,
and usage bindings. Keep only the compact profile snapshot in the series bible.

Every read/write checks tenant, user, and the applicable `seriesId` or
`draftSessionId`, then verifies managed media ownership.
Uploads, vision calls, and generated references use existing reservation,
idempotency, and reconciliation boundaries. Failed jobs preserve state and can
be retried without duplicate charges or asset links.

The logical aggregate consists of pack, slot, asset, analysis, usage, and
append-only event records. Pack rows snapshot both profile and visual versions.
It requires unique `(packId, slotKey)`, stable slot IDs, tenant/series/session
indexes, soft deletion, optimistic versioning, and idempotency keys for imports,
uploads, analysis, approvals, usage binding, and staged-pack attachment. The
database or transaction boundary enforces one active staged pack per
`(tenantId, ownerId, draftSessionId)` and attach-once semantics.
Equivalent server procedures must re-check ownership and version in the
transaction; client-provided URLs, owner IDs, approval flags, and costs are not
authoritative.

Before a series exists, the server issues an unguessable `draftSessionId`. The
create-series mutation accepts that session and atomically creates the series
shell plus attaches the staged pack. A failed transaction leaves the staged
pack recoverable; an abandoned session is soft-archived after the configurable
retention period (30 days by default), with cleanup and restore events audited.
The create/attach operation is idempotent and must not call providers, upload
media, or create untracked asset rows inside the shell transaction; ingestion
happens before attachment. Legacy best-effort registration paths require an
explicit orphan reconciliation job.
The current wizard's legacy client-generated workspace IDs are not Source Pack
authority; new sessions require a server-issued ID or a cryptographically
random nonce claimed and owner-bound by the server. A legacy draft job may be
recovered, but cannot claim a new pack without an explicit server-side
claim/rotation operation.

Uploads use MIME allowlists plus content sniffing, bounded size/duration/
resolution/frame count, malware quarantine, tenant-scoped signed URLs, and
remote-fetch/SSRF rejection. Rights, face/person, private-location,
venue-restriction, and sponsored-content flags are persisted for review.

Legacy `productTieIn` remains readable and is projected into a reviewable legacy
source group; it is not silently treated as verified evidence. Existing fiction
series remain non-blocking. New writes use the profile and Source Pack
contracts. Conflicting legacy format/look fields are resolved and surfaced for
repair rather than silently rewritten during reads. Migration is lazy and
feature-flagged: a rollback disables new writes/gates without deleting legacy
fields or media. Catalog refreshes mark dependent snapshots stale and never
silently replace creator-selected media.
