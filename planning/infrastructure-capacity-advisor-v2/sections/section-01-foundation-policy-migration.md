# Section 01 — Foundation, Policy, and Migration

## Objective

Create the shared contract that every later collector, decision, skill, router,
and UI layer consumes. Additive persistence must support old assessment rows and
record the policy/collector/source versions needed to interpret history.

## Scope and ownership

Inspect/change `apps/web/drizzle/schema.ts`, the 0233 migration lineage or a new
additive migration, capacity service types, and a new policy/contract module near
monitoring services. Do not alter unrelated monitoring thresholds silently.

Define `CapacityPolicy`, `MetricEvidence`, `CoverageEvidence`, `WorkloadEvidence`,
`ForecastEvidence`, `CapacityDecision`, and `CapacityRunState` as fields/contracts
only. Include unit, source, scope/namespace, capturedAt, quality, availability,
policyVersion, collectorVersion, and evidence keys.

Policy owns thresholds, staleness windows, minimum forecast history, long-running
job boundary, status precedence, action class, and retention constants. Expose a
single server import; the UI receives resolved thresholds and never redefines
them. Document how Ops anomaly thresholds differ or map to this policy.

Add lifecycle/coverage/policy fields additively. Preserve legacy JSON and make the
reader normalize old rows to `legacy/unknown` metadata. Use an idempotent SQL
migration if Drizzle global checks remain blocked by the known 0146/0147 parent
collision. Include indexes only where existing schema conventions support them.

## TDD first

Write tests for boundary thresholds, missing/stale/namespace states, legacy row
normalization, migration idempotence/shape, and policy version persistence before
implementation.

## Acceptance

Every downstream layer has one importable policy/DTO contract; old rows remain
readable; new rows can identify policy, source, namespace, coverage, and run
lifecycle; target-DB migration proof is defined but not claimed yet.

## Dependencies

None. Blocks all other sections.

## UI/UX Contract

N/A for this data/schema section; browser behavior is specified in section 06.

### Target User / JTBD

N/A — no browser surface changes.

### Surface Inventory

N/A — no browser surface changes.

### Component Map

N/A — no browser components.

### State Matrix

N/A — no browser states.

### Responsive Matrix

N/A — no layout changes.

### Accessibility Acceptance

N/A — no user-facing markup.

### Copy Contract

N/A — no user-facing copy.

### Browser Evidence Required

N/A — browser proof is owned by section 06 and 08.
