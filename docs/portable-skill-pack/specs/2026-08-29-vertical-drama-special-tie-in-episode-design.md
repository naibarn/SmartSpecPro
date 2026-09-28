# Vertical Drama Special Tie-in Episode

Status: SPEC REVIEW PASSED (CURRENT AUDIT: 6 ROUNDS)
Date: 2026-08-29
Owner: Vertical Drama

## Executive decision

Add a special-episode creation path to the existing Vertical Drama episode
model and episode page. A special episode is a tie-in episode for a product,
location, or store and is created from a user-provided idea plus visual
references. It does not consume the normal episode story breakdown.

The implementation must reuse the existing episode list, episode detail page,
storyboard, start-frame, video-prompt, image-generation, video-generation,
polling, and credit-confirmation functions. The only new behavior is the
special creation dialog, special input/reference orchestration, automatic
prompt generation, and the minimum additive data/runtime branches required to
represent a non-standard shot count.

Creating a special episode generates and persists the image start-frame prompt
and video prompt through `idea-to-video-prompt`. It does not automatically
render an image or video and does not bypass the existing explicit media
generation buttons or credit gates.

## Problem and goals

Normal episodes are driven by the series overview/story bible and currently
expect the normal storyboard contract. Tie-in content needs a separate brief
and can require product, location, or store references that are not part of
the normal episode story.

Goals:

- Let a user create a special episode from an idea up to 5,000 characters.
- Support one to three product, location, or store reference images from
  upload or Marketplace Capture.
- Reuse series characters and character reference locking.
- Support 8, 10, 12, 15, 20, 24, or 30 seconds per shot.
- Let the skill determine the number of shots, constrained to one to five.
- Support 9:16, dialogue mode, up to three actual speakers, optional extras,
  optional dialogue guidance, and person/product reference locks.
- Persist output in the existing episode/start-frame/video-prompt structures so
  the existing episode UI can continue from the same point.
- Optionally create a reusable location/scene slot when a new location or store
  reference is supplied.

Non-goals:

- Changing normal episode creation, numbering, story-bible materialization,
  or the normal 9-shot/8-clip production contract.
- Automatically rendering images or videos during special creation.
- Mutating the season-level product tie-in plan.
- Allowing arbitrary external URLs or skill-generated asset IDs to become
  canonical media records.

## Existing implementation boundary

The primary existing path is:

`VerticalDramaSeriesDetailPage` / Episodes tab -> existing episode creation
and list -> `VerticalDramaEpisodePage` -> existing storyboard and prompt/media
mutations.

The implementation should extend the existing `verticalDramaEpisodes` router,
episode persistence, shared contracts, and episode-page state with additive
special branches. It should reuse:

- `VerticalDramaEpisodePage` and its existing loading, polling, retry, and
  media-generation controls.
- `VerticalDramaStoryboardPanel` and the existing character/reference picker.
- Existing start-frame and video prompt persistence contracts.
- Existing upload/media registration and source-pack patterns.
- Existing Marketplace Capture product-image resolution.
- Existing location stock and location-asset ownership/QC patterns.
- Existing product tie-in reference resolution and disclosure/claim guardrails.

Expected implementation touchpoints are:

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`: add the
  special entry action/dialog launch while leaving normal add-episode handlers
  unchanged.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` and
  `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`:
  add typed episode-kind/shot-contract variants to the shared surfaces; do not
  create a second episode page or storyboard.
- `apps/web/server/routers/verticalDramaEpisodes.ts`: add narrow special
  create/status/retry procedures; do not alter the semantics of
  `generateNextEpisodes`.
- `apps/web/shared/verticalDramaSeries/contracts.ts` and the episode shot
  resolver: add the additive special contract while preserving normal defaults.
- `apps/web/server/services/verticalDramaInteractiveJobs.ts` and its existing
  executor/status path: run the special skill job with owner-scoped polling and
  idempotency.
- The normal `verticalDramaEpisodePipeline` story-generation path and its
  normal duration-profile constructors are not called for special creation.
  Special creation enters only at the validated downstream prompt/plan
  contracts that the existing explicit render actions already consume.
- `apps/web/drizzle/schema.ts` plus a new additive migration: add the typed
  episode fields and `specialData` without rewriting normal rows.
- Existing source upload, Marketplace Capture, location-stock, product-tie-in,
  and skill package modules: reuse their authorization/provenance boundaries;
  do not introduce a parallel media registry.

The exact file names may move with repository refactoring, but the ownership
boundaries are mandatory and must be preserved in the implementation plan.

Normal episodes must retain their current defaults and behavior. No normal
episode should be converted into a special episode by inference from missing
fields; the new kind must be explicit.

## Shared component and flow strategy

There must be one shared episode surface with explicit variants, not a copied
special-episode page. Use the existing component names and local design-system
primitives in the repository; where a current capability is embedded in a
normal-only component, extract the smallest neutral shared component first.

