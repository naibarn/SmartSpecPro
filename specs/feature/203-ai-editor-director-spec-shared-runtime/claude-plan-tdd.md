# Spec 203 TDD plan

Testing uses focused Vitest suites under `apps/web` and Rust unit tests in the
Worker crate. Every section writes failing tests before implementation and
retains regression coverage for its public contracts.

## Section 01 — Shared contracts

- Test canonical time round trips, invalid domains, and explicit timebase.
- Test evidence/intent/plan schema, hashes, unknown fields, unsafe values,
  cycles, unsupported operations, degraded status, and change-set idempotency.

## Section 02 — Revisions/CAS

- Test first revision, append, stale conflict payload, duplicate client
  mutation, tenant/user isolation, legacy conversion, and transaction rollback.

## Section 03 — Snapshot/admission

- Test snapshot hash and source/revision pinning, duplicate idempotency, no
  orphan job/outbox row, billing refund, asset ownership, and stale admission.

## Section 04 — Capability/lifecycle

- Test exact operation token, capability-blocked vs waiting-agent, lease loss,
  cancellation, retry/expiration, output degradation projection, and terminal
  transition legality.

## Section 05 — Evidence/compiler/validator

- Add golden deterministic compilation tests, stale/degraded evidence rejection,
  unsafe crop/zoom/timing, protected ranges, linked A/V, conflict resolution,
  and unknown metadata preservation.

## Section 06 — Artifact/QC

- Test output role/hash/probe mismatch, required QC failure, signed upload
  retry, idempotent commit, partial upload recovery, and project artifact link.

## Section 07 — Runtime adapters

- Test Web envelope mapping, source-path parity, exact Worker operation claims,
  unsupported composition scan, contract version mismatch, and asset locality.

## Section 08 — Security/observability

- Test cross-tenant IDs, path/URL rejection, bounded retry/cancellation,
  duplicate billing prevention, and redacted structured events.

## Section 09 — Release gates

- Run focused integration suites, Rust tests, migration rehearsal checks, golden
  fixtures, chaos/lease cases, and browser evidence checklist validation.
