## Task Classification
- Scope: medium
- Risk: medium
- Affected domains: web backend services, skill runtime, DB run history
- Estimated file count: 4-7
- bug_route: true
- route: direct-inline-standard-light
- SocratiCode: active; use before broad discovery

## Current Task: Intermittent Storyboard Grid Prompt Preflight Failure

- Scope: medium
- Risk: medium-high correctness risk
- Affected domains: marketplace capture auto review, HyperFrames runtime/prompt contracts, storyboard image generation preflight, repair/status projection
- Estimated file count: 4-8
- bug_route: true
- route: direct-inline-standard-light
- Intent signals: user requested deep root-cause investigation, removal of hidden fallbacks, and direct fix for an intermittent production failure.
- SocratiCode: active and green; use before broad discovery.
- Dispatch preference: direct-standard-light; no sub-agent delegation requested.

## Current Task: Feature 120 Deep Plan

- Scope: planning only
- Risk: medium-high future implementation risk
- Affected domains: HyperFrames contracts, Storyboard Review persistence, runtime API, render worker, Media History, Library, Video Editor, rollout gates
- Route: direct conductor + deep-plan, no implementation edits
- Spec: `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/spec.md`
- Output directory: `specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/`
- SocratiCode: active and used before targeted shell discovery

## Feature 120 Plan Deliverables

- Research file: `claude-research.md`
- Main implementation plan: `claude-plan.md`
- TDD plan: `claude-plan-tdd.md`
- Section index: `sections/index.md`
- Sections: 9 section files covering contracts, persistence, API/gates, UX, composition/timeline, worker/output, Library handoff, operations, and rollout
- Self review: `reviews/deep-plan-self-review-round-1.md`

## Current Task: Product Detail Auto Review Status Stale Until Refresh

- Scope: small
- Risk: medium correctness risk
- Affected domains: Marketplace Capture Product Detail frontend data freshness, Auto Review run status UI
- Estimated file count: 2
- bug_route: true
- route: direct-inline-standard-light
- Intent signals: user reported Product Detail status stays waiting/stale until F5 shows completed/progress state.
- SocratiCode: active and green; narrowed to `MarketplaceCaptureProductDetail.tsx` and the `listAutoReviewRuns` polling/invalidation path.
- Root cause hypothesis: `listAutoReviewRuns` invalidation used an exact `{ productId, limit: 8 }` input while the visible query often uses `{ productId, limit: 3, summary: true }`; polling also stopped when cached rows had no active run, and one start path kept `pendingAutoReviewAction` after the request settled.
- Dispatch preference: direct-standard-light; no sub-agent delegation requested.

## Current Task: Remove Storytelling Structure From Per-Shot Video Prompts

- Scope: small
- Risk: low-medium prompt correctness risk
- Affected domains: Storyboard Review backend prompt repair, Marketplace Auto Review video prompt tests
- Estimated file count: 3
- bug_route: true
- route: direct-inline-standard-light
- Intent signals: user reported unnecessary `USER-SELECTED CREATIVE DIRECTION LOCK` / `Storytelling structure` leaking into each video shot prompt.
- SocratiCode: active and green; narrowed to `videoEditorProjects.ts`, `marketplaceAutoReviewService.ts`, and related tests.
- Dispatch preference: direct-standard-light; no sub-agent delegation requested.

## Current Task: Marketplace Capture Product Thumbnails

- Scope: small
- Risk: low UI/data-shape risk
- Affected domains: Marketplace Capture product list API, Marketplace Capture products page UI
- Estimated file count: 2
- bug_route: false
- route: direct-inline-standard-light
- Intent signals: user requested product images on `/marketplace-capture` so products are easier to scan visually.
- SocratiCode: active and green; narrowed to `MarketplaceCaptureProducts.tsx`, `marketplaceProductService.ts`, and `marketplaceProductImages` schema.
- Dispatch preference: direct-standard-light; no sub-agent delegation requested.
