# Section 02: Worker Queue Scheduler

## Goal

Queue Storyboard Review HyperFrames final composite jobs into the existing
`worker_jobs` table using deterministic idempotency and credit metadata, without
starting server render execution.

## Dependencies

- section-01-contracts-and-flags

## In Scope

- Server scheduler helper for HyperFrames final composite.
- Integration from `createHyperframesFinalCompositeForApi`.
- Manual/custom storyboard support.
- Idempotency and credit metadata.
- Priority, fairness, queue, and quota metadata.
- Feature flag and operator kill switch behavior.

## Files To Review

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesFeatureAccessService.ts`
- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`

## Files To Change

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- tests listed above

## Test First

- Test: scheduler inserts `worker_jobs` row with `jobType:
  "hyperframes_final_composite"` and runtime type `desktop_zeroclaw_managed`.
- Test: same composition hash returns existing active job.
- Test: different regenerated prompt/config hash creates a new job.
- Test: feature flag disabled returns a clear blocker.
- Test: normal Storyboard Review flow does not require preferred worker.
- Test: disabled/draining preferred worker is rejected when specified.
- Test: custom/manual storyboard job queues without marketplace product.
- Test: credit estimate metadata uses full duration and shot count.
- Test: credits are reserved on durable queue creation and not captured before
  server verification passes.
- Test: queued cancellation releases/refunds reservation according to policy.
- Test: priority/fairness/quota metadata is stored for claim ordering and
  monitor explanations.
- Test: one user can submit multiple jobs without serializing all jobs unless
  tenant policy requires it.

## Implementation Steps

1. Add `queueDesktopHyperframesFinalCompositeJob` to
   `workerSchedulerService.ts`.
2. Build idempotency from tenant, run, render intent, composition hash, template
   version, platform preset, runtime profile, and final composite config hash.
3. Store the section-01 worker input contract in `worker_jobs.inputJson`.
4. Store billing metadata, required progress stages, output policy, and source
   render id in `worker_jobs.instructionsJson`.
5. Store priority class, submit order, retry count, queue policy reason, quota
   reservation refs, and fairness keys needed by claim/admin monitor.
6. Set resource profile to `cpu_heavy` or `gpu_required` only when runtime policy
   requires it.
7. Add capability requirements for HyperFrames final composite.
8. In `createHyperframesFinalCompositeForApi`, route to worker scheduler when
   `hyperframesWorkerFinalComposite` is enabled.
9. Ensure the worker-enabled path does not call
   `dispatchHyperframesFinalCompositeWorker` or
   `startDetachedHyperframesRenderWorker`.
10. Keep legacy outbox queueing available only when the worker flag is disabled.

## Important Constraints

- No server render fallback for worker-enabled tenants.
- Do not break legacy outbox projection for existing jobs.
- Do not require product binding for manual/custom storyboard identities.
- Preserve current tRPC output shape.
- Preserve enough scheduling metadata for later queue fairness tuning without a
  breaking contract change.
- Do not capture final success credits in the scheduler; capture waits for
  server verification success.

## Acceptance Criteria

- Worker job row is created for final composite when flag is enabled.
- Server render worker is not kicked in worker-enabled path.
- Manual storyboard custom jobs can render.
- Re-render after prompt/config changes creates a new trackable job.

## UI/UX Contract

### Target User / JTBD

Creators submit a render from Storyboard Review without needing to know which
worker will execute it. The UI must make it obvious whether the job was queued,
blocked by configuration, or reused because the same request is already active.

### Surface Inventory

- Storyboard Review `Render Final Composite` action and final composite status
  panel.
- User job monitor queue/detail views.
- Admin worker queue view.

### Component Map

- No UI component is implemented in this section.
- Scheduler responses must include enough normalized status metadata for later
  components to render queue state, blocker state, idempotent existing job, and
  new job created state.

### State Matrix

- Flag disabled: show a blocker explaining worker rendering is not enabled.
- New job queued: show queue timestamp, duration estimate, and that a worker has
  not claimed it yet.
- Existing active job reused: show the existing job/run link instead of silently
  doing nothing.
- New prompt/config hash: show a new job identity and do not reuse the old final
  video link.
- Custom/manual storyboard: render action remains available without product
  lookup errors.
- Preferred worker invalid/draining: show a clear actionable error.

### Responsive Matrix

Queue and blocker messages must fit the existing Storyboard Review status panel
on mobile and desktop. Long job ids should be hidden behind copy buttons or
details views.

### Accessibility Acceptance

Render button disabled/blocker states must include text explanations, not only
color. Job creation/reuse results must be announced through existing toast or
status region patterns.

### Copy Contract

Normal user copy should say the job is queued for a desktop worker, waiting for
a worker, or blocked by configuration. Admin-only diagnostics may include flag
names and idempotency keys.

### Browser Evidence Required

Later UI sections must capture evidence for queued, blocker, reused active job,
and custom/manual storyboard render states.
