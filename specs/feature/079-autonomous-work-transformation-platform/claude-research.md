# Feature 079 Research Notes

Date: 2026-04-10
Spec: `specs/feature/079-autonomous-work-transformation-platform/spec.md`
Research mode: codebase-only

## Research summary

Feature 079 fits the existing SmartAIHub architecture well, but it is not a thin UI add-on. The current codebase already has most of the execution substrates needed for the workpack model. The missing work is a cohesive product layer that binds intake, compilation, simulation, exception handling, learning, and promotion into one reusable automation object.

This repo is already strong in:

- workflow analysis and publish flows
- browser policy and live-browser handoff
- team and monitoring surfaces
- desktop trust, file intelligence, and worker-fabric controls
- skill creation and skill improvement loops

The main implementation challenge is not inventing a new runtime. It is introducing a canonical workpack abstraction that composes existing runtime paths without duplicating trust, policy, or monitoring models.

## Relevant architecture and implementation touchpoints

### 1. Existing work and automation surfaces

- `apps/web/server/routers/workflow.ts`
  - Already owns workflow analysis, template publishing, gallery, and workflow-to-skill conversion.
  - This is the strongest existing server entrypoint for compiling workpacks into reusable runtime artifacts.
- `apps/web/server/routers/automationCopilot.ts`
  - Already provides a browser-heavy automation surface backed by Python services, credit reservation, and browser policy gating.
  - Likely remains a bounded execution path inside the future workpack layer.
- `apps/web/shared/automation/contracts.ts`
  - Current intent model is limited to `browser_rpa`, `workflow`, `agency`, and `hybrid`.
  - Feature 079 will need either a new workpack-facing intent or a higher-level wrapper around these existing intent types.

### 2. Existing orchestration and autonomy primitives

- `apps/web/shared/orchestration/hybridOrchestration.ts`
  - Defines a usable shared stage model: `intake`, `explore`, `validate`, `approval`, `commit`.
  - Strong candidate as the normalized mixed-execution stage vocabulary for workpack runs that need both deterministic and adaptive steps.
- `apps/web/shared/browserSkills.ts`
  - Presets are still generic and small in scope.
  - Feature 079 will likely extend this file or add a parallel domain-pack catalog for work-specific browser automation.
- `apps/web/shared/workflowWorkerRuntimeNodeTypes.ts`
  - Worker node vocabulary is currently narrow.
  - Workpack implementation will likely need to expand worker node types or introduce a higher-level compiler step that maps workpack stages onto existing node families.

### 3. Skills and learning loop

- `apps/web/server/services/skillStudioService.ts`
  - Already launches create/improve skill workflows from briefs, specs, zip bundles, and references.
  - This can back workpack-generated skill derivation instead of a brand-new improvement engine.
- `apps/web/server/services/skillUpgradeApplier.ts`
  - Already tracks recommendations, snapshots, compatibility gates, and proposal vs direct apply strategies.
  - Good fit for post-run learning and controlled auto-improvement from workpack runs.

### 4. Monitoring, runs, and exceptions

- `apps/web/server/routers/monitoring.ts`
  - Existing tRPC surface for run events, snapshots, stuck checks, alerts, and notification views.
  - Workpack monitoring should build on this rather than creating a separate operational telemetry stack.
