# Section 07 — Block generation, context packs, checkpoints, and resume

## Scope

Integrate blueprint/block scope into the Feature 152 deep, extend, and repair
jobs with bounded context packs, block/episode checkpoints, quality/extended
mode budgets, and stale-worker fail-closed behavior.

## Owned paths

- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRuntime.ts`
- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`

## Design

Wire the actual `generateStoryBible` -> `generateStoryBibleDeep` /
`extendStoryDraftHorizon` path. The deep, premium, revise, resume, retry, and
repair calls all receive the same graph revision/fingerprint, required edge
IDs, typed graph-delta output contract, and versioned SLO envelope. A graph
revision change invalidates the run and resumes from the last accepted block.

Plan generation is a separate staged job before shot drafting: create a
deterministic horizon skeleton, fill disjoint arc/block intervals, checkpoint
coverage, then author shots. The strict path must publish candidate revisions
only; the legacy direct `bible` write is unavailable when Feature 153 is
enabled. Runtime contracts must contain independent architecture/design/graph/
duration/cast/memory fingerprints rather than placeholder copies.

Expose a separate plan-chunk job/progress contract so the router does not
pretend that the existing one-call `generateStoryBible` response is sufficient
for large horizons.

Use a default 10-episode plan chunk and a maximum of 20, with zero overlap,
contiguous coverage, a predecessor coverage fingerprint, and a deterministic
work-unit idempotency key. A chunk has at most two paid retries; an unknown
provider outcome is reconciled before retrying and an accepted chunk is never
charged twice. Strict `generateStoryBible` returns blueprint/plan-job status
and delegates authoritative large-plan creation to this job.

Only transient/provider failures consume retry budget. Deterministic schema or
continuity findings become bounded repair findings, unknown outcomes reconcile
before retry, and stale-fence failures resume from checkpoint. The strict
baseline is one schema-correction retry, two transient-provider retries, two
paid plan-chunk retries, and at most three outer repair rounds per work unit;
provider continuation calls inherit Feature 152's pinned ceiling and count
against SLO/credits without increasing retry allowance. Any override requires
a new retry/SLO policy fingerprint before admission. Plan chunks are
single-flight by default; duplicate requests reuse the key derived from
tenant, series, blueprint/source revision, interval, work-unit type, and
attempt class.

The queue transport status remains `queued | running | succeeded | failed`.
Detailed candidate/run progress must remain in the Feature 152
story-generation status contract; transport `succeeded` is not activation
success until final-gate and durable read-back validation pass.

Reuse the Feature 152 story-job lease, heartbeat, fence token, cancellation
request, checkpoint, and resume repository. A watchdog must fence expired
workers and convert stale queued/running work to resumable partial or
reconciliation state. Browser disconnect is transport-only; durable cancel or
pause requests reject late callbacks from publishing.

Generate 5–10 episodes per block by policy, checkpoint each accepted episode,
and never pass a missing gap as success. Context packs include immutable truth,
current arc/block state, targeted memory, adjacent obligations, cast/look/world
requirements, and a fingerprint. Agents SDK remains an optional Feature 151
adapter, not a new side-effect authority.

## TDD acceptance

- Worker crash/browser disconnect resumes from the last checkpoint.
- Duplicate requests deduplicate; stale fence cannot publish terminal success.
- Extended mode reports cost/time/confidence and keeps accepted prior blocks.
- Required truth cannot be silently truncated from a context pack.
- Missing policy thresholds, stale predecessor coverage, interval overlap, and
  changed idempotency keys block the chunk before a paid call.
- Source, locale, genre, duration, horizon, policy, or graph changes fence
  dependent blocks while preserving accepted checkpoints.
- Hard spend ceiling, pricing snapshot, lease/heartbeat, watchdog,
  pause/cancel, and unused-credit reconciliation are present before paid work.
- Speech, benchmark, anti-drift, plan-chunk, execution, and pricing policy
  fingerprints are present and independently checked on every retry/resume.
- Final activation performs read-back of status, coverage, fingerprints,
  graph/memory checkpoints, finalization key, and credit reconciliation before
  returning success.

## UI/UX Contract

### Target User / JTBD

N/A — job/runtime integration; progress UX is Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — runtime status follows Feature 152 and is rendered in Section 09.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — job/service tests are sufficient for this section.

## Implementation notes

`verticalDramaLongFormRuntime.ts` implements bounded block generation,
checkpoint resume, targeted repair rounds, and fail-closed partial status.
The existing durable story-run contract accepts the typed Feature 153
`longForm` extension without changing legacy runs. Strict long-form deep/extend
outputs now require a typed `relationship_graph_deltas` array; the memory
projection derives legacy pair state from accepted deltas and the compatibility
graph preserves delta evidence/provenance.
