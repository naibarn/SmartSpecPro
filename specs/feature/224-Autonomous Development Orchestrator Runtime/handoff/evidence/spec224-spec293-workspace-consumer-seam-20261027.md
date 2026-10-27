# SPEC-224 / SPEC-293 Workspace Consumer Seam Recheck — 2026-10-27

- Canonical source SHA: `486339f977c96c351b08f3d0c51753d1723b27da`
- Result: consumer seam verified in source and focused tests; no SPEC-224 execution authority or state-machine changes made.

## Contract observed

- SPEC-224 provides its authorized source `workspace_ref`, job/run identity and attempt to the Runner's existing candidate path.
- `apps/runner-app/src/spec224_candidate.rs` resolves the registered source workspace, creates or reattaches the protected candidate using existing job/attempt identity, and registers that candidate as a run workspace in the SPEC-293 registry.
- `apps/runner-app/src/workspace_registry.rs` persists run workspace ID, run ID, attempt, source workspace ID, optional project identity and lifecycle. The Task Control read model in `apps/web/server/routers/runnerNodes.ts` bounds and validates workspace/run facts against authorized source workspaces; it emits no local filesystem path.
- Protected dispatch, settlement, Final Verify and DevelopmentRun state transitions remain under SPEC-224 authority and were not modified for this workspace acceptance.

## Verification

- Native Windows workflow `40446187471` at this exact source SHA passed Runner tests, including concurrent conflicting candidate-apply serialization and isolated run workspace registry tests. Windows build/package artifact details are recorded in the SPEC-293 Windows acceptance evidence.
- SPEC-293 Task Control/workspace projection tests passed in the recorded 4-file, 38-test Vitest run at source `805d9b125ff86fd1d8043019bbf446e79e0ac4bb`.
- No authenticated live Windows Runner or browser session was available. This is a code/contract seam verification only; it does not claim a live DevelopmentRun or installed Runner acceptance.
