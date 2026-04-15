# Feature 079 TDD Plan

Date: 2026-04-10
Feature: Autonomous Work Transformation Platform
Test baseline:

- Web app tests: `npm --workspace=@smartspec/web test`
- Web coverage: `npm --workspace=@smartspec/web run test:coverage`
- Optional Rust tests when needed: `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml`

## 1. Objective

Write tests first for the workpack layer so each implementation slice can land without destabilizing existing workflow, browser, monitoring, or desktop-host behavior.

## 2. Implementation principles

### 2.1 Preserve existing runtime truth

- Test: workpack execution plans preserve truthful runtime labels and do not collapse existing runtime types into one generic path.
- Test: workpack routing does not bypass existing policy or approval surfaces when browser or hybrid execution is selected.

### 2.2 Keep the workpack boundary explicit

- Test: shared contracts and router payloads expose workpack-specific fields without introducing Feature 080 role-agent ownership semantics.
- Test: workpack entities remain reusable execution units independent of persistent role ownership.

### 2.3 Default to exception-only human oversight

- Test: happy-path workpack routing does not request unnecessary manual approval.
- Test: low-confidence, policy-boundary, or drift conditions create explicit exception states instead of silent fallback.

### 2.4 Ship in slices that can be tested independently

- Test: each new shared contract validates independently.
- Test: each new server lifecycle service can be exercised without requiring full end-to-end UI setup.

### 2.5 Treat safety as data minimization plus effect containment

- Test: replay, fixture, and benchmark evidence carry explicit sensitivity, access-scope, retention, and de-identification metadata.
- Test: side-effecting steps cannot be retried, replayed, or re-routed without an explicit idempotency envelope.
- Test: incident controls can pause, quarantine, and safely resume active or scheduled work without widening autonomy.

## 3. Target end-state in code

- Test: shared workpack contracts round-trip through parser/validator logic.
- Test: workpack lifecycle services produce stable state transitions for draft, simulation, supervised, autonomous, exception, and benchmark flows.
- Test: control-plane surfaces render the expected workpack states and operator actions.

## 4. Proposed architecture

### 4.1 Shared product model

- Test: workpack-related schemas accept valid lifecycle payloads and reject malformed or incomplete ones.
- Test: lifecycle enums, autonomy modes, and exception categories remain backward-compatible with current consumers.
- Test: replay-grade `workpack_run` ledger payloads can represent planned steps, actual steps, approvals, side effects, artifact references, and connector response summaries.
- Test: ledger, fixture, and benchmark payloads preserve sensitivity class, access scope, retention tier, and de-identification state through validation.

### 4.2 Workpack compilation model

- Test: normalized playbook input compiles into bounded execution plans with runtime preference, fallback, policy, and replay requirements.
- Test: compiler output remains deterministic for the same normalized input.
- Test: side-effecting steps include idempotency or effect-journal metadata and fail closed when a safe retry envelope is unavailable.
- Test: replay mode is explicit so inspection-only replay cannot be confused with live re-execution.

### 4.3 Lifecycle orchestration services

- Test: intake, compiler, simulation, exception, metrics, and benchmark services each return stable shapes and error behavior.
- Test: routers remain thin and delegate orchestration logic to services.
- Test: a dedicated workpack lifecycle router can coexist cleanly with existing workflow-native routes.

### 4.4 Integration-first UI strategy

- Test: new workpack surfaces can load and display data from existing control-plane patterns.
- Test: workpack views link into existing workflow, browser, monitoring, or desktop entrypoints correctly.

## 5. Implementation sections

## 5.1 Section A: Shared contracts and persistence design

- Test: each new shared workpack schema validates expected payloads.
- Test: invalid lifecycle transitions or malformed exception/promotion payloads are rejected.
- Test: any new shared helpers preserve compatibility with existing automation and orchestration contract tests.
- Test: dedicated workpack persistence records can reference existing workflow/template/skill assets without duplicating runtime internals.
- Test: sensitive ledger fields are redacted or reference-only where required, and retention metadata is stored with replay, fixture, and benchmark evidence.

## 5.2 Section B: Case intake, normalization, and playbook drafting

- Test: intake service accepts structured source metadata and returns traceable playbook/workpack drafts.
- Test: confidence annotations are present for inferred fields.
- Test: low-confidence extraction triggers clarification-needed state instead of falsely complete output.
- Test: local-file-aware intake paths preserve source provenance and do not require upload-only behavior.

## 5.3 Section C: Workpack compiler and execution router

- Test: compiler chooses among workflow, skill, browser, hybrid, agency, desktop-local, and worker-fabric paths using explicit rules.
- Test: execution plans include autonomy mode, risk tier, connector requirements, replay requirements, and step-up boundaries.
- Test: compiler preserves truthful locality/trust labels.
- Test: approval batching occurs at consequence boundaries rather than every small step.
- Test: external-write steps carry idempotency keys or explicit single-attempt constraints before retry or fallback is allowed.
- Test: unsupported idempotency blocks autonomous routing for side-effecting steps.

## 5.4 Section D: Simulation, replay, and exception system

