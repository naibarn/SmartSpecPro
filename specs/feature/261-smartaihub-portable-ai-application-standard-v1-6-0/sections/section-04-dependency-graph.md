# Section 04 — Dependency Graph Validation

## Purpose and boundary

Implement deterministic, bounded validation of manifest-declared component and capability dependency edges for Spec 261 Phase A. Each component declares a stable ID, type, source/version-or-digest reference, and `dependsOn` edges. This section proves only static local graph facts: endpoints, edge shape, duplicate/self edges, supported version/range syntax, production immutability policy, and cycle/order behavior. It must never resolve a registry, fetch an artifact, execute package content, contact an adapter/provider, or assert that a runtime capability exists.

Its result supplies the local dependency evidence for V2 and V3. A required endpoint/reference that is absent from the package is a local error. External registry/capability availability is contextual: it is reported as requiring context or `not_evaluated` only where the manifest marks it optional and the profile permits deferred resolution. Missing external context must never be represented as a pass.

## Dependencies and handoff

- **Requires section 01:** stable graph/diagnostic/result types, shared graph limits, deterministic ordering rules, and public exports.
- **Requires section 02:** canonical component declarations, `dependsOn` semantics, version/schema compatibility fields, feature policy, and production/release intent.
- **Requires section 03:** normalized immutable inventory, unique validated component IDs, canonical component source/reference facts, and V2 structural diagnostics. Do not accept raw paths or unparsed manifest objects.
- **Blocks section 07:** return a deterministic static graph result and contextual-resolution facts for V2/V3 report composition.

### Owned implementation and test files

- Create `packages/spaas-standard/src/validate/dependencies.ts`.
- Update `packages/spaas-standard/src/model.ts` only for typed graph edges/results agreed with section 01.
- Update `packages/spaas-standard/src/index.ts` to export the stable graph validator and public types.
- Create `packages/spaas-standard/tests/dependency-graph.test.ts` with in-memory canonical manifest/structural-result fixtures.

## Tests first

Write this Vitest suite before implementation. Fixtures must use canonical values from sections 02–03, never a live registry or filesystem.

1. **Valid deterministic DAG:** a graph of component and capability edges returns the expected topological component order. Reorder input components and edges repeatedly; order and serialized diagnostics remain deterministic, using a documented stable ID tie-breaker.
2. **Endpoint integrity:** reject a required component endpoint that does not exist, malformed edge syntax, and a reference contradicted by the normalized structural result. Required unresolved dependency uses a stable `DEPENDENCY_UNRESOLVED`-class code and safe component/edge location.
3. **Edge uniqueness and self-reference:** reject duplicate semantically identical edges and self edges unless a future canonical runtime-cycle contract explicitly makes that exact edge legal. Phase A has no such contract, so all cycles are invalid.
4. **Version/reference policy:** accept supported version/range syntax; reject malformed/unsupported syntax. When manifest release/production intent is declared, reject mutable references such as `latest`, branch heads, and unpinned source references unless the canonical policy has an explicit approved immutable exception. Development-only source references stay classified as local declarations and are never fetched.
5. **Stable cycle diagnostics:** verify two-node and longer cycles return a canonical, repeatable closed cycle path and the same stable code/location regardless of edge enumeration. A graph with independent acyclic nodes plus one cycle must still report the cycle without nondeterministic traversal artifacts.
6. **Optional contextual resolution:** an optional external capability/dependency that cannot be resolved locally produces the documented contextual/not-evaluated fact only when optionality and safe omission are explicit. Required external resolution is an error; no unavailable resolver is treated as success.
7. **Bounded iterative behavior:** validate a large permitted graph without recursion/stack failure. Exceeding declared node or edge limits fails closed before traversal, with a stable limit diagnostic.
8. **Pure boundary:** assert the validator performs no registry/provider/network/process/module-loading call and does not mutate the canonical manifest or structural result.

Run the package-scoped suite directly and with the other package tests; do not run repository-wide typecheck.

## Implementation plan

### 1. Define canonical typed edges

In `src/validate/dependencies.ts`, translate the canonical `dependsOn` declarations into an immutable edge form with `fromComponentId`, a typed target kind (`component` or declared capability/reference kind), normalized target identifier, optional version/range constraint, required/optional semantics, and safe manifest location. Reject malformed declarations during translation rather than allowing ad hoc string splitting downstream.

Resolve component-to-component endpoints against section 03's unique component index. Treat declared capabilities as typed local declarations; do not invent a remote resolution result. Keep the edge source metadata required to report an actionable, non-sensitive location.

### 2. Apply static edge and reference rules

Before graph ordering, validate endpoint existence, duplicate edges, self edges, version/range syntax, and production reference immutability. The immutable-production rule applies when canonical manifest intent says release/production; it rejects `latest`, branch-head, and other mutable source references unless a later explicit canonical policy marks an approved exception. Do not use package content paths or source-file extensions as evidence that an edge is executable.

Centralize stable codes in the section-01 diagnostic union. Add graph-specific codes such as `DEPENDENCY_UNRESOLVED`, `DEPENDENCY_DUPLICATE`, `DEPENDENCY_SELF_REFERENCE`, `DEPENDENCY_VERSION_INVALID`, `DEPENDENCY_MUTABLE_REFERENCE`, `DEPENDENCY_CYCLE`, and `DEPENDENCY_LIMIT_EXCEEDED`. Each diagnostic has the V2/V3 stage supplied by its caller/composer, a JSON-pointer-like safe location, and deterministic ordering; it must not contain arbitrary manifest/package text.

### 3. Use bounded iterative graph algorithms

Implement deterministic topological ordering with an iterative Kahn-style traversal and a lexicographically ordered ready set keyed by stable component ID. Enforce graph node/edge limits before allocating/traversing large structures. Do not use recursive DFS.

When a cycle remains, use an iterative bounded walk over sorted adjacency lists to derive a canonical closed cycle path. Normalize the representation by rotating it to the lexicographically smallest participating component ID and use a consistent direction based on the declared edge direction. Report one deterministic representative cycle per bounded policy and preserve enough facts for the pipeline to classify the graph invalid. Never emit a host-dependent object iteration order.

### 4. Separate local validity from contextual resolution

Return a `DependencyGraphResult` with immutable typed edges, topological order when acyclic, stable cycle information, static diagnostics, and separate contextual-resolution facts. Local endpoint/edge/cycle/immutability defects are failures. External availability/version satisfaction that requires a registry, runtime, or provider is not probed here: classify it as `not_evaluated`/needs-context only when the declaration is explicitly optional and omission is safe under section 02 policy; otherwise return the required unresolved failure. Section 07 owns stage-report composition and overall status calculation.

## Acceptance criteria

- Valid acyclic component/capability declarations yield a deterministic topological order independent of input ordering.
- Missing endpoints, duplicate/self edges, malformed version/range values, disallowed mutable production references, required unresolvable dependencies, cycles, and graph-limit overflows fail closed with stable safe diagnostics.
- Cycles are reported as a bounded canonical path without recursion or stack exhaustion.
- Optional external resolution is never silently successful and is contextual only under explicit safe-omission semantics.
- The validator is pure and non-executing; it does not resolve remote artifacts or capabilities.
