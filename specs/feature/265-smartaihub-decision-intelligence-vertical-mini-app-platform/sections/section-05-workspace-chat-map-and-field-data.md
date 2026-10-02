# Section 05 — Workspace, Existing Chat, Map, Field Data

## Scope

Implement Spec 265 §§19–21 and 24. Reuse existing Chat & Feedback, Task Control, SPAAS and Spec 262 surfaces.

## Implementation

- A real workspace for evidence plan, results, alternatives, confidence, source inspection and run history.
- Chat is a compact entry point that calls existing chat/task services; do not build a separate chat runtime.
- Map integration uses versioned Spec 266 GeoEvidenceFeature through Spec 262 and only verified capabilities.
- Field collection uses authorized tasks and provenance-aware user assertions.

## Tests

Mobile/responsive state, authorization, empty/loading/error, source lineage and no duplicate chat/task/map authority.
