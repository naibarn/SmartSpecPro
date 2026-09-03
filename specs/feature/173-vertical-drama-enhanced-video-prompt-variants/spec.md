# Feature 173 — Vertical Drama Legacy/Enhanced Video Prompt Variants

**Status:** DESIGN — READY FOR USER REVIEW

**Created:** 2026-09-01

**Priority:** P1 — additive prompt quality upgrade with zero legacy-flow change

**Owner:** Vertical Drama / Prompt Skills / Media Generation / UX

**Depends on:** Feature 131 Vertical Drama storyboard video flow, Feature 149
video prompt learning/QC, Feature 150 semantic verification, Feature 155 cost
control, Feature 161 async skill jobs, Feature 167 start/stop frame generation,
Feature 170 multimodal reference/video prompt contract, and the current
`generic-commercial-video-director` v11 package.

## 1. Executive decision

Add a second, explicitly selected video-prompt generation path to each Vertical
Drama storyboard shot:

- **Legacy:** the existing `generateShotVideoPrompt` flow and its current
  persistence/render behavior, unchanged.
- **Enhanced:** a new, opt-in job using the constrained
  `generic-commercial-video-director` planner/finalizer contract and the
  current Drama Series media/capability rules.

Both results are stored as versioned prompt variants. The Storyboard renders
one prompt editor, with a `Legacy` / `Enhanced` selector. Generating an
Enhanced prompt never replaces the current prompt. The user must explicitly
choose `ใช้ prompt นี้` before the selected variant is projected into the
backward-compatible `clip.prompt` fields used by video rendering.

This feature is a **parallel authoring surface**, not a global skill-routing
change and not a replacement of the existing Drama pipeline.

The media-model decision is explicit:

| Role | Selection | Rule |
|---|---|---|
| Start/stop frame rendering | `selectedImageModelId` | Image model; may share a provider connection with video but is a separate model contract. |
| Prompt authoring/reasoning | `authoringModelId` | Vision + structured-output LLM chosen by the server/runtime gate; not a video-generation model. |
| Actual video generation | `selectedVideoModelId` | Exact enabled media-model catalog row; drives capability facts, provider mode, limits, references, audio, and prompt budget. |

The image and video model IDs must therefore remain separate even when the same
vendor, credential, or product family can serve both roles. A convenience
"recommended media pair" may be offered later, but it must persist two
independent IDs.

## 2. Current implementation boundaries

The design starts from the existing contracts rather than introducing a second
video-generation pipeline:

| Boundary | Current behavior | Feature 173 rule |
|---|---|---|
| Storyboard shot card | Renders one video prompt editor and one shot-level legacy generate action, including split-shot compatibility. | Add one Enhanced action and a variant selector without changing the existing action's callback or layout contract. |
| Legacy generation | `VerticalDramaEpisodePage` submits `generateShotVideoPrompt`, polls a durable job, and the router replaces the matching clip prompt. | Keep this path byte-compatible. Enhanced uses a separate job kind and never writes the legacy projection during generation. |
| Prompt persistence | `motionPromptPack.clips[].prompt` is the field consumed by render, QC, and downstream assembly. | Keep it as the active projection for old readers; add a versioned, additive variant store beside it. |
| Media grounding | Approved start/stop/reference assets and model-aware capability facts already exist in the Vertical Drama path and Feature 170. | Enhanced must consume the same server-resolved bundle and exact video-model profile. |
| Skill runtime | The v11 package declares an OpenAI Agents SDK range and custom capability manifest. The current app runtime still has separate readiness blockers. | Enhanced is disabled until its readiness gate passes; it must never silently fall back to Legacy. |
| Credits and side effects | Core/Workflow Controller owns paid calls and durable state. | Generic Director may reason and return structured output only; Core owns admission, credits, persistence, render, publish, and tenant boundaries. |

The current legacy button and prompt editor are located in
`apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
and the parent job flow is in
`apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`. The existing
`VerticalDramaMotionPromptPack` contract is defined in
`apps/web/shared/verticalDramaSeries/contracts.ts`.

## 3. Goals

1. Give a creator a deliberate choice between the existing prompt and a new
   Enhanced prompt for every shot or sub-episode storyboard.
2. Keep the current Legacy button, API, job lifecycle, prompt projection, and
   paid video render behavior unchanged.
3. Let Enhanced use structured reasoning, vision grounding, continuity context,
   approved references, and provider/model-specific prompt compilation.
4. Show both variants in one familiar prompt editor without duplicating the
   editing surface.
5. Preserve the complete prompt bundle, not just positive prompt text, when a
   variant is selected.
6. Make the exact target video model and capability profile visible and
   reproducible for every Enhanced result.
7. Prevent stale model/reference/context results from being applied silently.
8. Make failures, readiness blockers, cost, and unsupported media combinations
   clear before any paid call.
9. Keep the feature isolated behind a Vertical Drama feature flag and a runtime
   readiness gate so unrelated skills are unaffected.
10. Leave a migration path for prompt history, A/B comparison, per-series
    policies, and future provider/model versions.

### Grok unified image transport

For the SmartAIHub/Kie market transport, Grok Imagine Video 1.5 receives the
approved Start Frame and selected image references as one ordered `image_urls`
array. The Start Frame is serialized first, remains the primary continuity
anchor, and consumes one of the provider's seven image slots. It must not be
sent again as `first_frame_url` for this mode. Because this transport does not
carry hard temporal frame semantics when additional references are present,
Enhanced prompt text must preserve visual continuity without promising a
literal frame-0 guarantee. Stop Frame, video references, and audio references
remain unsupported for this Grok mode and must stay blocked before any paid
submission. This rule is scoped to the Grok app transport profile and does not
alter Legacy or other providers' frame mapping.

## 4. Non-goals

1. Do not replace or refactor the existing Legacy prompt path in this feature.
2. Do not make `generic-commercial-video-director` globally visible, default, or
   auto-triggered for unrelated skills.
3. Do not let an Agent choose the provider, video model, credits, tenant, or
   publish action autonomously.
4. Do not create two competing sources of truth for approved media, character
   identity, dialogue, continuity, or video-model capability.
5. Do not generate image prompts or start/stop images from the Enhanced video
   prompt button.
6. Do not run both prompt modes automatically for all nine shots.
7. Do not silently fall back from Enhanced to Legacy when the Enhanced runtime,
   model, provider profile, or required vision capability is unavailable.
8. Do not require the image model and video model to be identical.

## 5. User experience contract

### 5.1 Shot-level actions

The two generation actions appear together in the existing video-prompt action
area:

```text
[สร้างพรอมต์วิดีโอ]  [สร้างพรอมต์วิดีโอ (Enhanced)]
```

Both actions are shot-level, even when a shot contains speaker-aware sub-shots.
The behavior remains one job per shot that returns the matching clip/sub-clip
variants. The Enhanced action must not be rendered once per sub-shot.

The Legacy action keeps its current confirmation, credit behavior, idempotency,
status, error, and retry semantics. The Enhanced action has its own confirmation
that states:

- Enhanced runtime/skill name and version;
- authoring model;
- exact target video model;
- expected credit cost or cost range;
- whether vision/reference inspection is required;
- whether a quality loop is enabled;
- that the existing prompt will not be overwritten until the user applies it.

The action is disabled with a visible reason when the approved image/reference
precondition, model selection, feature flag, or Enhanced runtime readiness gate
fails.

### 5.2 One editor, two variants

The existing `InlineEditablePromptBox` remains the only prompt text editor. Add
a compact variant selector above or inside its title row:

```text
Prompt version: [ Legacy ] [ Enhanced ]
Target: <exact video model>   Status: <ready/stale/not generated>

<one InlineEditablePromptBox>

