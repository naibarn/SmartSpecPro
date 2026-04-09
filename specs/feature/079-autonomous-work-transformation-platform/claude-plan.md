# Feature 079 Implementation Plan

Date: 2026-04-10
Feature: Autonomous Work Transformation Platform
Planning scope: implementation blueprint for the first production-grade workpack layer

## 1. Objective

Implement a reusable workpack layer that turns raw business-process material into policy-governed, simulation-backed automation units which execute through SmartAIHub's existing runtime surfaces.

The workpack layer should become the canonical automation abstraction for routine operational work. It must sit above today's workflow, browser, hybrid, agency, monitoring, and desktop-host primitives without replacing them. The main implementation job is to add the missing product and orchestration layer that makes those primitives reusable, measurable, and promotable.

## 2. Implementation principles

### 2.1 Preserve existing runtime truth

Feature 079 should not invent a second execution stack. A workpack must compile into current runtime paths such as workflow, browser automation, hybrid orchestration, agency execution, or managed desktop/worker execution. Existing truth about locality, trust, approval, and audit should remain authoritative.

### 2.2 Keep the workpack boundary explicit

This feature owns the reusable automation unit and its lifecycle:

- case intake
- playbook normalization
- workpack authoring
- simulation and replay
- execution routing
- exception handling
- learning and benchmark promotion

It should not absorb the persistent AI team operating model from Feature 080.

### 2.3 Default to exception-only human oversight

The implementation should optimize for safe autonomy. The system should ask for human input only when confidence, policy, or consequence requires it. This rule should shape routing, UI design, exception handling, and promotion policy.

### 2.4 Ship in slices that can be tested independently

This feature touches shared contracts, server orchestration, UI surfaces, telemetry, and possibly desktop-host support. The implementation should therefore be decomposed into testable slices with narrow acceptance criteria and minimal hidden coupling.

### 2.5 Treat safety as data minimization plus effect containment

Safe autonomy here is not only a policy or approval problem. The implementation also needs:

- explicit data-governance rules for replay ledgers, fixtures, and benchmark evidence
- idempotency and external-effect controls so retries, replays, and fallbacks cannot duplicate side effects
- incident-response controls that can pause, quarantine, or safely resume in-flight and scheduled work

## 3. Target end-state in code

At the end of the first serious implementation wave, the repo should have:

- a shared workpack contract model and canonical lifecycle vocabulary
- server services for intake, compilation, execution routing, simulation, exceptions, and promotion
- UI surfaces for intake, workpack detail, replay/exception handling, and ROI visibility
- integrations into workflow conversion, browser policy, hybrid orchestration, monitoring, skill improvement, and desktop-host trust flows
- tests that validate contracts, server orchestration, UI behavior, and promotion gating

## 4. Proposed architecture

### 4.1 Shared product model

Add a new shared contract layer in `apps/web/shared/` for workpack concepts. This should define the canonical TypeScript and zod vocabulary for:

- `case_source`
- `playbook`
- `workpack`
- `workpack_version`
- `workpack_run`
- `simulation_run`
- `workpack_exception`
- `connector_map`
- `benchmark_pack`
- `metric_snapshot`

This shared layer should also define:

- workpack lifecycle states
- autonomy modes
- promotion states
- simulation result status
- exception reason categories
- workpack execution plan shape

These contracts are the foundation for safe routing, UI rendering, API payloads, and later Feature 080 role ownership.

`workpack_run` should be treated as a replay-grade ledger, not only a status record. The shared model should leave room for:

- planned steps
- actual steps
- side-effect classification
- approval checkpoints
- artifact references
- connector response summaries

The same shared layer should also define storage-governance metadata for ledger and evidence payloads:

- artifact sensitivity class
- access scope
- retention tier or TTL policy
- redaction requirements
- fixture de-identification state

### 4.2 Workpack compilation model

Introduce a server-side workpack compilation/orchestration service. This service should transform normalized intake output into a resolved execution bundle that references existing runtime paths rather than re-encoding all behavior from scratch.

The compiler should be responsible for:

