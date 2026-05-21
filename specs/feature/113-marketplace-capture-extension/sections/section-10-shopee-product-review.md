# Section 10 - Shopee Product Review

## Objective

Implement Shopee product page scanning and mandatory local pre-upload review/edit/select flow.

## Scope

- Product page detection.
- Product field extraction.
- Main/description image collection.
- Section screenshots.
- Pre-upload review UI.
- Upload orchestration.

## Implementation Notes

- Block capture on login, cart, checkout, account, order, seller center, and chat pages.
- Detect product pages by Shopee hostname, `i.<shopId>.<itemId>` URL pattern, product title/price/actions, and body text heuristics.
- Capture sections:
  - product header
  - gallery
  - shipping/promotion
  - description
  - rating summary
- Click thumbnails with throttle and dedupe URLs.
- Exclude related/sidebar/bundle images using bounding box proximity and section classification.
- Local review panel must appear before upload:
  - editable product fields
  - image groups: main, description, related/excluded
  - screenshot selection
  - cover image selection
  - reorder/remove/move image actions
  - estimated upload bytes
  - excluded reason summary
  - final explicit upload/analyze button
- API payload includes `userEditedFields`, selected images, selected screenshots, and selection summary.
- Crop screenshots to intended evidence regions where feasible before upload.
- Redact obvious account/header/user-personal regions from screenshots and DOM text when heuristics can do so safely.
- Full viewport screenshots require an explicit warning/confirmation state.
- User can remove raw DOM/HTML blocks from the upload payload for minimal evidence capture.
- Capture visible variant/SKU option labels and selected variant price context where Shopee exposes them.
- Add capture diagnostics for missing description, lazy-load failures, variant capture failures, thumbnail click failures, and screenshot failures.
- Add explicit cancellation that stops scrolling, thumbnail interaction, screenshot capture, upload, and local temporary evidence retention.

## Tests First

- Product fixture is detected.
- Blocked page fixtures are rejected.
- Scanner captures header fields and description text.
- Thumbnail collector dedupes repeated URLs.
- Pre-upload review includes selected evidence only in upload payload.
- User edits are preserved in draft create payload.
- Screenshot crop/redaction metadata is included.
- Full viewport screenshot warning state is tested.
- Variant fixture captures visible option labels and selected price context.
- Capture cancellation stops in-flight work and clears local temporary evidence.
- Diagnostics identify missing/lazy/thumbnail failures without dumping full page content.

## Acceptance Criteria

- No unwanted evidence uploads before user local review.
- Capture can create a backend draft and open preview.
- Product fixture captures name, price/sold raw fields, description, screenshots, and selected main images.
