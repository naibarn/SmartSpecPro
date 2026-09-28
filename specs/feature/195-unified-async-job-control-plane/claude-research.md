# Feature 195 Research

## Research decision

- Codebase: required because this is an existing git repository with PostgreSQL/Drizzle, Web, Python and Worker implementations.
- Web topics: Cloudflare Queues delivery/retry/DLQ, Cloudflare Containers, and durable outbox/lease boundaries.
- Testing: existing Web tests use Vitest; Python uses pytest; Worker/Rust uses Cargo tests. Whole-repository typecheck is excluded by project constraint.
- SocratiCode: unavailable in the current MCP transport; findings below use targeted `rg`, line reads and existing migration/test conventions.

## Codebase findings

- Canonical schema is `apps/web/drizzle/schema.ts`; existing durable tables include `worker_jobs`, `worker_job_events`, `worker_job_attempts`, `worker_job_dispatches`, provider reservations and `worker_job_outbox`.
- Feature 186 migration and `apps/web/server/services/*ControlPlane*`/scheduler services already establish admission, outbox and worker integration patterns. Extend them; do not create a second queue/job truth.
- Existing job types and `external_agent_task` are registered in `workerSchedulerService.ts` and `runEngine.ts`.
- Relevant tests are adjacent under `apps/web/server/services/__tests__` and migration/contract tests. Use package-local Vitest commands.

## External research

- Cloudflare Queues provides batching, retry, delay and DLQ; message processing must distinguish queue delivery acknowledgement from business lease/fencing. See https://developers.cloudflare.com/queues/ and https://developers.cloudflare.com/queues/configuration/batching-retries/.
- Cloudflare pull consumers use visibility leases and explicit ACK/retry, so the durable database lease remains the application authority. See https://developers.cloudflare.com/queues/configuration/pull-consumers/.
- Cloudflare Containers is an approved isolated runtime for resource-intensive workloads, not a replacement for durable Job state. See https://developers.cloudflare.com/containers/.

## Planning implications

Implement persistence/transition contracts first, then outbox publication and reconciliation, then capacity/lease/retry services, then APIs/UI projections. Every migration must be additive and rollback-reviewed; runtime readiness must not block canonical admission.

