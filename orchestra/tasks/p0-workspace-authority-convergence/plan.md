# P0 Workspace Authority and Convergence — Plan

## Task analysis

- Scope: large, cross-cutting lifecycle implementation with normative changes to SPEC-293/294/295.
- Risk: high for local-data preservation and completion truth; no production mutation or destructive bulk cleanup is in scope.
- Activation: direct from the user's detailed implementation brief; no repository archaeology repeat.
- Baseline in the supplied brief: `b62f61ac05032dd5908bebfe18efd46adf77f9bc`. Latest fetched canonical during this run: `d75831b6db9e9a19850f68a2c5625ea9b6fb0de3` (`origin/main`); it remains the base of this task branch.
- Current route: direct conductor with one required read-only architecture scout; implement sequentially because core registry, script callers, backend completion, and specs have dependency edges and shared contracts.
- Dispatch preference: `direct-standard-light`; no parallel writers.

## WorkUnits

| ID | Scope | Completion predicate | State |
|---|---|---|---|
| WU-1 | Shared SQLite registry/resolver, stable identities, explicit roles, local owner leases, divergence and dirty recovery receipt | 13 focused fixture tests pass for explicit roles, external clone binding, live/stale owner distinction, and byte-preserving dirty snapshot | IMPLEMENTED_LOCAL; cross-host authority adapter remains open |
| WU-2 | Canonical convergence and safe worktree retirement | Fixture tests prove clean fast-forward, dirty preservation, stash/local-work gates, dry-run-required retirement and retirement receipt; canonical-advance races and large registry stress remain unexecuted | PARTIAL |
| WU-3 | Integrate lifecycle skills, preflight, shared completion policy, deep-implement and Spec-224 completion gate | Skill/Python/Spec-224 focused suites run; existing completion now requires convergence and retirement receipts. Receipt production/binding across all runtime callers remains an open adapter obligation | PARTIAL |
| WU-4 | Normative SPEC-293/294/295 amendments and 30-case regression fixture | Authority boundaries and all 30 scenario descriptors are present; the checker validates row coverage/repetition, but all 30 behavioral scenarios were not executed | PARTIAL |
| WU-5 | Installed skill sync, scoped tests, review, canonical checkpoint/handoff | Skill parity passed; focused gates recorded. Integration, post-merge Handoff writer update, canonical workspace convergence, and PR SHA evidence remain pending | IN_PROGRESS |

## Test-first requirements

See `test-design.md`. Run the focused red tests before implementation. Do not run repository-wide typecheck/build under shared-host policy.

## Impact boundary

- In scope: `.development-repository.toml`; `scripts/development-lifecycle/`; lifecycle policy and tests; `apps/web/server/services` Spec-224 completion/WorkUnit contracts and tests; skills named by the P0 request; SPEC-293/294/295 and their Handoff evidence; task-specific regression scenario fixture.
- Quality gate only: Runner workspace/session registry; read-only compatibility audit required before adapting any data model. Do not duplicate that runtime's identity or live-process authority.
- Out of scope: production migrations/deployments, Cloudflare provider mutations, Mission Control frontend implementation, new queue/job/evidence authority, sweeping old worktrees as part of this implementation, unrelated stale Orchestra task records.

## Loop policy

```text
orchestra_id: p0_workspace_authority_convergence
purpose: implement shared development workspace authority
iteration: 1/12
tool_call_batches: tracked by progress entries; exact host count unavailable
estimated_cost_usd: unknown; conservative local-only estimate <= 0.50
dispatch_waves: 1/6 (read-only scout completed)
active_subagents: 0/4
parallel_writers: 0/2
repair_rounds: 0/5
stop_conditions: safe checkpoint integrated; complete closure remains dependent on runtime receipt adapters and full regression matrix
stop_reason: partial implementation checkpoint
```

## Current handoff

- PR #93 merged normally as `392b41dbaadcee6bfb4497735d451db8b553aef7`; implementation commit `b85542829abe4d119f7e31afc04d1cb5d1947a67` is reachable from `origin/main`.
- `/home/dev/projects/SmartSpecPro` was fast-forwarded to `main` at `392b41dbaadcee6bfb4497735d451db8b553aef7`; resolver confirmed SHA parity before the Handoff metadata follow-up edits.
- The shared Spec Handoff writer reconciled SPEC-293/294/295, regenerated global status/index views, recorded the exact integrated SHA and `PARTIAL_INTEGRATED`, and queued P0-WU-3. Validation passed.
- P0-WU-3 now binds convergence and retirement receipt fields, repository/project/task identity, receipt IDs, Git SHAs, clean state, ownership state, and timestamps to Spec 224 Final Verify. CLI and lifecycle skill instructions pass the run ID; receipts remain structured evidence without cryptographic signatures or external artifact-source authentication.
- Focused Spec-224 verification passed 13/13; full two-file run passed 25 tests and retains one unrelated resource-event idempotency failure (`RUN_IDEMPOTENCY_CONFLICT`, before completion logic). Handoff validation/index and 82 framework tests pass; workspace authority/lifecycle Python tests pass 22; skill audit passes 330.
- P0-WU-4 must execute remaining race and 30-case behavioral coverage. Mission Control UI, distributed cross-host authority, production convergence, and race/stress tests remain unimplemented or unproven.
- Handoff metadata and WU-3 follow-up branch: `codex/p0-workspace-authority-handoff-20261007`; its commit/PR are pending.
