# Orchestra Plan

## Task

Audit the implemented Vertical Drama Enhanced video-prompt runtime for production readiness, close every safe in-scope gap, and run at least ten independent review rounds without changing the legacy flow.

## Classification

- scope: medium
- risk: high
- affected_domains: [python-runtime, backend, api-contract, tenant-isolation, model-routing, persistence, frontend, security, observability, release]
- estimated_file_count: 12+
- chosen_route: direct-standard-light with sequential audit and repair rounds
- task_summary: validate the existing Enhanced feature against its spec and production contracts, repair concrete gaps, and prove the result with fresh focused gates.
- bug_route: not applicable; this is a production-readiness audit and repair request.
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Intent and activation

- Orchestra is active because this is a cross-domain repository audit with implementation and repeated verification.
- SocratiCode was unavailable in the active tool list; targeted shell search and bounded reads are the fallback.
- No additional named skill is required; the work is an in-scope review/repair of the existing Feature 173 implementation.
- Current target is local Debian Beta. Cloud deployment is future packaging only and is not a completion prerequisite for this audit.

## Evidence ledger

- source: local runtime command
- identifier: `uv run --frozen --project . python -m smartaihub_video_director.enhanced_bridge --health`
- observed failure: none; local bridge reports SDK 0.22.0, adapter 1.0.0, skill 11.0.0.
- data state: package lock and isolated runtime are present; focused tests previously passed.
- confidence: medium
- next evidence needed: fresh contract, security, tenant, persistence, model, UI, and release checks against current worktree.

## Impact preflight

- Direct feature surfaces: Enhanced runtime settings service/panel, Feature 173 backend procedures, prompt bridge, skill package, tenant flags, media/model capability mapping, and persistence projection.
- Risk-sensitive surfaces: tenant authorization, encrypted provider credential boundary, token/credit settlement, provider model pinning, child-process execution, JSON schema validation, and legacy prompt projection.
- Dirty worktree: many unrelated application files are already modified; preserve them and restrict edits to Feature 173/runtime packaging/docs and orchestration artifacts.
- Sequential constraints: any schema, auth, router, or shared service repair will be reviewed and tested serially; no parallel writers are authorized in standard light mode.
- Unknowns: authenticated browser proof, real provider execution, database production state, and deployment are external/runtime evidence not available from this local audit.

## Review rounds

1. Scope/spec coverage
2. Local runtime and dependency installation
3. Skill manifest, schema, and bridge contract
4. Backend API/auth/tenant boundaries
5. Model capability and provider routing
6. Persistence, idempotency, stale state, and legacy compatibility
7. Credit/token accounting and failure/retry behavior
8. Frontend states, accessibility, and Legacy isolation
9. Security, secrets, child-process, and supply-chain boundaries
10. Observability, release gates, documentation, and final impact closure

## Quality gates

- Focused Enhanced Vitest tests
- Focused Python compile, lock sync, bridge health, and package validator
- Targeted TypeScript diagnostics for changed Enhanced surfaces
- `git diff --check`
- Static scans for `.env` feature toggles, unsafe shell/path input, auth/tenant guards, and legacy projection changes
- Full workspace checks only as informative evidence because the dirty baseline contains unrelated failures

## Gap closure policy

- Fix safe in-scope correctness, security, contract, runtime, and verification gaps immediately.
- Defer only external live-provider/browser/deployment evidence or optional polish, with residual risk recorded.
- Do not alter Legacy behavior, existing media model selection semantics, or database data without an explicit migration requirement.

## Follow-up audit closure (2026-09-02)

- Completed the user's requested five-round follow-up audit plus two clean
  post-fix convergence rounds.
- Closed the visible Enhanced readiness-diagnostics gap and corrected the local
  ESM import that blocked `smartspec-web.service` startup.
- Reverified focused tests, local DB capability profile parity, service health,
  skill regressions, Python syntax, and diff integrity.
- Kept existing Legacy generation/render behavior and the raw provider skill
  adapter unchanged. Full workspace typecheck and skill-artifact cleanup remain
  separately documented baseline/release gates.
