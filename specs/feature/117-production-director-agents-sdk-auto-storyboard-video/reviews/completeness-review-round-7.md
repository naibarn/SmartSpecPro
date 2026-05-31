# Completeness Review Round 7

Date: 2026-05-31
Scope: Production hardening pass after comparing the plan with current codebase surfaces.

## Review Focus

This round checked whether the plan was complete enough for real production automation, not only feature correctness. The review focused on long-running failure modes that often appear after first implementation:

- provider callbacks/polling results that are spoofed, duplicated, stale, or out of order;
- large LLM/provider payloads and traces that can bloat run metadata or leak into UI APIs;
- final media storage, quota, re-hosting, transcode, and playability failures;
- repeated transient failures that loop, spend credits, or strand the user;
- launch observability and old-row migration/backfill safety.

## Codebase Findings

- The codebase already has durable `media_callback_events` and `media_callback_dlq` foundations, so Feature 117 should reuse/extend this path with run/stage/task binding instead of adding a separate callback ledger.
- Current Feature 118 Auto Review has durable run/stage advancement, but Feature 117 needed stronger contracts for trusted provider events and recovery states.
- Render/transcode/storage capabilities exist, but the spec needed explicit auto-review storage quota, output-size, codec, duration, resolution, cleanup, and playability gates.
- `getAutoReviewRun` and `listAutoReviewRuns` must remain safe under large traces, so payload and projection budgets are required before implementation.

## Additions Made

- Added `MarketplaceAutoReviewProviderEventEnvelope`.
- Added `MarketplaceAutoReviewPayloadBudget`.
- Added `MarketplaceAutoReviewStorageQuotaPlan`.
- Added `MarketplaceAutoReviewRetryDlqPolicy`.
- Added provider callback/polling authenticity, replay safety, duplicate/stale/out-of-order handling, and DLQ requirements.
- Added payload/trace/list/detail projection budget requirements.
- Added storage quota, re-hosting, transcode, codec, duration, resolution, byte-size, cleanup, and playability gates.
- Added retry/DLQ policy, stage lease/heartbeat, migration/backfill dry-run, and launch SLO/alert requirements.
- Updated affected sections 01, 06, 09, 10, 11, and 12.

## Remaining Risk

- Exact storage quota and transcode limits must be chosen during implementation from current platform quotas and provider output profiles.
- Provider-specific webhook signature schemes must be verified per provider before enabling callback-driven advancement.
- Launch SLO thresholds should be tuned after the first internal storyboard/video batch, but the plan now requires the metrics and alert surfaces before broad rollout.

## Verdict

Pass after round 7 additions. The plan is now stronger for real production automation because it covers not only creative/QA correctness, but also callback trust, data-size safety, media finalization resource gates, DLQ recovery, launch observability, and non-destructive migration/backfill.