Shared components/contracts:

- Episodes tab list/card: one component with an `episodeKind` display variant
  and one formatter for normal `SUB-EP N` versus special `SPECIAL NN` labels.
- Episode detail page: one `VerticalDramaEpisodePage` with the existing
  loading, prompt display, polling, retry, download, and media-action regions.
  It receives the resolved episode-kind/shot contract rather than branching to
  a second page.
- Storyboard: one `VerticalDramaStoryboardPanel` and one shot-card contract.
  The panel renders the supplied shot collection; normal resolves to 9 shots,
  special resolves to 1–5 shots.
- Prompt and media action controls: one shared action/polling/credit-gate
  component. Special only supplies episode-local model IDs and its resolved
  shot contract.
- Reference upload/picker, Marketplace image picker, character picker, model
  selector, validation field, progress, and error-state primitives: reuse the
  existing components/patterns so focus, accessibility, upload registration,
  and model capability messaging evolve consistently.
- Marketplace Capture image selection must reuse/adapt the existing
  `apps/web/client/src/components/marketplace/ProductImagePicker.tsx` as a
  controlled selection primitive. The special dialog owns only the product
  search/selection orchestration and passes `maxSelected=3`, selected managed
  image IDs, and an explicit special-episode selection scope; it must not fork
  URL-only image selection behavior.

Special-only components/services:

- A `SpecialTieInEpisodeDialog` container for special-only fields and submit
  orchestration.
- A special input normalizer/validator and the `idea-to-video-prompt` adapter.
- Special location-slot linking and special shot-contract resolution.

The dialog must not duplicate the normal episode wizard or normal story-list
logic. Conversely, normal creation must not render the special dialog, call the
special endpoint, load special model recommendations, or invoke the skill
adapter. Shared code must receive explicit typed props/defaults so a missing
`episodeKind` continues to mean normal behavior.

| Concern           | Normal episode              | Special tie-in episode        | Shared boundary                      |
| ----------------- | --------------------------- | ----------------------------- | ------------------------------------ |
| Creation source   | Overview/story bible        | Idea + references dialog      | Episodes tab action shell            |
| Episode page      | Existing page               | Same page                     | `episodeKind` variant                |
| Storyboard size   | 9 logical shots / 8 clips   | 1–5 shots / one clip per shot | Resolved shot contract               |
| Prompt generation | Existing normal stages      | Automatic skill adapter       | Prompt display/persistence contracts |
| Render models     | Existing normal model state | Episode-local selected models | Existing render action controls      |
| Paid render       | Existing explicit gates     | Same explicit gates           | Shared credit/polling controls       |

Any shared-component extraction must preserve the normal variant's current
props, defaults, generated payloads, and event ordering. Add normal regression
tests before changing a shared component and special tests beside them.

The special adapter must not call normal story-bible continuation,
normal-script generation, normal 9-shot decomposition, or normal duration
profile construction. Shared downstream readiness/assembly code may be reused
only after it resolves the explicit episode-kind shot contract.

## Data contract

### Episode kind

Add additive typed database fields with backward-compatible normal defaults:

```ts
type VerticalDramaEpisodeKind = "normal" | "special_tie_in";
```

Persist `episodeKind` as a non-null database column with default `normal`.
Existing rows are backfilled/read as `normal`; new special rows persist
`special_tie_in` explicitly. Persist `specialSequence` as a nullable database
column that is populated only for special episodes, and persist the versioned
input/run object below in a dedicated `specialData` JSONB column. The server
must expose these as one canonical typed contract; callers must not infer kind
from JSON presence.

Before allocating numbers or creating the shell, the transaction must verify
that the authenticated user can access the target series and that the series,
all selected character rows/assets, all location/product rows, and all media
assets belong to the same authorized tenant scope. The transaction must reject
cross-series references even when the caller knows a valid global ID.

The existing numeric `episodeNumber` remains the unique internal ordering
number within a series. A special episode receives the next available number
after the current series maximum, and also receives an immutable, monotonic
per-series `specialSequence` for its display label. Allocate both values in the
same transaction under the existing episode-number concurrency protection. Add
a partial unique constraint for `(seriesId, specialSequence)` where
`episodeKind = special_tie_in`; never reuse a sequence after deletion, so gaps
in `SPECIAL NN` labels are allowed and historical labels remain stable. Enforce
non-reuse with a dedicated per-series special-sequence counter/ledger row whose
`nextSequence` is incremented under the same transaction and is never
decremented by episode deletion; deriving the value from remaining episode rows
alone is not sufficient.

Display formatting is separate:

- normal: `SUB-EP 1`, `SUB-EP 2`, ...
- special: `SPECIAL 01`, `SPECIAL 02`, ...

Special episodes do not increment or materialize the normal planned count and
are excluded from `bible.episodeBreakdown` and normal episode generation.
All normal count, planned-episode, and normal-list queries must explicitly
filter `episodeKind = normal`; special rows may appear in the shared episode
list but must never be included in normal progress totals.

