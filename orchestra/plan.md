# Orchestra Plan

## Task
Implement one selectable Kie.ai GPT Image 2 model that routes automatically to
text-to-image or image-to-image based on attached reference images.

## Classification
- scope: medium implementation
- risk: medium
- affected_domains: media-model catalog, Media Studio selection/input contract,
  TypeScript generation service, Python Kie gateway/client, migrations and tests
- chosen_route: brainstorming-prelude -> direct-standard-light inspection
- task_summary: prove the current public-model and provider-model boundaries,
  implement the approved backward-compatible design and prove both routing branches
- bug_route: false
- dispatch_preference: direct-standard-light
- planned_agents: []
- security_gate_required: false

## Activation
- Orchestra auto-activated because this is a cross-layer code-aware product and
  routing decision.
- Brainstorming is active because the request changes user-facing selection and
  runtime routing behavior; implementation is gated on user approval.
- SocratiCode status was green with an incremental refresh in progress. It
  narrowed discovery to the GPT Image 2 seed/migration, Media Studio reference
  support, media generation service, and Python gateway.

## Success Criteria
1. Identify the authoritative model IDs at catalog, request, and Kie upstream layers.
2. Identify a single-model contract that does not alter other media models.
3. Preserve old stored/requested GPT Image 2 IDs through an explicit compatibility path.
4. Pass focused catalog, selection, service-forwarding, and provider tests.

## Evidence
- `apps/web/drizzle/0163_gpt_image_2_media_model.sql` creates two enabled rows.
- `apps/web/scripts/seed-media-models-kie-ai.ts` repeats the two-row catalog shape.
- `apps/web/client/src/pages/MediaStudio.tsx` derives attachment availability from
  model config rather than from provider identity.
- `python-backend/app/llm_proxy/gateway_unified.py` receives both the selected model
  and `reference_image_urls` before calling the Kie client.
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` already separates the
  public/request model from the upstream model through `api_config.kie_model_id`.
- Current Kie documentation confirms both modes use the same createTask endpoint,
  while image-to-image requires the distinct upstream model ID and `input_urls`.

## Recommended Direction
- Keep `gpt-image-2-text-to-image` as the backward-compatible canonical database
  row, rename its display name to `GPT Image 2`, and make reference input optional.
- Move both old IDs and the short `gpt-image-2` name into the enabled row aliases,
  then disable the separate image-to-image row so selectors show one item.
- Declare the reference-driven upstream variant in this model's `configJson.apiConfig`.
- Resolve that variant only inside Kie image generation when the model config opts
  in and normalized reference URLs are non-empty. Keep the public/internal model ID
  stable in tasks, billing, history, and saved projects.
- Do not alter the shared enabled-model resolver or introduce provider-wide inference.

## Alternatives Considered
1. New canonical `gpt-image-2` row: clean naming but higher migration and persisted-ID risk.
2. Frontend-only model swap: easy UI patch but bypassable by non-Media-Studio callers.
3. Provider-wide hardcoded GPT switch: small patch but embeds catalog policy in Python
   and is less extensible than an explicit per-model opt-in contract.

## Constraints
- The brainstorming design was approved by the user before implementation.
- No change may introduce generic reference-driven model switching for unrelated models.
- No destructive database action; migration must be additive/backward compatible.
- Existing dirty work and archived Orchestra state are preserved.

## Hermes reference download and Media History incident - 2026-07-20

### Classification
- scope: implementation-ready medium
- risk: medium
- bug_route: true
- chosen_route: direct-inline-waves
- dispatch_preference: direct-standard-light
- security_gate_required: false

### Evidence ledger
- source: worker_jobs row plus worker_job_events
- identifier: worker job 08e15bee-8ca7-47d5-9c33-6ca87d34bc6a
- observed failure: `[HERMES_REFERENCE_DOWNLOAD_FAILED] reference download returned HTTP 404 Not Found`
- data state: failed at `downloading_references`; frozen contract contains three checksummed references
- confidence: high
- next evidence needed: verify newly minted URLs return HTTP 200 after normalization

### Design
- Normalize persisted storage proxy/upload URLs back to object keys before
  presigning; preserve plain object keys and ownership checks.
- Project Hermes image/video jobs from `worker_jobs` into `media.listTasks`,
  using the existing `MediaTask` projection instead of duplicating rows in
  `media_tasks`.
- Merge, sort, filter, and count Hermes tasks with the existing provider,
  MCP, deferred, and HyperFrames history sources.

### Success criteria
1. A reference whose `storageKey` is `/api/storage/files/<key>` is presigned
   as `<key>` and the resulting URL downloads successfully.
2. Hermes image and video jobs appear in Media History for the requesting
   user across pending, processing, completed, and failed states.
3. Existing non-Hermes history sources and task polling remain unchanged.

## Vertical Drama rapid prompt plus image timeout - 2026-07-21

### Classification
- scope: small
- risk: medium
- affected_domains: client workflow, tRPC router, focused tests
- estimated_file_count: 4
- chosen_route: direct TDD bug fix
- bug_route: data-first general debugging
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

### Evidence ledger
- source: screenshot, production journal, production database rows
- identifier: episode 114; start-frame run ids 363-370
- observed failure: eight successful full `start_frame_render_plan` runs were launched while rapid per-shot clicks shared a stale empty plan; several LLM retry chains overlapped and the proxy returned HTTP 524 before JSON
- data state: all eight duplicate runs eventually succeeded; media queue peaked at 16 and later drained to zero
- confidence: high
- next evidence needed: deployment-time browser smoke after the shared dirty worktree is safe to restart

### Impact and route
- Change the per-shot prompt plus image handler to call only `generateShotStartFramePrompt` when the frame or prompt is missing.
- Let that mutation create a minimal frame from persisted storyboard character facts and merge under the existing row lock.
- Preserve sibling/concurrent frames and the latest selected image model from the locked plan.
- Keep the explicit whole-episode start-frame-plan action unchanged.
