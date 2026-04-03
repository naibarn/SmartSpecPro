# Section 05: Tests, Rollout, and Guardrails

## Purpose

Close the feature with regression coverage and rollout checks so Kie support can be added without destabilizing the existing provider fleet.

## Ownership

- test coverage
- rollout sequencing
- operator-facing safety checks

## Target files

- `apps/web/server/routers/llmProviders.test.ts`
- `apps/web/server/routers/multiProvider.test.ts`
- `apps/web/server/seed.test.ts`
- llm route / responses route tests near `apps/web/server/_core/`

## Implementation notes

1. Add regression tests for:
   - legacy providers still using their current URL and payload rules
   - Kie mixed-style catalog metadata
   - Kie per-model request config metadata
   - Kie route resolution
   - Kie request-shape handling
   - Kie response normalization and billing safety behavior
   - alias-resolution and allowlist-forwarding behavior

2. Add explicit rollout checks:
   - Kie provider disabled by default
   - Kie mappings disabled by default if mappings are seeded
   - generic chat rejects Kie responses-only models
   - `/v1/responses` rejects non-responses Kie families
   - models without safe pricing or normalization stay disabled
   - Claude streaming is enabled only when SSE normalization support is explicitly shipped with dedicated coverage

3. Operator notes to include in implementation handoff:
   - set API key in admin first
   - verify pricing from current Kie pricing page before enabling mappings
   - smoke-test Claude, Gemini, and one responses model independently

## TDD expectations

- Do not rely only on happy-path tests.
- Include at least one negative test showing that the wrong route is blocked.

## Acceptance checks

- Test suite covers all three Kie API-style families.
- Existing providers still pass their prior tests.
- Rollout defaults are conservative and explicit.
- Billing and audit paths are covered for every Kie family in scope.
- Unknown Kie top-level fields and alias-resolution paths are covered by tests.