### Special input

Persist the versioned special input at `specialData.input` in the dedicated
`specialData` JSONB column:

```ts
type SpecialTieInInput = {
  schemaVersion: 1;
  idea: string; // 1..5000 characters after normalization
  referenceType: "product" | "location" | "store" | "mixed";
  referenceImages: Array<{
    mediaAssetId: string;
    source: "upload" | "marketplace_capture" | "series_asset";
    label?: string;
    provenance?: Record<string, unknown>;
  }>; // 1..3
  characterIds: string[]; // 0..4 series-owned selected characters
  durationSeconds: 8 | 10 | 12 | 15 | 20 | 24 | 30; // default: 10
  aspectRatio: "9:16";
  imageModelId: string; // special-episode selection, not normal-series memory
  videoModelId: string; // special-episode selection, not normal-series memory
  dialogueMode: "none" | "character_dialogue";
  dialogueBrief?: string; // max 3000 chars; prefix locked lines with `EXACT:`; other text is guidance
  speakerCharacterIds: string[]; // 0..3, subset of characterIds
  allowAdditionalCharacters: boolean;
  lockCharacterReferences: boolean;
  lockReferenceImages: boolean;
};
```

`imageModelId` and `videoModelId` are required special-episode settings. The
special path must not read, inherit, update, or overwrite the remembered model
selection/default from a normal episode or series-level preference. The chosen
IDs are persisted on this special episode for retry and later explicit render
actions only.

The UI may let the user select a fourth character for a scene, but at most
three characters may be speakers. The fourth character is serialized only as a
non-speaking scene participant when appropriate.

The backend revalidates all limits. It must not rely on client-side maxLength,
selection limits, or disabled controls.

### Skill run metadata

Persist enough metadata to make generation observable and idempotent:

```ts
type SpecialSkillRun = {
  schemaVersion: 1;
  skillId: "idea-to-video-prompt";
  status: "queued" | "running" | "succeeded" | "needs_clarification" | "failed";
  idempotencyKey: string;
  inputFingerprint: string;
  attempt: number;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
};
```

The canonical persisted shape is:

```ts
type SpecialEpisodeData = {
  schemaVersion: 1;
  createIntentId: string;
  inputVersion: number;
  outputVersion: number;
  input: SpecialTieInInput;
  skillRun: SpecialSkillRun;
  referenceBindings: Array<{
    skillReferenceId: string;
    role: "person" | "product" | "location" | "store";
    mediaAssetId: string;
    provenance: Record<string, unknown>;
  }>;
  modelSnapshots: {
    image: SpecialModelSnapshot;
    video: SpecialModelSnapshot;
  };
};

type SpecialModelSnapshot = {
  modelId: string;
  provider: string;
  providerModel: string;
  catalogVersion: string;
  supportedDurationsSeconds: number[];
  supportedAspectRatios: string[];
  supportsReferenceConditioning: boolean;
  supportsDialogueAudio: boolean;
};
```

`specialData` must also persist a server-generated reference binding map. Each
binding contains the skill-facing reference ID, role (`person`, `product`,
`location`, or `store`), managed `mediaAssetId`, and a non-secret source
provenance snapshot. The adapter may issue short-lived authorized access URLs
to the model provider, but those URLs are never the canonical persisted asset.
The skill-facing ID must map back to exactly one authorized managed asset.

`specialData` must also contain `inputVersion` and `outputVersion` integers.
Every edit/retry increments `inputVersion`, recomputes the fingerprint, and
captures that version in the queued job payload. A worker may persist output
only when its version and fingerprint still match the current special row;
stale completions are recorded and ignored.

Retries of the same create intent must reuse the same special episode and
location slot rather than allocating another episode number. A new create
intent receives a new `createIntentId` and may intentionally create another
special episode even when its normalized idea and references match an older
episode.

The database transaction creates the episode shell and commits the idempotency
record before enqueueing the durable skill job. If enqueueing fails after the
commit, the special run is marked retryable/failed and no duplicate shell is
created. A worker must never create a second episode as a recovery action.

For special episodes, `skillRun.status = succeeded` with skill output
`ready` or `assumptions_used` is prompt-ready. `needs_clarification` and
`failed` retain the draft shell but are not prompt-ready and cannot expose paid
render actions. Existing normal episode status values remain unchanged.

## `idea-to-video-prompt` integration

The existing skill package is the source of truth for semantic prompt
generation. The Vertical Drama server should use a dedicated adapter around
the existing skill execution/LLM infrastructure so it can:

1. Load the skill manifest and input/output/UI schemas from
   `apps/web/skills/idea-to-video-prompt/`.
2. Resolve all reference images and selected character looks to managed,
   tenant-authorized media before constructing the skill input.
