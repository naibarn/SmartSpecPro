# SPEC-275 WP1 — Fixture-Level Evidence Intake

**Status:** preparation only; no SPEC-275 runtime ownership or implementation is claimed.

**Prepared against `origin/main`:** `bdb04334b72d7833571a77261260e8775789e7bf`

**SPEC-275 normative digest:** `e066de3f307be39d2aa2b3aeb3382bef90c52e9544a3cf08c1da9c2af309b246` (revision 1.1)

**SPEC-271 receipt implementation SHA:** `5b9730424642f45dbf58a2af45aeb1beebc303ab`

This package defines a test-fixture boundary for consuming source-bound SPEC-271 evidence as SPEC-275 failure observations. It does not amend `spec.md`, change the SPEC-275 handoff, write runtime services, create a queue/ledger, or promote learning candidates. The canonical SPEC-275 handoff currently has unresolved authority/disposition and no implementation work unit or named WP1 owner. Runtime work therefore requires an explicit owner and authority binding.

## Requirement links

| Stable requirement | WP1 relevance |
| --- | --- |
| `REQ-3E279092D72A` | Capture structured execution and verification evidence. |
| `REQ-F77B870DC7CC` | Historical replay must respect tenant isolation and data retention. |
| `REQ-11594872B177` | Evidence must not be promoted across tenant boundaries. |
| `REQ-F626F73C40F4` | Suspicious evidence must be quarantinable and excluded from automatic promotion. |
| `REQ-373ED4B97474` | Critical candidate/promotion state must be reconcilable from durable records and destination authority receipts. WP1 must preserve lineage for later work; it does not implement promotion. |

Normative anchors are SPEC-275 §6.1–6.2 (execution evidence and `FailureObservation`), §34–37 (offline evidence, idempotent events, existing storage and security), and INV-275-02/03/06 (evidence before learning, verification before trust, scope preservation).

## Existing contracts and compatibility

| Authority | Existing contract | WP1 use and boundary |
| --- | --- | --- |
| SPEC-271 portable receipt | `apps/web/server/services/spec271PortableEvidenceReceipt.ts`; `Spec271PortableEvidenceReceipt` v1 binds requirement, source SHA, UAT run, attempt, tenant/project, scenario/schema/environment, oracle decision, artifact hashes, timestamp and provenance. `verifySpec271PortableEvidenceReceipt` checks the receipt digest. | Consume as an evidence reference after digest and scope checks. Its embedded `evidenceStatus` remains `VALIDATED_UNPERSISTED`. |
| SPEC-271 object adapter | `apps/web/server/services/spec271DurableEvidenceReceiptStore.ts`; at `5b973042...` it returns `OBJECT_PERSISTED_REVALIDATED`. | Object read-back and revalidation are useful fixture inputs. This result is not canonical acceptance/finality and must not be treated as one. |
| SPEC-224 run/event | `apps/web/server/services/spec224DevelopmentRunContracts.ts`; `DevelopmentRun` has `runId`, `tenantId`, `phaseAttempt`, `workerJobId`, `eventSequence`, idempotency keys, events and optional `metadata.projectId`. `DevelopmentEvent` has `eventId`, `runId`, `sequence`, `idempotencyKey`, type, payload and `occurredAt`. | Fixture input can model an `EVIDENCE_RECORDED` event referencing a receipt. Production ingestion must resolve the event and run from their existing durable authority. |
| SPEC-224 persistence | `apps/web/server/services/spec224DevelopmentRunPersistence.ts` uses the existing job-control/event path. | Do not add a second event store. No WP1 code may write SPEC-224 run state or `worker_job_events` without that owner. |
| SPEC-275 observation | `spec.md` §6.2 defines `failure_id`, `run_id`, `stage`, `category`, `signature`, `symptom`, `evidence_refs`, causes, confidence, blast radius, reversibility and detector. | Preserve the required fields; carry the requested six-way `failure_class` in the fixture envelope as an additive intake classification. Do not silently expand the normative category vocabulary. |

### Identity binding rules

