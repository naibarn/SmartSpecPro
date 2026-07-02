# Self Review Round 7: Keyword Product Discovery UX

## Review Focus

Reviewed the spec after the stakeholder clarified that Marketplace Capture is mostly SKU/product-centric, while marketplace intelligence also needs keyword-first analysis for broad product categories before a specific SKU is known.

## Findings Fixed

1. Keyword discovery was not first-class enough.
   - Added explicit `Keyword Product Discovery` workflow separate from known SKU/product monitoring.
   - Added routes `/marketplace-capture/intelligence/discovery` and `/marketplace-capture/intelligence/discovery/:discoveryId`.
   - Added Discovery to Marketplace Capture local subnav without adding a duplicate main sidebar item.

2. UI/UX risk: users could confuse product enrichment with broad category exploration.
   - Added Intelligence overview workflow chooser for `Explore keyword/category` vs `Track known product/SKU`.
   - Added Keyword Product Discovery surface matrix, component map, state matrix, browser evidence, and acceptance criteria.
   - Required Marketplace Capture landing/dashboard entry points to clearly distinguish the two workflows.

3. Data model was missing reusable discovery records.
   - Added `marketplace_keyword_discoveries`.
   - Added `marketplace_keyword_discovery_clusters`.
   - Required evidence, representative snapshot item IDs, confidence, quality score, and user ownership.

4. Analytics/reporting needed product taxonomy and use-case outputs, not only competitive winner outputs.
   - Added Keyword Product Discovery metrics for brand/model/type/use-case/price-tier/seller-trust clusters.
   - Added report blocks for Keyword Product Discovery Map, Price Tier / Product Type Ladder, and Discovery Handoff Actions.
   - Added report type `keyword_product_discovery`.
   - Added report image skill `keyword_product_discovery_image`.

5. Handoff rules needed to avoid premature product creation.
   - Spec now says keyword discoveries can exist without Marketplace Capture product matches.
   - Product/candidate creation is an explicit downstream handoff after the user reviews clusters and evidence.

## Remaining Guardrails

- Discovery labels inferred from titles, categories, seller metadata, or brand fields must show confidence and representative listings.
- Broad or mixed keywords should show refinement suggestions instead of a misleading single winner narrative.
- SKU-level monitor comparisons must remain separate until exact listings or model IDs are selected.
