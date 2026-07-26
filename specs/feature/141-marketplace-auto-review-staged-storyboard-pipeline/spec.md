# Feature 141: Marketplace Auto Review — Staged Story Arc, Image, And Video Prompt Pipeline

Version: 1.3.0

Date: 2026-07-26

Status: Implemented in working tree — production/browser/live-credit validation pending

Last reviewed against checkout: 2026-07-26

Supersedes for new runs:
- Feature 136 `product-review-sequential-storyboard` monolithic authoring path

Depends-on:
- Feature 118 Marketplace Auto Review Create Storyboard And Video Review Auto
- Feature 119 HyperFrames Marketplace Auto Review Render Adapter
- Feature 122 Video Segment Planner Multi Shot Storyboard Review
- Feature 136 Marketplace Auto Review Sequential Shot Storyboard

Related:
- Feature 117 Production Director Agents SDK Auto Storyboard And Video
- Feature 128 Age-Aware Safety Policy
- Feature 131 Vertical Drama Series Storyboard Video Flow
- Feature 132 Vertical Drama Story Character Quality Engine
- Feature 137 Vertical Drama Identity-Stable I2V Pipeline
- Feature 138 Vertical Drama Scene Continuity Engine
- Feature 140 Vertical Drama Shot Fact Continuity

Audience: Product, Frontend, Backend, Skills, Media Runtime, QA, Operations

Primary implementation surfaces:
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/productReviewSequentialStoryboardSkillRunner.ts`
- `apps/web/shared/marketplaceAutoReview/contracts.ts`
- `apps/web/shared/marketplaceAutoReview/stagedContracts.ts`
- `apps/web/server/services/marketplaceAutoReviewStagedPipelineService.ts`
- `apps/web/server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/drizzle/schema.ts` (reuse runs/stages/attempts/outbox/artifacts)
- `apps/web/client/src/components/marketplaceCapture/AutoReviewPlanReviewPanel.tsx`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/skills/`
- `apps/web/client/src/pages/MarketplaceAutoReviewWorkflowPage.tsx`
- `apps/web/client/src/components/marketplaceCapture/StagedCheckpointReviewSurface.tsx`

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.8.0 | 2026-07-26 | Added the Job Setup product-reference picker contract: users can choose the Product Anchor and sequential supporting images/angle labels in the new UI, with the selection carried into plan/start reference anchors without mutating Product Detail images. |
| 1.7.0 | 2026-07-26 | Added the multi-job navigator contract: Job Setup and Job Workbench list every run for the selected product, support opening historical runs, keep new-job creation separate from resume, and label staged checkpoint holds as waiting for user review rather than active generation. |
| 1.6.0 | 2026-07-26 | Closed the Storyboard Review paid-render bypass: staged runs now require an approved/consumed `final_assembly` checkpoint before HyperFrames Final Composite can be queued; the UI disables the render action until that gate is satisfied. |
| 1.5.0 | 2026-07-26 | Closed the staged cancellation safety gap: Job Workbench cancellation now persists provider-cancel intent and reconciles/refunds in-flight staged image/video/audio tasks without refunding completed artifacts; Product Detail no longer renders the embedded review/timeline controls. |
| 1.4.0 | 2026-07-26 | Recorded the implemented Product Detail → Job Setup → Job Workbench separation, shot-local repair contract, and per-shot `video_result` review gate. Code/test proof is complete in the working tree; browser, provider-credit, rollout, and deployment evidence remain release gates. |
| 1.2.0 | 2026-07-26 | Clarified the boundary with the already-shipped mandatory legacy plan-review gate, added the concrete v2 persistence/artifact contract, explicit gate/error acceptance criteria, and rollout proof requirements. Feature 141 remains future work and is not represented as deployed. |
| 1.3.0 | 2026-07-26 | Made human approval mandatory before every downstream credit-bearing stage, including per-shot prompt/result checkpoints and audio/final assembly gates. |
| 1.1.0 | 2026-07-24 | Aligned image authoring with the proven Vertical Drama synopsis-direct pattern: reference mapping plus the approved story summary verbatim, with only a compact strict product-preservation clause when a product may appear. Added Nano Banana 2 capability handling and product-fidelity QA requirements. |
| 1.0.0 | 2026-07-24 | Initial staged-pipeline specification after production evidence showed the Feature 136 monolithic skill exhausting its output limit and charging for three unusable full-pack responses. |

---

## 1. Executive summary

Feature 136 asks one LLM invocation contract to perform evidence analysis,
claim selection, global story planning, nine-shot authoring, nine image prompts,
nine video prompts, per-shot claim traces, per-shot QC, candidate scoring, loop
reports, and final QC in one JSON response. The production incident examined on
2026-07-24 proved that this contract is not operationally sound:

- the selected model received approximately 14,000 input tokens per round;
- every failed round consumed the full 8,000-token output allowance;
- round 1 returned only `skillVersion` and `evidenceProfile`, with the required
  `shots`, `loopReport`, and `finalQc` still absent;
- rounds 2 and 3 returned truncated or malformed JSON around 26,000-28,000
  characters;
- the three unusable rounds consumed 188 user credits;
- a controlled diagnostic invocation consumed another 60 credits;
- the current runtime does not persist enough provider diagnostics to recover
  the complete raw response and `finish_reason` after the fact;
- unit tests passed because they validated schemas, fixtures, and mocked
  execution rather than proving that the selected production model could
  complete the real contract within its output allowance.

This feature replaces that monolithic authoring design for new Marketplace Auto
Review sequential runs with a staged pipeline:

1. A compact **Story Arc Planner skill** sees the product evidence and selected
   references, plans one coherent 90-second review, and returns exactly nine
   10-second shot briefs with continuous Thai dialogue.
2. TypeScript compiles each start-frame image request deterministically using
   the Vertical Drama synopsis-direct pattern: reference mapping plus the
   approved story summary verbatim. When a product may appear, it appends only
   a compact strict product-preservation clause. Composition remains the image
   model's decision. This step requires no separate LLM call.
3. The existing media pipeline generates and validates each shot image.
4. Only after a shot has a validated generated image does a compact
   **Shot Video Director skill** inspect that actual image and author the video
   prompt for that one shot.
5. Image, video-prompt, and video-generation failures retry only the affected
   shot. They never regenerate the full nine-shot plan.

The design follows the same information-timing principle used by Vertical
Drama: first establish story structure, then create/approve visual anchors, then
author motion prompts from the actual anchors. It reduces output size, isolates
failures, improves video-prompt grounding, and makes token/credit usage
observable per stage and per shot.

---

## 2. Product decision

The following decisions are locked for Feature 141:

1. **Two LLM skills, not one monolithic skill.**
   - Skill A plans the complete story and nine shot briefs.
   - Skill B authors one video prompt after the corresponding image exists.

2. **Image generation uses a synopsis-direct model-led prompt.**
   TypeScript sends the story summary almost verbatim with a short reference
   mapping. If a product may appear, it adds only non-negotiable
   product-fidelity constraints. It does not add a style expansion or
   prescribe composition, camera, lens, lighting, exact pose, object
   coordinates, or scene layout. GPT Image 2 or Nano Banana 2 decides how to
   visualize the approved story.

3. **Exactly nine shots, exactly ten seconds each, total ninety seconds.**
   If the selected video model cannot produce a ten-second clip, preflight
   blocks the run before visual spend. The system must not silently change the
   requested duration or fabricate a different shot count.

4. **Plan first, approve once, then spend on images.**
   The plan-review hold remains before `image_generation`.

5. **Video prompts are authored after image generation.**
   A video prompt must be grounded in the actual accepted image for that shot,
   not only in a hypothetical description authored before the image exists.

6. **Credits follow actual provider usage.**
   SmartSpecPro charges the actual OpenRouter/provider-backed usage according to
   the existing pricing system. The prevention mechanism is smaller calls,
   bounded outputs, fail-fast validation, and shot-local retry—not artificial
   refunds for provider work that was actually consumed.

7. **Internal prompt directives are never user-facing content.**
   Anchor locks, SHA values, storage refs, provider instructions, and raw
   product-facts control blocks remain internal.

8. **Every credit-bearing stage has a mandatory human approval checkpoint.**
   The user approves the story plan before prompt compilation continues, approves
   each shot's image prompt before image-provider spend, accepts each generated
   image before the Shot Video Director/video-provider path, approves each video
   prompt before video-provider spend, approves separate TTS/audio work before
   audio-provider spend, and approves the final assembly before render/publish
   spend. No bulk action may bypass per-item approval evidence.

---

## 2.1 Scope boundary with the mandatory plan-review gate

The separate plan in `planning/marketplace-storyboard-text-gate/plan.md` describes a
mandatory safety gate that is already implemented for the current Marketplace Auto
Review stage machine. That gate holds every run before image spend, including legacy
3x3/start-stop and legacy sequential runs. It is a prerequisite safety boundary for
Feature 141, not the Feature 141 staged pipeline itself.

| Run family | Current/requisite plan-review behavior | Feature 141 treatment |
|---|---|---|
| Legacy 3x3/start-stop | Continue using the existing `statusDetail.state=awaiting_plan_review` and legacy display projection. No v2 per-shot state is inferred. | Explicitly out of scope; Feature 141 does not redesign this strategy. |
| Legacy sequential | Continue using the existing gate, legacy `sequentialStoryboard` data, and legacy resume/redraft behavior. | Compatibility only; existing runs remain frozen on their persisted architecture. |
| New staged sequential v2 | Story Arc plan is authored, then held for mandatory approval before any image reservation/provider submission. | This is the only new-run path specified for Feature 141; when implemented, it is selected by a new architecture flag and frozen in run metadata. |

There must be no silent fallback from a v2 run to the Feature 136 authoring path.
Conversely, enabling v2 must not reinterpret a legacy run or make the current gate
optional. The implementation plan must identify the exact dispatch point where the
persisted architecture is read before architecture-specific metadata.

---

## 2.2 Current checkout baseline

The following is a baseline for planning, not Feature 141 completion evidence:

- The legacy gate is implemented through `statusDetail.state=awaiting_plan_review`,
  `metadataJson.planReview`, and a blocked `image_generation` stage while the run
  remains `running`.
- The current legacy router exposes approve, text redraft, cancel, and
  sequential-dialogue edit operations. It does not yet expose the v2 revisioned
  shot editor or v2 architecture dispatch.
- The current checkout contains `marketplaceSequentialStoryboard` (Feature 136)
  but not the two Feature 141 flags or staged skill symbols defined in this spec.
- The legacy plan-review panel still consumes legacy plan metadata; Feature 141's
  typed safe projection and forbidden-marker contract therefore remain required
  implementation work, not an assumption about current UI behavior.
- On 2026-07-26, the focused legacy gate proof ran four suites: 130 tests passed.
  This proves the prerequisite gate wiring only; it does not prove v2 behavior,
  live provider feasibility, or production deployment.

Any later implementation plan must preserve this baseline as a regression suite and
add separate v2 proof rather than relabeling the legacy tests as Feature 141 tests.

---

## 3. Problem statement

### 3.1 The existing contract combines responsibilities that become valid at different times

The current `product-review-sequential-storyboard` skill writes image and video
prompts before any generated image exists. It therefore guesses the image state
that the video model will later receive. When image generation changes pose,
composition, camera angle, visible product parts, hand position, or presenter
placement, the pre-authored video prompt can conflict with the actual frame.

The existing contract also asks the model to self-report deterministic facts
such as prompt character counts and many QC booleans that TypeScript can compute
more reliably and at zero LLM-token cost.

### 3.2 The output schema is structurally detailed but operationally unbounded

The Feature 136 output schema specifies the top-level shape, but:

- contains `additionalProperties: true` at many nested objects;
- has no `maxLength` on text fields;
- has no `maxItems` for multiple evidence, claim, conflict, trace, or candidate
  arrays;
- permits image prompts up to 4,000 characters per shot and video prompts up to
  2,000 characters per shot without defining a total response budget;
- requires the complete object to be returned again on every loop round;
- repeats global video-control text in every shot;
- is referenced by the skill prompt but is not enforced as a provider-level
  structured `response_format` in the current legacy execution call.

The current full-pack runner passes `maxTokens: 8000` directly to the LLM
fallback layer. That value is a static allowance, not a number derived from
`output.schema.json`, a serialized worst-case bound, or the minimum output
needed for nine shots. Setting the ceiling does not itself force an
8,000-token answer, but the broad recursive contract allows the model to keep
writing until it reaches that ceiling. Feature 141 therefore removes the
full-pack response and derives each new skill's allowance from its bounded
schema instead of replacing 8,000 with another unexplained literal.

A compact valid fixture can fit in roughly 10,000 characters, but the contract
also permits outputs many times larger. The production model followed the broad
contract until it exhausted the 8,000-token cap.

### 3.3 Full-pack retries multiply cost without isolating the defect

