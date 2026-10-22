# SmartAIHub Runner Companion WP2A — projection hardening

Date: 2026-10-22  
Source commit: `9f8234844` (`fix(runner): harden companion terminal and evidence projection`)  
Reconciled base: `324c19475c5d64eb91095a670b20e8eb7135e87c`

## Hardened boundaries

- Durable terminal worker status wins over stale approval/input/cancellation
  metadata. Completed, failed, cancelled and expired tasks cannot reopen as
  `waiting_for_approval` during reconnect or projection refresh.
- Pending approvals are projected only for tasks whose canonical status is
  `waiting_for_approval`; resolved approval history remains observable.
- Evidence output IDs are bounded per task and the projection enforces a
  global evidence bound before schema validation, preventing overflow from
  untrusted read-model arrays.
- Tenant-shared Runner rows with `ownerUserId = NULL` remain visible through
  the documented tenant projection, but do not grant user execution-session
  authority. Bind and revoke still require the existing owner/session
  authority.

## Focused verification

- Terminal-precedence regression tests cover completed, failed and cancelled
  tasks carrying stale pending approval metadata.
- Evidence overflow regression covers multiple tasks with oversized output
  reference arrays and verifies both global and per-task bounds.
- Shared-device visibility/authority regression verifies that a tenant-shared
  Runner cannot be bound or revoked by an arbitrary tenant user.
- Focused Runner Companion, Task Control, worker-job, observability and Runner
  gateway suites passed: 5 files / 57 tests.

This is source-level and mocked read-model evidence only. It does not claim
authenticated native acceptance or real-device Runner E2E.
