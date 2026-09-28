# Section 07 — Story, Prompt, Media, B-roll, and QC Adapters

## Outcome

Wire the existing Vertical Drama story, start-frame/reference, video-prompt,
media, B-roll, assembly, post-generation QC, and season-QC paths into one
durable assurance lineage. Every downstream artifact must retain the same
immutable `ProductionContextSnapshot` reference and must derive its own input
fingerprint from the exact accepted predecessor artifacts. A stage fingerprint
is therefore not copied from the prior stage: it is a deterministic link in one
chain rooted at `{ snapshotId, revision, fingerprint }`.

The implementation preserves the current routers, job polling, editor actions,
prompt preview, save flows, provider/model selection, and response fields.
Feature 157 adds server-owned metadata and gates only. It does not introduce a
second content store, provider path, credit owner, or user workflow.

This section is complete when:

- story architecture and full/deep story candidates cannot become active from
  an unverified or stale assurance attempt;
- start-frame, reference-image, and video prompts are bound to the current
  context, shot contract, exact media/reference set, model policy, and prompt
  dialect;
- paid image/video submission is impossible before Section 03's one-time final
  authorization is claimed for the exact provider payload;
- B-roll bindings, assembly manifests, exports, post-generation QC, and season
  QC consume the same chain and fail closed on stale or missing predecessors;
- flag-disabled behavior is byte/shape compatible except for optional omitted
  metadata; and
- Redis loss, worker restart, retry, or redelivery cannot fork lineage, charge
  twice, or submit the same logical media effect twice.

## Dependencies, ownership, and non-goals

This section starts only after Sections 03, 05, and 06 are implemented and
their focused suites pass. It consumes, and does not redefine:

- Section 01: `ProductionContextSnapshot`, `VerticalDramaAssuranceRequest`,
  `VerticalDramaAssuranceResult`, readiness/disposition/state enums, canonical
  hashing, stable errors, and the canonical Feature 157 flag names;
- Section 02: the generalized assurance execution/attempt/event repository,
  fences, leases, accepted-domain references, reconciliation, and replay;
- Section 03: per-call settlement, media billing ownership, one-time provider
  authorization, and `assertOrchestraFinalGate` composition;
- Section 05: thirteen-profile admission, source/rights/disclosure/visual-role
  policy, managed-media checks, and current-context recapture; and
- Section 06: `executeVerticalDramaAssuranceRuntime` and
  `assertVerticalDramaDomainFinalGate` in
  `apps/web/server/services/verticalDramaAssuranceAdapter.ts`.

The Node domain layer remains authoritative. Agent Runtime may propose story,
prompt, or QC output but may not select authoritative IDs, activate story
content, persist a B-roll binding, submit media, spend/refund credit, or approve
an export. Existing media/provider services remain the only provider and asset
owners. Existing story tables/JSONB remain the only content owners.

Out of scope here:

- Draft QC baseline recovery and draft activation, owned by Section 04;
- profile/source capture and policy definitions, owned by Section 05;
- generic Agent Runtime changes, owned by Section 06;
- new pages, buttons, route names, wizard steps, client status machines, or
  localization, owned by Section 08; and
- deployment dashboards, production canary execution, and final release proof,
  owned by Sections 09 and 10.

SocratiCode was unavailable during planning. Implementation must repeat a
targeted symbol/caller check before editing shared modules and may supplement it
with SocratiCode impact analysis if the transport is restored.

## Current seams and required corrections

| Stage | Existing authority and symbols | Required adapter behavior |
| --- | --- | --- |
| Story architecture | `apps/web/server/services/verticalDramaStoryArchitecturePlanner.ts`: `VerticalDramaStoryArchitecturePlannerInput`, `planVerticalDramaStoryArchitecture` | Admit `premise_expansion`/`story_architecture`, run deterministic validation, persist a candidate ref, and activate only through a current fenced final gate. |
| Full/deep story | `apps/web/server/services/verticalDramaStoryBible.ts`: `generateStoryBible`, `GenerateStoryBibleDeepParams`, `generateStoryBibleDeep`, `executeJsonPlanningCallWithRetry`; `apps/web/server/services/verticalDramaStoryJobs.ts`: `enqueueVerticalDramaStoryJob`, `runVerticalDramaStoryJob` | Preserve the synchronous and existing `deep_generate`/`extend`/`improve_script` job UX while attaching durable execution/attempt/context/predecessor refs and per-physical-call settlement. |
| Story contracts | `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`: `STORY_GENERATION_CONTRACT_VERSION`, `StorySourceSnapshot`, `StoryGenerationRunContract`, `fingerprintStoryValue`, `buildStoryContractHash`, `buildStoryPolicyHash`; `verticalDramaStoryGenerationRuntime.ts`: `admitStoryGenerationRun`, `transitionStoryGenerationRun`, `finalizeStoryGeneration` | Make the Feature 152 adapter consume the generalized assurance repository. Retain its public API and legacy source snapshot, but never treat `StorySourceSnapshot` as a substitute for the complete production context. |
| Story validation/repair | `verticalDramaStoryGenerationValidation.ts`: `buildStoryGenerationContextPack`, `buildStoryPlanAlignmentLedger`, `validateStoryGenerationOutput`; `verticalDramaStoryGenerationRepair.ts`: `planStoryGenerationRepair`; `verticalDramaStoryGenerationAgentAdapter.ts`: current Feature 152 bridge | Keep deterministic validators authoritative. Convert `verticalDramaStoryGenerationAgentAdapter.ts` into a compatibility wrapper over the Section 06 seam; it must not remain a second Agent execution path. |
| Start-frame prompt | `verticalDramaStartFrameGeneration.ts`: `generateStartFrameRenderPlan`, `generateStartFrameShotPrompt`; `verticalDramaShotPromptJobs.ts`: `enqueueVerticalDramaShotPromptJob`, `runVerticalDramaShotPromptJob`; router `verticalDramaEpisodes.generateShotStartFramePrompt` | Bind the prompt to current shot composition, `scene_anchor`, cast/location refs, context, prompt skill/dialect, and model policy. Re-admit in the worker. |
| Reference prompt/image | `generateStartFrameShotPrompt({ referenceFrameMode: true })`; router `generateShotReferenceFramePrompt`, `generateShotReferenceFrameImage`, and `linkShotReference`; `apps/web/shared/verticalDramaSeries/verticalDramaShotReferences.ts` | Keep reference generation distinct from the scene anchor. Persist an accepted prompt hash/ref even when the prompt remains client-visible only; require it before paid reference-image submission. |
| Prompt limits | `verticalDramaPromptQc.ts`: `ensurePromptWithinLimit`, `PromptProtectedFragmentsOverflowError`, `PromptBudgetExceededError` | Provider-bound prompt assurance always uses `failClosed: true`. Lossy truncation may remain for legacy/advisory preview but cannot produce `provider_ready`. |
| Video prompt | `verticalDramaVideoMotionPromptGeneration.ts`: `generateVideoMotionPromptPack`, `generateVerticalDramaShotVideoPrompt`, `generateJudgedVerticalDramaShotVideoPrompt`; `verticalDramaShotVideoPromptJobs.ts`: enqueue/run/recover; router `generateShotVideoPrompt` | Bind exact start-frame asset, ordered reference manifest, shot/dialogue/speaker/position/timing contract, model family, and prompt skill. Preserve established image-grounded vision and judge behavior. |
| Provider video payload | `verticalDramaVideoPromptFormatter.ts`; router `verticalDramaEpisodes.generateVideoClip` | Authorize the final provider-formatted prompt hash and exact model/capability/media refs, not only the editable/base prompt. Any edit or formatting-input drift requires a new assurance attempt. |
| B-roll | `apps/web/shared/verticalDramaSeries/visualSource.ts`: `visualSourceSnapshotSchema`, `visualUsageRef`, `ShotBrollBinding`; `verticalDramaBrollService.ts`: `projectBrollPlacements`, `validateBrollBinding`, `projectBrollTimeline` | Keep existing projection functions and add an assurance validator that maps failures to stable findings, verifies managed storage/rights/current segment revision, and emits a binding-manifest fingerprint. |
| Assembly/export | `apps/web/shared/verticalDramaSeries/assembly.ts`: `VerticalDramaAssemblyManifest`; `verticalDramaAssembly.ts`: `buildAndPersistAssemblyManifest`; `verticalDramaEpisodeVideoAssembly.ts`: `submitAssemblyJob`, `runAssemblyJob`; router `assembleEpisodeVideo` | Gate before queue and again in the worker. Bind exact clip/media/B-roll/audio/subtitle/timeline refs and persist lineage with the immutable manifest/run artifact. |
| Post/season QC | `verticalDramaEpisodeQualityReview.ts`: `runVerticalDramaEpisodeQualityReview`; `verticalDramaQualityLoop.ts`: `runVerticalDramaQualityLoop`; `verticalDramaSeasonQcPasses.ts`: `VD_SEASON_QC_PASSES`, `VD_SEASON_QC_DETERMINISTIC_DISPATCH` | Run deterministic checks first, record findings/accepted refs, and prevent episode/season production readiness while blocking findings or stale constituent artifacts remain. |