- Preserve the exact SPEC-271 `uatRunId`, `attemptId`, `tenantId`, `projectId`, `sourceSha`, scenario/schema revisions and environment fingerprint in every fixture.
- Preserve SPEC-224 `runId`, `phaseAttempt`, `tenantId`, `metadata.projectId`, event ID, sequence and idempotency key separately. Do not guess that `uatRunId == runId` or coerce `phaseAttempt` into `attemptId`; a named authority adapter must define and verify that mapping.
- Require an explicit source-revision binding from the verification/run authority. Do not infer the tested source SHA from a base revision or a caller claim.
- Keep artifact IDs and content hashes as references. Re-resolve bytes and recompute hashes before any non-fixture ingestion; fixture data alone cannot prove authority.
- A receipt may describe a failed or blocked test outcome. Do not require business acceptance `ACCEPTED` to retain a failure observation, and do not infer acceptance from `testOutcome: PASS`.

## Fixture intake envelope

The following shape is for unit fixtures only. Placeholder values are synthetic and are not a receipt or run record.

```json
{
  "schemaVersion": "spec275.fixture-failure-intake.v1",
  "failureClass": "VERIFICATION_FAILURE",
  "receiptRef": {
    "receiptId": "spec271-receipt:<fixture-digest>",
    "receiptDigest": "<fixture-sha256>",
    "receiptStatus": "OBJECT_PERSISTED_REVALIDATED",
    "portableEvidenceStatus": "VALIDATED_UNPERSISTED",
    "requirementId": "REQ-962CDCE30AEF",
    "sourceSha": "<fixture-git-sha>",
    "uatRunId": "uat-fixture-1",
    "attemptId": "attempt-fixture-1",
    "tenantId": "tenant-fixture-a",
    "projectId": "project-fixture-a",
    "scenarioId": "scenario-fixture-1",
    "scenarioRevision": "scenario-r1",
    "schemaRevision": "schema-r1",
    "environmentFingerprint": "<fixture-sha256>",
    "evidenceArtifactRefs": [{
      "artifactId": "artifact-fixture-1",
      "contentSha256": "<fixture-sha256>"
    }]
  },
  "runEventRef": {
    "runId": "run-fixture-1",
    "phaseAttempt": 1,
    "tenantId": "tenant-fixture-a",
    "projectId": "project-fixture-a",
    "eventId": "event-fixture-1",
    "sequence": 3,
    "idempotencyKey": "evidence:fixture-1",
    "type": "EVIDENCE_RECORDED",
    "occurredAt": "2026-10-08T09:00:00.000Z"
  },
  "observation": {
    "failureId": "failure-fixture-1",
    "stage": "verification",
    "category": "VERIFICATION_FAILURE",
    "signature": "<deterministic-fixture-signature>",
    "symptom": "Synthetic verification oracle rejected the expected outcome",
    "evidenceRefs": ["spec271-receipt:<fixture-digest>", "artifact-fixture-1"],
    "detectedBy": "test"
  }
}
```

`receiptStatus` here records only the object adapter result. A production intake must additionally verify the receipt reference through the existing authoritative run/job event or receipt-state mechanism before treating it as durable accepted evidence.

## Failure classification

Keep `failureClass` as an exact, separately validated enum. Map to SPEC-275's existing `category` conservatively; retain the original class in fixture evidence so aggregation cannot collapse distinct failure causes.

| Intake `failureClass` | Initial SPEC-275 `category` mapping | Mapping constraint |
| --- | --- | --- |
| `MODEL_REASONING` | `AGENT_REASONING_ERROR` | Require a verification or human-reviewed observation; do not infer from model self-report. |
| `TOOL_RUNTIME` | `TOOL_MISSING` only when absence is evidenced; otherwise `UNKNOWN` | Keep provider/tool errors and missing-tool conditions distinguishable in `stage` and signature. |
| `POLICY_DENIAL` | `PERMISSION_REQUIRED` or `POLICY_CONFLICT` when the corresponding authority evidence exists; otherwise `UNKNOWN` | A denial is not automatically a failure or human intervention. Preserve the policy decision reference. |
| `RESOURCE_BLOCK` | `RESOURCE_CONFLICT` | Preserve SPEC-224 resource outcome and observation; OOM/resource admission is not a code failure. |
| `EXTERNAL_WAIT` | `EXTERNAL_DEPENDENCY` | Preserve dependency identity, wait state and wake/evidence reference. |
| `VERIFICATION_FAILURE` | `VERIFICATION_FAILURE` | Preserve the independent oracle and failed assertion/evidence reference. |

