# Orchestra Plan

## Task

Create a deep-plan package for Feature 117: replace the current Marketplace Auto Review / Production Director automation with a gateway-routed OpenAI Agents SDK runtime that can auto-create product review storyboards and videos from Marketplace Capture and Media Studio, without using node canvas.

## Classification

- scope: large
- risk: high
- affected_domains: Marketplace Auto Review, Media Studio, Python Agents adapter, LLM gateway, credits/billing, media generation, QA, Storyboard Review, Video Editor, render/library finalize
- chosen_route: orchestra + deep-plan, file-based planning artifacts
- implementation_mode: planning only
- code_changes: none

## Key Decisions

- Treat Feature 118 as the implemented baseline.
- Upgrade the existing durable run/stage pipeline instead of adding a shadow or parallel pipeline.
- Exclude node canvas, `ProductionSpace`, and `flowNodes` from Feature 117 implementation work.
- Route every LLM call through the existing SmartSpecPro LLM gateway.
- Keep credit reservation, deduction, refund, and audit platform-owned.
- Make automation creative, but bind all claims and product visuals to evidence.
- Add Thailand advertising compliance and visual warning/disclosure text requirements to the plan.
- Preserve selected variant/SKU truth, version/redact API projections, attach canonical artifact lineage, and provide operator recovery procedures for stuck long-running jobs.
- Add shared-product permission/billing snapshots, evidence freshness/asset readiness, asset-use rights, and provider moderation refusal handling.
- Add provider event authenticity/replay safety, payload/trace budgets, storage quota/transcode finalization gates, retry/DLQ policy, migration/backfill dry-run, and launch SLO alerts.
- Add marketplace privacy, audio rights/mix, distribution-profile validation, and tenant-safe creative feedback memory.
- Add synthetic disclosure/provenance, CTA/landing integrity, QA calibration/spot-check, and post-publish governance.

## Discovery Sources

- SocratiCode status: green, index active for `/home/dev/projects/SmartSpecPro`.
- Feature 117 spec: `specs/feature/117-production-director-agents-sdk-auto-storyboard-video/spec.md`.
- Feature 118 implemented snapshot: `specs/feature/118-marketplace-auto-review-create-storyboard-video-review-auto/spec.md`.
- Current service/code surfaces:
  - `apps/web/server/services/marketplaceAutoReviewService.ts`
  - `apps/web/server/jobs/marketplaceAutoReviewJob.ts`
  - `apps/web/server/routers/marketplaceCapture.ts`
  - `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
  - `apps/web/drizzle/schema.ts`
  - `python-backend/app/services/openai_agents_adapter.py`
  - `python-backend/app/services/openai_agents_contracts.py`
  - `python-backend/app/services/openai_agents_gateway_model.py`

## Planned Artifacts

- `claude-research.md`
- `claude-interview.md`
- `claude-spec.md`
- `claude-plan.md`
- `reviews/self-review-round-1.md`
- `claude-plan-tdd.md`
- `sections/index.md`
- section files under `sections/`

## Quality Gates

- Deep-plan context decision check.
- Plan self-review.
- Section manifest validation with `check-sections.py`.
- UI contract validation with `check-ui-contracts.py`.
- Markdown/diff whitespace check for generated planning files.
- Targeted codebase-aware review rounds for timeline, operational hardening, approval snapshots, variant/API/lineage/recovery coverage, provider event trust, payload/storage budgets, retry/DLQ, launch readiness, privacy, audio rights, distribution profile, feedback memory, disclosure, CTA integrity, QA calibration, and post-publish governance.