## One assurance lineage contract

Add the following additive schemas and helpers to
`apps/web/shared/verticalDramaSeries/assurance.ts`. Section 01 owns the file and
base request/result schemas; Section 07 adds only artifact-lineage contracts.

```ts
export const VerticalDramaAssuredArtifactKindSchema = z.enum([
  "story_architecture",
  "full_story",
  "deep_episode_story",
  "shot_contract",
  "start_frame_prompt",
  "reference_image_prompt",
  "video_motion_prompt_pack",
  "provider_video_prompt",
  "start_frame_media",
  "reference_media",
  "video_media",
  "broll_binding_manifest",
  "assembly_manifest",
  "post_generation_qc",
  "season_qc",
]);

export type VerticalDramaAssuredArtifactKind = z.infer<
  typeof VerticalDramaAssuredArtifactKindSchema
>;

export const VerticalDramaAssuredArtifactRefSchema = z.object({
  kind: VerticalDramaAssuredArtifactKindSchema,
  artifactId: z.string().min(1),
  version: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  semanticRole: z.string().min(1).optional(),
  orderedIndex: z.number().int().nonnegative().optional(),
});

export type VerticalDramaAssuredArtifactRef = z.infer<
  typeof VerticalDramaAssuredArtifactRefSchema
>;

export const VerticalDramaArtifactAssuranceLineageSchema = z.object({
  schemaVersion: z.literal(1),
  executionId: z.string().min(1),
  attemptId: z.string().min(1),
  taskKind: VerticalDramaAssuranceTaskKindSchema,
  contextSnapshotRef: ProductionContextSnapshotRefSchema,
  predecessorRefs: z.array(VerticalDramaAssuredArtifactRefSchema),
  contractVersion: z.string().min(1),
  outputContractVersion: z.string().min(1),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelPolicy: z.string().min(1),
  providerProfileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  promptHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  referenceManifestFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  assuranceMode: VerticalDramaAssuranceModeSchema,
  disposition: VerticalDramaAssuranceDispositionSchema,
  readiness: VerticalDramaAssuranceReadinessSchema,
  findingCodes: z.array(VerticalDramaAssuranceErrorCodeSchema),
  verifiedAt: z.string().datetime(),
});

export type VerticalDramaArtifactAssuranceLineage = z.infer<
  typeof VerticalDramaArtifactAssuranceLineageSchema
>;

export function fingerprintVerticalDramaStageInput(input: {
  taskKind: VerticalDramaAssuranceTaskKind;
  contextSnapshotRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  stageInput: unknown;
}): string;

export function buildVerticalDramaArtifactAssuranceLineage(input: {
  result: VerticalDramaAssuranceResult;
  outputContractVersion: string;
  output: unknown;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  promptHash?: string;
  referenceManifestFingerprint?: string;
  providerProfileHash?: string;
}): VerticalDramaArtifactAssuranceLineage;

export function assertVerticalDramaArtifactLineageCurrent(input: {
  lineage: VerticalDramaArtifactAssuranceLineage;
  expectedContext: ProductionContextSnapshot;
  expectedPredecessors: VerticalDramaAssuredArtifactRef[];
  expectedInputFingerprint: string;
  requiredReadiness: VerticalDramaAssuranceReadiness;
}): void;
```

The exact Section 01 schema symbol names win if implementation renamed one
during an earlier section; update this snippet and all consumers together in
the Section 10 cross-section review. Do not create duplicate local enums.

### Canonicalization rules

`fingerprintVerticalDramaStageInput` must use Section 01's canonical JSON and
hash implementation. It must not hash timestamps, trace IDs, queue IDs,
temporary URLs, provider polling status, or object insertion order.

- `contextSnapshotRef` includes all three immutable identity fields:
  `snapshotId`, `revision`, and `fingerprint`.
- A predecessor ref includes kind, authoritative ID, version, fingerprint,
  semantic role, and ordered index when order changes meaning.
