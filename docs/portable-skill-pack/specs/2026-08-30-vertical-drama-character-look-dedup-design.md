# Vertical Drama character-look reuse and deduplication

## Problem

Sub-episode generation currently uses a request key containing scene, location,
and time. The same outfit/age-stage intent in different shots can therefore
materialize as multiple child character rows. Older manually created looks are
also missed when they have no generated semantic metadata.

## Design

Keep the request key for evidence and look-design idempotency, but use a stable
reuse identity for roster lookup: parent character, variant type, and canonical
look intent. Before inserting, the pipeline will search the current scoped
roster in this order:

1. exact request/semantic metadata;
2. normalized variant label plus variant type;
3. the canonical intent derived from the existing look label or visual fields.

The character-look designer utility and the legacy repair/backfill writer use
the same stable semantic-key contract so later repair runs do not restore the
shot-context key as the primary identity.

Matching candidates are selected deterministically, preferring an approved
portrait, then an existing system suggestion, then the oldest row. Reused user
rows are never overwritten, merged, or deleted. Rows with a different variant
type remain distinct. Multiple suggestions for the same intent in one run
therefore converge on the same row, while the existing request key remains
available for evidence provenance.

## Data flow and failure handling

The change is application-level and tenant/series scoped using the existing
roster query and authorization predicates. No migration is required. A failed
insert still uses the existing conflict/re-read recovery path. Existing
duplicate rows are not automatically deleted in this repair; future generation
will reuse the preferred existing row instead of adding more rows.

## Verification

Focused tests cover same-intent requests across scenes, legacy rows without
semantic metadata, equivalent Thai/English labels, portrait preference, and
variant-type isolation. Run the affected Vitest files, `git diff --check`, and
Prettier on owned files. Full typecheck, authenticated browser verification,
and live Series 53/episode 235 database verification remain separate evidence
boundaries unless available in the local environment.
