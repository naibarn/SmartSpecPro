# Section 02 — Billing Profiles and Admin Settings

## Overview

This section creates the editable live-profile layer that feeds future invoices and admin configuration.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/routers/billing.ts` | User billing profile endpoints |
| `apps/web/server/routers/adminBilling.ts` | Admin settings endpoints |
| `apps/web/client/src/pages/...` | Billing profile and admin settings pages |
| `apps/web/server/services/billing/profileService.ts` | Validation and persistence logic |

## Implementation details

- Add `Settings > Billing Profile` for buyer header editing and validation.
- Add seller-profile settings that supersede the current flat invoice header model.
- Add tax and numbering settings with stream-specific rate/prefix/effective-date previews.
- Preserve revision history for sensitive admin settings changes.
- Define migration/interop from current `invoice_config` into seller-profile defaults so existing tenant invoice branding is not lost.

## Tests to write first

- Buyer profile validation tests.
- Admin settings authorization tests.
- Tax/numbering preview tests by stream.
- Revision-history tests for seller/tax settings edits.
