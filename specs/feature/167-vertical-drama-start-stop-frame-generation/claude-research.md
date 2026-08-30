# Deep-plan research: Vertical Drama start/stop frames

## Research decision

- Codebase research: required because this is an existing TypeScript/React
  application with Vertical Drama services, tRPC routers, JSONB contracts,
  Redis/BullMQ prompt jobs, media asset authorization, and provider routing.
- SocratiCode: unavailable in this session; research used targeted `rg` and
  line-range reads of the bounded files named by the feature spec.
- Web research: limited to durable queue/idempotency guidance. Provider
  capability behavior remains code/config authoritative and is not inferred
  from third-party documentation.
- Testing: Vitest is the web test runner. Focused browser-facing tests use
  jsdom; repository commands are run from the root with
  `npm --workspace apps/web test -- ...`.

## Codebase findings

### Start prompt and render boundaries

- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` owns the
  nine-shot `start_frame_render_plan`, per-shot prompt authoring, prompt-mode
  selection, output normalization, reference mapping, and prompt job handoff.
- `apps/web/skills/vertical-drama-shot-start-frame-render` has a strict
  nine-request output schema. It must remain start-only for compatibility.
- `apps/web/skills/vertical-drama-shot-start-frame-prompt` is a legacy
  start-named per-shot skill. The new role-aware adapter must preserve this
  entry point while requiring `frame_role` for new start/stop calls.
- `policy_safe_rewrite` is a synopsis-only safety transformation. It cannot be
  used as a visual prompt authoring response.

### Durable jobs and persistence

- `generateShotStartFramePrompt` enqueues work into the existing durable
  Vertical Drama shot-prompt job path; the browser polls job status before
  starting image admission.
- `startFramePlan.frames[]` is persisted in episode JSONB and contains start
  prompt, image task, approved asset, continuity, reference, and prompt-mode
  fields. Any start-plan writer must merge optional stop fields by
  `shotNumber`.
- `setApprovedStartFrameAsset` and `persistStartFrameImageTask` already enforce
  tenant/user ownership and locked fresh-row merges. Stop mutations should use
  the same boundaries and must reject late task results.
- Existing start task completion clears the task marker only after the result
  asset is linked. Stop task completion must follow the same lifecycle.

### Video and media boundaries

- `VerticalDramaMotionPromptPack.clips[]` already has
  `startFrameAssetId`, `endFrameAssetId`, and
  `first_last_frame_bridge` vocabulary.
- `syncStartFramesOntoMotionPromptClips` currently maps approved start assets
  by shot. Stop implementation needs an analogous canonical mapping and must
  override untrusted LLM frame-ID claims when authoritative selected IDs exist.
- The motion mode is currently derived from raw LLM end-frame claims. The
  planned fix must run canonical start/stop sync before deriving effective mode.
- `resolveEpisodePlanAssetUrls` already batches frame/clip media IDs through
  tenant-scoped `media_assets`; it must include frame-level approved stop IDs.
- `videoStartMediaAssetId` is an I2V-only start anchor and must not be reused as
  the stop field.

### UI and test boundaries

- `VerticalDramaStoryboardPanel.tsx` renders the existing start slot and
  start-specific controls. The page owns upload/resolve/approve/poll state and
  shared image picker targeting.
- Stop picker targeting must be role-explicit so stop selection cannot fall
  through to `startFrame` state.
- Existing tests cover start-frame task resume, prompt/image flow, and start
  drop/upload behavior. Add focused stop-role tests beside those suites and
  retain existing start IDs and behavior.

## External queue guidance

BullMQ's official documentation recommends idempotent jobs and supports custom
job IDs/deduplication identifiers for preventing duplicate in-flight work. The
implementation should still retain an application-level request hash and
ownership/source-hash CAS because queue-level deduplication alone does not
prove that a late result matches the current episode prompt.

- https://docs.bullmq.io/patterns/idempotent-jobs
- https://docs.bullmq.io/guide/jobs/deduplication
- https://docs.bullmq.io/guide/jobs/job-ids

## Decisions carried from stakeholder clarification

1. Use two role-specific calls rather than a single response containing two
   long prompts. The stop call receives the complete current start prompt and
   bounded semantic handoff as input.
2. Keep the existing start prompt/image controls and workflow unchanged.
3. Stop prompt and stop image controls are independent; stop image creation is
   optional and never automatic.
4. Existing episodes retain their current start frame. Stop is generated only
   when the user requests it; there is no auto-regeneration/backfill.
