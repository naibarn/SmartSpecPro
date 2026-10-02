# Section 01 — Authority and Migration Baseline

## Outcome

Normalize current Spec 215 owner references and define safe cutover boundaries before adding runtime behavior. Correct R4's false statement that Spec 251 was not found. Spec 251's creator DAG/profile is input to 215; 215 continues to own workflow compile/run semantics and Feature 195 owns physical jobs.

## Scope

- Map existing `workflowStudio` code and persisted definition/run tables to Specs 214/215 and Feature 195/186.
- Reconcile Specs 207, 220, 225, 226, 229, and 251 without copying their authority.
- Correct only the stale §75 Spec 251 discovery/ownership sentence and any directly contradictory 215 language.
- Inventory all active callers of `workflowStudioJobExecutor.ts` before changing or retiring it. Do not delete it in this section.
- Preserve old persisted definitions/runs until read-only data inventory and a tested additive migration disposition exist.
- Explicitly exclude prohibited `/workflows`, legacy custom engine, workpacks, Agency, and OpenSandbox paths.

## Files / surfaces

- `specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md`
- `specs/feature/251-creator-workspace-media-localization/spec.md`
- `apps/web/server/services/workflowStudioJobExecutor.ts` callers/registration only
- `apps/web/server/routers/workflowStudio.ts`

## TDD / verification

- Add a focused cross-spec consistency assertion if a maintained spec-link checker exists; otherwise verify exact references with targeted `rg` and a bounded read.
- Prove no canonical 215 entry point imports the retired workflow engine.
- Record that production data existence, rollout state, and compatibility counts are unverified locally.

## Acceptance

- Spec 251 owner exists and 215's creator amendment names it accurately.
- Canonical 215 path does not call legacy `/workflows` or a parallel execution engine.
- Compatibility code is not removed without a read-only dependency/runtime audit and disposition.
- Decision and residual external gates are recorded in `orchestra/decisions.md`.

## Implementation Record

- Updated Spec 215 §75 to identify the existing Spec 251 draft path and keep registry/owner approval as an explicit gate.
- Source audit: `workflowStudioJobExecutor.ts` has only self references and its unit test in the searched canonical server/client surfaces; the canonical router/runtime does not import it. No deletion was made.
- Canonical Spec 215 entry points remain `workflowStudio` and `workflowStudioRuntime`; no retired `/workflows` import was found in those paths.
- Verification: targeted `rg` inventory and `git diff --check` pass. No test was run for this documentation/source-inventory section.
- State: complete locally; deployed data inventory and Spec 251 registry/owner approval remain external gates.

## UI/UX Contract

### Target User / JTBD
N/A — this section implements backend workflow runtime behavior; product experience remains with Spec 209 and existing client owners.

### Surface Inventory
N/A — no browser-visible surface changes are planned. Existing APIs expose runtime state.

### Component Map
N/A — no frontend component is added or changed.

### State Matrix
N/A — runtime state is persisted and exposed through existing API contracts; visual rendering is outside this implementation scope.

### Responsive Matrix
N/A — no responsive layout changes.

### Accessibility Acceptance
N/A — no user interface changes.

### Copy Contract
N/A — no user-facing copy changes.

### Browser Evidence Required
N/A — no browser-visible behavior is changed; API and runtime tests provide the relevant local evidence.
