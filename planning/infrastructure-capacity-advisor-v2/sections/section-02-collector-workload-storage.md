# Section 02 — Collector, Workload, and Storage Evidence

## Objective

Extend the snapshot with decision-grade workload and storage facts using existing
worker/job sources and explicit source identity.

## Scope and ownership

Update `capacityAssessmentService.ts` through bounded adapters. Reuse
`workerFleetService.ts` for queued/active/stalled/oldest queued and worker data.
Reuse scheduled-job history from the Python-backed scheduled-job model/API for
duration, retry, failure, and throughput signals where the service boundary
allows it. Do not create duplicate counters.

Normalize configured versus observed concurrency, worker count, queue names,
oldest queued age, long-running jobs, duration summary, retry/error rate, and
whether a signal is durable or in-memory. A missing source is unavailable, not
zero. Bound job samples and redact identifiers/details.

Complete root/mount/Docker/temp evidence with bytes, counts, scan completeness,
allowlist, capturedAt, source, and host/container namespace. Make cross-source
comparison conditional on matching identity/scope. Record health-task delay when
the Python task shares the media queue; isolate it only if the existing queue
architecture supports a safe change.

Keep temp traversal bounded and non-destructive. Include temp mount capacity in
the normalized DTO so it can be rendered later.

## TDD first

Test worker normalization, unavailable-versus-zero behavior, long-running job
boundaries, queue restart semantics, temp allowlist/bounds, missing mounts,
Docker absence, source/namespace mismatch, and monitoring delay.

## Acceptance

The snapshot contains CPU/RAM/disk/temp/queue/background-job/concurrency evidence
or explicit unavailable records, with source and freshness for each group. No
raw logs, credentials, private job payloads, or unbounded filesystem data leave
the collector.

## Dependencies

Section 01. Blocks deterministic assessment and UI evidence.

## UI/UX Contract

N/A for this collector section; presentation is specified in section 06.

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
