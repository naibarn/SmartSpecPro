# Research: Feature 117 Production Director Agents SDK Auto Storyboard And Video

Date: 2026-05-31
Mode: existing codebase
Scope: planning only, no app-code changes

## Research Decision

This plan targets the current SmartSpecPro codebase, not the older node-canvas assumption. SocratiCode is available and green for `/home/dev/projects/SmartSpecPro` with 93,063 indexed chunks, so discovery used SocratiCode first, then targeted file reads.

## Current Implementation Baseline

Feature 118 is the implemented baseline and must remain factual. It records the current Marketplace Auto Review system:

- Marketplace product detail entry point: `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`.
- tRPC surface: `apps/web/server/routers/marketplaceCapture.ts`.
- Durable automation service: `apps/web/server/services/marketplaceAutoReviewService.ts`.
- Background advancement: `apps/web/server/jobs/marketplaceAutoReviewJob.ts`.
- Persistence: `apps/web/drizzle/0193_marketplace_auto_review_runs.sql` and `apps/web/drizzle/schema.ts`.

Current run stages are already durable:

- storyboard mode: `product_preflight`, `production_project`, `concept_story`, `prompt_plan`, `image_generation`, `storyboard_review`.
- full video mode adds: `video_generation`, `audio_generation`, `video_edit`, `render`, `library_finalize`.

Current APIs:

- `startAutoReview`
- `getAutoReviewRun`
- `listAutoReviewRuns`
- `advanceAutoReviewRun`
- `cancelAutoReviewRun`

Current UI already allows:

- `storyboard_images`
- `full_video`
- `auto`, `storyboard_3x3_split`, `video_shot_start_stop`
- `auto`, `native_video_audio`, `separate_tts_voiceover`, `silent`

## Key Code Findings

`marketplaceAutoReviewService.ts` currently has useful durable workflow plumbing, but the intelligence is still mostly deterministic:

- `buildAutoReviewPlan` creates a fixed 9-shot, 45-second Thai review structure.
- `buildProductTruth` and `buildProductDetailText` produce a product facts lock, but it is not yet a full evidence/claim/volatile-signal contract.
- Marketplace Capture has early variant strings in shared capture schemas, but the current confirmed product/auto-review path does not preserve a first-class selected variant/SKU snapshot for automation.
- Marketplace products can be owner-owned or group-shared with `read` / `read_update` permissions, so automation must snapshot access, allowed actions, and credit payer before spend.
- Marketplace Capture product health already tracks stale checks and metric snapshots, so Feature 117 must treat freshness as a generation preflight input rather than letting old prices/sold counts become claims.
- `getAutoReviewRun` and `listAutoReviewRuns` currently return serialized runs/stages/links directly; Feature 117 needs versioned projections so timeline, approvals, lineage, and redaction do not become frontend guesses.
- `concept_story` and `prompt_plan` stages are marked complete immediately during `startMarketplaceAutoReviewRun`.
- image/video generation still calls `scheduleProductionExecution` and `reconcileProductionExecution`.
- those calls load `ProductionSpace` and depend on canvas-shaped execution state.
- render/library finalize and Storyboard Review/Video Editor projections already exist and should be preserved.
- The codebase already has durable media callback event and callback DLQ tables/services, so Feature 117 should reuse or extend that foundation instead of inventing a separate callback ledger.
- Existing render/transcode/media storage code has resource-limit concepts, but Feature 117 still needs explicit auto-review quota, payload, transcode, and finalization gates tied to run/stage timeline state.
- Feature 113 already requires Marketplace Capture pre-upload review and redaction of account/header/user-personal regions. Feature 117 should preserve that privacy posture when captured evidence is reused for automatic ads.
- Feature 118 currently seeds audio strategy and Video Editor projection, while other media specs include subtitle/export profile concepts. Feature 117 should add explicit audio-rights and distribution-profile gates instead of assuming a 1080x1920 output is valid everywhere.
- Social/publishing adjacent specs already mention synthetic media flags and platform-specific upload metadata, so Feature 117 should preserve synthetic disclosure/provenance decisions even if auto-posting is out of scope.
- Current Feature 118 metadata includes source and affiliate URLs, but Feature 117 needs explicit CTA/landing integrity checks before generating ad-like CTA copy.
- Existing rollout specs include replay fixtures/provider contract drift concepts; Feature 117 should add QA calibration and human spot-check gates for model/provider drift.

