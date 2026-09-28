# Section 08 — Cutover and Rollback Runbooks
+## UI/UX Contract

### Target User / JTBD

- N/A — operator runbooks and server coordinator only; section-06 owns the control-center UI.

### Existing Pattern Reference

- N/A — no browser component is implemented in this section.

### Surface Inventory

- N/A — runbook markdown and control-plane orchestration only.

### Component Map

- N/A — no client component is introduced.

### State Matrix

- N/A — cutover states are verified by coordinator/runbook tests and presented in section-06.

### Responsive Matrix

- N/A — no browser layout is changed.

### Accessibility Acceptance

- N/A — no user-facing markup is introduced.

### Copy Contract

- N/A — operator runbook wording is not an in-product UI copy surface.

### Browser Evidence Required

- N/A — browser evidence is owned by section-06 and final integration.

## Scope

Turn the control-plane, promotion, adapter, UI, and release contracts into
operator-executable runbooks for a one-time maintenance-window cutover and an
explicit rollback procedure.

## Ownership paths

- ops/feature-188/cutover-runbook.md:
  preparation, maintenance, final promotion, activation, traffic, separation.
- ops/feature-188/rollback-runbook.md:
  rollback decision, compatibility checks, reconciliation, and evidence.
- ops/feature-188/legacy-runtime-retirement.md:
  GCP/Celery/BullMQ/Redis/Cloud Tasks retirement gates.
- apps/web/server/services/__tests__/cutoverRunbook.test.ts:
  runbook sequence and operator-resume tests. The cutover coordinator and its
  core tests are owned by section-02 and consumed here.

## Preparation gates

The runbook requires immutable release/schema/adapter/data/gate identities,
source inventory and legacy-production dispositions, new target PostgreSQL
identity/backups/network/capability, Hyperdrive target-only binding, complete
snapshot and healthy continuous sync, data/object/index/job/settlement/security/
recovery gates, and approved maintenance window.

Unknown or expired evidence blocks the window. Local health, build success,
mock adapters, or a 200 health endpoint alone never passes a production gate.

## Maintenance and final promotion

Use this exact order:

1. announce maintenance and disable new writes;
2. stop/fence producers and scheduled triggers;
3. drain safe jobs and reconcile other canonical jobs by job_id;
4. freeze source writes;
5. capture final source transaction watermark;
6. apply final delta to the new Production PostgreSQL target;
7. validate all rows/partitions, deletes, FKs, uniques, sequences, objects,
   Vectorize, worker jobs/events, dispatches, outbox, settlements, and domain
   projections;
8. run isolated, side-effect-free synthetic target tests while traffic is
   closed and before activation;
9. persist ready evidence.

## Activation and separation

The control plane commits an activation intent/outbox with release and target
identity. The Cloudflare release workflow applies the binding/deployment change
with the same dedupe key. The control plane settles ACTIVE only after
Hyperdrive target identity and runtime probes are durable. Traffic opening is a
separate guarded action. Then verify zero legacy calls, disable CDC/watermark
sync, revoke source-to-target credentials, deny and audit further sync attempts,
and issue the separation/cutover certificate.

The maintenance window is planned for 24–72 hours with a documented extension
or rollback decision point. Every step records actor, reason, action key,
control version, release/schema/target/promotion identity, timestamp, and
evidence reference.

## Rollback

Rollback is an incident procedure, not a direct environment toggle. Before
switching any producer or traffic, check schema compatibility, retained artifact
and container image, target writes, canonical job/side-effect reconciliation,
and whether forward-fix or reverse reconciliation is safe. If target writes
exist, a blind switch to Dev is forbidden. Terminal job history is never
deleted or reopened implicitly.

Legacy runtime retirement occurs only after all canonical job types have an
accepted alternative, dashboards are equivalent, recovery evidence is
production-grade, and the retention/reconciliation window closes.

## TDD stubs

- Runbook parser verifies all required steps and order.
- Each step can be replayed from durable state without duplicate side effects.
- Activation intent/provider response-loss/target-probe/traffic-separation
  sequence is tested.
- Maintenance aborts safely on stale sync, incomplete delta, unresolved job,
  ambiguous provider result, or unknown gate.
- Rollback drill covers target writes, job reconciliation, artifact/image
  retention, producer switch, and no blind Dev fallback.
- Post-cutover sync denial and audit test passes.

## Acceptance

An authorized operator can execute or resume the sequence with evidence, the
source remains authoritative until final validation/activation, traffic opening
cannot precede durable activation, and post-cutover separation is provable.