- `apps/web/server/services/monitoringService.ts`
  - Already records agent activity, captures snapshots, and detects stuck runs.
  - Useful substrate for workpack run history, exception clustering, and promotion heuristics.
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx`
  - Existing live monitor is run-centric rather than workpack-centric, but it proves the UI model and stream transport already exist.

### 5. Desktop host, trust, and local execution

- `apps/tauri-shell/src-tauri/src/local_file_service.rs`
  - Already provides governed local file search, preview, snippet, staging, and parser capability reporting.
  - Important for case intake studio, local-first SOP ingestion, and replay fixtures without forcing upload-first flows.
- `apps/tauri-shell/src-tauri/src/desktop_worker_fabric.rs`
  - Already models worker runtime types, execution identity, approval modes, and budget attribution.
  - This is a good trust and rollout substrate for autonomous workpacks that need managed desktop-local execution.

## Codebase conventions and constraints

### Product layering

The repo consistently prefers extending existing shared contracts and tRPC routers over creating parallel feature stacks. Feature 079 should follow that pattern:

- shared types in `apps/web/shared/*`
- server orchestration in `apps/web/server/routers/*` and `apps/web/server/services/*`
- UI surfaces in `apps/web/client/src/*`
- desktop/runtime trust flows in `apps/tauri-shell/src-tauri/*`

### Trust and safety posture

Safety-sensitive areas already lean toward explicit enums, policy envelopes, and fail-closed checks. Feature 079 should preserve that style:

- narrow enums and zod schemas for shared contracts
- reuse of browser policy / live-browser approval vocabulary
- explicit credit, policy, and tenant gating in server routers
- compatibility and trust snapshots for reusable assets

### Existing gap pattern

Several required Feature 079 concepts exist as adjacent but incomplete pieces:

- generic team blueprints, but not profession-specific operational packs
- skill improvement loop, but not workpack improvement loop
- run monitoring, but not workpack-level promotion telemetry
- workflow publish/convert flows, but not case-to-playbook-to-workpack lifecycle

The plan should therefore prioritize integration seams instead of rewriting these existing systems.

## Likely implementation touchpoints for Feature 079

The most likely first-wave touched areas are:

- `apps/web/shared/automation/contracts.ts`
- `apps/web/shared/browserSkills.ts`
- `apps/web/shared/workflowWorkerRuntimeNodeTypes.ts`
- `apps/web/shared/orchestration/*`
- `apps/web/server/routers/workflow.ts`
- `apps/web/server/routers/automationCopilot.ts`
- `apps/web/server/routers/monitoring.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/*` for new workpack orchestration, simulation, exception, and metrics logic
- `apps/web/client/src/pages/*` and `apps/web/client/src/components/*` for intake, workpack detail, replay, exception, and ROI surfaces
- `apps/tauri-shell/src-tauri/src/local_file_service.rs` or shared desktop-host contracts if intake/replay need stronger local-first support

## Key risks discovered in research

### 1. Workpack duplication risk

If Feature 079 creates a full parallel execution model rather than compiling into workflow, browser, hybrid, agency, and desktop-host paths, it will fight the current codebase instead of extending it.

### 2. Policy fragmentation risk

If workpack approvals invent a new approval vocabulary rather than reusing browser policy, hybrid stage gates, and existing trust classes, the product will become harder to explain and harder to govern.

### 3. Premature persistence risk

Feature 079 should stop at the reusable work unit. Persistent role ownership belongs in Feature 080. The plan should keep that boundary explicit so workpack implementation remains tractable.

### 4. UI sprawl risk

The spec asks for many surfaces. The implementation should converge these into a cohesive control-plane experience and avoid one-off dashboards that duplicate run monitor, workflow gallery, or admin monitoring behavior.

### 5. Testing surface risk

Feature 079 spans shared contracts, server routers, client surfaces, and possibly Rust desktop support. The implementation plan must separate these into testable slices or the rollout will become too broad for safe iteration.

## Testing baseline

### Primary web app test stack

- App package: `apps/web/package.json`
- Test runner: `vitest`
- Main test command: `npm --workspace=@smartspec/web test`
- Coverage command: `npm --workspace=@smartspec/web run test:coverage`
- DB integration example: `npm --workspace=@smartspec/web run test:db-integration`

### Web test configuration

- Config file: `apps/web/vitest.config.ts`
- Environment model:
  - `node` by default
  - `jsdom` for `client/src/**/*.test.tsx`
- Included test areas:
  - `drizzle/**/*.test.ts`
  - `server/**/*.test.ts`
  - `server/**/*.spec.ts`
  - `client/src/**/*.test.ts`
  - `client/src/**/*.test.tsx`
  - `client/src/**/*.spec.ts`
  - `shared/**/*.test.ts`
  - `scripts/**/*.test.ts`

### Existing test patterns

- Shared contracts and feature flags are commonly tested in `apps/web/shared/__tests__/*`
- Server routers and middleware are tested under `apps/web/server/**/*test.ts`
- Client hooks and libs are tested under `apps/web/client/src/**/*test.ts(x)`
- There are existing tests for desktop-host contracts and worker-runtime feature flags, which is useful for any new shared workpack contracts

### Desktop / Rust testing

- Desktop package: `apps/tauri-shell/package.json`
- Rust test command: `cargo test --manifest-path apps/tauri-shell/src-tauri/Cargo.toml`
- Existing Rust tests already cover local file service, package sync, device identity, runtime capabilities, worker runtime, and agency swarm runtime

### Testing implication for Feature 079

A safe implementation plan should define targeted tests in these categories:

- shared contract and compiler tests
- server service / router tests for workpack lifecycle and exception routing
- client component and state tests for new workpack surfaces
- optional Rust tests only where desktop-host behavior or local file intake contracts change

## Planning conclusions

Feature 079 is feasible in this repo if it is implemented as:

1. a new product abstraction layer above existing runtime types
2. a compiler/orchestrator that emits existing execution paths
3. a policy-aware simulation and replay layer
4. a unified exception and promotion model
5. a staged rollout that starts with low-risk, high-volume operational work

The implementation plan should not assume one big bang delivery. It should break work into independently testable slices that preserve current behavior while introducing the workpack model incrementally.
