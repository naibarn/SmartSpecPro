# Feature 170 — Vertical Drama Multimodal Reference and Skill-final Video Prompt Contract

**Status:** IMPLEMENTED — post-implementation gap review complete

**Created:** 2026-08-31

**Priority:** P0 — correct media grounding and provider-safe video generation

**Owner:** Vertical Drama / Prompt Skills / Media Generation / UX
**Depends-on:** Feature 131 Vertical Drama storyboard video flow, Feature 137
identity-stable I2V pipeline, Feature 138 scene continuity, Feature 149 video
prompt QC, Feature 160 skill-first visual source assets, Feature 167 start/stop
frame generation, managed `media_assets`, `vertical_drama_shot_references`,
worker media contracts, and provider capability routing.

## 1. Executive decision

Introduce one canonical, versioned shot-media contract with three deliberately
different roles:

| Role | Allowed media | Meaning | Optionality |
| --- | --- | --- | --- |
| `start_frame` | image only | The visible opening state of the shot | Optional unless the selected provider/mode requires it |
| `stop_frame` | image only | The visible terminal state of the shot | Always optional per shot |
| `references[]` | image, video, audio | Additional material used to ground identity, place, object, style, continuity, action, or sound | Zero, one, or many; mixed modalities are valid |

The system must check the existence and usability of the actual media asset. A
non-empty stop-frame prompt, reference description, or stale provider URL is not
evidence that an attachment exists.

Video prompt creation becomes a strict pipeline:

```text
canonical shot + actual media assets
        -> attachment inspection skill
        -> grounded context and explicit attachment manifest
        -> provider-specific draft instructions
        -> final video-prompt optimization skill (terminal owner)
        -> persist/display/send exactly that optimized prompt
```

After the final optimization skill returns, application code may validate,
persist, display, and transport the result, but may not append prose, dialogue,
style clauses, first/last-frame instructions, negative prompt text, or any other
semantic content. If a post-check requires a semantic change, the system must
rerun the final optimization skill or fail closed.

Provider behavior is selected from capability metadata and adapter modes, not
from version-specific conditionals. New releases such as Seedance 2.6 or
MiniMax H4 become usable by registering their capability profile; the shot
contract and UI do not require another feature rewrite.

Terminology is normalized as follows: the existing UI/data term `reference
frame` is a legacy image source and maps to `references[]` with
`source: "reference_frame"`; it is not a fourth temporal frame role. Only
`start_frame` and `stop_frame` carry temporal opening/terminal semantics.

## 2. Problem statement

The current flow has several incompatible meanings for “reference”:

1. Prompt authoring receives a primary image and some optional image URLs, but
   not a durable, ordered, typed reference bundle.
2. The shot-reference table and UI are effectively image-only even though a
   media asset can represent more than an image.
3. `startFrameAssetId` and `endFrameAssetId` exist in parts of the motion pack,
   but the stop image is not consistently resolved and sent as an actual
   provider input.
4. Worker contracts contain singular `referenceVideoAssetId` and
   `referenceAudioAssetId` fields, which cannot represent many mixed inputs.
5. Some video formatters add text after prompt generation. This can make the
   prompt shown in the UI differ from the prompt optimized by the skill and
   from the prompt used for QC/provider dispatch.
6. Model families have different first/last-frame and multimodal-reference
   rules. Treating all references as one image array silently drops media or
   changes temporal semantics.

The result is a shot that can claim to use a stop frame or reference media while
the model receives neither the actual asset nor an unambiguous instruction about
which attachment is authoritative.

## 3. Goals

1. Support shots with no frame attachments, start only, start plus optional
   stop, references only, or any valid combination supported by the selected
   model.
2. Keep start and stop image-only, including validation at upload, link, API,
   worker, and provider boundaries.
3. Support zero-to-many references in one shot, including mixed image, video,
   and audio media, with stable user order and explicit roles.
4. Let users drag local image, video, and audio files into the shot reference
   area, or drag equivalent assets from Library.
5. Inspect every actual attachment through a skill-first grounding step before
   video prompt authoring. The result must state what was inspected and what was
   unavailable to inspect.
6. Make attachment references explicit in the prompt using stable labels rather
   than unexplained array indexes.
7. Make the final optimized video prompt the single text source shown in the UI,
   persisted for retry/QC, and sent to the provider.
8. Preserve the exact reference bundle and its fingerprint across retries,
   repairs, speaker-switch flows, bulk generation, and paid render.
9. Expose model-specific capability and incompatibility reasons without silently
   discarding user attachments or silently downgrading stop-frame semantics.
10. Support future model versions through declarative capability profiles and
    adapters.
11. Preserve tenant isolation, managed-media authorization, credits,
    idempotency, and backward compatibility for existing image-only shots.

## 4. Non-goals

