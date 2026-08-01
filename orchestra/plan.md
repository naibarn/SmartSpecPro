# Orchestra Plan

## Feature 138 P1b neighbor anchoring — 2026-08-01

### Classification
- scope: large implementation (router + prompt service + shared planner + client batch runner + focused tests)
- risk: high (paid media reference routing, tenant-owned asset resolution, concurrency and persisted provenance)
- chosen_route: existing approved Section 12 implementation plan -> direct TDD waves
- task_summary: implement the flag-gated same-scene neighbor anchor path while preserving flag-off byte identity; defer live rollout evidence and production DB mutation when authority/evidence is unavailable
- bug_route: false
- dispatch_preference: direct-standard-light; no sub-agents
- socraticode: unavailable in this session; targeted shell discovery used

### Scope boundary
- In scope: Section 12 sub-tasks 12.1–12.5 and required 12.7 audit events, plus tests and seed/config contract updates that are safe in-repo.
- Deferred: 12.6 repair-path anchoring (explicitly deferrable), internal paid-provider/browser smoke, and live `media_models` row mutation unless a backed-up local target is proven.
- Existing dirty worktree changes are preserved; use scoped temporary indexes for commits.

### Current status
- Code path complete and committed through `65f8367ca`; focused validation is 226/226 passing.
- Local DB read-only check already reports the required GPT Image 2 reference cap (16); no DB mutation was needed.
- Remaining: internal paid/browser/p95 evidence and explicit P2 deferral of `repairShotImage` anchoring; fresh Section 14 Gate A/B rerun is complete with zero fail-set drift.

## SmartAIHub layered loading resilience - 2026-08-01

### Classification
- scope: large implementation (shared web auth/tenant guards, Vertical Drama route, Python analytics, notification SSE)
- risk: high (auth bootstrap and shared route guards)
- chosen_route: data-first bug route -> direct-standard-light implementation waves
- task_summary: prevent indefinite blank protected routes, repair analytics enum drift, and bound SSE churn/observability
- bug_route: true
- dispatch_preference: direct-standard-light
- planned_agents: []
- security_gate_required: false; auth UX state changes, not auth authorization or tenant isolation

### Activation and constraints
- Orchestra activated because the approved fix crosses frontend shared guards, a page route, Python analytics, and SSE runtime behavior.
- Brainstorming design was written and approved before implementation: `docs/portable-skill-pack/specs/2026-07-31-layered-drama-series-loading-resilience-design.md`.
- SocratiCode MCP tools were unavailable in this session; discovery falls back to targeted shell reads and this fallback is recorded in `orchestra/progress.md`.
- Existing dirty worktree changes are unrelated and must be preserved; edits are limited to the approved files plus focused tests.
- No deploy, restart, migration, or production data mutation is authorized in this turn.

### Evidence ledger
- source: screenshot + server logs + live route/API probes + DB enum inspection + source trace
- identifier: `/drama-series/18?tab=episodes`; analytics `/api/v1/analytics/summary` and `/api/v1/analytics/time-series`; notification SSE user 1
- observed failure: protected route can return a blank page while raw `auth.me` remains unresolved; analytics logs `invalid input value for enum transaction_type: "deduction"`; SSE repeatedly evicts old connections
- data state: local origin/backend/DB/Redis healthy; route shell/assets return 200; live enum supports `usage` not `deduction`; series 18 data is present
- confidence: high for the three scoped defects; public edge latency remains a separate contributing signal
- next evidence needed: focused red tests and post-change local/runtime probes

### Success criteria
1. Auth/tenant/detail failures render bounded loading/error/retry states instead of indefinite blank UI.
2. Valid unauthenticated responses still redirect to login; successful sessions still reach the route.
3. Analytics no longer sends the invalid enum label and has regression coverage.
4. SSE eviction behavior remains bounded, measurable, and does not flood logs.
5. Focused tests, web typecheck, and production build pass; no production restart/deploy occurs.

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

## Marketplace Auto Review legacy migration surface - 2026-07-26

### Classification
- scope: small UI correctness fix
- risk: low
- affected_domains: Marketplace Auto Review legacy route, job workbench UX, focused UI tests
- chosen_route: direct TDD standard-light
- bug_route: screenshot/data-first UI diagnosis
- planned_agents: []

### Evidence ledger
- source: user screenshot plus local workflow routing/component source
- identifier: legacy run `mar_a0fc7e4c1f9e57f8d4162f99fde00a35`
- observed failure: the selected job is visibly marked `Legacy` but its aggregate timeline is rendered as the primary work surface, so rebuild/restart does not expose the new 9-shot board
- data state: staged UI mounts only when `metadataJson.planningArchitecture === "staged_two_skill_v2"`; legacy runs do not contain the staged per-shot checkpoint contract
- confidence: high
- next evidence needed: browser smoke with a newly created staged run; no paid generation is required for this UI fix

### Design
- Keep legacy data read-only and truthful; do not fabricate missing shot prompts or checkpoint state.
- Make the migration action to a new 9-shot staged Job Workbench the primary legacy path.
- Collapse the old aggregate timeline by default behind an explicit `ดูประวัติ Legacy เดิม` control so it remains auditable without presenting it as an actionable workbench.
- Preserve existing legacy sequential-shot editing when those records actually exist.

### Success criteria
1. A legacy run no longer presents its aggregate stage cards as the default work surface.
2. The legacy page clearly directs the user to create a staged job with 9-shot, checkpoint-safe controls.
3. The old timeline remains available on demand and existing outputs/legacy shot data are preserved.
4. Focused UI tests and production build pass without introducing new type errors in touched files.