[ใช้ prompt นี้]
```

Rules:

1. `Legacy` displays the current legacy variant.
2. `Enhanced` displays the latest successful Enhanced variant or an explicit
   empty/not-generated state.
3. Generating Enhanced selects the Enhanced preview only after success; it does
   not change the active render projection.
4. `ใช้ prompt นี้` is an explicit, free apply operation. It projects the full
   selected bundle into the existing active clip fields.
5. Selecting a tab alone does not change which prompt the paid video renderer
   will use. The UI must show which variant is currently active for rendering.
6. If the preview is stale, `ใช้ prompt นี้` is disabled and the UI explains
   whether the user must regenerate because the shot, asset bundle, or target
   video model changed.
7. A user edit is scoped to the selected variant and must not erase the other
   variant. It marks the edited variant as user-edited and invalidates any
   terminal skill stamp according to Feature 170's finalization rule.
8. Existing clips without variant metadata render exactly as before. Their
   current `clip.prompt` is treated as the Legacy variant until a variant store
   is created.
9. The editor keeps dirty buffers keyed by exact clip/sub-shot and variant. A
   tab switch, refresh warning, Apply, or new generation cannot silently discard
   unsaved text; the user must save, cancel, or explicitly confirm the discard.

### 5.3 Model and readiness display

The prompt card must distinguish three model roles rather than showing one
ambiguous "AI model" label:

- `Image model`: source of the approved start/stop frame, if shown;
- `Prompt authoring model`: LLM that reasoned over the shot and references;
- `Video target model`: exact media model that will receive the prompt.

The Enhanced card shows the target model ID/name, provider mode/family,
capability-profile version, reference limit, audio mode, and prompt budget when
available. If the current episode video model no longer matches the variant's
snapshot, show a blocking `stale/mismatch` state before apply or paid render.

### 5.4 Cost and concurrency UX

1. Apply/switching variants is free and never spends credits.
2. Each generation button has its own pending/error state.
3. Only one generation job per shot/variant is admitted for the same idempotency
   key. Repeated clicks cannot create duplicate paid jobs.
4. By default, a second variant generation for the same shot is disabled while
   any generation job for that shot is active, preventing accidental double
   spend and ambiguous comparisons. This is an active-job guard, not a block
   based on which variant is currently active for rendering. After the first
   job reaches a terminal state, the other variant can be generated explicitly.
5. A future explicit A/B action may run both variants, but it is out of scope for
   v1 and must show the combined estimate before admission.
6. The confirmation snapshot is the single user authorization for the Enhanced
   job. The server recomputes cost/model/reference facts at admission; if they
   changed, it rejects before spending and asks for a fresh confirmation rather
   than silently charging a different operation.
7. V1 blocks Apply for the same shot while any Legacy/Enhanced generation or
   Enhanced finalization job is active, with a clear `อีก variant กำลังทำงาน`/
   “another variant is running” reason. Once terminal, Apply re-reads and
   validates the candidate.

### 5.5 Display state versus active render state

The client must keep two deliberately different concepts:

- `viewedVariant` is UI-only state for the tab currently shown in the one
  editor. It may be restored as a convenience after refresh, but it never
  changes the paid renderer, active prompt, credit behavior, or job admission.
- `activeVariant` is persisted server state. Once a variant store exists, it is
  changed only by the atomic Apply operation and is the source used to project
  the existing `clip.*` fields consumed by rendering and older readers. The
  first lazy store creation seeds `activeVariant: "legacy"` as a no-op state
  stamp for the already-active Legacy projection.

The UI must show both states when they differ, for example `กำลังดู Enhanced`
and `ใช้ render อยู่ Legacy`. A refresh may restore `viewedVariant` only when
that variant still exists; the active-render badge is always derived from the
server response and cannot be inferred from the selected tab.

The existing paid video-render action always submits the persisted active
projection. When the user is viewing a different preview, the UI must show that
the render action still uses the active variant and offer `ใช้ prompt นี้` first;
it must not silently render the viewed preview or silently switch active state.

## 6. Versioned prompt-variant contract

### 6.1 Active projection and additive storage

The existing fields remain the backward-compatible active projection:

```ts
clip.prompt
clip.negativeMotionPrompt
clip.dialogue
clip.audioDirection
clip.requiredDisclosure
clip.startFrameAssetId
clip.endFrameAssetId
clip.extraReferenceAssetIds
clip.promptModelTarget
clip.frameAnalysis
clip.castPositionLock
clip.motionProfile
clip.effectiveRisk
clip.motionContractStatus
clip.promptQuality
```

V1 has one canonical storage location: an optional
`motionPromptPack.clips[].videoPromptVariants` property on the exact clip. A
pack-level read helper may index those clip stores for the UI, but it is not a
second source of truth. For a split-shot group, the successful group fingerprint
is written to every participating clip store and must match across the group.
Add this versioned store additively:

```ts
type VideoPromptVariantId = "legacy" | "enhanced";

type VerticalDramaVideoPromptVariant = {
  variantId: VideoPromptVariantId;
  status: "ready" | "stale" | "user_edited" | "failed";
  prompt: string;
  negativeMotionPrompt?: string;
  dialogue?: VerticalDramaMotionPromptClipDialogueLine[];
  audioDirection?: string;
  requiredDisclosure?: string;
  promptModelTarget?: VideoPromptModelTarget;
  frameAnalysis?: unknown;
  castPositionLock?: VerticalDramaCastPositionLock;
  motionProfile?: unknown;
  effectiveRisk?: VdIdentityRisk;
  motionContractStatus?: VdMotionContractStatus;
  promptQuality?: unknown;
  /** Exact Feature 170 media selection used by authoring and compilation. */
  mediaBundle?: VideoShotMediaBundle;
  warnings?: VerticalDramaWarning[];
  engine: "legacy" | "generic-commercial-video-director";
  skillSlug?: string;
  skillVersion?: string;
  sourceImageModelId?: string;
  authoringModelId?: string;
  targetVideoModelId: string;
  providerProfileId?: string;
  providerPlanHash?: string;
  targetVideoModelSnapshot?: {
    provider?: string;
    modelName?: string;
    family?: string;
    capabilityProfileVersion?: string;
    capabilityFingerprint?: string;
    promptBudget?: number;
  };
  mediaBundleRevision?: number;
  mediaBundleFingerprint?: string;
  executionPlanFingerprint?: string;
  canonicalInputFingerprint: string;
  promptHash: string;
  terminalPromptHash?: string;
  assumptions?: string[];
  researchProvenance?: {
    sourceIds: string[];
    retrievedAt: string;
    evidenceDigest: string;
  };
  generatedAt: string;
  userEditedAt?: string;
  staleReason?: string;
  failureCode?: string;
};

