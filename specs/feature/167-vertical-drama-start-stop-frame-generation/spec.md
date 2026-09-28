# Feature 167: Vertical Drama Start/Stop Frame Generation

**Status:** SPEC READY FOR REVIEW — implementation not started
**Created:** 2026-08-30
**Priority:** P0 — correct video grounding and avoid wasted image credits
**Owner:** Vertical Drama / Media Generation / UX
**Depends-on:** Feature 131 Vertical Drama Series Storyboard Video Flow,
Feature 137 Identity-Stable I2V Pipeline, Feature 138 Scene Continuity Engine,
Feature 149 Video Prompt Learning/QC Ledger, existing `startFramePlan`,
`media_assets`, and provider capability routing

## 1. Executive decision

Vertical Drama must distinguish the visual state at the beginning of a shot
from the visual state at the end of a shot. The existing start-frame workflow
remains the default and keeps its current user interaction. Stop frames are an
optional, independently generated visual anchor for providers that support a
first/last-frame bridge.

The system will use two role-specific LLM calls, not one large call that
returns both long prompts:

```text
Canonical shot synopsis
        |
        +--> existing start-prompt flow, explicitly framed as START
        |       -> start prompt + start semantic handoff
        |
        +--> optional stop-prompt flow
                receives full start prompt + handoff + synopsis
                -> stop prompt + stop semantic handoff
```

The second call is not an independent interpretation. It must preserve the
start frame's identity, scene, continuity, and visual grammar, then choose the
terminal visual moment implied by the same synopsis. This avoids doubling the
completion payload of the existing nine-shot batch while retaining cross-frame
coherence.

## 2. Problem statement

The current start-frame prompt often describes the complete synopsis as one
compressed image. For a synopsis such as:

> ธันวาในเสื้อเชิ้ตยับเปียกฝนรีบเดินฝ่าตลาดปลารุ่งอรุณ หลบสายตาคนตามหาและกดปิดโทรศัพท์ก่อนซุกมันลงถังลังน้ำแข็งว่าง เขาตัดสินใจทิ้งตัวตนซีอีโอชั่วคราวเพื่อเอาตัวรอดในตลาด

the resulting still may depict the phone being hidden and the decision already
made. That is a plausible ending image, but it is a poor first image for
image-to-video because the provider has no visible setup from which to animate
the action.

The product needs:

1. A start prompt that selects the earliest useful visual beat: Thanwa moving
   through the market while avoiding the people searching for him.
2. An optional stop prompt that selects the terminal beat: Thanwa shutting off
   the phone, hiding it in the empty ice crate, and choosing survival over his
   CEO identity.
3. A clear UI distinction between the two assets and their independent costs.
4. A provider handoff that uses the stop asset only when it exists and the
   selected video model supports it.

## 3. Goals

1. Make every newly generated start prompt explicitly represent a genuine
   opening state, not a synopsis-wide summary or terminal state.
2. Let the user generate a stop prompt and stop image per shot, independently
   from start-image generation.
3. Preserve the existing start-frame button labels, confirmation flow, task
   polling, image replacement, upload, history, and approval behavior.
4. Pass the complete current start prompt and structured continuity facts to
   the stop-prompt call so the two frames belong to the same shot.
5. Keep prompt generation and image generation as separate actions for both
   roles.
6. Reuse existing durable media, tenant authorization, task, credit, and
   provider-routing boundaries.
7. Use `endFrameAssetId` in the existing video contract when a stop frame is
   selected, without making stop-frame creation mandatory.
8. Keep old episodes usable without automatically regenerating their start
   images or creating stop images.
9. Make missing, stale, failed, unsupported, and unused stop-frame states
   explicit rather than silently falling back or spending credits.

## 4. Non-goals

1. Do not change the existing start-frame user flow or remove its buttons.
2. Do not auto-generate stop prompts or stop images when an episode is opened,
   when a start frame completes, or when a video provider is selected.
3. Do not force users to create a stop frame for providers that do not support
   first/last-frame input.
4. Do not create a second media registry or store provider URLs as the sole
   source of truth.
5. Do not combine both long prompts into the existing nine-shot start-plan
   response.
6. Do not use deterministic punctuation/regex splitting as the primary story
   interpretation mechanism.
7. Do not infer or rewrite Scene Visual State from a generated image. Prompt
   analysis may warn about a conflict, but the authoritative scene state stays
   user-controlled.
8. Do not automatically replace an approved start image with a stop image, or
   vice versa.
9. Do not make an absent stop frame a hard failure for image generation,
   start-frame video generation, or episode assembly.

## 5. Existing-system findings and compatibility boundary