- mapping workpack steps to current runtime intents
- selecting runtime preference and fallback
- attaching policy and connector requirements
- assigning idempotency and effect-journal requirements for side-effecting steps
- generating replay and simulation requirements
- declaring which replay modes are inspection-only versus re-execution-capable under fresh approval
- resolving skill, workflow, browser-pack, hybrid, or desktop-host dependencies

The compiler should emit a normalized plan that later services can simulate, execute, or review.

### 4.3 Lifecycle orchestration services

Implement feature-specific server services rather than overloading a single router. The expected service split is:

- intake and normalization service
- playbook/workpack authoring service
- workpack compiler/router service
- simulation and replay service
- exception aggregation service
- metrics and promotion service
- benchmark publishing service

Routers should stay relatively thin and call into these services.

The preferred route split is:

- keep `workflow.ts` responsible for workflow-native behavior plus workpack compilation hooks that originate from workflow assets
- add a dedicated workpack lifecycle router for draft creation, detail, simulation, run, exception, benchmark, and promotion actions
- add a companion insights surface only if workpack ROI and readiness queries become too large for the lifecycle router

### 4.4 Integration-first UI strategy

Feature 079 requires new product surfaces, but they should be built as part of the existing control plane rather than as disconnected feature islands. UI work should therefore plug into current navigation, monitoring, workflow, and desktop entrypoints while keeping the workpack mental model visible and consistent.

## 5. Implementation sections

## 5.1 Section A: Shared contracts and persistence design

Create the shared contract model and persistence plan first. This section should:

- add workpack-related shared types and zod schemas
- define lifecycle enums and approval/promotion vocabulary
- define data-governance metadata for replay, fixture, and benchmark evidence
- align naming with existing automation, hybrid orchestration, and browser policy models
- identify where new database entities are needed versus where composition over existing workflow/template records is sufficient

The persistence decision for the first implementation should be:

- create dedicated persistence for `workpack`, `workpack_version`, `workpack_run`, `simulation_run`, `workpack_exception`, `benchmark_pack`, and metrics/projection records
- reference existing workflow, template, skill, browser-pack, or connector assets from those records rather than duplicating their internal runtime structures
- keep `connector_map` details and volatile compiler metadata version-scoped and JSON-backed where schema churn is still expected
- keep replay, fixture, and benchmark evidence under explicit retention, redaction, and access-scope policy instead of unbounded history

This section also needs a compatibility rule for Feature 080:

- workpacks must be addressable as reusable execution units by future role agents

## 5.2 Section B: Case intake, normalization, and playbook drafting

Implement the intake path that accepts raw process sources and produces structured playbook plus workpack drafts.

This should include:

- request and response contracts for multi-source intake
- source traceability model
- extraction confidence model
- integration with local file intelligence when desktop-host context is available
- targeted clarification path for low-confidence fields

The output of this section should not directly execute work. It should produce normalized, inspectable artifacts that the user and later services can refine, simulate, or promote.

This section should also define how first-wave domain packs are represented so the library can suggest playbook/workpack starting points for operational roles such as finance ops, HR ops, support, sales ops, procurement, and executive support.

## 5.3 Section C: Workpack compiler and execution router

Extend the runtime planner and automation contracts so workpacks resolve into bounded execution plans.

This work should:

- add workpack-aware execution intent modeling
- define how a workpack chooses among workflow, skill, browser, hybrid, agency, desktop-local, and worker-fabric paths
- preserve truthful locality and trust labels
- attach step-up boundaries, runtime fallback, replay requirements, and connector requirements
- attach idempotency requirements, effect-journal metadata, and retry/fallback limits for side-effecting steps
- keep approvals narrow and consequence-bound

This section must be careful not to become a freeform agent planner. The router should remain deterministic at the workpack level and should delegate actual execution depth to the existing runtime surfaces.

## 5.4 Section D: Simulation, replay, and exception system

Add the safety layer that makes autonomous promotion credible.

This section should implement:

- fixture-backed simulation
- trace replay
- expected-vs-actual comparison structures
- drift classification
- schema and permission mismatch surfacing
- unified exception records with workpack and run context
- redacted ledger persistence and evidence-retention enforcement
- inspection-only replay behavior that never replays live external side effects by accident

Browser-heavy cases should reuse existing browser policy and live-browser vocabulary rather than inventing a new exception model. The system should classify whether a failure is:

- operational/transient
- connector/auth related
- policy-boundary related
- ambiguity/drift related

This classification is essential for deciding whether to retry, pause, downgrade autonomy, or request review.

This section should also persist the normalized execution ledger so replay can explain exactly which planned step diverged, what side effect was attempted, and what evidence exists for remediation.

## 5.5 Section E: Connector mapping and boundary control

Add a first-class connector schema mapping capability rather than hiding connector setup inside generic settings screens.

This section should implement:

- canonical workpack field mapping definitions
- live connector schema validation
- auth scope inspection and expiry surfacing
- side-effect classification for mapped operations
- structured exceptions for missing or over-broad permissions

This is a key autonomy boundary. Workpacks cannot safely automate business routines if connector mappings remain implicit, weakly typed, or under-explained.

## 5.6 Section F: Learning loop, benchmark packs, and promotion logic

Integrate workpack lifecycle outcomes with the existing skill improvement substrate. This section should:

- convert workpack run outcomes into improvement proposals
- route low-risk proposals into existing skill improvement mechanisms
- add benchmark-pack publishing rules
- keep benchmark sharing tenant-local by default unless de-identification and trust clearance succeed
- define evidence requirements for autonomous promotion
- add reversible promotion state so bad promotions can be rolled back safely

The key design rule is that learning should reduce future human interventions, not just polish prompts or generated text. Promotion logic must therefore consume replay, exception, and metrics data instead of model confidence alone.

This section must also enforce trust-taint rules so unverified or narrowly trusted workpack outputs are not silently promoted into shared benchmark or autonomous surfaces.

## 5.7 Section G: Control-plane UI surfaces

Implement the first wave of workpack-specific surfaces in the web control plane.

Recommended UI sequence:

1. Case Intake Studio
2. Workpack Detail
3. Exception Inbox view for workpacks
4. Replay Lab
5. Connector Schema Studio
6. Outcome / ROI dashboard slice
7. Playbook library and benchmark discovery

The UI should reuse existing layout, data-fetching, and monitoring patterns where possible. It should also provide links into existing workflow, browser, agency, or desktop surfaces rather than duplicating them.

This section should also define entrypoint behavior from:

- chat
- workflow gallery
- team/agency surfaces
- desktop-host / local-file contexts

## 5.8 Section H: Telemetry, rollout controls, and feature gating

Add the operational controls that make staged rollout possible. This section should:

- define workpack-level metrics and event capture
- extend monitoring and admin views with workpack-aware telemetry
- add tenant and rollout-cohort feature gates for staged rollout
- define release guardrails for supervised vs autonomous execution
- define incident-response, kill-switch, and safe-resume behavior for in-flight, queued, and scheduled work
- expose promotion readiness signals
- enforce trust-taint and promotion gates so draft, local-only, or unverified outputs cannot silently escape into trusted shared surfaces

This section should keep rollout conservative:

- first focus on low-risk, high-volume operational work
- fail closed on unknown or drifted states
- avoid broad connector grants and blanket approvals

## 6. Suggested file and module strategy

The exact file layout can evolve during implementation, but the work should likely cluster around these areas:

### Shared contracts

- `apps/web/shared/automation/contracts.ts`
- new shared workpack contract files under `apps/web/shared/`
- updates to browser skill and worker node vocabularies where needed

### Server services and routers

- new services under `apps/web/server/services/` for intake, compiler, simulation, exceptions, metrics, and benchmark logic
- router extensions in `apps/web/server/routers/workflow.ts`
- router extensions or companion routes for workpack lifecycle, replay, exceptions, and metrics
- integration points in `automationCopilot.ts`, monitoring services, and skill improvement services

### Client surfaces

- new pages and components under `apps/web/client/src/pages/` and `apps/web/client/src/components/`
- possible updates to navigation/menu and existing orchestration panels

### Desktop-host integration

- shared desktop-host contracts if local intake/replay support requires them
- targeted Rust changes only if workpack intake or replay needs new local-first capability exposure

## 7. Rollout sequence

### Phase 1: Foundations

- shared contracts
- server skeletons
- initial persistence strategy
- feature flags
- intake draft flow

Exit bar:

- a normalized playbook and draft workpack can be created from structured input