1. Start or stop frames are not generalized into video or audio.
2. Do not treat a prompt-only field, thumbnail URL, or provider URL as a valid
   attached asset.
3. Do not promise that every provider accepts every combination of media.
4. Do not silently trim, reorder, convert, or drop user-selected references.
   If provider limits require selection, show the exact result and require the
   declared policy to either block or explicitly select a deterministic subset.
5. Do not make a reference video or audio file a B-roll timeline segment. A
   timeline segment is a separate binding that may point to the same canonical
   media asset.
6. Do not send private raw storage URLs to the browser, prompt text, or an
   external provider when a managed proxy or signed transport is required.
7. Do not make the reference-frame image generator produce video or audio.
8. Do not hardcode model IDs or version strings into the canonical shot schema.
9. Do not change unrelated storyboard, story-bible, billing, or media-history
   behavior.

## 5. Audited current boundaries

The implementation must start from these verified boundaries rather than adding
a parallel pipeline:

| Boundary | Current finding | Required change |
| --- | --- | --- |
| `verticalDramaVideoMotionPromptGeneration.ts` | Prompt inputs are centered on `imageUrl` plus optional image references; no generic persisted mixed-media bundle or stop image is supplied to authoring. | Accept a canonical bundle and pass the same bundle to first call, compliance retry, repair, judge, and final optimization. |
| `buildShotVideoPromptVisionImages` | Produces `{url, label}` image inputs only. | Replace/extend with a typed inspection input that preserves modality, role, order, and inspectability. |
| `buildVisionAwareContent` in `verticalDramaStoryBible.ts` | LLM content assembly supports image parts, not generic video/audio attachments. | Add capability-aware inspection: attach native video/audio only where the authoring model supports it; otherwise provide derived, labelled evidence and never claim direct inspection. |
| `verticalDramaVideoPromptFormatter.ts` | Adds grounding/dialogue/style content around a persisted prompt. | Move all semantic composition before terminal skill optimization. Post-optimization formatter must be text-preserving. |
| `generateShotVideoPrompt` and `generateVideoClip` | Resolve current start image; stop and generic references are not resolved consistently. | Resolve actual canonical assets once, build a fingerprinted bundle, validate it, and reuse it through authoring and provider dispatch. |
| `vertical_drama_shot_references` | Rows are image-oriented in role names, UI, and returned projections, although they store a canonical `mediaAssetId`. | Generalize the projection and validation to image/video/audio while retaining compatibility for existing rows. |
| `referenceFramePackSchema` and worker payload | Has an image frame array plus singular video/audio IDs and `lastFrame`. | Add versioned arrays for start, stop, and typed ordered references; retain a reader for old packs. |
| `VideoGenerationRequest` | Separate image, video, and audio URL arrays already exist. | Keep transport arrays for provider compatibility, but derive them from the canonical ordered bundle and record the adapter mapping. |
| `verticalDramaProviderRouting.ts` | Can detect first/last support but not all modality limits or mixed-input rules. | Derive a complete capability profile and select an explicit provider mode. |
| Kie/MiniMax routing | H3 has text-to-video, image-to-video, and reference-to-video behavior with different limits and temporal semantics. | Treat each as an adapter mode; do not use image-to-video when mixed references are selected. |
| `VerticalDramaStoryboardPanel.tsx` | Shot reference strip accepts dropped/uploaded images and image-only previews. | Add a unified multimodal drop target and image/video/audio previews while keeping separate start/stop image slots. |

The static source audit found exact H3 routing rules and an existing Gemini Omni
Flash 1.1 first/last validation restriction. Current official Google guidance
also describes Gemini Omni Flash as supporting simultaneous text, image, audio,
and video inputs, so the existing restriction must be treated as a potentially
stale adapter rule and reconciled against the runtime provider contract before
enablement. ByteDance's official announcements state a 2.0 baseline of up to 9
images, 3 video clips, and 3 audio clips, and a 2.5 baseline of up to 30 images,
10 video clips, and 10 audio clips. These are provider-reported baselines, not a
permission to bypass the runtime catalog, tenant quota, or access-channel limits.

## 6. Canonical shot-media contract

### 6.1 Logical schema

The shared TypeScript contract should be equivalent to:

```ts
type ShotMediaType = "image" | "video" | "audio";

type ShotFrameAsset = {
  assetId: number;
  mediaType: "image";
  mediaFingerprint: string;
  resolvedAt: string;
};

type ShotReference = {
  referenceId: string;
  assetId: number;
  mediaType: ShotMediaType;
  role:
    | "reference"
    | "character"
    | "location"
    | "prop"
    | "style"
    | "continuity"
    | "action"
    | "barrier_reference"
    | "soundscape";
  source: "upload" | "library" | "generated" | "history" | "grid_cut" | "reference_frame" | "previous_main";
  order: number;
  label: string;
  mediaFingerprint: string;
  segment?: { inPointSec: number; outPointSec: number };
};

type VideoShotMediaBundle = {
  contractVersion: "vd-shot-media/1";
  bundleRevision: number;
  startFrame: ShotFrameAsset | null;
  stopFrame: ShotFrameAsset | null;
  references: ShotReference[];
  bundleFingerprint: string;
};
```