| Existing seam | Current behavior | Required treatment |
| --- | --- | --- |
| `apps/web/server/services/verticalDramaStartFrameGeneration.ts` | Owns the nine-shot render plan and single-shot start-prompt generation. | Keep the existing start entry points; add an explicit `frameRole: "start"` contract and opening-beat instructions. Add a sibling stop call with one-frame output. |
| `apps/web/skills/vertical-drama-shot-start-frame-render` | Returns exactly nine start-frame requests. | Keep the 9-request output shape for the start batch. Do not add 9 stop prompts to this response. |
| `apps/web/skills/vertical-drama-shot-start-frame-prompt` and the resolved prompt-mode skills | Existing per-shot authoring is start-named and its single-shot response has no role discriminator. | Preserve the legacy start skill entry point for old callers, but make the new application invocation role-aware. A stop invocation must be explicit and schema-validated as `frame_role: "stop"`; it must not be a generic prompt-repair call. |
| Existing per-shot prompt modes | `policy_safe_rewrite` and `cinematic_narrative` are selected from the image model family. | Apply the same mode to stop prompts, with stop-specific role instructions. Policy-safe rewriting must run on the stop synopsis/context only and must not invent visual facts. |
| `startFramePlan.frames[]` | Has `imagePrompt`, `negativePrompt`, `approvedMediaAssetId`, `imageTask`, continuity and video-safe fields. | Preserve all start fields. Add optional stop fields additively. Existing JSON remains valid. |
| `VerticalDramaMotionPromptPack.clips[]` | Already supports `startFrameAssetId`, `endFrameAssetId`, and `first_last_frame_bridge`. | Populate `endFrameAssetId` from the authoritative stop selection after LLM output, never from an untrusted free-text asset claim. |
| `verticalDramaVideoPromptFormatter.ts` | Adds explicit first-image grounding and accepts end-frame IDs in the clip shape. | Add explicit last-image grounding only when the provider supports it and a canonical stop asset is present. |
| Durable shot-prompt job path | Start prompt authoring is submitted to a background job and persisted before the image step. | Stop prompt authoring must use the same durable job/admission/polling boundary; never hold a browser request open for the LLM call or return a prompt that was not durably persisted. |
| `VerticalDramaStoryboardPanel.tsx` | Shows one primary start-image slot and start-specific actions. | Keep the start slot and its existing test IDs/interaction. Add an adjacent, clearly labeled stop slot with independent actions and states. |
| `media_assets` and protected media URLs | Existing durable tenant/user-scoped media authority. | Reuse it for stop images. Preserve managed storage URL precedence, authorization, cache headers, range behavior, and no raw provider URL as canonical playback. |

The current code already has `endFrameAssetId` in the motion-pack contract and
provider capability vocabulary. The missing boundary is the Vertical Drama
shot-level stop prompt/asset source and its UI/persistence wiring.

The stop implementation must also audit every writer of `startFramePlan` rather
than only the new stop mutation. A full start-plan regeneration, single-shot
start prompt save, start-image replacement, episode JSONB patch, or reset must
not silently drop stop fields from the matching `shotNumber`. Stop fields are
preserved by shot number; when a start semantic source actually changes, the
preserved stop state is marked stale according to §8.1.

An explicitly confirmed user reset may clear both roles, but the confirmation
must name that stop content will be removed from the active shot state. A
normal start regeneration or start-image replacement is not such a reset.

## 6. Product behavior

### 6.1 Start frame behavior

The current start actions remain unchanged:

- Existing “สร้าง prompt + ภาพ” still generates the start prompt and then the
  start image according to the current flow.
- Existing “สร้างภาพ (AI)” still renders from the current start prompt.
- Existing start image upload, Media History replacement, angle-grid selection,
  repair, video-safe anchor, approval, polling, retry, and credit confirmation
  remain start-only operations.
- The implementation changes the prompt contract behind these actions so the
  generated prompt chooses the shot's opening visual beat.

For a brand-new episode, start prompt/image remains the required image path for
video readiness. Stop is never required by the start-frame stage.

The existing bulk “generate all start images” action remains start-only. There
is no bulk stop-image action in this feature: stop rendering is deliberately a
per-shot, user-confirmed operation so an unsupported provider or an unneeded
shot cannot consume credits for the whole episode.

### 6.2 Stop prompt behavior

Each shot receives separate controls:

- `สร้าง prompt Stop Frame` — invokes the stop-prompt skill and persists only
  stop prompt/provenance fields. It does not render an image.
- `แก้ไข prompt Stop Frame` — free edit of the stop prompt, preserving the
  start prompt and pair provenance as user-edited.
- `ให้ AI ปรับ Stop Frame` — optional AI rewrite using the same start context;
  it must not overwrite start text.
- `สร้างภาพ Stop Frame` — enabled only after a non-empty stop prompt exists;
  follows the existing explicit credit-confirmation and durable task/polling
  pattern, but targets stop fields.
- `เปลี่ยนภาพ Stop Frame` — selects an existing authorized Library/Media
  History image or upload and assigns it only to the stop slot. This remains
  available even when no stop prompt exists; only AI rendering is gated by a
  non-empty prompt.
- `ลบ/ยกเลิก Stop Frame` — clears the selected stop asset without clearing the
  stop prompt unless the user explicitly chooses to clear the prompt. If a
  render task is pending, label cancellation separately from clearing the
  selected asset; never claim that a provider task was cancelled unless the
  existing provider cancellation contract confirms it. A late completion must
  remain unselected when its prompt/source hashes no longer match.

Stop prompt generation may be used when an episode already has an old start
prompt. It must use that current prompt as context and must not regenerate the
old start prompt. If no start prompt exists yet, the stop-prompt action is
disabled with an explicit explanation that the start prompt is required as the
continuity anchor. This is a prerequisite, not a requirement to render a stop
image.

### 6.3 Stop image is optional

The UI must distinguish these states:

The table assumes that a current start prompt already exists. Before that
prerequisite is met, the stop-prompt action is disabled as described above.

