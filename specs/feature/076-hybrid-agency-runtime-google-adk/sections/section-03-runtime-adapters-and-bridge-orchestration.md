# Section 03: Runtime Adapters and Bridge Orchestration

## Purpose

Preserve the existing Agency Swarm adapter path, add a Google ADK 2.0 adapter, and introduce SmartSpecPro-owned hybrid bridge execution between engine-specific subgraphs.

## Ownership

- Agency Swarm compatibility path
- ADK adapter
- hybrid runner
- bridge contracts
- billing normalization
- artifact publication
- trace propagation

## Target files

- `apps/web/server/services/agencyBridge.ts`
- `apps/web/server/services/agencyTraceService.ts`
- `python-backend/app/services/agency_swarm_adapter.py`
- new Python services for ADK lowering/execution and hybrid orchestration

## Implementation notes

1. Keep the existing Agency Swarm adapter as the default compatibility implementation.

2. Add a new ADK adapter that:
   - lowers static routed subgraphs to ADK graph workflows
   - lowers loop-heavy or richer programmatic control flow to ADK dynamic workflows

3. Keep phase-1 ADK execution inside the Python backend agency runtime boundary rather than registering it as a generic worker runtime.

4. Introduce a SmartSpecPro-owned hybrid runner that executes:
   - subgraph A
   - boundary bridge
   - subgraph B
   - and so on

5. Keep shared state, trace IDs, approval ownership, and retry semantics in SmartSpecPro runtime layers.

6. Add billing normalization so Agency Swarm, ADK, and bridge events reconcile into existing Node-side run-result surfaces:
   - `creditsUsed`
   - `stepAttemptSnapshots`
   - trace `totalCost`
   - preview artifacts / structured outputs

7. Add artifact publication wiring so hybrid outputs flow through:
   - `agency_run_artifacts`
   - existing library/indexing publication paths
   - signed upload or equivalent managed storage helpers

8. Extend trace payloads so persisted traces show:
   - engine
   - subgraph
   - boundary transitions
   - lowered-source information where possible

9. Apply runtime security controls at this layer:
   - SSRF and egress policy checks for external targets
   - encrypted secret handling only
   - trace scrubbing for tokens and sensitive tool output

## TDD expectations

- Add unit tests for bridge contracts and engine-selection behavior before any end-to-end hybrid happy path.
- Add at least one failure-path test for a bridge error that stops downstream execution.

## Acceptance checks

- Legacy Agency Swarm runs still behave the same.
- ADK subgraphs can run through a wrapped adapter path.
- Hybrid traces show subgraph and boundary execution explicitly.
- Hybrid billing is idempotent and artifact publication remains SmartSpecPro-owned.

## Coordination notes

- Do not expose raw ADK runtime objects or storage semantics directly to web clients.

## Implementation status

- Completed.
- Extended the Node/Python agency bridge to carry compile preview metadata, hybrid step-attempt snapshots, and hybrid summaries; added runtime helper composition in Python; and normalized persisted traces with secret scrubbing plus bridge/subgraph summaries.
- Verification:
  - `npm --prefix apps/web test -- --run server/services/__tests__/agencyBridge.test.ts server/services/__tests__/agencyTraces.test.ts`
  - `DEBUG=false uv run pytest --no-cov tests/unit/test_agency_hybrid_runtime.py tests/unit/test_agency_router.py tests/unit/test_agency_service.py`
