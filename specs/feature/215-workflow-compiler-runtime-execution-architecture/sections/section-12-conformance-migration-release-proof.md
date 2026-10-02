# Section 12 — Conformance, Migration, and Release Proof

## Outcome

Close the local acceptance matrix for every Spec 215 clause, while retaining production and cross-owner gates as explicit non-local evidence requirements.

## Scope

- Compile and execute contract cases for all 16 canonical Spec 214 types and each control-flow/policy construct.
- Align Spec 212 R20 corpus count, identity and pinned hashes without claiming all prompts executed.
- Verify new canonical definitions reject all 112 removed legacy IDs while preserving explicit compatibility reads for existing data until disposition.
- Test rolling protocol/schema compatibility, upgrade, rollback, active-run recovery, backup/restore and data-retention procedures.
- Build a source-backed inventory of all asynchronous business actions and prove each maps to `worker_jobs` + outbox or an explicitly owner-gated unavailable path.
- Add fail-closed release gates for live Spec 220/229 authorization/retrieval, 225/226 attention actions, 251 creator capability bindings, provider accounts, deployed migrations, target runtime and DR.
- Run at least ten numbered evidence-backed review rounds. Re-run any gate made stale by a finding fix.

## TDD / verification

- Integrated focused web suites for contracts/compiler, builder/canonical conversion, scheduler/job executor, runtime, router, control-plane handoff and coverage corpus.
- Python Feature 195 focused tests only if shared envelope, status or lease behavior changes.
- Static retired-system scan and inventory/section/UI-contract validators.
- No root TypeScript typecheck, provider invocation, production migration, deployment, secret inspection, or destructive compatibility deletion.

## Acceptance

- Every normative Spec 215 section/amendment is implemented locally or mapped to an owner-gated fail-closed release condition.
- All required local checks pass after the final code/spec edit; ten review rounds are recorded, and two latest rounds are clean after the final fix.
- No claim of production completeness without target DB, provider, deployment, migration, and DR evidence.

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
