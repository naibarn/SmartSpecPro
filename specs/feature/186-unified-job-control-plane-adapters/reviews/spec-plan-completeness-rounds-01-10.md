# Feature 186 spec and plan completeness review — rounds 01–10

Date: 2026-09-13
Scope: `spec.md`, `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`,
all eight section files, `runbook.md`, `rollout-manifest.yaml`, and the
repository paths/migrations referenced by those documents.

Method: ten sequential cross-file reviews. Each concrete documentation or
plan gap was corrected before the next round. SocratiCode was unavailable in
this workspace, so exact repository path checks used `rg`, `find`, and focused
file reads as the documented fallback.

## Round 01 — scope and requirement traceability

- Finding: the spec's account/tenant data-transfer boundary was not represented
  in the implementation plan, TDD matrix, or Section 06.
- Fix: added explicit transfer service ownership, preview/approval/checkpoint
  requirements, transfer tests, and section index coverage.
- Result: closed; transfer is now traceable from spec to plan, section, TDD, and
  runbook.

## Round 02 — canonical identity and status model

- Finding: the plan named canonical IDs but abbreviated the legacy status alias
  projection.
- Fix: documented the complete `queued`, `claimed`, execution-stage,
  `completed`, `failed`, `canceled`, and `expired` mapping to the unified status
  vocabulary, with no second status field.
- Result: closed; `worker_jobs.id` remains the only job identity.

## Round 03 — persistence, migrations, and deletion safety

- Finding: the plan referenced an obsolete migration name/number and omitted
  transfer checkpoint persistence and settlement metadata. Existing migration
  0306 was also absent from the manifest.
- Fix: aligned the plan/section/manifest with migrations 0303–0306, added
  transfer plan/item/checkpoint constraints, settlement markers, bounded error
  projection, and an explicit archive/redaction gate before parent deletion.
- Result: closed; no parallel jobs ledger or independent transfer lifecycle is
  introduced.

## Round 04 — idempotency, retry, timeout, and progress

- Finding: plan coverage did not explicitly connect provider operation-key reuse,
  soft/hard timeout behavior, unknown-error review, and progress constraints.
- Fix: added deterministic provider-key persistence/reuse, cooperative timeout,
  hard deadline, fail-closed operator review, 0–100 progress, allowlisted stage,
  monotonicity, and bounded event sampling requirements.
- Result: closed; business retry remains distinct from transport retry.

## Round 05 — leases, fencing, and reconciliation

- Finding: reconciler cadence and ambiguous provider inspection behavior were
  underspecified in the plan.
- Fix: specified configurable 1–5 minute bounded cadence, lease/attempt/fence
  guards, external-wait reacquisition, and operator review when provider status
  cannot establish the outcome.
- Result: closed; stale workers/callbacks cannot become authoritative.

## Round 06 — transactional outbox and adapter boundaries

- Finding: the plan needed an explicit lost-ack/quarantine boundary and future
  adapter behavior rather than relying on broker observations.
- Fix: retained stable outbox dedupe, publisher fencing, dispatch persistence
  before acknowledgement, read-only inspection, poison quarantine, and added
  Queue/Workflow/Container replay and step-marker acceptance requirements.
- Result: closed; transport IDs remain references only.

## Round 07 — scheduler, Python/Celery, and legacy migration

- Finding: several plan paths/commands pointed to files that do not exist in the
  repository, and direct Celery call-site coverage was too generic.
- Fix: aligned paths with `apps/web/scripts`, the existing unified reconciler
  entry point, current monitor services, and `verify:feature-186`; explicitly
  inventory `.delay()`, `.apply_async()`, and `send_task()`.
- Result: closed; legacy producers remain truthful compatibility gates.

## Round 08 — tenant move, transfer, security, and UI contract

- Finding: transfer requirements did not state the pre-commit cancellation
  ordering and partial-failure repeat semantics; Section 06 UI labels did not
  use the required UI contract headings.
- Fix: added System Admin move ordering, `ACTIVE_JOB_BLOCKED`, durable partial
  evidence, same-action-key repeat, no implicit transfer/queue flush, and the
  complete Section 06 UI/UX heading contract.
- Result: closed; auth, redaction, audit, browser evidence, and transfer safety
  are all represented.

## Round 09 — Cloudflare and Hyperdrive boundary

- Finding: the spec described Cloudflare adapters but did not define the
  requested PostgreSQL-through-Hyperdrive boundary.
- Fix: added a dedicated Hyperdrive binding to the existing PostgreSQL source
  of truth, no D1/second ledger, fresh-read/cache rules, short transactions,
  pool/latency budgets, no-ack on unavailable durable writes, deployment gates,
  runbook evidence, and manifest fields. No Cloudflare resource was provisioned.
- Result: closed as a planning contract; production account/binding proof
  remains an explicit external gate.

## Round 10 — structural and final consistency

- Finding: final checks needed to prove section completeness, migration/artifact
  presence, stale path removal, whitespace, honest rollout state, and YAML type
  safety for the schema version.
- Fix: updated the manifest with empty-but-truthful producer/wave/budget/evidence
  collections, quoted `current_schema_version` so YAML does not parse `0306` as
  octal `198`, and reran all checks after the last edits.
- Result: closed; eight sections remain complete and no stale plan path remains.

## Convergence result

- Review rounds completed: 10.
- In-scope spec/plan gaps remaining: none identified after Round 10.
- Intentional external gates: legacy producer cutover, safe database migration/
  backfill execution, Cloudflare account capability/binding/Hyperdrive proof,
  production latency/connectivity/recovery evidence, and paid-provider tests.
- No runtime code, `.env`, database data, queue, provider, credit, or Cloudflare
  resource was mutated by this documentation review.

## Verification evidence

- `check-sections.py`: complete, 8/8 sections, valid manifest.
- `verify:feature-186`: passed with additive migration and
  `cloudflareProductionProof: false`.
- Exact repository path and migration checks: passed for migrations 0303–0306,
  canonical services, monitor services, reconciler entry point, backfill, and
  verifier scripts.
- YAML parse/type check: passed with `current_schema_version` preserved as the
  string `"0306"`.
- Stale reference scan: no obsolete manifest, migration, backfill, reconciler
  entry, or monitor-service path remains in the Feature 186 plan docs.
- Section 06 UI contract heading check: passed.
- Whitespace/diff check: passed.
- `check-ui-contracts.py` has a known false-positive heuristic here: the
  substring `ui` appears in ordinary backend words, so it marks every section
  UI-affecting. Section 06 itself satisfies all required UI headings; backend
  sections were not polluted with irrelevant UI boilerplate.
