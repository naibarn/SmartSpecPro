# Orchestra Plan

## Task
Fix all Feature 119 HyperFrames Marketplace Auto Review completeness findings, then run three review/fix convergence rounds.

## Classification
- scope: large
- risk: high
- affected_domains: backend runtime APIs, render worker, Library finalize, Product Detail UI, Storyboard Review UI, MediaStudio handoff, tests, docs/gates
- estimated_file_count: 18
- chosen_route: direct-inline-waves (Codex standard light mode)
- task_summary: Close the implementation gaps found in the Feature 119 audit while preserving Standard Order and keeping HyperFrames runtime dependency deferred.
- bug_route: false
- parallel_default: true
- planned_agents: []
- dispatch_preference: direct-standard-light

## Activation Decision
- selected_skills: orchestra
- skipped_skills: deep-implement, because the current task is a focused remediation pass against an existing implemented plan rather than a fresh section-by-section deep implementation.

## Impact Preflight
- SocratiCode status: green for `/home/dev/projects/SmartSpecPro`.
- Candidate files from SocratiCode/search:
  - `apps/web/server/services/hyperframesRuntimeApiService.ts`
  - `apps/web/server/services/hyperframesRenderService.ts`
  - `apps/web/server/workers/hyperframesRenderWorker.ts`
  - `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
  - `apps/web/server/routers/marketplaceCapture.ts`
  - `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  - `apps/web/client/src/pages/StoryboardReviewPage.tsx`
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/components/marketplaceCapture/*`
  - focused service/router/component/e2e tests under the same feature area.
- Risk-sensitive surfaces:
  - new/modified tRPC procedure behavior and tenant/user render access checks;
  - Library finalize behavior and output artifact trust boundary;
  - worker state mutation for queued render jobs;
  - user-facing Auto-vs-Standard workflow.
- Constraints:
  - Do not install/import `@hyperframes/*` packages while dependency audit remains partial.
  - Do not replace Standard Order; keep existing `startAutoReview` path usable.
  - Do not claim real render/snapshot/browser runtime proof when gates are deferred.
  - Preserve unrelated dirty worktree changes.

## Waves
1. Backend safety and eligibility
   - Worker must not mark jobs completed without runtime execution and QA evidence.
   - Runtime API must only queue preview when access/run/storyboard state is eligible.
   - Save-to-Library must require feature flag, completed render, QA-ready output refs, valid idempotency, and real artifact metadata.
   - Add focused service/router tests for these behaviors.
2. UI workflow and handoff
   - Make Product Detail Auto CTA truly primary before Standard controls while Standard remains visible and usable.
   - Improve Storyboard Review and MediaStudio handoff state without forcing manual customization.
   - Add component/page/e2e fixture assertions where feasible.
3. Gates and convergence
   - Run focused tests, typecheck, HyperFrames release-gate scripts, and e2e skeleton.
   - Run three review rounds; fix any additional in-scope material findings immediately.