| State | Stop prompt action | Stop image action | Video behavior |
| --- | --- | --- | --- |
| no stop prompt | enabled | disabled with “สร้าง prompt ก่อน” | start-only path |
| stop prompt ready | edit/regenerate enabled | enabled with credit confirmation | stop remains optional |
| stop render pending | disabled while task is active | shows durable progress | no duplicate submit |
| stop render failed | retry prompt/image separately | retry does not touch start | start-only fallback |
| stop image ready | edit/replace/regenerate enabled | replaceable | use as end frame only if provider supports it |
| provider unsupported | prompt/image may remain stored | no forced action | ignore stop asset and use start-only mode with notice |
| stop stale | show reason and “สร้างภาพ Stop Frame ใหม่” | old asset retained in inspection-only state, not the selected slot | do not attach stale stop asset |

In this table, “Stop image action” means AI rendering. The existing-image
picker/upload action remains independently available unless the slot is in a
provider/task state that the current UI must disable for safety.

## 7. LLM and skill contract

### 7.1 Start role contract

All start prompt paths, including the existing batch render-plan path and the
existing per-shot prompt path, must carry an explicit role fact:

```json
{
  "frame_role": "start",
  "authoritative_synopsis": "...",
  "shot_context": "...",
  "continuity_context": "..."
}
```

The skill must reason in this order:

```text
authoritative synopsis
  -> event order
  -> earliest useful visual beat
  -> one frozen opening instant
  -> cinematic prompt with room for the next motion
```

`frame_role` is a system/application contract, not an instruction that the
user's synopsis or repair text can override. A user instruction may refine
style or presentation, but may not turn a start call into a terminal frame or
a stop call into an opening frame.

The start prompt must:

1. Begin before the primary irreversible action or terminal decision.
2. Show the earliest story-critical state that can naturally continue into
   motion. This may be a poised first step or an action just beginning; it does
   not require a difficult literal mid-stride pose.
3. Preserve identity, wardrobe, location, lighting, staging axis, and required
   references from the existing shot contract.
4. Avoid depicting later actions merely because they occur in the same
   synopsis.
5. Avoid “summary frames” that show both setup and conclusion at once.
6. Describe one still instant, not a sequence or transition.

The start batch keeps its existing output contract and exactly nine requests.
It may add optional director metadata, but must not make stop fields required
or double the response size.

For a new per-shot start authoring call, the normalized response carries
`contract_version: 2` and `frame_role: "start"` before persistence. The batch
planner remains the compatibility exception: it retains its existing v1
`start_frame_requests` envelope and the application supplies the explicit
start role while normalizing each request.

The application must resolve the authoritative source in this order:

1. the current canonical shot summary from the active Overview/storyboard;
2. the persisted shot summary snapshot on the frame;
3. for legacy prompt-only repair, the current persisted start prompt as a
   compatibility source, with a visible “legacy source” warning.

The UI's transient text and a generated image must never become the story
source. When the start call returns director metadata, the server stores a
bounded start semantic handoff (opening moment, story meaning, continuity
locks, and source revision) alongside the existing `promptAnalysis` fields.
For legacy frames where that metadata is absent, the stop call may proceed
with an absent handoff, but must still receive the exact current start prompt
and must not invent a missing story fact.

### 7.2 Stop role contract

The stop-prompt call is one shot at a time and returns one prompt object. Its
input must include:

```json
{
  "frame_role": "stop",
  "authoritative_synopsis": "...",
  "start_frame_context": {
    "prompt": "<full current start prompt>",
    "negative_prompt": "...",
    "semantic_handoff": {
      "opening_moment": "...",
      "story_meaning": "...",
      "continuity_locks": ["..."],
      "start_prompt_hash": "sha256:..."
    }
  },
  "shot_context": "...",
  "continuity_context": "..."
}
```

The complete start prompt is an input context, not a second output. The stop
skill must:

1. Read the full synopsis and identify the final story-critical beat.
2. Read the start prompt and preserve its identity/scene/visual locks.
3. Choose the terminal frozen instant or immediate aftermath that the video
   should arrive at.
4. Make the stop state materially different from the start state when the
   synopsis contains a meaningful action or decision.
5. Never invent a new event, prop, character, wardrobe change, or location.
6. Keep the same character reference mapping and never swap image indices.
7. Keep the same staging axis unless the synopsis explicitly requires a change.
8. Leave no ambiguity about which visible action is complete at the endpoint.

The stop output must be structurally small and bounded:

```json
{
  "contract_version": 2,
  "frame_role": "stop",
  "prompt": "...",
  "negative_prompt": "...",
  "analysis_summary": {
    "story_meaning": "...",
    "opening_moment_reference": "...",
    "terminal_moment": "...",
    "transition_intent": "...",
    "continuity_locks": ["..."],
    "source_evidence": ["exact short source spans"]
  },
  "quality_score": 0,
  "quality_flags": []
}
```

For the new role-aware path, `frame_role` is required and the normalized
single-shot contract is versioned independently from the legacy nine-request
render-plan contract. The existing start render-plan schema remains contract
version 1 and exactly nine requests. Legacy single-shot start responses without
`frame_role` may be read only for backward compatibility; a new stop response
without `frame_role: "stop"` is rejected and cannot be persisted.

The renderer consumes only `prompt` and `negative_prompt`; analysis is audit
and UI metadata. A truncated or schema-invalid response persists nothing and
does not start a paid image task. Retry is bounded and explicit.