A structural error in one portion of the response causes the entire pack to be
regenerated. Three rounds repeat the same large system prompt, product context,
references, and full output. A downstream error in a single shot can therefore
cause unrelated valid work to be regenerated and re-billed.

### 3.4 Tests prove code paths but not production feasibility

Current tests cover:

- skill bundle/schema structure;
- fixture validation;
- mocked fallback behavior;
- deterministic preflight rules;
- prompt engine helpers.

They do not provide a mandatory production-model gate proving that a real
vision-capable recommended model can accept representative product evidence and
return a valid full pack in one invocation within the configured token and
credit budget.

### 3.5 Internal control text leaks into the UI

`concept.productDetail` mixes human-readable product facts with model-facing
directives such as:

- `USER-SELECTED REFERENCE ANCHOR LOCK`;
- `VIDEO CHARACTER LOCK`;
- internal reference IDs;
- SHA-256 fingerprints;
- raw marketplace metadata and null fields.

`AutoReviewPlanReviewPanel` currently renders that mixed string directly.
Internal prompt context must be separated from the API/UI projection.

---

## 4. Goals

### 4.1 Primary goals

1. Produce a coherent 90-second product-review story containing exactly nine
   ten-second shots.
2. Pass Story Arc Planner validation on the first invocation for at least 95%
   of the representative evaluation corpus before general availability.
3. Compile synopsis-direct image prompts without a second LLM authoring pass in
   the default path.
4. Let the selected image model choose the full visual interpretation from the
   approved story summary while treating product shape, proportions,
   real-world scale, relative size, color, material, surface, texture,
   label/logo placement, and visible parts as immutable.
5. Author each video prompt only after the corresponding image has been
   generated and accepted.
6. Retry only the failed stage/shot.
7. Reduce total text-LLM tokens for plan plus nine video prompts to no more than
   50% of the measured 66,093-token failed Feature 136 baseline on the incident
   fixture.
8. Preserve exact product, character, and environment reference binding across
   stages.
9. Persist sufficient sanitized diagnostics to explain every failed LLM call
   without another paid reproduction.
10. Prevent all internal lock text, hashes, raw provider errors, and storage
   identifiers from reaching normal user-facing UI.

### 4.2 Secondary goals

1. Reuse the existing Marketplace Auto Review stage machine, leases, outbox,
   media tasks, storyboard review, video editor handoff, and finalization.
2. Preserve per-shot regeneration and current provider routing.
3. Support model-family-specific deterministic prompt templates without
   changing the approved story or adding creative prose. Model-specific
   differences are limited to safe reference-label syntax and provider payload
   shape.
4. Provide per-stage/per-shot cost evidence in run metadata and admin
   diagnostics.
5. Retain Feature 136 for rollback and already-running legacy work while
   preventing new v2 runs from entering its monolithic authoring loop.

---

## 5. Non-goals

1. This feature does not redesign the 3x3 grid strategy.
2. This feature does not change OpenRouter/provider billing semantics.
3. This feature does not promise that every provider supports ten-second video;
   unsupported selections fail preflight.
4. This feature does not introduce a third default LLM skill solely to rewrite
   image prompts.
5. This feature does not expose raw LLM prompts or responses in the standard
   product UI.
6. This feature does not replace image/video QA or the Storyboard Review UI.
7. This feature does not migrate existing media artifacts or regenerate
   completed legacy runs automatically.
8. This feature does not permit gallery images to override the user-selected
   primary product anchor.

---

## 6. Architectural comparison

### 6.1 Feature 136 monolithic flow

```text
product evidence + references
        |
        v
one large skill call
  - evidence profile
  - claims
  - 9-shot story
  - 9 image prompts
  - 9 video prompts
  - traces and QC
        |
        v
full-pack retry up to 3 rounds
        |
        v
generate images
        |
        v
generate video using prompts written before images existed
```

### 6.2 Feature 141 staged flow

```text
normalized product evidence + selected references
        |
        v
Skill A: Story Arc Planner
        |
        v
bounded 9-shot plan -> deterministic validation -> user approval
        |
        v
deterministic synopsis-direct image-prompt compiler
        |
        v
generate + QA image per shot
        |
        v
Skill B: Shot Video Director
actual accepted image + shot brief + dialogue
        |
        v
generate + QA video per shot
```

---

## 7. Reuse of the current stage machine

The current full-video stage ordering is preserved:

```text
concept_story
prompt_plan
image_generation
storyboard_review
video_generation
...
```

Feature 141 changes responsibility, not the top-level stage names:

| Existing stage | Feature 141 responsibility |
|---|---|
| `concept_story` | Invoke Story Arc Planner, validate/persist concise plan, enter plan-review hold. |
| `prompt_plan` | After story approval, deterministically compile per-shot synopsis-direct image prompts and freeze reference manifests; hold each shot for prompt review. No default LLM call. |
| `image_generation` | After the corresponding image prompt is approved, generate and QA that shot's start-frame image using existing durable media-task machinery. |
| `storyboard_review` | Display/edit/approve each generated image and safe shot brief; an accepted image is the gate for the next shot-local video-prompt operation. |
| `video_generation` | After image acceptance, invoke Shot Video Director, hold its prompt for user approval, then submit that shot's video only after approval. |
| `audio_generation` / selected TTS path | Hold the resolved dialogue/voice/audio plan for approval before any separate audio-provider request. Native video audio remains governed by video-prompt approval. |
| `render` / `library_finalize` | Hold the final ordered storyboard, audio, overlay, and package summary for approval before paid render/publish work; preserve existing finalization proof. |

A separate top-level `video_prompt_plan` stage is not required for v1 of this
feature. Video-prompt authoring is a durable per-shot substate inside
`video_generation`, allowing the stage list and existing clients to remain
compatible.

The human checkpoints are durable substates, not browser-only modals. A shot may
advance independently after its own checkpoint is approved, but no provider task
or credit reservation may be created for a checkpoint whose content hash has not
been approved. An explicit "approve all visible shots" action is allowed only when
it writes one approval record per shot/hash and fails the whole operation if any
item is stale or invalid.

After all required shot media is accepted, v2 continues through the existing
`render` and `library_finalize` stages. Feature 141 must preserve the current
ordering and finalization proof: ordered shot units, audio/transcript/subtitle
continuity where selected, render probe, final media QA, publishable package
manifest, and library linkage. A run is not reported `completed` merely because
all nine image or video-provider tasks succeeded. V2-specific state is projected
into the existing Storyboard Review/Video Editor handoff without exposing internal
prompt or provider artifacts.

### 7.1 V2 replaces the existing sequential authoring call path

The v2 route is a replacement branch, not an additional layer around Feature
136. For `planningArchitecture="staged_two_skill_v2"`, both initial start and
plan redraft must:

1. bypass the existing creative-plan LLM call represented by
   `buildGatewayCreativeAutoReviewPlan`;
2. bypass the separate full-plan voiceover rewrite represented by
   `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`;
3. bypass the Feature 136 full-pack loop represented by
   `runSequentialPromptPlanStage` and
   `product-review-sequential-storyboard`;
4. invoke Story Arc Planner as the only LLM authoring call before image
   generation;
5. compile synopsis-direct image prompts deterministically after approval; and
6. defer every video-prompt LLM call until the corresponding accepted image is
   available in `video_generation`.

The function names above identify the current integration responsibilities.
The later implementation may refactor them, but tests must prove the same
negative-call guarantees. Adding Skill A and Skill B while still executing any
of the three legacy authoring calls is non-compliant because it increases both
cost and inconsistency.

### 7.2 Compatibility projection and architecture-aware consumers

`StoryArcPlanV1` is the authoritative v2 plan. Existing consumers that require
an `AutoReviewPlan`-shaped concept receive a deterministic compatibility
projection containing only safe product/display fields and approved shot
summaries. The projection:

- performs no LLM call;
- adds no claim, dialogue, image prompt, or video prompt;
- contains no anchor-lock prose, hashes, storage refs, or raw product payload;
- is never treated as the authoritative v2 generation state.

For v2:

- plan approval validates `StoryArcPlanV1`, not Feature 136 `finalQc`;
- `prompt_plan` may complete when nine bounded synopsis-direct image prompts and frozen
  reference manifests exist; video prompts are not required;
- image-unit builders read the v2 per-shot image prompt and must not require a
  legacy `video_prompt` field;
- video submission reads the v2 per-shot video prompt generated after image
  acceptance;
- start, resume, redraft, approval, recovery, and worker paths dispatch by the
  persisted architecture before reading architecture-specific metadata.

The compatibility projection exists to keep unaffected UI/stage surfaces
stable during migration. It must not silently recreate the monolithic contract.

### 7.3 Asynchronous request boundary and 524 prevention

Browser-facing start, redraft, and per-shot retry mutations must not hold the
HTTP/TRPC connection open while an LLM or media provider runs:

1. validate authorization, references, capability, budget, and idempotency;
2. persist the requested transition and durable outbox/job;
3. return the run/operation identifier within the normal application response
   budget;
4. perform Skill A, Skill B, and media work in the existing worker/lease
   runtime;
5. let the client poll or subscribe to persisted run state.

A proxy disconnect or Cloudflare-style `524` after the durable transition is
not proof of task failure. Repeating the same mutation uses the idempotency key
to return the existing operation rather than creating another paid call.
Provider HTML error bodies are retained only in internal diagnostics and are
never returned as product UI copy.

The same rule applies when a user requests a Story Arc redraft or retries one
shot's Video Director call. No user-facing request waits synchronously for the
provider response.

### 7.4 Mandatory human approval checkpoint contract

The implementation plan must make the following checkpoints visible, durable, and
testable. The checkpoint is satisfied only by a server mutation carrying the
current content hash, plan/shot revision, authorized user, and approval timestamp.

| Checkpoint | User must inspect | Approval releases | Rejection/edit behavior |
|---|---|---|---|
| `story_plan` | Story arc, nine shot summaries, dialogue, claims/reference roles, duration, and safety warnings. | Prompt compilation for the approved plan revision. | Edit dialogue/story fields or request a text-only redraft; no image work is released. |
| `image_prompt` per shot | Exact deterministic image prompt, reference-role mapping, product-preservation clause, model/attachment summary, and estimated image cost. | Image reservation/provider submission for that shot only. | Edit the source shot summary or request redraft/recompile; the stale prompt cannot be submitted. |
| `image_result` per shot | Generated image, QA findings, product identity fields, continuity warnings, and expected downstream video cost. | Shot Video Director invocation and video-prompt review for that shot. | Accept only valid/allowed-warning results or regenerate that shot; hard product mismatch cannot be overridden. |
| `video_prompt` per shot | Exact video prompt, accepted image, dialogue, duration, motion constraints, and estimated video cost. | Video-provider reservation/submission for that shot only. | Edit/revalidate the bounded prompt or rerun Skill B; no video provider call occurs. |
| `audio_plan` when separate TTS/audio is selected | Dialogue transcript, voice/model, timing, language, and audio cost. | Audio-provider request. | Edit/revalidate audio plan or cancel audio stage; native video audio does not create a duplicate TTS charge. |
| `final_assembly` | Ordered shots, selected images/clips, audio, subtitles/overlays, warnings, and render/publish cost. | Paid render and library-finalize work. | Return to the affected shot/audio stage; never silently render an unapproved revision. |

The default Feature 141 policy is `all_checkpoints_required`; it has no user
opt-out. Approval is per shot for shot-scoped checkpoints. A bulk approval is only
a convenience that persists the same per-shot records and is rejected atomically
if any prompt/image/video/audio revision changed during the request.

Approval must be checked again immediately before enqueue/provider submission. A
successful browser response, an old approval flag, or a visible approved card is
not sufficient evidence. If the hash, revision, reference manifest, model,
attachment list, cost estimate, or safety verdict changes, the checkpoint returns
to `awaiting` and the provider call is blocked.

---

## 8. Run architecture versioning

Every sequential run persists:

```json
{
  "planningArchitecture": "staged_two_skill_v2",
  "planningArchitectureVersion": 1
}
```

Allowed values:

- `monolithic_sequential_v1` — Feature 136 behavior;
- `staged_two_skill_v2` — Feature 141 behavior.

The value is frozen at run creation except for the explicitly permitted failed
legacy upgrade in §23.3. Resume, redraft, worker claim, and recovery code must
dispatch by the persisted value, not by the current tenant flag.

### 8.1 Concrete persistence and artifact contract

The later implementation must make the following fields authoritative for v2. The
names are contract names; the detailed plan must map them to the exact service,
schema, and serializer files before coding.