- Character/reference images, start/end frames, subshots, B-roll placements,
  dialogue/audio events, subtitles, and timeline clips are order-sensitive and
  must retain their authoritative order.
- Set-like policy tags and finding codes are sorted before hashing.
- Provider prompt bytes are normalized only by the existing formatter contract;
  the final hash is over the exact submitted string. No trim/rewrite may occur
  after authorization.
- Managed storage identity is hashed by authoritative media asset/file ID,
  version/checksum, tenant, semantic role, and persisted availability—not by a
  signed/provider URL.
- A changed predecessor generates a new stage input fingerprint and stale-fences
  the affected descendants. Unrelated siblings are not invalidated.
- `outputFingerprint` hashes the accepted domain output, not the Agent envelope.

### Persistence projection

The complete lineage lives on the accepted Section 02 attempt/domain reference.
Add only compact optional projections to existing JSONB contracts so current
clients remain compatible:

```ts
assuranceLineage?: VerticalDramaArtifactAssuranceLineage;
```

Add it where the artifact is already owned:

- story bible/architecture candidate and episode story payloads;
- `VerticalDramaStartFramePlan` frame entries and
  `VerticalDramaMotionPromptPack` in
  `apps/web/shared/verticalDramaSeries/contracts.ts`;
- `ShotBrollBinding` or its enclosing binding manifest in
  `apps/web/shared/verticalDramaSeries/visualSource.ts`; and
- `VerticalDramaAssemblyManifest` in
  `apps/web/shared/verticalDramaSeries/assembly.ts`.

Do not copy prompts, story bodies, media bytes, or QC reports into assurance
tables. `vertical_drama_run_artifacts` remains the immutable episode artifact
owner where already used. Story runs and Section 02 accepted-domain references
cover story-level artifacts. Legacy readers ignore the optional projection.

## Server adapter interfaces

Create
`apps/web/server/services/verticalDramaStoryPromptMediaAssurance.ts`. Keep this
as a domain coordinator over existing generators/validators and the Sections
02/03/05/06 seams; it must not contain provider SDK calls or credit SQL.

```ts
export interface VerticalDramaStageAssuranceInput<TStageInput> {
  tenantId: string;
  userId: number;
  domainOwner: VerticalDramaAssuranceDomainOwner;
  taskKind: VerticalDramaAssuranceTaskKind;
  context: ProductionContextSnapshot;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  idempotencyKey: string;
  stageInput: TStageInput;
  boundary: "advisory" | "activation" | "paid" | "export";
}

export interface VerticalDramaStageAssuranceOutput<TOutput> {
  output: TOutput;
  artifactRef: VerticalDramaAssuredArtifactRef;
  lineage: VerticalDramaArtifactAssuranceLineage;
  assurance: VerticalDramaAssuranceResult;
}

export async function runAssuredStoryArchitecture(...): Promise<...>;
export async function runAssuredFullStory(...): Promise<...>;
export async function runAssuredDeepStoryDraft(...): Promise<...>;
export async function runAssuredStartFramePrompt(...): Promise<...>;
export async function runAssuredReferenceImagePrompt(...): Promise<...>;
export async function runAssuredVideoPrompt(...): Promise<...>;
export async function runAssuredBrollAssemblyQc(...): Promise<...>;
export async function runAssuredPostGenerationQc(...): Promise<...>;
export async function runAssuredSeasonQc(...): Promise<...>;

export function fingerprintVerticalDramaReferenceManifest(...): string;
export function validateStartFramePromptContinuity(...): VerticalDramaFinding[];
export function validateReferencePromptContinuity(...): VerticalDramaFinding[];
export function validateVideoPromptContinuity(...): VerticalDramaFinding[];
export function validateBrollAssemblyContinuity(...): VerticalDramaFinding[];
export async function resolveCurrentAssuredPredecessors(...): Promise<...>;
```

Each `runAssured*` function must:

1. load tenant/user/domain ownership server-side;
2. validate Section 05 admission against the supplied immutable context;
3. resolve accepted predecessors from authoritative domain rows and Section 02,
   rejecting caller-invented refs;
4. compute the stage input fingerprint and admit/reuse the durable execution;
5. invoke `executeVerticalDramaAssuranceRuntime`, whose `legacyExecute` calls
   the existing generator/evaluator;
6. apply the existing deterministic domain validator after either Agent or
   legacy output;
7. persist the candidate through the existing content owner;
8. call `assertVerticalDramaDomainFinalGate` for activation, paid, or export
   boundaries; and
9. CAS-accept/link the artifact and append the resulting assurance event.

Advisory calls may return non-ready findings without activation. Active calls
never downgrade a blocking failure into a legacy success. The Agent proposal
cannot supply authoritative IDs; the adapter replaces/validates all refs from
server-loaded state.

## Story architecture and full-story integration

### Architecture and synchronous full story

Wrap, rather than rewrite, `planVerticalDramaStoryArchitecture` and
`generateStoryBible`.

- Build the first story-stage fingerprint from the production context,
  normalized premise/user intent, profile policy, source/canon refs, story
  contract version, model policy, and idempotency key.
- Persist architecture as a candidate before active-story mutation.
- The full-story predecessor is the accepted architecture artifact. It must not
  accept a client-replayed outline with the same visible text but a different
  artifact ID/version/fingerprint.
- Reuse `buildStoryGenerationContextPack`,
  `buildStoryPlanAlignmentLedger`, and `validateStoryGenerationOutput` as
  deterministic post-validators. Agent scores or prose cannot overrule them.
- `finalizeStoryGeneration` remains the Feature 152 compatibility API, but its
  implementation delegates acceptance to Section 02 and must prove the
  current context, accepted predecessor, attempt/fence, candidate hash, and
  expected active story version in one transaction.
- A partial, malformed, or warning-only story may remain a saved candidate but
  cannot become `provider_ready` or `production_ready`.

### Deep generation, extension, and improvement jobs

Extend `VerticalDramaStoryJobPayload`, `VerticalDramaStoryJobRecord`, and
`VerticalDramaStoryJobCheckpoint` additively with optional compact refs:

```ts
assurance?: {
  executionId: string;
  attemptId: string;
  contextSnapshotRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  inputFingerprint: string;
  fenceToken: string;
};
```

The existing `kind` union (`deep_generate`, `extend`, `improve_script`), Redis
keys, result field, progress phases, Thai labels, polling procedure, and resume
checkpoint fields remain unchanged. New active jobs require the envelope;
legacy/flag-off jobs may omit it.

