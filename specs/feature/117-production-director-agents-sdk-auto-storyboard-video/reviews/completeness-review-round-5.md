# Completeness Review Round 5

Date: 2026-05-31
Scope: codebase-aware completeness review for variant/SKU safety, API projection compatibility, artifact lineage, and operator recovery.

## Result

Plan remains implementable and is stronger after this round. The prior plan covered the main automation, gateway, credit, QA, compliance, and timeline requirements. This review checked the plan against the current Marketplace Capture and Auto Review code paths and found four important implementation gaps that should be contracts rather than tribal knowledge.

## Findings Fixed

1. Variant/SKU context was not first-class enough.
   - Current Marketplace Capture has early variant evidence fields, but current confirmed product and auto-review truth are mostly product-level.
   - Added `ProductVariantSnapshot`, selected variant hash, variant-specific evidence rules, variant-aware preflight, variant-aware QA, and variant-aware idempotency/dedupe guidance.
   - Added tests so color/size/package/bundle/stock/price claims cannot be invented or swapped.

2. API projection compatibility was too implicit.
   - Current `getAutoReviewRun` and `listAutoReviewRuns` return serialized run/stage data.
   - Added `MarketplaceAutoReviewApiProjection` and `MarketplaceAutoReviewRunSummary`.
   - Locked detail vs list behavior: detail gets full redacted timeline/approvals/lineage refs; list stays lightweight and safe.
   - Added tests for old Feature 118 rows, new Feature 117 rows, redaction, and frontend no-guess timeline behavior.

3. Artifact lineage needed a canonical contract.
   - Prior plan required traceability but did not force every user-visible output to map back to evidence, shot payloads, QA, approvals, credits, and storage refs.
   - Added `MarketplaceAutoReviewArtifactLineage`.
   - Added blocking rules so Storyboard Review, Video Editor, render, and Library outputs cannot complete with missing lineage or raw provider IDs masquerading as media URLs.

4. Operator recovery was not explicit enough for long-running automation.
   - Added runbook requirements for stuck runs, orphan provider tasks, expired provider URLs, re-host failures, render/library finalize failures, refund mismatches, gateway outage, queue backlog, policy snapshot mismatch, timeline rebuild, and retention cleanup failure.
   - Added allowed/disallowed recovery actions.
   - Added tests to prove recovery cannot bypass hard policy, credit ledger, QA, lineage, or consent controls.

## Current Verdict

No material blocker remains in the plan. Remaining implementation choices are now deliberate engineering decisions:

- Whether variant snapshots are stored in dedicated columns/tables or metadata first.
- Whether Feature 117 projections are added to existing tRPC outputs or exposed under versioned successor procedures.
- Whether artifact lineage starts as JSON refs in stage outputs or a dedicated lineage table.
- Which admin/operator surface owns the first recovery procedures.

These are not spec gaps as long as implementation preserves the required contracts and tests.
