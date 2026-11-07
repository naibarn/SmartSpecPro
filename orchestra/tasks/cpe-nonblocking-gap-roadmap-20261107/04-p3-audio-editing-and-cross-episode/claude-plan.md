# P3 Implementation Plan — Audio, Editing and Cross-Episode Continuity

## Requirement ledger

| ID | Requirement | Existing state | Completion predicate |
|---|---|---|---|
| CPE-12 | Dialogue and lip-sync continuity | Dialogue plans/audio services/audio QC exist; full post-render proof is unresolved | Voice/dialogue intent and QC are revision-bound and warnings never hide usable video |
| CPE-13 | Sound design and editing | Existing prompt/audio/assembly components; Feature 175 is design-only and unresolved | Implement only evidence-backed audio intent, QC, mix/master and assembly work on the approved execution/control plane |
| CPE-14 | Cross-episode continuity | Story bible and memory planning exist | Current episode remains producible if prior memory is missing/stale; accepted facts stay tenant- and revision-scoped |
| NB-04 | Preserve media on audio failure | Existing separate audio/video artifacts, route proof incomplete | Failed optional audio operation leaves last successful video and audio master accessible |
| NB-05 | Preserve explicit user audio choices | Native audio setting exists | ON/OFF/dialogue-only/manual choices are unchanged and no new mandatory approval is added |

## Sequence

1. Reconcile Feature 175 plus current audio services/UI and canonical requirements. Reject requirements that imply unsupported always-on infrastructure or a mandatory audio-quality gate.
2. Build an exact audio-mode and source-lineage map: native master, dialogue plan, TTS/voice identity, SFX/ambience, audio-QC report, repaired stem, assembled master. Identify a single owner for each mutable pointer.
3. Close gaps in existing prompt/audio contracts and model capability projection; preserve explicit audio toggles and budget/credit controls.
4. Ensure each optional audio/QC/repair component can fail independently; return warning and preserve valid video and prior audio version. Use existing worker job/outbox for long-running operations.
5. Reconcile edit/timeline/assembly contracts. Preserve successful video clips and produce truthful audio-missing/partial metadata where supported.
6. Connect cross-episode story/visual/audio facts to current series memory using source revision, owner and staleness checks. Missing prior memory falls back to current episode facts.
7. Add contract/service/router/assembly/UI tests and authenticated verification for audio settings and video accessibility.

## Owned paths

Existing `verticalDramaDialogueAudio.ts`, `verticalDramaAudioPipelineCoordinator.ts`, audio QC/repair/mastering, media task/artifact services, `verticalDramaEpisodeVideoAssembly.ts`, series memory services, current audio UI components and focused tests. Reconcile Feature 175/149/153/157 before any schema change.

## Dependencies

P0 advisory/hard boundary, P1 style/cast/shot lineage, and P2 successful asset/version semantics.

## Definition of done

Audio user mode is stable; dialogue/lip-sync/sound/edit outputs have auditable lineage; failure of optional audio/continuity never removes video; no unapproved paid repair; ownership, safety, budget and cancellation remain intact; feature-off and old record compatibility pass.

No production deployment is part of this phase.