`openai_agents_contracts.py` currently supports `RuntimeSurface = "chat" | "team" | "responses" | "skill"`. Feature 117 needs a `media_production` surface or a compatible versioned successor.

`openai_agents_gateway_model.py` already rejects direct provider API keys and direct provider base URLs for production runtime surfaces. That pattern should be extended to `media_production`.

The current Python import-boundary test allows SDK imports only in approved Python service files. Feature 117 must preserve this import boundary and must not add SDK dependencies to Node or frontend packages.

## Feasibility Assessment

The feature is feasible because the hardest non-LLM plumbing already exists:

- durable runs and stages,
- active-run dedupe,
- background advancement,
- marketplace product access,
- media provider task scheduling,
- Storyboard Review output,
- Video Editor projection,
- render submission and polling,
- Media Library finalize.

The risky parts are specific and solvable:

- replace deterministic planner output with structured Agents artifacts,
- remove or bypass `ProductionSpace`/`flowNodes` from this automation path,
- add a direct shot-payload media execution adapter,
- preserve selected variant/SKU context before creative planning,
- preserve shared-product authority, credit payer, and evidence freshness before creative planning,
- version/redact API projections for detail/list surfaces,
- attach canonical artifact lineage to downstream outputs,
- provide operator recovery for stuck long-running jobs,
- map provider safety/moderation refusals to non-retryable blockers instead of repeated paid retries,
- bind provider callbacks/polling results to authenticated/trusted provider event envelopes before state changes,
- enforce payload/trace and list/detail projection budgets,
- enforce storage quota, re-hosting, transcode, codec, duration, resolution, byte-size, cleanup, and playability checks before final Library output,
- define retry/DLQ/stage-lease behavior and launch SLO alerts before broad auto-video traffic,
- add marketplace privacy, audio-rights, distribution-profile, and tenant-safe creative-memory controls,
- add synthetic disclosure/provenance, CTA/landing integrity, QA calibration, and post-publish governance controls,
- add QA gates that actually inspect generated outputs,
- make every LLM call gateway-only,
- make every paid operation credit-idempotent,
- support long-running resume/repair without losing work.

## External Technical Research

OpenAI Agents SDK official docs describe a lightweight agent runtime built from Agents, tools, handoffs, guardrails, and Runner APIs. The docs also call out SDK use cases where the runtime manages turns, tool execution, guardrails, handoffs, sessions, artifacts, and coordinated multi-step work.

Relevant sources:

- OpenAI Agents SDK overview: https://openai.github.io/openai-agents-python/
- Running agents: https://openai.github.io/openai-agents-python/running_agents/
- Agents and handoffs: https://openai.github.io/openai-agents-python/agents/
- Guardrails: https://openai.github.io/openai-agents-python/guardrails/
- GitHub repository: https://github.com/openai/openai-agents-python

Implication for Feature 117:

- use Agents SDK for orchestration, handoff, structured output, tool guardrails, and repair decisions;
- do not let the SDK own SmartSpecPro persistence, billing, provider dispatch, or tenant permissions;
- use SmartSpecPro's LLM gateway as the model provider boundary.

## Advertising And Legal/Policy Research

This is not legal advice. The implementation should encode conservative product-safety and advertising guardrails, then require product/legal review for regulated launches.

Thailand-specific official anchors verified on 2026-05-31:

- OCPB legal page lists the Consumer Protection Act B.E. 2522, Ministerial Regulation on unfair advertisements B.E. 2564, and Announcement of the Committee on Advertising on fact verification/proving truth in advertising B.E. 2565: https://www.ocpb.go.th/news_view.php?nid=17494
- Thai FDA Food Division describes food advertising permission, including `หลักเกณฑ์การโฆษณาอาหาร พ.ศ. 2564`: https://food.fda.moph.go.th/local-economy/detail-adv/
- Thai FDA Food Division explains that food advertising with benefits, quality, or properties may need approval/e-submission and must match permitted content: https://food.fda.moph.go.th/e-submission-system/esub-002/
- Thai FDA cosmetic news says cosmetic ads do not require an ad license, but must not be false, exaggerated, misleading, or claim disease treatment: https://www.fda.moph.go.th/news/110968

