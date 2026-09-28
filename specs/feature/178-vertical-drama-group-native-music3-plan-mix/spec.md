# Feature 178 — Vertical Drama Group-Native MiniMax Music 3 Plan and Mix

**Status:** SPECIFICATION — planning follow-up to Features 176 and 177
**Created:** 2026-09-06
**Owner:** Web / Worker App / Vertical Drama Production
**Companions:**

- [Feature 176 — Drama Series Emotion Timeline & Music Direction](../176-drama-series-emotion-timeline-web/spec.md)
- [Feature 177 — genuine MiniMax Music 3 Worker](../177-worker-minimax-music3-scoring/spec.md)

## 1. Objective

Add a true group-native audio workflow for a publishable Production Episode. A Production Episode is a persisted group of consecutive Sub-Episodes, so the system must be able to analyze, plan, generate, mix, QC, and publish sound against the Production Episode's own compiled final cut rather than merely aggregating independent Sub-Episode plans.

The result must remain truthful about timing, provenance, rights, Worker capability, and artifact publication. Genuine `MiniMaxAI/MiniMax-Music3` output is mandatory for generated music. No mock, synthetic, stock, alternate-model, filename-based, or fabricated QC result may be reported as success.

## 2. Relationship to Features 176/177

Features 176/177 remain the semantic and Worker foundations:

- Feature 176 owns skill-first semantic emotion interpretation, critique, review, revisions, rights review, and timing epistemics.
- Feature 177 owns Worker-side ASR/edit-map, genuine MiniMax Music 3 inference, measured DSP, FFmpeg mix/export, QC, and artifact publication.
- Feature 178 adds a Production Episode scope and composes those contracts across the final Production Episode artifact.
- Existing Sub-Episode plans and outputs remain readable and valid. A group-native plan is not silently derived by copying the first Sub-Episode plan.

## 3. Current UI gap and required correction

Current code mounts `VerticalDramaProductionEpisodesPanel` in the `production` tab. Its `Sound & Music Score` lane is currently rendered inside each `ProductionEpisodeCard`, after a persisted `productionEpisodesManifest.episodes[]` exists. The create form is visible before any Production Episode card exists; therefore a user can see no audio heading in the empty state.

Feature 178 must make the workflow discoverable in both states:

1. Empty/pre-assembly state: show a compact, non-actionable `Sound & Music Score` / `เพลงและเสียงประกอบ` readiness section below the Production Episode creation form. It must explain that the group-native plan becomes available after a Production Episode final cut is assembled and published.
2. Existing Production Episode state: show one group-native audio section in every Production Episode card, with the group plan and final-cut pipeline as the primary surface.
3. Existing member-level audio state: retain an explicitly labelled expandable Sub-Episode source view for legacy/member plans. It must not be presented as the group-native plan.

The heading must not depend only on the card list being non-empty, and the copy must distinguish `Production Episode` from `Sub-Episode`.

## 4. User flow

1. User opens `/drama-series/:seriesId?tab=production`.
2. The page shows the Production Episode creation form and an always-visible audio readiness section.
3. After a Production Episode group is assembled and its final video artifact has a stable storage reference, checksum, artifact revision, and duration, the group card shows `วิเคราะห์อารมณ์และวางแผนเพลง`.
4. User starts group-native semantic analysis. The Web service captures the group membership, final-cut artifact identity, active story lineage, source revisions, and member-plan references as an immutable source snapshot.
5. The Web skill pipeline produces a reviewed group plan with regions/cues spanning Sub-Episode boundaries. It must preserve timing basis and conflict evidence.
6. User resolves critique, approves the semantic plan, and separately approves project rights.
7. User explicitly queues genuine MiniMax Music 3 generation for selected group cues. The Worker claims a durable job only when the active binding, GPU/runtime capability, plan hash, rights snapshot, and source artifact revision are valid.
8. Worker publishes provenance-backed music takes. User auditions and selects takes.
9. Web queues a dedicated group-native `episode_score_mix` job using the Production Episode final cut plus selected takes. Worker performs FFmpeg mix, post-encode, and QC, then publishes a final score-mix artifact and QC artifact.
10. The Production card shows the final group mix, QC, provenance, and stale/blocked/error state. Applying the mix creates a new non-destructive production audio revision; it never overwrites the original compiled cut or unrelated native/manual audio.

