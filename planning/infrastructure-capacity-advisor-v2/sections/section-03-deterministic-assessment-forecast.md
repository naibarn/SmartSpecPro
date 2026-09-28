# Section 03 — Deterministic Assessment and Forecast

## Objective

Make server computation the authority for status, risk, action class, and
capacity forecast before any LLM call.

## Scope and ownership

Add pure helpers for threshold evaluation, status precedence, coverage score,
freshness, trend slope, disk/temp growth, and time-to-threshold. Require a
documented minimum sample count/time span and cap forecast horizon. With weak or
conflicting history return `insufficient_data` and evidence explaining why.

Produce per-area risk items with current value, threshold, unit, capturedAt,
source/scope, trend, forecast basis, and action class. Overall action must
distinguish observe, optimize, scale-up, Cloud review, and insufficient data.
Persist deterministic decision and history metadata before/alongside the
reconciled LLM result. Store compact records after the full-snapshot retention
window and make cleanup bounded/idempotent.

## TDD first

Test exact boundary values, mixed severity precedence, stale/partial data,
minimum-history forecast rules, positive/negative/flat growth, capped horizons,
and retention eligibility/idempotence.

## Acceptance

Identical snapshots and policy versions produce identical decisions. No one-point
forecast is shown as a Cloud recommendation. The stored result can explain which
figures and samples caused the status without consulting the LLM.

## Dependencies

Sections 01 and 02. Blocks skill reconciliation, guarded run result, and UI.

## UI/UX Contract

N/A for pure assessment logic; presentation is specified in section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — browser proof is owned by section 06 and 08.
