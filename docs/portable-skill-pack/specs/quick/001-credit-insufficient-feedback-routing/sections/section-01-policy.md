# Section 01: Credit Policy

Ownership: pure classifier only.

Targets: `apps/web/server/services/creditFailurePolicy.ts` and its test.

Implement explicit source/model context plus conservative fallbacks. Return route, severity, requested credits, threshold, provider, and user-facing copy. Do not access the database.

Acceptance: all threshold and provider-marker cases are deterministic and bounded.
