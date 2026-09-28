# Spec 207 Synthesized Specification

## Goal

Add an authoritative economic control plane that can admit an economic intent,
evaluate tenant/user/agent policy and budget, reserve and release funds,
record double-entry facts, attribute usage to a canonical Job/attempt, and
settle revenue safely without letting runtime adapters or workflow UI create
their own financial truth.

## In scope for the first implementation chain

1. Typed economic intent, policy decision and idempotency contracts.
2. Budget envelope and reserve/capture/release service.
3. Double-entry ledger accounts, journal entries and immutable event facts.
4. Settlement/revenue attribution linked to `workerJobId` and attempt.
5. Tenant-safe router/service boundaries, audit events and reconciliation.
6. Finance UI data contracts and rollout/migration gates, with UI styling
   deferred to the Spec 209 mockup-led product pass where applicable.

## Non-negotiable boundaries

- Server-derived tenant, actor and authorization context.
- Integer minor-unit money and explicit currency.
- Atomic/idempotent financial transitions.
- No raw wallet credentials in Jobs, Runner payloads or client state.
- No new queue, workflow engine, retired route or OpenSandbox path.
- No claim of production settlement until provider/reconciliation evidence is
  available.

