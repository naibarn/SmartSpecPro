# Section 01: Contracts and Evidence

## Objective

Create the pure, deterministic contract layer used by every later section. Do
not call the database, Redis, queue, provider, or LLM from this section.

## Owned paths

- `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`
- `apps/web/server/services/verticalDramaStoryGenerationCanonical.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryGenerationContracts.test.ts`
- `apps/web/shared/verticalDramaStoryGeneration.ts` when a shared API type is
  needed

## Required behavior

- Represent the versioned run contract from spec section 6.1, including source
  breakdown/version, evidence policy, output/validation/side-effect policy,
  budgets, rule packs, idempotency, policy hash, and contract hash.
- Canonicalize JSON objects, omit volatile fields, preserve ordered story
  sequences, and derive stable legacy beat IDs without changing persisted text.
- Build immutable source/control snapshots and fingerprints for draft, plan,
  character/location controls, quality criteria, and feature-flag snapshot.
- Enforce the status transition table and reject invalid transitions with a
  typed error.
- Produce the `StoryValidationReport` and `StoryGenerationRunSummary` shapes,
  including logical `transportOutcome` and resumable/repairable flags.
- Expose pure helpers for effective credit ceiling and impact scope.

## TDD and proof

Write tests first for hash stability, hash change on source/flag changes,
legacy IDs, transition rejection, 202-like pending summaries, and the rule that
only `succeeded` plus completed outcome is final success. Run the focused test
file and package typecheck.

## Gap closure

Review every field in spec 6.1-6.4 against the implementation; a missing field
is a blocking gap because later persistence cannot reconstruct the run.

## UI/UX Contract

### Target User / JTBD
N/A: server contract foundation; no user-facing surface is changed here.

### Existing Pattern Reference
N/A; existing vertical-drama status summaries remain the consumer.

### Surface Inventory
None.

### Component Map
None.

### State Matrix
N/A; covered by section 06.

### Responsive Matrix
N/A; covered by section 06.

### Accessibility Acceptance
N/A; no UI is changed.

### Copy Contract
N/A; API error codes are covered by server tests.

### Browser Evidence Required
None for this section; browser evidence belongs to section 06.