3. Pass the idea, character references, product/location references, duration,
   aspect ratio, dialogue settings and optional dialogue brief, extras policy,
   and lock policy.
4. Validate the structured skill output before mapping it to Vertical Drama
   contracts.
5. Persist both the image start-frame prompt and video prompt in the existing
   `startFramePlan` and `motionPromptPack` plan fields.

Run the adapter through the existing durable interactive-job infrastructure,
using an owner-scoped key such as `series:{seriesId}:episode:{episodeId}:special`
and the same `{tenantId, userId, scopeKey}` for enqueue and polling. Persist
the trace/job ID and preserve refresh-safe status polling. Do not perform the
LLM/skill call inline in the create request.

Do not duplicate the full skill instructions in a router or client bundle.
Do not use the generic text-only skill result as if it were the structured
output unless the adapter proves schema-valid parsing.

Model IDs are execution/render configuration and must be passed through the
special episode orchestration as authorized metadata; they are not a reason to
change the semantic skill schema unless the existing skill contract explicitly
requires them.

Map `dialogueBrief` to the skill's dialogue-constraint field. If it contains
exact lines, the adapter must require those lines to be preserved verbatim in
the returned speaking turns; if it is guidance, the skill may compose within
that guidance. When `allowAdditionalCharacters` is false, every visible person
must come from the selected character bindings. When it is true, the skill may
add non-speaking extras only; it may not invent a new speaker or canonical
character asset.

### Required skill contract additions

The skill currently supports the special duration family except 12 seconds.
Add 12 seconds additively to the skill input schema, output/UI schema, and
timing rules. Existing durations remain valid. Do not add 12 seconds to or
change the existing normal episode duration profiles as part of this feature;
the special adapter owns the expanded duration union.

The skill output must remain compatible with its current structured shape:

- `status`: `ready`, `assumptions_used`, or `needs_clarification`.
- `shots`: one to five generated shot records.
- each shot includes the video prompt and keyframe/start-frame plan.
- reference locks identify the supplied character and product/location
  references, without inventing canonical asset IDs.
- dialogue turns use exact text and valid character reference IDs.

The adapter must reject output that has more than three speaking characters,
uses narration when dialogue mode is `none`, changes the requested duration,
or violates the requested 9:16 aspect ratio.

For each generated shot, the adapter must map the skill's start-frame/keyframe
plan to the existing image-prompt field and map the skill's video prompt to the
existing motion-prompt field. It must preserve the skill shot order and use the
same server reference binding IDs in both plans.

### Special model selection and isolation

The creation dialog must include separate selectors for `Image Model` and
`Video Model`. The initial recommendation comes from the special tie-in
capability catalog, not from normal-series remembered state. The user may
change either selector before creation.

The server must resolve and validate the selected model IDs against the
tenant/user-enabled model catalog and capabilities:

- image model: supports start-frame generation, 9:16 output, the selected
  reference-image policy, and product/person visual locking;
- video model: supports 9:16 output, the selected duration including 12 seconds
  where available, reference conditioning, and the requested dialogue/audio
  mode where required.

If a selected model is incompatible or unavailable, creation stops with an
actionable validation error and offers compatible special models. It must not
silently fall back to the normal episode model or to a provider URL/model alias
that is not authorized for the tenant.

After skill output is validated, persist the selected image model in the
special episode's `startFramePlan.selectedImageModelId` and the selected video
model in `motionPromptPack.selectedVideoModelId`. These are episode-local
values. They may be used by the existing explicit image/video buttons, but they
must never be written to series defaults, normal-episode memory, or shared
browser preference state.

Alongside each selected model ID, persist a non-secret resolved capability
snapshot (provider/model alias, supported durations, aspect ratio, reference
mode, and catalog version). Retry uses the episode-local resolved selection
until the model is unavailable; it then stops with a clear compatibility error
and requires a deliberate user selection change. Never persist API keys or
provider credentials.

## Creation flow

1. User selects `สร้างตอนย่อยเพิ่มเติม` in the existing Episodes tab.
2. The existing normal add-episode action remains unchanged; the new control
   opens a special creation dialog.
3. User enters the idea, selects one to three product/location/store images by
   upload or Marketplace Capture, selects series characters, chooses the
   special Image Model and Video Model, and configures
   duration/dialogue/extras/locks.
4. Client performs immediate validation for usability; server performs the
   authoritative validation and resolves media/character ownership.
5. Server allocates the next internal episode number and special sequence
   atomically, then creates a draft `special_tie_in` episode shell with the
   create-intent idempotency key.
6. Server invokes the skill adapter asynchronously and records the skill-run
   state.
7. On success, the adapter maps the generated shot plans into the existing
   start-frame and motion-prompt contracts. The episode remains draft/ready for
   the existing explicit image and video actions, using the episode-local model
   selections.
