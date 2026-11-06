# Feature 326 implementation plan

## Outcome

Deliver the full Book Studio flow in the existing Vertical Drama workspace: multiple books per series, selected/reordered episodes, source-pinned composition into typed editable blocks with dialogue/provenance, artwork choices including every storyboard shot, immutable approval, and independent private EPUB/PDF exports. Source series and episodes remain unchanged.

## Definition of Done

- Every applicable requirement in `handoff/requirement-ledger.json` maps to implementation and focused verification evidence tied to the integrated SHA.
- Tenant ownership is enforced at workspace, revision, source media, job and download boundaries. Source changes mark drafts stale; approved revisions remain stable.
- Jobs use only `worker_jobs` + outbox, are idempotent, durable, resumable/cancellable where supported, cost-gated for model calls, and expose useful progress.
- EPUB is reflowable EPUB 3.3, contains local selected artwork and real text, passes EPUBCheck, and is private/checksummed. PDF contains selectable Thai text and local artwork, validates metadata/pages/text, and is private/checksummed. Both jobs are independent.
- UI meets the UI/UX contract in section 04. Run focused checks and available browser/runtime evidence; state any external runtime gap precisely.
- Run the requested ten substantive post-implementation gap-review rounds, immediately repair discovered gaps, and retain one concise audit record with round focus, finding, fix/check or clean result.
- Update canonical Spec HandOff using its shared writer. Do not claim acceptance, deployment, or a requirement PASS without direct current evidence.

## Shared requirement ledger

The canonical requirement IDs/text and evidence fields are owned by `handoff/requirement-ledger.json`; do not create a parallel ledger. Sections map all requirements to the owning implementation surface. Any accepted runtime limitation remains OPEN with an exact capability blocker and next action.

## Architecture and sequence

1. **Domain foundation:** typed Book Document contracts, source snapshot and managed-image resolver, tenant-scoped persistence for workspaces/revisions/artifacts, migrations and repositories.
2. **Authoring and jobs:** owner-scoped APIs, book CRUD/episode ordering/edit/approval, source freshness, cost quote/admission, compose executor and job status; protect user edits via candidate revisions.
3. **Export pipeline:** EPUB and PDF renderers, safe asset embedding, format profile fingerprints, validation, private storage/read-back and independent job outcomes.
4. **Book Studio UI and closeout:** integrated tab with source selection/coverage, editor/approval, dual-format progress/download/retry, accessibility/responsive coverage, end-to-end focused verification and ten gap reviews.

## Cross-section contracts

- `BookDocument` is a versioned validated schema, never raw HTML. Stable block IDs and source references are preserved through edits and export.
- Revision snapshot stores immutable content, source fingerprint, selected authorized asset bytes/checksums/identities, model/prompt provenance, approval actor/time.
- Job input references only tenant-owned Book and revision IDs plus operation/profile fingerprints. Worker reloads and reauthorizes exact rows; request payload is not trusted as source content.
- Export artifact transitions to available only after renderer output, structural/content validation, checksum, private write and read-back.
- EPUB/PDF jobs each have independent idempotency and artifact status. An output from one format is preserved if the other fails.

## Verification strategy

Run focused Vitest suites for contracts, repository/service auth, jobs, renderers and UI logic. Run migration/schema checks for touched tables. Run the required lightweight handoff validator and section-plan validator. Browser evidence at 390x844, 768x1024 and 1440x900 is expected when authenticated preview is available. Do not run repository-wide typecheck locally. Do not change unrelated dirty files.

## Cross-section review

Review data ownership and migrations against authorization; verify no import cycle between shared contracts, API, job adapters and renderer; ensure worker registration and UI status contracts use the same job/output shape; verify renderer jobs receive only approved immutable revisions and do not depend on web-process-only state. Repair any mismatch before implementation handoff.