- Test: fixture-backed simulation produces expected success/failure status and diff output.
- Test: replay compares expected vs actual steps, outputs, approvals, and connector responses.
- Test: drift, schema mismatch, permission issues, and browser-layout instability are classified into explicit exception categories.
- Test: exception items include workpack, run, risk, reason code, and remediation pointers.
- Test: normalized run ledgers preserve enough side-effect and artifact detail for deterministic replay and operator debugging.
- Test: replay remains inspection-only and does not re-emit live external side effects.
- Test: redaction, access-scope, and retention policy are enforced before simulation or replay evidence is persisted or returned.

## 5.5 Section E: Connector mapping and boundary control

- Test: connector mappings validate required canonical workpack fields.
- Test: live schema validation surfaces mismatches before autonomous execution.
- Test: expired, missing, or over-broad connector scopes produce structured exception states.
- Test: side-effect classification is attached to connector mappings used by a workpack.

## 5.6 Section F: Learning loop, benchmark packs, and promotion logic

- Test: run outcomes can generate improvement proposals without mutating a live pack directly.
- Test: low-risk improvement proposals can be marked auto-applicable only when evidence conditions are met.
- Test: benchmark-pack publishing requires a stable source state.
- Test: promotion can be reversed safely when later evidence regresses.
- Test: trust-tainted outputs cannot be promoted into shared benchmark or autonomous surfaces without explicit evidence-backed clearance.
- Test: benchmark publishing defaults to tenant-local scope and blocks wider sharing until fixtures and outputs are de-identified.
- Test: benchmark lineage preserves the most restrictive inherited trust and sensitivity labels until explicit clearance is recorded.

## 5.7 Section G: Control-plane UI surfaces

- Test: Case Intake Studio renders draft output and clarification states.
- Test: Workpack Detail shows policy, connectors, fixtures, history, and promotion state.
- Test: Exception Inbox view renders grouped items with next-action affordances.
- Test: Replay Lab surfaces expected vs actual differences.
- Test: Connector Schema Studio renders field mapping, scope posture, and validation outcomes.
- Test: ROI dashboard widgets render metrics, intervention rate, and promotion readiness signals.

## 5.8 Section H: Telemetry, rollout controls, and feature gating

- Test: workpack events and snapshots flow into monitoring/metrics services with expected shape.
- Test: rollout flags correctly gate draft, supervised, and autonomous features.
- Test: promotion readiness signals reflect evidence state and exception history.
- Test: unknown or drifted states fail closed and do not silently promote.
- Test: trust-tainted outputs remain constrained until a promotion gate explicitly clears them.
- Test: incident controls pause or quarantine active runs, cancel queued or scheduled work, and freeze promotion when a kill-switch is triggered.
- Test: staged rollout eligibility is tenant- and cohort-based in Feature 079 and does not require Feature 080 role semantics.

## 6. Suggested file and module strategy

- Test: any new shared module is covered by co-located shared tests.
- Test: new server routers/services are covered by server-side unit or integration tests.
- Test: client modules are covered with existing React/Vitest patterns.
- Test: Rust changes, if any, are accompanied by focused cargo tests rather than broad runtime rewrites.

## 7. Rollout sequence

### Phase 1: Foundations

- Test: draft workpack creation works before any execution path is enabled.

### Phase 2: Safe execution path

- Test: simulated execution works before autonomous execution is allowed.
- Test: exception generation is reliable before autonomous rollout.

### Phase 3: Product surfaces and measurement

- Test: workpack operators can inspect outcomes, failures, and readiness without hidden state.

### Phase 4: Learning and benchmark promotion

- Test: learning proposals and benchmark promotion depend on evidence and remain reversible.

## 8. Risks and mitigations

### 8.1 Scope creep into Feature 080

- Test: workpack contracts and routes do not require persistent role-agent entities.

### 8.2 Runtime duplication

- Test: new workpack execution plans still route into existing runtime surfaces instead of a hidden custom executor.

### 8.3 Approval and policy inconsistency

- Test: workpack boundary decisions align with existing approval and trust vocabulary.

### 8.4 UI fragmentation

- Test: workpack entrypoints integrate into existing control-plane navigation and operator flows.

### 8.5 Test instability

- Test: each section can be validated with focused commands rather than one monolithic end-to-end dependency chain.

### 8.6 Data-governance drift

- Test: replay, fixture, and benchmark evidence cannot be stored or published without the required redaction, retention, and access metadata.

### 8.7 Duplicate external side effects

- Test: retries, replays, and fallbacks cannot duplicate external writes when idempotency support is absent or stale.

### 8.8 Incident containment gaps

- Test: active and scheduled work can be stopped safely without leaving rollout state inconsistent.

## 9. Testing strategy

- Test stubs should be written alongside the relevant shared, server, and client modules before implementation begins.
- Server tests should use existing Vitest patterns for routers/services and controlled dependency mocking.
- Client tests should follow current React/Vitest patterns with `jsdom` where necessary.
- Cargo tests should only be added for genuinely changed Rust behavior.

## 10. Definition of done

- Test: all new shared contracts, lifecycle services, and UI surfaces have matching targeted coverage.
- Test: existing workflow, browser, monitoring, and desktop-host flows remain green after Feature 079 additions.
- Test: a representative low-risk workpack can move from draft to simulation to supervised execution without undefined behavior.
- Test: the same representative workpack respects data-minimization, idempotency, and incident-response controls under failure conditions.
