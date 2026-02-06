# Section 11: Admin Page Updates

## Overview

Update the existing `AdminLLMProviders.tsx` page to include provider health indicators, a model mappings CRUD tab, a routing rules CRUD tab, and a usage dashboard with date range filtering and charts. All data comes from the tRPC endpoints defined in section 08.

**Files to modify:**
- `apps/web/client/src/pages/AdminLLMProviders.tsx`
- Potentially new sub-components in the same directory for each tab

**Dependencies:**
- Section 08 (tRPC endpoints) must be complete — all admin tRPC queries and mutations are consumed here

---

## Tests First

Test file: `apps/web/client/src/pages/__tests__/AdminLLMProviders.test.tsx`

Use Vitest with React Testing Library. Mock all tRPC queries/mutations.

### Provider List Enhancements

- Test: Provider health status indicator renders correct colors. Mock providers with `healthStatus: 'healthy'`, `'degraded'`, and `'down'`. Verify green, yellow, and red indicators respectively (test via CSS class, data-testid, or accessible label).
- Test: Provider type badge renders for each provider. Mock a provider with `providerType: 'primary'`. Verify a badge element with text "primary" is present.
- Test: Quick stats display for each provider: requests today, error rate, avg latency. Mock `getProviderHealth` response with sample stats. Verify the values render.

### Model Mapping Tab

- Test: Model mapping table renders all mappings. Mock `listModelMappings` with 3 mappings. Verify 3 rows render with columns: model ID, provider, pricing (input/output), free?, enabled?, priority.
- Test: Clicking "Add Mapping" opens a form. Trigger click, verify form fields appear: modelId, providerId (dropdown), modelName, providerModelId, pricingInput, pricingOutput, isFree, contextLength, isEnabled, priority.
- Test: Submitting the add form calls `upsertModelMapping` mutation with correct input. Fill the form, submit, verify the mutation was called with expected values.
- Test: Clicking "Edit" on a mapping pre-fills the form with existing values. Verify fields are populated.
- Test: Clicking "Delete" on a mapping calls `deleteModelMapping` mutation. Confirm, verify the mutation was called with the mapping's ID.
- Test: After successful create/update/delete, the mapping list refetches (verify via `invalidateQueries` or re-render with updated mock).

### Routing Rules Tab

- Test: Routing rules table renders all rules. Mock `listRoutingRules` with 2 rules. Verify 2 rows with columns: model pattern, routing mode, provider order, max fallbacks, active.
- Test: Adding a routing rule with mode "priority" requires a non-empty provider order. Submit form with `routingMode: 'priority'` and empty `providerOrder`, verify validation error is shown.
- Test: Routing rule CRUD (add, edit, delete) calls the correct tRPC mutations. Similar pattern to model mapping tests.

### Usage Dashboard Tab

- Test: Usage dashboard renders with a date range picker. Verify start date and end date inputs exist.
- Test: Changing date range triggers a refetch of `getAdminUsageStats`. Change the dates, verify the query is called with updated parameters.
- Test: Dashboard displays total requests, total cost, and error rate. Mock stats data, verify these summary values render.
- Test: Dashboard shows a breakdown table by provider (provider name, request count, cost, error rate). Mock stats with two providers, verify both rows render.
- Test: Dashboard shows a breakdown table by model (model name, request count, cost). Mock stats with two models, verify both rows render.

### Tab Navigation

- Test: The page has tabs/sections for "Providers", "Model Mappings", "Routing Rules", and "Usage Dashboard". Verify all tab labels render.
- Test: Clicking a tab switches the visible content. Click "Model Mappings" tab, verify the mapping table is visible and the provider list is hidden.

---

## Implementation Details

### Page Structure

The existing `AdminLLMProviders.tsx` currently shows a provider list with CRUD capabilities. Restructure it into a tabbed layout:

1. **Providers** (existing, enhanced) — provider list with health indicators and quick stats
2. **Model Mappings** (new) — CRUD for `model_provider_map`
3. **Routing Rules** (new) — CRUD for `routing_rules`
4. **Usage Dashboard** (new) — aggregated usage statistics

Use the existing UI component library's tab component (check the project for existing tab patterns in other admin pages).

### Providers Tab Enhancements

Add to each provider row in the existing provider list:

**Health status indicator:** A colored dot or badge next to the provider name.
- Green: `healthStatus === 'healthy'`
- Yellow: `healthStatus === 'degraded'`
- Red: `healthStatus === 'down'`

Data source: the `llmProviders.list` query now includes `healthStatus` (section 08 updates the existing endpoint).

**Provider type badge:** A small label showing `providerType` (primary/secondary/fallback).

**Quick stats row:** Below or beside the provider name, show:
- Requests today (from `getProviderHealth` response)
- Error rate percentage
- Average latency in ms

Data source: `llmProviders.getProviderHealth` tRPC query.

### Model Mappings Tab

**Table columns:** Model ID, Model Name, Provider (name), Provider Model ID, Input Price (per 1M), Output Price (per 1M), Free, Enabled, Priority, Actions (Edit/Delete).

**Add/Edit form:** A form (inline or modal) with fields matching the `upsertModelMapping` input schema:
- `modelId` — text input
- `providerId` — dropdown populated from `llmProviders.list`
- `modelName` — text input
- `providerModelId` — text input
- `pricingInput` — number input (per 1M tokens)
- `pricingOutput` — number input (per 1M tokens)
- `isFree` — checkbox (auto-checks when both prices are 0)
- `contextLength` — number input
- `isEnabled` — checkbox
- `priority` — number input (lower = higher priority)

On submit, call `llmProviders.upsertModelMapping`. On success, invalidate the `listModelMappings` query to refresh the table.

### Routing Rules Tab

**Table columns:** Model Pattern, Routing Mode, Provider Order (comma-separated provider names), Max Fallbacks, Active, Actions (Edit/Delete).

**Add/Edit form:**
- `modelPattern` — text input with hint: `"*"` for all, `"kimi-*"` for prefix, or exact model ID
- `routingMode` — dropdown: cost, quality, priority
- `providerOrder` — multi-select or sortable list of providers (only shown/required when mode is "priority")
- `maxFallbacks` — number input (0-10, default 3)
- `isActive` — checkbox

On submit, call `llmProviders.upsertRoutingRule`. Validate that `providerOrder` is non-empty when `routingMode` is "priority".

### Usage Dashboard Tab

**Date range picker:** Two date inputs (start, end) defaulting to the current month. A "Refresh" button or auto-fetch on date change.

**Summary cards:** Display at the top of the dashboard:
- Total Requests (number)
- Total Cost (USD formatted)
- Total Credits Charged
- Overall Error Rate (percentage)

**Provider breakdown table:**
- Columns: Provider Name, Requests, Cost (USD), Error Rate, Avg Latency (ms)
- Rows from `getAdminUsageStats().byProvider`

**Model breakdown table:**
- Columns: Model Name, Requests, Cost (USD), Credits Charged
- Rows from `getAdminUsageStats().byModel`

**Charts (optional enhancement):** If the project already uses a charting library, add:
- Line chart: requests over time by provider
- Bar chart: cost by provider

If no charting library is available, the tables alone are sufficient for the initial implementation. Charts can be added later.

Data source: `llmProviders.getAdminUsageStats` tRPC query, passing the selected date range and optional provider/user filters.

### Filtering

The usage dashboard optionally supports filtering by:
- Provider (dropdown from `llmProviders.list`)
- User (search/dropdown, for admin use)

These filters are passed as optional parameters to `getAdminUsageStats`.
