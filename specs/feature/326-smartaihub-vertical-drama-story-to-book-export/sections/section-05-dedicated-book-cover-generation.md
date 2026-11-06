# Section 05 — Dedicated book cover generation

## Requirement IDs

New and revised requirements: book-cover creator, enabled reference-capable image-model selection, randomized authorized shot selection, three candidates per round, exact Unicode title/author/blurb composition, candidate selection, private asset binding, credit transparency, and durable job progress/failure handling. Reconcile exact IDs with the canonical ledger before implementation.

## Objective and deliverable

Add a Book Studio cover creator that generates three selectable book-specific cover candidates from selected episode shot images and book metadata. Another generation round should use a different shot combination whenever the authorized image pool allows it. Selecting a candidate binds that media asset to the book revision; generating more candidates must not replace the current selection.

## Owned scope

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaBookStudio.tsx` and focused cover creator child component if needed.
- `apps/web/server/routers/verticalDramaBooks.ts` and focused cover generation service/job executor.
- `apps/web/shared/verticalDramaSeries/bookDocument.ts` only if generated-cover provenance must be added to the versioned contract.
- Cover rendering, media asset persistence, canonical `worker_jobs` plus outbox integration, and focused tests.
- This section and the canonical Spec requirement ledger.

## Product and API contract

1. The author chooses an enabled image model whose server-side capability metadata confirms image-reference support; reject stale, disabled, inaccessible, or incompatible model IDs.
2. The server derives references only from the actor-owned source snapshot for the explicitly selected episodes. It chooses a bounded random sample according to the selected model's reference limit and never accepts arbitrary client URLs.
3. Each generation round creates three distinct cover artwork candidates. A later round avoids the immediately previous shot combination when another valid combination exists. If the pool is too small, disclose that reuse may occur.
4. The cover-art prompt includes title, author, blurb, locale, and series theme, and asks for a clear text-safe area. A deterministic Unicode-safe composition step renders the exact title, author, and optional blurb over the generated art.
5. Candidate files are ingested into private media storage and remain scoped to the owning tenant/user. Each has a stable media asset ID, checksum, generation model, and shot-reference provenance.
6. The user can preview all candidates, choose one, and continue generating without changing the active cover. Explicit selection updates the draft Book Document cover reference; normal revision saving and approval pin its checksum and alternative text.
7. The UI presents the estimated credit cost for all three outputs before dispatch. Generation and status use `worker_jobs` plus outbox; retry/cancel behavior must retain already completed candidates and never silently replace a selected cover.
8. Progress and failures are accessible and Thai-first. Public errors are sanitized; detailed provider diagnostics remain operator-protected.

## State and acceptance matrix

| State | Expected behavior |
|---|---|
| no episodes selected | generation unavailable with a clear prompt to select episodes |
| no compatible model | explain that an image-reference model is required; do not silently choose a fallback |
| estimate ready | show selected model, three-image estimate, and source image count before generation |
| queued/running | show durable progress; prevent accidental duplicate dispatch; allow supported cancel |
| success | show three selectable candidates with exact displayed metadata text |
| partial provider success | retain and show completed candidates; report partial status without discarding them |
| failed/cancelled | preserve the current cover and prior candidates; show sanitized retry action |
| regenerate | sample another authorized reference combination when possible; do not clear earlier candidates |
| selected | bind the chosen candidate/checksum to the editable book revision and exports |

## Security and cost checks

- Verify actor, tenant, series, selected episodes, shot assets, job status, and returned candidates at every API boundary.
- Derive image bytes from authorized storage records; do not send client-controlled URLs to providers.
- Enforce model capability, reference-count, prompt-size, rate, and three-output credit limits server-side.
- Ensure model/provider failure and partial completion reconcile cost according to the existing image-credit lifecycle; do not charge for outputs never submitted.
- Reject cross-tenant candidate selection and stale candidate IDs.

## Focused verification

- Cover reference sampling is bounded, reproducible in tests, authorized, and avoids repeating the previous set when alternatives exist.
- Model capability and credit admission fail closed.
- Three candidates persist independently; a partial result and retries preserve successful output.
- Unicode text overlay renders title, author, and blurb exactly and safely.
- Cover selection updates only the current draft and is included in the approved EPUB/PDF cover asset.
- Tenant-isolated job status and asset selection are covered.
- Use the scoped package/integration profile appropriate to changed code; do not run repository-wide typecheck in a shared local session.

## Completion predicate

The user can select an eligible image model, see the cost estimate, generate and compare three book-specific cover options from authorized shot references, generate additional rounds, select one without losing alternatives, save/approve it, and export it in EPUB/PDF. Evidence must be bound to the integrated canonical SHA through the shared Spec HandOff writer.
