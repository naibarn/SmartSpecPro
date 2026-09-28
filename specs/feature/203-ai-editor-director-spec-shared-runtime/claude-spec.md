# Synthesized implementation specification — Spec 203

## Objective

Deliver the shared runtime contract that lets Web Editor, Runner, Windows
Worker, and approved container profiles collaborate on one non-destructive
project while keeping evidence, AI intent, compilation, validation, execution,
and final artifact state server-authoritative.

## Normative model

```text
ProjectRevision + TimelineRevision
  -> ProjectExecutionSnapshot
  -> EditorialEvidenceBundle
  -> EditorialIntentPlan
  -> ExecutableEditPlan
  -> SafetyValidator / EditorialQC
  -> preview/render
  -> hash + signed Library commit + project artifact link
```

Spec 203 is authoritative for every runtime identity, canonical time/geometry,
revision/CAS, snapshot, evidence schema, intent/compile/validate contract,
execution-agent capability/locality, artifact provenance, security, and rollout
gate. Spec 202 consumes these contracts for product UX and Rough Cut behavior.

## Implementation requirements

1. Add versioned shared types and validators for canonical timebase/ticks,
   coordinates, evidence, intent, executable plans, change sets, QC, and
   artifact manifests.
2. Make Feature 184 project revisions and immutable snapshots the admission
   boundary. Persist project-job links, idempotency keys, and outbox events in a
   tenant-safe transaction or equivalent retry-safe helper.
3. Implement exact capability/locality admission with capability-blocked and
   waiting-agent states, lease/heartbeat/cancellation semantics, and source
   fingerprint/revision fencing.
4. Keep Node composition scan as the current adapter. Its degraded output is
   diagnostic-only and must fail closed at promotion. Windows parity requires a
   real executor, exact claim token, evidence schema, and contract tests.
5. Implement deterministic compiler/validator boundaries. Skills may produce
   intent, but only the server/compiler can produce executable operations.
6. Preserve Web, Runner, Worker, and container asset locality rules; never leak
   local paths or signed URLs into durable contracts.
7. Require QC, artifact hash, signed Library upload, server commit, and project
   link before reporting successful completion.
8. Add security, tenant isolation, concurrency, idempotency, migration,
   compatibility, chaos, golden, performance, browser, and Worker evidence
   gates appropriate to each implementation section.

## Explicit non-goals for this implementation wave

- Do not fabricate a detector, ASR, Director model, or Windows composition
  scanner that is absent from the repository.
- Do not create a second queue, project store, workflow engine, Agency path,
  Docker/OpenSandbox path, or unbounded retry mechanism.
- Do not claim production parity from unit tests alone.

## Acceptance boundary

The implementation is complete only when every planned section is either
implemented with tests or explicitly marked as a capability-blocked/future
adapter with a concrete release gate. No section may silently remain an
untracked placeholder.
