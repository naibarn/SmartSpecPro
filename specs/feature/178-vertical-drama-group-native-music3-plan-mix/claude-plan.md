# Implementation Plan — Feature 178 Group-Native MiniMax Music 3 Plan/Mix

## 1. Outcome and implementation strategy

Build a separate Production Episode audio scope that uses the publishable group final cut as its source of truth. Preserve the existing Sub-Episode Feature 176/177 pipeline and expose it only as a compatibility/source disclosure. Add a normalized group identity and group-audio projection so the system can enforce ownership, revision, idempotency, stale detection and artifact provenance without overloading `episodeId` or relying on JSONB array position.

The implementation is ordered Web contract/data foundation → final-cut publication identity → semantic group plan → Worker ASR/generation/mix → Web UI → migration/backfill → focused verification and browser evidence. Each wave must leave the existing member-level path working.

## 2. Scope boundaries and invariants

### Must remain true

- A Production Episode group is not a Sub-Episode. Every group-native record carries an explicit `scopeType: production_episode` and `productionGroupId`.
- A Worker media source is admitted only with an owned managed storage reference, SHA-256 checksum, artifact revision, duration, and group revision.
- A plan is not approved by generation, and rights approval is independent from semantic approval.
- A generated take is successful only when the Worker proves genuine MiniMax Music 3 identity, publishes an artifact, and records provenance/QC.
- A score mix is non-destructive: it creates a new group audio revision and never rewrites the original compiled video or native/manual dialogue track.
- A stale group, plan, or take is blocked with a visible reason; no silent retry or fallback is allowed.

### Explicit non-goals

- Do not delete or rewrite existing `vertical_drama_emotion_plans` episode rows.
- Do not make the existing episode `episodeId` nullable as a shortcut.
- Do not make the existing member-level `VerticalDramaEmotionScorePanel` infer group state.
- Do not add an external provider or alternate music model.

## 3. Codebase decisions and ownership

### 3.1 Concrete implementation map

The implementation must stay within the existing module boundaries unless a new
file is explicitly listed below:

