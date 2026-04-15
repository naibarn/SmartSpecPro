# Section 03 - Execution Adapters, Step Routing Boundaries, and Surface Allowlists

## Goal

Define the adapter layer that routes each automation step to the right executor while keeping Work OS as the canonical control plane and preventing arbitrary new surfaces from being introduced through payloads.

## What this section must deliver

- Deterministic step routing through Skills / Unified Orchestrator.
- Research and critique routing through Agency Swarm.
- Browser/external automation routing through Automation Copilot only when policy allows it.
- Draft/content routing into Document Management.
- Media routing into Media Studio.
- Composition/render routing into Video Editor.
- A hard allowlist of execution surfaces the fabric can call.

## Files likely to change

- Orchestration service layer
- Skill routing helpers
- Agency execution integration
- Automation Copilot integration
- Document/Media/Video handoff helpers
- Adapter-level tests

## Implementation notes

- Keep adapter selection server-side.
- Every adapter call must preserve tenant isolation and auditability.
- Every step must declare risk tier and side-effect class before execution.
- The orchestrator must not infer a new backend from user-supplied payloads.

## Expected behavior

- Each step reports back status, output pointers, and evidence.
- Browser/external steps stay behind existing feature-flag and policy gates.
- Payloads cannot smuggle in an unapproved execution surface.

## Test expectations

- Step routing tests for each adapter class.
- Policy-gated execution tests for browser/external actions.
- Rejection tests for unknown or disallowed execution surfaces.
- Deduplication or retry-key tests for repeated step attempts.

## Risks to watch

- Bypassing policy by routing directly to a specialized surface.
- Letting open-ended work accidentally execute inside a deterministic executor.
- Failing to preserve evidence links when steps cross surfaces.

## Implementation Result

The adapter boundary is now encoded as policy, previewable routes, and a real execution dispatcher:

- [`apps/web/server/services/workAutomationPolicyService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationPolicyService.ts) defines the hard allowlist of surfaces and the step blueprints for the first-release content-production workflow.
- [`apps/web/server/services/workAutomationFabricService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationFabricService.ts) validates step surfaces against the allowlist before recording step progress, so payloads cannot smuggle in a new backend surface.
- [`apps/web/server/services/workAutomationExecutionService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationExecutionService.ts) dispatches approved steps to the concrete executors already present in the codebase: skill execution, agency runs, browser/external automation via Automation Copilot, document/presentation creation, media generation, and video generation. It records the resulting evidence pointers back into the automation timeline.
- Browser/external execution now uses a durable claim row in [`apps/web/server/services/workAutomationBrowserTaskService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationBrowserTaskService.ts) before dispatch so the system can poll completion, resume from an outbox-like record, and avoid duplicate browser launches on retry.
- [`apps/web/server/services/automationCopilotExecutionService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/automationCopilotExecutionService.ts) exposes task-status polling and reservation finalization helpers, and the browser claim reconciler updates the linked Work OS step when the task reaches a terminal status.
- [`apps/web/server/routers/workOs.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/routers/workOs.ts) exposes `resolveAutomationStepRoute` so operators can inspect the allowed surface for a step before execution.
- Step timeline events now carry route provenance in their detail JSON, making the operator evidence trail explicit when a step is routed to skill, agency, browser, document, media, or video surfaces.
- Browser/external execution remains behind the existing Automation Copilot policy gates and is only allowed on explicitly allowlisted steps such as browser-enabled research routes.