The server persists one pipeline run and its stage dependencies. It may queue
ASR automatically after final-cut/composition-map readiness, but Music 3
generation and final mix remain separate explicit user-authorized actions. A
partial cue failure stays auditable and cannot be presented as a published
complete mix; optional/silent cues must be explicitly marked in the approved
plan.

The semantic lifecycle follows Features 176/177 exactly:
`analyze_regions` → `critique_plan` → optional `revise_plan`/`critique_plan` →
human plan review → `compile_music_caption` → `critique_caption` → explicit
authorization of the exact caption hash. Planned timing may be shown for review,
but final generation/mix admission requires `observed_asr` or
`human_verified` timing for critical anchors, or a reviewed silent-material
exception with documented no-speech evidence. `planned` and
`aligned_expected` timing must never be relabelled as observed timing.

Transitions across Sub-Episode joins require bounded adjacent context and a
skill-based reconciliation run. The composition map provides coordinates only;
it must not decide the joined emotional arc or silently inherit a member cue.

Before mix, the Worker classifies the final-cut source audio as
`dialogue_native`, `silent`, `mixed_with_existing_music` or `unknown`.
`mixed_with_existing_music`/`unknown` is blocked with `NATIVE_MUSIC_CONFLICT`
unless the user explicitly approves the replacement/ducking policy. This avoids
stacking new music over unverified baked music from the Production assembly.

## 5. Scope and non-goals

### In scope

- Production Episode group identity and membership revision.
- Stable final-cut artifact reference and invalidation when the group video changes.
- Group-native semantic analysis and plan revisions.
- Group-native durable ASR/edit-map dependency.
- Genuine MiniMax Music 3 generation and published takes.
- Dedicated group score mix, FFmpeg post-encode, and QC artifacts.
- Web Production UI, empty/readiness state, card state machine, polling, errors, rights/provenance display, and read-only archive behavior.
- Worker payload validation, claim/admission, artifact publication, and retry/idempotency behavior.
- Durable pipeline-run dependencies, per-cue partial failure/recovery and
  explicit source-audio conflict handling.
- Stage-aware cancellation with cooperative Worker cancel, checkpoint retention
  and provider-outcome reconciliation.
- Migration/backfill/observability and focused tests.
- Feature-flagged rollout, GPU feasibility, resource lease/attempt ledger,
  license/provenance retention, rights revocation propagation and bounded
  artifact parsing.
- Server-side generation reservation/settlement, unknown-outcome reconciliation
  and no-double-charge idempotency.

### Out of scope

- Replacing or deleting existing Sub-Episode Feature 176/177 records.
- A full DAW or arbitrary manual multitrack editor.
- New TTS/voice cloning.
- Automatic publication to external social platforms.
- Allowing a fallback music model, stock track, synth, or mock output.
- Treating a URL without checksum/storage key/artifact revision as an authorized Worker source.

## 6. Canonical data model

### 6.1 Production group identity

Extend the Production Episode manifest or introduce a normalized projection so every group has:

- `productionGroupId` or equivalent stable UUID.
- `seriesId`, tenant/user owner, public Production Episode number.
- ordered `subEpisodeIds` and their episode-number snapshot.
- `groupRevision` incremented when membership or source cut changes.
- member revision/source-lineage snapshot and `sourceLineageHash`.
- compiled final-cut managed `artifactId`, `storageKey`, URL projection, SHA-256 checksum, artifact
  revision, duration, frame/sample probe, content type, and publication timestamp.
- checksummed composition edit-map artifact mapping ordered Sub-Episode/source
  coordinates to final-cut coordinates.
- current group-audio plan ID/revision and current mix artifact ID/revision where present.

The group identity must not be derived from array position alone. Existing manifests without a stable group ID need a deterministic, auditable backfill or an explicit `legacy_unaddressable` state until reassembly creates one.

For legacy backfill, use a versioned namespace-derived UUID from tenant/user/
series, group index, ordered member IDs and final artifact checksum, and store
the derivation version/fingerprint. Collision or incomplete input remains
`legacy_unaddressable`; it must never silently merge two groups.

### 6.2 Group audio plan

Use a dedicated group scope rather than making the existing episode-level `episodeId` nullable without a complete contract review. The group plan must include:

