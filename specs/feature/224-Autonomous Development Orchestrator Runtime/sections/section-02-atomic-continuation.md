# Section 02 — Atomic Session Continuation

**Owned paths:** existing workspace registry persistence and its tests; existing Agents SDK scoped tool checks and recovery receipts.

**Prerequisites:** Section 01 policy/identity binding.

**Deliverable:** safely reclaim an abandoned local work unit only after process/lease/source/task checks; advance fencing atomically; resume from durable checkpoint and idempotency receipts.

**TDD:** terminated process, expired lease/live process, concurrent claims, stale reconnect, source mismatch, interrupted transfer, replay and duplicate-effect prevention.

**Acceptance:** one claimant wins; all stale mutations fail; restart preserves same run/phase/selection/tool receipts; no side effect repeats.

**Risks:** unknown process/host state remains blocked; never infer termination from TTL alone.

**Merge readiness:** focused tests and safe compatibility fallback, then normal protected integration.
