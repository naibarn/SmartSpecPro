# Feature 195 Unified Async Job Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL `worker_jobs` plus transactional outbox the single durable execution truth for all SmartAIHub long-running work, with safe admission, publication, leasing, retries, capacity, control, result lineage and monitoring.

**Architecture:** Extend the existing Feature 186/195 Web services and Drizzle schema. Admission writes a canonical Job and outbox intent in one transaction; a publisher turns outbox rows into queue envelopes; consumers claim attempts with database fencing; providers, Containers and Runner are adapters. Monitoring reads durable events/projections and never treats queue or realtime state as truth.

**Tech Stack:** TypeScript, Drizzle/PostgreSQL, Vitest, existing Worker/Queue/Cloudflare adapters, React monitoring surfaces.

**Spec:** `specs/feature/195-unified-async-job-control-plane/spec.md`

## Global Constraints

- Reuse `worker_jobs`, `worker_job_events`, `worker_job_attempts`, `worker_job_dispatches`, provider reservations and `worker_job_outbox`.
- Durable admission precedes queue publication; readiness failure must not reject a valid canonical insert.
- Server-derived tenant/auth authority; no client/hostname/queue authorization.
- Bounded retries, idempotency, lease/fencing, append-only events and no secret-bearing payloads.
- Cloudflare Queues/Containers are adapters; local execution uses Feature 197 Runner.
- No second Job/queue/lease/audit/billing source of truth and no retired execution systems.
- Do not run whole-repository typecheck.

## Source coverage ledger

The six implementation sections below cover every numbered section 0–294 and subsections in `spec.md`: architecture/background/goals/non-goals (0–8), queue/outbox/lifecycle/capacity/provider controls (9–76), retries/DLQ/monitoring/result lineage (77–156), workflow/approval/delegation/quality/billing/control (157–224), Runner/local/MCP/nested execution/security/data model (225–293), and the codebase baseline plus required summary/acceptance sections (294 and trailing headings). The section files retain explicit heading ranges and acceptance checks so no source section is silently skipped.

## Execution order

`section-01-contracts → section-02-persistence → section-03-publication-and-capacity → section-04-lifecycle-and-control → section-05-monitoring-and-integrations → section-06-migration-and-release-gates`

### Task 1: Canonical contracts and transition engine

**Files:** Modify `apps/web/server/services/jobControlPlaneTypes.ts`, `jobControlPlane.ts`, `jobControlPlaneGateway.ts`; add focused tests beside existing job-control tests.

Define the canonical Job status/attempt/lease/outbox/event types, idempotency scope and legal transition matrix. Keep business retry separate from queue retry. Expose pure transition/authorization helpers and a single gateway interface consumed by later features.

**Tests first:** legal/illegal transitions, terminal immutability, idempotency replay, tenant authority, retry category classification and stale-fence rejection.

### Task 2: Persistence and migration-safe invariants

**Files:** Modify `apps/web/drizzle/schema.ts` only for missing fields; add the next additive Drizzle migration under `apps/web/drizzle/`; update schema/migration contract tests.

Verify existing Feature 186 columns before adding anything. Add only missing attempt/dispatch/outbox/provider-reservation fields and indexes required by the plan. Enforce unique `(tenant, idempotencyKey)`/outbox dedupe and status/lease indexes without destructive operations. Add rollback notes and explicit selected `DATABASE_URL` validation commands to the section docs.

**Tests first:** migration SQL safety, uniqueness, nullable/backfill behavior, event append ordering and query index contract.

### Task 3: Transactional admission, outbox publication and capacity

**Files:** Modify `jobControlPlaneGateway.ts`, publisher/consumer services and provider-capacity services; add tests under `apps/web/server/services/__tests__`.

Make admission persist Job + initial event + outbox atomically. Implement publication retry/reconciliation, queue envelope redaction, provider account selection, capacity reservations, fair lanes and DLQ mapping. Queue ACK only acknowledges delivery; database lease/attempt state controls side effects.

**Tests first:** DB success/queue failure recovery, duplicate publication, capacity race, bounded backoff, DLQ, redacted envelope and provider reservation release.

### Task 4: Lifecycle, leases, control and nested execution

**Files:** Modify `jobControlPlane.ts`, monitor/control helpers and `apps/web/server/routers/workerJobs.ts`; add contract tests.

Implement claim/heartbeat/lease-expiry/fencing, cancel/pause/resume/steer semantics, child-job lineage, budget/approval propagation, resource wait, quality-gate completion and compensation/fallback/replan events. All control mutations are actor/tenant scoped and idempotent.

**Tests first:** stale worker, cancel race, child budget/cycle, approval expiry, partial failure/compensation, control precedence and result/artifact lineage.

### Task 5: Monitoring, UI projection and cross-feature adapters

**Files:** Modify `apps/web/server/services/workerJobMonitorService.ts`, `apps/web/server/routers/workerJobs.ts` and existing monitoring components; add/modify tests.

Expose durable status, events, attempts, runner/provider disposition, artifacts, costs, provenance and recovery readiness. Keep Chat/Assistant, Goal/Plan, Runner, MCP and Agent integrations as typed adapters that consume this contract; do not introduce feature-owned job tables.

**UI/UX Contract:** Target user is an operator/end user tracking authorized work from existing job/history surfaces. Reuse current worker-job monitor and media history patterns. Cover loading/empty/error/success/partial/disabled/focus states, mobile 390×844, tablet 768×1024, desktop 1440×900, keyboard/focus/labels/contrast/reduced motion, Thai/English status copy and browser evidence for job admission, reconnect, cancel and terminal result. If a new route is not justified, extend the existing monitor and record that reuse decision.

### Task 6: Migration, compatibility and release gates

**Files:** Update feature-195 migration/compatibility docs, focused release gate tests and runbooks under `docs/operations/feature-195`.

Create staged rollout flags/config only where current conventions support them, mixed-version event tests, replay/restore drill, SLO/alert checks, retention/residency evidence and legacy-worker adapter mapping. Do not remove legacy code in this implementation wave without an independent authorized migration audit.

**Tests first:** mixed-version envelope, replay after restart, backup/restore fixture, retention redaction, SLO/degraded mode and all cross-spec contract cases.

## Definition of done

Every source heading is mapped in the section ledger, canonical Job/outbox behavior is tested, focused Web tests pass, migrations are additive and rollback-reviewed, monitoring is truthful, and later features have stable typed handoff contracts.
