# TDD Guidance

## First tests to add or extend

### Web router and schema tests

- Extend agency router coverage for:
  - hybrid compile preview
  - subgraph validation
  - boundary contract validation
  - feature-flag gating for ADK surfaces
  - version snapshot round-trip for Agency Document v2
- Start from:
  - `apps/web/server/routers/__tests__/agency.test.ts`
  - `apps/web/server/routers/__tests__/agencyConditionalBranch.test.ts`
  - `apps/web/server/routers/__tests__/agencyLoopRetry.test.ts`

### Agency Builder UI tests

- Add UI coverage for:
  - engine badges
  - subgraph containers
  - legacy compatibility banner
  - boundary-node suggestions or warnings
- Start from:
  - `apps/web/client/src/components/agency/__tests__/AgencyBuilder.test.tsx`

### Python unit tests

- Add new tests for:
  - canonical document assembly
  - IR normalization
  - capability validation
  - boundary contract checks
  - Agency Swarm lowering compatibility
  - ADK lowering selection between graph and dynamic workflows
  - hybrid runtime bridge execution
  - hybrid billing normalization and idempotency
  - hybrid artifact publication and idempotency
  - secret scrubbing / policy-denied external target behavior

Recommended filenames:

- `python-backend/tests/unit/test_agency_hybrid_document.py`
- `python-backend/tests/unit/test_agency_hybrid_ir.py`
- `python-backend/tests/unit/test_agency_hybrid_compiler.py`
- `python-backend/tests/unit/test_agency_adk_adapter.py`
- `python-backend/tests/unit/test_agency_bridge_contracts.py`
- `python-backend/tests/unit/test_agency_hybrid_runner.py`

### Existing runtime regression tests

- Keep these passing:
  - `python-backend/tests/unit/test_agency_adapter.py`
  - `python-backend/tests/unit/test_agency_communication_flows.py`
  - `python-backend/tests/unit/test_agency_loop_handler.py`
  - `python-backend/tests/unit/test_agency_data_transform.py`
  - `python-backend/tests/test_langgraph_runtime.py`

## Expected failing conditions before implementation

- No current IR exists for hybrid agency compilation.
- No current subgraph metadata exists for agencies.
- No current compile preview explains engine lowering.
- No ADK runtime adapter exists.
- Legacy agencies are not yet auto-wrapped into root subgraphs.

## Golden compatibility guidance

- Capture representative existing agencies and freeze:
  - compile signature
  - communication order
  - final structured output shape
  - trace hierarchy
- The first implementation should fail these tests until the compatibility layer is in place.

## Negative-path checks

- Cross-engine edge without boundary should fail compile.
- ADK engine selection without feature flag should fail or downgrade to draft-only save.
- Unsupported node/engine combinations should emit clear diagnostics.
- Retry/resume flows should not double-charge credits or duplicate artifact publication.
- Unsafe MCP/OpenAPI/tool endpoints should fail before outbound execution.
- Hybrid work must not alter the behavior of `workflow.ts` or `langgraph_runtime.py`.

## Regression checks

- Existing Agency Builder save/load/version flows still work.
- Existing agency traces still persist into `agency_run_traces`.
- Existing run-result surfaces still expose normalized `creditsUsed`, `stepAttemptSnapshots`, and artifacts.
- Existing generic workflow compile/execute routes still pass their prior tests.
- Tool attachment and skill-call behavior for legacy agencies remain unchanged.

## Implementation notes

- Write validation tests before adapter code so capability boundaries are explicit from day one.
- Prefer snapshot-style compile-plan tests for hybrid planning.
- Add one end-to-end hybrid integration fixture only after unit-level compile and lowering behavior is stable.
