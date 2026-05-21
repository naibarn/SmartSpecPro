# Section 09 - Shopee Category

## Objective

Implement Shopee category/search page detection, visible card scanning, candidate scoring, filters, and queue basics.

## Scope

- Shopee adapter listing detection.
- Product card extraction.
- Price/sold/discount parsers.
- Scoring and reason generation.
- Side panel category scan UI.

## Implementation Notes

- Avoid fragile deep class selectors. Combine hostname, URL, product-card href patterns, visible text, price/sold regexes, and bounding boxes.
- Extract:
  - title
  - URL
  - external product/shop IDs
  - price text/current value
  - original price and discount
  - sold count raw and normalized
  - image URL
  - badges
  - position and bounding box
- Score with bounded 0-100 formula using sold, discount, Mall/official badge, clear price, image, title keyword, and rank.
- User actions:
  - scan visible products
  - explicit scroll and scan more
  - filter/sort
  - open product
  - open in new tab
  - queue
  - ignore
  - send selected candidate batch
- Record adapter diagnostics such as heuristic version, skipped card counts, parse failure reasons, and scan duration without storing full page dumps.
- Queue actions need cancellation, duplicate suppression, and backoff for repeated scans/open attempts.

## Tests First

- Shopee listing fixture is detected.
- Non-listing Shopee fixture is not detected.
- Scanner extracts at least 80% of visible fixture cards.
- Thai/English parser cases pass.
- Scoring reasons are deterministic.
- Filters work for min sold, price range, discount, badge, keyword.
- Adapter diagnostics are produced for parse failures without leaking raw page dumps.
- Queue cancellation and duplicate suppression work across repeated scans.

## Acceptance Criteria

- Side panel shows top recommended Shopee products with reasons.
- User can queue or open one product at a time.
- Candidate batch upload includes only user-selected/approved candidate data.