- scope discriminator `production_episode` and `productionGroupId`.
- source snapshot hash and group artifact revision.
- ordered member episode IDs and member plan references used as evidence.
- timing origins/coverage, edit-map revision and ASR artifact references.
- semantic regions, transitions, cues, silence actions, dialogue protection, and rationale.
- skill ID/version/content hash, model/provider identity, execution IDs, input/output hashes.
- caption hash, critique disposition, human resolutions, plan hash, revision,
  status, rights policy hash, rights review, approver, stale reason and timestamps.

Persist a group audio pipeline-run projection with run ID, stage/job IDs,
upstream job IDs, selected take IDs, attempt status, reservation reference and
terminal reason. `worker_jobs` remains the execution queue and
`worker_artifacts` remains the artifact ledger.

Group plans become stale when the final-cut artifact, membership, source lineage, or rights policy changes.

### 6.3 Worker job payloads

Extend the audio wire contract with an explicit group scope. Do not overload `episodeId` with a Production Episode number.

Required fields include:

- `scopeType: production_episode`.
- `productionGroupId`, `groupRevision`, ordered member IDs.
- checksummed `cutMedia` reference to the Production Episode final cut.
- immutable `timelineHash` and edit-map revision.
- group plan ID/revision/hash for generation and mix.
- analysis artifact references for generation/mix.
- rights authorization snapshot and Worker binding revision.
- idempotency key containing scope, group revision, plan hash, selected cues/takes, and delivery profile.

The final-cut assembly map is a `compositionEditMap` input to initial ASR. The
Worker publishes a separate speech/token edit-map artifact after probing and
transcription; generation/mix require both references and hashes.

The schema must reject mixed episode/group scope, stale revisions, missing
checksums, relative-path traversal, incomplete provenance, and unauthorized
rights status. Large transcript/edit-map/QC inputs travel as authenticated
checksum-addressed artifacts, not unbounded embedded JSON; enforce decompressed
size, token-count, duration and opaque-ID limits before parsing. Preserve typed
error codes from 176/177, including `MODEL_NOT_INSTALLED`, `GPU_UNAVAILABLE`,
`RUNTIME_INCOMPATIBLE`, `PLAN_STALE`, `TRANSCRIPT_UNAVAILABLE`,
`TIMELINE_MAPPING_PARTIAL`, `RIGHTS_REVIEW_REQUIRED`, `PUBLICATION_FAILED`,
and `CANCELED`, in the group projection.

## 7. Web implementation boundaries

Implementation targets:

- `apps/web/shared/verticalDramaSeries/assembly.ts` for group identity and artifact contract.
- `apps/web/drizzle/schema.ts` plus an additive migration for group plans, analyses/revisions, or a normalized group-audio projection.
- `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts` for final-cut publication metadata.
- `apps/web/server/services/verticalDramaFfmpegAssemblyRunner.ts` for the
  completion patch that must persist managed artifact identity into the group
  manifest, not only a playback URL.
