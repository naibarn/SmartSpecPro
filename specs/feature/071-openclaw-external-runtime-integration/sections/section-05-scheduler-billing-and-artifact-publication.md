# Section 05: Scheduler, Billing, and Artifact Publication

## Ownership

This section owns runtime-aware job routing, worker-job credit handling, and SmartSpecPro-owned publication/indexing for OpenClaw outputs.

## Target files and modules

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/workerBillingService.ts` or equivalent integration layer
- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/libraryService.ts`
- indexing trigger integration points

## Scope

- choose OpenClaw only for supported capability families
- reject or reroute GPU/local-file/secure-sandbox-only work
- add billing reservation and reconciliation for worker jobs
- add a worker-specific credit source type
- finalize artifact publication into SmartSpecPro-owned records, library items, links, and indexing jobs
- treat worker artifacts as untrusted until checksum, size, content-type, and storage-prefix validation pass
- define safe-serving rules for inline preview versus download-only publication

## TDD expectations

- begin with scheduler acceptance/rejection tests
- add billing tests for idempotency and refund/reconciliation behavior
- add library publication tests for checksum, metadata, and link creation
- add artifact validation tests for mismatched checksum, size overflow, and unsupported content types
- add regression tests so unsupported job classes never land on OpenClaw

## Acceptance checks

- OpenClaw jobs can be queued, claimed, run, uploaded, published, and indexed
- unsupported jobs do not route to OpenClaw
- billing remains central and retry-safe
- artifact lineage includes worker and job identity
- artifact publication cannot bypass validation and safe-serving policy

## Risks and coordination notes

- do not invent an OpenClaw-only workflow engine
- keep routing capability-based so future runtimes can reuse the same scheduler
- do not assume every uploaded artifact is safe to render inline in the product UI