Skill compatibility is explicit: do not rename or remove
`vertical-drama-shot-start-frame-prompt`, and do not change the
`vertical-drama-shot-start-frame-render` nine-request output for existing
callers. The service may add a role-aware adapter or a sibling stop-role skill,
but both paths must share the same reference-manifest/continuity builder and
the same normalized v2 single-shot output. The selected
`policy_safe_rewrite` skill remains a synopsis safety pass only; it must never
be mistaken for the final visual prompt authoring response.

### 7.3 Prompt-length and truncation policy

The concern is completion size, not only input size. A 6,000-character prompt
per frame multiplied by 18 frames would add roughly 108,000 output characters
before JSON overhead, metadata, and the rest of the nine-shot plan. Therefore:

1. The nine-shot start batch remains start-only.
2. Stop prompt generation is one shot per call, so one response contains one
   long prompt rather than two long prompts for every shot.
3. The full start prompt is passed to the stop call as input context; it is not
   duplicated in the stop response.
4. The stop output schema keeps director notes bounded and optional.
5. The selected model's prompt budget applies independently to start and stop.
6. If a response is truncated, validation fails closed, the existing start
   state remains untouched, and the user receives a retryable error.
7. No partial JSON or partial prompt is persisted as an approved prompt.
8. Only bounded, model-owned metadata may be compacted. Its priority is
   reference mapping, identity locks, scene/continuity locks, frame role,
   decisive moment, and story action.
9. The exact persisted start prompt and authoritative synopsis must never be
   silently truncated or summarized by application code before the stop call.
   If the selected model input limit is exceeded, return a clear bounded
   “prompt context too long” error and offer free manual editing/shortening.
10. The complete start prompt must not be written to ordinary logs, analytics,
    error labels, or telemetry payloads. Use lengths, hashes, job IDs, and
    bounded redacted metadata instead; the prompt remains visible only through
    the authorized episode UI/job result.

## 8. Data contract and persistence

### 8.1 Additive per-shot fields

Extend `VerticalDramaStartFramePlan.frames[]` with optional fields. Existing
start fields retain their meanings:

```ts
type VerticalDramaStopFrameTask = {
  role: "stop";
  pendingTaskId?: string;
  lastTaskId?: string;
  promptHash: string;
  startPromptHash: string;
  status: "submitted" | "queued" | "processing" | "completed" | "failed" | "expired";
  failureStage?: "provider" | "sync" | "admission";
  submittedAt?: string;
  updatedAt?: string;
  error?: string;
};

type VerticalDramaFramePairMetadata = {
  pairId: string;
  /** SHA-256 of a stable canonical JSON source/context object. */
  sourceRevision: `sha256:${string}`;
  startPromptHash: string;
  startAssetId?: string;
  stopAssetId?: string;
  startSemanticHandoff?: {
    openingMoment?: string;
    storyMeaning?: string;
    continuityLocks?: string[];
  };
  stopSemanticHandoff?: {
    terminalMoment?: string;
    transitionIntent?: string;
    sourceEvidence?: string[];
  };
  createdAt: string;
  updatedAt: string;
};

type VerticalDramaStartFrameSemanticHandoff = {
  openingMoment?: string;
  storyMeaning?: string;
  continuityLocks?: string[];
  sourceRevision: `sha256:${string}`;
};

type VerticalDramaFramePairQc = {
  startAssetId: string;
  stopAssetId: string;
  analyzedAt: string;
  skillVersion?: string;
  verdict: "pass" | "warning" | "fail";
  notes: string[];
};
```

Hash and revision rules are deterministic: hash the exact UTF-8 string that is
persisted after the existing trim/validation boundary, prefix it as
`sha256:<lowercase-hex>`, and never hash a provider URL. `startPromptHash` and
`stopFramePromptHash` identify the exact prompt text; `stopFrameStartPromptHash`
identifies the start prompt used as stop context. `sourceRevision` is the hash
of a stable canonical JSON object with sorted keys containing the authoritative
synopsis, shot context, continuity locks, reference mapping, and current start
prompt hash; it additionally changes whenever any of those inputs changes. The
pair ID is regenerated for a new stop authoring result; it is not reused after
a new start/stop semantic pair is authored.

Required additive fields:

- `stopFramePrompt?: string`
- `stopFrameNegativePrompt?: string`
- `stopFrameTask?: VerticalDramaStopFrameTask`
- `approvedStopFrameAssetId?: string`
- `staleStopFrameAssetId?: string` — inspection-only previous stop asset after
  its prompt/source/pair became stale; never a video input.
- `stopFrameSource?: "generated" | "history" | "library" | "upload"`
- `stopFramePromptHash?: string`
- `stopFrameStartPromptHash?: string`
- `stopFramePromptOrigin?: "llm" | "user_edit" | "ai_adjusted" | "legacy"`
- `startFrameSemanticHandoff?: VerticalDramaStartFrameSemanticHandoff`
- `stopFrameStaleReason?: "stop_prompt_changed" | "start_prompt_changed" | "canonical_source_changed" | "continuity_changed"`
- `stopFrameStaleAt?: string`
- `framePair?: VerticalDramaFramePairMetadata`
- `stopFramePromptMode?: VdImagePromptModeStamp`
- `stopFramePromptSafetyAdjustments?: string[]`
- `stopFramePromptAnalysis?: { terminalMoment?: string; transitionIntent?: string; qualityScore?: number; qualityFlags?: string[] }`
- `framePairQc?: VerticalDramaFramePairQc`

