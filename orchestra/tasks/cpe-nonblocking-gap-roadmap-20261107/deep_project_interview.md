# Deep Project Interview — CPE Non-Blocking Gap Closure

## User-provided direction

The user asks for a complete development plan for remaining Cinematic Production Engine (CPE) gaps. The system must never obstruct normal image or video creation because an optional CPE capability is disabled, missing, slow, stale, invalid, or judged aesthetically below target. The user wants the complete solution planned now; no production deployment is authorized by this planning request.

The accepted source requirements are in `requirements.md`, distilled from the user's two earlier briefs: the read-only Vertical Drama architecture discovery brief and the critical non-blocking production policy. The policy's required P0–P4 scope and regression acceptance matrix remain the governing input.

## Clarifications needed

None. The user specified the key product invariant, full phase scope, safety constraints, required evidence, and requested output. Technical and sequencing choices can be inferred from the codebase and current repository policies.

## Auto-decisions

- Treat P0–P4 as an incremental integration roadmap over existing Vertical Drama workflows, not a greenfield renderer.
- Make P0 safety contracts and regressions the first implementation phase; no later phase may bypass them.
- Use `VerticalDramaEpisodePipeline.generateRealStoryboard` as the first optional director/shot-intent seam before the storyboard is persisted. Continue to use `generateRealStartFramePlan` for optional continuity enrichment. Image/video generation eligibility remains governed by existing production conditions.
- Reuse the current model registry, provider routing, asset ownership, credit ledger, episode run/artifact records, scene/identity QC, audio/assembly, and canonical `worker_jobs` plus outbox control plane. Do not introduce a parallel job engine or asset store.
- Separate hard controls (authorization, ownership, content safety, configured-provider capability, verified media readiness, valid budget, cancellation) from advisory cinematic quality. Advisory outcomes do not alter production eligibility or the last successful asset pointer.
- Reconcile existing registered Specs and their canonical requirement ledgers before assigning implementation scope. Do not allocate another SPEC number in this roadmap.
- Serialize implementation slices that touch shared episode pipeline/router files; parallel implementation is not assumed just because the roadmap has multiple phases.
- Treat integration into `origin/main` as distinct from deployment. Production deployment remains outside this plan.

## Repository discovery evidence

- Canonical-source preflight: `BASELINE_READY`, local `main` and fetched `origin/main` both at `620bbe26c65f53d3026a67f9edd03818c51ee664`; the checkout has unrelated dirty/untracked files that must be preserved.
- SocratiCode index/tooling is not exposed in this session; discovery used targeted shell search and registry inspection instead.
- Registry candidates include Features 137, 138, 140, 149, 150, 155, 157, 167, 170, 173, and 175 plus Quick Specs 167, 186, 191, and 298. Several code-complete source claims still have canonical handoffs marked `DORMANT_UNRESOLVED`; e.g. 137 has 34 unresolved requirements, 138 has 31, 155 has 114, 157 has 170, 167 has 116, 175 has 28, and 298 has 15. The implementation plan must not equate existing source or a prior plan with canonical completion.
- Current source already contains optional shot-scene intent and scene-continuity fail-open handling, `stageBlocksPaidGeneration` that only treats `blocking` findings as paid-generation blockers, clip identity and frame continuity advisory procedures, bounded judged video-prompt generation, repair-stage preservation behavior, partial-assembly support, series look-lock, dialogue/audio and series-memory components, and canonical worker-job adapters. Their cross-feature acceptance evidence still needs reconciliation.