- `apps/web/server/services/verticalDramaAudioScoring.ts` and `verticalDramaAudioPipelineCoordinator.ts` for group-scoped source, plan, admission, and queue orchestration.
- `apps/web/server/routers/verticalDramaAudioScoring.ts` for group procedures and ownership checks.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx` for the always-visible readiness section and per-card group-native lane.
- A new group panel component is preferred over growing the existing member-level panel beyond one scope.

All queries and mutations must enforce tenant/user ownership and return truthful
state. The Production tab must load a batch readiness projection for visible
groups rather than issuing one request per card. Polling must stop or back off
with a bounded interval on terminal state. UI must expose blocked reasons such
as missing final cut, stale group revision, missing Worker binding, unavailable
GPU/MiniMax runtime, pending rights review, missing ASR/edit-map, and failed
post-encode QC.

Artifact playback/download must use the existing tenant-authorized presentation
refs with expiry/ownership checks. Browser/provider URLs are never accepted as
the source of truth. Analysis/generation/mix inputs are bounded and rate
limited; private URLs, bearer tokens and raw transcript content are excluded
from logs.

Owners/editors with production permission may mutate group plans/rights/jobs;
viewers and shared readers receive inspection/playback only. Archived or
revoked series are read-only for every role. Server authorization derives
tenant/actor scope from the authenticated context, never from browser fields.

## 8. Worker implementation boundaries

Implementation targets:

- `apps/worker-app/src-tauri/src/worker_loop.rs` for group payload dispatch, source download, ASR/edit-map use, MiniMax generation, artifact publication, and score mix/export.
- `apps/worker-app/src-tauri/src/media_pipeline.rs` for deterministic FFmpeg graph and post-encode QC.
- `apps/worker-app/src-tauri/src/worker_executor.rs` for capability admission and job type contracts.
- `apps/worker-app/src/types/audioScoring.ts` and related Worker contracts for typed group state.
- `apps/worker-app/tests/media-workspace/audioScoring.contracts.test.ts` plus Rust tests for contract and runtime boundaries.

The Worker must preserve genuine MiniMax identity and publish artifact metadata
that binds every output to group ID, group revision, plan hash, model
identity/revision, source checksum, output checksum, QC results, and job ID. A
failed provider/runtime must be terminally truthful, not converted into
success. It must also keep a durable on-disk attempt ledger with request hash,
model/runtime identity, process ID, stage checkpoints, cancellation and
publication state. One heavy Music 3 inference may hold the GPU lease at a time;
ASR/mix scheduling must respect the same resource budget.

Worker artifact publication must verify tenant/series/job ownership, contract
version, checksum/size/MIME, active binding revision and plan identity. A stale
or revoked binding may retain private history but cannot publish a public or
playable artifact.

## 9. UI/UX contract

### Empty state

- Always visible under the Production Episode creation form.
- Shows title `Sound & Music Score` / `เพลงและเสียงประกอบระดับ Production EP`.
- Shows readiness: `รอ final cut ของ Production EP`, `พร้อมวางแผน`, or blocked reason.
- CTA is disabled until a group final cut exists; the disabled explanation is visible without hover.
- The heading/readiness card remains visible when `verticalDramaGroupNativeMusic3`
  is false; show `กำลังเตรียมระบบ`/`feature_disabled` and disable/hide mutation
  actions. The flag gates mutation and Worker admission, not discoverability.

### Group card

- Primary title: `วิเคราะห์อารมณ์และวางแผนเพลงระดับ Production EP`.
- Status rail: plan, rights, ASR/edit-map, MiniMax generation, published takes, score mix, post-encode QC.
- Primary actions are ordered: analyze/review → resolve/approve → rights → generate → select takes → mix/QC.
- Member source plans are behind an expandable “Sub-Episode source plans” disclosure.
- Group card never silently displays a member plan as the group plan.
- Read-only/archive mode allows inspection and playback but disables all mutations.
- Error states include actionable next step and preserve job/artifact IDs for support/debugging.
- The Worker dashboard/media workspace shows group scope, job stage, binding,
  artifact and terminal reason without becoming a second plan-approval surface.
- Keyboard navigation, focus order, screen-reader labels, text plus icons, responsive layout, and no color-only status meaning are required.

### State matrix

| State | Group UI | Allowed action |
|---|---|---|
| No Production group | readiness section | assemble Production Episode |
| Group pending | compile progress | inspect members; no audio queue |
| Final cut missing/invalid | blocked | reassemble/publish final cut |
| Ready, no plan | analyze CTA | start group analysis |
| Analysis running/failed | live job/error | cancel or retry where safe |
| Needs review/stale | review warning | resolve/replan |
| Approved, rights pending | rights gate | submit rights evidence |
| Rights approved, ASR missing | dependency gate | wait/queue allowed analysis |
| Generating | Worker progress | inspect/cancel if contract allows |
| Takes published | take list | select takes |
| Mix/QC running | progress | wait/inspect |
| QC failed | terminal evidence | retry only with a new idempotent attempt or replan |
| Published | playback/download/provenance | create non-destructive revision |
| Archived | read-only | inspect only |
| Feature flag off | heading/readiness visible | inspect only; no group mutation |

### Timing, rights and QC gates

- Timing origins remain distinct per region/token: `planned`,
  `aligned_expected`, `observed_asr`, and `human_verified`. Empty/partial/
  unavailable ASR is visible; authored dialogue is never inserted as if
  transcribed.
- Rights lifecycle is independent of technical QC and includes `unreviewed`,
  `needs_review`, `approved_for_project`, `blocked`, and `revoked`. A revoked
  take or ancestor invalidates dependent final export.
- Preserve model/license revision, approved caption, request/seed/runtime, take
  checksum, reviewer and attribution/license notice metadata. Provenance is not
  a copyright guarantee.
- Default `web_drama_v1` mix checks duration within one output frame, actual
  stream/audio presence, checksum, sample rate/channels, loudness/true peak,
  music-silence threshold and prescribed ducking within ±1 dB on steady
  windows. Technical QC cannot approve creative emotion or rights.

## 10. Acceptance criteria

1. A user can discover the audio workflow before any Production Episode exists.
2. A completed Production Episode card exposes a group-native plan, not only a list of member plans.
3. The group plan is based on the checksummed Production Episode final cut and immutable group revision.
4. The Worker refuses stale, incomplete, unauthorized, or mixed-scope payloads.
5. ASR/edit-map artifacts are real, checksummed, revisioned, and attached to the group timeline.
6. Music generation succeeds only with genuine MiniMax Music 3 identity and published provenance-backed artifacts.
7. Score mix uses the group final cut and selected takes, runs FFmpeg post-encode QC, and publishes final artifacts.
8. All terminal failures remain visible and truthful; no fallback result is presented as success.
9. Existing Sub-Episode Feature 176/177 behavior remains backward compatible.
10. UI focused tests, server contract/service tests, Worker contract tests, Rust tests, migration verification, and bounded no-credit runtime smoke pass. Full `npm run check` remains optional when RAM is constrained; focused type/parse gates must be recorded instead.

## 11. Rollout and migration

- Add migration(s) transactionally and register them in the Drizzle ledger.
- Backfill only deterministic group identities and artifact metadata already present; never invent checksums or claim old URLs are managed artifacts.
- Existing groups without sufficient artifact identity remain visible with a truthful “reassemble required” state.
- Add a tenant-scoped `verticalDramaGroupNativeMusic3` flag, default off, and
  require it plus minimum Web/Worker contract versions for group routes, UI
  actions and Worker admission. Existing member audio remains unaffected.
- Require a real RTX 5060 Ti 16 GB/MiniMax feasibility gate before enabling paid
  generation for a tenant; failed feasibility keeps the flag read-only/blocked.
- Add metrics for group analysis duration, stale admission, Worker capability blocks, take publication, mix QC failure, and final artifact publication.
- Provide a rollback path that hides new group-native actions while preserving old member-level records and compiled video.

## 12. Verification plan

- Contract unit tests for group identity, scope discrimination, hashes, idempotency, and stale rejection.
- Migration/schema test against the configured PostgreSQL database using additive migration only.
- Web service/router tests for tenant ownership, empty/final-cut readiness, plan lifecycle, rights gates, member disclosure, and group mix queue.
- Component tests for empty state, group card states, read-only mode, missing member mapping, and keyboard-visible actions.
- Worker Rust/TypeScript tests for payload validation, model identity, artifact publication, FFmpeg graph, post-encode QC, and terminal failure mapping.
- Bounded no-credit smoke with a real final-cut artifact and Worker binding; any unavailable GPU/MiniMax runtime must be reported as a blocked proof, not simulated as success.
- Real runtime proof must include a genuine model artifact, exact runtime/GPU
  identity, timing/quality measurements, upload/publication and final QC. A
  mocked or synthesized signal can cover isolated DSP error paths only.
- Paid generation must create/reuse a server reservation before dispatch, settle
  from actual Worker usage/publication, release unused reservation on failure or
  cancellation, and reconcile unknown provider outcomes before retry.

## 13. Resolved implementation decisions

- Use normalized `vertical_drama_production_episode_groups` plus dedicated
  group-analysis/plan/revision tables. Keep JSONB manifest fields as a backward-
  compatible display projection; do not make `episodeId` nullable.
- Use existing durable job kinds with an explicit production-group scope union.
- Default the first group-native mix to `web_drama_v1` with native/dialogue
  preservation and deterministic ducking; expose other delivery profiles only
  after this path is proven.
- Publish typed `score_mix`, `score_mix_export` and `score_mix_qc` artifacts
  through the existing managed artifact path with display-safe playback refs.
