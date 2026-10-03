# Section 01 code review record

Independent read-only review rounds found and repaired these issues before section closure:

1. Digest format was too permissive; now SHA-256 is exactly 64 hex characters.
2. Canonical artifact omitted project/owner/rights/lineage/system-snapshot/action-binding fields; now scoped and validates lineage as a pair.
3. Unsafe markup, URL schemes, traversal references, non-JSON objects and non-deterministic digest ordering are rejected.
4. G0 now has a fail-closed readiness schema; its record cites the current worker/outbox, Spec 224, Spec 256 and schema source paths.
5. Feature flags now include visual verification and self-design, default off; provider admission requires all relevant gates. The checked-in JS mirror is tested against the TS registry.
6. Credential leakage cases were found through Basic authorization, token-like values in ordinary fields, sensitive property names and provider token formats; added validation and regression tests. UUID identifiers remain accepted.

Final review status: no remaining P1 findings in the tested contract boundaries. This is not proof against unknown credential formats; G0 still blocks provider onboarding and payload content is fail-closed.

Focused evidence: `cd apps/web && npm test -- --run shared/designIntelligence.test.ts shared/__tests__/featureFlags.designIntelligence.test.ts` — 2 files, 22 tests passed; `git diff --check` passed.