The final implementation may use different names, but it must preserve these
semantics:

- `startFrame` and `stopFrame` are nullable image assets, never prompt strings.
- `references` is an ordered list, not three unrelated singular fields.
- `referenceId` is server-generated and stable while an item remains in the
  shot; labels are assigned from the immutable prompt snapshot.
- `order` is one global order across mixed modalities. Provider-specific arrays
  are projections and must not redefine user order silently.
- `segment` is optional and applies to video references only. Audio segment
  support may be added by the same versioned contract when the provider needs
  it; it must not be encoded as an arbitrary string.
- `label` is human-readable and stable for one prompt run. Suggested labels are
  `START_FRAME`, `STOP_FRAME`, `REFERENCE_IMAGE_01`,
  `REFERENCE_VIDEO_01`, and `REFERENCE_AUDIO_01`.
- The persisted bundle stores asset IDs/fingerprints and authorization metadata,
  not permanent provider URLs. URLs are resolved just before an authorized
  vision/provider call.
- The fingerprint covers role, asset ID, media fingerprint, segment, and order.
  It does not include expiring signed URLs.
- `bundleRevision` increments on add, remove, reorder, role/segment change,
  asset replacement, or frame change. Prompt and render requests capture one
  immutable revision and compare-and-swap before persistence/dispatch.

### 6.2 Invariants and admission

The server must reject a bundle when any of the following is true:

1. A start or stop asset is missing, not an image, expired, revoked, not ready,
   or outside the requesting tenant/user scope.
2. A reference asset is missing, has an unsupported media type, is expired or
   revoked, or fails managed-media authorization.
3. A video/audio segment is negative, inverted, longer than the source, or not
   representable by the selected provider mode.
4. The same asset is attached with contradictory frame roles in one request
   without an explicit role-preserving duplicate policy.
5. A prompt-only stop/reference field is used as a substitute for an asset.

The resolver must use the existing tenant-scoped media lookup and managed storage
precedence. A missing actual asset is a fail-closed error with a user-actionable
message; it must not become an empty URL or a prompt-only reference.

The product may allow dozens of references in the shot manifest, but each model
adapter must declare maxima per modality and total payload size/duration. Any
selection or block must be visible before paid generation and recorded in the
run metadata.

The first release uses a configurable product ceiling of 50 reference items per
shot, separate from provider limits. The default policy for an over-limit bundle
is to block with an actionable edit list, not silently trim. An explicit user
action may create a new revision using a selected subset, listing every omitted
label before paid generation.

### 6.3 Persistence and compatibility

Prefer extending `vertical_drama_shot_references` so every row points to a
canonical `media_assets` record and exposes its actual media type. Add a typed
segment child record only when a video/audio time range is needed; do not put
timeline semantics into the reference row. Preserve existing role/source values
and map old image rows to `mediaType: "image"`. Legacy rows with role
`start_frame` are projected to `startFrame`, not into `references[]`; existing
`reference` and `barrier_reference` rows are projected as typed references.

Additive frame fields remain compatible with existing `startFramePlan` and
motion-pack JSON. New readers must accept old image-only records; new writers
must always emit `contractVersion` and explicit null/empty values. Existing
episodes must render without migration-time regeneration.

The migration must add/verify tenant-safe indexes for ordered shot references
and enforce uniqueness of `(shot, order)` within the active reference set. Media
type is always derived from canonical `media_assets`, never trusted from client
metadata or stale JSON. Revocation, deletion, expiry, or replacement increments
the affected shot revision and invalidates undispatched prompt runs.

## 7. UI and interaction contract

### 7.1 Separate frame slots

The shot card retains distinct slots:

- `Start frame` — image drop/upload/library selection only.
- `Stop frame (optional)` — image drop/upload/library selection only.
- `Reference media` — a separate multi-item drop zone for image, video, and
  audio.

Dragging a video or audio file over Start/Stop must show an invalid-drop state
and must not import or create a task. The labels must say that stop is optional;
absence is a valid state, not an error.

### 7.2 Multimodal reference drop zone

The reference drop zone must accept:

1. Local files from the hard disk, validated by MIME, size, duration, and media
   decoding readiness before upload.
2. Library cards carrying a canonical `mediaAssetId`, without downloading and
   re-uploading the asset through the browser.
3. Existing generated/history media through the same canonical asset-link path.

