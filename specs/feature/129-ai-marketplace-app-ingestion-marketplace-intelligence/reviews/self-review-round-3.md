# Self Review Round 3: Marketplace Intelligence Report Patterns

## Review Focus

Reviewed stakeholder-provided examples of current Shopee MCP marketplace-intelligence usage. The examples showed practical report patterns beyond a generic keyword dashboard, especially multi-day SKU monitoring, share-of-shelf summaries, seller power maps, winners by KPI, strategy matrices, and shareable visual report cards.

## Findings Fixed

1. Report output was too generic.
   - Added reusable report template blocks: Top Search Results Preview, Executive Summary, Brand Visibility / Share of Shelf, Seller Power Map, Winners by KPI, Strategy Matrix, Monitor Cards, New Competitor Watch, Marketing Insight, and What To Do Next.

2. Multi-day monitoring was not explicit enough.
   - Added Exact SKU Monitor metrics.
   - Required exact match keys: platform, external shop ID, external product ID, model/variant ID, with canonical URL fallback.
   - Added baseline-missing and new competitor states.
   - Required sold/day to be labeled estimated and derived from cumulative sold delta.

3. Shareable visual reports needed product scope.
   - Added Shareable Image Summary as a UI surface.
   - Added report type `shareable_image_summary`.
   - Required 1:1, 4:5, 9:16, and 16:9 layouts with source mode, date range, keyword, item count, and disclaimer footer.

4. Report implementation plan needed concrete evidence gates.
   - Updated Section 08 and `claude-plan.md` to include multi-day monitor, shareable image preview, visual blocks, and Playwright evidence.

## Residual Risk

The visual design examples are useful as report-pattern inspiration, but implementation must still avoid unsupported certainty. All generated report cards must cite stored evidence IDs and clearly label captured public marketplace signals, estimates, missing data, and source date ranges.