The exact shared type should be declared once and reused by server projection,
client view types, and tests. Do not duplicate a second incompatible stop-frame
shape in the page and panel.

### 8.1.1 Persistence invariants and optimistic concurrency

Every stop mutation is shot-scoped, tenant/user-owned, and merges against a
fresh locked episode row. It must obey these invariants:

- a pending stop task has `pendingTaskId`, `promptHash`, and
  `startPromptHash`; a terminal successful task is cleared only after its
  resulting media asset is linked, matching the existing start-task lifecycle;
- a stop-prompt save carries `expectedStartPromptHash` (or an equivalent
  source revision). If the current start prompt changed while the stop LLM job
  was running, the result is rejected as stale, not persisted, and not used to
  submit an image task;
- a stop-image completion carries the stop prompt hash and start prompt hash it
  rendered from. If either no longer matches the current frame, the provider
  result may remain in Media History for inspection but cannot become
  `approvedStopFrameAssetId`;
- a start-plan regeneration merges stop fields by `shotNumber` and marks them
  stale when the start prompt/source revision changed; it never replaces a
  stop field with `undefined` merely because the incoming legacy start payload
  does not contain stop keys;
- when a selected stop asset becomes stale, clear
  `approvedStopFrameAssetId` and move the old ID to
  `staleStopFrameAssetId`; `approvedStopFrameAssetId` is never retained as a
  dual-purpose “visible but not authoritative” value;
- when a new stop asset is explicitly selected, clear any prior
  `staleStopFrameAssetId`/stale marker and invalidate pair QC before making the
  new asset authoritative;
- changing the selected start image invalidates pair/image QC and video-pack
  evidence, but does not by itself mark the stop prompt stale; changing the
  start prompt, canonical source, continuity facts, or reference mapping does;
- editing a stop prompt invalidates only the stop image and pair QC, while
  replacing/clearing a stop image invalidates pair QC only.

The stop prompt submit and image submit paths must accept an idempotency key.
Duplicate requests with the same owner, shot, role, prompt hash, and key return
the existing job/task result; a different prompt hash requires a new operation.
No retry may reserve a second image charge for the same in-flight operation.

### 8.1.2 Server/client operation contract

The implementation may choose exact procedure names, but it must expose the
following role-explicit operations (or equivalent names with the same input
and result semantics):

| Operation | Required input | Required result/side effect |
| --- | --- | --- |
| generate stop prompt | owner, `shotNumber`, `expectedStartPromptHash`, idempotency key, optional user instruction | durable stop-role job ID; no image task or image credit |
| get/resolve stop prompt job | owner, shot, job ID | owner-scoped status/result; completed result is persisted only after hash/CAS validation |
| save stop prompt | owner, shot, prompt, negative prompt, source revision, optional `expectedStopPromptHash` | stop prompt hash saved; dependent stop image/pair QC becomes stale; conflicting concurrent edits are rejected rather than overwritten |
| submit stop image | owner, shot, current stop prompt hash, current start prompt hash, idempotency key | admission/credit confirmation then durable provider task ID |
| persist stop image task | owner, shot, task status, task ID, prompt/source hashes | locked merge with late-task rejection, analogous to start task persistence |
| set/replace/clear stop asset | owner, shot, canonical media asset ID and source | only stop-role fields and pair-QC state change; start asset/prompt is untouched |

All procedures use the existing authenticated Vertical Drama procedure and
`loadOwnedEpisode`/equivalent ownership check before reading or mutating data.
The browser must never submit a provider URL or an arbitrary asset ID as a
trusted stop reference; the server resolves the canonical media asset under the
current tenant and user.

### 8.2 Asset authority

`approvedStopFrameAssetId` is the only authoritative selected stop image for a
shot. It resolves through the existing tenant/user-scoped `media_assets` path.
The provider URL is provenance/fallback only. Any stop asset selected from
upload, history, or library must pass the same resolve/import/authorization
chain as start-frame replacement.

`staleStopFrameAssetId` is display/history evidence only. It may be previewed
through the same authorized resolver, but must never be emitted in a video
clip, counted as a ready stop frame, or used to satisfy a bridge capability
check.

If the shot-reference projection exposes role labels, add `stop_frame` as an
additive role for display/filtering. It must not be represented as a generic
character reference, scene anchor, B-roll item, or start frame.

The episode-plan asset resolver must collect stop IDs from both
`frames[].approvedStopFrameAssetId` and `clips[].endFrameAssetId`. It must
return only ready/authorized assets to the UI or provider request; an expired,
deleted, or unauthorized stop asset is shown as unavailable and is never
silently substituted with the start asset.

### 8.3 No automatic migration or backfill

Existing episodes remain valid because all stop fields are optional. On load:

- existing `imagePrompt` and `approvedMediaAssetId` continue to render as
  start-frame state;
- absent stop fields render as “ยังไม่มี Stop Frame”;
- no LLM call, image render, credit charge, or background backfill occurs;
- the user may generate a stop prompt using the current legacy start prompt;
- changing the start prompt after a stop pair exists marks stop stale and keeps
  the old stop asset in `staleStopFrameAssetId` for inspection, but it is not
  used for a new video.

