# Section 05: Cloudflare Queues and durable job control

## Requirements

REQ-311-10, REQ-311-11, REQ-311-12, REQ-311-13.

## Prerequisites

section-02. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Existing canonical worker_jobs/outbox repositories/publishers, Cloudflare queueConsumer/controlPlaneHandler and related transport/admission code, registered executors and scheduling/polling adapters.

## Implementation tasks

Audit live Queue/DLQ bindings, deployment scopes and existing capability flags before adding code. Port job intake and transactional outbox, publisher recovery and Worker consumer execution under existing versioned envelopes and lease/fencing contracts. Preserve producer/consumer rollout compatibility and secrets outside envelopes. Implement explicit settlement/ack ordering, duplicate/out-of-order handling, retry/delay, cancellation and DLQ replay authorization.

Migrate required cron/recovery/provider polling operations to existing Workers/Queues boundaries. Prove dispatch ownership so shared-db Debian dev and Cloudflare consumers cannot compete for the same target job. Coordinate in-flight drain/fence and rollback without replaying irreversible side effects. Every active job type receives an actual Worker executor or remains blocked under section 06; infrastructure Queue availability alone cannot close coverage.

## Focused verification

Crash before/after DB commit, Queue send and publish-marker persistence; duplicate/out-of-order delivery; expired/stale fencing token; cancellation race; external effect success before consumer death; retry/DLQ/replay; worker restart; multiple tenant fairness; shared-db Debian/Cloudflare consumer scope exclusion; no early ack or lost responsibility.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
