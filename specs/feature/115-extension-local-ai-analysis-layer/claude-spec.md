# Claude Spec - Feature 115 Extension Local AI Analysis Layer

## Goal

Add an optional local AI analysis layer to the existing SmartSpecPro Chrome MV3 marketplace capture extension. The feature must support Chrome Prompt API / Gemini Nano where available, fall back safely where unavailable, and produce structured insights and storytelling handoff data for SmartSpecPro Web, AI Video Studio, and Feature 114 Gemini Omni Marketplace Product Storytelling.

## In Scope

- Runtime Prompt API capability detection and provider decision matrix.
- Side panel Local AI status, actions, progress, fallback, and cancel states.
- Sanitized local AI input derived from existing `ProductCapturePayload` and Marketplace Capture contracts.
- ProductBrief, ReviewInsight, TikTokShopTrendBrief, CombinedOpportunityBrief, VideoBrief, and MarketplaceStorytellingHandoff schemas.
- Output validation, evidence ID checks, local cache, and repair/fallback behavior.
- Insight sync under `/api/marketplace-captures`.
- Typed insight lifecycle/read contracts for capture/product/insight queries.
- Claim review and approval/edit/remove/request-more-evidence workflow.
- Gemini Omni / Storyboard Review handoff metadata for customer journey, evidence-backed claims, product truth warnings, and image fidelity readiness.
- Privacy, retention, Web Store review, i18n/accessibility, rollback, and QA gates.

## Out Of Scope

- Replacing existing capture/upload/server analyze/preview flows.
- Requiring Prompt API for extension operation.
- Video rendering in the extension.
- Full page HTML sync for local insight generation.
- Remote prompt execution.
- Guaranteed Thai quality from Gemini Nano.
- New broad host permissions.

## Repository Alignment

- Use existing `apps/extension` side-panel-first architecture.
- Use `MarketplacePlatform = "shopee" | "tiktok_shop"`.
- Extend `/api/marketplace-captures` and `marketplaceCapture`; do not create a separate unrelated `/api/extension/insights`.
- Preserve Feature 113 capture behavior and Feature 114 storytelling expectations.

## Success Criteria

- Existing Shopee/TikTok Shop capture works with local AI disabled or unavailable.
- Prompt API supported, downloadable, downloading, unavailable, and throwing states are handled.
- Structured insights validate before display/sync.
- Feature 114 can consume `MarketplaceStorytellingHandoff` without parsing free-form prose.
- Unsupported claims, product image mismatch, and journey mismatch block direct Gemini Omni generation until resolved.