`runVerticalDramaStoryJob` must reload the durable attempt and current context
before each model-call chunk and before final activation. Resume reuses the
same execution/attempt/fingerprint and per-call ordinal. It may continue only
from a checkpoint whose completed episode hashes and accumulated credits match
durable evidence. A mismatch becomes stale/reconciliation state, never a fresh
untracked run. `executeJsonPlanningCallWithRetry` uses Section 03's optional
physical-call hook so retries settle by call ordinal exactly once.

Each accepted deep episode references the accepted full-story artifact plus the
prior authoritative episode/ledger refs required by the existing continuity
validator. Extending the horizon creates descendants; it does not rewrite old
artifact identity. `improve_script` produces candidates and may activate only
episodes whose expected active versions still match.

### Feature 152 compatibility

Keep these public surfaces compiling and behavior-compatible:

- `StorySourceSnapshot`, `StoryGenerationRunContract`, and
  `STORY_GENERATION_CONTRACT_VERSION`;
- `admitStoryGenerationRun`, `transitionStoryGenerationRun`, and
  `finalizeStoryGeneration`; and
- `buildVerticalDramaStoryAssuranceRequest`,
  `verifyVerticalDramaStoryAgentHash`, and
  `buildStoryAgentReplayFingerprint`.

The compatibility adapter must carry both the legacy `StorySourceSnapshot` and
the full context ref when Feature 157 is active. It must not derive missing
profile, rights, visual, or ownership facts from the legacy source snapshot.

## Start-frame and reference prompt/image integration

### Start-frame prompt

`runAssuredStartFramePrompt` wraps `generateStartFrameRenderPlan` and
`generateStartFrameShotPrompt` and requires:

- current episode/scene/shot and accepted story/shot-contract predecessors;
- the approved shot composition lock and current `scene_anchor` asset when the
  shot requires image grounding;
- exact ordered required-character and location-reference assets, including
  managed storage identity and tenant ownership;
- existing image-prompt mode/language/model-family/skill contract; and
- provider prompt limits appropriate to the selected model.

The prompt output is an accepted `start_frame_prompt` artifact. The existing
return fields (`prompt`, `negativePrompt`, `creditsUsed`, `model`, `usedVision`,
`usedMode`, `frameStamp`, and current optional fields) remain unchanged; routers
may add only optional `assurance` summary/ref fields in Section 08.

Extend `verticalDramaShotPromptJobs.ts` payload/result records with the same
optional compact assurance envelope used above and include it in the existing
request fingerprint. Admission occurs at enqueue and again in
`runVerticalDramaShotPromptJob`. Redis is only delivery/progress state; loss or
redelivery resolves the Section 02 attempt instead of generating a new lineage.

### Reference-image prompt and media

`runAssuredReferenceImagePrompt` uses the existing
`generateStartFrameShotPrompt({ referenceFrameMode: true })`; it does not
invent a second prompt engine. Its predecessor set includes the current scene
anchor/start-frame plan, shot contract, selected reference role, and exact
source/reference assets.

The semantic-role rules are strict:

- `scene_anchor` is the composition/start-frame authority;
- `reference` is supplementary image guidance;
- `b_roll_still` and `b_roll_footage` are timeline insert sources; and
- a reference-image result cannot overwrite, masquerade as, or silently become
  the scene anchor.

`generateShotReferenceFramePrompt` may still return a synchronous prompt, but
the active path must first record its accepted prompt hash and domain ref. Then
`generateShotReferenceFrameImage` loads that exact accepted ref, calls the
Section 03 final gate, atomically claims authorization, and delegates to the
existing media-generation owner. `linkShotReference` stores/links the resulting
managed asset with the accepted lineage ref; it does not persist a provider URL
as durable evidence.

`generateStartFrameImage` follows the same rule for the accepted
`start_frame_prompt`. Provider success is not enough: the output becomes a
`start_frame_media`/`reference_media` accepted artifact only after the managed
asset exists, tenant ownership and checksum/version are proven, billing is
known, and the provider task is reconciled.

For every provider-bound image/reference prompt, call
`ensurePromptWithinLimit({ ..., failClosed: true })`. Existing advisory preview
may preserve current truncation behavior under flags-off/legacy mode, but a
truncated or unresolved prompt records `not_ready` and cannot authorize media.

## Video prompt and provider-video integration

`runAssuredVideoPrompt` wraps the existing motion-pack, shot-video prompt, and
judge functions. It must preserve current image-grounded vision, character
portrait grounding, motion/dialogue/protected blocks, speaker-switch logic,
silent-listener rules, and closed-mouth constraints.

The input fingerprint includes:

- accepted shot/story and exact start-frame media artifact;
- ordered character/location/reference manifest, with semantic roles and
  managed-asset versions/checksums;
- authoritative `frame_analysis.people[].position` and the established cast
  represented by `requiredCharacterRefs`;
- shot duration, subshot order, camera/motion/dialogue/action/timing, speaker,
  language, safety, and negative-prompt contracts;
- model family/capability, prompt budget, skill file content hash, judge policy,
  and final formatter version.

`fingerprintVerticalDramaReferenceManifest` must preserve ordering and role;
deduplicating, sorting by URL, or trimming to provider limits occurs only in the
existing deterministic capability adapter and must be represented in the final
provider input. If provider limits remove a required reference, the gate fails
with an actionable finding; it must not silently claim equivalent grounding.

Extend `verticalDramaShotVideoPromptJobs.ts` payload/result/recovery records
additively with execution/attempt/context/predecessor/input-fingerprint/fence
refs. Enqueue and worker admission are both required. Recovery resolves the
original durable attempt and provider-call ordinals; it never mints a new
attempt solely because Redis state expired.

The editable `video_motion_prompt_pack` and provider-formatted prompt are two
distinct assured artifacts. Immediately before `generateVideoClip` submits:

1. reload current context and exact media/reference manifest;
2. call `verticalDramaVideoPromptFormatter.ts` once for the selected provider;
3. compute `provider_video_prompt` over the exact formatted bytes, model,
   capability, start-frame asset, ordered references, duration/aspect/size, and
   provider options;
4. run fail-closed prompt budget/capability/safety checks;
5. call `assertVerticalDramaDomainFinalGate` for boundary `paid`; and
6. atomically claim the one-time authorization before invoking the existing
   media submission owner.

No code may mutate the prompt or reference list between steps 3 and 6. A user
edit, formatter-policy update, media replacement, model switch, or reference
trim changes the input hash and requires a new assured provider prompt and
authorization. Unknown provider acceptance enters `reconciliation_required`;
it does not resubmit or auto-refund.

Keep uppercase/lowercase skill mirrors byte-identical. At minimum this applies
to:

