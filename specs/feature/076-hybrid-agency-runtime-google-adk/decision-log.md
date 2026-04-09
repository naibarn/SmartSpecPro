## Planning depth

- Decision: `standard`
- Why:
  - The request is architecture-heavy, but the deliverable for this turn is still a bounded documentation package under `specs/feature`.
  - The work spans agency authoring, Python runtime adapters, and rollout guardrails, but it does not require immediate implementation or a repository-wide rewrite plan.

## Key design decisions

### D1. Create a new feature package under `specs/feature/076-hybrid-agency-runtime-google-adk`

- Rationale:
  - The request is an additive platform capability, not a small amendment to one existing feature file.
  - Keeping it in a dedicated feature directory lets the team evolve implementation plans and sections independently.

### D2. Anchor the spec to Agency Builder, not the generic Workflow Editor

- Decision:
  - Treat the ReactFlow-based Agency Builder as the primary authoring UI for this feature.
  - Explicitly keep the separate Workflow Editor + LangGraph runtime as a protected non-goal and non-regression boundary.
- Rationale:
  - The requested node catalog aligns with the agency-side graph model already in the repo.
  - The generic workflow stack uses a different runtime and should not be destabilized by this feature.

### D3. Keep current agency node identifiers where possible

- Decision:
  - Preserve existing node identifiers such as `human_approval` and `parallel_fan_out`.
  - Keep `aggregator` as the phase-1 merge/join node.
  - Keep tools attached to nodes instead of introducing a standalone tool node in phase 1.
- Rationale:
  - This minimizes UI churn and database churn.
  - It matches the current schema and existing builder/test coverage.

### D4. Introduce a SmartSpecPro-owned document v2 and canonical IR above current persistence

- Decision:
  - Add an assembled Agency Document v2 and Canonical IR in the service/compiler layer.
  - Keep current normalized persistence tables as the base, extended only where hybrid metadata is truly required.
- Rationale:
  - Current agency data is normalized across multiple tables.
  - A service-layer document avoids forcing an unsafe storage rewrite.

### D5. Engine targets for this feature are `agency_swarm` and `adk2`

- Decision:
  - Hybrid execution in this feature means Agency Swarm plus Google ADK 2.0.
  - The existing LangGraph workflow runtime remains a separate system and is not an engine target of this feature.
- Rationale:
  - This keeps the feature scope aligned to the user's request and the current repo boundaries.

### D6. ADK 2.0 is opt-in only and must be treated as pre-GA

- Decision:
  - Add a tenant/workspace feature flag, recommended key: `agencyHybridAdk`.
  - Existing agencies default to `agency_swarm`.
  - ADK 2.0 cannot be the default saved engine in phase 1.
  - ADK 2.0 storage must not be mixed with ADK 1.x storage.
- Rationale:
  - Official docs mark ADK 2.0 as Alpha and warn about compatibility and storage mixing.

### D7. Cross-engine edges require explicit boundary nodes and contracts

- Decision:
  - Cross-engine edges must pass through `engine_boundary` or explicit subgraph boundaries.
  - Every boundary must declare payload schema, trace propagation, retry, timeout, and approval ownership.
- Rationale:
  - This is the cleanest way to keep hybrid behavior debuggable and deterministic.

### D8. SmartSpecPro owns shared state, trace, policies, and bridge execution

- Decision:
  - Runtime state and checkpointing for cross-engine behavior belong to SmartSpecPro, not Agency Swarm or ADK internals.
  - Existing trace/audit/cost ownership remains in SmartSpecPro layers.
- Rationale:
  - Cross-engine behavior becomes untestable if engine-local internals leak into platform contracts.

### D9. Lower static graph semantics to ADK graph workflows, but lower complex loops to ADK dynamic workflows

- Decision:
  - Use ADK graph routes for deterministic sequences, branches, fan-out/join, nested workflows, and simple human input.
  - Use ADK dynamic workflows when lowering `loop_retry` and other more programmatic control-flow patterns.
- Rationale:
  - This matches the current official ADK 2.0 documentation.
  - It avoids forcing all SmartSpecPro semantics into the wrong ADK abstraction.

### D10. Preserve existing Agency Swarm behavior for legacy agencies

- Decision:
  - Legacy agencies must preserve:
    - prompt assembly
    - communication flow ordering
    - tool bindings
    - trace correlation shape where possible
- Rationale:
  - Backward compatibility is the highest product risk in this feature.

### D11. Phase-1 ADK runs inside the existing agency runtime boundary, not the generic worker-runtime family

- Decision:
  - `adk2` is an in-process Python backend engine in phase 1.
  - This feature aligns with specs 059 and 071 on control-plane ownership, but does not expose ADK through worker registration, claim, or job APIs yet.
- Rationale:
  - This keeps the first rollout smaller and avoids inventing two different runtime contracts for the same hybrid feature.

### D12. Hybrid version snapshots must store the full assembled Agency Document v2

- Decision:
  - `agency_versions.snapshotJson` for hybrid-capable agency versions must persist the full assembled document shape, including `documentVersion`, `defaultEngine`, `nodes`, `edges`, `subgraphs`, and `settings`.
  - Legacy snapshot shapes remain readable and are normalized in memory.
- Rationale:
  - Version restore, diff, preview compile, and migration analysis are incomplete if snapshots only store `{ name, nodes, edges }`.

### D13. `subgraph`, `start`, and `end` are structural semantics, not new persisted phase-1 node rows

- Decision:
  - Keep `isEntryPoint` as the persisted entry semantic for current agencies.
  - Treat `subgraph` as document/container metadata.
  - Treat `start` and `end` as compile-time or preview-time markers only.
  - Add `engine_boundary` as the only new structural node that must persist explicitly in phase 1.
- Rationale:
  - This avoids creating a second conflicting graph-structure model beside the current agency node schema.

### D14. Hybrid billing and artifact publication must reuse existing SmartSpecPro surfaces

- Decision:
  - Normalize hybrid usage into the existing Node-side run contract, including `creditsUsed`, `stepAttemptSnapshots`, structured outputs, preview artifacts, and trace `totalCost`.
  - Publish runtime outputs through `agency_run_artifacts` and the existing library/indexing lifecycle rather than creating an ADK-only artifact silo.
- Rationale:
  - Billing, support, and audit workflows already depend on these platform-owned surfaces.

### D15. Security hardening is part of phase 1, not a later operational cleanup

- Decision:
  - Hybrid/ADK flows inherit SSRF protection, egress controls, encrypted secret storage, trace scrubbing, signed upload requirements, feature-flag gating, and an operational kill switch.
  - ADK versions must be pinned because ADK 2.0 is Alpha.
- Rationale:
  - Hybrid execution expands the number of tool, artifact, and secret-handling paths. Deferring hardening would leave the first rollout unsafe.

## Risks carried forward

- ADK 2.0 Alpha may change semantics before GA.
- Current agency persistence is normalized, so assembling and validating hybrid documents must be done carefully to avoid mismatches between UI snapshots and row-based storage.
- Aggregator-as-join is a practical phase-1 choice, but the team may still decide to add a distinct `join` node later.
- Cross-engine trace and retry semantics can drift if bridge contracts are underspecified.
- If hybrid UI is exposed too early, users may accidentally create graphs that compile in theory but are not yet operationally ready.
- Keeping ADK in-process for phase 1 reduces scope, but the team should revisit worker-runtime alignment before any large-scale externalized execution rollout.