- Web schema/types/rollout: `apps/web/drizzle/schema.ts`, `apps/web/shared/verticalDramaMedia/audioScoringContracts.ts`, `apps/web/shared/verticalDramaMedia/contracts.ts`, `apps/web/shared/featureFlags.ts` (allowlist, type and default-off flag), and a new additive SQL migration under `apps/web/drizzle/` after the current highest migration number.
- Final-cut identity: `apps/web/shared/verticalDramaSeries/assembly.ts`, `apps/web/server/services/verticalDramaProductionEpisodeAssembly.ts`, `apps/web/server/services/verticalDramaFfmpegAssemblyRunner.ts`, `apps/web/server/services/verticalDramaProductionEpisodeRemotion.ts`, and the existing managed-media/artifact publication helper selected by the assembly executor. The executor must persist the artifact identity into the group manifest, not only return a playback URL.
- Group semantic/service layer: extend `apps/web/server/services/verticalDramaAudioScoring.ts` only for shared validation helpers; put group-specific persistence/admission in a new `apps/web/server/services/verticalDramaProductionGroupAudio.ts` so episode assumptions remain visible and testable.
- Router: extend `apps/web/server/routers/verticalDramaAudioScoring.ts` with a dedicated `productionGroup` namespace or equivalent group-only procedures; do not change existing episode procedure input contracts.
- Web UI: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel.tsx` for the always-visible readiness card and card mount, plus a new `VerticalDramaProductionGroupAudioPanel.tsx` for group state/actions. Keep `VerticalDramaEmotionScorePanel.tsx` episode-scoped.
- Worker shared/runtime: `apps/worker-app/src/types/audioScoring.ts`, the Worker job polling/dispatch path under `apps/worker-app/src-tauri/src/worker_loop.rs` and `worker_executor.rs`, and media execution in `apps/worker-app/src-tauri/src/media_pipeline.rs`. Add focused Rust modules only when the existing executor cannot keep group admission and execution isolated.
- Worker UI/dashboard: `apps/worker-app/src/screens/media-workspace/AutoAudioScoringModal.tsx` and the existing job/dashboard surfaces only for group scope/status display; the Web Production tab remains the source of truth for plan approval.

Names above are implementation targets, not permission to rewrite adjacent modules.
Before editing a shared export, run the repository impact check available in the
environment or use targeted import/test search when that index is unavailable.

### Web semantic and orchestration ownership

- Extend the existing skill-first semantic execution path rather than creating a second emotion planner.
- Add a group source snapshot builder that reads the active series lineage, ordered group membership, existing member plan references, final-cut artifact identity, and any available dialogue/source evidence.
- Add group-specific service functions for analysis, plan lifecycle, rights, take listing, pipeline status and score-mix queue. Reuse validation/hash/provenance helpers only when their scope assumptions are explicit.
- Keep routers thin: ownership/admission checks belong in services, while tRPC procedures map inputs and return persisted projections.

### Worker media ownership

- Extend the shared audio wire contracts with explicit group scope and use the same durable `worker_jobs` scheduler, lease, binding revision and artifact publication paths.
- Extend Rust dispatch only after the shared Zod/Rust payload contract is defined. The Worker owns actual media timing, ASR/edit-map, MiniMax inference, FFmpeg mix/export and post-encode QC.
- Preserve existing capability admission: MiniMax generation requires GPU/runtime capability; ASR/mix may use CPU-heavy capabilities; missing capability is a truthful terminal/blocking state.

## 4. Data model and migration plan

### 4.1 Normalized Production Episode group identity

Add the normalized table `vertical_drama_production_episode_groups` using the
repository's Drizzle naming conventions:

- UUID `id` primary key.
- tenant/user/series ownership columns with the same foreign keys and cascade behavior as the current audio tables.
- stable group position/public Production Episode number.
- `groupRevision` positive integer.
- ordered `subEpisodeIds` and `subEpisodeNumbers` JSONB snapshots.
- member revision/source-lineage snapshot and `sourceLineageHash`.
- final-cut artifact fields: managed `artifactId`, `storageKey`, URL projection if required by the existing storage read path, checksum, artifact revision, content type, duration, frame/sample probe, assembled timestamp.
- `groupRevision`, current audio revision pointer, status/error code and created/updated timestamps.
- unique tenant/user/series + group-position identity; indexes by tenant/series,
  status/updated time and group revision.

The service that persists `productionEpisodesManifest` must upsert this identity as part of final-cut publication. It must increment `groupRevision` when membership or final artifact identity changes. The JSONB manifest becomes a display projection that includes the normalized group ID/revision/artifact summary for backward-compatible reads.

### 4.2 Group-native analysis and plan tables

Add dedicated group-scoped tables rather than weakening episode foreign keys:

`vertical_drama_production_audio_analyses`:

- group ownership/FK, status, source revision/hash/snapshot, timing origin/
  coverage, result/error code, interactive job reference, runtime version,
  artifact refs and timestamps.
- unique group + source hash for idempotent analysis.

`vertical_drama_production_emotion_plans`:

- plan ID, group ownership/FK, planning key, revision/status/source hash/plan
  hash, caption hash, plan JSON, skill metadata/execution refs, rights
  status/policy/review, approval fields, stale reason and timestamps.
- unique group + current plan identity and indexes for admission/status/revision.

`vertical_drama_production_emotion_plan_revisions`:

- plan ID/FK, tenant, revision, plan/caption hash/JSON, source/group revision,
  change reason, actor and timestamp.

Store large snapshots/results as managed artifact refs with bounded metadata;
do not place full transcript/waveform/QC payloads in the plan JSON or worker job
input JSON.

`vertical_drama_production_audio_pipeline_runs`:

- group ownership/FK, immutable run ID, group/plan/source revisions, feature
  contract version, stage/job IDs, upstream job IDs, selected take IDs, status,
  attempt counters, reservation reference and terminal reason.
- unique group + run identity and unique stage/idempotency identity so recovery
  can reconcile an existing job instead of creating a second paid attempt.
- This table is the durable Web projection of the group chain; `worker_jobs`
  remains the execution queue and `worker_artifacts` remains the artifact ledger.

All new rows carry tenant/user/series ownership and explicit delete behavior.
Deleting or revoking a series/group prevents new admission, cancels safe queued
jobs, schedules authorized artifact deletion, and retains only the bounded audit
record required by policy. No private artifact remains reachable through an old
presentation URL after deletion/revocation.

Do not share a single unique index with episode plans. Shared validators may be reused, but the persisted scope and foreign key must be explicit.

### 4.3 Migration/backfill safety

- Create an additive Drizzle migration and register it in the ledger.
- Backfill group rows only from manifests with valid series ownership, ordered members and completed managed artifact identity. If a manifest lacks checksum/storage key/artifact revision, create no false artifact; mark the UI projection as `reassemble_required` or leave the normalized group absent until a new assembly.
- Backfill deterministic member IDs from the current `subEpisodeIds`/numbers only when each number maps to exactly one owned episode. Ambiguity remains blocked and visible.
- For a legacy manifest without a stable group ID, derive a deterministic UUID
  from a versioned namespace plus tenant/user/series, group index, ordered
  member IDs and final artifact checksum. Store the derivation version and
  natural-key fingerprint; collision or incomplete input remains
  `legacy_unaddressable` rather than silently merging groups.
- Do not run a paid generation, retry terminal jobs, or mutate user creative plans during the backfill.
- Add a rollback path that removes only new group-native action visibility while leaving existing manifests, member plans and videos intact.

Migration ordering is: schema declarations → SQL migration → generated/runtime
schema parity → backfill/readiness service → router/UI exposure. The migration
must be applied through the repository migration command and verified against
the configured PostgreSQL database; `db:push` is not an acceptable substitute.

## 5. Shared contract changes

### 5.1 Scope envelope

Add a shared scope shape used by Web and Worker:

- `scopeType: "episode" | "production_episode"`.
- `episodeId` required only for `episode` scope.
- `productionGroupId` and `groupRevision` required only for `production_episode` scope.
- ordered member IDs for group scope.

Keep the current Feature 176/177 episode payload branch backward-compatible.
Introduce a versioned group branch whose normalized internal scope is:

- episode branch: existing `episodeId` contract, normalized as
  `scopeType: "episode"` by the adapter;
- production branch: `scopeType: "production_episode"`,
  `productionGroupId`, `groupRevision` and ordered member IDs, with no
  `episodeId` field.

The union must reject both IDs being present inconsistently, missing group
revision, mixed group/member take plans, invalid hashes, unsupported contract
versions or arbitrary storage paths. Rust/TypeScript parsers accept only the
explicitly supported versions and normalize them to one internal scope type;
they must not silently default a missing scope.

### 5.2 Group audio payloads

Extend the existing durable job kinds with an explicit discriminated scope
instead of inventing parallel job names: `episode_audio_analyze`,
`minimax_music3_generate` and `episode_score_mix` remain the scheduler/job
types, while `scopeType: "episode" | "production_episode"` selects the
payload identity. Production scope carries the final-cut media ref, group
source/timeline hash, group plan ID/revision/hash, ASR/edit-map refs, selected
cues/takes, runtime identity, rights authorization and idempotency key.

Use one canonical union and ensure `verticalDramaMediaJobPayloadSchema`,
scheduler admission, callback validation and Worker parsing all use the same
version. Include a contract version bump or explicit compatible version branch,
and reject unknown scope fields rather than silently stripping them. This keeps
the existing Worker capability/timeout registry stable while making group
admission explicit and testable.

Create a language-neutral fixture corpus under the shared audio contract test
fixtures and consume the same valid/invalid cases from Web Zod tests and Worker
Rust/TypeScript tests. Include legacy episode v1, valid group v2, missing/mixed
scope, stale revision, artifact mismatch, rights revoked and oversized artifact
cases. A Rust deserialize that skips semantic validation does not pass the
contract gate.

Extend `audioArtifactRefSchema`/publication validation with the concrete typed
artifact kinds `score_mix_export` and `score_mix_qc`, matching the existing
Worker artifact types. The mapping must remain identical across Zod, Rust,
`worker_artifacts` metadata and browser display projections.

### 5.3 Composition map versus speech edit-map

Do not make ASR depend on a speech edit-map that does not exist yet. Final-cut
assembly publishes a checksummed `compositionEditMap` artifact describing the
ordered Sub-Episode/source coordinates to final-cut coordinates. The initial
group `episode_audio_analyze` payload consumes that map plus `cutMedia`; the
Worker then publishes a separate `speechEditMap`/transcript artifact containing
real ASR token timing in cut coordinates. Generation and mix consume both refs
and their hashes. A missing or unsupported composition map blocks analysis;
empty/partial ASR is represented explicitly and never replaced by authored text.

## 6. Final-cut artifact publication

Update `verticalDramaProductionEpisodeAssembly.ts` and
`verticalDramaFfmpegAssemblyRunner.ts` at the completion patch boundary so
completed group output records a managed artifact identity, not only a URL. The
output must include:

- stable storage key/reference,
- checksum calculated from the final uploaded file,
- artifact revision tied to group revision/assembly attempt,
- content type and probed duration,
- checksummed composition edit-map artifact ID/reference mapping source members
  to final-cut coordinates,
- publication timestamp and source membership snapshot.

The read projection in `verticalDramaSeries.get` must expose only display-safe fields. The group audio coordinator must use the server-owned storage reference and checksum, never a browser URL supplied by the client. If an old completed group lacks this identity, return `final_cut_artifact_required` and show “reassemble required” rather than queueing.

## 7. Semantic group plan lifecycle

### 7.0 Persisted state machine and concurrency rules

Use one explicit state vocabulary in the database projection, API response and
UI copy. Analysis states are `idle`, `queued`, `running`, `needs_review`,
`approved`, `blocked`, `failed`, and `cancelled`. Take/mix pipeline states are
`not_ready`, `queued`, `running`, `published`, `blocked`, and `failed`. A group
plan may enter `approved` only from `needs_review` after a current hash check;
generation may enter `queued` only from `approved` plus rights approval and a
current final-cut artifact. A published mix creates a new revision and never
mutates a prior published revision.

Every approval, rights update, queue request and publication uses a transaction
or compare-and-swap predicate on `(productionGroupId, groupRevision, planRevision,
sourceHash)`. Duplicate requests return the existing idempotent job. A stale
write returns a deterministic `GROUP_REVISION_STALE`/`PLAN_REVISION_STALE`
projection for the UI. Worker lease loss may requeue only non-terminal jobs;
published/failed terminal artifacts are immutable and require a new revision for
retry. Credits/paid-provider admission must be checked before the first paid
MiniMax request and must not be charged again for an idempotent replay.

Final-cut publication and group-audio admission use the same group row/revision
CAS boundary. When assembly changes membership or final artifact identity, it
increments `groupRevision`, marks dependent runs/plans/takes stale and prevents
late callbacks from publishing. Cancellation is stage-aware: queued jobs may be
cancelled before claim, running jobs receive a cooperative cancel and retain
private checkpoints, and uncertain provider outcomes require reconciliation
before retry.

### 7.0.1 Durable group pipeline chain

Create one `production_audio_pipeline_run` after a group source snapshot is
created. Persist each stage job ID and upstream dependency in the run row:
composition-map/final-cut admission → group ASR/speech-map analysis → approved
plan/caption → explicit Music 3 generation → take selection → score mix/QC.
Analysis may be queued automatically after a valid final cut and composition
map; Music 3 generation and final mix always require separate explicit user
authorization. A callback advances the next eligible stage only after the
current artifact and hash are published. A restart reconciles the run from
`worker_jobs`/`worker_artifacts` before creating a new job.

For paid generation, atomically create or reuse a server-side reservation
before dispatch, bind it to the pipeline run/attempt/cue set, and settle only
from Worker-reported usage plus publication outcome. Release unused reservation
on cancellation/failure, reconcile `GENERATION_OUTCOME_UNKNOWN` before any
retry, and never charge a duplicate idempotency replay.

### 7.1 Source snapshot

Create a service that validates ownership, loads the normalized group and member episodes, resolves active story lineage using existing precedence, and records:

- group ID/revision and final-cut artifact identity,
- composition edit-map artifact identity and coordinate version,
- ordered member episode IDs/numbers and current revisions,
- member plan IDs/hashes as evidence only,
- authored script/dialogue/emotion evidence and source conflicts,
- per-token/region timing origin (`planned`, `aligned_expected`, `observed_asr`,
  `human_verified`), coverage and uncertainty,
- input inventory and hash.

The snapshot is immutable for an analysis attempt. It must not silently merge contradictory member content or assert group timing from target-duration sums.
Transitions crossing Sub-Episode joins require bounded adjacent context and a
skill-based reconciliation run. The composition map may concatenate coordinates,
but it must not decide the joined emotional arc or automatically inherit a
member cue across a boundary.

### 7.2 Skill execution and persistence

Reuse the existing application skill modes in the required order:
`analyze_regions`, `critique_plan`, optional `revise_plan`/`critique_plan`,
human plan review, `compile_music_caption`, `critique_caption`, then explicit
authorization of the exact caption hash. Use group-specific source identifiers
and persist provenance exactly as the existing plan contract requires. A
malformed/unavailable exact skill/model is a failed analysis, not a rule-based
fallback. Planned/aligned timing can remain reviewable, but generation/mix
admission requires observed-ASR or human-verified critical anchors, or a
reviewed silent-material exception with documented no-speech evidence.

The plan lifecycle is:

1. `queued`/`running` analysis.
2. `needs_review` plan with critique disposition and timing/conflict evidence.
3. optional human critique resolution/revision, followed by re-critique.
4. caption compilation and caption critique under the same frozen source.
5. semantic approval with plan/caption hash check.
6. independent rights review/approval.
7. stale if group revision, source snapshot or rights policy changes.

Plan approval must never queue generation if group final-cut identity or source hash no longer matches.
Rights status is independent and uses `unreviewed`, `needs_review`,
`approved_for_project`, `blocked` and `revoked`. Approval is bound to the exact
plan/caption/take scope, checksum, model/license snapshot and reviewer. A
technical QC pass cannot advance rights. Revocation propagates to dependent
takes/mixes and blocks final export while preserving private audit history.

## 8. Worker pipeline and artifact publication

### 8.1 Admission and ASR/edit-map

When group analysis is requested, the coordinator verifies active Worker
binding, group revision, final-cut artifact and composition edit-map. It queues
durable analysis only once per group/artifact/composition-map/idempotency key.
Worker downloads through the authorized storage contract, probes the actual
media, emits real ASR token timing and a cut-coordinate speech edit-map, and
publishes checksummed transcript/speech-map artifacts with group metadata.

Storage access is tenant/series/job scoped and uses the existing artifact access
endpoint or short-lived authorized transfer; neither browser URLs nor provider
URLs are trusted as ownership. Verify checksum, size, MIME, duration and media
stream before execution. Do not log bearer tokens, private URLs, prompt secrets
or raw transcript beyond the bounded audit policy.

Missing media, expired storage, invalid checksum, stale group revision,
unavailable ASR runtime or malformed output becomes a terminal/blocking state
with a deterministic reason. Preserve `empty`, `partial`, `unavailable` and
`failed` ASR outcomes; authored script text cannot be substituted for missing
tokens. For genuinely silent material, allow a reviewed no-speech evidence path
without fabricating tokens. Cache analysis by source checksum + normalized edit
map + ASR/alignment runtime version; unsupported trims/speed/reverse/repeated
clip mappings become `TIMELINE_MAPPING_PARTIAL` and require review.

### 8.2 Genuine MiniMax Music 3 generation

Generation is admitted only when the group plan/caption hash/revision,
ASR/edit-map refs, rights snapshot and binding revision match. The Worker
records the exact MiniMax model identity/revision, GPU/runtime metadata,
selected cues, input hashes, request/seed hashes and output hashes. Every take
is published as an artifact with measured duration/loudness/true peak and
provenance, model/license revision, approved prompt/caption, attribution notice
and rights scope. Maintain a durable attempt ledger across restart and reconcile
unknown outcomes before re-running inference. Permit only one heavy Music 3 GPU
lease at a time and coordinate ASR/mix resource pressure. Provider/model/runtime
failures remain failed; no alternative model or synthetic fallback is allowed.

Persist per-cue/per-attempt status and error code. A partial generation may be
shown for audition/recovery, but the run is not `published` and mix admission
must reject missing mandatory cues unless the approved plan explicitly marks a
cue as optional/silent. Retrying one failed cue creates a new idempotent attempt
linked to the same plan revision; it must not regenerate successful cues or
inherit an unverified take.

### 8.3 Group score mix and post-encode QC

The group mix job consumes the Production Episode final cut plus selected
published Music 3 take refs. Before mixing, inspect the source audio profile:
`dialogue_native`, `silent`, `mixed_with_existing_music` or `unknown`. Unknown
or already-mixed music sources are blocked with `NATIVE_MUSIC_CONFLICT` unless
the user explicitly selects an approved replacement/ducking policy. The default
path preserves dialogue/native audio, applies deterministic attenuation/ducking,
and writes a new mixed media output. FFmpeg graph construction,
duration/probe checks and post-encode verification belong in the Worker media
pipeline.

Publish separate `score_mix`, `score_mix_export` and `score_mix_qc` artifacts as
required by the existing artifact model. The default `web_drama_v1` QC must
verify duration within one output frame, stream presence, checksum, audio
presence, sample rate/channels, loudness/true peak limits, music-silence
threshold, prescribed ducking within ±1 dB on steady windows, and plan/group
revision match. Revalidate rights for every selected take/ancestor before
export; technical QC cannot advance rights status. The server marks the group
audio revision publishable only after valid artifact publication and QC evidence.

The Worker callback must be accepted only if the job binding revision, group
revision, plan hash and artifact checksums still match the queued payload. A
callback for a superseded job is retained as an audit/terminal event but cannot
replace the current published projection. Upload/publication failure after a
successful local encode is a failed job, not a successful mix; the local file
must remain available to the Worker retry/recovery policy without exposing it as
a public artifact.

## 9. API/router surface

Add a group-scoped router namespace or explicit group inputs to the existing audio router. Prefer separate procedures so the client cannot accidentally send episode inputs to a group procedure:

- `getProductionGroupAudioReadiness({seriesId, productionGroupId})`.
- `getProductionGroupsAudioReadiness({seriesId, productionGroupIds})` for the
  Production tab list; use this batch projection to avoid one readiness query
  per card.
- `getProductionGroupAudioSources(...)`.
- `requestProductionGroupAnalysis(...)`.
- `getProductionGroupPlan(...)`.
- `approveProductionGroupPlan(...)`.
- `resolveProductionGroupCritique(...)`.
- `updateProductionGroupRightsStatus(...)`.
- `getProductionGroupPipeline(...)`.
- `listProductionGroupTakes(...)`.
- `queueProductionGroupScoreMix(...)`.
- `cancelProductionGroupAnalysis(...)` and `cancelProductionGroupRun(...)`
  where cancellation is safe; generation cancellation must preserve attempt/
  reservation reconciliation and never claim a provider outcome is absent.

Every procedure must enforce tenant/user ownership and validate group revision. Responses should be compact display projections with stage, status, IDs, timestamps, artifact refs and actionable blocked/terminal reasons; do not send raw unbounded snapshots to the browser.

The feature flag and read-only/archive policy are checked server-side, not only
in React. Artifact playback/download uses tenant-authorized presentation refs
with expiry/ownership checks. Router inputs are bounded and rate-limited for
analysis, generation and mix requests; duplicate requests are deduplicated
before billing/provider dispatch.

Authorization is explicit: series owners/editors with the required production
permission may approve plans, rights, generation and mix; viewers/shared
readers may inspect bounded projections/playback only; archived or revoked
series are read-only for every role. The server must derive the actor/tenant
scope from the authenticated context and never trust role/tenant fields from
the browser payload.

## 10. Web UI implementation

### 10.1 Empty/readiness surface

Modify `VerticalDramaProductionEpisodesPanel.tsx` to render an always-visible card after the creation form and before the group list. The card must display:

- Thai/English heading: `เพลงและเสียงประกอบระดับ Production EP` / `Production Episode Sound & Music Score`.
- readiness state: no group, assembly pending, final-cut artifact required, ready, or archived/read-only.
- short explanation that group-native planning uses the completed Production Episode final cut.
- disabled CTA before a valid group exists; visible reason text, not tooltip-only.

The readiness heading/card remains visible when `verticalDramaGroupNativeMusic3`
is false so discoverability is not reintroduced behind the flag. In that state,
show a non-actionable `feature_disabled`/`กำลังเตรียมระบบ` status and do not call
mutation procedures. The flag gates group mutations and Worker admission, not
the explanatory heading.

This directly fixes the screenshot discoverability gap without pretending that analysis can start before a group artifact exists.

### 10.2 Group card

Create a dedicated `VerticalDramaProductionGroupAudioPanel` rather than adding group state to the member-level `VerticalDramaEmotionScorePanel`. Mount it in every `ProductionEpisodeCard` with `seriesId`, `productionGroupId`, `groupRevision`, `readOnly`, locale and the compact group state.

The primary layout is:

1. `วิเคราะห์อารมณ์และวางแผนเพลงระดับ Production EP`.
2. Final-cut artifact/status row.
3. stage rail: plan, rights, ASR/edit-map, Music 3, takes, score mix/QC.
4. primary action for the current stage.
5. published takes and group mix playback/provenance.
6. expandable `Sub-Episode source plans` containing the current member panels, explicitly labelled as compatibility/source evidence.

Use the existing polling and status copy conventions, but keep group and member
query keys separate. Load readiness in one batch for the visible group list;
poll only active group stages with bounded exponential backoff and a maximum
interval, stop on terminal state, and invalidate the Production series/group
readiness queries after publication. Do not create an unbounded polling loop
when many Production Episodes are visible.

### 10.3 Existing code gap handling

Keep the current member-level lane during rollout behind the source disclosure. Do not show it as the primary group plan. Groups with legacy manifests or missing normalized identity show a truthful reassemble/readiness state and retain member inspection.

The readiness card is rendered independently of `groups.length`; its query must
return a compact projection even when no normalized group exists. It must not
call group mutation procedures in the empty state. When a group appears after
assembly, invalidate the Production query and the group-audio readiness query
so the card transitions without a full page reload.

## 11. UI/UX contract

### Target User / JTBD

- Role: Vertical Drama producer/editor with authority to approve plans, rights and paid generation.
- Goal: Open the Production tab, understand whether each publishable EP is ready for sound, approve a coherent EP-level music plan, generate genuine Music 3 takes, and publish a QC-backed mix.
- Entry point: `/drama-series/:seriesId?tab=production`.
- Success outcome: The user can distinguish group-native audio from member source plans and can identify exactly why a stage is blocked.

### Existing Pattern Reference

- Search used: `rg -n "VerticalDramaProductionEpisodesPanel|EmotionScorePanel|productionEpisodesManifest|refetchInterval|CardTitle|<details" apps/web/client/src`.
- Found: `VerticalDramaProductionEpisodesPanel.tsx` for Production card/form/status/polling, `VerticalDramaEmotionScorePanel.tsx` for review/rights/take/QC state, and native `<details>/<summary>` for member disclosure.
- Decision: reuse the existing Card/Badge/Button/status/polling primitives and the member disclosure pattern; diverge by creating a dedicated group panel because one component cannot safely own both episode and Production Episode scopes.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Production tab | `VerticalDramaSeriesDetailPage.tsx`, `/drama-series/:id?tab=production` | Preserve mount; verify empty/card states and route-level browser evidence |
| Production panel | `VerticalDramaProductionEpisodesPanel.tsx` | Add always-visible readiness card and group panel mount |
| Group audio panel | new `VerticalDramaProductionGroupAudioPanel.tsx` | Add group plan/pipeline/takes/mix/QC workflow |
| Member source disclosure | existing member panel or extracted compact wrapper | Label as source/member scope |
| Worker dashboard | existing Worker media workspace | Show group scope/job/artifact status where current job list supports it; no duplicate semantic state |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `VerticalDramaProductionEpisodesPanel` | readiness, group list, group identity projection | `verticalDramaSeries.get`, assembly state |
| `VerticalDramaProductionGroupAudioPanel` | group stage state/actions/polling | group tRPC procedures, group ID/revision, readOnly |
| `VerticalDramaEmotionScorePanel` | episode/member scope only | existing episode audio procedures |
| `verticalDramaAudioPipelineCoordinator` extension | group admission/idempotency/stale checks | normalized group, plan, artifact, Worker binding |
| Worker audio executor | group media execution/publication | typed group payloads and authorized refs |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| Loading | skeleton for readiness/card stage rail | component test + browser screenshot |
| No group | always-visible heading, explanation, disabled CTA | component test + screenshot |
| Group pending | compile status; audio CTA disabled | component test |
| Final artifact missing | blocked reason and reassemble action/link | service/component test |
| Ready/no plan | analyze CTA | component test |
| Analysis running | progress, job ID/status, cancel if safe | router/service test |
| Needs review/stale | warning, revision/hash and review action | component test |
| Rights pending | rights evidence form/gate | router/component test |
| Generating | Worker progress, genuine model identity, no success yet | Worker contract test |
| Takes published | selectable takes with checksum/QC | component test |
| Mix/QC running | progress and disabled duplicate queue | idempotency test |
| QC failed | terminal reason and safe retry/replan path | Worker/service test |
| Published | player/download/provenance and new revision action | browser/manual evidence |
| Read-only | all mutations disabled, inspection remains available | component test |
| Feature flag off | heading/readiness visible, mutation hidden/disabled | flag/UI/router test |
| Focus/hover/keyboard | visible focus and accessible labels | browser/a11y evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | one-column cards; stage rail wraps/scrolls without horizontal page overflow; controls stack | Playwright/screenshot |
| tablet 768x1024 | card content remains one column; take rows wrap; member disclosure full width | Playwright/screenshot |
| desktop 1440x900 | readiness and card sections use full available content width; stage statuses remain readable | Playwright/screenshot |
| small-mobile 360x800 | extended check because this page is dense; no clipped CTA or hidden blocked reason | Playwright/screenshot |
| laptop 1024x768 | extended check at layout breakpoint; player and status controls remain reachable | Playwright/screenshot |
| wide-desktop 1280x800 | extended check for long titles/take metadata and no overflow | Playwright/screenshot |

### Accessibility Acceptance

- Keyboard order follows readiness → group plan → current action → stage details → takes → mix/provenance → member disclosure.
- Every CTA and icon-only control has an accessible name; disabled actions retain visible explanatory text.
- Use semantic headings, sections, lists, buttons and details/summary; do not rely on color alone for stage state.
- Focus rings remain visible in light/dark themes; contrast is checked for badges, warnings and destructive states.
- Active polling indicators use `aria-live="polite"` and respect reduced-motion preferences.
- Inputs have explicit labels and errors are associated with the relevant control.

### Visual Direction and token strategy

- Reuse the existing Production panel's sparse card/border hierarchy, semantic Tailwind tokens, shadcn `Card`, `Badge`, `Button`, `Skeleton`, `Input` and existing spacing/radius conventions.
- Use status colors already used by `Badge` variants (`secondary`, `outline`, `destructive`) and text/icon pairing.
- Avoid new raw colors, new global resets, heavy animation or a second visual language.
- Keep the readiness card compact so it does not push the creation form below the fold unnecessarily.

### Copy Contract

- Primary Thai tone: concise, operational and explicit about `ตอนย่อย` vs `Production EP`.
- Required labels: `เพลงและเสียงประกอบระดับ Production EP`, `วิเคราะห์อารมณ์และวางแผนเพลงระดับ Production EP`, `แผนระดับตอนย่อย (Source)`, `สิทธิ์`, `ASR / Edit-map`, `Music 3`, `Score Mix / QC`.
- Empty copy: `สร้าง Production Episode ก่อน จึงจะวิเคราะห์และวางแผนเพลงจาก final cut ได้`.
- Blocked copy: `ยังไม่มี final cut ที่มี checksum/storage reference สำหรับส่งเข้า Worker`.
- Error copy must preserve deterministic server/Worker reason and provide a next action.
- English fallback must describe the same scope and must never call a member plan a Production Episode plan.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`. Capture the Production route in empty, pending, ready, blocked, published and read-only states at the required mobile/tablet/desktop viewports. Record skipped evidence explicitly if authenticated browser tooling, final deployment or a real Worker artifact is unavailable.