International policy anchors:

- FTC advertising and marketing guidance: https://www.ftc.gov/business-guidance/advertising-marketing
- FTC endorsement guides FAQ: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- ICC Advertising and Marketing Communications Code: https://iccwbo.org/business-solutions/the-icc-advertising-and-marketing-communications-code/
- TikTok advertising policies: https://ads.tiktok.com/help/article/tiktok-advertising-policies

Implementation implication:

- Every claim must map to evidence.
- Volatile marketplace signals such as price, discount, sold count, rating, review count, and commission must not be spoken or visualized unless approved for that run.
- Product categories such as food, supplements, cosmetics, medical, health, alcohol, tobacco/e-cigarette, financial, children, gambling, and hazardous products require stricter policy classification and may block automation.
- Visual warning/disclosure text must be a structured rendering contract, not a free-form prompt wish.

## Testing Context

Existing tests already cover parts of the current behavior:

- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`
- `apps/web/shared/storyboardPromptAudio.test.ts`
- `apps/web/client/src/features/media-production/productionSkillContext.test.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/server/routers/__tests__/mediaProduction.execution.test.ts`
- `apps/web/server/services/__tests__/productionSpaceService.test.ts`
- `python-backend/tests/unit/test_openai_agents_import_boundary.py`

Expected test runner pattern:

- Node/web: `npm --prefix apps/web run test -- <paths>`
- TypeScript check: `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
- Python: likely `pytest` under `python-backend`; follow current repo scripts when implementing.

Feature 117 should add tests before implementation for:

- media production runtime contracts,
- gateway-only adapter behavior,
- direct-provider rejection,
- credit idempotency,
- direct shot-payload scheduling,
- product truth and claim evidence,
- product visual identity locks,
- face/character continuity,
- audio continuity,
- Thai advertising and visual warning overlays,
- long-running resume and repair.
- provider callback authentication/replay safety and DLQ recovery,
- payload/trace budget enforcement,
- storage quota/transcode/final-output gating,
- migration/backfill dry-run and launch SLO/alert checks.
- marketplace privacy and final-media PII checks,
- audio rights/mix checks,
- target distribution profile checks,
- tenant-safe creative feedback memory checks.
- synthetic disclosure/provenance and platform flag checks,
- CTA/landing URL and offer integrity checks,
- QA calibration/human spot-check checks,
- post-publish reuse invalidation checks.

## Value Assessment

Worth developing if the product goal is reliable auto-created review video at scale. The existing plumbing can already produce outputs, but without Agents-driven concepting and real QA it will repeat similar structures and can silently produce broken or non-compliant media.

Expected benefits:

- fresher concepts from the same product without manual prompting,
- fewer unsupported product claims,
- lower chance of product image distortion,
- lower chance of face/character continuity breaks,
- better natural Thai script and hook structure,
- safer Thai/international ad compliance,
- more reliable long-running completion through resumable checkpoints,
- clearer credit audit and retry accounting,
- safer provider event handling without trusting spoofed/stale/out-of-order callbacks,
- lower chance of stuck jobs silently looping or spending due to DLQ/retry/SLO gates,
- fewer production incidents from oversized traces, quota failures, expired URLs, or unplayable renders,
- fewer privacy incidents from marketplace/customer/reviewer/account data entering generated ads,
- fewer rights incidents from unlicensed music/SFX/voice/audio references,
- better platform fit through explicit profile-safe captions, warnings, CTA, loudness, and export variants,
- safer long-term creativity through tenant-isolated feedback memory,
- better compliance for synthetic/AI-generated media disclosures,
- fewer broken or misleading CTA/affiliate landing outputs,
- safer broad rollout through QA calibration and spot-check gates,
- safer asset reuse through post-publish invalidation governance,
- better explainability after an automated run.

Main cost:

- medium-high implementation complexity across Node, Python, media generation, QA, billing, and UI.

Recommendation:

- implement in vertical slices, starting with storyboard-only direct Agents planning and QA, then full-video execution and final QA.
