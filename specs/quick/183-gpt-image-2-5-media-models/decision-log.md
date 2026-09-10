# Decision Log

## 2026-09-09 — standard quick plan

- Chosen depth: `standard`.
- Reason: the feature is a small cross-layer catalog change (static registry, seed, SQL ledger, and Python/TypeScript tests) but does not introduce a new architecture, schema shape, provider, auth boundary, or UI workflow.
- Recommended approach: add two canonical text-to-image rows and configure the existing two-way provider switch for each row.
- Rejected approach: expose four catalog rows. This contradicts the requested UX and creates duplicate model choices.
- Rejected approach: add a new provider-specific resolver or client-side model rewrite. Existing generic routing already handles the required behavior and a second resolver would increase drift risk.
- Migration decision: use a unique next numeric SQL filename after the user-owned 0288 file, while not modifying that file. Reconcile the journal entry with the repository's current ledger during implementation and never reorder unrelated entries.
- Pricing decision: both rows use flat `default: 70`, matching GPT Image 2 as explicitly confirmed by the user.