## 12. Test-driven implementation matrix

### Shared and Web contract tests

- scope union accepts valid episode and production-group payloads;
- rejects missing/mixed scope IDs, stale revision, invalid storage references, missing checksums and rights mismatch;
- hashes/idempotency keys change when group revision, plan hash, selected cue/take or artifact checksum changes.

### Database/service/router tests

- group ownership/tenant isolation;
- manifest-to-group identity upsert and revision increment;
- legacy group with missing artifact identity is blocked, not queued;
- source snapshot includes ordered members and does not choose the first member as a proxy;
- group plan critique/approval/rights/stale transitions;
- duplicate requests dedupe and terminal failures remain visible;
- group score mix admits only selected published takes and current group revision.

### UI tests

- readiness heading renders when `groups.length === 0`;
- card shows group-native section when a valid group exists;
- member plans are under an explicit source disclosure;
- missing member identity does not substitute another episode;
- read-only disables every mutation;
- stage labels/status/error/empty/loading states have accessible names.

### Worker tests

- group payload admission and mixed-scope rejection;
- genuine MiniMax model identity and no fallback;
- ASR/edit-map artifact publication with group metadata/checksums;
- group score-mix input ordering and FFmpeg graph;
- post-encode QC failure mapping and artifact publication;
- retries/idempotency and lease/binding revision behavior.
- timing-origin/empty-partial-ASR handling, unsupported edit-map cases and typed
  error-code preservation;
