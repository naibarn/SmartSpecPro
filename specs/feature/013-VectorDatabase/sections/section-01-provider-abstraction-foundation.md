# Section 01: Provider Abstraction Foundation

## Objective
Create a single vector database abstraction layer that removes direct provider coupling from Node API search/indexing flows and becomes the only entrypoint for provider selection.

## Scope
- Define normalized provider contract for `index`, `delete`, and `search` operations.
- Implement adapter boundaries for Cloudflare Vectorize, pgvector, and Chroma.
- Implement effective config and switch-state resolver (`current_read_provider`, `target_provider`, campaign metadata).
- Expose provider capability metadata (dimensions, filter support, limit constraints) for validation and diagnostics.
- Replace direct provider client calls in high-level search/index orchestration paths with abstraction calls.

## Out of Scope
- Queue payload expansion and enqueue hooks (Section 02).
- Worker retry/dead-letter behavior (Section 03).
- Migration DDL and RLS enforcement (Section 04).

## Dependencies
- No implementation dependency; this is the root section.

## Implementation Tasks
1. Define a provider interface module with stable request/response/error shapes.
2. Build adapter modules for Vectorize, pgvector, and Chroma that map provider-specific SDK/SQL behavior to normalized contract semantics.
3. Create a resolver that reads vectordb settings plus switch-state to determine active provider for read/write contexts.
4. Add capability descriptors per provider and service-level validation hooks to reject unsupported requests early.
5. Refactor API-level vector entrypoints to call abstraction APIs instead of direct provider integrations.
6. Add structured error mapping for transient vs permanent failure classification to support retry decisions later.

## TDD-First Test Stubs
- Resolver returns active provider from effective settings and campaign state.
- Resolver fallback is deterministic when settings are partially missing.
- Dispatch sends operations to selected adapter only.
- Adapter contract conformance tests validate shape and error normalization for all providers.
- Capability metadata validation rejects invalid dimension/filter/topK requests.

## Risk Controls
- Keep existing Vectorize behavior reachable through adapter parity tests.
- Add feature-flag or guarded routing to allow controlled fallback during rollout.
- Ensure tenant filter requirements are enforced before adapter dispatch.

## Done Criteria
- All search/indexing entrypoints call abstraction layer.
- Provider resolver and contract tests pass for three providers.
- Capability checks are enforced with deterministic failure semantics.

## As-Built (2026-02-16)

### Actual files changed
- `apps/web/server/services/vectorProvider.ts`
- `apps/web/server/services/vectorize-indexing.ts`
- `apps/web/server/services/vectorize-search.ts`
- `apps/web/server/services/__tests__/vectorProvider.test.ts`
- `apps/web/server/__tests__/vectorize-search.test.ts`

### Deviations from plan
- pgvector/chromadb adapter boundaries are implemented with deterministic unsupported errors in Node runtime rather than full read/write wiring.
- Effective provider resolution currently uses runtime env config helper; persisted switch-state integration remains for later sections.

### Tests added/updated
- Added: `apps/web/server/services/__tests__/vectorProvider.test.ts`
  - resolver behavior from effective config + switch-state
  - deterministic fallback behavior when config is missing
  - dispatch to selected adapter only
  - capability validation failure semantics
  - adapter contract boundary checks for all providers
- Updated: `apps/web/server/__tests__/vectorize-search.test.ts` to assert abstraction dispatch calls.
- Existing: `apps/web/server/__tests__/vectorize-indexing.test.ts` continues to validate indexing/delete behavior.

### Known follow-ups
- Implement concrete pgvector/chromadb Node adapter wiring once DB/runtime interfaces are finalized.
- Replace env-only provider resolution with persisted settings + switch-state store integration.