- `apps/web/skills/vertical-drama-shot-video-prompt/{SKILL.md,skill.md}`;
- `apps/web/skills/vertical-drama-shot-video-prompt-subshots/{SKILL.md,skill.md}`;
- `apps/web/skills/vertical-drama-video-motion-prompt-pack/{SKILL.md,skill.md}`;
- `apps/web/skills/vertical-drama-video-prompt-judge/{SKILL.md,skill.md}`; and
- any start-frame prompt pair changed by implementation.

## Media, B-roll, assembly, post-QC, and season continuity

### Managed media and B-roll bindings

Do not use provider URLs as availability proof. Every assured media ref must
resolve through the existing managed storage path, retain tenant/user ownership,
and pass Section 05 admission immediately before paid use and production use.

Keep `validateBrollBinding` backward compatible. Add
`validateBrollAssemblyContinuity` as the Feature 157 aggregate validator. It
must validate:

- current visual-source snapshot revision/fingerprint;
- exact B-roll source/segment ID and revision;
- semantic role, rights/disclosure state, managed-storage existence/checksum,
  crop/aspect constraints, source audio policy, and permitted duration;
- shot/scene destination, ordered timeline range, overlap/gap policy, and
  consistency with `projectBrollPlacements`/`projectBrollTimeline`; and
- context and predecessor lineage for every start-frame/video/B-roll asset.

The accepted output is a `broll_binding_manifest` with one canonical
fingerprint. Existing `ShotBrollBinding` fields remain readable; the assurance
lineage is optional/additive. Raw `TRPCError` from a low-level validator is
mapped at the adapter boundary to the stable assurance finding/error contract.

### Assembly and export

`buildAndPersistAssemblyManifest` remains the manifest writer and
`submitAssemblyJob`/`runAssemblyJob` remain render orchestration owners.
Feature 157 adds an `assembly_manifest` lineage projection and gates:

- before `assembleEpisodeVideo` queues work;
- after worker lease/fence claim and before render submission; and
- after render/import and before marking production-ready/exportable.

The assembly fingerprint includes every ordered clip/media artifact, B-roll
binding and source segment revision, transition/timeline value, dialogue audio,
subtitle/caption input, duration, crop/aspect, render engine/profile, and
context/predecessor fingerprint. The existing rule that B-roll requires the
supported Remotion path remains authoritative. A provider/render output is not
production-ready until the managed final asset exists and provider/credit state
is reconciled.

### Post-generation and season QC

`runVerticalDramaEpisodeQualityReview`, `runVerticalDramaQualityLoop`, and the
deterministic dispatch in `verticalDramaSeasonQcPasses.ts` execute against
accepted artifact refs, not mutable client payloads. Deterministic checks run
before any optional Agent critique. Agent prose is evidence only; stable
finding codes and readiness come from Node validators.

`post_generation_qc` fingerprints the exact assembly/final-media artifact and
QC policy. `season_qc` fingerprints the ordered accepted episode/story/post-QC
refs and season policy. Missing, stale, unverified, or blocking episode results
prevent `production_ready`; a partially complete season may still be viewed,
edited, or retried. Re-QC with unchanged inputs is idempotent. A changed episode
invalidates the season result without invalidating unrelated accepted episode
artifacts.

## Admission, billing, final-gate, and bypass rules

The adapter must enforce these boundaries regardless of router/UI behavior:

| Boundary | Required assurance | Side effects allowed |
| --- | --- | --- |
| `advisory` | Authenticated owner, valid context and available predecessors | Candidate/findings only; no activation, paid provider, or export. |
| `activation` | Current attempt/fence, deterministic validation, expected active version, no blocking finding | Existing content-owner CAS only. |
| `paid` | `provider_ready`, exact prompt/media/model/capability hashes, settled prior calls, sufficient reservation, claimable Section 03 authorization | One registered/authorized provider effect through the existing media owner. |
| `export` | `production_ready`, durable managed artifacts, current timeline/rights/disclosure/context, known provider and credit outcomes | Existing assembly/export activation only. |

Required bypass tests inject spies at the existing generator, credit, media,
provider, CAS, and render seams. On missing/stale context, predecessor mismatch,
prompt budget failure, unresolved rights, unknown provider outcome, or invalid
authorization, assertions must prove zero downstream side effects. A router,
worker, retry helper, or legacy Feature 152 wrapper may not call Agent Runtime or
a paid provider directly when an active Feature 157 flag applies.

Billing ownership is fixed:

- story/prompt adapters settle their model calls through Section 03 hooks;
- media generation keeps existing media reservation/draw/refund ownership;
- assembly/render keeps its existing billing owner; and
- this coordinator stores references only and never debits/refunds directly.

## Stable errors and user actions

Extend Section 01's closed error-code schema once; do not create free-form stage
errors. Prefer an existing equivalent code where Section 01/03/05 already owns
one. Add only missing codes below:

| Code | State/readiness | Stable next action | Behavior |
| --- | --- | --- | --- |
| `VD_ASSURANCE_PREDECESSOR_MISSING` | `awaiting_action` / `not_ready` | `rerun_previous_stage` | No generator/provider/CAS call. |
| `VD_ASSURANCE_PREDECESSOR_STALE` | `stale` / `not_ready` | `refresh_context_and_retry` | Preserve old artifact for inspection; create a new attempt only after recapture. |
| `VD_ASSURANCE_STAGE_INPUT_MISMATCH` | `stale` / `not_ready` | `retry_with_current_inputs` | Reject caller refs or queue payload that disagree with authoritative state. |
| `VD_ASSURANCE_SCENE_ANCHOR_REQUIRED` | `awaiting_action` / `not_ready` | `generate_or_select_start_frame` | Reference/B-roll cannot substitute for the anchor. |
| `VD_ASSURANCE_REFERENCE_ROLE_CONFLICT` | `awaiting_action` / `not_ready` | `fix_reference_role` | Do not relink or submit media. |
| `VD_ASSURANCE_PROMPT_BUDGET_EXCEEDED` | `awaiting_action` / `not_ready` | `edit_prompt_or_change_model` | Map existing prompt overflow/budget exceptions; no lossy provider-ready result. |
| `VD_ASSURANCE_REFERENCE_MANIFEST_MISMATCH` | `stale` / `not_ready` | `regenerate_prompt` | Rebuild prompt and authorization from the exact refs. |
| `VD_ASSURANCE_SPEAKER_POSITION_DRIFT` | `awaiting_action` / `not_ready` | `review_shot_blocking` | Preserve current position/speaker evidence; do not infer replacement positions. |
| `VD_ASSURANCE_MEDIA_NOT_DURABLE` | `awaiting_action` / `not_ready` | `import_or_regenerate_media` | Provider URL/task alone is insufficient. |
| `VD_ASSURANCE_BROLL_BINDING_STALE` | `stale` / `not_ready` | `review_broll_bindings` | No assembly submission. |
| `VD_ASSURANCE_ASSEMBLY_NOT_READY` | `awaiting_action` / `not_ready` | `resolve_assembly_findings` | No production activation/export. |
| `VD_ASSURANCE_STORY_INCOMPLETE` | `awaiting_action` / `not_ready` | `complete_or_repair_story` | Candidate remains editable; active/production state unchanged. |
| `VD_ASSURANCE_SEASON_QC_BLOCKED` | `awaiting_action` / `not_ready` | `review_season_findings` | Preserve episode results and block only season readiness. |