```ts
type StagedSequentialStoryboardMetadataV1 = {
  planningArchitecture: "staged_two_skill_v2";
  planningArchitectureVersion: 1;
  humanApprovalPolicy: "all_checkpoints_required";
  planReview: {
    required: true;
    status: "awaiting" | "redraft_queued" | "approved";
    planRevision: number;
    approvedRevision: number | null;
    redraftCount: number;
    lastOperationId: string | null;
  };
  stagedSequentialStoryboard: StagedSequentialStoryboardStateV1;
};

type HumanApprovalCheckpointV1 = {
  checkpointId: string;
  kind:
    | "story_plan"
    | "image_prompt"
    | "image_result"
    | "video_prompt"
    | "audio_plan"
    | "final_assembly";
  scope: "run" | "shot";
  shotId: number | null;
  state: "not_ready" | "awaiting" | "approved" | "rejected" | "superseded";
  revision: number;
  contentHash: string;
  approvedHash: string | null;
  approvedByUserId: number | null;
  approvedAt: string | null;
  consumedAt: string | null;
  consumedByOperationId: string | null;
  rejectionReasonCode: string | null;
  estimatedCredits: number | null;
};
```

`stagedSequentialStoryboard.storyPlanStatus` is the source of truth for v2 plan
state. `planReview` is the API-compatible approval envelope; it must not become a
second independent state machine. The operational projection on the
`image_generation` stage remains `statusDetail.state=awaiting_plan_review` while
the run itself remains `status=running`, matching the current mandatory gate.
The legacy
`sequentialStoryboard` and `finalQc` shapes may be produced only as an explicitly
safe compatibility projection for unaffected consumers; they are never read as the
v2 generation state and must not require pre-image video prompts.

Trace and prompt artifacts must use the existing
`marketplace_auto_review_artifacts` table unless a later implementation plan proves
an additive migration is necessary. The current table already provides `runId`,
`stageKey`, `artifactKind`, `storageKey`, optional `storageUrl`, `contentHash`,
`mimeType`, `sizeBytes`, `status`, `metadataJson`, a per-run/kind/hash uniqueness
constraint, and run/stage/kind indexes. The detailed plan must reserve stable
`artifactKind` values for the Story Arc response, normalized evidence, reference
manifest, compiled image prompt, submitted image prompt, Shot Video Director
response, and safe UI projection. Raw artifacts remain restricted diagnostics and
must never be copied into the standard API projection.

The existing persistence surfaces have fixed ownership responsibilities:

| Surface | v2 responsibility |
|---|---|
| `marketplace_auto_review_runs` | User/tenant ownership, lifecycle status, current stage, frozen architecture metadata, and idempotent run creation. |
| `marketplace_auto_review_stages` | One row per stage, including the blocked `image_generation` plan-review projection and stage output/status. |
| `marketplace_auto_review_run_leases` | Single worker ownership, heartbeat, expiry, and recovery for asynchronous stage work. |
| `marketplace_auto_review_stage_attempts` | Attempt number/key, safe reason code, provider/credit/artifact refs, and retry evidence. |
| `marketplace_auto_review_outbox_jobs` | Durable start/redraft/approval/retry work with unique idempotency keys and bounded worker attempts. |
| `marketplace_auto_review_provider_events` | Provider callback replay protection and task/credit reconciliation. |
| `marketplace_auto_review_artifacts` | Hash-addressed trace, prompt, manifest, and safe-projection artifacts. |

The detailed plan must not introduce a parallel operation or outbox table for the
same run lifecycle without documenting why these existing surfaces cannot represent
the transition.

Required transition and idempotency rules:

1. Start persists the architecture, reference/evidence manifest, and an operation
   before Story Arc execution; it returns without waiting for the provider.
2. Story Arc completion enters `awaiting_plan_review`; no image reservation, media
   task, or image-provider request is allowed before an approved transition.
3. Approval atomically records the approval operation and releases only the prompt
   compilation/image enqueue transition. Repeated approval is a no-op for the same
   plan version.
4. Redraft records a distinct text-only operation, invalidates the unstarted
   downstream shot state, and never spends image/video credits. Repeated redraft
   requests with the same idempotency key resolve to the same operation.
5. Cancel records a terminal cancellation and never creates an image task.
6. A shot retry invalidates only that shot's downstream state and uses a distinct
   shot/attempt idempotency key.

All mutating operations use an expected `planRevision`/state digest. A stale client
receives `staged_state_drift` and must refetch; it must not overwrite a newer
dialogue edit, redraft, approval, or shot retry. The server performs the compare
and transition in one database transaction before enqueueing work.

The approval record itself is persisted with the operation/attempt and artifact
references. Every worker re-checks `state`, `approvedHash`, `revision`, model,
ordered reference-manifest hash, and credit estimate immediately before creating a
provider task. Consumption is recorded as immutable `consumedAt` and
`consumedByOperationId` evidence while the checkpoint remains in `approved` state;
an approved checkpoint with consumption evidence cannot authorize a second task. A
retry or changed attempt requires a new checkpoint revision and a new approval.

No database migration is implied by this specification merely to add v2 metadata:
the implementation should first use the existing JSON/artifact capacity. If a new
column or index is required, it must be an additive migration with rollback and
backfill evidence called out in the detailed plan.

---

## 9. Stage 0: deterministic evidence normalization

Before Skill A is called, TypeScript builds one normalized evidence envelope.
The envelope is the authoritative source for facts and reference roles across
the rest of the run.

### 9.1 Evidence envelope

```ts
type MarketplaceReviewEvidenceEnvelopeV2 = {
  schemaVersion: 1;
  product: {
    productId: string;
    name: string;
    category: string | null;
    description: string;
    attributes: Array<{
      id: string;
      label: string;
      value: string;
      support: "visual" | "seller_text" | "user_confirmed";
    }>;
  };
  claims: Array<{
    id: string;
    text: string;
    support: "visual_verified" | "text_verified" | "user_confirmed" | "conditional";
    allowedInDialogue: boolean;
    allowedInVisual: boolean;
  }>;
  blockedClaimIds: string[];
  referenceManifest: MarketplaceReviewReferenceEntryV2[];
  safetyPolicy: {
    childRelated: boolean;
    guardianRequiredWhenChildVisible: boolean;
    assemblyDocumented: boolean;
  };
};
```

### 9.2 Normalization rules

1. Remove price, rating, sold count, promotional claims, volatile marketplace
   signals, raw null fields, and unsupported superlatives from the planner
   input unless a separate product requirement explicitly permits them.
2. Convert claims into stable IDs so Skill A selects IDs instead of reproducing
   long claim traces.
3. Keep raw product source data in internal metadata; do not concatenate it
   into one human-facing or model-facing lock paragraph.
4. Validate selected reference ownership, storage existence, MIME type, and
   tenant access before any paid call.
5. Freeze the manifest used by Skill A and downstream compilation.

### 9.3 Model-facing evidence budget

Raw capture data remains available for audit, but Skill A receives a compact
model-facing envelope:

| Field | Bound |
|---|---:|
| product name | 180 characters |
| category | 160 characters |
| normalized description | 1,800 characters |
| attributes | maximum 24 |
| attribute label/value | 80 / 240 characters |
| allowed claims | maximum 36 |
| claim text | 240 characters |
| blocked claim IDs | maximum 36 |
| references | maximum selected-model capability |
| user requirements | 2,000 characters |
| creative presets | maximum 8 |

Claim IDs are compact stable identifiers such as `c01`, not hashes or copied
claim prose. The complete serialized data payload, excluding binary/image
tokens and the fixed versioned skill instructions, has a generated maximum
budget verified in tests.

When source data exceeds a field/count bound, deterministic ranking selects
user-confirmed evidence first, then visually verified evidence, then supported
seller text. The system records omitted-field counts in diagnostics. It does
not truncate a fact into a different meaning, promote an omitted claim, or send
raw overflow text to the model as an unbounded appendix.

---

## 10. Reference manifest v2

```ts
type MarketplaceReviewReferenceEntryV2 = {
  index: number;
  role:
    | "primary_product"
    | "supporting_product_angle"
    | "character"
    | "environment"
    | "continuity_frame";
  refId: string;
  sourceUrl: string;
  evidenceOnly: boolean;
  mayOverridePrimaryProduct: false;
  angleLabel?: string | null;
};
```

Rules:

1. `primary_product` is required for the run and is always index 1 whenever
   attached to a product-visible/optional image request. It is omitted from a
   shot whose approved `productPresence` is `absent`.
2. Supporting product angles may add evidence but never override primary
   product identity, color, variant, bundle, label placement, or visible parts.
3. Character and environment references are optional and role-scoped.
4. Generated continuity frames are added only after their media artifacts pass
   QA.
5. The number of attachments is capped by the selected model's current
   capability, resolved from the authoritative model/provider catalog.
6. Reference URLs, hashes, and storage keys never appear in user-facing copy.
7. A single-file multi-view sheet remains one reference entry. Panels inside
   it are views of the same subject, not separate variants.

### 10.1 GPT Image 2 image-to-image capability baseline

As of 2026-07-24, the Kie.ai GPT Image 2 image-to-image contract used by this
feature documents:

- `prompt`: maximum 20,000 characters;
- `input_urls`: maximum 16 image URLs;
- aspect ratios:
  `auto`, `1:1`, `3:2`, `2:3`, `4:3`, `3:4`, `5:4`, `4:5`, `16:9`, `9:16`,
  `2:1`, `1:2`, `3:1`, `1:3`, `21:9`, and `9:21`;
- resolutions: `1K`, `2K`, and `4K`, subject to the provider's
  aspect-ratio/resolution compatibility rules.

Capability sources checked:

- `https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image`
- `https://kie.ai/gpt-image-2?model=gpt-image-2-image-to-image`

The model/provider capability catalog is authoritative at runtime and records
the source URL, model slug, and last-verified timestamp. The adapter must not
apply a stale shared lower image limit to
`gpt-image-2-image-to-image`. When the UI selects the unified logical
`gpt-image-2-text-to-image` entry and references cause automatic routing to
`gpt-image-2-image-to-image`, validation and payload construction use the
effective routed model's 20,000/16 limits. A request with up to 16 valid images
is accepted by SmartSpecPro preflight for this model; only role selection,
ownership, format/size validation, or a newer catalog capability may reduce
the submitted set.

Provider maximums are validation ceilings, not prompt-writing targets. A
catalog refresh may change these values without changing the two-skill
architecture, but it requires contract tests and an audit record.

### 10.2 Nano Banana 2 capability baseline

As of 2026-07-24, Google's official documentation identifies Nano Banana 2 as
Gemini 3.1 Flash Image (`gemini-3.1-flash-image`) and describes it as supporting
multi-reference image processing and consistency. The direct Google Cloud
model specification currently allows a maximum of 14 images per prompt.

Capability sources checked:

- `https://ai.google.dev/gemini-api/docs/image-generation`
- `https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-image`

The direct-Google value does not automatically apply to a reseller or other
transport. SmartSpecPro resolves the effective provider route first and then
uses that route's catalogued attachment/file/resolution limits. Tests must
cover both the direct model ID and any aliased/provider-routed Nano Banana 2
entry.

The attachment maximum is a ceiling, not a target. Because each image consumes
input tokens and may introduce conflicting visual evidence, the shot receives
only references whose roles are relevant: the primary product when the product
may appear, the active character/environment reference when needed, accepted
continuity frames, and the minimum useful supporting product angles.

---

## 11. Skill A: Marketplace Auto Review Story Arc Planner

Proposed skill slug:

```text
marketplace-auto-review-story-arc
```

### 11.1 Responsibility

Skill A sees the whole product, audience, creative choices, evidence envelope,
and selected reference images. It decides:

- the 90-second review arc;
- the role of each of nine ten-second shots;
- what each shot communicates;
- the authoritative per-shot story summary and later motion intent;
- whether the product must be visible, may be visible, or must remain absent;
- the continuous Thai dialogue;
- which evidence claim IDs and reference roles each shot needs;
- transitions and continuity dependencies.

It does not write image prompts, video prompts, claim-trace prose, candidate
packs, loop reports, prompt character counts, or deterministic QC booleans.

### 11.2 Input

```ts
type StoryArcPlannerInputV1 = {
  product: MarketplaceReviewEvidenceEnvelopeV2["product"];
  claims: MarketplaceReviewEvidenceEnvelopeV2["claims"];
  blockedClaimIds: string[];
  references: Array<{
    index: number;
    role: MarketplaceReviewReferenceEntryV2["role"];
    angleLabel?: string | null;
  }>;
  targetLanguage: "th";
  shotCount: 9;
  shotDurationSeconds: 10;
  totalDurationSeconds: 90;
  reviewTone: string | null;
  storytellingStructure: string | null;
  creativePresets: Array<{ family: string; presetId: string }>;
  audience: string | null;
  userRequirements: string | null;
  safetyPolicy: MarketplaceReviewEvidenceEnvelopeV2["safetyPolicy"];
  audioStrategy: "native_video_audio" | "separate_tts_voiceover" | "silent";
};
```

