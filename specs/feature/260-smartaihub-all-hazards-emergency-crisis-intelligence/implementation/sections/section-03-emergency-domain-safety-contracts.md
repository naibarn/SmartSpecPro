# Section 03 — Emergency Domain and Safety Contracts

## Goal

Create dependency-light domain types and pure safety rules that all emergency services, API projections, and persistence layers can share without creating new identity, media, job, credit, or accounting authorities.

## Requirements

- Model the required distinction between event, hazard occurrence, observation, situation, incident/episode, case, need/revision/fulfillment, task/offer/assignment/activity/dependency, team/resource, conversation/fact/evidence, consent/disclosure, verification, alert, sponsorship and financial references.
- Hazard values carry a taxonomy version and an extensible code so new hazards do not require schema redesign.
- Facts carry source, observation/receipt times, freshness, confidence and evidence references.
- Exact location references and generalized public location are separate types. Public projections are assembled from an explicit allowlist and omit requester, medical and exact-location references.
- Incident, need and task status machines preserve the distinction between provider completion and citizen-verified fulfillment; partial fulfillment cannot close unrelated needs.
- Critical transitions require an actor, reason, tenant, revision and append-audit hash-chain context. The canonical audit authority persists the event; this package only defines the contract.
- Consent receipts, lawful emergency basis, disclosure grants and disclosure records remain purpose/category/recipient bound.
- Financial event and emergency credit values reference the canonical economic ledger/credit authority and do not hold a second balance.
- AI output is representable as advisory provenance only; it cannot itself trigger a punitive result.

## Planned ownership paths

- `packages/shared/src/emergency/contracts.ts`
- `packages/shared/src/emergency/index.ts`
- `packages/shared/src/index.ts`
- `apps/cloudflare/src/spec260EmergencyContracts.test.ts`

## Test cases to add; execute once after all implementation sections are complete

1. Unknown taxonomy codes remain representable when their version and category are valid.
2. Provenance rejects invalid confidence and impossible observation/receipt ordering.
3. Incident, need and task transitions enforce their own state machines, reopen semantics, and task concurrency without an incident-wide lock.
4. Every valid critical transition yields an append-audit event with tenant/actor/reason/revision/hash-chain context; invalid or missing context is rejected.
5. Public situation projection excludes exact location, requester identity and medical details and preserves public freshness/source status.
6. Financial values refer to canonical platform allocation/ledger IDs and cannot be treated as an emergency-local balance.

## Implementation steps

1. Read the Spec 260 core domain invariants, state machines, consent/disclosure, evidence, verification and R1.35 financial event requirements.
2. Add shared types with names that retain event/incident/situation/need/task distinctions.
3. Add pure validators, transition helpers and an explicit safe public projection mapper.
4. Add the contract regression suite and trace each invariant to one exported type/helper.
5. Map service-specific persistence and authority integration to subsequent sections; do not add schema/migration or worker execution in this section.

## Completion criteria

- Browser, Worker and web server can import the same domain type surface without Node-only dependencies.
- State transitions are deterministic and auditable by construction.
- The public projection API has no fields capable of carrying exact victim coordinates or sensitive identity/medical details.
- Shared contracts do not introduce another identity, ledger, worker queue, media store, or audit storage authority.
- The contract test suite is authored and held for the final integrated test pass.

## Actual implementation record

Added extensible hazard/provenance contracts, the core event-to-case-to-need/task/team/resource/communication/evidence/consent/disclosure/verification/alert/economic-reference model types, independent state transition predicates/helpers, append-audit event construction, and the explicit `toPublicSituationProjection` allowlist. Added tests for taxonomy/provenance validity, state machines, audit construction, and exclusion of private source fields. Test suite intentionally not run per the end-only test instruction.

## Remaining integration

Persistence constraints, transactionally stored audit/outbox records, runtime authz, full triage, provider adapters, financial workflows, and Cloudflare handler wiring remain owned by later plan sections.
