# P2 Implementation Plan — Advisory QA and Asset Preservation

## Requirement ledger

| ID | Requirement | Current evidence | Completion predicate |
|---|---|---|---|
| CPE-10 / NB-03 | Visual QA is advisory | Frame/clip QC procedures and `stageBlocksPaidGeneration` exist | Low score, continuity, identity and report failures do not change media readiness or downstream eligibility |
| CPE-11 | Selective repair | Existing repair services and manual controls exist | Repair uses exact source/version, is bounded, explicit, authorized and budgeted |
| NB-04 | Keep successful assets accessible | QC routes write metadata and assembly has version projections; direct route/UI proof is missing | Authorized inspect/download still returns previous successful asset after every advisory/repair failure case |
| NB-06 | Provider fallback is bounded and authorized | Existing provider routing | Failed candidate is never activated; retry/fallback respects capability and budget |
| Partial assembly | Preserve successful clips on technical partial failure | `resolveClipsForAssembly` supports `allowPartial`; route/UI usage needs reconciliation | Explicit partial assembly has only successful clips and truthful label; no aesthetic warning forces partial mode |

## Sequence

1. Reconcile Feature 137/138/149/157 plus existing QC and media artifact semantics; inspect the router handlers and component controls.
2. Keep `generation/task/asset` status independent of the QC report's `passed`, score, verdict or `identityQc.status`.
3. Add router/service/UI regressions for identity/continuity warnings, unavailable provider/sampler, malformed output, and report persistence failure. Assert same asset ID/URL, owner-scoped read and download succeed.
4. Trace repair writes through provider response, media task artifact readiness, asset ownership, version ledger, and activation pointer. Use compare-and-set against source revision/current version. Failed, stale, unverified or cross-tenant candidate is never promoted.
5. Keep repair manual and bounded unless an existing user-enabled budget explicitly authorizes an exact limited operation. Never loop based on advisory score.
6. Verify assembly's explicit partial option end-to-end. Only a technically ready generated clip can enter; warnings do not block. A still, placeholder or missing clip is not described as a generated video.
7. Run focused QC, repair, assembly and authenticated UI/API checks; record actual readiness and known separate failures without touching unrelated suites.

## Owned paths

`apps/web/server/services/verticalDramaQc.ts`, frame/clip QC and repair services, relevant procedures in `verticalDramaEpisodes.ts`, media artifact/asset ownership, `verticalDramaEpisodeVideoAssembly.ts`, storyboard/episode workspace UI, and focused tests. Reconcile Features 137/138/149/157 and canonical handoff owners; no new QC or asset ledger if existing records can represent it.

## Dependencies

P0 non-blocking result contract and P1 shot/style/revision lineage. P3 consumes stable asset and audio/video version semantics.

## Definition of done

All advisory outcomes leave usable media visible and readable. Failed candidate cannot replace previous version. Paid repair requires existing authorization and idempotent budget. Partial assembly is opt-in/explicit and accurately labeled. Essential safety and technical integrity gates remain hard.
