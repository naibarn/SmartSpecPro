# Synthesized specification: Vertical Drama start/stop frame generation

## Product decision

Add optional stop-frame authoring and image selection to each Vertical Drama
shot while preserving the existing start-frame workflow. Use two role-specific
LLM calls: the existing start path is explicitly instructed to author the
opening visual beat, and the optional stop path authors the terminal visual
beat using the complete current start prompt plus structured continuity facts.
Do not return both long prompts in the existing nine-shot response.

## User behavior

- Start Frame remains required for the current video-ready flow.
- Stop Frame is optional because many video tools do not accept it and
  automatic rendering would waste image credits.
- Existing start buttons, confirmation, task polling, upload, replacement,
  approval, and retry behavior remain unchanged.
- Each shot has independent start and stop controls:
  - create prompt;
  - edit prompt;
  - AI-adjust prompt;
  - generate image after prompt exists;
  - select/upload an existing authorized image;
  - inspect/replace/clear the selected image.
- A stop prompt requires a current start prompt as continuity anchor. Selecting
  an existing stop image does not require a stop prompt. Stop operations never
  regenerate or charge the start image.
- Existing episodes retain current start data and receive no automatic stop
  LLM call, image job, migration, or credit charge.

## Semantic prompt behavior

The start role must select the earliest useful frozen beat before the main
irreversible action or terminal decision. It must provide room for the next
motion and must not compress setup and conclusion into a summary frame. For the
Thanwa fish-market example, start depicts him moving through the dawn market
while evading pursuers; it does not already show the phone hidden in the ice
crate.

The stop role must read the same authoritative synopsis plus the exact current
start prompt. It selects the final story-critical frozen instant or immediate
aftermath, preserves identity/wardrobe/location/lighting/reference mapping and
staging axis, and does not invent events or props. It must make the state
meaningfully different when the synopsis contains a meaningful action/decision.

`frame_role` is an application/system contract. User repair text cannot turn a
start call into a stop call or vice versa. Policy-safe rewrite remains a
synopsis-only safety pass, not visual prompt authoring.

## LLM and job contract

- Keep the existing nine-shot start render-plan envelope and its v1 schema.
- New per-shot role-aware authoring normalizes a v2 response with required
  `frame_role` (`start` or `stop`) and `prompt`/`negative_prompt`.
- Stop authoring is one shot per durable background job. Input includes:
  `authoritative_synopsis`, shot/continuity context, full exact start prompt,
  start negative prompt, semantic handoff when available, and
  `start_prompt_hash`.
- Start semantic handoff is bounded and persisted for reuse; legacy frames may
  omit it and stop authoring must still use the exact start prompt.
- Output validation is fail-closed for role mismatch, malformed JSON, or
  truncation. No partial prompt persistence or paid image submission follows.
- User/current start prompt and authoritative synopsis are never silently
  truncated. If model input limits are exceeded, return a retryable explicit
  error and offer manual shortening.
- Prompt text is not written to ordinary logs/telemetry; use hashes, lengths,
  job/task IDs, and bounded redacted metadata.

## Persistence and concurrency

Add optional stop fields to `startFramePlan.frames[]`, including stop prompt,
negative prompt, prompt origin/mode/analysis, approved stop asset ID,
inspection-only stale asset ID, stop task marker, prompt/start hashes, stale
reason/time, semantic handoff, pair metadata, and pair QC.

`approvedStopFrameAssetId` is the only active authoritative stop selection.
When it becomes stale, clear it and move the old asset to
`staleStopFrameAssetId`; stale evidence cannot attach to video. All start-plan
writers merge optional stop fields by `shotNumber` so legacy payloads do not
erase them. An explicit user-confirmed full reset may clear both roles; normal
start regeneration and start-image replacement may not.

Hashes use exact persisted UTF-8 prompt text with `sha256:<lowercase-hex>`.
Source revision is a hash of stable canonical JSON containing authoritative
synopsis, shot context, continuity locks, reference mapping, and current start
prompt hash. Stop prompt jobs carry expected start hash; image tasks carry both
hashes. Late results lose a CAS race and cannot become active.

Stop prompt/image submit operations use owner/shot/role/prompt idempotency. All
mutations merge against a fresh locked owned episode row and use the existing
tenant/user authorization boundary. Provider URLs and arbitrary client asset
IDs are never trusted as canonical.

## Media and video handoff

Reuse `media_assets` and protected URL resolution. Include frame-level approved
stop IDs and clip-level `endFrameAssetId` in the resolver. Never reuse
`videoStartMediaAssetId` as stop data.

After motion-pack normalization, canonical server mapping overrides all LLM
frame-ID claims when selected assets exist, then capability evaluation and
`motionMode` calculation run. Single-shot clips use the shot's start/stop;
multi-shot clips use the first and last ordered source shots, with no sibling
role fallback. Stale/expired/unauthorized stop selections are treated as
absent.

Bridge mode requires start and stop assets plus selected model/request support
for same-request first/last input and reference limits. Otherwise use the
existing start-only mode and show a notice; stop data must not be reinterpreted
as a character/reference image.

## UI contract

Inside each shot card add a balanced frame-pair surface:

```text
[ Start Frame ] -> [ Stop Frame ]
  required           optional
```

Use equal 9:16 preview slots on desktop/laptop, Start as the required primary
slot, and a complete labeled Stop slot. On mobile/tablet stack or use two
columns only when readable and never introduce horizontal overflow. Each slot
has independent empty/loading/ready/error/stale/expired/unsupported states,
authenticated preview, picker/upload, accessible role+shot labels, and no
icon-only primary action. The shared picker target carries an explicit role.
New Thai/English labels go through existing i18n with fallback text.

Start prompt editor state and stop prompt editor state are independent. Stop
AI-adjust saves only stop fields. No full 6,000-character prompt is always
expanded in the card.

## Failure, credit, and rollback behavior

- Stop prompt failure never invalidates start.
- Stop image/provider/sync failure never retries start.
- Sync retry is attempted before paid regeneration.
- Image charge is reserved only after admission and is scoped to the selected
  role. Duplicate click/reload/navigation resumes existing work.
- Browser disconnect does not lose durable prompt/image work.
- Provider unsupported or stop absent always leaves the start-only flow usable.
- Rollback hides stop controls/attachment while preserving stored stop data for
  inspection; start behavior continues.

## Acceptance and proof

Tests must cover semantic start/stop fixtures, 6,000-character handoff,
truncation, role/schema validation, prompt/source hash CAS, legacy load, JSONB
merge preservation, idempotency, tenant authorization, task retry, canonical
single/multi-shot mapping, post-sync motion mode, provider fallback, media URL
resolution, UI role isolation, states, keyboard/focus, i18n, and mobile
overflow. Final UI proof requires authenticated browser evidence at desktop,
tablet, and mobile widths. Do not claim live provider/production behavior from
local tests.

## Out of scope

No automatic stop generation/backfill, no mandatory stop image, no new media
registry, no provider URL as authority, no change to existing start controls,
no bulk stop-image generation, and no new SQL table/column unless implementation
proves the existing JSONB/job ledger cannot satisfy the contract.
