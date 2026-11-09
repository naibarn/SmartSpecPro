# Section 01: Canonical Worker Contract

## Goal

Register a tenant-bound, idempotent `worker_jobs` operation contract for Marketplace Auto Review and implement its executor using existing domain services and lease heartbeats.

## Ownership

- `apps/web/server/jobs/feature186JobTypes.ts`
- `apps/web/server/services/jobExecutorRegistry.ts`
- A focused Marketplace Auto Review worker adapter/service module and its unit tests.
- Additive imports/exports needed to reach the adapter from domain producers.

## TDD

- Test operation allowlisting, input validation, canonical job admission settings, owner/tenant checks and executor routing.
- Test an executor failure remains a classified worker failure and does not mutate another tenant's run.

## Acceptance

- Contract is registered as long-running Node work with bounded timeouts and normal retry policy.
- No executor uses credentials from job input; it rebuilds the authorized domain context from `worker_jobs` requester and tenant fields.
- LLM and media credit/checkpoint logic remains in the existing domain service.

## Risks

- Avoid circular imports between the registry, worker adapter and the large Auto Review service; prefer dynamic domain imports at executor invocation.
- Keep job inputs within the canonical JSON contract and redact user notes where the existing task does not require them to be retained.
