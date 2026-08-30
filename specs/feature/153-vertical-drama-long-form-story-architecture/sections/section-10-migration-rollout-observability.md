# Section 10 — Migration, rollout, observability, and runbook

## Scope

Add flags, metrics, migration/backfill, shadow closure reporting, rollback, and
operator documentation without changing active legacy story content.

## Owned paths

- `apps/web/drizzle/schema.ts` and one approved migration boundary
- feature flag/config modules
- observability/runbook/spec acceptance matrix

## Design

Start with JSON/event/snapshot storage. Preflight Drizzle journal, constraints,
tenant indexes, and the character table's manual migration lineage before
adding normalized tables, including any relationship-graph revision table.

The graph revision and dependency index are mandatory regardless of storage
shape. If JSON plus memory events/snapshots cannot provide atomic lookup for
graph repair and UI queries, add the normalized revision/index table after
preflight. Track graph readiness, stale-run rejections, index coverage,
repair-impact size, SLO estimates versus actuals, benchmark reviewer scores,
sample episode count/IDs, confidence status, confidence intervals, inter-rater
agreement, and adjudication outcomes. Comparable-quality label eligibility
must be observable and must come from the persisted benchmark result.
Backfill derived IDs with confidence labels only.
Roll out contracts shadow -> blueprint -> checkpoints -> domain ledgers -> arc
gate -> finale gate -> optional Agents adapter.

Persist resolved benchmark, anti-drift, cast-density, plan-chunk,
memory-compaction, and credit/retry policy versions and values in the run
contract. Metrics must distinguish reserved, consumed, reconciled, refunded,
and unknown credits, and must expose plan gaps/overlaps and stale-revision
fences without logging secret graph content. Also persist the model/pricing
snapshot and hard spend ceiling used for admission.
Each resolved policy has a separate fingerprint so telemetry can identify
stale retries without exposing prompt or secret graph content.
The run contract also pins Feature 151/152 contract versions, provider/safety
policy versions, locale, relationship vocabulary fingerprint, and relationship
redaction policy version/fingerprint. A redaction-policy change must be
observable and must fence dependent retrieval/repair work. If the existing run
row cannot distinguish pause from cancellation, migration preflight must add a
typed control-request field.

## TDD/ops acceptance

- Migration is idempotent and scoped; rollback leaves active content unchanged.
- Metrics report mode, cost/time, block/arc/finale findings, cast/look/world
  events, reconciliation, approvals, and fence losses without raw secrets.
- Metrics and run records distinguish credit reservation, consumption,
  reconciliation, refund, and unknown outcome; no secret edge/evidence payload
  is emitted.
- Metrics expose lease age, heartbeat age, watchdog recovery, durable pause/
  cancel requests, late-callback rejection, and resume-attempt counts.
- Runbook distinguishes local, browser, provider, migration, production, and
  deployment proof.

## UI/UX Contract

### Target User / JTBD

N/A — migration and observability layer; operator diagnostics are specified in
Section 09 and the main plan.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — rollout states are feature flags and runbook states.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — migration/metrics/runbook proof is sufficient for this section.

## Implementation notes

No normalized migration is required for the first additive slice: graph and
policy payloads remain compatible JSON artifacts and the retrieval contract is
bounded. `verticalDramaLongFormTelemetry.ts` adds secret-free event shaping and
ordered rollout gates for shadow through optional Agents adapter mode.
