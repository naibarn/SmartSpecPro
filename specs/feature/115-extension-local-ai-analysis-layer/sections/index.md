<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/extension run typecheck && npm --prefix apps/web run check && npm --prefix apps/web test -- marketplaceCapture
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-capability-sanitizer
section-02-extension-provider-and-side-panel
section-03-output-validation-and-local-cache
section-04-insight-sync-and-preview
section-05-ai-video-studio-bridge-qa
section-06-storytelling-customer-journey-handoff
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-contracts-capability-sanitizer | - | 02, 03, 04, 05, 06 | No |
| section-02-extension-provider-and-side-panel | 01 | 03, 04 | Yes |
| section-03-output-validation-and-local-cache | 01, 02 | 04, 05, 06 | No |
| section-04-insight-sync-and-preview | 01, 03 | 05, 06 | Yes |
| section-05-ai-video-studio-bridge-qa | 01, 03, 04, 06 | - | No |
| section-06-storytelling-customer-journey-handoff | 01, 03, 04 | 05 | Yes |

## Section Summaries

### section-01-contracts-capability-sanitizer

Add shared local AI insight contracts, Prompt API capability contracts, sanitizer rules, and feature flags aligned with existing `MarketplacePlatform` and `/api/marketplace-captures`.

### section-02-extension-provider-and-side-panel

Add Prompt API provider, provider selection, download progress state, and side panel controls without removing existing detect/scan/upload/analyze flows.

### section-03-output-validation-and-local-cache

Add schema validators, bounded prompt builders, output repair/fallback handling, and `chrome.storage.local` result cache.

### section-04-insight-sync-and-preview

Add structured insight sync under the existing marketplace capture namespace and render synced insights in capture/product surfaces.

### section-05-ai-video-studio-bridge-qa

Generate/import VideoBrief drafts into AI Video Studio, then complete regression, privacy, and manual Chrome QA.

### section-06-storytelling-customer-journey-handoff

Create the MarketplaceStorytellingHandoff contract and journey readiness gates required by Feature 114 Gemini Omni Marketplace Product Storytelling and Storyboard Review.
