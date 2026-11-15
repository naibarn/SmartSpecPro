# Section 01 — Canonical contracts and persisted events

- Requirement IDs: R1.19-1, R1.19-7, R1.19-8.
- Objective: inspect canonical identity/job schema and add the smallest versioned event envelope, scoped cursor persistence and event repository contracts without cloning entities.
- Owned scope: platform `apps/saas-core/src/chat/**`, `apps/saas-core` SQL/migration path if present; SmartSpecPro owned SPEC-312 R1.19 and explicitly relevant contracts only.
- Prerequisites: current `ad04c24` baseline and schema authority confirmed.
- Tests: migration idempotency, envelope validation, ordered cursor, duplicate idempotency, tenant/workspace denial and retention boundary.
- Completion predicate: contract is authoritative and additive; repository writes/reads persist events with correct scope, ordering and dedupe; tests pass; migration evidence recorded.
- Fallback: if an entity schema is absent, leave its ID optional and report unavailable; do not fabricate it.
- Blocker strategy: continue event contract that uses existing job/conversation IDs if downstream project/run mapping does not exist.