Selected reference images are attached to the invocation. The JSON input lists
only their stable role mapping.

### 11.3 Output

```ts
type StoryArcPlanV1 = {
  schemaVersion: "1.0";
  title: string;
  coreMessage: string;
  totalDurationSeconds: 90;
  globalContinuity: {
    productSummary: string;
    presenterSummary: string | null;
    environmentSummary: string;
    wardrobeSummary: string | null;
    visualStyleSummary: string;
  };
  shots: Array<{
    shotId: number;
    durationSeconds: 10;
    beatRole:
      | "hook"
      | "problem"
      | "insight"
      | "product_reveal"
      | "proof"
      | "demonstration"
      | "result"
      | "summary"
      | "cta";
    storySummary: string;
    motionIntent: string;
    productPresence: "required" | "optional" | "absent";
    dialogue: string;
    transitionToNext: string | null;
    requiredReferenceRoles: Array<
      "primary_product" | "supporting_product_angle" | "character" | "environment"
    >;
    selectedClaimIds: string[];
    continuityFromShotId: number | null;
  }>;
};
```

### 11.4 Strict schema bounds

The provider-level JSON schema must use `additionalProperties: false` at every
object level.

| Field | Bound |
|---|---:|
| `title` | 120 characters |
| `coreMessage` | 240 characters |
| each global-continuity string | 240 characters |
| `storySummary` | 220 characters |
| `motionIntent` | 160 characters |
| `dialogue` | 200 characters and deterministic speech-fit validation |
| `transitionToNext` | 120 characters |
| `requiredReferenceRoles` | maximum 4 |
| `selectedClaimIds` | maximum 4 |
| `shots` | exactly 9 |

The total serialized output has a computed byte/character ceiling derived from
these field limits. The request's output-token allowance is calculated from
the bounded schema and the selected model's tokenization/capability data with a
safety margin. It is not an unexplained global literal.

### 11.5 Dialogue

1. Dialogue is planned globally in Skill A so all nine shots form one
   continuous review rather than nine isolated advertisements.
2. Each non-silent shot has non-empty Thai dialogue.
3. The existing Thai speech estimator verifies that dialogue fits ten seconds.
4. Over-budget dialogue is a precise shot-level validation error.
5. Skill B must not rewrite approved dialogue. It receives and embeds it.

### 11.6 Validation

TypeScript verifies:

- exact top-level schema;
- exact nine shots, IDs 1-9 with no duplicates;
- every duration equals ten and total equals ninety;
- every selected claim ID exists and is allowed;
- blocked claims and price content are absent;
- required reference roles exist;
- `productPresence="required"` includes `primary_product`, while
  `productPresence="absent"` excludes all product-reference roles;
- `storySummary` describes narrative meaning rather than camera/lens/lighting
  instructions or exact object placement;
- guardian and assembly policy consistency;
- dialogue duration;
- continuity links point only to earlier valid shots;
- no internal reference URL/hash/control marker appears in output.

Self-reported LLM QC is not accepted as evidence.

### 11.7 Retry policy

1. One initial call.
2. At most one schema/content repair call if deterministic validation fails.
3. The repair prompt contains only the bounded candidate plus exact validation
   errors.
4. `finish_reason=length`, empty response, malformed JSON, or provider schema
   rejection is recorded distinctly.
5. A second failure stops at plan review with a specific error. It does not
   launch a third full-pack call automatically.

### 11.8 Plan-review UI

The user sees:

- title and core message;
- total duration `90 วินาที`;
- nine shot cards;
- story summary, motion intent, product-presence status, dialogue, and
  transition;
- human-readable reference-role badges;
- warnings that require user confirmation;
- the current checkpoint name, revision, content-hash indicator, estimated
  downstream credits, and explicit Approve / Reject / Edit action for each
  checkpointed shot.

The UI must visibly show that a shot is waiting and must not present a queued
provider task as if approval had already happened. After approval, it shows the
approved revision and continues polling persisted state; a reload cannot silently
re-approve or skip a checkpoint.

The user does not see:

- system prompts;
- anchor-lock prose;
- SHA hashes;
- storage paths;
- raw provider errors;
- claim-control internals;
- provider response IDs.

### 11.9 Plan-review operation contract

Feature 141's plan review is a durable stateful workflow, not only a panel. The
later implementation must expose one architecture-aware query and the following
mutations (names may follow the existing router naming convention):

| Operation | Preconditions | Persisted result | Provider/image spend |
|---|---|---|---|
| Start staged run | Eligible sequential strategy, v2 flag enabled, capability/budget/reference preflight passed. | Run, architecture snapshot, operation, evidence/reference manifest, and outbox job. | Story Arc text LLM may spend; no image/video media spend before approval. |
| Load plan summary/heavy detail | Caller owns or is authorized for the run; architecture is readable. | Typed `MarketplaceReviewPlanDisplayV2`; heavy data is fetched only for the held run. | None. |
| Edit one shot | `awaiting_plan_review`, matching `planRevision` and state digest. | New plan revision; validated shot text; affected downstream state invalidated. | No provider call. |
| Approve | `awaiting_plan_review`, valid plan, matching revision/digest. | `planReview.status=approved`, approved revision, approval operation, stage re-arm/enqueue. | No image reservation until the worker consumes the approved transition. |
| Redraft with notes | `awaiting_plan_review`, matching revision/digest, within redraft/budget policy. | `redraft_queued` operation; old plan remains immutable history; new plan returns to review. | Text LLM only; never image/video media spend before approval. |
| Cancel | Active held run and authorized caller. | Terminal cancellation operation. | None. |
| Accept/select image for a shot | Image exists, automated hard-fidelity checks passed, or an explicit allowed warning override is recorded. | Accepted image artifact, acceptance evidence, and video-prompt eligibility for that shot. | No image spend; later video-prompt/media work may spend. |
| Retry one shot | Persisted shot failure or user-approved regeneration state; matching shot revision/digest. | New shot attempt; only that shot's downstream state invalidated. | Image/video spend only for the affected shot, subject to budget. |
| Approve checkpoint | Current checkpoint is `awaiting`; content hash, revision, cost, model, and safety verdict match the request. | One immutable approval record and checkpoint state `approved`. | Releases only the provider task named by that checkpoint. |
| Reject/request correction | Current checkpoint is `awaiting` and caller is authorized. | Rejection reason, invalidation scope, and new editable/review state. | No provider spend; downstream approvals are superseded. |

The v2 editor may edit only `storySummary`, `motionIntent`, and `dialogue` for a
shot. Product facts, selected claim IDs, reference roles, shot count, duration,
and product-presence policy are system-controlled; changing them requires a
redraft/revalidation path. Every edit re-runs deterministic safety, claim, speech,
and bounds validation before persistence. The existing legacy checkout currently
supports dialogue-only editing; that limitation is not silently presented as the
complete v2 contract.

Every mutation accepts `runId`, `planRevision`, `stateDigest`, and an idempotency
key (where the existing API has a compatible optional key, v2 makes it required).
The response contains `operationId`, `runId`, the new revision/state digest, and a
pollable status—not a provider response. Unauthorized, stale, cancelled, approved,
or wrong-architecture requests fail closed with safe reason codes. No mutation
trusts client-supplied tenant/user IDs.

Required client states are: loading heavy plan, ready for review, edit saving,
redraft queued, approval queued, stale-plan conflict, safe validation error,
cancelled, and provider/worker failure with retry guidance. Buttons must be disabled
while the same operation is pending and re-enabled from persisted state after a
reload; a browser timeout must not cause a duplicate operation.

---

## 12. Deterministic synopsis-direct image-prompt compiler

### 12.1 Synopsis-direct invariant

The default image prompt follows the existing Vertical Drama
`buildDeterministicPolicySafeImagePrompt` principle:

```text
REFERENCE MAPPING: {Image N = role/subject; ...}.
{approved storySummary verbatim}
{compact product-preservation clause only when a product may appear}
```

If no reference is attached, the prompt starts directly with
`storySummary`. If no product may appear, there is no product-preservation
clause. No other compiler-authored creative prose is emitted by default.

Implementation may generalize the existing Vertical Drama helper or create a
Marketplace-specific wrapper, but both paths must share golden contract
fixtures so their synopsis-direct behavior cannot drift.

The compiler must preserve the approved `storySummary` byte-for-byte after
trimming its outer whitespace. It cannot translate, paraphrase, enrich, or turn
the summary into a cinematic prompt. Any policy-sensitive rewrite occurs
before approval through a separately validated synopsis rewrite that may
change only the declared unsafe phrase, following the same fail-closed
principle as Vertical Drama.

Reference labels are deterministic, human-readable role/subject labels—not
filenames, URLs, hashes, marketplace text, or storage/provider IDs. Each label
is normalized to one line, length-bounded, and rejected if it contains prompt
delimiters, control markers, or instruction-like content. User-controlled
metadata cannot become a hidden prompt suffix through `REFERENCE MAPPING`.

### 12.2 Creative-authority boundary

The system decides only:

- which approved story summary to send;
- which relevant images to attach and their reference mapping;
- whether a compact product-preservation clause is required;
- provider parameters such as aspect ratio and resolution.

GPT Image 2 or Nano Banana 2 decides everything else from the synopsis and
references: composition, framing, viewpoint, camera language, lighting,
environment staging, presenter pose/interaction, visual hierarchy, and overall
imagination.

`motionIntent`, global style summaries, dialogue, transition prose, claims,
continuity explanations, and deterministic QA notes are not copied into the
image prompt. If the user explicitly requests an image-specific constraint, it
must already be represented in the approved `storySummary`; the compiler still
does not expand it.

### 12.3 Exact default prompt forms

Without product:

```text
REFERENCE MAPPING: Image 1 = presenter: Mali; Image 2 = location: home kitchen.
{storySummary}
```

With product:

```text
REFERENCE MAPPING: Image 1 = primary product; Image 2 = presenter: Mali.
{storySummary}
PRODUCT PRESERVATION: The product must remain exactly the same as Image 1.
Do not change or invent its shape, silhouette, proportions, real-world scale,
relative size,
color, material, surface finish, texture, label/logo/marking placement,
construction, visible parts, or component/accessory count. Do not add, remove,
extend, reshape, recolor, retexture, restyle, merge, or replace any product
part or variant.
```

The preservation clause is intentionally the only default addition beyond
reference mapping and synopsis. It protects identity without describing what
the generated scene should look like.

For `productPresence="absent"`, no product reference or product clause is sent.
For `productPresence="required"`, the primary product reference is mandatory.
For `productPresence="optional"`, the primary product reference is attached and
the clause applies if the model shows the product.

The UI displays the safe `storySummary` and human-readable reference mapping.
It does not display internal storage refs, hashes, or any provider-only
preservation metadata.

### 12.4 Reference and product-fidelity hierarchy

When references conflict, priority is:

1. primary product reference identity;
2. accepted character identity reference;
3. accepted environment/continuity reference;
4. supporting product angles;
5. the model's creative interpretation.

Supporting product angles may clarify the same item but never override the
primary product's variant, color, material, shape, bundle, label, logo,
construction, or included parts. A multi-view sheet is one identity reference
whose panels show the same subject. The output must not reproduce the sheet,
panel borders, labels, or contact-sheet layout.

If deterministic selection cannot establish one product identity because the
references visibly conflict, preflight stops before image spend. The system
must not ask the image model to average, merge, or choose between variants.

### 12.5 Model-family adapters

GPT Image 2 and Nano Banana 2 use the same synopsis-direct contract.

- The adapter may change only reference-label syntax and provider payload
  shape. The selected adapter supplies its deterministic mapping syntax to the
  compiler; it does not rewrite the completed prompt afterward.
- Aspect ratio, resolution, output count, and provider options are API
  parameters, not prompt prose.
- GPT Image 2 receives ordered `input_urls` according to its effective routed
  capability.
- Nano Banana 2 receives ordered multimodal image parts according to its
  effective provider capability.
- No adapter may call a prompt enhancer or append cinematic/style/camera
  instructions.

The provider catalog, not the nickname, determines attachment/file/resolution
limits and payload format.

### 12.6 Prohibited default additions

The compiler must not append:

- desired-quality/style lists;
- camera, lens, angle, crop, aperture, shutter, ISO, or film-stock language;
- lighting, color-grade, mood, atmosphere, or VFX language;
- exact composition, object placement, environment inventory, or background
  props;
- presenter pose, hand position, facial expression, gaze, wardrobe, or body
  blocking;
- dialogue, motion instructions, video language, or transition directions;
- a negative-prompt dump;
- inferred claims, labels, captions, subtitles, or on-image text;
- SHA values, storage refs, internal IDs, or diagnostic prose.

This prohibition applies even when a model-family template, legacy cinematic
prompt engine, prompt optimizer, or provider adapter could add such text. The
only exceptions are:

1. text already present in the approved `storySummary`;
2. the reference-mapping line; and
3. the compact product-preservation clause.