Transient runtime/transport failures use Section 01's retryable failure code and
the original durable attempt. Possible provider acceptance or unknown billing
uses Section 03's `reconciliation_required` code/action. Ownership, tenant,
schema, or impossible persistence failures use the existing fatal mapping.
Routers return the established TRPC status plus the stable code/action payload;
raw provider/Agent text and prompts are not exposed as errors.

## Feature flags and compatibility behavior

Use only the canonical Section 01 flags, all defaulting to `false`:

- `verticalDramaStoryAssuranceActive` for story architecture/full/deep/season;
- `verticalDramaPromptQcOrchestraActive` for start/reference/video prompt and
  media/B-roll/assembly lineage gates;
- `verticalDramaAssuranceShadow` for side-effect-free comparison; and
- `verticalDramaAssuranceKillSwitch` as the highest-precedence override.

Do not add `verticalDramaStorySeasonOrchestraActive` or any alias. Section 06's
draft wording that used that name must be normalized to the Section 01
canonical flag during implementation/cross-section review.

Existing environment switches
`VERTICAL_DRAMA_STORY_ASSURANCE` and
`VERTICAL_DRAMA_STORY_AGENTS_RUNTIME` remain legacy compatibility inputs while
their callers are migrated. They cannot override the kill switch, tenant
ownership, profile admission, final gate, or one-time authorization. Remove
neither switch in this section.

Selection precedence is:

1. kill switch: deterministic legacy execution where safe;
2. task-specific tenant active flag: enforced lineage and active runtime mode;
3. shadow flag: durable comparison with no extra paid provider call, activation,
   or user charge; and
4. legacy deterministic behavior.

The kill switch does not turn an unverified legacy artifact into paid/export
authorization. Advisory/edit/save/preview may fall back; unsafe paid or export
transitions remain blocked unless the exact lineage can be proven without the
Agent path.

Compatibility requirements:

- no route/procedure name, input field, existing required output field, wizard
  route/step ID, job kind/status, or polling cadence changes;
- optional `assurance` metadata is additive and omitted for legacy rows;
- existing prompt editing remains available, but an edit invalidates paid
  readiness until re-assured;
- existing saved story/prompt/media remains visible and editable;
- no new UI status is required by this section; Section 08 maps the common
  state/disposition/readiness/action contract into current components; and
- flag-off tests compare legacy output and provider payloads exactly, not merely
  snapshots that ignore fields.

Legacy artifacts without full lineage project as `legacy_unverified`. They may
be inspected, edited, copied into a new candidate, or previewed, but cannot be
silently promoted to newly enforced paid/production readiness.

## Database and migration decision

Section 07 creates no migration and no table. It depends on Section 02's actual
successor migration for generalized attempts/events and accepted-domain refs,
then uses existing content JSONB and `vertical_drama_run_artifacts` for additive
lineage projections.

The planning draft originally named `0240_vertical_drama_assurance_attempts_reconciliation.sql`,
but the current repository journal already reaches
`0244_vertical_drama_prompt_expansion`. Implementation must not create or
overwrite a stale `0240` migration. Section 02 must reserve the next free,
journal-consistent migration number at implementation time before Section 07
begins; it is `0245_vertical_drama_assurance_attempts_reconciliation.sql` in
this snapshot. Section 07 verifies that prerequisite; it does not renumber
another section's migration.

No broad backfill is allowed. A legacy artifact may receive a lineage link only
when tenant/user/domain ownership, exact content/prompt/media hash, source and
context fingerprint, version, and accepted durable domain reference can all be
proven. Otherwise retain `legacy_unverified`; never infer ownership, context,
rights, score, or predecessor refs. If accepted-ref lookup needs an index, add
that index to Section 02's actual successor migration before rollout rather
than creating another artifact table here.

## TDD-first implementation plan

Write failing tests in the order below. Each implementation step stops at the
smallest code needed to make its focused tests pass. Provider/credit/render
tests use injected fakes and spend no real credit.

### 1. Freeze shared lineage and canonical hashing

Create
`apps/web/shared/verticalDramaSeries/__tests__/assuranceArtifacts.test.ts`.
Prove:

- schema parse/reject cases and canonical key-order independence;
- context identity participates in every stage fingerprint;
- ordered reference/timeline changes alter the hash;
- set-like finding/policy order does not alter the hash;
- changing one predecessor stale-fences only descendants;
- exact provider prompt bytes, formatter version, model, and reference manifest
  affect the provider prompt hash; and
- provider URLs, timestamps, trace IDs, and queue IDs do not affect identity.

Then add the schemas/helpers to `assurance.ts` and optional JSONB contract fields.

### 2. Build the pure domain coordinator and bypass tests

Create
`apps/web/server/services/__tests__/verticalDramaStoryPromptMediaAssurance.test.ts`
before `verticalDramaStoryPromptMediaAssurance.ts`. Use dependency injection for
context/admission, durable attempt, generator, validator, persistence, final
gate, CAS, provider, and billing seams.

Test successful legacy, shadow, active advisory, activation, paid, and export
flows. Test every stable failure class and assert zero inappropriate calls.
Test Agent invalid output falling through deterministic post-validation, safe
legacy fallback where Section 06 permits it, and no fallback across a paid
unknown-outcome or failed final gate.

### 3. Adapt story architecture/full/deep flows

Extend focused suites:

- `verticalDramaStoryArchitecturePlanner.runtime.test.ts`;
- `verticalDramaStoryGenerationContracts.test.ts`;
- `verticalDramaStoryGenerationRuntime.test.ts`;
- `verticalDramaStoryGenerationValidation.test.ts`;
- `verticalDramaStoryGenerationAgentAdapter.test.ts`;
- `verticalDramaStoryBible.productionGradeFullStory.test.ts`;
- `verticalDramaStoryBible.deepStoryDrafts.test.ts`;
- `verticalDramaStoryJobs.test.ts`; and
- `apps/web/server/routers/__tests__/verticalDramaSeries.deepStoryDrafts.test.ts`.

