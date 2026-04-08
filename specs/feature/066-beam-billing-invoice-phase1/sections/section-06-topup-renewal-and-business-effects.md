# Section 06 — Top-up, Renewal, and Business Effects

## Overview

This section wires billing transactions into user-facing commerce flows and existing plan/credits state.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/services/billing/topupService.ts` | One-time top-up flow |
| `apps/web/server/services/billing/renewalService.ts` | Monthly renewal flow |
| `apps/web/server/services/billing/businessEffects.ts` | Exactly-once credit/plan mutations |

## Implementation details

- Implement top-up order/invoice creation and Beam checkout handoff.
- Implement renewal invoice creation by billing cycle.
- Apply credits, subscription extension, downgrade, and downgrade reversal through exactly-once effect keys.
- Keep invoice/business-effect state separate so "paid but unapplied" recovery is possible.

## Tests to write first

- Top-up grants credits once.
- Renewal extends subscription once.
- Duplicate paid events do not duplicate effects.
- Stale paid events for replaced invoices do not reapply effects.
