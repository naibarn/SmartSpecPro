# Claude Research - Feature 115 Extension Local AI Analysis Layer

Date: 2026-05-21
Mode: self_review

## Research Scope

This research validates the Feature 115 specification against the current SmartSpecPro codebase and current Chrome Built-in AI / Prompt API guidance. The result is an implementation plan for an optional Chrome extension local AI analysis layer that preserves existing marketplace capture behavior and produces a typed storytelling handoff for Feature 114.

## Codebase Research

### Repository Alignment

- The existing marketplace capture domain already centers on extension-driven Shopee and TikTok Shop capture, web sync, product/image reuse, and Media Studio surfaces.
- The implementation should reuse the existing marketplace capture contracts and route boundaries instead of introducing a parallel extension product domain.
- Persisted platform naming should stay aligned with the repo's marketplace capture language. Feature 115 should treat TikTok commerce capture as `tiktok_shop` where persisted or synced, while UI copy may still say TikTok/TikTok Shop.
- Feature 114 already expects structured marketplace/product evidence for Gemini Omni storytelling. Feature 115 should produce the missing product truth, claim, customer journey, and video brief handoff data rather than requiring Feature 114 to parse free-form AI text.

### Existing Extension Fit

- The extension should remain MV3 and additive: capture, scan, upload, and existing server analysis controls must keep working when `LanguageModel` is missing or unsupported.
- The side panel is the safest v1 UX target because local analysis needs status, progress, cancellation, fallback explanation, insight preview, and evidence review. Popup UI can expose entry points, but should not become the full review workspace.
- Prompt API execution context must be verified during implementation across side panel, popup, service worker, offscreen document, and content script. The plan defaults to side panel execution and message-passes capture payloads from existing extension flows.

### Shared Contract Fit

Feature 115 should add or extend typed contracts for:

- `LocalAICapability`
- `LocalAIProviderDecision`
- `SanitizedMarketplaceCapture`
- `ProductBrief`
- `ReviewInsight`
- `TikTokShopTrendBrief`
- `VideoBrief`
- `CombinedOpportunityBrief`
- `MarketplaceStorytellingHandoff`
- `MarketplaceInsightRecord`
- `MarketplaceClaimResolution`

These contracts need schema validation at every boundary: extension local generation, local cache read/write, sync request, API persistence, web preview, claim review, and Feature 114 handoff import.

### API And Persistence Fit

- The preferred server integration is an extension of the existing marketplace capture API surface, for example `/api/marketplace-captures/insights` or equivalent tRPC-backed handlers.
- Insight sync must be idempotent by capture, normalized payload hash, analysis type, schema version, provider, and parent insight IDs.
- Read endpoints are required. Feature 114 and future storytelling flows need to query insights by capture ID, product ID, insight ID, and readiness state.
- A dedicated insight storage table is preferred. Versioned JSON on the existing capture/product record is acceptable only behind an explicit migration decision gate because claim review, parent insight links, lifecycle status, and readiness state need reliable querying.

### Privacy And Safety Fit

- Existing capture payloads should be normalized and sanitized before Prompt API or server AI analysis.
- Full DOM HTML, hidden inputs, cookies, tokens, payment/order/chat/account data, and unrelated private user data must not enter prompts, telemetry, or default sync payloads.
- Raw capture sync remains opt-in. The default journey is capture locally, generate local or server insight, preview structured output, then sync structured insight only.
- Telemetry must contain event names, provider, status, duration, and error codes only. It must not contain product titles, comments, reviews, prompts, or raw model output.

## Chrome Prompt API Research

Official Chrome docs reviewed:

- https://developer.chrome.com/docs/ai/prompt-api
- https://developer.chrome.com/docs/ai/get-started
- https://developer.chrome.com/docs/ai/built-in-apis

### Current Prompt API Implications

- Runtime detection must use `globalThis.LanguageModel` and `LanguageModel.availability()` instead of Chrome version checks alone.
- `availability()` should receive the same expected modality/language options intended for `create()` and `prompt()` because support can vary by model and requested capability.
- The model may be available, downloadable, downloading, unavailable, or fail with a runtime error. All states need explicit UX and provider fallback behavior.
- Model creation/download should be user-triggered. Passive side panel load should detect support but must not start model download.
- Download progress should be surfaced through the `monitor` download progress event.
- `LanguageModel.create()` supports abort via `AbortSignal`; cancellation needs to cleanly settle UI and preserve capture state.
- Chrome docs state extension developers should remove expired `aiLanguageModelOriginTrial` permission. The spec should not add it.
- Prompt API expected output is text. Structured JSON still needs prompt constraints plus local JSON parsing and schema validation.
- Language support is limited and evolving; Thai output must be best-effort with server review/fallback options. Validation must judge structure and evidence traceability, not Thai copy quality alone.

## Journey Research

The customer journey should be explicit and complete:

1. User opens Shopee or TikTok Shop page.
2. Extension detects supported page and shows current capture state.
3. User captures page using existing capture controls.
4. Extension sanitizes and normalizes evidence.
5. User chooses local AI analysis.
6. Extension detects Prompt API state and chooses local, server fallback, or raw-capture-only path.
7. User sees progress, can cancel, and never loses the captured data.
8. AI output is validated, evidence-linked, and cached.
9. User previews insight and resolves unsupported claims if needed.
10. User syncs structured insight to SmartSpecPro.
11. Web/Desktop can retrieve the insight and import a `MarketplaceStorytellingHandoff`.
12. Feature 114 can open Gemini Omni Storytelling only when readiness gates pass.
13. If evidence, image fidelity, or claim safety is incomplete, the user lands in review instead of provider generation.

## Planning Implications

- Build contract/schema/sanitizer first because every later section depends on the same data shape.
- Keep Prompt API provider optional and isolated behind a provider interface.
- Add a deterministic provider decision matrix covering supported and unsupported machines.
- Use side panel v1 for analysis/review and keep popup as a compact launcher/status surface.
- Add local cache only after validator behavior is stable.
- Add sync and read lifecycle before Feature 114 integration so Storytelling uses persisted typed insight IDs, not transient extension state.
- Treat `MarketplaceStorytellingHandoff` as the product contract between Feature 115 and Feature 114.

## Test Implications

- Unit tests must cover sanitization limits, Prompt API capability states, provider decision, prompt builders, output validators, cache keys, and evidence ID enforcement.
- Integration tests must cover existing capture flows with Prompt API disabled, local provider success, local provider failure with server fallback, fallback disabled raw-capture-only behavior, insight sync, insight reads, and claim review lifecycle.
- Manual QA must cover Chrome with Prompt API available, unavailable, downloadable, downloading, cancelled, and error states across Windows/macOS/Linux with Thai, English, and mixed content.
- Release gates should include extension typecheck/build, web checks, marketplace capture tests, schema fixture tests, Web Store privacy review, i18n/accessibility smoke checks, and rollback/kill-switch validation.
