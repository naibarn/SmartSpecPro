# Implementation Order

## Wave 1 — Contracts and compatibility

Create the canonical Series Profile registry, resolver, slot presets, Source
Pack schemas, server-issued draft-session contract, explicit lifecycle states,
gate result, usage policy, digest contract, version/invalidation rules, and
legacy projection. Add pure tests, including composition-gate plus existing
Draft Quality QC/foundation-gate composition.
The profile registry must also define and test a strict visual grounding
contract for every profile; no review profile may inherit an undocumented
generic fallback.

## Wave 2 — Persistence and safe asset APIs

Add normalized tenant-scoped tables and idempotent procedures for server-issued
draft sessions, staged or series-bound packs, slots,
managed asset links, product/place snapshots, analysis records, approvals,
usage bindings, and append-only audit events. Add session attach/recovery,
ownership, optimistic concurrency, quota, upload-validation, and rollback
invariants.

## Wave 3 — Unified creator UI

Replace the duplicate format/look controls with one profile picker, rename the
Product tie-in step, add staged source identity and slot authoring, and show
readiness in Review. Preserve wizard step IDs and saved state.

## Wave 4 — Ingestion and AI assistance

Add upload/import selection, map metadata, marketplace product media selection,
generated references, vision description suggestions, provenance, asynchronous
retry/idempotency, rights/privacy flags, and stale-source handling.

## Wave 5 — Draft gate and production usage

Enforce the pre-draft gate at every server entry point, inject only bounded
approved Source Pack digests into standard/premium prompts, preserve slot IDs
in revisions, and bind approved image/video slots to B-roll/cutaway usage with
trim/audio/safe-zone/render validation.
Thread the same profile/visual contract through story, storyboard, shot, and
media prompt composition without independent genre inference.

## Wave 6 — Convergence and rollout

Run unit/API/UI/browser proof, security and long-form contract proof, review
tenant/media/cost boundaries, verify legacy fiction and product-tie-in behavior,
observe audit/queue/error metrics, then enable the feature progressively with a
rollback flag.