### 12.7 Prompt budget and provider validation

The default prompt is bounded by:

```text
reference-mapping line
+ storySummary
+ optional product-preservation clause
```

No LLM prompt optimizer, cinematic-prompt expander, or style enhancer is used.
Tests snapshot the exact output so any added prose fails visibly.

For `gpt-image-2-image-to-image`, the adapter separately enforces the current
20,000-character provider ceiling and the 16-item `input_urls` ceiling after
prompt compilation and attachment selection. It must not reuse a generic UI
upload limit, the Feedback form's five-file limit, or another model's lower
attachment limit.

### 12.8 Submission-integrity gate

The compiled provider-ready prompt is immutable after compilation. Before
enqueue, the system records:

- `imagePromptMode="synopsis_direct_v1"`;
- the approved `storySummary` hash;
- the canonical selected-reference-manifest hash;
- whether the product-preservation clause was applied;
- the image-prompt adapter ID/version;
- the compiled prompt hash.

Immediately before provider submission, the media task hashes the exact prompt
and canonical ordered reference manifest again. Both hashes must match the
compiled/enqueued values. A mismatch fails locally with
`image_prompt_submission_mutated` before provider spend. Request builders,
gateways, model adapters, and retry middleware may serialize the prompt and
references into a provider payload, but may not translate, paraphrase, enrich,
optimize, or append creative prose.

The product-identity correction allowed by §13.5 is a new explicit retry prompt
revision with its own hash, reason code, and parent-attempt link. It is not an
unrecorded mutation of the original prompt.

---

## 13. Per-shot image generation

### 13.1 Unit identity

Each image unit remains:

```text
sequential-shot-01
...
sequential-shot-09
```

### 13.2 Attachment order

Default order:

1. primary product anchor when `productPresence` is `required` or `optional`;
2. character reference when the shot contains the presenter;
3. environment reference when supplied and relevant;
4. accepted continuity frame referenced by `continuityFromShotId`;
5. relevant supporting product angles within the model cap.

For `productPresence="absent"`, no product reference is attached. Reference
indices are rebuilt per request, and the prompt's role legend must match the
actual ordered attachments exactly.

### 13.3 Scheduling

Shot processing is logically independent and durably tracked per shot.
Execution may use bounded concurrency only when no continuity dependency
requires an earlier accepted image. A shot with `continuityFromShotId` waits
for that source shot's image to pass QA.

### 13.4 Failure isolation

- A failed shot retries only itself.
- Regenerating one shot does not rerun Skill A.
- Regenerating an image invalidates only that shot's previously authored video
  prompt and downstream video artifact.
- Accepted images for other shots remain intact.

### 13.5 Product-fidelity QA gate

For every generated image in which the product is present, image QA compares
the output against the primary product anchor and treats these as hard
identity fields:

- shape and silhouette;
- proportions, real-world scale, and relative size;
- color and variant;
- material, surface finish, and texture;
- label, logo, and marking placement;
- construction and visible parts;
- component/accessory count;
- absence of invented, removed, extended, merged, or reshaped parts.

A hard mismatch cannot be hidden by a passing aggregate aesthetic score.
Failure reason codes identify the field, for example:

```text
product_shape_changed
product_proportions_changed
product_scale_changed
product_color_or_variant_changed
product_material_or_surface_changed
product_label_or_logo_changed
product_parts_changed
product_reference_conflict
```

Composition, framing, environment, viewpoint, lighting, and staging differences
are not failures merely because they differ from an imagined shot. They fail
only when they violate the story, safety, verified facts, continuity, or cause
a hard product-identity mismatch. QA must distinguish a scene's lighting/color
grade from an actual product recolor.

An identity failure retries only that image with the same minimal story brief,
the same primary anchor, and a bounded correction naming only the failed
identity fields. It must not respond by expanding the prompt into a detailed
composition specification. Retry count remains subject to the selected quality
mode and the run's approved credit budget.

---

## 14. Skill B: Marketplace Auto Review Shot Video Director

Proposed skill slug:

```text
marketplace-auto-review-shot-video-director
```

### 14.1 Invocation timing

Skill B is called only after:

1. Skill A's plan is approved;
2. the shot image exists;
3. image QA accepts the image or the user explicitly accepts an allowed manual
   review result that does not override a product-identity hard failure;
4. the final image artifact URL is durable and accessible to the skill runtime.

### 14.2 Responsibility

Skill B inspects the actual shot image and writes one feasible motion prompt
that:

- begins from the visible state in the image;
- performs the approved `motionIntent`/story intent;
- preserves the product and presenter;
- fits ten seconds;
- uses the approved dialogue and audio strategy;
- maintains continuity with the neighboring shot summaries;
- does not invent off-frame mechanisms, product parts, people, claims, or
  transformations.

It does not re-plan the story, change dialogue, select claims, or emit global
QC reports.

### 14.3 Input

```ts
type ShotVideoDirectorInputV1 = {
  shotId: number;
  durationSeconds: 10;
  storySummary: string;
  motionIntent: string;
  productPresence: "required" | "optional" | "absent";
  dialogue: string;
  previousShotSummary: string | null;
  nextShotSummary: string | null;
  globalContinuity: StoryArcPlanV1["globalContinuity"];
  requiredReferenceRoles: StoryArcPlanV1["shots"][number]["requiredReferenceRoles"];
  audioStrategy: "native_video_audio" | "separate_tts_voiceover" | "silent";
  videoModelCapabilities: {
    imageInputMode: "start_frame" | "start_stop_frames";
    durationSeconds: 10;
    nativeAudio: boolean;
    promptMaxCharacters: number;
  };
};
```

Attachments:

- accepted current shot image as the primary start-frame input;
- accepted stop frame when the selected video mode requires it;
- primary product/character reference only when the prompt-authoring vision
  model needs additional identity evidence and attachment capacity permits.

### 14.4 Output

```ts
type ShotVideoDirectorOutputV1 = {
  schemaVersion: "1.0";
  shotId: number;
  videoPrompt: string;
};
```

Bounds:

- `additionalProperties: false`;
- `videoPrompt` non-empty and no longer than the selected provider limit;
- one shot only;
- no echoed images, evidence profiles, claim traces, candidates, or QC blocks.

### 14.5 Deterministic compilation and validation

Skill B may return the complete provider-ready `videoPrompt`, but TypeScript
validates and, where required, deterministically appends immutable fields:

- exact duration;
- exact approved dialogue/audio mode;
- reference binding;
- no-text policy;
- provider-required formatting.

Validation rejects:

- dialogue drift;
- price or blocked claims;
- reference-index mismatch;
- duration mismatch;
- impossible start action relative to the image;
- unauthorized identity replacement;
- output beyond provider prompt length;
- internal reasoning or Markdown wrappers.

### 14.6 Retry policy

1. One initial call for the affected shot.
2. At most one targeted repair call containing that shot's validation errors.
3. Failure marks only that shot's video-prompt substate as failed.
4. The user can retry that shot without rerunning Story Arc Planner or other
   successful shots.

---

## 15. Durable per-shot state

Persist under the run's staged architecture metadata:

```ts
type StagedSequentialStoryboardStateV1 = {
  architecture: "staged_two_skill_v2";
  storyPlan: StoryArcPlanV1 | null;
  storyPlanStatus:
    | "queued"
    | "authoring"
    | "awaiting_plan_review"
    | "redraft_queued"
    | "approved"
    | "failed";
  planRevision: number;
  storyPlanHash: string | null;
  approvedAt: string | null;
  approvedPlanRevision: number | null;
  reviewCheckpoints: HumanApprovalCheckpointV1[];
  referenceManifest: MarketplaceReviewReferenceEntryV2[];
  shots: Record<string, {
    shotId: number;
    imagePromptMode: "synopsis_direct_v1";
    imagePrompt: string | null;
    imagePromptHash: string | null;
    storySummaryHash: string | null;
    referenceManifestHash: string | null;
    productPreservationApplied: boolean;
    imagePromptAdapterId: string | null;
    imagePromptAdapterVersion: string | null;
    submittedPromptHash: string | null;
    submittedReferenceManifestHash: string | null;
    submittedReferenceCount: number | null;
    effectiveImageModel: string | null;
    effectiveImageProvider: string | null;
    imageTaskId: string | null;
    acceptedImageArtifactId: string | null;
    acceptedImageUrl: string | null;
    imageStatus: "queued" | "running" | "review" | "accepted" | "failed";
    videoPrompt: string | null;
    videoPromptHash: string | null;
    videoPromptSourceImageHash: string | null;
    videoPromptStatus: "blocked" | "queued" | "running" | "ready" | "failed";
    videoTaskId: string | null;
    videoStatus: "blocked" | "queued" | "running" | "completed" | "failed";
  }>;
};
```

Large raw diagnostics do not belong in `metadataJson`; see §19.

Legacy `sequentialStoryboard.shots` and `finalQc` are not authoritative for v2
and must not be synthesized merely to satisfy old approval gates. If a
temporary read adapter is necessary, it is a pure projection over
`StagedSequentialStoryboardStateV1` and cannot contain a pre-image video
prompt. `acceptedImageUrl` and provider/task identifiers above are internal state;
the normal plan-review API exposes artifact-backed safe media references only.

---

## 16. Invalidation rules

| Change | Invalidated data |
|---|---|
| Product facts/reference selection before approval | Story plan and every downstream artifact |
| Story-plan redraft before images | Story plan, compiled synopsis-direct image prompts, all unstarted downstream state |
| Edit one shot summary/dialogue before its image | That shot's synopsis-direct image prompt/image/video prompt/video |
| Regenerate one image | That shot's video prompt and video |
| Approve a different image candidate | That shot's video prompt and video |
| Change video model | Unsubmitted video prompts whose provider contract differs; images remain |
| Change audio strategy | Affected shot video prompts/videos; images remain |
| Internal UI display projection change | No generation artifacts |

Invalidation is explicit, hash-backed, and shot-local whenever possible.

---

## 17. Credits and cost accounting

### 17.1 Charging rule

Charge actual usage through the existing OpenRouter/provider-aware pricing and
credit ledger:

1. The user charge equals the provider/OpenRouter cost actually incurred,
   converted through the existing credit-pricing rule; it is not a flat
   per-skill fee or the preflight estimate.
2. A truncated, malformed, or validation-failed response remains chargeable
   when OpenRouter/provider usage shows that tokens were consumed.
3. A local preflight, schema validation, or reference-validation failure before
   provider submission creates no LLM usage charge.
4. Every repair/fallback attempt that reaches a billable provider is a separate
   usage record; the UI estimate and admin ledger show the aggregate.
5. Timeout/connection-loss cases with uncertain completion are reconciled by
   provider response/request ID when supported, so SmartSpecPro neither invents
   a charge nor silently loses a real provider cost.
6. A provider task cannot reserve or spend image, video, audio, or render credits
   unless its immediately preceding human approval checkpoint is approved with
   the same content hash, revision, model, ordered references, and cost estimate.
   Text credits consumed to author the story or a reviewable prompt remain actual
   usage and are not retroactively undone by a user rejection.

### 17.2 Required ledger granularity

Every text-LLM transaction includes:

- run ID;
- architecture version;
- stage;
- skill slug/version;
- shot ID or `story_plan`;
- invocation generation/attempt;
- served model and provider;
- input/output tokens;
- calculated credits;
- provider response ID when available;
- idempotency key.

Example keys:

```text
marketplace-auto-review:v2:story-plan:<runId>:g<generation>:a<attempt>
marketplace-auto-review:v2:video-prompt:<runId>:shot-03:g<generation>:a<attempt>
```

### 17.3 Budget preflight

Before the run starts:

- estimate Story Arc Planner cost;
- estimate nine Shot Video Director calls;
- estimate image/video media cost separately;
- show the existing aggregate estimate;
- enforce tenant/user budget rules.

The plan-review budget must also include one allowed planner repair and a bounded
maximum of three user-requested redrafts per run. The remaining redraft count and
the text-only worst-case estimate are visible at review time. A redraft is rejected
before provider submission when the text budget, tenant limit, or maximum redraft
count would be exceeded. Estimates do not replace actual charging.

### 17.4 Cost acceptance gate

For the production incident fixture:

- Feature 136 measured text-LLM baseline: approximately 66,093 tokens across
  three failed rounds;
- Feature 141 plan plus all nine successful video-prompt calls must use no more
  than 33,046 text tokens (50% of baseline);
- Story Arc Planner alone targets a valid first-pass response materially below
  its computed output ceiling;
- no normal success path invokes a full nine-shot LLM rewrite after plan
  approval.

Plan approval is the media-spend boundary: the pre-approval path may consume text
LLM credits for initial authoring, one repair, and allowed redrafts, but it may not
reserve or submit image/video media work. The detailed plan must test this ledger
separation directly rather than infer it from a UI estimate.

