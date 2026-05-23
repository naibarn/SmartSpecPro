# Commission Rate Implementation - 2026-05-23

## Task

Add user-entered marketplace product commission rate as an optional percentage and carry it through extension, backend, database, and downstream views.

## Classification

- scope: large
- risk: medium
- affected_domains: extension UI, shared schemas, backend services, Drizzle schema/migration, web marketplace capture UI
- SocratiCode: active, index green

## Implementation

- Added optional `commissionRatePercent`/`commissionRateText` to extension capture payloads.
- Added a `Commission rate (%)` user input in the extension review form.
- Reviewed payload now validates commission as a 0-100 percentage, records field evidence, warns on invalid input, and sends it in raw capture payloads.
- Local AI sanitized input now includes commission rate and a bounded evidence item.
- Web shared contracts now accept `commissionRatePercent` in sanitized Local AI input and confirm/save payloads.
- Added `commissionRatePercent` columns to `marketplace_products` and `marketplace_product_price_snapshots`.
- Added migration `0184_marketplace_product_commission_rate.sql` with 0-100 check constraints.
- Confirm/save persists commission on product rows and metric snapshots; duplicate updates preserve existing commission when a new capture omits it.
- Preview/product/admin screens show commission rate and CSV export includes it.

## Verification

- `npm --prefix apps/extension run typecheck`: passed.
- `npm --prefix apps/extension run build`: passed.
- `npm --prefix apps/web test -- marketplaceCapture.test.ts`: passed.
- `npm --prefix apps/web run typecheck`: failed once due to Node heap OOM.
- `NODE_OPTIONS=--max-old-space-size=8192 npm --prefix apps/web run typecheck`: passed.
- `git diff --check` for touched files: passed.
