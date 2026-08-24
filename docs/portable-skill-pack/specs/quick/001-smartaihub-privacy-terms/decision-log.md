# Decision Log

## 2026-08-24

- Depth: `standard` quick-plan. The change is medium-sized but limited to client copy/rendering
  and focused tests; it does not need schema or cross-service architecture work.
- Content storage: shared typed module with `en`/`th` document data. This keeps section parity
  explicit and avoids touching the already-dirty i18next namespace configuration.
- Rendering: explicit paragraph/list/subsection rendering; do not parse markdown in the UI.
- Legal posture: describe implementation and legal bases conservatively; do not infer vendors,
  certifications, exact retention periods, or a DPO from old copy.

## Quick-plan self-review rounds

- Round 1 — scope/artifact fit: PASS; files stay within client legal pages/content/tests.
- Round 2 — section manifest consistency: PASS; two manifest sections have matching files.
- Round 3 — boundary/security check: PASS; no auth, tenant, server, schema, or migration work.
- Round 4 — UI contract completeness: PASS; responsive, accessibility, copy, and browser evidence
  requirements are recorded.
- Round 5 — implementability: PASS; file ownership, TDD order, acceptance criteria, and fallback
  behavior are explicit. Two clean stabilization checks reached.