The implementation should use the existing episode JSONB update boundary and
does not require a new SQL table or column for the MVP. Any migration discovered
to be necessary for a strict database enum or durable task ledger must be
isolated, backward compatible, and called out separately before implementation.

## 9. Video handoff and provider behavior

### 9.1 Canonical asset mapping

After motion-prompt LLM generation, the server overwrites missing/placeholder
frame references from authoritative episode state:

- single-shot clip: start = selected start anchor; stop = selected stop anchor;
- multi-shot clip: start = selected start asset from the first ordered source
  shot; stop = selected stop asset from the last ordered source shot;
- if either selected asset is missing, do not invent or reuse the sibling role;
- the server mapping replaces any LLM-supplied `startFrameAssetId` or
  `endFrameAssetId` when an authoritative selected ID exists; the LLM's
  free-text `asset_id` claim never outranks the server-resolved ID.

The mapping runs after the LLM pack is normalized and before `motionMode` is
derived. For a multi-shot clip, “first” and “last” mean the first and last
entries in the clip's ordered `sourceShotNumbers`, not the first/last shot that
happens to have an available asset. If the last source shot has no valid stop
asset, the clip has no end frame even if an earlier source shot has one.

`endFrameAssetId` is populated only when a valid selected stop asset exists.
The media URL resolver must include both frame-level approved stop IDs and
clip-level end IDs in its existing batch resolution and tenant authorization
path. A stale, expired, or unauthorized stop selection is treated as absent for
video attachment, with an explicit UI warning.

### 9.2 Capability gate

The provider routing decision must distinguish:

| Condition | Request mode |
| --- | --- |
| start exists, stop exists, provider supports first/last and the request's reference limits | `first_last_frame_bridge`, attach both |
| start exists, stop absent | `first_frame_to_video`, attach start only |
| start exists, stop exists, provider lacks first/last | provider-supported start/reference mode, attach no stop; show informational notice |
| start missing | preserve existing hard precondition/failure |

A stored stop frame must never cause a provider that does not support it to
fail, silently reinterpret it as a character reference, or incur a second
generation. The final prompt may state “use the attached last image as the
exact target/end frame” only when that image is actually attached and the
selected video request supports the required first/last input shape.

Capability evaluation is per selected video model/request, not only per
provider name. It must check same-request first/last support, reference-slot
limits, and mutual exclusions with character/location references. The effective
mode is calculated from the post-sync canonical clip fields, so adding a valid
stop asset after LLM pack generation can produce bridge mode, while removing or
rejecting one can never leave bridge mode behind.

### 9.3 Prompt grounding

When both assets are attached, the provider-facing prompt must explicitly state
that the first image is the exact starting state and the last image is the
exact target state, while preserving identity, wardrobe, scene, and continuity.
When only start is attached, retain the current first-image grounding wording
and do not mention a nonexistent last image.

## 10. UI/UX specification

### 10.1 Shot-card layout

Add a “ภาพสำหรับวิดีโอ” frame-pair surface inside each existing shot card. It
must visually read as a timeline:

```text
[ Start Frame ]  →  [ Stop Frame ]
  จุดเริ่มต้น        จุดสิ้นสุด (ไม่บังคับ)
```

Desktop/laptop:

- keep the existing shot details and prompt area unchanged in hierarchy;
- replace the single-media presentation area with a balanced two-slot group;
- use equal 9:16 preview slots with a visible Start/Stop label and a subtle
  directional connector;
- keep Start visually primary because it is required, but make Stop visually
  complete rather than an empty afterthought;
- keep actions inside each slot so the user never confuses which image will be
  replaced or charged.

Mobile/tablet:

- stack the two slots vertically or use a compact two-column layout only when
  both slots remain readable;
- never introduce horizontal page overflow;
- keep labels and primary actions visible without relying on hover;
- preserve keyboard focus order: Start preview/actions, then Stop
  preview/actions, then shared shot controls.

Each slot must support:

- empty, prompt-ready, generating, ready, failed, stale, expired, and
  unsupported states;
- authenticated thumbnails and lightbox preview;
- upload/drop and authorized history/library selection;
- the shared picker target must carry `frameRole: "start" | "stop"`, and a
  stop selection must never fall through to the existing start-frame target;
- accessible `aria-label` naming the role and shot number;
- visible credit notice only for paid generation;
- independent retry/error text;
- no icon-only primary action.

Required Thai labels (English equivalents may be added):

- `Start Frame` / `Stop Frame`
- `สร้าง prompt Start Frame` only where the existing start flow already exposes
  a prompt action; do not duplicate or replace current start buttons
- `สร้าง prompt Stop Frame`
- `สร้างภาพ Stop Frame`
- `เปลี่ยนภาพ Stop Frame`
- `Stop Frame ไม่บังคับ — ใช้เมื่อเครื่องมือวิดีโอรองรับ`
- `สร้าง start prompt ก่อน เพื่อใช้เป็นหลักยึดความต่อเนื่อง`

These labels must use the application's existing locale/i18n path rather than
new hard-coded strings. English and Thai must both have deterministic fallback
text, and status/disabled explanations must remain understandable when the
provider capability or prompt job changes while the card is open. Use existing
design tokens and component primitives; do not introduce raw fixed-width
layout values that can create overflow in the long-prompt editor.

The panel must retain existing start test IDs and add stable stop IDs such as:

