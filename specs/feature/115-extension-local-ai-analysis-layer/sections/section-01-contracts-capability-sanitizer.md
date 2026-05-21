# Section 01 - Contracts, Capability, And Sanitizer

Status: IMPLEMENTED

## Objective

Define the type/schema foundation for optional local AI analysis without forking current marketplace capture contracts.

## Scope

- `apps/extension/src/shared/types.ts`
- new extension local AI contract module
- `apps/web/shared/marketplaceCapture.ts` or a sibling shared insight contract
- feature flags/defaults
- sanitizer and evidence selector contracts

## Implementation Notes

- Reuse `MarketplacePlatform = "shopee" | "tiktok_shop"`.
- Keep `ProductCapturePayload` as the capture input source; derive `SanitizedLocalAIInput` from it.
- Add `LocalInsightType`, `LocalAICapability`, `PromptAPIAvailability`, output schemas, and error codes.
- Do not introduce a second raw Shopee/TikTok payload source of truth.
- Sanitizer must exclude full DOM HTML, hidden inputs, cookies, tokens, payment data, account/cart/order/chat/message data, and unselected screenshots.
- Evidence IDs must be deterministic for sanitized fields so validators can verify model references.

## Tests First

- Sanitizer keeps product title/price/selected description snippets.
- Sanitizer strips `outerHTML` unless explicitly converted to safe text evidence.
- Sanitizer caps description, reviews/comments, and evidence counts.
- Platform schema rejects `"tiktok"` and accepts `"tiktok_shop"` for repository contracts.
- Capability type supports `available`, `downloadable`, `downloading`, `unavailable`, and `unknown`.

## Acceptance Criteria

- Existing extension and web typechecks still pass.
- Contracts align with `apps/web/shared/marketplaceCapture.ts`.
- No raw page HTML is required by local AI prompts.

## Implementation Result

- Added local AI limits, provider/status unions, insight schemas, sanitized input schema, storytelling handoff schema, insight sync schema, and claim resolution schema in `apps/web/shared/marketplaceCapture.ts`.
- Added extension-side local AI contracts and sanitizer in `apps/extension/src/shared/localAi.ts`.
- Sanitizer derives local AI input from `ProductCapturePayload`, strips markup-like text, excludes `outerHTML`, trims evidence, and creates deterministic evidence IDs/payload hashes.
- Added schema tests in `apps/web/shared/marketplaceCapture.test.ts`.
