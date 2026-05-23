# Chrome Extension Review - 2026-05-23

## Task

Review the SmartAIHub Chrome Extension for UI/UX improvements, data correctness, and downstream usefulness for Product Library, Media Studio, Local AI, and Storytelling.

## Classification

- scope: medium
- risk: low
- affected_domains: extension UI, content extraction, local AI contracts, storytelling handoff
- route: read-only multi-agent review
- SocratiCode: active, index green

## Priority Findings

1. Add field-level traceability and normalized values.
   Current `ProductCapturePayload` mostly stores raw strings. Add normalized fields such as price, currency, rating, review count, sold count, category path, and field-level evidence/confidence/warnings.

2. Make Local AI use the reviewed payload, not the pre-edit capture.
   `createLocalProductBrief()` currently sanitizes `product` directly, while upload uses `editable` values. Add a shared reviewed payload builder so Product Brief, upload, and insight sync agree.

3. Add a blocker/claim review flow before Storytelling.
   When handoff readiness requires review, show actionable blockers, claim approval/edit/remove, image selection fixes, and route back to Capture when more evidence is needed.

4. Improve image selection and asset fidelity.
   Add image filters by kind, hero/cover selection, selected-by-user metadata, evidence IDs, dimensions/zone metadata, broken-image handling, and a warning when only the first 80 images are shown.

5. Populate reviews, comments, TikTok signals, and structured catalog fields.
   The sanitizer has `reviews`, `comments`, and `tiktok`, but they are empty today. Add bounded extraction with evidence IDs. Add brand/category path/specifications/claims/warnings where available.

6. Improve insight sync traceability and idempotency.
   Include external product/shop IDs, sanitizer version, generation run ID, provider decision, input evidence IDs, and returned insight refs. Patch insight IDs back into storytelling handoff.

7. Upgrade extension empty/error/progress/accessibility states.
   Add unsupported-page/no-product/no-image/upload-failed state cards, aria-live status, progressbar semantics, disabled/busy action states, tab aria-controls, form labels, and focus rings.

8. Localize panel copy consistently.
   Capture copy mixes Thai and English, while Local AI is mostly English. Thai default copy should be consistent, with a future locale map for English.

## What Is Already Solid

- Capture and Local AI are now separated into tabs.
- Local AI has provider status, progress, cancel, server fallback, and user-triggered Gemini Nano download.
- Upload remains user-confirmed and evidence-selected.
- Live product updates do not overwrite edited review data without explicit action.

## Suggested Implementation Order

1. Quick win: build a shared reviewed payload helper and use it for upload, Local AI, cache hashing, and insight sync.
2. Quick win: add data-quality checklist and image selection controls in the Capture tab.
3. Contract work: add normalized field/evidence metadata to extension shared types and scanner outputs.
4. Downstream work: add richer Storytelling handoff schema and blocker review UI.
5. Extraction work: populate review/comment/TikTok signals and structured catalog fields.

## Verification

Read-only review. No tests were run for this review.

## Implementation Follow-up - 2026-05-23

Implemented the extension-side improvements from this review:

- Field-level traceability and normalized values in `ProductCapturePayload`.
- Shopee/TikTok category path plus leaf category.
- Image evidence IDs, dimensions, quality labels, and low-resolution warnings.
- Shared reviewed payload helper so upload, Local AI, and insight sync use user-edited values.
- Data-quality checklist in the Capture tab.
- Image filters, Select main/review/visible-filter actions, hero image selection, and per-image quality labels.
- Local AI blocker review actions and claim evidence preview.
- Sanitizer now carries bounded reviews, TikTok signals, selected image metadata, source IDs, and sanitizer version.
- Insight sync now includes bounded metadata for external product/shop IDs, generation run ID, provider decision, sanitizer version, input evidence IDs, image quality, and data-quality warnings.
- Web insight sync contract now accepts this metadata and persists it under `__syncMetadata` without enabling raw capture sync.
- Added basic accessibility improvements for status/progress/focus states.

Verification:

- `npm --prefix apps/extension run typecheck`: passed.
- `npm --prefix apps/extension run build`: passed.
- `npm --prefix apps/web test -- marketplaceCapture.test.ts`: passed.
- `npm --prefix apps/web run typecheck`: passed.