- `vd-storyboard-stop-frame-slot-{shotNumber}`
- `vd-storyboard-stop-frame-prompt-{shotNumber}`
- `vd-storyboard-generate-stop-prompt-{shotNumber}`
- `vd-storyboard-generate-stop-image-{shotNumber}`
- `vd-storyboard-change-stop-frame-{shotNumber}`
- `vd-storyboard-stop-frame-status-{shotNumber}`

### 10.2 Prompt editor behavior

The start and stop prompt editors are separate instances with separate drafts,
save/cancel state, AI-adjust targets, and error messages. The stop AI-adjust
request receives the current start prompt context, but saving the result writes
only stop fields. A manual stop edit marks the stop prompt as user-authored and
does not permit a later background regeneration to overwrite it.

The UI may display a compact “จุดเริ่มต้น / จุดสิ้นสุด” semantic summary, but
the full prompt remains inspectable. Do not show the entire 6,000-character
prompt in an always-expanded layout; use the existing inline editor/expand
pattern and preserve copy functionality.

## 11. State, credits, and failure handling

1. Start prompt generation and stop prompt generation have independent request
   IDs, model stamps, usage, errors, and retry boundaries.
2. Start image and stop image have independent durable media task markers.
3. A stop prompt failure never clears or invalidates the start prompt.
4. A stop image provider failure never retries the start image.
5. A stop sync failure offers “ลองเชื่อมภาพอีกครั้ง” before paid regeneration,
   using the same task ID where possible.
6. No image credit is reserved until the corresponding image task passes the
   existing model/tenant/provider admission checks.
7. Prompt-only generation charges according to the existing LLM prompt path;
   it must not silently trigger image generation.
8. Image generation charges only the selected role's image task; generating a
   stop image never charges for start again.
9. A duplicate click, reload, or route navigation resumes the correct role's
   pending task and never creates a second paid task.
10. Policy rejection remains a hard stop for that role; it must not auto-switch
    to the sibling role or resubmit unchanged content.
11. A stop prompt job and a stop image task must be durable background
    operations with owner-scoped polling. Browser disconnect, tab close, and
    route navigation must not cancel the operation or lose its result.
12. A stop prompt/image operation must not block the required start operation;
    a failed, stale, unsupported, or cancelled stop operation leaves the
    start-only path usable.

## 12. QC and acceptance rules

### 12.1 Prompt-level checks

The start/stop skill output must be checked for:

- valid JSON/schema and non-empty role-appropriate prompt;
- explicit `frame_role` agreement;
- start prompt has an opening/earliest useful moment;
- stop prompt has a terminal moment and transition intent;
- stop prompt is grounded in the exact current start prompt hash;
- same required character/reference mapping and identity locks;
- same scene/location/time/wardrobe/lighting locks unless story evidence says
  otherwise;
- no invented character, event, prop, or location;
- no sequence narration in a still prompt;
- stop does not silently become the new start prompt.

Semantic ordering checks are advisory unless the model returns an impossible or
malformed contract. Do not block valid creative phrasing with broad lexical
rules. A warning should identify the exact field/evidence that needs human
review.

### 12.2 Image-level checks

Use existing image and continuity QC boundaries, with role-aware inputs:

- start QC analyzes the selected start asset;
- stop QC analyzes the selected stop asset;
- pair QC compares the two selected assets for identity/scene continuity and
  meaningful state progression;
- pair QC persists the exact start/stop asset IDs it analyzed and is reusable
  only while both IDs remain the selected canonical assets;
- a stop QC result never counts as start QC evidence;
- missing stop QC is not a failure when no stop image exists;
- stale QC cannot be used after the corresponding role's asset changes.

### 12.3 Acceptance criteria

1. The existing start buttons render and behave exactly as before from a user's
   perspective.
2. A new start prompt for the Thanwa example describes the market traversal and
   evasion as the opening state, not the phone-hiding decision.
3. A user can create only a start prompt/image and proceed through the existing
   start-only workflow.
4. A user can create only a stop prompt after a start prompt exists, without
   rendering a stop image.
5. A user can create stop prompt and image independently, without regenerating
   or charging the start image.
6. Stop prompt generation receives the full current start prompt and its hash;
   tests prove this at the request boundary.
7. Editing/regenerating start marks the dependent stop state stale but keeps
   the old stop asset inspectable and does not silently attach it to video.
8. A provider supporting first/last receives canonical start and stop asset IDs
   in the correct roles and `first_last_frame_bridge` mode.
9. A provider without stop support receives no stop asset and continues through
   the existing start-only path.
10. Existing episodes with no stop fields load without migration, LLM calls,
    image jobs, or credit charges.
11. A truncated stop response is rejected without partial persistence or image
    submission.
12. Desktop and mobile shot cards keep both role labels/actions readable with
    no horizontal overflow and accessible keyboard operation.
13. Regenerating or loading a legacy start plan preserves stop fields by
     `shotNumber`; a changed start source marks dependent stop state stale
     rather than deleting it.
14. A late stop prompt/image result whose start or stop hash is stale cannot
     become the approved stop asset or attach to a video clip.
15. Canonical post-sync mapping replaces conflicting LLM frame IDs, uses the
     first/last ordered source shots for multi-shot clips, and derives bridge
     mode only after capability evaluation.
16. Stop prompt text and the full start-context payload do not appear in
     ordinary logs or telemetry; only bounded metadata and hashes are emitted.