- attempt-ledger restart/reconciliation, one-GPU-lease backpressure and
  publication-after-revocation rejection.

### Focused verification commands

Use the repository's existing package-manager conventions and run from the
appropriate workspace:

- Web shared/service/router/UI: `npm --workspace apps/web exec vitest run <focused test files> --pool=forks --maxWorkers=1` with the test JWT secret.
- Web parser/import proof: the focused component/esbuild or Vite command used by
  the affected package, plus `git diff --check`.
- Worker TypeScript: `npm --workspace apps/worker-app run typecheck` and
  `npm --workspace apps/worker-app run build` when memory permits.
- Worker Rust: `npm --workspace apps/worker-app test` or the focused
  `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml` command.
- Database: `npm --workspace apps/web run db:migrate` only against the approved
  target, followed by migration-ledger/schema/index/FK verification.

Do not claim `npm run check` passed when the known RAM constraint prevents it;
record the focused gates and their exact output instead.

## 13. Execution waves and dependencies

1. **Contract and schema wave:** add `verticalDramaGroupNativeMusic3` to the
   tenant feature-flag allowlist/defaults (off), normalized group identity,
   group plan/analysis/revision tables, shared scope/payload schemas, migration
   and focused contract tests.
2. **Final-cut and Web service wave:** artifact identity publication, group source snapshot, skill plan lifecycle, router procedures, stale/rights/admission tests.
3. **Worker wave:** group ASR/edit-map, MiniMax generation, take publication, group score mix, post-encode QC, Rust/TypeScript tests.
4. **Web UI wave:** readiness card, dedicated group panel, source disclosure, polling/invalidation, responsive/a11y states and component tests.
5. **Integration/proof wave:** migration verification, focused Web/Worker/Rust
   tests, bounded no-credit runtime smoke, authenticated browser evidence,
   feature-flag/contract-version canary, real RTX 5060 Ti 16 GB feasibility
   gate, production runtime evidence, gap closure and review convergence.

