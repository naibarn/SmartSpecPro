<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest && npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-contracts-and-catalogs
section-02-tiktok-adapter-and-validation
section-03-youtube-adapter-and-shorts-classification
section-04-workflow-and-agency-integration
section-05-tests-rollout-and-operational-guardrails
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-provider-contracts-and-catalogs | - | 02, 03, 04, 05 | No |
| section-02-tiktok-adapter-and-validation | 01 | 04, 05 | Yes |
| section-03-youtube-adapter-and-shorts-classification | 01 | 04, 05 | Yes |
| section-04-workflow-and-agency-integration | 01, 02, 03 | 05 | No |
| section-05-tests-rollout-and-operational-guardrails | 01, 02, 03, 04 | - | No |

## Execution Order

1. section-01-provider-contracts-and-catalogs
2. section-02-tiktok-adapter-and-validation, section-03-youtube-adapter-and-shorts-classification
3. section-04-workflow-and-agency-integration
4. section-05-tests-rollout-and-operational-guardrails

## Section Summaries

### section-01-provider-contracts-and-catalogs
Define the provider-neutral social video contract, live/planned provider discovery, canonical actions, and shared catalog metadata.

### section-02-tiktok-adapter-and-validation
Implement TikTok OAuth, creator-info preflight, direct post, draft upload, media validation, and status/cancel paths.

### section-03-youtube-adapter-and-shorts-classification
Implement YouTube `videos.insert`, scheduling, status sync, and Shorts classification on top of the same upload flow.

### section-04-workflow-and-agency-integration
Wire `builtin-social-actions`, tenant injection, and provider-aware dispatch so workflows and agencies can invoke actions in the background.

### section-05-tests-rollout-and-operational-guardrails
Add provider contract tests, platform-specific validation tests, dispatch tests, rollout flags, and operational safeguards.