8. If the reference is a new location/store, the server creates or reuses a
   location slot using a stable fingerprint and associates the managed media
   asset. The slot is available to the Scenes tab and future episodes subject
   to the existing approval/QC rules.
9. The client opens the same episode detail page used by normal episodes and
   shows prompt-ready state. It does not start paid image/video jobs.

If the skill needs clarification, retain the draft shell as resumable state,
show the clarification/error state on the same page, and allow editing and
retry. No media render credit is charged. If a preflight rejects the input
before a shell is created, no episode number is consumed.

Generated output is prompt-ready only after schema validation, prompt-safety
review, model capability validation, and required location/reference linking
all succeed. If any post-skill step fails, keep the draft and raw input for
retry, mark the run with a typed failure code, and hide paid render actions;
never expose partially linked prompts as ready and never allocate a second
episode on retry.

## Prompt and shot mapping

Special output must map to the existing contracts without fake padding:

- `startFramePlan.frames` contains exactly the generated special shots.
- `motionPromptPack.clips` contains one generated video clip for each special
  shot and the requested duration. Special episodes therefore have one to five
  start frames and one to five clips; they are not padded or collapsed.
- Each start-frame prompt carries the selected character and product/location
  reference identities and lock instructions.
- Each video prompt carries the same visual continuity and lock constraints,
  plus dialogue turns where applicable.
- The persisted aspect ratio remains `9:16`.
- The persisted start-frame plan carries the selected special image model and
  the motion-prompt pack carries the selected special video model.
- The reference binding map resolves every prompt reference back to one
  tenant-authorized managed media asset.

Introduce a shared resolver such as
`resolveVerticalDramaEpisodeShotContract(episodeKind)` at readiness/assembly
boundaries. It must default to the current normal contract (9 logical shots,
8 clips) and return the special variable-shot contract (1–5 shots) only for an
explicit `special_tie_in` episode. Do not pad special episodes with empty or
synthetic shots.

Any normal-only assertion, loop, completeness guard, or assembly assumption
must branch through this resolver. The existing normal pipeline and normal
duration profiles remain unchanged.

## Reference and location behavior

### Product, location, and store images

#### Marketplace Capture product selection flow

Marketplace Capture selection is an in-dialog product browser, not a URL text
field. The user flow is mandatory and sequential:

1. Open `Marketplace Capture` from the special dialog.
2. Search products by keyword/name/SKU using the existing
   `marketplaceCapture.listProducts` query, with debounced search, platform or
   ownership filters where applicable, pagination, and result count.
3. Select one product card. Show its product identity and access scope before
   loading images.
4. Load that product's image catalog through
   `marketplaceCapture.listProductImages({ productId, ... })`.
5. Show selectable thumbnails with image type/source labels (for example
   main, description, review, or other approved image kinds), loading/empty/
   error states, and a selected counter.
6. Toggle one to three image thumbnails, preview the selected image, and
   confirm with `เพิ่มภาพที่เลือก`.
7. Return the selected managed references to the special dialog, preserving
   product ID, image ID, source, type, and provenance for each selected image.

The picker must support changing the product, clearing selection, and
reopening without losing the dialog's other fields. Changing product clears
only the pending image selection for the previous product after confirmation;
already-confirmed references remain visible until the user removes them. The
maximum of three applies across all product/location/store reference images,
not three per product. If the user needs images from another product, the
picker must prevent exceeding the total and explain which selected images to
remove.

The special dialog must not expose a free-form `productImageUrl` input. The
special endpoint accepts product/image identities and provenance only. If
Marketplace Capture returns an image URL without a managed asset identity, the
server must resolve/import it through the existing managed-media path before
the image becomes selectable; otherwise the image is shown as unavailable with
an actionable message. A raw URL must never be persisted as the canonical
special reference or sent as the sole reference identity to the skill.

Search and image loading must provide keyboard-accessible controls, visible
focus, cancel/back navigation, retry, no-results copy, permission-denied copy,
and a clear distinction between the selected product and selected images.

The dialog accepts either uploaded images or Marketplace Capture images. Upload
must use the existing managed upload/registration path. Marketplace images must
be resolved through the existing product-image service to a stable, authorized
media identity before persistence. Provider URLs are references for resolution,
not the canonical episode asset.

The server enforces one to three images and preserves source provenance. An
existing scene can be selected as one of these managed references; the dialog
must make the required reference choice explicit.

For each selected series character, resolve the existing approved/default
character look through the normal character-asset service and create a
server-owned `person` binding. If no authorized approved reference image is
available, block creation with an actionable character-reference error; do
not send a text-only character ID to the skill and do not invent a new asset.

### Characters

Character selection is limited to characters belonging to the current series
and tenant. The existing character assets/looks and disclosure behavior are
reused. `lockCharacterReferences` causes generated prompts to require visual
identity preservation; it does not create a new character asset.

### Location slot