Do not start generation or paid provider smoke as part of ordinary tests. The
server flag, minimum Web/Worker contract version and capability admission must
all be true before paid group generation. Real GPU/provider proof is a
separately recorded runtime gate and must fail truthfully if the target Worker
is unavailable.

### Operational readiness and rollback

- Emit bounded metrics keyed by tenant/series/group/job type and contract
  version: queue latency, lease age, stale admissions, ASR coverage, generation
  attempts/outcomes, GPU wait, artifact publication failures, QC failures and
  published revision count. Never use prompt text, URLs or tokens as labels.
- Alert on jobs exceeding stage timeout, repeated `GENERATION_OUTCOME_UNKNOWN`,
  publication checksum mismatch, revocation after queue, and growing GPU queue.
- Series/group deletion must revoke active jobs, prevent publication, and apply
  the existing artifact retention/deletion policy without exposing orphaned
  private files. Preserve only the bounded audit record required by policy.
- Rollout order is schema → Web/Worker compatible contracts → server flag off →
  no-credit canary → real GPU feasibility canary → tenant enablement. Rollback
  disables new admission first, drains/cancels safe queued jobs, keeps history
  read-only, and never deletes prior user artifacts.

## 14. Review checklist before implementation handoff

- Every new table and payload has tenant/user ownership and a migration/backfill strategy.
- Every group stage has a persisted state, terminal failure reason and stale rule.
- Every UI state in the matrix has a test/evidence route.
- Member-level and group-native identifiers cannot be confused.
- UI empty state fixes the screenshot discoverability gap before any group exists.
- No spec requirement depends on a first-member shortcut or fabricated artifact.
- Browser evidence and residual deployment/authentication limitations are explicit.
