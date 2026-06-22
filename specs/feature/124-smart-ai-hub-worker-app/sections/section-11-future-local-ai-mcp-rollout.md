# Section 11: Future Local AI, MCP, And Rollout Guards

## Goal

Reserve the worker platform extension points for future local AI and MCP agent
workers, and add rollout/migration guardrails for moving all render jobs to
worker execution over time.

## Dependencies

- section-01-contracts-and-flags

## In Scope

- Contract stubs for future local AI worker jobs.
- Contract stubs for future MCP worker tools.
- Rollout gates and observability requirements.
- Documentation of migration path for other render systems.

## Files To Review

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/_core/mcpRoutes.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/mediaJobDispatchMode.ts`
- existing media/video render services

## Files To Change

- shared contracts only where useful and non-disruptive
- rollout docs/config/tests
- avoid full local AI/MCP execution unless separately scoped

## Test First

- Test: local AI contract stubs validate text/vision/multimodal families.
- Test: local AI provider config requires loopback URL by default.
- Test: MCP tool contract stubs use branded public names:
  `smartaihub.worker.get_capabilities`,
  `smartaihub.worker.register_capabilities`,
  `smartaihub.worker.claim_job`,
  `smartaihub.worker.get_job_manifest`,
  `smartaihub.worker.report_progress`,
  `smartaihub.worker.init_artifact_upload`,
  `smartaihub.worker.complete_artifact_upload`,
  `smartaihub.worker.complete_job`, `smartaihub.worker.fail_job`, and
  `smartaihub.worker.release_job`.
- Test: MCP worker complete requires assignment attempt identity.
- Test: rollout flag disabled keeps existing non-HyperFrames render behavior.
- Test: operator kill switch prevents new worker submissions but preserves
  visibility of existing jobs.

## Implementation Steps

1. Add future local AI schema placeholders only if doing so does not destabilize
   current worker runtime.
2. Add future MCP tool contract placeholders or documentation near worker
   delegation/MCP docs.
3. Document migration order for other render systems:
   - HyperFrames final composite;
   - other HyperFrames render modes;
   - media/video editor renders;
   - provider post-processing jobs.
4. Add observability fields/metrics expected from each future worker job family.
5. Add rollout notes explaining no server render fallback for worker-enabled
   render paths.

## Local AI Reserved Contract

Future job families:

- `local_ai_text`
- `local_ai_vision`
- `local_ai_multimodal`

Provider adapters:

- `ollama`
- `lm_studio`

Required policy:

- loopback-only by default;
- provider/model readiness;
- input/output schema limits;
- artifact upload and server verification;
- safety/moderation metadata where product requires it.

## MCP Reserved Contract

Future tools:

- `smartaihub.worker.get_capabilities`
- `smartaihub.worker.register_capabilities`
- `smartaihub.worker.claim_job`
- `smartaihub.worker.get_job_manifest`
- `smartaihub.worker.report_progress`
- `smartaihub.worker.init_artifact_upload`
- `smartaihub.worker.complete_artifact_upload`
- `smartaihub.worker.complete_job`
- `smartaihub.worker.fail_job`
- `smartaihub.worker.release_job`

MCP agents must use the same tenant/auth/lease/assignment/artifact verification
model as desktop workers.

## Acceptance Criteria

- Future work has clear extension points without blocking HyperFrames MVP.
- Rollout documentation clearly says worker-enabled render paths do not fall
  back to server render.
- Existing non-HyperFrames render behavior is not changed by this section.

## Implemented Notes

- Added schema-only reserved contracts in `apps/web/shared/workerRuntime.ts` for
  local AI text, vision, and multimodal worker jobs.
- Added provider config stubs for Ollama and LM Studio with loopback-only policy
  enabled by default.
- Added branded MCP worker tool names under `smartaihub.worker.*`.
- Added MCP worker completion payload schema requiring `assignmentAttempt` so
  future MCP agents follow the same lease/assignment identity model as the
  desktop worker.
- Added tests in `apps/web/shared/__tests__/workerRuntime.test.ts`.
- No local AI or MCP submission routes were enabled in this section; existing
  non-HyperFrames render behavior remains unchanged.

## UI/UX Contract

### Target User / JTBD

This section is mostly future-facing, but users and admins should eventually see
local AI and MCP worker jobs in the same queue/monitor model without learning a
new workflow.

### Surface Inventory

- Future user job monitor filters for render, local AI, and MCP agent jobs.
- Future admin worker capability filters.
- Future Worker App capability/status panel.

### Component Map

- No local AI or MCP UI is implemented in this section unless separately scoped.
- Reserved contracts must expose job family, provider, input/output artifact
  summary, capability requirements, and safe failure category for later UI.

### State Matrix

- Feature disabled: no local AI/MCP submission entry points appear.
- Capability available: workers can advertise provider/model readiness.
- Capability missing: user/admin sees unavailable provider/model.
- Job queued/claimed/completed/failed: reuse the same worker queue state model
  created for HyperFrames.

### Responsive Matrix

Future job-family chips and provider names must fit existing job cards and admin
tables by truncating long model names.

### Accessibility Acceptance

Capability and provider availability must be text-visible. Future MCP/local AI
job actions must be keyboard reachable and not icon-only.

### Copy Contract

Use clear labels such as local AI text, local AI image, local AI multimodal,
Ollama, LM Studio, and MCP agent worker. Avoid exposing internal tool names to
normal users unless they intentionally configure MCP.

### Browser Evidence Required

No browser evidence is required until the future UI is implemented. When enabled,
the user/admin monitor evidence requirements from sections 09 and 10 apply.