For a new location/store, create a reusable location slot only after the source
media is authorized and the skill input is accepted. Use a deterministic
fingerprint from series, normalized location label/type, and resolved source
asset identities. Repeated attempts reuse the same row/asset association.

The slot must follow existing location approval/QC semantics. Failed skill runs
must not publish an unapproved location as production-ready. Existing manual
scene creation remains supported and is not replaced.

## UI/UX contract

### Entry point

Add a visible text action in the existing Episodes tab:

`สร้างตอนย่อยเพิ่มเติม`

Keep the existing normal episode action and list/card layout unchanged. Special
cards use the same card component with a clear `SPECIAL 01` / `SPECIAL 02`
label and a small tie-in status indicator.

### Dialog fields

Use the existing modal, form, upload, reference picker, and character picker
patterns where possible. Required controls:

- multiline idea input with visible `0/5000` counter and Thai guidance text;
- drag-and-drop/upload reference area with up to three thumbnail slots;
- Marketplace Capture picker with source labels;
- existing approved scene/location picker with source and QC status;
- series character selector and speaker selector;
- duration select: 8, 10, 12, 15, 20, 24, 30 วินาที;
- aspect ratio shown as locked `9:16`;
- `Image Model` selector with special tie-in recommendation and capability
  details;
- `Video Model` selector with special tie-in recommendation and duration/
  reference compatibility details;
- dialogue mode switch;
- speaker controls shown only when dialogue is enabled, capped at three;
- optional `บทพูด/แนวทางบทพูด` multiline input, maximum 3,000 characters; leave
  empty to let the skill compose dialogue from the idea;
- optional additional-character/extras control;
- reference-lock controls for people and supplied visual references;
- primary action `สร้างตอนพิเศษ` and cancel action.

Model selectors have explicit loading, no-compatible-model, unavailable, and
incompatible-duration states. Submit stays disabled until both models resolve
and pass capability validation; changing duration or reference mode
revalidates the video model. The UI never silently replaces a user-selected
model.

Validation and copy must make the distinction clear: this is a special tie-in
episode, not an additional normal story episode. The dialog must explain that
prompt generation happens automatically while image/video rendering remains a
separate existing action.

### Existing episode page

After creation, route to the existing `VerticalDramaEpisodePage`. Add only the
special metadata/status presentation and variable-shot handling required by
the new contract. Keep existing prompt display, start-frame image button,
video generation button, polling, retry, download, and credit confirmation.

For a special episode, normal story/script/stage-generation actions that would
invoke the normal episode pipeline are hidden or disabled. The shared page
still exposes the existing prompt review/edit controls and explicit start-frame
image/video actions. Saving a user edit records the edited prompt/version and
invalidates only the affected downstream readiness; it does not invoke normal
story generation and does not change the episode-local model or reference
locks.

For `needs_clarification` or `failed`, show an actionable state with the
original input retained, a retry/edit action, and no paid render action until
valid prompts exist.

### Responsive and accessibility requirements

The dialog must work at 360x800, 390x844, 768x1024, 1024x768, 1280x800, and
1440x900. Long ideas and reference thumbnails must not make the primary action
inaccessible. Drag/drop must have a keyboard/file-picker equivalent. Every
control needs a visible label, error association, focus state, and screen-reader
status for upload and skill progress.

## Failure, security, and billing

- Validate input and output on the server; client limits are advisory only.
- Enforce tenant, user, series, character, location, and media ownership at
  every reference boundary.
- Resolve image/video model IDs from the tenant-authorized capability catalog;
  never accept an arbitrary provider model string from the client.
- Keep special model selection isolated from normal-series model memory and
  prevent special creation from writing shared model defaults.
- Reject arbitrary external URLs, untrusted asset IDs, and skill-generated
  media IDs.
- Use idempotency and atomic numbering to prevent duplicate episodes on retry.
- Keep `needs_clarification`, provider refusal, schema mismatch, and transient
  infrastructure failure as distinct observable error classes.
- Never enqueue normal episode generation or paid image/video rendering from
  the special creation transaction.
- Reuse existing skill billing/preflight behavior where applicable; creation
  and prompt persistence do not consume image/video render credits.
- An idempotent retry must not double-charge a skill/LLM operation; persist the
  existing job/credit reservation outcome and replay the validated result when
  the same create intent, input version, and fingerprint are submitted. An
  intentional input edit creates a new input version and may create a new
  skill/LLM charge according to the existing billing policy; it must not reuse
  an old result for changed input.
- Reuse product tie-in disclosure/claim and prompt-safety guardrails before any
  render action.
- Run safety checks on both the submitted idea and generated prompts before
  marking the episode prompt-ready. A blocked result remains retryable/editable
  but cannot reach a paid render action.
- Log skill run ID, episode ID, input fingerprint, schema version, status, and
  error code without logging sensitive raw uploads or unnecessarily duplicating
  the full idea in operational logs.

## API/service shape

Use a narrow special endpoint/service rather than changing the semantics of
`generateNextEpisodes`:

- `createSpecialTieInEpisode({ createIntentId, input })` validates, resolves
  references, allocates the episode, and starts/queues the skill run. The
  caller generates a new `createIntentId` for each deliberate new episode and
  reuses it for request retry.
- `getSpecialTieInStatus(episodeId)` returns the resumable skill state and
  validation/clarification information through the existing episode detail
  surface.
- `updateSpecialTieInInput({ episodeId, inputVersion, input })` revalidates and
  saves clarification/edit changes, increments `inputVersion`, invalidates old
  output, and does not allocate a new episode number or special sequence.
- `retrySpecialTieInEpisode(episodeId, inputVersion)` reuses the same episode
  and idempotency contract.
- `listSpecialTieInModels({ durationSeconds, aspectRatio, dialogueMode,
referenceType })` returns `{ imageModels, videoModels }`, with each model
  carrying the same `SpecialModelSnapshot` capability shape used for persisted
  episode settings. It returns only tenant-authorized models compatible with
  the special request. It is a capability query, not a read/write of
  normal-series remembered model state.

The create response returns `{ episodeId, episodeNumber, specialSequence,
skillJobId, skillRunStatus }`. Status returns `{ episode, inputVersion,
outputVersion, skillRun, promptReady, clarification, errorCode }` with bounded
user-safe error text. Update/retry returns the next `inputVersion` and job ID;
none of these procedures returns provider credentials or unscoped media URLs.

The server uses a stable error taxonomy: `SPECIAL_FEATURE_DISABLED`,
`SPECIAL_INPUT_INVALID`, `SPECIAL_REFERENCE_UNAUTHORIZED`,
`SPECIAL_CHARACTER_REFERENCE_MISSING`, `SPECIAL_MODEL_UNAVAILABLE`,
`SPECIAL_MODEL_INCOMPATIBLE`, `SPECIAL_SKILL_CLARIFICATION`,
`SPECIAL_OUTPUT_INVALID`, `SPECIAL_SAFETY_BLOCKED`,
`SPECIAL_LOCATION_LINK_FAILED`, `SPECIAL_JOB_TRANSIENT_FAILURE`, and
`SPECIAL_IDEMPOTENCY_CONFLICT`.

The special input and episode-local prompt plans must carry the selected image
and video model IDs. Normal model-selection endpoints or series preference
mutations must not be called by this path.

The shared render-action component must choose model IDs from the episode-local
special plans when `episodeKind = special_tie_in`; it must not hydrate or
overwrite them from normal-series preferences. For `episodeKind = normal`, it
continues to use the current normal model-selection behavior unchanged.

The exact tRPC names may follow local naming conventions. Normal
`generateNextEpisodes` remains the normal storyline endpoint and must not gain
special-case behavior based on a missing story breakdown.

Older clients that omit `episodeKind` continue to use the normal endpoint and
normal defaults. Only the new special endpoint can create `special_tie_in`;
the server rejects attempts to smuggle the special kind through normal episode
inputs.

## Testing and rollout

Focused tests must cover:

1. Skill schemas: 12-second input/output/UI support, 1–5 shots, speaker cap,
   exact durations, and 9:16.
2. Mapping: valid skill output to start-frame and motion-prompt contracts,
   reference locks, dialogue turns, variable shot counts, and selected model
   IDs.
3. Router/service: validation, authorization, atomic numbering, idempotency,
   retry, clarification, failure classes, location-slot reuse, reference
   binding, durable job scope, no-double-charge behavior, typed responses, and
   input-update versioning.
4. Regression: normal episode creation, normal numbering, bible breakdown,
   9-shot/8-clip readiness, and existing media credit gates.
5. UI: dialog validation, upload, Marketplace Capture, character/speaker
   product search, product selection, image-catalog selection (1–3), existing
   scene picker, model selectors, capability errors,
   progress, retry, special card display, and existing episode-page controls.
6. Browser flow: create a special episode, observe prompt-ready state, verify
   no automatic render task, verify the episode-local image/video models, then
   explicitly start the existing render action. Separately create a normal
   episode and verify its model preferences, payload, event order, and render
   gates are unchanged.

Use an additive migration that adds `episodeKind` (default `normal`, backfilled
for every existing row), nullable `specialSequence`, and nullable
`specialData` JSONB, plus the partial unique special-sequence constraint. The
migration must not rewrite normal episode JSON, model settings, or numeric
numbers. It must not assign `specialSequence` or `specialData` to legacy normal
rows, and must verify the backfill count before making `episodeKind` non-null.
Add the special-sequence counter/ledger table as additive data; initialize
existing series counters to one greater than their current maximum special
sequence and never touch the normal episode counter.
Release behind a required `verticalDramaSpecialEpisodes` feature flag. Use the
project's existing feature-flag mechanism; if none exists, add one server-side
configuration gate with a client capability query so the server remains
authoritative. The flag gates only the new entry point and special endpoint;
normal episodes must behave identically with the flag disabled or enabled.
Roll out in this order:

1. shared contracts/schema and adapter tests;
2. server persistence and skill orchestration;
3. UI entry/dialog and existing-page presentation;
4. authenticated browser verification with managed references;
5. enable for internal users, inspect failure/credit metrics, then broaden.

Rollback disables the special entry point and endpoint while preserving any
already-created special draft records for later migration/retry. No destructive
rollback of episode or media data is required.

## Acceptance criteria

- User can create a `SPECIAL 01` episode from a 5,000-character idea without
  reading the normal overview story list.
- User can attach one to three upload or Marketplace Capture references and
  select series characters.
- Marketplace Capture selection works as product search -> product selection ->
  image-catalog selection, and the special request cannot be submitted with
  only a manually entered image URL.
- Marketplace Capture image selection reuses the shared product-image picker
  contract with a controlled three-image limit and managed asset IDs.
- User can select an existing approved scene/location slot or create/reuse a
  new location/store slot from managed references.
- Duration 12 seconds is accepted end to end; all other approved durations
  remain accepted.
- Skill returns one to five shots and the system persists matching image and
  video prompts without fake shot padding.
- The displayed shot count is read-only and comes from validated skill output;
  there is no special user-entered shot-count field.
- User can provide exact dialogue or dialogue guidance when dialogue mode is
  enabled, or leave it empty for the skill to compose; dialogue mode `none`
  produces no spoken content.
- Up to three speakers are supported; a fourth selected character can only be
  non-speaking.
- Product/person reference locks and 9:16 are preserved in both prompt plans.
- User can choose separate image and video models for a special episode; the
  chosen models are persisted only on that episode and are not read from or
  written to normal-series model memory.
- Incompatible or unavailable model choices fail clearly and do not silently
  fall back to the normal episode model.
- A new location/store can become a reusable scene slot with stable ownership,
  provenance, and QC state.
- The same episode page shows prompt-ready output and retains existing explicit
  image/video generation controls and credit confirmations.
- Normal and special episodes use the same episode page, storyboard, prompt
  display, media-action, polling, and credit-gate components; only the explicit
  special variant fields and shot contract differ.
- Special episodes do not alter normal planned counts, bible breakdowns,
  normal numbering display, or normal generation behavior.
- Retry of the same create intent is idempotent and does not duplicate episode
  numbers, location slots, or render charges.
- Editing clarification input increments only `inputVersion`, invalidates stale
  output, and preserves the same episode number and special sequence.
- Typed error codes produce bounded actionable UI states without exposing
  provider credentials or unscoped media URLs.
- Existing rows remain `normal` after migration, retain their original numeric
  numbers and model settings, and have no special data written to them.
- Shared-component regression tests prove normal episode payloads, endpoint
  calls, event order, model-memory reads/writes, and render-credit gates are
  behavior-compatible before and after the special variant is enabled.

## Traceability

| Requirement                                         | Design location                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Separate tie-in creation dialog                     | Creation flow; UI/UX contract                                    |
| Shared components with explicit variant boundary    | Shared component and flow strategy; Acceptance                   |
| Idea up to 5,000 chars                              | Special input; Dialog fields                                     |
| 1–3 product/location/store images                   | Special input; Reference behavior                                |
| Marketplace product search and image selection      | Marketplace Capture product selection flow; UI; Testing          |
| Series characters                                   | Special input; Characters                                        |
| Duration options including 12                       | Skill integration; UI; Testing                                   |
| Separate image/video models                         | Special model selection and isolation; Dialog fields; Acceptance |
| Skill-determined shot count                         | Prompt and shot mapping                                          |
| 9:16                                                | Special input; output validation                                 |
| Dialogue and 1–3 speakers                           | Special input; Skill contract                                    |
| Optional dialogue/script guidance                   | Special input; Dialog fields; Acceptance                         |
| Optional extras                                     | Special input; Dialog fields                                     |
| Person/product locks                                | Special input; Prompt mapping                                    |
| Reusable location slot                              | Location slot                                                    |
| Automatic prompts, manual rendering                 | Executive decision; Creation flow                                |
| Existing scene selection and clarification edit     | Dialog fields; API/service shape; Acceptance                     |
| Typed status/error response                         | API/service shape; Testing; Acceptance                           |
| Stable special numbering and normal-count exclusion | Episode kind; Special sequence                                   |
| Async retry and stale-result safety                 | Skill run metadata; Creation flow                                |
| Preserve normal episode flow                        | Existing boundary; rollout; acceptance                           |

## Open decisions

None. The approved decisions are: additive special kind, internal next numeric
number with `SPECIAL NN` display, exclusion from normal planned count, automatic
prompt generation without automatic rendering, reuse of the normal episode
page/functions, maximum three actual speakers, and additive 12-second skill
support.
