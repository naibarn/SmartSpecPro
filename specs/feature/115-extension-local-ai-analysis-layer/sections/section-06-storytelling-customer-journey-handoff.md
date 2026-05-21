# Section 06 - Storytelling Customer Journey Handoff

Status: IMPLEMENTED

## Objective

Make Feature 115 produce a structured customer-journey handoff that Feature 114 Gemini Omni Marketplace Product Storytelling can consume directly.

## Scope

- `MarketplaceStorytellingHandoff`
- `CustomerJourneyStage`
- evidence-backed claim mapping
- selected product image role/fidelity metadata
- Product Truth readiness gates
- Storyboard Review handoff fields
- fallback behavior when local/server insights are missing

## Implementation Notes

- The handoff must be generated from validated Feature 115 insights, confirmed marketplace product fields, selected marketplace images, and evidence IDs.
- Every planned scene must have a customer journey stage.
- Every claim used in voiceover, captions, on-screen text, CTA, or story premise must map to evidence IDs or explicit user approval.
- Unsupported claims, high image mismatch risk, or missing product identity must set readiness to `needs_user_review` or `insufficient_evidence`.
- `ready_for_storytelling` and accepted `ready_with_warnings` are the only states allowed to open Gemini Omni generation directly.
- `needs_user_review` and `insufficient_evidence` must open a claim/image/evidence review surface instead.
- Missing Feature 115 local insights must not block basic product video creation when confirmed product fields and selected product images exist.
- Advanced storytelling formats such as trend-style, UGC-style, before/after, or cinematic story should require either synced insights or explicit user confirmation.

## Storytelling Journey Requirements

The handoff must support these stages:

- awareness
- problem recognition
- consideration
- proof/review/demo
- objection handling
- trust building
- conversion / CTA
- retention or brand recall

The handoff must support these product storytelling formats:

- product review
- sales/demo video
- brand awareness story
- before/after or use-case story when evidence supports it
- customer journey video
- TikTok Shop trend-style short
- Shopee product page support video
- UGC-style review script when allowed by policy and evidence
- cinematic brand/product story

## Tests First

- Handoff validates with ProductBrief + selected product images.
- Handoff validates with server fallback insights when Prompt API is unsupported.
- Handoff degrades to basic product video readiness when insights are missing but confirmed product/image data exists.
- Unsupported claim without evidence blocks direct Gemini Omni generation.
- Product image mismatch blocks direct Gemini Omni generation.
- Every scene requires a customer journey stage.
- Feature 114 fixture can import ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief plus MarketplaceStorytellingHandoff without parsing free-form prose.

## Acceptance Criteria

- Media Studio can open Marketplace Product Storytelling with product card summary, selected images, insight badges, evidence-backed claims, customer journey stage per scene/clip, image fidelity status, and CTA readiness.
- Storyboard Review can display customer journey stages and product evidence beside each scene/clip.
- Product Truth QA has enough structured metadata to block unsupported claims before credit reservation.
- Customer Journey Reviewer has enough structured metadata to detect journey mismatch before provider submission.

## Implementation Result

- Added `MarketplaceStorytellingHandoff` schema in `apps/web/shared/marketplaceCapture.ts` and extension builder in `apps/extension/src/shared/localAi.ts`.
- Handoff includes source capture IDs, insight IDs, product identity, source URL, story format, readiness, blockers, journey stages, evidence-backed claims, selected image role/fidelity metadata, optional VideoBrief, evidence IDs, and confidence.
- API exposes synced handoff records and a basic fallback handoff for captures that have confirmed product/image data but no local/server insights.
- Claim resolution updates provenance metadata and readiness state through REST/tRPC.