Local files must pass content sniffing/decoding, not MIME or extension checks
alone. The managed import path enforces configured file-size, duration, codec,
quota, malware/safety scan, and storage-readiness rules before linking a file to
a shot. Rejected files remain unlinked and cannot enter the inspection skill.

Each item displays modality-specific evidence:

- image: thumbnail, dimensions, source, role;
- video: poster, duration, dimensions, source, optional selected segment;
- audio: waveform or deterministic audio placeholder, duration, source, role.

The list supports reorder, role selection, remove, retry failed import, and
inspection details. User order is preserved across refresh and retry. The UI
must show actual count by modality and the selected model's effective limits.

All drag/drop actions have keyboard/button equivalents and announce accepted
modality, invalid-drop reason, upload progress, and final status to assistive
technology. A Library item carries a canonical ID and media kind; the client
must not infer kind from a thumbnail URL.

If a file is still uploading or media metadata is unavailable, the item is
`pending` and cannot be used for prompt generation or paid rendering. A prompt
must never be generated as if a pending item were attached.

### 7.3 Model readiness feedback

Before prompt generation and again before paid video generation, show:

- effective provider/model mode;
- accepted start/stop semantics;
- reference counts by modality;
- unsupported combinations, limits, or deterministic selection;
- whether the skill directly inspected each modality or used derived evidence.

Changing the selected model, provider mode, or capability profile after final
optimization invalidates the terminal prompt stamp and bundle run. The UI must
show the new readiness result and require a fresh Stage A–D pass before render;
it must not reuse a prompt optimized for another model mode.

No attachment may disappear merely because the currently selected model cannot
use it. The UI must offer model selection, explicit removal, or a clear blocked
state.

## 8. Skill-first video prompt pipeline

### 8.1 Stage A — asset inspection skill

For every actual asset in the bundle, invoke a grounding/inspection skill before
video prompt authoring. The skill input includes role, stable label, order,
source, media type, dimensions/duration, and the authorized media representation.

- Images are attached as actual images when the inspection model supports vision.
- Videos are attached as actual videos only when supported; otherwise use a
  bounded poster/keyframe set plus metadata and label it `derived_video_view`.
- Audio is attached as actual audio only when supported; otherwise use a bounded
  transcript/metadata representation and label it `derived_audio_view`.
- Failed, unreadable, or unavailable media is reported as unavailable. The skill
  must not infer that the unseen pixels/sound match the user description.

The result is a structured inspection record with facts, uncertainty,
modality, stable attachment label, and evidence source. It is context for the
next skill, not a replacement for the actual provider attachment.

The inspection skill has a versioned, schema-validated output equivalent to:

```ts
type AttachmentInspection = {
  referenceId: string;
  label: string;
  status: "inspected" | "derived" | "unavailable";
  method: "native" | "keyframes" | "transcript" | "metadata_only";
  observations: string[];
  uncertainties: string[];
  sourceFingerprint: string;
  skillSlug: string;
  skillVersion: string;
};
```

Inspection output is untrusted media-derived data, not executable instructions.
Prompt-injection text found in a frame, subtitle, filename, transcript, or
metadata must be treated as content and cannot change pipeline policy, provider
mode, or attachment roles. Inspection is bounded and cached by media fingerprint
plus skill version; a failure for one attachment cannot be hidden by dropping
that attachment.

### 8.2 Stage B — grounded video prompt authoring

The authoring skill receives:

1. The canonical shot synopsis and current continuity/character facts.
2. The inspection result for every attached asset.
3. The complete attachment manifest, including assets that are present but not
   directly inspectable.
4. The selected provider capability profile and mode constraints.
5. Explicit temporal facts: start frame is the opening state; stop frame is the
   optional terminal state; references are supporting evidence unless the mode
   declares a different semantic.

The skill must use stable labels in the prompt, for example:

```text
Use START_FRAME as the opening visual state.
If present, resolve the shot toward STOP_FRAME as the terminal visual state.
Preserve the identity/location/action/sound facts grounded by
REFERENCE_IMAGE_01, REFERENCE_VIDEO_01, and REFERENCE_AUDIO_01.
Do not invent details for an attachment marked unavailable or derived-only.
```

The prompt must explicitly state when a reference is not directly visible to
the authoring model. It must not say “as shown in the video” when only a poster
was inspected.

Every present, accepted attachment must have its stable label represented in the
prompt manifest. If the skill deliberately does not use an attachment for the
shot action, the prompt must say that the labelled asset is attached but not
used as a visual/action authority and include the reason. This makes omission
detectable and prevents an accepted reference from becoming an invisible input.

### 8.3 Stage C — provider-specific instruction composition

All deterministic additions happen here, before final optimization:

