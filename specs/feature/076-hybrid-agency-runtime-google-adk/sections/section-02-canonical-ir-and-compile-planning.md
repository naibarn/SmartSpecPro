# Section 02: Canonical IR and Compile Planning

## Purpose

Build the SmartSpecPro-owned canonical IR, capability matrix, compile diagnostics, and subgraph partitioning logic that determines how agency graphs lower into `agency_swarm` or `adk2`.

## Ownership

- canonical agency workflow IR
- capability validation
- compile modes
- boundary validation
- compile preview payload

## Target files

- `apps/web/server/routers/agency.ts`
- new Python compiler/IR services under `python-backend/app/services/`
- existing Python agency support services where validation helpers already live

## Implementation notes

1. Normalize current agency rows into a single IR:
   - nodes
   - edges
   - subgraphs
   - tool bindings
   - runtime policies

2. Add compile modes:
   - `strict`
   - `assist`
   - `legacy_agency`

3. Implement capability validation for:
   - unsupported node/engine pairs
   - missing boundary contracts
   - invalid cross-engine joins
   - ambiguous human approval ownership

4. Keep current repo node identifiers in the IR so the UI does not need a vocabulary rewrite.

5. Treat `aggregator` as the phase-1 merge/join semantic in the compiler.

6. Derive structural semantics from the current agency model:
   - `isEntryPoint` projects into IR `entryNodes`
   - terminal semantics come from leaf nodes, explicit outputs, or boundary exits
   - `subgraph` remains document metadata, not a persisted node row in phase 1

7. Define a minimum bridge contract schema in the compiler for every cross-engine boundary:
   - `payload`
   - `artifactRefs`
   - `metadata`
   - `traceContext`
   - `billingContext`
   - retry/timeout policy

8. Emit compile preview data that explains:
   - which subgraphs use which engine
   - which nodes are emulated
   - which nodes lower to graph workflows vs dynamic workflows in ADK

## TDD expectations

- Start with validator tests and snapshot-style compile-plan tests.
- Make unsupported patterns fail before adapter implementation begins.

## Acceptance checks

- Compile preview clearly shows engine partitioning.
- Unsupported cross-engine edges fail with explicit diagnostics.
- Legacy agencies compile as one Agency Swarm subgraph by default.
- Bridge contracts are explicit enough for artifact-heavy and billed workflows.

## Coordination notes

- Keep compile source mappings rich enough for a future diff UI, even if the first release only surfaces textual diagnostics.

## Implementation status

- Completed.
- Added canonical IR + compile preview generation in `agencyHybridCompile`, capability diagnostics for `agency_swarm` vs `adk2`, cross-engine boundary enforcement, and router-side compile preview/save/run preflight checks.
- Verification:
  - `npm --prefix apps/web test -- --run server/services/__tests__/agencyHybridCompile.test.ts server/routers/__tests__/agency.test.ts`
  - `npm --prefix apps/web run typecheck`