Red tests must cover candidate-before-activation, stale active-version CAS,
context/predecessor mismatch, incomplete story, episode continuity, chunk retry
settlement, worker redelivery, checkpoint mismatch, and flag-off response/progress
compatibility. Implement wrappers and compatibility delegation only after these
tests fail for the intended reason.

### 4. Adapt start-frame and reference prompt/image flows

Extend:

- `verticalDramaStartFrameGeneration.test.ts`;
- `verticalDramaStartFrameGeneration.sceneAnchorVision.test.ts`;
- `verticalDramaStartFrameGeneration.referenceFrameMode.test.ts`;
- `verticalDramaPromptQc.test.ts`;
- `verticalDramaShotPromptJobs.test.ts`;
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts`;
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts`; and
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`.

Prove exact anchor/reference roles, tenant-safe managed refs, prompt-hash
binding, enqueue/worker double admission, fail-closed provider prompt budget,
zero charge/provider call on failure, one authorized media effect on redelivery,
and preserved legacy response fields.

### 5. Adapt video prompt and provider payload

Extend:

- `verticalDramaVideoMotionPromptGeneration.test.ts`;
- `verticalDramaShotVideoPromptGeneration.test.ts`;
- `verticalDramaJudgedShotVideoPromptGeneration.test.ts`;
- `verticalDramaShotVideoPromptJobs.test.ts`;
- `verticalDramaVideoPromptFormatter.test.ts`;
- `apps/web/shared/verticalDramaSeries/__tests__/videoPromptMotionAssurance.test.ts`;
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts`; and
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`.

Use fixtures with multiple characters and asymmetric positions. Prove exact
start-frame/reference grounding, speaker versus silent listener behavior,
closed-mouth constraints, ordered refs, provider trimming failure for required
refs, prompt edit/model switch invalidation, exact final formatter hash,
authorization-before-provider ordering, unknown-outcome reconciliation, and
skill mirror parity.

### 6. Adapt B-roll, assembly, post-QC, and season QC

Extend:

- `verticalDramaBrollService.test.ts`;
- `verticalDramaAssembly.test.ts`;
- `verticalDramaEpisodeVideoAssembly.test.ts`;
- `verticalDramaProductionEpisodeAssembly.test.ts`;
- `verticalDramaSeasonQcPasses.test.ts`;
- `apps/web/shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts`;
- `apps/web/server/services/__tests__/queueVerticalDramaFfmpegAssemblyJob.test.ts`;
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts`; and
- `apps/web/server/routers/__tests__/verticalDramaSeries.assembleSeasonVideos.test.ts`.

Cover current segment revision, rights/storage/audio/crop/timeline, B-roll
forcing the supported render path, queue/worker double gate, managed final
asset requirement, post-QC blocking findings, ordered season refs, idempotent
re-QC, and one-episode invalidation without unrelated episode churn.

### 7. Run the full thirteen-profile and adversarial matrix

Create one reusable fixture module at
`apps/web/server/services/__tests__/fixtures/verticalDramaAssuranceProfiles.ts`
from Section 05's authoritative thirteen-profile registry. Do not copy policy
logic into fixtures. For every profile run at least one story, prompt, and media
admission assertion, including required/optional/no-source cases, unresolved
rights/disclosure, wrong semantic roles, missing managed media, cross-tenant
refs, stale context, and a current happy path.

Add retry/crash cases for:

- Redis record missing while durable attempt exists;
- worker crash before model call, after model usage, after provider acceptance,
  after managed import, and before domain CAS;
- repeated enqueue with the same and conflicting idempotency keys;
- stale fence after user edit; and
- provider response loss with recovered task ID.

## Implementation sequence and file ownership

1. Reconcile Section 01/06 symbol and flag names; verify Section 02's actual
   migration/journal state and Sections 03/05/06 tests.
2. Add red shared lineage tests, then implement shared contracts/helpers.
3. Add red coordinator/bypass tests, then implement
   `verticalDramaStoryPromptMediaAssurance.ts`.
4. Adapt story compatibility wrappers and job envelopes; run story suites.
5. Adapt start/reference prompt jobs and paid image boundaries; run image suites.
6. Adapt video prompt jobs and final formatted provider boundary; run video
   suites and skill parity checks.
7. Adapt B-roll/assembly/post/season QC; run render/QC suites.
8. Run the thirteen-profile, retry/reconciliation, flag-off, and changed-file
   checks; hand the additive API projection to Section 08 and production proof
   to Section 10.

Keep shared-file writers sequential. In particular, Sections 01/06/07 must not
edit `verticalDramaAssuranceAdapter.ts` concurrently, and prompt/media router
changes must be integrated with existing unrelated dirty work by owned hunks
only.

## Rollout, rollback, and observability

Rollout is gated and reversible:

1. Deploy shared readers, optional lineage fields, coordinator, and job envelope
   compatibility with all Feature 157 flags off.
2. Enable shadow for an internal tenant allowlist. Record durable comparisons
   but issue no extra paid provider calls, activations, exports, or charges.
3. Compare legacy/assured output fingerprints, deterministic findings, fallback
   reasons, stale rates, attempt reuse, call settlement, and queue recovery.
4. Canary story assurance separately. Canary prompt/media as one chain—do not
   enable video paid gating without start/reference lineage and final formatter
   binding.
5. Enable B-roll/assembly/post/season gates only after all predecessor stages
   have current lineage and Section 10 restart/provider/browser evidence passes.
6. Expand by tenant/profile/model with explicit readiness and reconciliation
   thresholds owned by Section 09.

Emit only refs/hashes and bounded metadata to events/traces: task/stage,
execution/attempt, context/input/output/predecessor fingerprints, readiness,
finding codes, fallback reason, call ordinal/provider call ID, and latency.
Never log story/prompt bodies, signed URLs, authorization tokens, secrets, or
raw provider/Agent payloads.

Rollback sets the task flags false or activates the kill switch. Preserve all
attempts, events, lineage, media, reservations, provider tasks, and candidates.
Do not delete evidence, rewrite accepted refs, resubmit uncertain provider work,
or issue blanket refunds. Flag rollback restores legacy advisory/editing flow;
paid/export work with uncertain or unproven lineage remains blocked and enters
the existing reconciliation/operator path.

## Acceptance criteria

- [ ] Every active story/prompt/media/B-roll/assembly/QC artifact carries the
      same current context ref and a deterministic predecessor chain.