### Phase 2: Safe execution path

- compiler and execution router
- simulation/replay core
- unified exception model

Exit bar:

- a draft workpack can be simulated and launched through existing runtime paths

### Phase 3: Product surfaces and measurement

- workpack detail
- exception handling UI
- replay surface
- ROI and promotion telemetry

Exit bar:

- operators can understand what a workpack did, why it failed, and whether it is ready to mature

### Phase 4: Learning and benchmark promotion

- learning proposals
- benchmark publishing
- reversible promotion logic

Exit bar:

- stable low-risk workpacks can be promoted and reused

## 8. Risks and mitigations

### 8.1 Scope creep into Feature 080

Risk:
Workpack implementation starts absorbing persistent role ownership and always-on role management.

Mitigation:
Keep Feature 079 scoped to reusable automation units. Any recurring owner model should be expressed only as compatibility requirements, not implemented as part of this feature.

### 8.2 Runtime duplication

Risk:
Implementation creates a workpack-specific executor that bypasses workflow, browser, hybrid, agency, or desktop-host systems.

Mitigation:
Make the compiler output explicit runtime plans that bind back into existing surfaces and preserve current labels and policy enforcement.

### 8.3 Approval and policy inconsistency

Risk:
Workpack approvals diverge from existing browser and hybrid approval semantics.

Mitigation:
Normalize workpack policy around existing approval vocabulary and trust envelopes wherever possible.

### 8.4 UI fragmentation

Risk:
New pages become disconnected from the main operator workflow.

Mitigation:
Reuse the current control-plane navigation model and link workpack views into existing monitoring, workflow, and desktop entrypoints.

### 8.5 Test instability

Risk:
A large multi-surface feature becomes too broad to validate safely.

Mitigation:
Require section-by-section TDD coverage across shared contracts, server orchestration, and UI slices, with targeted Rust coverage only where desktop support changes.

### 8.6 Data-governance drift

Risk:
Replay ledgers, fixtures, or benchmark artifacts collect sensitive data without clear redaction, retention, or access rules.

Mitigation:
Define sensitivity, access-scope, retention-tier, and de-identification requirements in the shared contract and enforce them in ledger, replay, and benchmark services.

### 8.7 Duplicate external side effects

Risk:
Retries, fallbacks, reruns, or replay flows duplicate writes in external systems such as ticketing, CRM, email, or finance connectors.

Mitigation:
Require effect-journal and idempotency metadata for side-effecting steps and fail closed when a connector or runtime cannot preserve a safe retry envelope.

### 8.8 Incident containment gaps

Risk:
The system can block future rollout but cannot safely pause or contain already running or scheduled work after an incident.

Mitigation:
Add explicit kill-switch, quarantine, pending-approval revocation, trigger-cancellation, and safe-resume semantics to the rollout control layer.

## 9. Testing strategy

The implementation should follow the repo's current testing posture:

- `vitest` for shared, server, script, and client work in `apps/web`
- `jsdom` only where client React surfaces require it
- targeted route/service tests for orchestration and policy logic
- targeted component/state tests for workpack UI surfaces
- targeted cargo tests only if desktop-host or local-file Rust behavior changes

Testing should be introduced in this order:

1. shared contract and validation tests
2. service/router tests for lifecycle, routing, simulation, and exceptions
3. client tests for intake, detail, replay, and ROI surfaces
4. Rust tests only if desktop intake/replay support changes

## 10. Definition of done

Feature 079 should be considered implementation-complete for its first serious release when:

- raw process material can be converted into a structured playbook plus workpack draft
- a workpack can be simulated before autonomous execution
- a workpack can compile into current runtime surfaces without duplicating the runtime stack
- replay, fixture, and benchmark evidence obey explicit redaction, retention, and access-scope rules
- retries, reruns, and replay paths cannot silently duplicate side effects
- exception handling is unified and context-rich
- improvement and benchmark promotion flows are connected to real run outcomes
- workpack ROI and intervention telemetry are visible
- incident controls can safely pause, quarantine, and resume active or scheduled rollout
- current product surfaces continue to work without regression

This is enough to establish the workpack as the real automation unit of the platform and to safely support future persistent role ownership in Feature 080.