- provider mode and native temporal semantics;
- dialogue and lip-sync requirements;
- audio/soundscape constraints;
- style and safety constraints;
- reference-label manifest;
- negative constraints;
- any model-specific formatting or language requirements.

This stage produces a complete draft request for the final optimization skill.
It must not be followed by a formatter that adds prose to the optimized result.

### 8.4 Stage D — terminal final optimization skill

The final optimization skill is the last semantic writer. It must optimize the
complete draft for the selected provider mode while preserving the grounded
attachment labels and temporal meaning. It returns the exact `finalPrompt`,
`negativePrompt` (if the provider contract has one), skill/version stamp,
bundle fingerprint, provider mode, and validation facts.

The terminal result is persisted and displayed byte-for-byte. The following are
allowed afterward:

- length/schema/safety validation;
- hashing and audit metadata;
- authorization and URL resolution;
- transport field mapping;
- provider request serialization that does not change prompt text.

The same terminal-finalizer interface used by the image-prompt flow should be
shared for video. It receives the complete draft, provider profile, inspection
manifest, and source fingerprints, then owns the terminal positive and negative
prompt values. Prompt hashes are computed after finalizer output and again
immediately before outbound serialization; a line-ending, whitespace, or
Unicode transformation that changes the hash is a failed transport check.

The following are forbidden afterward:

- appending first/last-frame text;
- appending dialogue, sound, camera, or style clauses;
- adding negative prompt text;
- concatenating a repair or fallback phrase;
- trimming semantic text without rerunning the skill;
- rewriting labels or replacing the prompt from a second formatter.

If a user edits the displayed final prompt, that edit creates a new draft
revision and invalidates the terminal skill stamp. The edited text must pass
Stage D again before it can be persisted as final or sent to a provider. There
is no direct save-final bypass that makes UI text differ from the skill-finalized
prompt.

The equality invariant is:

```text
persisted.finalPrompt == UI.finalPrompt == QC.finalPrompt == provider.prompt
```

The same equality rule applies to `negativePrompt` when the selected transport
has one. “Provider prompt” means the exact string sent by this application; any
provider-side normalization is outside application equality and must be
observable from the provider request/audit response where available.

When a provider transport requires a non-text first/last field, the asset is
sent in that native field; the text remains unchanged. If a transport mapping
would require changing the text, rerun Stage D with the new mode or fail closed.

### 8.5 Retry and repair invariant

Compliance retry, motion assurance repair, judge, speaker-switch, bulk prompt
generation, and paid render must all use the same bundle fingerprint and the same
terminal optimization rule. A retry may produce a new terminal skill result,
but no path may use a pre-optimization draft as the final prompt or silently
drop an attachment.

The prompt-run state machine is explicit:

```text
draft -> inspecting -> grounded -> optimized -> ready_for_render -> dispatched
              |             |          |              |
              +----------> failed   stale          blocked
```

Only `optimized` or `ready_for_render` with matching revision, fingerprint,
prompt hash, and capability-profile version may be displayed as final or sent
to a provider. `failed`, `stale`, and `blocked` states retain diagnostics but
cannot enter paid dispatch.

## 9. Provider capability and adapter contract

### 9.1 Declarative profile

Extend the model registry/configuration with a version-independent capability
profile equivalent to:

```ts
type VideoCapabilityProfile = {
  providerFamily: string;
  modelKey: string;
  displayName: string;
  capabilityProfileVersion: string;
  capabilitySource: "runtime_catalog" | "provider_manifest";
  modes: Array<{
    id: string;
    acceptsStartFrame: boolean;
    acceptsStopFrame: boolean;
    acceptsReferenceImages: boolean;
    acceptsReferenceVideos: boolean;
    acceptsReferenceAudio: boolean;
    allowsMixedReferences: boolean;
    maxImages: number | null;
    maxVideos: number | null;
    maxAudio: number | null;
    maxTotalReferences: number | null;
    maxPayloadBytes: number | null;
    maxVideoDurationSec: number | null;
    supportedReferenceRoles: string[];
    preservesStartStopSemanticsWithReferences: boolean;
    transport: "kie" | "gemini" | "veo" | "generic_typed_media";
    nativeFieldMap: Record<string, string>;
  }>;
};
```

The profile is loaded from the authoritative runtime model catalog/provider
configuration. A model is not “ready” merely because its name matches a family.
Unknown or incomplete capability data yields an explicit unsupported state.

Adding a new version with an existing transport is data-only: register its exact
model key, capability source, modes, limits, and native field map in the runtime
catalog. No version-specific branch, UI change, canonical-schema migration, or
prompt-skill rewrite is allowed. A profile declaring an unknown transport or
missing required limits remains blocked until a generic adapter is available;
the system must not pretend that a new release is compatible by family name.

### 9.2 Adapter behavior

The adapter receives the canonical bundle and returns:

