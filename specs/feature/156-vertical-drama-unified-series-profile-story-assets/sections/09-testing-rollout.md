# Section 09 — Testing, Rollout, and Acceptance

Test in this order:

1. profile registry/resolution and legacy conflict cases;
2. slot presets, custom slots, reorder/delete, and source-pack readiness;
3. tenant/owner/media authorization and idempotent upload/analysis retries;
4. product snapshot and selected-media projection;
5. vision provenance and factual-status handling;
6. B-roll usage binding and video trim validation;
7. standard/premium prompt payloads and revision preservation;
8. wizard, source hub, review summary, loading/error/empty/blocked states;
9. browser/E2E flow from profile selection to source approval to draft gate.

Wizard contract tests must cover staged `draftSessionId` packs, create-session
attach idempotency, failed-create recovery, abandoned-session retention, and
direct `startDraftComposition` rejection before source readiness, plus
unguessable session and cross-owner attach rejection. Preview-only
`synthesizeGenrePreset` must be proven unable to persist canonical factual
claims. Rights tests must distinguish draft readiness (rights status and
disclosure) from production readiness (`rightsApproved` or creator-owned
equivalent): permission-pending media may remain text-only but must be rejected
by production binding/rendering.

Compatibility tests must prove that the existing `verticalDramaSeries.create`
mutation, not a parallel endpoint, atomically binds the staged pack; that the
existing Draft Quality QC/foundation receipt remains an additional create
requirement; and that legacy client-generated draft-job IDs cannot authorize a
new Source Pack without server-side claim/rotation. The new session allocator
must be server-issued or cryptographically random and owner-bound. API contract
tests must assert the stable `VD_SOURCE_PACK_NOT_READY` error shape, bounded
repair items, and the server-computed text-versus-production readiness flags.

Also require contract/security proof that every draft entry point is gated,
tenant crossover and SSRF are rejected, signed media URLs are scoped, stale
catalog/profile changes invalidate readiness, and retrying completed analysis
does not charge or link twice. Long-form proof must cover bounded per-chunk
digests, stable slot IDs, resumable 120+ episode runs, and profile/source
version invalidation. Profile tests must assert strict, distinct visual/evidence
coverage for each review profile, no generic documentary fallback, and correct
mapping into existing `requiredEvidence`/`format_evidence` and legacy tie-in
consumers.

Roll out contracts and read-only resolver first, then the hub, ingestion,
vision, gate, and production B-roll usage in separate flag-controlled stages.

Acceptance requires one canonical profile, correct default slots for every
non-fiction profile, editable custom slots, approved image/video references,
product/place source snapshots, server-enforced pre-draft readiness, no
unsupported claims presented as verified, and preserved legacy fiction behavior.
Production bindings must also reject media without approved rights/disclosure
status. Migration rollback/re-enable proof must preserve legacy data.
Human content quality, provider behavior, browser coverage, deployment,
migrations, and rights/legal approval remain separately reported evidence; a
passing unit suite alone cannot claim those external properties.
