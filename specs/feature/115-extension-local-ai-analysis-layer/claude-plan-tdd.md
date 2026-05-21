# TDD Plan - Feature 115 Extension Local AI Analysis Layer

Date: 2026-05-21

## Test Strategy

Test inside-out:

1. Contracts and sanitizer.
2. Capability/provider decision.
3. Prompt builders and validators.
4. Local cache and fallback behavior.
5. Insight sync/read lifecycle.
6. Claim review/readiness changes.
7. Storytelling handoff import into Feature 114 surfaces.
8. Manual Chrome support matrix.

## Unit Tests

- UI state machine covers capture, local analysis, server analysis, cancellation, retry, sync, failure, and stale-result transitions.
- Sanitizer strips HTML, hidden fields, tokens, cookies, private/account/cart/order/chat data.
- Sanitizer caps prompt payload, reviews/comments, description, and evidence count.
- Platform schema accepts `shopee` and `tiktok_shop`, rejects `tiktok` for persisted contracts.
- Capability detector handles missing `LanguageModel`.
- Capability detector handles `available`, `downloadable`, `downloading`, `unavailable`, and thrown errors.
- Provider decision selects `chrome_prompt_api`, `server_ai`, or `noop` for every runtime state.
- Model download/session creation is not triggered by passive panel load.
- Abort/cancel settles local analysis without corrupting capture state.
- Preference storage defaults to local AI preferred, structured-only sync, raw capture off, debug output off, and explicit reviews/comments inclusion behavior.
- Prompt builders include task, schema, language preference, evidence, JSON-only instruction, and no full HTML.
- ProductBrief, ReviewInsight, TikTokShopTrendBrief, VideoBrief, CombinedOpportunityBrief, and MarketplaceStorytellingHandoff validators accept fixtures.
- Validators reject unknown evidence IDs, invalid confidence, malformed scene timing, unsupported claims without evidence/user approval, and high image-fidelity risk for direct storytelling.
- Cache key changes when normalized payload hash, analysis type, schema version, or platform changes.
- Cached insights become stale when source payload, selected images, claim decisions, language preference, or schema version changes.
- Server fallback output is validated with the same schemas and evidence rules as local Prompt API output.
- Error taxonomy maps provider/API/storage failures to safe user messages without raw prompt or page text.

## Integration Tests

- Existing Shopee capture works with Prompt API disabled.
- Existing TikTok Shop capture works with Prompt API disabled.
- Prompt API unavailable with server fallback enabled produces server insight path.
- Prompt API unavailable with fallback disabled preserves raw capture-only behavior.
- Downloadable model requires user-triggered action.
- Invalid local AI JSON falls back or shows failure without blocking upload selected.
- Insight sync enforces auth, tenant/user ownership, idempotency, schema version, payload hash, and raw-capture setting.
- Insight read endpoints return typed records by capture ID, product ID, and insight ID.
- Claim approve/edit/remove/request-more-evidence updates readiness and preserves provenance.
- Feature 114 edits to claims/images/journey stages mark dependent handoffs stale or update provenance.
- Basic product video creation remains possible with confirmed product fields and selected images when insights are missing.
- Feature 114 Marketplace Product Storytelling can import a synced handoff without free-form parsing.
- Storyboard Review receives product evidence, customer journey stage, and claim QA metadata.

## Manual QA

- Prompt API context verification in side panel, popup, service worker, offscreen document, and content script.
- Chrome 138+ with Prompt API available.
- Chrome below Prompt API support where extension still loads.
- API exposed but requested options unavailable.
- Model downloadable/downloading/cancelled.
- Server fallback enabled and disabled.
- Windows 11, macOS 13+, Linux desktop.
- Shopee product page, Shopee missing reviews, TikTok Shop page.
- Thai, English, and mixed Thai/English content.
- Complete customer journey handoff opens Gemini Omni Storytelling.
- Incomplete evidence opens review instead of provider generation.
- Support diagnostics export capability state and error codes without product text, reviews, comments, prompts, or raw model output.

## Release Gates

- `npm --prefix apps/extension run typecheck`
- extension build command confirmed from package scripts and passing
- `npm --prefix apps/web run check`
- marketplaceCapture tests pass
- schema/fixture tests for local insights and storytelling handoff pass
- migration/storage decision recorded and tested
- Web Store privacy checklist complete
- i18n/accessibility smoke checks complete
- rollback/kill-switch checks complete