## 13. Implementation boundary and likely files

The implementation plan should inspect and likely touch only the following
bounded areas, subject to final impact review:

- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaVideoPromptFormatter.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/providerRouting.ts`
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardReviewPanel.tsx`
- existing start-frame skill folders and the new/extended stop-role fixtures
- focused server/client tests beside the affected contracts and flows

No implementation may broadly rewrite unrelated Vertical Drama files or alter
existing start-frame test IDs without an explicit compatibility reason.

## 14. Test and verification plan

### Skill and contract tests

- start-role prompt fixture proves the earliest useful opening beat;
- stop-role fixture proves terminal beat selection from the same synopsis;
- stop input fixture includes a long 6,000-character start prompt and validates
  one complete response;
- stop output truncation/malformed JSON rejects without persistence;
- reference mapping remains identical between start and stop;
- policy-safe rewrite preserves exact non-policy wording for each role;
- max prompt budget and bounded director metadata are enforced;
- old start-only output remains valid against the existing 9-shot schema.

### Server tests

- additive plan projection/load with absent stop fields;
- stop prompt mutation ownership, tenant scoping, role separation, and
  idempotency;
- stop image submit/poll/persist/reload/retry/sync failure;
- start change marks stop stale and preserves historical asset;
- start-plan regeneration/JSONB patch preserves stop fields by shot number;
- stale stop prompt/image completions lose the CAS race without becoming
  approved or attaching to a clip;
- canonical first/last asset mapping for single-shot and multi-shot clips;
- no stop asset when provider capability is absent;
- post-sync bridge-mode calculation with conflicting LLM asset claims;
- no duplicate credit reservation across retry or reload;
- media URL resolution includes stop assets without leaking another tenant.

### Client tests

- existing start flow regression tests remain green;
- independent stop prompt/image buttons and disabled reasons;
- role-specific loading/error/stale/expired states;
- stop editor cannot mutate start draft;
- authenticated lightbox/upload/history replacement targets stop only;
- keyboard/focus labels and mobile no-overflow layout contract;
- locale fallback renders all new labels and disabled reasons;
- provider-unsupported notice does not disable unrelated start actions.

### Required verification commands after implementation

Run focused tests from repo root using the repository command, for example:

```bash
npm --workspace apps/web test -- --environment jsdom <focused-test-files>
npm --workspace apps/web run check
git diff --check
```

The implementation handoff must name the actual focused test files rather than
leaving the placeholder above. A browser route test or authenticated screenshot
pass is required for the final UI layout proof; cover desktop, tablet, and
mobile widths and record skipped viewports with the blocker. Do not claim
provider support, production migration, deployment, or real paid generation
without live evidence.

## 15. Rollout and observability

1. Gate new stop-frame controls behind a Vertical Drama feature flag defaulting
   off until focused contract and UI tests pass.
2. Keep start-role prompt behavior separately observable from stop-role calls.
3. Record `frameRole`, `pairId`, source revision, prompt hashes, skill version,
   model, task ID, credit transaction, provider capability decision, and final
   asset ID in existing run/artifact metadata.
4. Track stop prompt generated, stop image submitted, stop image completed,
   stop image unused because provider unsupported, stop stale, and stop sync
   failure as separate outcomes.
5. Never infer product success from a completed prompt job; distinguish prompt,
   admission, provider, import/sync, and shot-link boundaries.
6. Rollback disables new stop controls and stop attachment while preserving any
   already stored stop prompts/assets for inspection; start-only generation and
   video paths continue to work.

## 16. Open implementation decisions

These decisions must be resolved in the implementation plan, not by silently
changing the product behavior:

1. Whether the existing shot-reference role enum needs an additive
   `stop_frame` value or whether the primary `approvedStopFrameAssetId` field
   is sufficient for all history/library surfaces.
2. Whether the existing assurance/artifact ledger can record stop-role prompt
   attempts without a new row type, or needs a backward-compatible role field.
3. The exact maximum stop director-note length and model-specific input limit;
   the full start prompt must remain intact until the limit is explicitly
   exceeded and reported.
4. Whether the start batch's existing output cap needs a bounded retry or a
   compact-metadata mode; adding stop output to that batch is not an option.

The implementation plan must also explicitly close these contract points before
coding: the canonical skill slug/adapter used for `frame_role` v2; the exact
hash/source-revision helper; the atomic merge/CAS behavior for stale stop jobs;
the post-sync point where canonical asset mapping determines `motionMode`; and
the existing picker/task procedure names that receive the role discriminator.

## 17. Success metric

For a representative set of new episodes, reviewers should be able to identify
the intended opening state from the start image and the intended terminal state
from the optional stop image without reading the full synopsis. The product
must also show that users who do not need a stop frame can complete the existing
start-only workflow with no extra prompt call, image job, or credit charge.

Before rollout, define a labeled evaluation set of at least 20 shots covering
an action sequence, a decision, an aftermath, a solo beat, and a multi-character
beat. The proposed launch target is at least 90% reviewer agreement that the
start image is an opening state and at least 90% agreement that the stop image
is the intended terminal state, with zero observed start-only flows receiving a
stop prompt/image call or charge. Record the denominator, reviewer rubric, and
provider-capability breakdown with the rollout metrics; do not treat a prompt
job's technical success as semantic success.