type VerticalDramaVideoPromptVariantStore = {
  schemaVersion: "vd-video-prompt-variants/1";
  activeVariant: VideoPromptVariantId;
  variantGroupFingerprint?: string;
  legacy?: VerticalDramaVideoPromptVariant;
  enhanced?: VerticalDramaVideoPromptVariant;
};
```

Fields shown as `unknown` in the pseudocode above are placeholders only. The
implementation must reuse or extract the existing typed clip contracts for
`frameAnalysis`, `motionProfile`, `promptQuality`, dialogue, and warnings; it
must not turn those fields into unvalidated arbitrary JSON. In particular,
`castPositionLock`, `effectiveRisk`, and `motionContractStatus` are typed prompt
metadata and must move with the selected bundle. `warnings`, `assumptions`, and
`researchProvenance` remain variant-scoped provenance/diagnostics because the
current `warnings` owner is the motion-pack level, not an arbitrary clip field;
Apply must retain and display them without inventing a new Legacy projection.
`identityQc` and `videoTask` are rendered-media/task lifecycle state, not prompt
variant fields; they remain attached to the existing media/task record and are
never copied from a preview into another variant.

The implementation may use a narrower TypeScript name, but the semantics are
mandatory:

- The active projection is the only input consumed by legacy render paths.
- The variant store holds complete prompt bundles, not just alternate prose.
- A variant's `mediaBundle` is the exact Feature 170 typed bundle (asset IDs,
  media types, roles, order, segments, revisions, and fingerprints), never raw
  provider URLs; the server re-resolves authorized transport at render time.
- When a Feature 170-aware render is requested and a variant store exists, the
  selected `activeVariant`'s `mediaBundle` is the media selection; the UI's
  `viewedVariant` is never used for transport. Old clips without a store continue
  to build media from their existing active fields.
- Compliance/dialogue fields such as `requiredDisclosure` and all current typed
  motion-contract metadata that affects render must move with the bundle,
  including cast-position lock, effective identity risk, and motion-contract
  status where present.
- Agent `warnings`, `assumptions`, confidence/review signals, and bounded
  research provenance must remain visible as provenance/diagnostics; they must
  not be silently converted into canonical story facts.
- `targetVideoModelId` is mandatory for a successful variant.
- For a successful Enhanced variant, `mediaBundle`,
  `targetVideoModelSnapshot`, `providerProfileId`, and `providerPlanHash` are
  mandatory, even when the bundle has no optional references; the empty/null
  media selection is still an exact Feature 170 bundle. These fields may be
  absent only on a Legacy snapshot when the old clip has no equivalent
  provenance, and that omission must be visible as Legacy provenance rather
  than treated as Enhanced readiness.
- The resolved provider profile/plan ID and hash must agree with the target
  catalog row; a Generic provider profile must never silently substitute for a
  Core catalog profile.
- Variant target/provider fields are immutable provenance snapshots, not a
  second current-model selector. The current selected video model remains the
  episode-level Core catalog row and is the only value used for readiness and
  render admission.
- `sourceImageModelId` is provenance for the approved frame asset only; it never
  becomes the video target and changing it alone does not stale an unchanged
  approved asset fingerprint.
- `mediaBundleFingerprint` and `canonicalInputFingerprint` identify the exact
  inputs used to produce the variant.
- A missing store on an old clip is a valid Legacy-compatible state.
- Failed Enhanced attempts are represented as job/error state and must not
  replace a successful Legacy variant.
- The additive clip property and any render-task provenance fields must be
  optional so old readers and old episode rows remain byte-compatible when the
  feature is disabled.

Reader behavior is explicit: absent `videoPromptVariants` means Legacy exactly
as today; schema version `vd-video-prompt-variants/1` is parsed and validated;
an unsupported future version or malformed store is shown as an Enhanced
compatibility diagnostic while the existing active projection remains the safe
Legacy-compatible render input. The reader must never reinterpret a corrupted
or future store as a successful Legacy replacement. A store whose
`activeVariant` points to a missing/non-ready member is also invalid for Apply;
the current persisted `clip.*` projection remains unchanged and the UI reports
repair/restore required rather than silently switching modes.

Feature 170's terminal-prompt equality rule applies independently to each
variant: a displayed variant must equal that variant's terminal result, while
only the applied variant is eligible for the active provider/render projection.

### 6.2 Snapshot and apply behavior

When Enhanced generation succeeds:

1. Lock/re-read the latest episode pack.
2. If no variant store exists, snapshot the current active projection as the
   Legacy variant and create the store with `activeVariant: "legacy"`; this is
   the explicit persisted representation of the existing behavior and does not
   change the visible/rendered prompt. The Legacy snapshot's
   `canonicalInputFingerprint` is a deterministic hash of the canonicalized
   pre-feature Legacy bundle, selected target ID, and any server-resolved media
   evidence available at snapshot time; it must not imply that an Enhanced
   Agent run occurred.
3. Write only `variants.enhanced` and its provenance.
4. Keep `activeVariant` and all active projection fields unchanged.
5. Use compare-and-swap on shot/clip identity, media bundle revision, and job ID
   so a late job cannot overwrite a newer result.

When the user applies a variant:

1. Re-read the latest shot and verify ownership.
2. For Enhanced, verify the variant is ready and its target model/capability
   fingerprint still matches the current selected video model exactly. For
   Legacy, preserve the existing model-family mismatch warning/render gate and
   do not introduce a new Enhanced-only hard block into the Legacy path.
3. Verify its media bundle/canonical input is not stale.
4. Copy the complete variant bundle, including media/reference mapping,
   compliance/dialogue/audio fields, model target, and quality metadata, into
   the active projection fields supported by the existing render contract.
   Feature 170's canonical media bundle remains the authority for actual asset
   authorization and transport.
5. Set `activeVariant` to the selected variant.
6. Preserve both stored variants and write an audit event with old/new variant,
   prompt hashes, and model IDs.

Apply must be atomic. If any compare-and-swap check fails, the operation returns
an actionable stale-state error and leaves the active prompt unchanged.

For split shots, Apply is shot-group atomic rather than clip-partial:

- an unsplit shot applies its single clip bundle;
- a split shot applies every ordered clip/sub-shot mapping in the shot group in
  one transaction, and every matching clip must have a ready, compatible
  selected variant;
- if one sub-shot is missing, stale, failed, or mismatched, Apply is blocked and
  lists the affected sub-shot numbers; no clip is switched;
- a successful group Apply computes and stores `variantGroupFingerprint` from
  the ordered clip IDs, speaker windows, dialogue/audio bundles, prompt hashes,
  target-model fingerprints, and media-bundle fingerprints;
- one Apply can never leave mixed Legacy/Enhanced active projections inside the
  same shot group. Per-clip editing remains possible only before the group is
  applied, or through a future explicitly versioned partial-apply feature.

Existing rendered media is never deleted or overwritten by Apply. A render task
must capture `variantId`, variant ID/hash, target video-model ID, capability
fingerprint, media-bundle fingerprint, and `variantGroupFingerprint` (when
applicable). If a different variant is applied after a video already exists,
the old media is preserved and marked `prompt_mismatch`; the UI requires an
explicit new render. Switching back clears that marker only when the stored
render provenance matches the restored active variant. Existing uploads or
pre-feature generated media without provenance are preserved as
`provenance_unknown`; they must never be presented as a verified match and need
an explicit render to establish matching provenance.

## 7. Enhanced generation architecture

### 7.1 Bounded skill boundary

Enhanced invokes the Generic Commercial Video Director only through a
Vertical-Drama-specific adapter. The adapter translates canonical Drama data
into the v11 input contract and translates the structured result back into the
shared video-prompt variant contract.

The Agent may:

- reason about shot intent, action, camera, timing, emotion, continuity, and
  dialogue placement;
- inspect authorized reference evidence through declared read-only tools;
- use bounded research only when the shot explicitly needs external factual
  grounding;
- return schema-validated prompt intent, reference plan, motion plan, and
  provider-specific draft instructions.

For ordinary fictional Drama shots, canonical series/episode/character/location
data is preferred over research. If research is explicitly requested, it must
be bounded by query, time, source count, and token budget; its source IDs,
retrieval timestamp, and compact evidence digest are snapshotted in provenance.
Research may inform the Enhanced draft but must never overwrite canonical Drama
state, and raw pages, full transcripts, credentials, signed URLs, or unbounded
payloads must not be persisted in the prompt variant.

The Agent may not:

- select an arbitrary provider or model;
- resolve tenant-owned assets by URL without Core authorization;
- spend credits, submit media generation, publish, delete, or mutate canonical
  story/character/location state;
- override approved character identity, dialogue, scene continuity, or provider
  capability facts.

Existing Drama safety, rights, age, and tie-in compliance gates remain
authoritative for Enhanced. The adapter may add clearer diagnostics, but it may
not weaken, skip, or replace those gates.

Story text, dialogue, uploaded labels, research snippets, and tool-returned
observations are untrusted content, not runtime instructions. Prompt-injection
text in any of them must be treated as data and cannot change tenant scope,
model pin, credit policy, approvals, or tool allow-list.

### 7.2 Canonical input assembly

The server builds one immutable Enhanced input snapshot containing:

- series, episode, shot, and sub-shot identity;
- canonical shot summary and storyboard camera/action context;
- dialogue lines, speaker order, silence intent, and speech budget;
- approved start frame, optional approved stop frame, and ordered typed
  references from Feature 170;
- Feature 170 attachment-inspection results for every attached item, including
  explicit `unavailable/metadata_only` status for media the authoring adapter
  cannot natively inspect; the Agent must not infer unseen video/audio content;
- character identity/portrait references and verified left-to-right positions;
- scene continuity lock, location reference, and bounded preceding/following-shot
  continuity context so the Enhanced prompt does not reset the episode's visual
  state;
- product/tie-in facts when applicable;
- prompt language, dialogue language, accent, duration, aspect ratio, and native
  audio preference;
- existing Drama safety, rights, age, and compliance policy snapshot;
- exact selected video model catalog row and capability snapshot;
- feature flags, quality mode, and bounded token/cost budget.

The browser may request a shot, but it cannot supply authoritative media types,
tenant IDs, provider URLs, model capabilities, or credit amounts. The server
rebuilds all of these from canonical records.

### 7.2.1 Bounded stage selection and adapter transform

The Enhanced shot button must not run the Generic Director's full commercial
campaign workflow for every click. The Vertical Drama adapter invokes only the
stage subset needed to author one grounded logical shot: observed start state,
cast resolution, continuity plan, shot plan, dialogue map, generation strategy,
prompt intent, prompt chain, and the exact provider compiler/finalizer. Script,
promotion, publishing, analytics, and unrelated post-production stages are
excluded unless a canonical Drama field explicitly requires a bounded
compliance/continuity check.

The adapter validates the target package's `input.schema.json` with
`additionalProperties: false` and maps only canonical fields, including:

| Generic input area | Drama source/adapter rule |
|---|---|
| `idea`, locale, format, dialogue | Server-built shot/episode/story and language/audio settings |
| `cast`, `assets`, `startFramePolicy` | Approved tenant-owned Feature 170 bundle and cast/position locks |
| `modelRouting` | Force `mode: locked`, `preferredModels: [selectedVideoModelId]`, empty `fallbackModels`, `allowCrossProviderFallback: false`; never browser-provided or Agent-selected |
| `promotionTarget` and constraints | Canonical tie-in/compliance facts when present; otherwise narrative branch |
| `researchMode` | Explicitly set `off`; set `on` only for server-admitted, bounded, explicitly requested research; never rely on the schema's `auto` default |
| `generationMode`, `approvalPolicy` | Force `plan_only`; human Apply and Core render approval remain required |
| `dialogue`, `startFramePolicy` | Preserve canonical dialogue with `allowAgentToDraft: false`; authoritative approved media with regeneration disabled |
| `budget`, `agentExecutionProfile` | Core admission and isolated runtime limits; default one candidate, bounded repair, `production` profile |

The adapter must explicitly set `modelRouting.mode = "locked"`, clear every
fallback model, and set `allowCrossProviderFallback = false` even though the
Generic input schema defaults to permissive fallback. A missing or conflicting
pin is a readiness failure. The LLM used by `agentRuntime.model` is the separate
authoring model and must not be confused with `selectedVideoModelId`.

The adapter must also explicitly set `researchMode = "off"` unless the user has
requested factual research for this shot and the server has admitted the
bounded research budget. It must not rely on the Generic schema's `auto`
default. In v1 the Core allow-list contains only the read-only asset-evidence
and pinned-provider-profile tools by default; bounded research is added only for
that admitted request. The cost-estimate tool may be omitted because Core owns
the estimate, and if registered it is read-only advisory data that cannot alter
admission, price, model, or credits. No package toggle may broaden this
allow-list silently.

The adapter maps only the required Generic output envelopes into the typed
Vertical Drama variant contract. It must not persist the entire Generic output,
stage traces, or campaign-level plans in the clip JSONB. Output schema failure,
unmapped required fields, or unsupported target-provider execution is a hard
failure with a diagnostic, not a best-effort fallback.

Reference and asset counts must satisfy both Feature 170 and target-provider
limits before the Agent run. If a list is over the allowed limit, the adapter
must ask for a deterministic selection or block; it must not silently trim,
reorder, or drop a reference that the prompt claims to use.

The package's `strict_provider_pin: false` setting and its configurable
`allow_*_tool` values are not trusted as the integration boundary. Core must
construct an explicit allow-list for read-only asset evidence, the pinned
capability profile, and optionally bounded research; disabled tools must not be
registered. Until those toggles are actually enforced or the adapter supplies
the allow-list wrapper, the Enhanced readiness gate remains blocked.

The package's `execution_mode: llm-only` metadata is not itself an OpenAI Agents
SDK execution bridge. Enhanced must call the package's declared isolated Python
runtime/entrypoint through an explicit Vertical Drama adapter; it must not send
the slug through the generic skill executor and assume that `SKILL.md` alone
will run `AgentFactory`. If that bridge, subprocess/worker health check, or
runtime capability manifest is absent, Enhanced is unavailable.

V1 must use stateless isolated runs (`useSessions: false`) unless a session is
explicitly namespaced by tenant, user, series, episode, shot, and job and is
redacted from sensitive media/credentials. Durable Core records and checkpoints,
not an Agents SDK session, remain the source of truth. A session may never be
reused across tenants or unrelated shots.

### 7.3 Model-aware compilation

The Enhanced authoring prompt receives a read-only `TARGET VIDEO MODEL` fact
block. The model ID and capabilities are facts, not a choice. A deterministic
compiler then validates and compiles the returned intent for the exact target
video model:

```text
Enhanced structured intent
  + approved media bundle
  + exact target video-model profile
  → provider/mode compiler
  → terminal optimized prompt bundle
  → schema + capability + prompt-budget validation
