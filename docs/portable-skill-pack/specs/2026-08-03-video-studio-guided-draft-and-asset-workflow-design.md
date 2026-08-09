# Video Studio Guided Draft and Asset Workflow

## Goal

Make Video Studio a review-first workflow. AI creates a content draft before
audio or scene production, the user can accept it or request a new draft with
feedback, and later AI/media operations require an explicit model/prompt/voice
confirmation. Timeline assets remain freely draggable from the user's machine,
Library, and Media history.

## Product flow

1. Brief creates a content draft using the existing skill-first adapters.
2. The draft is persisted as a candidate, separate from the canonical project
   document, and displayed per scene in the narration/script fields.
3. `ยืนยันเนื้อหา` promotes the candidate into the canonical document.
4. `ขอ draft ใหม่` requires/accepts improvement feedback and sends the prior
   candidate plus that feedback to the skill. The result must be materially
   different and is persisted as the next candidate; no production stage is
   advanced during this loop.
5. Scene generation displays an editable prompt and waits for confirmation.
6. Voice generation displays recommended voice models only, defaults to the
   cheapest recommended model, requires a voice selection and provider voiceId
   where applicable, and starts only after explicit confirmation.
7. Image generation follows the same prompt/model confirmation rule and stores
   completed media in Media history.
8. A right-side Asset Panel exposes Library, Media history, and local upload.
   All three sources use the same drag payload into the timeline. Local files
   upload first, then become draggable assets; failed uploads remain visible
   with retry and never create a broken layer.

## Boundaries and data safety

The canonical `video_projects.document` remains unchanged until the user
accepts a draft. Draft attempts need an owner-scoped persisted candidate and
bounded feedback/attempt metadata so a retry can be reconstructed server-side
without trusting a client-supplied previous document. Accept is an optimistic
concurrency operation. Regeneration never overwrites the accepted document and
never starts TTS, image generation, or render implicitly.

Recommended model queries expose only admin-recommended, enabled models for the
requested capability. The server validates the selected model again at
dispatch, so a stale browser cannot use an unapproved model. Prompt and
feedback inputs are length-limited and treated as user content, not executable
instructions.

## UI composition

- Brief: draft card with per-scene preview, accept, regenerate, feedback, and
  attempt history.
- Scene panel: prompt preview/editor and explicit `สร้างฉาก` confirmation.
- Narration panel: script is visible first; voice model, voice, and voiceId are
  selected before `สร้างเสียงพากย์`.
- Image generation panel: prompt, recommended image models, generation preview,
  and explicit confirm.
- Compose/timeline: right Asset Panel plus timeline drop target; dropped layers
  receive editable start/end time, duration, and source metadata. Template and
  motion choices provide previews and sensible presets, with advanced controls
  behind an expandable section.

## Failure handling

No approval or downstream production control is shown without its required
artifact. Missing document, stale revision, unavailable model, invalid voiceId,
upload failure, and failed skill jobs each receive a stable `VI_*` code and
actionable copy. A failed generation leaves the prior accepted document and
prior candidate intact, with retry available.

## Implementation waves

1. Draft candidate/accept/regenerate API, skill input with prior draft and
   feedback, Brief UI, and regression tests.
2. Scene prompt review, recommended model/voice selection, image generation
   model selection, and confirmation gates.
3. Asset Panel, local upload-to-library flow, drag/drop timeline insertion,
   template/motion preview, and timeline timing controls.

## Verification

Focused Vitest coverage must prove candidate isolation, feedback propagation,
accept concurrency, model allowlisting/default selection, voiceId validation,
prompt confirmation gates, upload/drop behavior, and timeline start/end values.
An authenticated browser smoke pass is required before claiming the production
flow is fixed; no deployment is included in this design.