- [ ] Architecture/full/deep story activation uses existing validators plus a
      fenced expected-version CAS; incomplete/stale candidates remain editable
      but do not become active/ready.
- [ ] Story jobs retain current kinds, progress, polling, resume, and result UX
      while durable attempts survive Redis loss and worker redelivery.
- [ ] Start-frame and reference prompts preserve existing generation behavior,
      enforce semantic roles, and bind paid image submission to the exact
      accepted fail-closed prompt.
- [ ] Video assurance binds exact start frame, ordered references, cast/speaker/
      position/timing contract, formatter bytes, model capability, and provider
      options before one-time authorization.
- [ ] No prompt/media mutation occurs between final hash and provider dispatch;
      changed inputs require a new attempt/authorization.
- [ ] Managed storage—not provider URL—is required for accepted media and
      production readiness.
- [ ] B-roll, assembly, post-QC, and season-QC validators reject stale bindings
      and preserve exact timeline/artifact order.
- [ ] Missing/stale/unauthorized/reconciliation cases cause zero unintended
      generator, CAS, charge, provider, render, or export side effects.
- [ ] Model/provider retries settle per physical call exactly once; uncertain
      outcomes never auto-resubmit or auto-refund.
- [ ] All thirteen profiles pass their admission matrix, including rights,
      disclosure, semantic-role, managed-media, and cross-tenant failures.
- [ ] Feature flags default off; flag-off API/job/provider payload behavior is
      compatible and current edit/save/preview UX remains available.
- [ ] No Section 07 migration/table or blind legacy backfill is introduced.
- [ ] Focused tests pass; any baseline-wide typecheck/OOM noise, live provider,
      migration, Redis restart, browser, deployment, and production evidence is
      reported separately rather than inferred.

## Verification commands

Run from `/home/dev/projects/SmartSpecPro`.

```bash
npm --workspace apps/web test -- \
  shared/verticalDramaSeries/__tests__/assuranceArtifacts.test.ts \
  server/services/__tests__/verticalDramaStoryPromptMediaAssurance.test.ts \
  server/services/__tests__/verticalDramaStoryArchitecturePlanner.runtime.test.ts \
  server/services/__tests__/verticalDramaStoryGenerationContracts.test.ts \
  server/services/__tests__/verticalDramaStoryGenerationRuntime.test.ts \
  server/services/__tests__/verticalDramaStoryGenerationValidation.test.ts \
  server/services/__tests__/verticalDramaStoryGenerationAgentAdapter.test.ts \
  server/services/__tests__/verticalDramaStoryBible.productionGradeFullStory.test.ts \
  server/services/__tests__/verticalDramaStoryBible.deepStoryDrafts.test.ts \
  server/services/__tests__/verticalDramaStoryJobs.test.ts \
  --run
```

```bash
npm --workspace apps/web test -- \
  server/services/__tests__/verticalDramaStartFrameGeneration.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.sceneAnchorVision.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.referenceFrameMode.test.ts \
  server/services/__tests__/verticalDramaPromptQc.test.ts \
  server/services/__tests__/verticalDramaShotPromptJobs.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotStartFramePrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts \
  --run
```

```bash
npm --workspace apps/web test -- \
  shared/verticalDramaSeries/__tests__/videoPromptMotionAssurance.test.ts \
  server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaJudgedShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts \
  server/services/__tests__/verticalDramaVideoPromptFormatter.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts \
  --run
```

```bash
npm --workspace apps/web test -- \
  shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts \
  server/services/__tests__/verticalDramaBrollService.test.ts \
  server/services/__tests__/verticalDramaAssembly.test.ts \
  server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts \
  server/services/__tests__/verticalDramaProductionEpisodeAssembly.test.ts \
  server/services/__tests__/verticalDramaSeasonQcPasses.test.ts \
  server/services/__tests__/queueVerticalDramaFfmpegAssemblyJob.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts \
  server/routers/__tests__/verticalDramaSeries.assembleSeasonVideos.test.ts \
  --run
```

```bash
cmp -s apps/web/skills/vertical-drama-shot-video-prompt/SKILL.md apps/web/skills/vertical-drama-shot-video-prompt/skill.md
cmp -s apps/web/skills/vertical-drama-shot-video-prompt-subshots/SKILL.md apps/web/skills/vertical-drama-shot-video-prompt-subshots/skill.md
cmp -s apps/web/skills/vertical-drama-video-motion-prompt-pack/SKILL.md apps/web/skills/vertical-drama-video-motion-prompt-pack/skill.md
cmp -s apps/web/skills/vertical-drama-video-prompt-judge/SKILL.md apps/web/skills/vertical-drama-video-prompt-judge/skill.md
```

```bash
npx prettier --check \
  apps/web/shared/verticalDramaSeries/assurance.ts \
  apps/web/server/services/verticalDramaStoryPromptMediaAssurance.ts
git diff --check -- \
  apps/web/shared/verticalDramaSeries \
  apps/web/server/services \
  apps/web/server/routers/verticalDramaSeries.ts \
  apps/web/server/routers/verticalDramaEpisodes.ts
```

Run `npm --workspace apps/web run check` as a broader diagnostic only after the
focused suites. Report pre-existing/baseline errors and memory/OOM separately.
Focused Vitest success does not prove migration application, live Redis restart,
provider idempotency, managed-storage durability, browser UX, deployment, or
production readiness; Sections 09 and 10 must collect those artifacts.

## UI/UX Contract

### Target User / JTBD

Creators move from outline to full story, start frame/reference, video prompt, and B-roll without re-entering context or mixing revisions.

### Surface Inventory

Existing story, prompt, image, video, attachment, B-roll, preview, and render surfaces remain the entry points; lineage is additive and inspectable.

### Component Map

Each adapter consumes and emits the shared context/fingerprint chain and maps findings to the common status/action projection. Existing routes remain.

### State Matrix

Every stage distinguishes loading, draft, verified, stale, needs repair, provider-ready, and production-ready. Stale upstream artifacts cannot be silently used.

### Responsive Matrix

Long prompts, source cards, B-roll bindings, and media errors wrap at 360x800, 390x844, 768x1024, and 1440x900.

### Accessibility Acceptance

Prompt/media lineage and source roles have accessible labels, keyboard-safe retry/repair, and generation progress/error announcements.

### Copy Contract

Localized copy identifies the exact upstream stage/version and next action; provider URLs and rights assertions are not invented.

### Browser Evidence Required

Section 10 proves one coherent context/fingerprint chain across outline, full story, start frame, reference, video prompt, video task, and B-roll assembly.