Unknown classes, missing evidence references, unverifiable receipt digests, scope mismatch and stale receipts fail closed or enter quarantine. They must not be silently mapped to a successful observation.

## Fixture deduplication and freshness

- Use a stable dedupe key derived from the authoritative event idempotency key plus receipt ID and failure class.
- Same dedupe key and same canonical payload digest is an idempotent replay and counts once.
- Same dedupe key with a different payload, source, tenant/project, failure class or receipt digest is a conflict; quarantine it and preserve both references for inspection.
- Apply the owning evidence policy's maximum age to receipt `verifiedAt`, artifact timestamps and event time. No default TTL is invented in this package. A stale fixture must be rejected deterministically.
- Before production ingestion, re-resolve tenant/project permission, run/event identity, receipt state and artifact bytes using existing authorities. A fixture passing these checks proves only normalizer behavior.

## Focused acceptance tests for a future owned implementation

1. Valid source-bound fixture normalizes into SPEC-275 `FailureObservation` fields without dropping receipt/run/event lineage.
2. Each of the six `failureClass` values remains distinct and maps only under the table's evidence constraints.
3. Receipt/event mismatch in run, attempt, tenant, project, source SHA, scenario/schema revision or environment fingerprint is rejected.
4. Missing, altered, stale, revoked or digest-invalid receipt/artifact evidence is rejected or quarantined, never counted as a valid learning signal.
5. Cross-tenant and cross-project fixtures are denied; no evidence is promoted between scopes.
6. Same idempotency key and same canonical payload replays once; conflicting content or classification is rejected and inspectable.
7. Out-of-order or duplicate SPEC-224 event fixtures preserve sequence and idempotency identity and cannot duplicate counts.
8. `OBJECT_PERSISTED_REVALIDATED` and embedded `VALIDATED_UNPERSISTED` are not presented as canonical durable acceptance without the authoritative event/receipt binding.
9. `testOutcome: PASS` alone does not create success or business acceptance; failed/blocked receipts remain eligible as failure evidence when independently verified.
10. Fixture rejection output preserves exact source SHA, requirement ID, run, attempt, tenant/project, event and receipt identities.

## Ownership and collision boundary

- **SPEC-275 WP1 runtime owner:** not established in the current handoff or observed worktrees. Claim an owner and file paths before implementation.
- **SPEC-271 receipt contract/verification:** SPEC-271 UAT/verification owner; consume the existing v1 receipt and object adapter, do not change their contract in WP1.
- **SPEC-224 DevelopmentRun/job-event:** SPEC-224 run/job-control owner. Permission required to add an authoritative receipt event or adapter.
- **Tenant/project authorization and retention:** existing policy owners are not identified by the SPEC-275 handoff. Their adapters and data-class retention predicates must be supplied before production ingestion.
- **Allowed next scope:** a fixture-only normalizer and tests under a future explicitly owned SPEC-275 implementation path, after ownership is claimed. It may not mutate SPEC-224, SPEC-271 receipts, shared event schemas, tenant policies, skill registries, learning candidates or production state.

## Readiness decision

**WP1 is implementation-ready for fixture-only normalization after a SPEC-275 owner claims the runtime paths.** It is **not ready for production ingestion or learning** until the authoritative run/event binding, tenant/project authorization, receipt state and retention contracts are available and tested. SPEC-275's unresolved handoff remains unchanged. No WP1 runtime code, skill promotion, shadow/canary learning or production mutation is part of this package.