The same rule applies at every later checkpoint: image-provider spend follows
`image_prompt` approval, video-provider spend follows `video_prompt` approval,
separate TTS spend follows `audio_plan` approval, and paid render/publish work
follows `final_assembly` approval. A rejection may leave already-consumed text or
media usage intact, but it must prevent any new downstream reservation until a new
revision is reviewed and approved.

Image/video model tokens or provider media credits are reported separately and
are not hidden inside this text-token gate.

---

## 18. Provider-level structured output

### 18.1 Required behavior

Both skills send an actual provider-supported structured-output contract when
the served model/provider supports it:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "...",
      "strict": true,
      "schema": {}
    }
  }
}
```

The runtime must not treat an internal `schemaHint` as proof that the provider
received or enforced the schema.

### 18.2 Fallback behavior

If a provider does not support strict JSON schema:

1. select another eligible recommended model/provider when policy permits;
2. otherwise use JSON-object mode plus deterministic validation;
3. record the degraded schema-enforcement mode;
4. never silently present degraded enforcement as strict structured output.

### 18.3 Finish reason

Persist and classify:

- `stop`;
- `length`;
- `content_filter`;
- tool/structured-output termination;
- missing/unknown.

`length` is never classified as generic `model_bad_output`.

---

## 19. Diagnostics and observability

### 19.1 Required trace artifact

Each LLM call writes an internal diagnostic artifact using the existing
Marketplace Auto Review artifact infrastructure, rather than expanding run
metadata indefinitely.

```ts
type MarketplaceReviewLlmTraceArtifactV1 = {
  schemaVersion: 1;
  runId: string;
  stage: "story_plan" | "shot_video_prompt";
  shotId: number | null;
  skillSlug: string;
  skillVersion: string;
  model: string;
  provider: string;
  providerResponseId: string | null;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  finishReason: string | null;
  requestCharacterCount: number;
  responseCharacterCount: number;
  schemaEnforcementMode: "json_schema" | "json_object" | "prompt_only";
  validationStatus: "passed" | "failed";
  validationErrors: string[];
  promptHash: string;
  responseHash: string;
  sanitizedRequestSnapshot: Record<string, unknown>;
  rawResponseCiphertextRef: string | null;
  createdAt: string;
};
```

Each image submission writes a separate bounded trace:

```ts
type MarketplaceReviewImagePromptTraceArtifactV1 = {
  schemaVersion: 1;
  runId: string;
  shotId: number;
  attempt: number;
  parentAttempt: number | null;
  imagePromptMode: "synopsis_direct_v1";
  adapterId: string;
  adapterVersion: string;
  effectiveModel: string;
  effectiveProvider: string;
  storySummaryHash: string;
  compiledPromptHash: string;
  submittedPromptHash: string;
  compiledReferenceManifestHash: string;
  submittedReferenceManifestHash: string;
  submittedReferenceCount: number;
  productPreservationApplied: boolean;
  correctionReasonCodes: string[];
  integrityStatus: "passed" | "failed";
  createdAt: string;
};
```

This trace stores hashes and safe role/count metadata, not signed URLs, raw
storage identifiers, or the internal prompt in normal run/UI projections.

### 19.2 Raw response policy

1. A bounded raw model response may be stored in an access-controlled internal
   artifact or encrypted object storage for operational diagnosis.
2. It must never appear in normal API projections or user-facing error copy.
3. Signed URLs, secrets, authorization headers, and unnecessary personal data
   are removed before persistence.
4. Retention is bounded by the platform's operational log/privacy policy.
5. Admin diagnostics can inspect the trace; product UI sees a safe reason code.

### 19.3 Required metrics

- first-pass planner validity rate;
- planner repair rate;
- planner `finish_reason=length` rate;
- average/percentile planner input/output tokens;
- average/percentile video-director tokens per shot;
- text credits per completed 90-second plan;
- shot-local image/video-prompt retry rates;
- synopsis-direct prompt character count and forbidden-expansion detection;
- image prompt/manifest submission-integrity failures by adapter version;
- product-fidelity failure rate by hard identity field and image model/provider;
- reference mismatch and dialogue-drift rejection rates;
- legacy-v1 versus staged-v2 cost and success comparison.

Operational alerts and runbook evidence are also required:

- any pre-approval image reservation, image ledger row, media task, or provider
  submission is a critical invariant violation and pages the owner;
- any v2 call to a Feature 136 authoring function, forbidden UI marker, or
  architecture switch on resume is a critical rollout violation;
- oldest queued v2 outbox job above 5 minutes is a warning and above 15 minutes is
  critical until the worker/lease state is reconciled;
- lease expiry, provider-event replay mismatch, unresolved credit reconciliation,
  or repeated `staged_state_drift` is tracked by run and included in the rollback
  decision;
- plan-review holds older than the product retention window are surfaced for
  cleanup/recovery without silently expiring or deleting user work.

Thresholds, alert owners, dashboards, and the recovery command for each alert must
be committed with the rollout evidence; a metric without an operational response
is not a readiness gate.

---

## 20. Error taxonomy and UI copy

Safe reason codes:

```text
story_plan_invalid_json
story_plan_schema_violation
story_plan_output_too_long
story_plan_content_invalid
story_plan_provider_unavailable
story_plan_provider_credit
story_plan_review_required
story_plan_redraft_requested
story_plan_approval_blocked
story_plan_dialogue_missing
plan_review_stale_revision
plan_review_expired
plan_review_redraft_limit
text_budget_exceeded
staged_architecture_unavailable
staged_state_drift
approval_checkpoint_required
approval_checkpoint_stale
approval_checkpoint_consumed
approval_checkpoint_invalidated
image_prompt_review_required
image_result_review_required
video_prompt_review_required
audio_review_required
final_assembly_review_required
shot_image_failed
shot_video_prompt_invalid_json
shot_video_prompt_schema_violation
shot_video_prompt_output_too_long
shot_video_prompt_content_invalid
shot_video_prompt_provider_unavailable
video_model_duration_unsupported
reference_mapping_invalid
image_prompt_submission_mutated
product_shape_changed
product_proportions_changed
product_scale_changed
product_color_or_variant_changed
product_material_or_surface_changed
product_label_or_logo_changed
product_parts_changed
product_reference_conflict
```

Examples:

- `story_plan_output_too_long`:
  `โมเดลหยุดเพราะคำตอบยาวเกินขอบเขตของแผน 9 ช็อต ระบบยังไม่ได้สร้างภาพ`
- `shot_video_prompt_content_invalid`:
  `พรอมต์วิดีโอของช็อต 4 ไม่ผ่านการตรวจ ระบบหยุดเฉพาะช็อตนี้`
- `product_color_or_variant_changed`:
  `ภาพของช็อต 4 เปลี่ยนสีหรือรุ่นของสินค้า ระบบจะสร้างใหม่เฉพาะช็อตนี้โดยยึดภาพสินค้าเดิม`
- `image_prompt_submission_mutated`:
  `ระบบตรวจพบว่าพรอมต์ภาพหรือชุดภาพอ้างอิงเปลี่ยนไประหว่างเตรียมงาน ระบบหยุดก่อนส่งผู้ให้บริการ`
- `story_plan_review_required`:
  `กรุณาตรวจและยืนยันสตอรีบอร์ดข้อความก่อนเริ่มสร้างภาพ ระบบยังไม่ใช้เครดิตภาพ`
- `story_plan_approval_blocked`:
  `ยังยืนยันแผนไม่ได้เพราะบทพูดหรือโครงสร้างบางส่วนไม่ครบ ระบบยังไม่สร้างภาพ`
- `staged_state_drift`:
  `ข้อมูลการทำงานของสตอรีบอร์ดไม่ตรงกับเวอร์ชันล่าสุด ระบบหยุดเพื่อป้องกันการสร้างงานผิดชุด`
- `plan_review_stale_revision`:
  `แผนนี้ถูกแก้ไขในหน้าต่างอื่นแล้ว กรุณาโหลดแผนล่าสุดก่อนบันทึกหรือยืนยัน`
- `plan_review_redraft_limit`:
  `แผนนี้ใช้จำนวนครั้งร่างใหม่ครบแล้ว ระบบจะไม่เรียกโมเดลเพิ่มโดยอัตโนมัติ`
- `text_budget_exceeded`:
  `งบข้อความสำหรับการร่างแผนไม่พอ ระบบยังไม่สร้างภาพและไม่เรียกผู้ให้บริการเพิ่ม`
- `approval_checkpoint_required`:
  `ขั้นตอนนี้ยังไม่ได้รับการยืนยันจากผู้ใช้ ระบบยังไม่เรียกผู้ให้บริการและยังไม่ใช้เครดิต`
- `approval_checkpoint_stale`:
  `ข้อมูลที่ยืนยันไว้เปลี่ยนแล้ว กรุณาตรวจสอบเวอร์ชันล่าสุดก่อนดำเนินการต่อ`
- `approval_checkpoint_consumed`:
  `การยืนยันนี้ถูกใช้ไปแล้ว งานที่สร้างใหม่ต้องตรวจสอบและยืนยันอีกครั้ง`

Raw provider errors, response bodies, URLs, and HTML are never shown.

---

## 21. UI projection and internal prompt separation

### 21.1 Separate fields

The API projection exposes:

```ts
type MarketplaceReviewPlanDisplayV2 = {
  productSummary: string;
  referenceSummary: {
    productReferenceSelected: boolean;
    characterReferenceSelected: boolean;
    environmentReferenceSelected: boolean;
    supportingProductAngleCount: number;
  };
  storyPlan: StoryArcPlanV1 | null;
  safeError: {
    reasonCode: string;
    message: string;
  } | null;
};
```

Internal generation context remains in separate non-projected fields/artifacts.

### 21.2 Forbidden UI markers

Normal Marketplace Auto Review UI must not render text containing:

```text
USER-SELECTED REFERENCE ANCHOR LOCK
VIDEO CHARACTER LOCK
PRODUCT FACTS LOCK
character-upload-sha256:
marketplace-product-image:
storageKey
uploadKey
providerResponseId
```

### 21.3 Legacy sanitization

While legacy runs exist, the client/server projection sanitizes old
`concept.productDetail` values before display. The long-term solution is
separate display data, not an ever-growing regex list.

For v2, sanitization is a typed projection boundary, not a client-only cleanup:
summary and heavy run responses must both expose `MarketplaceReviewPlanDisplayV2`,
and tests must assert that forbidden markers are absent from both serialized
projections. Storage keys, upload keys, provider response IDs, signed URLs, and
hashes may remain in restricted artifacts but must not be reachable through the
normal plan-review payload.

---

## 22. Security and privacy

1. Treat marketplace text, OCR, filenames, and uploaded-image metadata as
   untrusted content.
2. The instruction firewall remains server-authored and cannot be overridden by
   seller text.
3. Only references owned by or shared with the run tenant/user may be attached.
4. Internal hashes remain audit identifiers, not user content.
5. Diagnostic artifacts require admin/operations authorization.
6. Raw prompt/response artifacts must not contain API keys, authorization
   headers, private signed query parameters, or unrelated user data.
7. Provider requests carry only references required for the current stage/shot.
8. User edits are validated against claim and safety policies before
   downstream spend.
9. Every plan-review query/mutation re-checks run ownership, tenant access, product
   access, and the persisted architecture on the server; client visibility is not
   an authorization decision.
10. A shared product/group permission may read a plan only when its permission
    includes the corresponding review action; approval, redraft, edit, cancel, and
    retry permissions are evaluated separately where the existing policy supports
    that distinction.

---

## 23. Compatibility and migration

### 23.1 New runs

When `marketplaceStagedSequentialStoryboardV2` is enabled, new sequential runs
persist `staged_two_skill_v2` and never invoke
`product-review-sequential-storyboard`.

The current checkout has the legacy `marketplaceSequentialStoryboard` flag but does
not yet have the two v2 flags named in §24. Adding those flags and wiring their
defaults is implementation work; this specification must not be read as evidence
that v2 routing already exists.

### 23.2 Existing completed/in-progress legacy runs

- Completed v1 runs remain readable.
- Runs with generated/accepted images remain on their frozen v1 architecture.
- Resume dispatches by persisted architecture.
- Feature 141 does not rewrite existing media artifacts.

### 23.3 Failed pre-image legacy runs

A v1 run may upgrade to v2 only when all are true:

- it has a structural draft failure;
- it has no accepted/generated sequential images;
- it has no submitted video task;
- the user selects `ลองใหม่ด้วยระบบวางแผนใหม่` or an explicitly approved
  server migration path;
- the transition is recorded in metadata and the credit estimate is refreshed.

The upgrade preserves product/user inputs and reference selections but discards
the unusable monolithic draft. It never repeats the old three-round loop.

### 23.4 Old skill lifecycle

1. Keep `product-review-sequential-storyboard` installed for legacy resume
   during rollout.
2. Stop routing new v2 runs to it.
3. Mark it deprecated after v2 passes GA gates.
4. Remove only in a later feature after no resumable v1 runs depend on it.

---

## 24. Feature flags

```ts
marketplaceStagedSequentialStoryboardV2: boolean
marketplaceStagedSequentialStoryboardV2LiveSmoke: boolean
```

- Both flags default to `false` until Phase 1 smoke evidence is complete.
- The architecture flag selects v2 for new eligible runs.
- The live-smoke flag controls network-backed operational tests and is never
  required for ordinary unit/CI execution.
- Existing Feature 136 flag remains valid for legacy architecture selection
  during migration.
- The flag is sampled at run creation only; resume/retry/redraft dispatches by the
  frozen `planningArchitecture`, not by the current flag value.

---

## 25. Testing strategy

### 25.1 Skill bundle tests

For both new skills:

- `skill.md` and `SKILL.md` byte-identical;
- manifests parse cleanly;
- input/output schemas load;
- every object uses `additionalProperties: false`;
- all strings/arrays have explicit bounds;
- exact skill version matches output schema;
- no output field asks the model to report deterministic character counts or
  self-QC;
- generated input/output budget manifests remain within their versioned
  ceilings.

### 25.2 Story Arc Planner unit tests

- exactly nine shots and IDs 1-9;
- every duration exactly ten, total ninety;
- Thai dialogue required for non-silent mode;
- speech-fit validation;
- claim IDs resolve and blocked claims fail;
- reference roles resolve;
- guardian/assembly policy;
- price and internal-marker rejection;
- continuity link validation;
- narrative-only `storySummary` without hidden camera/style prompt prose;
- `productPresence` and required-reference-role consistency;
- total serialized input/output bounds;
- deterministic evidence overflow ranking and omitted-field diagnostics.

### 25.3 Synopsis-direct image-prompt compiler tests

- exact snapshot equals `REFERENCE MAPPING + storySummary` for a non-product
  shot, matching the Vertical Drama synopsis-direct pattern;
- a shared golden fixture remains byte-identical to
  `buildDeterministicPolicySafeImagePrompt`;
- exact snapshot equals `REFERENCE MAPPING + storySummary + compact product
  preservation` when a product may appear;
- `storySummary` is preserved verbatim after outer-whitespace trimming;
- stable output from the same plan and attachment manifest;
- reference mapping matches the actual ordered attachments exactly;
- reference labels are one-line bounded safe labels and cannot carry filenames,
  URLs, IDs, delimiters, or instruction-like metadata into the prompt;
- `productPresence="absent"` omits product image and preservation clause;
- `productPresence="required"` requires primary product as Image 1;
- primary product precedence over supporting angles;
- character/environment/continuity inclusion only when required;
- product clause covers shape, silhouette, proportions, real-world scale,
  relative size, color, material, surface/texture, labels/logos, construction,
  parts, and component count;
- output contains no compiler-added desired style, composition, camera, lens,
  lighting, pose, background inventory, dialogue, motion, transition, VFX,
  negative-prompt, or on-image-text prose;
- `motionIntent` and global continuity/style summaries never enter the image
  prompt;
- GPT Image 2 and Nano Banana 2 adapters preserve the same semantic prompt and
  differ only in reference syntax/payload;
- no prompt optimizer, cinematic prompt engine, or style enhancer is invoked;
- compiler, enqueued task, and provider-submission prompt hashes match exactly;
- canonical ordered-reference-manifest hashes match between enqueue and
  submission;
- any post-compile mutation fails locally before provider submission;
- no unsupported claims;
- no user-facing/internal-field cross-contamination;
- prompt target/maximum enforcement without semantic truncation;
- `gpt-image-2-image-to-image` accepts a 20,000-character prompt boundary and
  rejects 20,001 characters before provider submission;
- that model accepts 16 valid `input_urls`, rejects 17, and is never blocked by
  an unrelated lower UI/upload limit;
- unified-model auto-routing uses the effective image-to-image capability
  before reference validation and request construction;
- direct `gemini-3.1-flash-image` accepts up to its current catalogued 14-image
  ceiling, while aliased/reseller routes use their own effective capability;
- aspect-ratio/resolution combinations are validated from the versioned
  provider catalog.

### 25.4 Product-fidelity QA tests

- every hard identity field has an explicit failure fixture/reason code;
- one hard identity mismatch fails even when aesthetic quality is high;
- alternate composition, framing, lighting, background, and staging pass when
  story and product identity remain valid;
- scene color grading is distinguished from actual product recoloring;
- multi-view sheets are treated as one product rather than a collage;
- conflicting product variants fail before provider submission;
- retry uses the unchanged synopsis-direct prompt plus only the bounded failed
  identity-field correction;
- manual approval cannot authorize a changed product identity.

### 25.5 Shot Video Director tests

- one-shot input/output only;
- accepted image required;
- exact dialogue preserved;
- ten-second duration preserved;
- starts from visible image state;
- previous/next context is advisory and cannot rewrite the approved shot;
- prompt maximum enforced;
- price/claim/reference/identity checks;
- retry affects only the failed shot.

### 25.6 Stage-machine integration tests

- v2 start snapshots the flag/architecture once, persists the outbox operation,
  and returns before Story Arc provider execution;
- v2 initial start invokes Skill A once and does not call
  `buildGatewayCreativeAutoReviewPlan`,
  `rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`, or
  `runSequentialPromptPlanStage`;
- v2 redraft invokes Skill A once and has the same legacy negative-call
  assertions;
- plan-review hold blocks image spend;
- story-plan approval is required before any image-prompt compiler output is
  released to the image queue;
- each image prompt has its own approval checkpoint, and approving shot 1 does
  not implicitly approve shots 2-9;
- before approval, repeated worker advancement and repeated approval attempts create
  zero image reservations, media tasks, provider submissions, or image ledger rows;
- redraft and cancel are text-only/terminal respectively, and neither creates an
  image task or image-provider request;
- v2 plan approval does not require Feature 136 `finalQc`;
- approval compiles synopsis-direct prompts and releases image generation;
- image-unit construction does not require a pre-image `video_prompt`;
- a hard-fidelity image failure cannot be manually accepted, while an allowed
  warning override records explicit acceptance evidence before Skill B is eligible;
- image acceptance queues only that shot's video prompt;
- each accepted image creates an `image_result` checkpoint before Skill B/video
  work, and each returned video prompt creates a `video_prompt` checkpoint before
  video-provider spend;
- each returned video creates a per-shot `video_result` checkpoint before the
  next shot, audio, or final assembly can proceed; the result must be explicitly
  accepted or rejected;
- separate TTS/audio and final render paths remain blocked until their own
  `audio_plan`/`final_assembly` approvals are persisted;
- image regeneration invalidates only that shot downstream;
- plan edits require matching revision/digest and stale concurrent edits fail
  without a partial write;
- unauthorized user/tenant, wrong architecture, cancelled, and already-approved
  mutations fail closed without enqueueing work;
- redraft count and text-budget limits are enforced before a provider call;
- resume does not repay completed plan/shot prompt calls;
- redraft generation produces unique credit idempotency keys;
- start/redraft/per-shot retry returns after durable enqueue without waiting
  for a deliberately slow provider;
- repeating a disconnected request returns the same durable operation and does
  not duplicate a paid call;
- media task submission verifies prompt/reference hashes before any provider
  call and persists an image-prompt trace;
- summary and heavy API projections both pass the forbidden-marker sanitizer and
  expose no storage key, upload key, signed URL, provider response ID, or internal
  hash to the standard UI;
- legacy and v2 dispatch remain isolated.

### 25.7 UI tests

- safe plan renders nine shots and ninety seconds;
- internal marker strings never render;
- failed planner shows safe reason;
- failed video prompt identifies only the affected shot;
- plan-review loading, edit-saving, redraft-queued, approval-queued, stale-conflict,
  cancelled, and worker-failure states survive reload from persisted state;
- every checkpoint, including each video result, shows
  waiting/approved/rejected/superseded state and a visible
  per-shot approval action; reload and browser timeout never auto-approve;
- summary and heavy queries expose the same safe plan fields, while heavy detail is
  not fetched for unrelated runs;
- only approved v2 edits are shown as the next image-prompt input, and protected
  product facts/reference roles cannot be edited through the shot editor;
- credit evidence is human-readable;
- proxy/HTML/524 response bodies never render;
- raw diagnostics remain inaccessible from standard UI.

### 25.8 Live provider smoke test

A gated, explicitly network-backed smoke test must:

1. use a fixed authorized product/character fixture;
2. invoke the production Story Arc Planner route;
3. record model/provider, input/output tokens, finish reason, credits, and raw
   response hash;
4. require valid first-pass strict-schema output;
5. verify nine ten-second shots and total ninety seconds;
6. snapshot the exact synopsis-direct image prompt before submission and prove
   that the compiled, enqueued, and submitted hashes match and no hidden prompt
   enhancer added creative prose;
7. generate at least one authorized product-visible image through GPT Image 2
   and one through Nano Banana 2 using the same synopsis-direct contract;
8. verify product-fidelity hard fields and confirm creative composition was not
   used as a rejection criterion;
9. invoke at least one Shot Video Director call using an accepted image fixture;
10. validate its bounded output;
11. prove no image task exists before that shot's `image_prompt` approval, no
    video task exists before its `video_prompt` approval, and no separate audio or
    render task exists before its corresponding approval;
12. enforce a configured maximum credit budget;
13. fail without an automatic paid retry when the budget would be exceeded.

The smoke evidence bundle must include the fixture identifier, tenant authorization
scope, commit SHA, selected flags, exact command, maximum credit budget, provider
and model identifiers, artifact IDs/content hashes, and the rollback decision. A
smoke run is not considered complete when only a health check or a mocked test is
available.

The live smoke test is separate from ordinary CI and must be run before rollout
promotion.

---

## 26. Evaluation corpus

Minimum categories:

- furniture;
- mother/baby and child-related product;
- beauty/personal care;
- electronics;
- apparel;
- food/beverage;
- household utility;
- product-only, hands-only, and uploaded-presenter modes;
- with and without environment reference;
- single-file multi-view product sheet;
- conflicting seller text versus selected product image;
- undocumented assembly claim;
- Thai dialogue with native audio and separate TTS.

The corpus manifest must contain at least 16 named fixtures and be committed as a
versioned artifact (the detailed plan must choose the exact fixture directory).
Each fixture records a product snapshot hash, reference-manifest hash, output/frame
strategy, audio strategy, expected product-presence policy, allowed claim IDs,
expected redaction/safety conditions, and the maximum smoke credit budget. No
fixture may depend on mutable marketplace text without a captured snapshot.

For each case record:

- planner first-pass validity;
- planner token/credit usage;
- shot-level story coherence;
- claim correctness;
- reference-role correctness;
- synopsis-direct image-prompt size;
- exact synopsis preservation and absence of compiler-added creative prose;
- effective attachment mapping/capability by image model/provider route;
- product-fidelity result by hard identity field;
- composition/staging diversity across GPT Image 2 and Nano Banana 2 without
  product drift;
- image QA outcome;
- video-director token/credit usage;
- video prompt feasibility and dialogue fidelity.

Corpus pass/fail is evaluated per fixture and per stage. A fixture fails when any
hard product-identity field, blocked-claim rule, reference-role rule, plan-review
spend boundary, prompt hash, dialogue-duration rule, or safe-projection rule
fails, even if the aggregate success rate remains above the rollout threshold.

---

## 27. Rollout plan

### Phase 0 — offline contracts

- implement schemas, validators, deterministic compilers, and fixtures;
- no production routing;
- compare output size against Feature 136 fixtures.

### Phase 1 — live smoke

- run authorized capped live tests;
- require first-pass planner validity and complete diagnostics;
- fix contract issues before tenant rollout.

### Phase 2 — internal tenant

- enable v2 for internal/admin tenant;
- compare success, cost, latency, image QA, and video feasibility against v1;
- retain rollback to v1 for newly created test runs only.

### Phase 3 — limited tenant rollout

- 5%, 25%, then 50% of eligible sequential new runs;
- promotion requires all GA gates in §28;
- failed pre-image v1 runs may opt into v2 retry.

### Phase 4 — default for sequential mode

- v2 becomes default for new sequential runs;
- old skill marked deprecated;
- legacy resumes remain supported.

### Rollback and recovery

- Disable the v2 architecture flag for new runs and leave the live-smoke flag off.
- Do not switch an existing v2 run to v1 on resume; its frozen architecture is
  either resumed by the v2 worker or marked safely recoverable/failed with an
  operator reason.
- Do not delete v2 metadata, attempt rows, credit refs, provider events, or
  artifacts during rollback.
- Preserve the legacy gate and Feature 136 routing for newly created fallback
  runs only; verify one new legacy run and one resumable v2 run before declaring
  recovery complete.
- Record flag state, affected run IDs, last successful stage, credit/provider
  reconciliation, and the decision to re-enable or retire v2.

---

## 28. General-availability gates

All must pass:

1. Story Arc Planner first-pass validity ≥95% over the evaluation corpus.
2. No `finish_reason=length` in the accepted evaluation runs.
3. No response reaches its output-token ceiling in successful evaluation.
4. Plan plus nine Shot Video Director calls use ≤50% of the measured Feature
   136 failed text-token baseline on the incident fixture.
5. Exactly nine ten-second shots and total ninety seconds in every accepted
   plan.
6. Zero blocked claim/price/reference-index violations after deterministic
   validation.
7. Zero internal anchor-lock/SHA/storage markers in standard UI snapshots.
8. Shot-local retry never invalidates an unrelated accepted shot.
9. Resume/idempotency tests show no duplicate credit transaction.
10. Diagnostics include served model/provider, tokens, credits, finish reason,
    validation result, and hashes for every paid LLM call.
11. Selected production video models pass ten-second capability preflight.
12. Rollback and legacy-run resume tests pass.
13. The current GPT Image 2 image-to-image catalog and adapter accept up to 16
    valid input images and a prompt up to 20,000 characters without applying a
    stale lower limit.
14. Browser-facing start, redraft, and per-shot retry paths return after
    durable enqueue and do not wait through provider execution.
15. Direct and aliased/provider-routed Nano Banana 2 requests use the effective
    catalogued attachment capability; the direct Google model currently passes
    its 14-image boundary tests.
16. Synopsis-direct prompt snapshots contain zero compiler-added style,
    composition, camera, lens, lighting, pose, background, dialogue, motion,
    VFX, negative-prompt, or on-image-text prose.
17. Every accepted product-visible evaluation image passes all product-fidelity
    hard fields; no aggregate aesthetic score can override a hard mismatch.
18. QA does not reject an image merely because the model chose an unexpected
    but story-valid composition, framing, lighting, or environment.
19. Every image request has matching compiled/submitted prompt and ordered
    reference-manifest hashes; a mismatch fails before provider spend.
20. The mandatory plan-review hold proves zero image reservation/provider submission
    before approval, including repeated worker advancement and redraft/cancel paths.
21. The v2 architecture negative-call tests prove that new staged runs do not call
    the three Feature 136 authoring functions, while legacy resumes continue to use
    their frozen architecture.
22. Safe plan projection tests prove forbidden internal markers are absent from both
    summary and heavy API responses.
23. Completed v2 runs pass the existing render/library-finalization evidence gates;
    no run is marked complete from provider-task success alone.
24. Every credit-bearing image, video, audio, and render task has a matching
    approved checkpoint with equal content hash, revision, model/reference inputs,
    and cost estimate; one missing or stale approval blocks submission.

---

## 29. Acceptance criteria

### AC-1 — Compact global plan

Given valid product evidence and selected references, Skill A returns one strict
JSON object containing exactly nine ten-second shots and no image/video prompts.

### AC-2 — One coherent ninety-second story

The nine dialogue lines and shot summaries form one continuous Hook → Problem →
Insight → Proof/Demonstration → Result → CTA review appropriate to the selected
structure, while still allowing category-specific beat emphasis.

### AC-3 — Deterministic synopsis-direct image prompt

Each approved shot produces a provider-ready synopsis-direct image prompt
without a default LLM call. It contains only reference mapping, the approved
story summary verbatim, and the compact product-preservation clause when
applicable, while leaving composition to the selected image model.

### AC-4 — Model-led image interpretation

The default compiler adds no creative description beyond the approved
`storySummary`. GPT Image 2 or Nano Banana 2 chooses the composition, framing,
viewpoint, lighting, environment, pose, and visual treatment.

### AC-5 — Immutable product identity

When a product may appear, the primary product image is attached and the only
default extra prose is the compact preservation clause. Every accepted image
keeps product shape, proportions, real-world scale, relative size, color,
material, surface/texture, labels/logos, construction, visible parts, and
component count unchanged.

### AC-6 — Image-grounded video prompt

No shot video prompt is authored before its accepted image exists. Skill B sees
that image and returns one bounded prompt for that shot.

### AC-7 — Failure isolation

A failure in shot 4 image, video prompt, or video generation does not regenerate
Skill A output or invalidate shots 1-3 and 5-9.

### AC-8 — Actual usage billing

Every provider-reached call is charged according to actual usage and recorded at
story-plan or shot granularity with idempotency.

### AC-9 — No unexplained token limit

Output-token allowances are derived from bounded schemas and selected model
capabilities. Tests fail when schema growth exceeds the configured computed
budget.

### AC-10 — Diagnosable failures

Operations can determine the exact stage/shot, served model/provider, token
usage, credits, finish reason, response size/hash, enforcement mode, and
validation errors without reproducing the paid call.

### AC-11 — Safe UI

The Marketplace Auto Review UI displays only safe product summaries, shot
content, reference-role summaries, and safe errors. It never displays internal
lock instructions, SHA values, storage refs, or raw provider responses.

### AC-12 — Legacy safety

Existing v1 runs resume according to their persisted architecture. New v2 runs
never call the Feature 136 monolithic skill.

### AC-13 — Provider capability correctness

For `gpt-image-2-image-to-image`, SmartSpecPro accepts the documented prompt
and input-image boundaries, validates aspect ratio/resolution through the
versioned provider catalog, and does not block valid references using an
unrelated lower UI/upload limit. The same rule applies when that provider model
is selected through the unified GPT Image 2 auto-routing entry. Direct and
aliased/provider-routed Nano Banana 2 requests likewise use their effective
catalogued limits rather than a GPT Image 2 or generic UI limit.

### AC-14 — Durable asynchronous requests

Start, redraft, and shot retry operations persist and return before slow
provider work begins. A disconnect/retry resolves to the same operation, and
the normal UI never displays raw `524` HTML.

### AC-15 — Immutable image submission

For every image attempt, the prompt and canonical ordered reference-manifest
hashes at provider submission match the compiled/enqueued hashes. Any hidden
enhancement or mutation fails locally before provider spend and produces a
diagnosable internal trace.

### AC-16 — Mandatory approval before visual spend

Every new v2 run enters a durable `awaiting_plan_review` state after Story Arc
validation. Until an approved plan version is persisted, repeated advancement,
redraft, cancel, and duplicate approval requests create no image reservation,
media task, image-provider request, or image ledger row. The user-facing error for
an invalid approval is a safe reason code, not a provider response.

### AC-17 — Text-only redraft and terminal cancel

A redraft invalidates only unstarted downstream v2 state, records a distinct
idempotent text operation, and consumes no image/video credit. Cancel is terminal,
idempotent, and consumes no visual credit. For a staged run, cancellation must
also enumerate `stagedPipeline.tasks`, persist provider-cancellation evidence
before refunding, refund only in-flight reservations, and preserve completed
image/video/audio artifacts. A redraft never falls back to the Feature 136
full-pack authoring loop.

### AC-17a — Storyboard Review final-render gate

For a run whose persisted architecture is `staged_two_skill_v2`, the
Storyboard Review/HyperFrames Final Composite API must reject paid queueing
unless the latest non-superseded `final_assembly` checkpoint is `approved` or
`consumed`. The Storyboard Review UI must show the same gate and direct the user
back to Job Workbench before rendering. Legacy and manual Storyboard Review
runs retain their existing behavior.

### AC-17b — Multi-job navigation and waiting-state semantics

For a selected product, Job Setup and Job Workbench must list all authorized
Auto Review runs returned by the product-scoped run query, newest first. Each
item must expose its run identity, created/updated time, staged or legacy type,
current checkpoint, and safe human-readable status. Selecting an item must
open that exact run without starting a new run or losing its persisted
checkpoint state. The list must include terminal and historical runs, not only
the latest or currently active run, and must provide a separate `สร้าง Job Review
ใหม่` action.

When a staged run has `status=running` but its current checkpoint/stage is
`blocked_needs_user` or has an `awaiting_*` state, the UI must display
`รอตรวจ/ยืนยัน` (or equivalent localized copy), not `กำลังทำงาน`. Opening the
new-job route must not implicitly resume, approve, or create a run.

### AC-17c — Job-scoped product reference selection

Job Setup must render a product-reference picker containing all images attached
to the selected product. The picker must show which image is the Product Anchor
and, when sequential storyboard mode is active, allow the user to select or
deselect supporting product images and optionally assign safe angle labels. The
selected anchor and supporting images must be reflected in the plan/estimate
and the exact `referenceAnchors` payload sent at start. This selection is
job-scoped: changing it must not add, remove, or modify the product's stored
images. Once the run starts, its persisted reference anchors remain the
source-of-truth for that run rather than silently changing with later Product
Detail edits.

### AC-18 — Architecture isolation

The v2 start, redraft, resume, worker, and recovery paths dispatch from persisted
`planningArchitecture`. New staged runs do not call
`buildGatewayCreativeAutoReviewPlan`,
`rewriteMarketplaceAutoReviewPlanVoiceoverWithSkill`, or
`runSequentialPromptPlanStage`; legacy runs remain resumable without conversion.

### AC-19 — Safe projection

Both summary and heavy plan-review API projections expose typed safe display data.
The standard UI cannot receive internal lock directives, hashes, storage/upload
keys, signed URLs, provider response IDs, or raw provider errors.

### AC-20 — Shot-local state and invalidation

Editing/redrafting before image approval invalidates only the affected unstarted
downstream state. Image regeneration invalidates only that shot's video prompt,
video result, and video state. Video regeneration invalidates only that shot's
video result and video state. Every attempt persists architecture, shot, attempt, prompt hash, and
ordered reference-manifest hash so stale work cannot be submitted.

### AC-21 — End-to-end review completion

After the nine shot units pass their required image/video/audio QA and any selected
human review, the existing render and library-finalization gates produce the same
publishable package evidence required by legacy runs: ordered media, continuity
proof, render probe, final media QA, package manifest, credit refs, and library
linkage. A v2 run cannot report `completed` while any required shot or finalization
proof is missing.

### AC-22 — Mandatory approval before every downstream credit

The default v2 policy persists and enforces human checkpoints for story plan,
every shot image prompt, every generated image result, every shot video prompt,
every generated video result, separate audio/TTS work, and final assembly/render.
A provider task is rejected
before reservation when its checkpoint is missing, rejected, consumed, stale, or
has a different content hash/revision/model/reference set/cost estimate. Approval
of one shot never implicitly approves another shot.

---

## 30. Implementation boundaries and release gates

The implementation is separated into these workstreams:

1. Story Arc Planner skill bundle, schemas, validator, and live-smoke harness.
2. Evidence envelope and reference manifest v2.
3. Deterministic synopsis-direct image-prompt compiler with shared golden
   parity against Vertical Drama.
4. Marketplace Auto Review stage integration and durable per-shot state.
5. Shot Video Director skill and video-generation integration.
6. Credits, diagnostics artifacts, finish-reason propagation, and metrics.
7. Safe API/UI projection and legacy sanitization.
8. Compatibility, failed-v1 upgrade, feature flags, and rollout gates.
9. Unit, integration, UI, live-provider, and cost-regression tests.

The deep-plan/deep-implement work has now mapped these boundaries to the current
checkout and recorded the implementation evidence under
`specs/feature/141-marketplace-auto-review-staged-storyboard-pipeline/implementation/`.
The remaining release gates are operational validation, not an invitation to
reintroduce an uninterruptible legacy execution path.

---

## 31. Definition of done and remaining release gates

The working-tree implementation is considered functionally complete when it
proves:

- the two-skill boundary;
- exactly nine ten-second shots;
- deterministic synopsis-direct image-prompt compilation;
- video-prompt authoring after accepted image generation;
- actual provider usage billing;
- one repair maximum at each LLM authoring boundary;
- shot-local failure isolation;
- strict bounded provider schemas;
- compatibility with the already-mandatory legacy plan-review gate, including
  zero-image-spend-before-approval behavior;
- the mandatory `all_checkpoints_required` policy for story, image prompt, image
  result, video prompt, video result, audio plan, and final assembly approvals;
- v2 architecture versioning and legacy migration policy;
- exact ownership of v2 metadata, compatibility projection, and artifact kinds;
- UI/internal-context separation;
- measurable cost and first-pass-success GA gates;
- the authorized live-smoke fixture, maximum credit budget, evaluation corpus, and
  rollback evidence required before enabling the v2 flag.

The working tree now implements the staged contract and the focused Feature 141
tests pass. It is not a production/deployment claim: provider-backed smoke with
test credits, browser viewport/keyboard/accessibility evidence, tenant rollout,
alert thresholds, rollback rehearsal, and deployment health verification remain
required before enabling or declaring production readiness.
