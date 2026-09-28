<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-spec-identity-and-source-map
section-02-inference-contract-and-compatibility
section-03-policy-admission-and-deterministic-router
section-04-model-deployment-qualification
section-05-plan-attempt-and-economics
section-06-provider-surfaces-state-and-jobs
section-07-consumer-adoption
section-08-evaluation-data-and-learning
section-09-admin-user-experience
section-10-certification-and-rollout
END_MANIFEST -->

# Spec 231 Implementation Sections Index

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-spec-identity-and-source-map | - | 02–10 | Yes |
| section-02-inference-contract-and-compatibility | 01 | 03–10 | No |
| section-03-policy-admission-and-deterministic-router | 01, 02 | 04–10 | No |
| section-04-model-deployment-qualification | 02, 03 | 05–10 | No |
| section-05-plan-attempt-and-economics | 02, 03, 04 | 06–10 | No |
| section-06-provider-surfaces-state-and-jobs | 02–05 | 07–10 | No |
| section-07-consumer-adoption | 02–06 | 08–10 | No |
| section-08-evaluation-data-and-learning | 02–07 | 09–10 | No |
| section-09-admin-user-experience | 02–08 | 10 | No |
| section-10-certification-and-rollout | 01–09 | - | No |

## Execution order

1. Map ownership and collision-safe `spec_uid` while preserving the unresolved live registry gate.
2. Implement and test the strict v2 contract and legacy negotiation adapter.
3. Build deterministic hard-filter policy admission before any advanced signal.
4. Qualify immutable model/deployment/surface revisions and current pricing.
5. Persist plans, attempts and canonical budget/settlement evidence.
6. Add Gateway/direct/local surfaces, route pinning, state handoff and durable-job ownership.
7. Adopt consumers incrementally, keeping current behavior until each gate passes.
8. Add evaluation lifecycle/learning safeguards, then Admin/User surfaces.
9. Run the complete conformance, failure and rollout evidence suite. Production gates remain external until exercised on the authorized target.

## Section summaries

### section-01-spec-identity-and-source-map
Immutable Spec UID, numbering-collision guard, caller/source owner map and baseline evidence.

### section-02-inference-contract-and-compatibility
Strict SAH-INFERENCE-2 + R4 types/schemas, trusted context binding and explicit v1 negotiation.

### section-03-policy-admission-and-deterministic-router
Most-restrictive policy intersection, hard capability/privacy/budget/deadline filters, AUTO/locks, deterministic scoring and reason receipts.

### section-04-model-deployment-qualification
Versioned logical model/deployment/credential/surface profiles, fresh probes, pricing and health qualification.

### section-05-plan-attempt-and-economics
Immutable plans, attempt ownership/idempotency, canonical credit reservations, invoice reconciliation and outbox evidence.

### section-06-provider-surfaces-state-and-jobs
Cloudflare Gateway/direct/local adapters, immutable route pins, conversation continuation, streams/deadlines and canonical `worker_jobs`.

### section-07-consumer-adoption
Incremental shared-router integration for Chat, Workflow, Agents, RAG and governed multimodal callers, with exceptions inventoried.

### section-08-evaluation-data-and-learning
Consent/lineage/deletion, deterministic golden evaluation, counterfactual validity, poisoning controls and disabled-by-default learning.

### section-09-admin-user-experience
Versioned profile/rollout administration, route inspector, AUTO-by-default user choices, explicit locks, authorization and responsive/a11y tests.

### section-10-certification-and-rollout
R2/R3/R4 acceptance traceability, staging failure drills, signed rollout bundles, canary/rollback and production evidence gates.