- selected mode and reason;
- exact accepted/omitted asset labels;
- native first/last fields where supported;
- typed image/video/audio arrays where supported;
- a deterministic mapping audit from canonical order to transport fields;
- a block reason if temporal or modality semantics cannot be preserved.

It must never silently treat `stop_frame` as a normal reference when the user
selected a terminal state, unless the capability profile explicitly declares
that equivalence and the UI/prompt says so.

Recommended mode classes are:

| Mode class | Mapping |
| --- | --- |
| `text_to_video` | No start, stop, or references. |
| `first_last_to_video` | Start -> native first-frame field; stop -> native last-frame field; reference mixing only when explicitly supported. |
| `start_plus_references` | Start remains the temporal opening field/first image; references are typed supporting media. Stop requires native support or an explicit block. |
| `mixed_reference_to_video` | Preserve all supported typed references and their manifest; do not claim first/last semantics unless the provider declares them. |
| `unsupported` | Block with actionable explanation; never silently downgrade. |

### 9.3 Required model audit matrix

The implementation must prove this matrix from the runtime catalog and provider
request logs before enabling each model/mode:

| Model family/version | Required handling in this feature |
| --- | --- |
| Gemini Omni Flash 1.1 | Reconcile the existing app validation with the current provider contract before enablement. Official Google guidance describes simultaneous text/image/audio/video input, while the current adapter has a first/last-plus-reference restriction. The runtime capability profile must explicitly declare whether the selected mode can combine these semantics; update/remove stale validation when proven, or block with a reason. Never silently drop references. |
| Seedance 2.0 | Use the official baseline of up to 9 images, 3 video clips, and 3 audio clips only as a capability-test fixture. Verify the exact runtime model key, native fields, mixed-reference order, access-channel limits, and start/stop behavior. Register these as a profile/adapter mode rather than branching on `2.0` in prompt code. |
| Seedance 2.5 | Use the official baseline of up to 30 images, 10 video clips, and 10 audio clips only as a capability-test fixture. Verify the exact runtime model key, native fields, mixed-reference order, access-channel limits, and start/stop behavior. Register these as a profile/adapter mode rather than branching on `2.5` in prompt code. |
| MiniMax H3 | Preserve separate text-to-video, image-to-video, and reference-to-video modes. Current routing indicates no attachments -> text-to-video; one/two images -> image-to-video with first/last mapping; three-plus images or any video/audio -> reference-to-video. Reference-to-video limits and the audio-with-image/video requirement must be validated by the profile. If mixed mode cannot preserve stop semantics, block rather than pretending it is a last frame. |
| Future Seedance/MiniMax releases | Register a new capability profile and adapter configuration. The UI, bundle, skill stages, persistence, and tests must remain unchanged. An unknown version stays blocked until its profile is complete. |

The spelling/marketing name shown in UI may differ from the internal `modelKey`;
the profile must include both display metadata and an authoritative key.

### 9.4 H3 temporal decision

For H3, `start_frame + stop_frame` with no generic references may use the declared
image-to-video first/last mode. When any video/audio or more than the mode's
image limit is attached, the adapter must select reference-to-video. If that
mode cannot guarantee a terminal stop state, the request is blocked with a
choice to remove incompatible references or proceed only after an explicit UI
confirmation that stop semantics will not be guaranteed. There is no implicit
conversion of stop into a generic reference.

## 10. API, worker, and runtime flow

### 10.1 Server API

Additive API fields should carry `VideoShotMediaBundle` or a server-built
equivalent by IDs. The server must rebuild and validate the bundle from canonical
records; the browser cannot be trusted to submit media type, tenant, or URL.

Prompt-generation response includes:

- terminal optimized prompt and skill stamp;
- bundle fingerprint;
- inspection summary by attachment;
- selected provider mode/capability profile;
- accepted/blocked asset mapping;
- whether stop frame was absent, present, or invalid.

Paid generation must use the persisted terminal result and the same fingerprint;
it must not regenerate a different prompt merely because the render endpoint has
different formatter code.

Prompt generation and paid dispatch must compare the captured `bundleRevision`,
`bundleFingerprint`, terminal prompt hash, and capability-profile version with
the current shot state. If any changed, the request becomes `stale` and the UI
must request a fresh inspection/finalization pass before dispatch; it must not
render against a newer or older attachment set accidentally.

### 10.2 Worker contract

Version `referenceFramePack` and shot-video payloads to contain:

- optional image-only `startFrame`;
- optional image-only `stopFrame`/`lastFrame`;
- `references[]` with asset ID, media type, role, order, label, and segment;
- `bundleFingerprint` and terminal prompt skill stamp.

The worker must accept old image-only packs and project them into the new bundle.
New dispatch must not populate singular video/audio fields as a substitute for
the array contract. Worker adapters must preserve the same capability mapping
and must fail before provider submission when an asset cannot be resolved.

