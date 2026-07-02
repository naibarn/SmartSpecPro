# Self Review Round 4: Multi-Snapshot Reports And Export Contracts

## Review Focus

Reviewed the spec after report-template additions to verify that data contracts can actually support multi-day monitor reports, exact seller/SKU matching, shareable image summaries, and export history.

## Findings Fixed

1. Exact monitor matching needed a normalized variant/model field.
   - Added `externalModelId` to snapshot items.
   - Added `(platform, externalShopId, externalProductId, externalModelId)` index requirement.

2. Report rows were modeled as single-snapshot only.
   - Added `baselineSnapshotId` and `comparisonSnapshotIdsJson` for multi-day reports.
   - Clarified that latest snapshot remains `snapshotId`.

3. Shareable image summaries needed reproducible export state.
   - Added `marketplace_search_report_exports`.
   - Added export type, template key, aspect ratio, status, storage keys, payload hash, source summary, expiry, and ownership fields.

4. Visual report rendering needed structured block data.
   - Added `visualBlocksJson` and `sourceSummaryJson` to reports.
   - Required visual blocks to be evidence-backed and reusable for dashboard and image-summary rendering.

5. Some decisions were still listed as open questions.
   - Resolved v1 deployment default, UI structure, export contract, and LLM/credit posture.
   - Left only genuinely deferred deployment/tier rollout questions.

6. Source mode names were inconsistent.
   - Standardized recorded sample source mode to `recorded_mcp_sample`.

## Verification

- `git diff --check` should pass after this review.
- Search scans should show no outdated source-mode names, outdated connector identifiers, or unresolved export-format questions.

## Residual Risk

Implementation still needs real browser evidence for live connector availability. The spec now supports the data and UI shapes required to preserve those results once observed.
