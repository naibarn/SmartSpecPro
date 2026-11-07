# Section 02 — Successful Asset Version Preservation

## Requirement IDs

NB-04, NB-06, NB-07, CPE-11

## Objective

Make asset promotion atomic and preserve last good media if candidate generation, QC, persistence or repair fails.

## Owned paths

Episode repair-attempt service, image/video media artifact reconciliation, asset ownership services, `verticalDramaEpisodes.ts` writes, assembly artifact version ledger and focused tests.

## Tasks

1. Trace current selected/previous asset fields and authoritative version artifacts.
2. Promote only a ready, verified, owner-scoped candidate against the same current source revision.
3. On any failed or stale candidate, keep previous ID/version and storage URL current and accessible.
4. Use stable per-operation idempotency; no automatic second paid attempt after unknown provider outcome.
5. Keep regeneration user initiated and visibly bounded.

## Completion predicate

Fault injection at every provider/DB/activation step proves exact preservation and authorized reads for the prior successful asset.

## Prerequisites and fallback

Requires section 01. Use the existing version/artifact system; add an additive persistence field only if the current canonical owner cannot represent prior/current state safely.

## Focused tests and evidence

Inject provider timeout, failed generation, schema-invalid output, artifact-not-ready, checksum/ownership failure, stale source version, DB activation failure and concurrent user upload. Assert the previous successful asset ID/version/URL remains current and readable by its owner; only a verified same-revision candidate can replace it.

## Unresolved assumptions

Confirm the current authoritative active/previous asset pointer and any assembly version ledger before changing writes. Avoid a new pointer or migration if existing artifact lineage can preserve the last successful version.
