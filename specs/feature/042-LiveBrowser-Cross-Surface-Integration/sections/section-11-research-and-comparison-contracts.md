# Section 11 - Research And Comparison Contracts

## Goal

Provide structured, reusable comparison outputs for browse-heavy tasks such as research, ticket comparison, hotel comparison, and shortlist generation.

## Scope

- Define a normalized comparison schema for multi-option browse results.
- Support fields such as vendor, option title, price, currency, distance, availability, refundability, booking link, and evidence.
- Render comparison data in a reviewable UI shape instead of free-text only.
- Keep the schema reusable across Chat, Agency, and Workflow outputs.

## Implementation Notes

- Optimize for human-reviewed compare-and-decide flows, not unattended purchases.
- Keep extraction evidence attached so users can inspect where each comparison row came from.
- Prefer additive result contracts that can coexist with existing artifact systems.
- Distance and proximity fields should remain optional because some tasks will not have location inputs.

## Files Likely Touched

- shared comparison contract under `apps/web/shared/`
- Chat or Agency artifact rendering components
- workflow output serialization helpers
- Python executor or agent result normalization paths

## Tests

- Multi-option compare payload validates with optional and required fields.
- Price and currency normalization stay stable across providers.
- Comparison artifacts render without parsing free text.
- Missing distance data degrades cleanly without breaking the schema.

## Acceptance

- Browser-assisted research tasks can return structured comparison results that users can review before deciding what to book or open next.