### 10.3 Recovery and idempotency

Persist the bundle and terminal prompt before paid media dispatch. Retries use
the same task/reservation where the existing lifecycle permits it. A completed
provider task must be recoverable and linkable to the same shot and bundle
fingerprint before a new paid render is attempted.

## 11. Data and observability

Record structured, non-secret metadata for each prompt run:

- contract and capability profile versions;
- provider/model/mode;
- bundle fingerprint and ordered label manifest;
- counts and media types;
- inspection method per item (`native`, `derived`, `unavailable`);
- accepted/blocked mapping and reason;
- terminal skill slug/version/hash;
- prompt hash and equality checks across persistence/QC/dispatch;
- retry/repair stage and failure classification.
- inspection cache hit/miss, extraction duration, and bounded resource usage;
- prompt-run state transition and stale-revision reason.

Do not log private media URLs, raw audio transcripts, or full user media payloads
outside existing protected audit boundaries. Metrics must distinguish:

- invalid/missing asset;
- authoring inspection failure;
- unsupported model capability;
- provider admission/refusal;
- transport failure;
- post-generation media failure.

## 12. Acceptance criteria

### Contract and lifecycle

- [ ] A shot with no stop frame remains valid and sends no stop asset.
- [ ] A stop prompt without a real usable stop image is rejected or clearly
      marked unselectable; it cannot be counted as a stop frame.
- [ ] Start and stop reject video/audio at every boundary.
- [ ] One shot can contain one, many, or mixed image/video/audio references.
- [ ] Reference order, role, segment, and bundle fingerprint survive refresh,
      retry, worker dispatch, and paid render.
- [ ] Existing image-only episodes load and render without regeneration.

### UI

- [ ] Local drag/drop works for image, video, and audio references.
- [ ] Library drag/drop links canonical assets without browser re-upload.
- [ ] Start/stop slots remain image-only and visibly separate from references.
- [ ] Reference cards show modality-specific preview/metadata, role, order,
      source, pending/error state, and remove/reorder actions.
- [ ] User sees model limits and an explicit reason for block/selection.

### Skill and prompt correctness

- [ ] Every actual attachment goes through the inspection skill before video
      prompt authoring.
- [ ] Uninspectable video/audio is labelled derived/unavailable; the prompt does
      not claim direct observation.
- [ ] Prompt contains explicit stable references for present start, stop, and
      every accepted reference asset, or an explicit not-used reason.
- [ ] All deterministic prompt additions occur before terminal optimization.
- [ ] No code path appends semantic text after terminal optimization.
- [ ] Persisted, UI, QC, and provider prompt hashes are equal.
- [ ] A user edit invalidates the terminal stamp and requires re-optimization
      before final save/render.
- [ ] Repairs/retries use the same bundle fingerprint or create a new explicit
      version; they never silently drop attachments.

### Provider compatibility

- [ ] Gemini Omni Flash 1.1 conflicting first/last plus reference inputs are
      blocked or routed only through a proven compatible mode.
- [ ] H3 selects the correct mode for no attachments, image-only, and mixed
      references, and does not misrepresent reference-to-video as first/last.
- [ ] Seedance 2.0 and 2.5 are enabled only after runtime capability evidence is
      recorded for their exact model keys.
- [ ] A synthetic future model profile (for example Seedance 2.6 or MiniMax H4)
      can be added through configuration/adapter registration without changing
      the canonical contract or UI.
- [ ] Unknown/incomplete profiles fail closed with a useful message.
- [ ] Adding a new model version with an existing transport is configuration-only
      and does not require a version-specific code branch.

## 13. Test matrix

Implement focused tests before broad regression:

1. Contract parsing: old image-only payload, new full bundle, invalid frame type,
   missing asset, expired asset, tenant mismatch, segment boundaries, duplicate
   order, revision compare-and-swap, and fingerprint stability.
2. UI interaction: local image/video/audio drop, Library drag, invalid start/stop
   drop, spoofed MIME, upload pending state, keyboard alternative, reorder/remove,
   over-limit selection, and refresh persistence.
3. Skill inspection: native image, native video/audio where supported, derived
   keyframes/transcript, unavailable media, stable labels, and no hallucinated
   direct inspection.
4. Prompt finalization: all context before final skill, exact equality after
   persistence/formatter/provider request, user-edit invalidation, Unicode/
   line-ending stability, and rejection/rerun when a post-check would require a
   semantic edit.
5. Model adapter matrix: no attachments, start only, start+stop, references only,
   image-only references, video-only references, audio-only references, mixed
   references, over-limit references, and incompatible start/stop combinations
   for each enabled mode.
6. Retry/recovery: compliance retry, motion repair, speaker-switch, bulk pack,
   worker dispatch, completed-task recovery, and no duplicate paid submission.
