# Vertical Drama Draft Ledger — Implementation Plan

**Status:** Implemented in this worktree
**Scope:** Pre-create Vertical Drama draft composition and Draft Quality QC

## Objective

Make an incomplete or concurrently overwritten draft impossible to send to QC
silently. The structured draft remains the runtime contract; every composition
and QC stage also produces an immutable JSON snapshot and a readable Markdown
projection.

## Delivery units

1. Add `vertical_drama_draft_ledgers` as an owner-scoped manifest with a locked
   `currentVersion` and the latest structured snapshot.
2. Add immutable `vertical_drama_draft_versions` rows and storage objects under
   a server-generated draft UUID. Object keys use tenant + draft id + monotonic
   version, so title/timestamp collisions cannot overwrite content.
3. Persist foundation, composer, completion, validation, QC baseline, QC
   revision, and QC final snapshots. Redis remains job status/polling state,
   not the only copy of the draft.
4. Revalidate revised QC candidates with the strict completion gate and keep
   candidate selection ordered by pass status, critical failures, score, then
   round count.
5. Use two QC improvement rounds by default. A passing baseline stops without a
   revision; malformed/incomplete quality revisions are rejected without
   replacing the current best candidate.
6. Bind the wizard's QC request to the composition artifact id and reject late
   composition responses whose request key or source signature is stale.

## Verification

- Focused Vitest suites cover ledger rendering, QC budget, comparator safety,
  composition queue admission/deduplication, and QC queue behavior.
- `git diff --check` is required for the scoped files.
- Package-wide TypeScript output is reported separately when unrelated baseline
  errors remain outside this pipeline.

## Operational requirement

Migration `0222_vertical_drama_draft_ledger.sql` must be applied before enabling
the durable artifact path in an environment. The storage abstraction may use
R2/S3 or local storage, but production should use the configured shared object
store so artifacts are available to every worker machine.
