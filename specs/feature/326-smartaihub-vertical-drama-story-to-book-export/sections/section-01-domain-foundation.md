# Section 01 — Domain foundation

## Requirement IDs

All ledger requirements concerning Book workspace/revisions, source fingerprints, typed Book Document, source/asset provenance, selected shot coverage, immutability, ownership, private references, stale detection, safe bounded contracts, and migration persistence. Resolve IDs directly from `handoff/requirement-ledger.json` when updating status; do not invent IDs.

## Objective and deliverable

Add versioned Book Document and source snapshot contracts, tenant-bound Book workspace/revision/export persistence, repositories, and source/media resolution that proves authorized shot-image coverage. Existing mutable episode JSON must be snapshotted with canonical fingerprints; asset URLs are never trusted as identifiers or fetched directly.

## Owned scope

- `apps/web/shared/verticalDramaSeries/book*` contracts and focused tests.
- `apps/web/drizzle/schema.ts` and a migration in the repository's current active migration path.
- `apps/web/server/services/verticalDramaBook*` repository/source snapshot services and tests.
- Spec handoff evidence for this section.

## Prerequisites

Current `main`, source schema discovery, media authorization/storage APIs, migration runner/journal audit. Preserve unrelated dirty paths.

## Design constraints

- Every query includes tenant and series/user ownership predicates.
- Document is structured JSON with bounded schema, stable IDs, typed blocks, source refs; no HTML/CSS/remote URLs.
- Snapshot exact selected episode script/storyboard and authorized image identity/checksum; calculate deterministic SHA-256 fingerprints.
- All-shots coverage is complete only when each selected source shot resolves to a usable managed image. Missing refs are returned with chapter/shot locators.
- New books do not mutate or lock source episodes; multiple books and explicit special-episode selection are supported.

## Completion predicate and evidence

Schema/migration and focused contract/repository tests pass; source edit changes fingerprint; cross-tenant access returns not found/denied; missing and stale image references fail closed. Record command, revision and evidence in canonical handoff.

## Fallback / blocker strategy

If no source image resolver exists, adapt the existing media-asset authorization/storage service; never use raw storyboard URLs. If historical migration journal is inconsistent, follow current dev-active migration policy and preserve ledger evidence; do not fabricate applied rows.

## UI/UX Contract

### Target User / JTBD
N/A — this section adds server/shared data contracts only; the author flow is designed in section 02 and 04.

### Existing Pattern Reference
N/A — no visible surface is changed in this section.

### Surface Inventory
N/A — no route or component is changed.

### Component Map
N/A — server/shared contracts only.

### State Matrix
N/A — no UI state is changed.

### Responsive Matrix
N/A — no UI surface is changed.

### Accessibility Acceptance
N/A — no UI surface is changed.

### Copy Contract
N/A — no user-facing copy is added.

### Browser Evidence Required
N/A — no UI surface is changed.