```

The compiler must validate at least:

- start/stop-frame support and temporal guarantees;
- accepted reference modalities and maximum counts;
- reference order and role mapping;
- duration/aspect-ratio/prompt-length budget;
- native audio and dialogue behavior;
- provider-specific fields and transport mode;
- logical-shot versus provider generation-segment limits; any continuation or
  extension chain must be represented by an existing Core-supported execution
  contract, otherwise Enhanced Apply is blocked;
- unsupported combinations before any paid video render.

The Generic Director's provider profiles may inform the adapter/compiler, but the
runtime media catalog and server capability resolver remain authoritative. There
must not be two independent model-capability sources that can disagree silently.

### 7.4 Terminal semantic ownership

There is exactly one terminal semantic writer for each Enhanced run. The
recommended boundary is:

1. Generic Director returns structured intent and provider-neutral draft
   instructions;
2. the existing Feature 170/app-owned provider-aware compiler and terminal
   finalizer produce the one final prompt bundle for the exact target model;
3. later stages only validate, hash, persist, display, and transport that
   final bundle.

The Generic Director must not run a second independent semantic optimizer after
the Core finalizer, and Core must not silently rewrite a terminal prompt in a
different semantic pass. If a validation failure requires semantic repair, the
same designated finalizer must run again and produce a new terminal hash, or the
job fails closed. The persisted, displayed, provider-submitted, and QC-checked
prompt must all equal the final hash for that variant.

### 7.5 Quality policy

Enhanced v1 uses one bounded staged authoring run per requested shot. That run
may contain the required observed-state, continuity, shot, dialogue, prompt,
and provider-compilation Agent stages, each schema-validated, followed by
deterministic validation and one terminal finalizer. It does not automatically
run best-of-N for every shot.

For any shot with an approved Start Frame, `observed_start_state` runs before
`prompt_intent`. Only the Start Frame is scene-state evidence for that stage;
character/product/location reference images remain identity or appearance
evidence and must not be mistaken for alternate frame-zero states. Existing
`clip.frameAnalysis` may be supplied as corroborating evidence, but the current
approved Start Frame wins whenever they differ.

The accepted prompt intent must continue after the observed frame-zero state.
It must not replay an already-completed action, reset an observed pose, move an
already-held object back to a shelf/table so it can be picked up again, duplicate
or teleport an object, or require an implausible furniture transformation. A
detected State #0 conflict receives at most one bounded repair attempt and then
fails closed before variant persistence or credit settlement.

When canonical dialogue is empty, Enhanced must author a silent acting beat and
the terminal prompt must explicitly prohibit spoken dialogue. Words or actions
that imply `asks`, `says`, `tells`, or equivalent speech are a policy failure,
not a substitute for canonical dialogue. When canonical Thai dialogue exists,
the exact Thai text remains controller-owned and immutable.

An explicit future/advanced quality mode may enable best-of-2 plus judge and one
repair round, subject to a displayed cost estimate. The existing normal/AI-edit
quality policy remains unchanged for Legacy.

All semantically meaningful prompt content must exist before the designated
terminal finalizer. Best-of-N or judge/repair is not an implicit second terminal
owner; if enabled later, it must select one candidate before the one finalizer
and disclose its additional cost.

## 8. Media-model policy

### 8.1 Image model and video model are separate

The system must persist and resolve these fields independently:

```text
startFramePlan.selectedImageModelId   → image generation
motionPromptPack.selectedVideoModelId → video target + video rendering
authoringModelId                      → prompt reasoning only
```

They may share:

- provider/vendor;
- connection/authentication;
- a user-facing preset or recommended profile;
- infrastructure and rate-limit pool, if the provider contract allows it.

They must not share implicitly:

- model ID;
- modality capability assumptions;
- prompt budget;
- reference limits;
- native audio or start/stop support;
- failure/retry classification.

If one catalog row genuinely supports both image and video, it can be selected
in both fields only after the registry declares both capabilities. The UI should
still persist two selections and show two roles.

### 8.2 Model-change behavior

| Change | Legacy variant | Enhanced variant |
|---|---|---|
| Current video model ID changes | Preserve prompt; show existing model-family mismatch warning and existing render gate. | Mark variant stale when exact target ID/profile differs; require regenerate or explicit supported migration. |
| Video capability profile changes | Preserve existing data; validate at render as today. | Mark stale when the fingerprint changes in a way that affects references, audio, temporal mode, or budget. |
| Image model changes but approved asset is unchanged | No prompt invalidation by model ID alone. | No prompt invalidation by model ID alone; asset fingerprint remains authoritative. |
| Approved start/stop/reference asset changes | Existing stale-artifact rules apply. | Mark both the media bundle and Enhanced variant stale; require a fresh grounded run. |
| Authoring model changes | N/A unless Legacy policy changes. | Keep existing variant reproducible; show provenance and offer regeneration. Do not silently rewrite it. |

### 8.3 Runtime readiness gate

The Enhanced button is available only when all are true:

1. Tenant/series Enhanced feature flag is enabled.
2. Generic Director package is present and its manifest/capability seed is
   accepted by the app runtime.
3. The actual OpenAI Agents SDK version satisfies the package contract, or the
   package runs in an explicitly isolated compatible runtime.
4. The requested authoring model is enabled, routable, vision-capable when
   required, and supports structured output.
5. The selected video model has a complete capability profile and provider mode.
6. Required approved assets pass tenant-scoped media admission.

If any check fails, the button remains disabled and shows the precise reason.
No silent Legacy fallback is allowed because that would mislead the user about
which prompt was generated.

For v1, the readiness decision is fixed: run the Generic Director in an
explicitly isolated compatible runtime. Runtime enablement, authoring-model
selection, and manifest approval are managed through Admin UI/database settings;
they must not depend on `VD_ENHANCED_*` values in `.env`. The installed SDK,
adapter, package, and manifest are probed read-only by the server and compared
with the approved database snapshot. The gate must report runtime mode, package
version, manifest version, SDK version, and the exact failed check.

The bridge command and skill root are server-owned constants, never editable
from the browser. Provider credentials are resolved from the existing encrypted
Provider Settings store and injected only into the short-lived bridge process;
they are never persisted in Enhanced settings or returned to the UI.

The package identity must also be internally consistent before enablement:
manifest, `pyproject.toml`, runtime package, and the `SKILL.md` front matter
must expose one version/entrypoint identity (currently the manifest/pyproject
declare `11.0.0` while `SKILL.md` front matter declares `1.0.0`). This metadata
drift is a readiness blocker until corrected or explicitly mapped and stamped in
the provenance; it must not be hidden by using a generic registry version.

Suggested independent rollout keys are:

- `verticalDramaEnhancedVideoPromptUi`;
- `verticalDramaEnhancedVideoPromptJobs`;
- `verticalDramaEnhancedVideoPromptApply`.

The exact flag names may follow the existing feature-flag naming convention, but
UI visibility, job admission, and Apply must remain independently disableable.

## 9. API, job, persistence, and recovery

### 9.1 Additive API surface

Add separate procedures or equivalent route contracts:

- `getEnhancedVideoPromptReadiness` — read-only, shot/model/tenant-scoped
  diagnostics used before enabling or admitting the Enhanced CTA;
- `generateEnhancedShotVideoPrompt` — paid/async Enhanced authoring job;
- `getEnhancedShotVideoPromptJob` — durable status/result projection;
- `updateVideoPromptVariant` — free, variant-scoped edit/save operation;
- `finalizeVideoPromptVariant` — explicit bounded re-finalization after an
  Enhanced user edit, with its own cost/approval estimate when the terminal
  finalizer is an LLM;
- `applyVideoPromptVariant` — free atomic selection/projection;

`getEnhancedVideoPromptReadiness` is strictly read-only and free: it creates no
job, credit reservation, provider call, or mutation. Its result may be cached
briefly for display, but the server must recompute all gates at generation,
finalization, and Apply admission.

V1 keeps `viewedVariant` client-local; it does not expose a mutation that could
be mistaken for active selection. A future display-preference endpoint, if
needed, must be named and authorized as a UI preference and must never mutate
`activeVariant` or active projection.

All new procedures require the existing authenticated edit permission and
server-side tenant/series/episode ownership checks. Job reads, retries, edits,
and Apply must use the same scope checks as the existing episode draft flow;
client-supplied tenant IDs, URLs, model capabilities, and credit amounts are
ignored for authorization and billing decisions.

The exact procedure names may follow current router naming, but the Legacy
`generateShotVideoPrompt` input and output contract must not be widened in a way
that changes its default behavior.

Legacy's existing edit/save callback remains unchanged. Enhanced preview edits
must use the new variant-scoped operation, write only the selected Enhanced
variant, preserve Legacy, and never update active projection until Apply. An
edited Enhanced variant is `user_edited`; its terminal hash is cleared or
revalidated according to Feature 170, and Apply is blocked until the designated
terminal finalizer has produced a matching terminal result. Re-finalization is
never triggered as a hidden side effect of Apply or paid video render: the UI
offers an explicit action, displays any additional estimate, and allows the user
to discard the edit and restore the previous terminal variant. Both edit and
finalize requests carry an expected variant revision/hash and use CAS; a stale
editor returns a conflict without overwriting newer text. Finalize is a
first-class, durable operation with its own idempotency key, explicit estimate/
confirmation when it can spend credits, and the same one-active-job and
settlement rules as generation.

Version 1 stores variants additively inside the existing `motionPromptPack`
JSONB projection to avoid a new history table and to keep old readers safe. A
future normalized `video_prompt_variants` table is allowed only if it remains a
projection/index of the same clip-owned contract; it must not become a second
source of truth.

There is no eager migration or backfill in v1. Existing episodes are read on
demand with the Legacy-compatible path and receive variant metadata only when a
user explicitly generates/edits/applies through the new flow. A disabled feature
therefore performs no write to old rows.

The writer must perform a server-side, clip-scoped JSONB patch/deep merge with
the latest row and retain unknown existing fields. It must never replace the
whole pack with a client round-trip snapshot, run a destructive migration, or
drop Feature 170 media/Legacy fields that the new adapter does not understand.
This preservation rule applies to every existing motion-pack writer and
artifact helper that can touch the same row (including model-selection,
start-frame completion/staleness, dialogue refresh, Legacy generation/repair,
storyboard handoff, and episode-repair paths), not only the new procedures. A
writer that changes an input relevant to Enhanced must preserve the stored
variant and mark it stale with a reason; it must not silently delete or rebuild
the other variant. The Legacy request payload, callback, visible result, and
job contract remain unchanged; only its server-side merge may be hardened to
preserve additive Enhanced metadata.

The new store must have a shared runtime validator (Zod or equivalent) for
`schemaVersion`, variant status, complete typed prompt fields, fingerprints,
model/provider provenance, and bounded diagnostics. TypeScript declarations are
not sufficient validation. Invalid/future stores are quarantined as
compatibility diagnostics while the existing active projection remains the
safe Legacy-compatible input.

### 9.2 Job identity and concurrency

The durable job identity includes:

```text
tenantId + userId + seriesId + episodeId + shotNumber + variantId + operation + idempotencyKey
```

The job record/result must include:

- operation (`generate` or explicit user-requested `finalize`);
- variant ID and engine;
- source clip/sub-shot mapping;
- canonical input/media bundle fingerprint;
- target video model ID/profile fingerprint;
- source image model ID when the approved frame has one;
- provider profile/plan ID and hash;
- authoring model ID;
- status, retry count, failure class, and cost ledger reference;
- result artifact ID or inline versioned bundle reference.

Every status and error projection must be keyed by `shotNumber + variantId` (and
by exact clip/sub-shot mapping inside a split-shot result). A split-shot job also
exposes an aggregate group status, but the aggregate must not replace the
per-variant keys. The UI must be able to show Legacy and Enhanced status/error
simultaneously without one poller clobbering the other.

Enhanced and Legacy jobs may use the same durable job infrastructure only if
`operation`, `variantId`, and `engine` are first-class fields in status,
uniqueness, polling,
recovery, and observability. They must not share a generic "active shot job"
key that causes one mode to cancel, replace, or hide the other.

Slow LLM/Agent execution occurs outside the final DB lock. Final variant merge
and apply use a fresh row read, row lock or compare-and-swap, and task-ID guard
so late terminal results cannot overwrite a newer variant or a newer active
projection.

Admission also enforces Core-owned per-user/tenant concurrency and rate limits
in addition to the one-active-job-per-shot rule. Requests over the limit remain
queued or return a retryable diagnostic with no credit reservation; the UI shows
queue state and never auto-fans out Enhanced generation across all nine shots.

The Enhanced job also has a Core-owned wall-clock deadline, max-turn/token
budget, and cancellation/timeout terminal state. A timeout or cancellation
releases/resolves its credit reservation through the existing ledger, preserves
any prior ready variant, and cannot mutate active projection. Retrying after a
terminal timeout requires a new explicit idempotency key or the existing
idempotent retry contract; it must not create a duplicate paid admission.

### 9.3 Credit behavior

1. Enhanced generation performs admission, rate-limit, and credit checks before
   the paid call.
2. Cost estimates must distinguish Legacy and Enhanced and account for optional
   inspection, structured reasoning, finalization, judge, repair, and retries.
   The estimate covers every bounded Agent stage and terminal-finalizer call in
   the selected execution profile.
3. Apply, switch, restore, and edit operations are free.
4. A failed Enhanced job must not charge more than the calls actually admitted
   by the existing credit ledger.
5. A provider/video render must use the active projected prompt and its matching
   provenance; it must never regenerate a different prompt implicitly.

### 9.4 Recovery and stale state

- Refresh/reload reconstructs both variants and each job status from durable
  records.
- A succeeded Enhanced result can be applied after leaving and returning to the
  page if its input/model fingerprints still match.
- A changed shot, dialogue, approved asset, reference order, target video model,
  or capability profile produces an actionable stale state.
- A late failed/succeeded job cannot clear a newer ready result.
- Existing task/media recovery and Legacy prompt render recovery remain
  unchanged.
- Existing video media is retained when active prompt provenance changes; a
  render result with a different variant/hash/model/capability/media fingerprint
  is projected as `prompt_mismatch` until the user explicitly renders the new
  active bundle.

## 10. Legacy isolation and impact controls

### 10.1 Explicit invariants

1. The Legacy generate button keeps its existing callback, mutation, job polling,
   persistence, and render projection.
2. Enhanced generation writes only the Enhanced variant until Apply.
3. Existing clips without the new store are valid and render unchanged.
4. Existing `clip.prompt` remains the active render source for all old consumers.
5. Generic skill registry, global skill ranking, and unrelated skill routes are
   not changed by enabling this feature.
6. OpenAI Agents SDK upgrades are not bundled into the first UI change. SDK
   alignment is a separate readiness/compatibility task or isolated runtime.
7. Feature flags provide kill switches for Enhanced UI, Enhanced jobs, and
   Enhanced apply without disabling Legacy.

Once a shot has a variant store, Legacy operations remain available and are
scoped as follows:

- old episodes and clips without a variant store keep their current read/write
  behavior and byte-compatible active projection;
- for an opted-in shot, Legacy manual edit/save, generation, bulk/repair
  generation, and dialogue refresh write `variants.legacy` first;
- if `activeVariant` is Legacy, the existing active projection may be updated by
  that Legacy operation using its current rules;
- if `activeVariant` is Enhanced, the new Legacy result is preview-only and must
  not replace Enhanced active fields; an explicit Apply Legacy is required to
  switch back;
- no Legacy operation may delete or mutate `variants.enhanced`.

Feature-flag behavior is an explicit compatibility matrix:

| UI flag | Jobs flag | Apply flag | Required behavior |
|---|---|---|---|
| off | any | any | Hide new Enhanced generation/apply controls; old Legacy UI/job/render path works. If active state is Enhanced, retain a non-interactive provenance indicator so the prompt is not mislabeled; existing projection remains readable and obeys normal stale/capability render gates. |
| on | off | off | Show stored previews if present, but disable new Enhanced generation and Apply with rollout diagnostics. |
| on | off | on | Disable new Enhanced generation; allow an already-ready, non-stale stored variant to Apply after normal CAS/model/media checks. |
| on | on | off | Allow Enhanced preview generation if ready; disable Apply and preserve Legacy active projection. |
| on | on | on | Full preview, edit, atomic Apply, restore, and render-provenance flow. |
| later disabled | any | any | Existing stored variants and active Enhanced projections remain readable; renderability still obeys normal stale/capability gates, and only the disabled operation is blocked. |

Flags are evaluated at admission and at final merge. An already-admitted
Enhanced job may finish and persist a non-active preview so its reserved work is
recoverable; if an emergency kill switch rejects its terminal merge, it must
release/settle credits and fail closed without falling back to Legacy or changing
active projection. No flag transition may delete stored variants or media.

### 10.2 Impact matrix

| Change | Expected impact | Required control |
|---|---:|---|
| Add variant metadata to motion pack | Low | Versioned additive reader/writer; old readers use `clip.prompt`. |
| Add Enhanced button/editor selector | Low | Component tests, feature flag, no change to Legacy props/handler. |
| Add Enhanced router/job | Medium | Separate job identity, credit admission, ownership, CAS, recovery tests. |
| Change shared video formatter | High | Avoid in v1; Enhanced compiler must produce final bundle before existing render. |
| Change global skill registry/runtime selection | High | Out of scope; route Enhanced through explicit Vertical Drama adapter. |
| Upgrade shared Agents SDK | Medium-high | Separate compatibility wave and full runtime suite. |
| Add image/video model pairing UI | Medium | Persist separate IDs and capability checks; no single-model assumption. |

## 11. Error and safety contract

The UI must distinguish at least:

- Enhanced runtime not ready;
- feature disabled for tenant/series;
- no selected video model;
- selected model unavailable or profile incomplete;
- required vision capability unavailable;
- approved start/stop/reference asset missing or unauthorized;
- media bundle changed while the job was running;
- schema/contract validation failure;
- provider mode incompatible with selected media;
- credit/rate-limit admission failure;
- transient provider failure eligible for bounded retry;
- permanent refusal or unsupported combination;
- stale variant requiring regeneration.

The API should normalize these into stable, non-secret codes so the UI can keep
copy separate from implementation details:

```text
ENHANCED_FEATURE_DISABLED
ENHANCED_RUNTIME_NOT_READY
ENHANCED_SDK_MISMATCH
ENHANCED_MANIFEST_MISMATCH
ENHANCED_AUTHORING_MODEL_UNAVAILABLE
ENHANCED_TARGET_MODEL_UNSUPPORTED
ENHANCED_MEDIA_BUNDLE_INVALID
ENHANCED_SCHEMA_INVALID
ENHANCED_BUDGET_EXCEEDED
ENHANCED_CONCURRENCY_LIMIT
PROMPT_VARIANT_STALE
PROMPT_VARIANT_GROUP_INCOMPLETE
PROMPT_VARIANT_TERMINAL_REQUIRED
PROMPT_VARIANT_CONFLICT
PROMPT_RENDER_MISMATCH
PROMPT_RENDER_PROVENANCE_UNKNOWN
```

Each error also declares retryability, affected shot/clip/variant, and the
user action (`retry`, `regenerate`, `apply_after_finalize`, `select_reference`,
or `contact_admin`). Internal exception text, provider secrets, and signed URLs
are not exposed.

Error messages must say what the user can do. They must not say "generated
successfully" when the result was silently produced by Legacy. Private storage
URLs, credentials, raw transcripts, and full sensitive media payloads must not
be logged in client-visible errors or ordinary audit logs.

Variant and job payloads have bounded storage limits. Persist only the compact,
schema-validated prompt bundle, hashes/fingerprints, model/capability snapshot,
bounded research provenance, and actionable diagnostics. Do not persist raw
media bytes, full research pages/transcripts, signed URLs, credentials, or
unbounded Agent/tool traces. If the output exceeds the target model or storage
budget, compact it through the designated terminal finalizer or fail closed;
never silently truncate semantic content. Warnings/assumptions and research
source IDs are bounded arrays with per-item length limits; source IDs and an
evidence digest are sufficient for audit without retaining the source payload.

### 11.1 Observability contract

Emit structured events for readiness, admission, stage completion, terminal
finalization, variant merge, Apply, stale/conflict, timeout/cancellation, and
render provenance mismatch. Dimensions may include tenant-safe IDs, shot/clip,
variant, job ID, trace ID, runtime/package/manifest hashes, target model,
provider profile, status, latency, token/credit totals, and failure code. Do not
include prompt text, raw research, media bytes, signed URLs, credentials, or
unredacted Agent/tool traces. The audit trail must make it possible to prove
that Legacy and Enhanced did not overwrite one another without exposing their
content.

## 12. Acceptance criteria

### Legacy safety

- [ ] Existing Legacy button behavior and payload remain unchanged.
- [ ] Existing clips without variant metadata load, edit, and render unchanged.
- [ ] Enhanced generation cannot modify active `clip.prompt` before Apply.
- [ ] Enhanced failure leaves the previous active prompt and Legacy variant intact.
- [ ] A late Enhanced result cannot overwrite a newer Legacy result or active
      projection.
- [ ] Disabling the Enhanced flag leaves Legacy available.
- [ ] Legacy-adjacent existing writers preserve `videoPromptVariants` and mark
      affected Enhanced variants stale when their canonical inputs change;
      they do not erase the store through a whole-pack replacement.

### Variant behavior

- [ ] A successful Enhanced result appears in the same prompt editor through an
      Enhanced selector.
- [ ] Legacy and Enhanced text/bundles survive page refresh.
- [ ] The versioned variant store is runtime-validated; malformed or future
      versions remain compatibility diagnostics and do not alter the active
      Legacy-compatible projection.
- [ ] Apply is explicit, free, atomic, and reversible.
- [ ] Applying a variant projects prompt, negative prompt, dialogue, audio,
      frame analysis, cast-position lock, motion profile, effective identity
      risk, motion-contract status, model target, and quality as one matching
      bundle; variant warnings/assumptions remain retained and visible as
      provenance diagnostics.
- [ ] Switching back to Legacy restores the original Legacy bundle, not a
      reconstructed or re-generated approximation.
- [ ] User edits affect only the selected variant and preserve the other one.
- [ ] Stale Enhanced variants cannot be applied without regeneration or an
      explicit, validated migration action; Legacy restore follows its existing
      mismatch/render-gate behavior.
- [ ] `viewedVariant` changes only the editor view; after first store creation
      `activeVariant` changes only through Apply, and both states are clear when
      they differ.
- [ ] Split-shot Apply is group-atomic, lists missing/stale sub-shots, and never
      leaves mixed active variants inside one shot group.
- [ ] Applying a variant after a rendered video preserves the old media and
      marks it `prompt_mismatch` until an explicit matching render completes.
- [ ] Pre-feature/uploaded media without provenance is marked
      `provenance_unknown`, never claimed to match, and is preserved.
- [ ] Enhanced preview edits use a variant-scoped save path and cannot update
      active projection or erase Legacy.
- [ ] Enhanced user edits visibly invalidate terminal equality; Apply/render
      require explicit re-finalization or discard, with no hidden spend.
- [ ] First Enhanced success lazily creates a Legacy snapshot with persisted
      `activeVariant: "legacy"` and a clearly non-Enhanced provenance stamp.
- [ ] Paid video render always uses the applied active projection; viewing an
      unapplied preview cannot submit that preview implicitly.

### Shot/sub-shot behavior

- [ ] The Enhanced button appears once per shot, not once per speaker sub-shot.
- [ ] A split-shot result maps each returned variant to the correct clip number
      and speaker window.
- [ ] A split-shot Apply validates every ordered clip and persists one matching
      `variantGroupFingerprint` atomically.
- [ ] Unsplit shots retain the existing clip-number behavior.
- [ ] Concurrent jobs for different shots do not clobber each other's variants.
- [ ] Repeated clicks with the same idempotency key create no duplicate paid
      job.

### Media-model correctness

- [ ] Image and video model IDs are persisted and displayed separately.
- [ ] Enhanced provenance optionally records the source image model without
      coupling it to the video target or staling an unchanged asset.
- [ ] A same-provider image/video pair does not collapse into one ambiguous
      model field.
- [ ] Enhanced prompt authoring receives the exact selected video model facts.
- [ ] Successful Enhanced variants persist the exact Feature 170 media bundle,
      target capability snapshot, and provider profile/plan ID plus hash;
      missing provenance blocks Enhanced Apply/readiness.
- [ ] The Agent cannot select or silently replace the target video model.
- [ ] Generic `modelRouting` fallback defaults are overridden with a locked,
      single-target, cross-provider-fallback-off policy.
- [ ] Adapter input explicitly sets `researchMode: "off"` unless bounded
      research was separately requested and admitted; tool registration follows
      the Core allow-list rather than package defaults.
- [ ] Provider profile/plan ID and hash are bound to the selected catalog row
      and persisted with the variant/job provenance.
- [ ] A target video-model change marks affected Enhanced variants stale.
- [ ] An image-model change alone does not stale a prompt when the approved
      asset fingerprint is unchanged.
- [ ] Approved start/stop/reference asset changes invalidate affected variants.
- [ ] Unsupported reference/audio/temporal combinations block before paid
      video rendering.

### Runtime and cost

- [ ] Enhanced remains disabled until SDK, manifest, capability, model, and
      asset readiness gates pass.
- [ ] The v1 gate reports the isolated runtime decision and exact SDK/package/
      manifest versions; it does not require a shared SDK upgrade.
- [ ] Enhanced does not route through the generic `llm-only` skill executor;
      the isolated Agent runtime bridge, tool allow-list, and version identity
      are verified before admission.
- [ ] Isolated runs do not reuse Agent sessions across tenants/shots, and
      durable job/checkpoint recovery works without session history.
- [ ] Runtime failure never silently falls back to Legacy.
- [ ] UI/jobs/Apply flag combinations follow the specified independent matrix.
- [ ] Confirmation shows the correct Enhanced cost estimate and quality mode.
- [ ] Credit ledger entries distinguish Legacy and Enhanced work.
- [ ] Generate and explicit post-edit finalize operations have distinct durable
      operation identity, idempotency, estimate/confirmation, and ledger
      settlement behavior.
- [ ] Normal Enhanced generation uses one bounded staged run by default;
      all stage calls and terminal finalization are included in the estimate;
      quality-loop extra calls require explicit mode/estimate.
- [ ] Job recovery after refresh preserves status, result, provenance, and
      stale checks.

### UI and accessibility

- [ ] Both buttons have distinct accessible names and loading/error states.
- [ ] The active render variant is visually and semantically obvious.
- [ ] The selector works by keyboard and exposes stale/blocked reasons.
- [ ] The single editor does not lose text when switching variants or when a
      generation job fails.
- [ ] Legacy operations after Enhanced opt-in update only the Legacy preview
      when Enhanced is active, and explicit Apply Legacy is required to switch.
- [ ] Mobile and desktop layouts keep both actions usable without hiding the
      active prompt state.

## 13. Test matrix

1. **Legacy regression:** existing router tests, prompt persistence, render
   admission, stale storyboard gates, retries, and split-shot behavior.
2. **Variant contract:** old pack read, first Enhanced snapshot, ready/stale/
   failed variants, full-bundle apply, restore Legacy, user edit, hash and
   fingerprint stability, runtime schema rejection, and preservation through
   every existing motion-pack writer.
3. **Concurrency:** Legacy and Enhanced completion order permutations, duplicate
   idempotency, row-lock/CAS conflicts, late terminal task guards, and two
   different shots generating concurrently.
   Include split-shot group-apply failure/success permutations and render
   provenance mismatch preservation.
4. **Model routing:** separate image/video/authoring models; same provider with
   different model IDs; vision required/unavailable; target model change;
   capability profile change; prompt budget and native-audio matrix.
5. **Reference grounding:** approved start/stop/reference bundle, changed asset,
   unauthorized asset, missing asset, reordered reference, dual-view, mixed
   media, and Feature 170 terminal prompt equality.
6. **Runtime gate:** target package manifest/schema/entrypoint checks,
   `test_agent_runtime_v11.py` (or equivalent isolated-runtime suite), SDK
   mismatch, metadata version drift, missing manifest seed, disabled skill,
   missing authoring model, missing target profile, tool allow-list enforcement,
   and no silent fallback.
7. **UI:** both buttons, confirmation, cost copy, independent status, same-editor
   selector, Apply/restore, stale block, refresh recovery, sub-shot mapping,
   keyboard, focus/selected/hover states, disabled/partial/error states, and
   responsive layout at canonical mobile/tablet/desktop viewports.
8. **Security/cost:** tenant ownership, prompt injection in untrusted metadata,
   no URL leakage, rate limiting, one credit admission per job, and no charge
   on free Apply.
9. **Browser proof:** existing Legacy flow remains functional with the flag off;
   Enhanced flow shows preview, explicit Apply, stale warning, and model-role
   labels with the flag on; verify the old rendered media is preserved and marked
   `prompt_mismatch` after switching active variant.

## 14. Rollout and implementation slices

### Slice 1 — Contract and projection

Add the versioned variant types, old-pack reader, active projection helper,
fingerprint/stale helpers, and focused tests. No UI or Enhanced job yet.

### Slice 2 — Enhanced runtime adapter

Implement the Vertical Drama adapter around the Generic Commercial Video
Director. Resolve canonical assets and exact target model server-side. Add
readiness diagnostics and a feature-flagged dry-run/contract test path.

### Slice 3 — Durable Enhanced job

Add the separate job kind, credit admission, idempotency, retry classification,
result persistence, row-lock/CAS merge, and recovery projection. Keep Legacy
mutation code untouched.

### Slice 4 — Storyboard UI

Add the paired button, confirmation, status, variant selector, same editor,
Apply/restore actions, model-role metadata, and clear stale/readiness states.

### Slice 5 — Capability and model-pair hardening

Add separate image/video model contract tests, exact target profile snapshots,
provider-mode validation, and model-change invalidation. Do not introduce a
single shared model ID.

### Slice 6 — Canary and proof

Enable for an internal tenant/series only after runtime readiness. Compare
Enhanced and Legacy prompt validity, provider rejection, continuity warnings,
regeneration rate, latency, and cost. Keep the Legacy kill switch available.

## 15. Dependency graph

```text
01 variant contract/projection
  → 02 Enhanced adapter/readiness
  → 03 durable Enhanced job
  → 04 Storyboard UI
  → 05 model/capability hardening
  → 06 browser, regression, cost, and canary proof
