# Orchestra Decisions

[2026-05-31T07:55:32+07:00] DECISION: Archive the prior stale orchestra markdown state before writing the current Feature 117 planning state.
  Context: Existing `orchestra/` files described older reference-storyboard work and could confuse the current deep-plan.
  Outcome: Copied existing markdown files under `orchestra/archive/2026-05-31T07-55-32+0700/`.

[2026-05-31T07:55:32+07:00] DECISION: Plan Feature 117 as a replacement inside the current Marketplace Auto Review run/stage pipeline.
  Context: Feature 118 is already implemented and the user requires improvement of the existing behavior, not a parallel/shadow runtime.
  Outcome: Deep-plan sections will preserve the entry points and durable stages while replacing deterministic planning and canvas-shaped execution.

[2026-05-31T07:55:32+07:00] DECISION: Exclude node canvas from all Feature 117 implementation sections.
  Context: User explicitly clarified node canvas will move to a future independent topic.
  Outcome: Any current `ProductionSpace` or `flowNodes` dependency is treated as something to bypass or replace for this automation path.

[2026-05-31T07:55:32+07:00] DECISION: Keep LLM access gateway-only and credits platform-owned.
  Context: User required all LLM calls to pass through the system LLM gateway and all credit deduction to remain correct and secure.
  Outcome: Plan includes adapter contracts, credit idempotency, reservation gates, audit, and tests for direct-provider rejection.

[2026-05-31T07:55:32+07:00] DECISION: Treat variant/SKU, API projection, artifact lineage, and operator recovery as first-class implementation contracts.
  Context: Codebase review showed Marketplace Capture has early variant evidence but Auto Review product truth/API outputs remain mostly product/run-level; long-running media jobs also need safe recovery and traceability.
  Outcome: Round 5 adds `ProductVariantSnapshot`, `MarketplaceAutoReviewApiProjection`, `MarketplaceAutoReviewArtifactLineage`, and operator recovery runbook/test requirements.

[2026-05-31T07:55:32+07:00] DECISION: Treat shared-product authority, freshness, rights, and provider safety refusal as first-class preflight gates.
  Context: Marketplace products can be group-shared, product health can be stale, marketplace assets have different usage rights, and provider moderation refusals are non-retryable.
  Outcome: Round 6 adds `MarketplaceAutomationAccessSnapshot`, `ProductEvidenceFreshnessSnapshot`, `AssetRightsEnvelope`, background recheck, and provider moderation refusal tests.

[2026-05-31T07:55:32+07:00] DECISION: Treat provider event trust, payload/storage budgets, retry/DLQ, migration dry-runs, and launch SLOs as first-class production gates.
  Context: Current codebase already has durable media callback and DLQ foundations, but Feature 117's long-running auto-video flow needs explicit run/stage binding, replay safety, quota/transcode finalization checks, and alertable stuck-job recovery.
  Outcome: Round 7 adds `MarketplaceAutoReviewProviderEventEnvelope`, `MarketplaceAutoReviewPayloadBudget`, `MarketplaceAutoReviewStorageQuotaPlan`, `MarketplaceAutoReviewRetryDlqPolicy`, SLO/alert requirements, and non-destructive migration/backfill checks.

[2026-05-31T07:55:32+07:00] DECISION: Treat publishability gates as first-class contracts, not final-copy polish.
  Context: Marketplace Capture can include screenshots, review content, private page regions, and audio assets; generated ads also need platform-specific safe areas and export constraints.
  Outcome: Round 8 adds `MarketplaceEvidencePrivacyEnvelope`, `AudioRightsAndMixEnvelope`, `MarketplaceAutoReviewDistributionProfile`, and `CreativeFeedbackMemoryPolicy`.

[2026-05-31T07:55:32+07:00] DECISION: Treat final media reuse as a governed lifecycle, not a one-time render artifact.
  Context: Social/publishing adjacent specs include synthetic-media flags, current Auto Review carries source/affiliate URL metadata, and model/provider drift can change QA reliability after launch.
  Outcome: Round 9 adds `SyntheticMediaDisclosureEnvelope`, `CtaLandingIntegrityEnvelope`, `AutomationQualityCalibrationPolicy`, and `PostPublishGovernanceEnvelope`.