7. Security: tenant-scoped asset resolution, no raw URL leakage, revoked asset,
   Library item from another tenant, malicious metadata/transcript prompt
   injection, and upload/content validation.

## 14. Rollout and implementation slices

Implementation should be delivered in independently verifiable slices:

1. Shared contract, media-kind/segment projection, resolver, fingerprint, and
   backward-compatible worker schemas.
2. Capability profile and adapter mapping with runtime catalog audit for Omni
   Flash 1.1, Seedance 2.0/2.5, and H3.
3. Skill-first inspection and terminal video-prompt optimization, including
   prompt-hash/equality guards and removal of post-optimization text mutation.
4. Server prompt/render/bulk/retry integration using one bundle source.
5. Storyboard UI multimodal drag/drop, Library linking, previews, reorder, and
   model readiness feedback.
6. Focused tests, migration/backfill for old image references, feature-flagged
   rollout, and observation of blocked/accepted mode metrics.

Enable new multimodal modes behind a feature flag until runtime evidence proves
the provider payload, prompt equality, and recovery path. Do not enable a model
version using a family fallback when its exact capability profile is missing.

## 15. Fixed decisions before implementation

1. Inspection uses the versioned inspection-skill contract in §8.1. It may run
   through the existing LLM path or a media-intelligence worker internally, but
   that implementation choice cannot alter the output schema, attachment
   coverage, or unavailable/derived status.
2. Version 1 supports whole-file audio references. Audio time ranges are not
   accepted until the contract adds an explicit audio-segment field and the
   selected provider mode declares support; arbitrary string ranges are invalid.
3. The server-side reference-manifest ceiling is configurable with a default of
   50 items per shot. Provider-specific limits are evaluated afterward. The
   default over-limit behavior is block; only an explicit selected-subset action
   creates a new revision.
4. `media_models.configJson`/the authoritative runtime model catalog is the
   source for exact model keys and capability profiles. Provider-family defaults
   may explain an unavailable profile but may not enable a paid mode.
5. The first release supports the declared generic transports in §9.1. A new
   model version using one of them is configuration-only; a genuinely new
   transport is blocked until its adapter is implemented and audited.

These decisions preserve the core invariants: actual media is required,
start/stop remain image-only, references are typed and many-valued, provider
semantics are explicit, and terminal optimized prompt text is immutable.

## 16. Ten-round spec review record

The spec was reviewed against the implementation boundaries and the reviewer
checklist in ten focused rounds. Issues found were fixed in this document before
marking it ready for implementation planning.

| Round | Focus | Gap found and correction | Result |
| --- | --- | --- | --- |
| 1 | Scope and terminology | “Reference” could still be read as image-only. Added a three-role contract and explicit mixed-modality `references[]`. | Closed |
| 2 | Data model and migration | No snapshot/revision rule could allow a changed attachment set to reach render. Added `bundleRevision`, fingerprint, compare-and-swap, indexes, and legacy reader. | Closed |
| 3 | Asset truth and admission | MIME/prompt/URL could be mistaken for a real asset. Added canonical media resolution, content sniffing, readiness, expiry/revocation, and fail-closed rules. | Closed |
| 4 | UI and accessibility | Drag/drop requirements did not cover invalid targets, Library media kind, keyboard access, or pending imports. Added modality-aware states and alternatives. | Closed |
| 5 | Skill-first inspection | Inspection output/failure semantics and prompt-injection handling were underspecified. Added versioned schema, native/derived/unavailable methods, cache, bounds, and untrusted-data rules. | Closed |
| 6 | Prompt finalization | A user edit, formatter, whitespace conversion, or negative prompt could break final equality. Added terminal-finalizer ownership, hash checks, edit invalidation, and outbound equality. | Closed |
| 7 | Provider modes | H3 and Omni Flash could silently lose stop/reference semantics. Added explicit mode classes, H3 decision, block policy, and mapping audit. | Closed |
| 8 | Future model versions | “Future support” could still require version branches or leave limits ambiguous. Added config-only registration for known transports and fail-closed unknown transport behavior. | Closed |
| 9 | Worker, retry, and operations | Singular worker fields, stale retries, and missing resource/cost observability were gaps. Added array contract, state machine, stale checks, cache/resource metrics, and recovery rules. | Closed |
| 10 | Acceptance and release readiness | Tests did not cover user edits, spoofed files, prompt injection, over-limit subset choice, or exact Seedance evidence. Added acceptance gates, test cases, fixed decisions, and runtime audit gates. | Closed |

Final review status: **Implemented and verified through ten post-implementation
gap-review rounds. Focused automated proof is green; browser, live-provider,
build, restart, and full typecheck verification are intentionally deferred for
the current low-memory verification pass.**