```

The Legacy flow is not a dependency that must be rewritten. It is an invariant
that must remain passing throughout every slice.

## 16. Fixed design decisions

1. Enhanced is a separate generation job and runtime adapter.
2. Legacy remains the existing source-compatible path.
3. Both variants are persisted; only the active projection is consumed by old
   render code.
4. Enhanced generation never auto-applies its result.
5. The UI uses one prompt editor with a variant selector.
6. Apply projects the entire prompt bundle atomically, not only `prompt` text.
7. Image model, prompt authoring model, and video target model are separate
   roles and separate persisted IDs.
8. Exact target video-model capability is authoritative and supplied by Core;
   the Agent cannot choose it.
9. Normal Enhanced mode is one structured run plus deterministic validation;
   extra quality-loop calls require explicit mode and cost disclosure.
10. Enhanced is feature-flagged and readiness-gated; no silent fallback to
    Legacy is allowed.
11. Feature 170's canonical multimodal bundle, asset authorization, terminal
    prompt equality, and stale-revision rules remain authoritative.
12. This spec does not authorize an OpenAI Agents SDK upgrade, global skill
    routing change, database migration, or product-code implementation until a
    later approved implementation plan.

## 17. Open review note

This document is an additive design specification for user review. After the
user approves the design, create the implementation plan and begin with Slice 1.
Do not implement product code directly from this document before that approval.

<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-variant-contract
section-02-enhanced-runtime-and-jobs
section-03-storyboard-ui
section-04-model-routing-rollout-and-proof
END_MANIFEST -->
