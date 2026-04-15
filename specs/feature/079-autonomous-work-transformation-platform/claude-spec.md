# Feature 079 Synthesized Spec

Date: 2026-04-10
Source files:

- `specs/feature/079-autonomous-work-transformation-platform/spec.md`
- `specs/feature/079-autonomous-work-transformation-platform/claude-research.md`
- `specs/feature/079-autonomous-work-transformation-platform/claude-interview.md`

## 1. Build target

Implement the first production-grade workpack layer for SmartAIHub.

The workpack layer must transform raw business process material into reusable, policy-governed, simulation-backed automation units that can execute through the platform's existing workflow, browser, hybrid, agency, and desktop-host substrates.

Feature 079 must become the canonical reusable automation layer that future persistent role agents from Feature 080 can own, without forcing Feature 079 itself to become the persistent team operating model.

## 2. Product outcome

The user should be able to:

1. submit raw process material such as SOPs, case studies, screenshots, threads, exports, and local files
2. receive a structured playbook plus a draft workpack
3. validate that workpack through simulation, dry-run, or replay
4. execute the workpack in draft, supervised, or autonomous mode
5. resolve failures through one structured exception path
6. learn from runs and promote stable packs into reusable benchmark assets

## 3. Locked product decisions

- `Workpack` is the canonical product unit.
- `Case -> playbook -> workpack -> run -> benchmark` is the lifecycle.
- Human involvement must be exception-first, not step-by-step.
- Unknown, low-confidence, or drifted states fail closed.
- No workpack reaches autonomous execution without simulation/replay evidence.
- The feature must reuse existing runtime paths instead of inventing a second execution stack.
- Persistent role ownership belongs to Feature 080, but Feature 079 must expose workpacks in a way that Feature 080 can safely own later.

## 4. Core implementation scope

### 4.1 Intake and normalization

Build a case intake layer that can accept multi-source process material and normalize it into:

- objective
- actors
- systems
- triggers
- recurring steps
- outputs
- failure modes
- policy constraints
- data sensitivity
- connector requirements
- evaluation criteria

The output must be traceable back to source material and preserve confidence levels for extracted fields.

### 4.2 Playbook and workpack authoring

Create a product flow that turns normalized process information into:

- a structured playbook
- a versioned workpack
- runtime preferences and fallback paths
- policy profile
- connector mapping needs
- evaluation fixtures

### 4.3 Execution routing

Extend existing execution routing so a workpack can compile into and launch through:

- direct skill execution
- workflow
- browser automation
- hybrid orchestration
- agency swarm
- desktop-local execution
- worker fabric

The router must preserve truthful run labels and batch approvals at the narrowest possible consequence boundary.

### 4.4 Simulation, replay, and promotion

Before autonomous rollout, every workpack must support:

- fixture-based dry runs
- replay against prior traces
- masked or synthetic test inputs
- explicit surfacing of drift, permission gaps, schema mismatch, and page/layout changes

Promotion decisions must be evidence-backed and reversible.

### 4.5 Exceptions and human step-up

Introduce a unified exception model for blocked, ambiguous, or policy-sensitive steps. Each exception should bind:

- workpack
- run
- reason code
- risk class
- context
- suggested next action
- replay/remediation pointer

### 4.6 Learning and benchmark publishing

Use existing skill improvement and compatibility infrastructure to support:

- improvement proposals from successful and failed workpack runs
- controlled application of low-risk improvements
- promotion of stable workpacks into benchmark packs

### 4.7 Outcome measurement

Add workpack-level telemetry for:

- completion rate
- intervention rate
- exception rate
- throughput
- cost per completed item
- estimated time saved
- promotion velocity

## 5. Current-codebase fit requirements

The implementation must align with these existing realities:

- `workflow.ts` already provides workflow analysis, conversion, and template publishing
- `automationCopilot.ts` already provides a browser-heavy execution path
- `hybridOrchestration.ts` already defines a stage vocabulary that should be reused
- `skillStudioService.ts` and `skillUpgradeApplier.ts` already provide a learning substrate
- `monitoring.ts` and `monitoringService.ts` already provide run/snapshot/alert telemetry
- `local_file_service.rs` and desktop worker-fabric types already provide local-first trust-aware intake and execution support

## 6. Explicit implementation constraints

- Do not create a second chat product.
- Do not replace existing workflow, browser, agency, or desktop surfaces.
- Do not bypass existing trust, approval, or audit systems.
- Do not silently widen connector scopes or outbound permissions.
- Do not blur Feature 079 and Feature 080 responsibilities.
- Do not require a big bang rollout across every domain in the first release.

## 7. Recommended release order

1. Shared contracts and data model for workpacks, runs, exceptions, simulations, and benchmarks
2. Server orchestration for intake, compilation, simulation, and execution routing
3. Exception + replay + ROI surfaces
4. Learning loop integration and benchmark publishing
5. Domain-pack expansion and deeper desktop-host/local-first support where needed

## 8. Acceptance signals

The first implementation slice should be considered successful when:

- a user can create a workpack draft from raw process material
- the system can simulate the workpack before autonomous execution
- the system can run at least selected low-risk workpacks with exception-only human intervention
- the system can replay failures and route them to one structured inbox
- stable workpacks can be promoted into reusable benchmark packs
- existing product surfaces remain compatible

## 9. Open implementation questions to carry into planning

- Should workpacks be first-class persisted entities immediately, or initially be compiled from existing workflow/template records plus metadata?
- Which connector families are mandatory in the first rollout?
- Which domain pack set is smallest but sufficient for an impactful first release?
- Where should the compiler boundary sit between workpack abstraction and current runtime intents?
- Which telemetry events are required for promotion and ROI decisions in v1?
