# Section 03: Workpack Compiler and Routing

## Purpose

This section defines how a draft workpack becomes a deterministic, policy-aware execution plan that routes into SmartAIHub's existing runtime surfaces instead of inventing a new executor.

The compiler must preserve the workpack abstraction from the intake and playbook stages while resolving each step into the smallest safe runtime path available. The router must remain thin, fail closed, and keep approval boundaries tied to real consequence boundaries rather than arbitrary step counts.

## Dependencies

This section depends on the shared contracts and persistence model from Section 01 and the intake/playbook outputs from Section 02.

Key upstream inputs:

- canonical `workpack`, `workpack_version`, `workpack_run`, and related lifecycle contracts
- normalized playbook fields, source traceability, and confidence annotations
- existing runtime vocabulary in `apps/web/shared/automation/contracts.ts`
- hybrid stage vocabulary in `apps/web/shared/orchestration/hybridOrchestration.ts`
- browser approval and trust vocabulary in `apps/web/shared/browserPolicy.ts` and `apps/web/shared/liveBrowser.ts`
- workflow conversion and publish flows in `apps/web/server/routers/workflow.ts`
- browser-heavy automation surfaces in `apps/web/server/routers/automationCopilot.ts`

The compiler should treat these existing surfaces as authoritative. It should not duplicate their semantics in a parallel routing system.

## Core Outcome

The implementation should produce a resolved execution bundle that includes:

- the selected runtime path for each workpack step
- trust and locality labels that stay truthful through execution
- connector and policy requirements
- replay and simulation requirements
- explicit approval checkpoints at consequence boundaries
- fallback behavior if the preferred runtime path is unavailable

The resulting plan must be deterministic for the same normalized workpack input and stable policy context.

## Compiler Responsibilities

### 1. Resolve the workpack into bounded execution steps

The compiler should translate normalized playbook/workpack input into a step list that can be executed by existing surfaces such as workflow, browser automation, hybrid orchestration, agency, desktop-local execution, or worker-fabric execution.

Each step should carry:

- the intended action
- the preferred runtime path
- allowed fallback paths
- required connector access
- expected side-effect class
- whether the step needs replay coverage
- whether the step crosses a human approval boundary

The compiler should remain deterministic and should not introduce freeform agent planning at this stage.

### 2. Select the smallest safe runtime path

Path selection should prefer the narrowest runtime that can safely complete the step.

Route preference should generally follow this order when the step can be satisfied safely:

1. existing workflow-native conversion or publish flows
2. reusable skill execution
3. browser automation
4. hybrid orchestration
5. agency execution
6. desktop-local or worker-fabric execution when locality, file access, or trust require it

The exact choice should depend on the workpack's step semantics, trust posture, locality requirements, connector mapping, and policy envelope. The compiler must preserve the reason for the choice so the operator can inspect it later.

### 3. Preserve truthful locality and trust labels

The compiler must not collapse local, remote, browser, or hybrid execution into one generic label.

If a step requires:

- local file access
- desktop-host context
- a browser session with live takeover potential
- remote workflow execution
- worker-fabric scheduling

then that locality must remain visible in the resolved plan and later in the run ledger.

The routing layer should rely on the current trust vocabulary rather than adding a second trust system.

### 4. Attach approval and step-up boundaries

Approvals should be grouped around consequence boundaries, not every micro-step.

The compiler should identify:

- irreversible actions
- policy-sensitive steps
- connector scope expansions
- ambiguity or low-confidence branches
- steps that can safely continue without human involvement

For browser-heavy or hybrid steps, the compiler should reuse browser policy and live-browser approval semantics instead of inventing new approval rules.

### 5. Generate replay and simulation requirements

Every workpack plan should declare what needs to be simulated or replayed before autonomous promotion.

At minimum, the compiled plan should carry:

- fixture requirements
- masked or synthetic input requirements where sensitive data is present
- expected vs actual comparison targets
- required trace detail for later replay
- failure-class expectations for drift, schema mismatch, and permission gaps

This section should not implement simulation itself, but it must provide the data contract that downstream simulation and replay services will consume.

### 6. Resolve connector and policy constraints

The compiler should surface connector requirements and policy constraints alongside execution paths rather than hiding them in service internals.

It should emit clear metadata for:

- required connector families
- read vs write side-effect class
- scope-sensitive actions
- approval-required operations
- fallback behavior when connector trust is insufficient

If a connector mapping is missing, stale, or too broad, the compiler should fail closed or route to an exception state instead of silently widening access.

### 7. Attach idempotency and external-effect controls

Side-effecting workpack steps need more than a side-effect class. They also need explicit protection against duplicate execution.

For any step that can write outside the platform, the compiled plan should capture:

- whether the target runtime or connector supports caller-supplied idempotency
- the source of the effect key or dedup token for the attempted action
- whether retries are safe, single-attempt only, or blocked
- whether fallback is allowed without widening the external effect envelope
- whether replay is inspection-only, dry-run only, or requires a fresh approval and fresh run context for live re-execution

If a connector or runtime cannot preserve a safe idempotency envelope for a side-effecting step, the compiler should fail closed for autonomous routing and either require a supervised single-attempt path or open an exception.

## Routing Responsibilities

### 1. Keep routers thin

The server router layer should only coordinate request validation, service calls, and response shaping.

Routing code should not contain embedded business logic for step selection or fallback policy. That logic belongs in a dedicated workpack compiler/router service.

Recommended split:

- `workflow.ts` continues to own workflow-native behavior and exposes compilation hooks for workflow-originated assets
- a dedicated workpack lifecycle router handles draft compilation, plan inspection, run initiation, simulation requests, exception retrieval, and promotion actions
- browser-heavy fallback execution remains delegated to existing browser automation surfaces

### 2. Route by workpack state

Routing should respect the workpack lifecycle state.

Suggested state-driven flow:

- draft or intake-complete workpacks compile into a resolved execution bundle
- simulation-ready workpacks route to simulation and replay services before execution
- supervised workpacks may execute with explicit step-up checkpoints
- autonomous workpacks may execute only when replay and policy evidence are present
- exception states route to the exception inbox and remediation flow

### 3. Preserve fallback behavior explicitly

If the preferred runtime path is unavailable, the router may fall back only to a predeclared safe alternative.

Fallback rules should be explicit and inspectable, for example:

- workflow step can degrade to a workflow-native fallback only
- browser steps can degrade to a browser or hybrid path only when policy permits
- desktop-local steps can degrade to managed worker-fabric only when locality and trust still hold
- unknown paths should fail closed and open an exception

No implicit "best effort" fallback should be allowed for risky workpack steps.

### 4. Keep approvals narrow

The router should aggregate approvals only where the execution plan crosses a real consequence boundary.

Examples of consequence boundaries:

- external write actions
- destructive or irreversible actions
- policy or permission expansion
- data export to a new trust boundary
- moving from masked simulation to live execution

Routine read-only or deterministic preparation steps should not trigger unnecessary approval prompts.

## Service and Module Shape

Implement the compiler and router behavior as feature-specific server services, not as a single oversized router.

Likely module responsibilities:

- compiler service: resolve normalized workpack input into runtime plans
- route service: select the safest runtime path and fallback chain
- policy adapter: translate workpack policy into existing browser, workflow, and hybrid vocabulary
- approval adapter: map consequence boundaries to current approval flows
- run-plan serializer: produce the stable execution bundle consumed by later services

The plan serializer should be the only place that assembles the final bundle shape used downstream.

## Data Shape Expectations

The compiled execution plan should be able to represent:

- planned steps
- runtime preference and fallback chain
- workpack autonomy mode
- step-up boundary markers
- connector requirements
- locality/trust labels
- replay requirements
- idempotency posture and effect-journal metadata for side-effecting steps
- simulation fixture references
- evidence requirements for promotion

It should also preserve enough metadata for later run ledger entries to explain why a step was routed the way it was.

## TDD Expectations

Write tests before implementation for the compiler and router behavior.

Minimum test coverage for this section:

- compiler output is deterministic for the same normalized workpack input
- workpack steps select the correct runtime path among workflow, skill, browser, hybrid, agency, desktop-local, and worker-fabric options
- trusted locality labels are preserved and not collapsed into a generic execution type
- approval checkpoints appear only at consequence boundaries
- fallback routing uses only declared safe alternatives
- unknown or unsupported runtime requests fail closed
- browser-heavy and hybrid routes reuse existing policy and approval vocabulary
- side-effecting steps encode idempotency posture, retry limits, and replay mode explicitly
- autonomous routing is blocked when a side-effecting step lacks a safe dedup or single-attempt envelope
- router handlers remain thin and delegate to the compiler/service layer

Testing should live alongside the touched server and shared modules, using the repo's existing Vitest patterns. Prefer focused unit tests for routing rules and contract tests for the compiled plan shape before any UI work depends on the new bundle.

## Acceptance Criteria

This section is complete when:

- a normalized workpack can be compiled into a deterministic execution bundle
- the bundle names a real runtime path from the current platform surfaces
- locality, trust, policy, and connector constraints remain visible in the compiled plan
- approvals are triggered only at consequence boundaries
- fallback behavior is explicit and fail-closed
- side-effecting steps cannot be retried, replayed, or rerouted in a way that risks duplicate external writes
- downstream simulation, replay, exception, and promotion services can consume the compiled plan without reinterpreting workpack intent
