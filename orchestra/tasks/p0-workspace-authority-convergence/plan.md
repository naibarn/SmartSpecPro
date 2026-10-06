# P0 Workspace Authority and Convergence — Plan

## Task analysis

- Scope: large, cross-cutting lifecycle implementation with normative changes to SPEC-293/294/295.
- Risk: high for local-data preservation and completion truth; no production mutation or destructive bulk cleanup is in scope.
- Activation: direct from the user's detailed implementation brief; no repository archaeology repeat.
- Baseline in the supplied brief: `b62f61ac05032dd5908bebfe18efd46adf77f9bc`. Latest canonical source for this handoff: `1b93981fdde901e30ca6f681af02315de68d65cb` (`origin/main`).
- Current route: direct conductor with one required read-only architecture scout; implement sequentially because core registry, script callers, backend completion, and specs have dependency edges and shared contracts.
- Dispatch preference: `direct-standard-light`; no parallel writers.

## WorkUnits

| ID | Scope | Completion predicate | State |
|---|---|---|---|
| WU-1 | Shared SQLite registry/resolver, stable identities, explicit roles, local owner leases, divergence and dirty recovery receipt | 13 focused fixture tests pass for explicit roles, external clone binding, live/stale owner distinction, and byte-preserving dirty snapshot | IMPLEMENTED_LOCAL; cross-host authority adapter remains open |
| WU-2 | Canonical convergence and safe worktree retirement | Fixture tests prove clean fast-forward, dirty preservation, stash/local-work gates, dry-run-required retirement and retirement receipt; canonical-advance races and large registry stress remain unexecuted | PARTIAL |
| WU-3 | Integrate lifecycle skills, preflight, shared completion policy, deep-implement and Spec-224 completion gate | Skills and runtime CLI bind convergence/retirement receipts to Spec 224 run identity; final completion validates structured receipt fields and evidence refs. External artifact authentication and non-Spec-224 runtime adapters remain open | PARTIAL |
| WU-4 | SPEC-293/294/295 amendments and 30-case regression fixture | Normative authority boundaries and scenario descriptors are present; only focused behavior is proven, not all local cases, repeated races, product UI, or production runtime behavior | PARTIAL |
| WU-5 | Installed skill sync, scoped tests, review, canonical checkpoint/handoff | PRs #93, #95, #96 merged; skill parity, Handoff validation, focused gates, and canonical user-workspace SHA convergence recorded | CHECKPOINT_PROMOTED_PARTIAL |

## Test-first requirements

See `test-design.md`. Run the focused red tests before implementation. Do not run repository-wide typecheck/build under shared-host policy.

## Impact boundary

- In scope: `.development-repository.toml`; `scripts/development-lifecycle/`; lifecycle policy and tests; `apps/web/server/services` Spec-224 completion/WorkUnit contracts and tests; skills named by the P0 request; SPEC-293/294/295 and their Handoff evidence; task-specific regression scenario fixture.
- Quality gate only: Runner workspace/session registry; read-only compatibility audit required before adapting any data model. Do not duplicate that runtime's identity or live-process authority.
- Separately gated: production migrations/deployments and Cloudflare provider mutations. Required follow-up, not completed here: Mission Control UI/actions and a cross-host registry/authority adapter. No new queue/job/evidence authority or blind worktree sweep is permitted; unrelated stale Orchestra task records remain outside this task.

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

- PR #93 merged as `392b41dbaadcee6bfb4497735d451db8b553aef7`; PR #95 merged as `a6c67a6cd888b64d7822a22e736e9ca3cd845527`; PR #96 merged as `1b93981fdde901e30ca6f681af02315de68d65cb`.
- The shared Spec Handoff writer reconciled SPEC-293/294/295 and regenerated global status/index views. After the follow-up merges, manifests now record source SHA `1b93981fdde901e30ca6f681af02315de68d65cb`, lifecycle `PARTIAL_INTEGRATED`, and next WorkUnit P0-WU-4. Validation/index checks pass.
- P0-WU-3 now binds convergence and retirement receipt fields, repository/project/task identity, receipt IDs, Git SHAs, clean state, ownership state, and timestamps to Spec 224 Final Verify. CLI and lifecycle skill instructions pass the run ID; receipts remain structured evidence without cryptographic signatures or external artifact-source authentication.
- On exact source SHA `1b93981fdde901e30ca6f681af02315de68d65cb`, focused Spec-224 verification passed 13/13, workspace authority/lifecycle policy tests passed 23, and Spec Handoff framework tests passed 82. Skill audit passed 330. Full two-file Spec-224 run passed 25 tests and retains one unrelated resource-event idempotency failure (`RUN_IDEMPOTENCY_CONFLICT`, before completion logic).
- P0-WU-4 must execute all applicable local behaviors and repeated races from the 30-case matrix. Mission Control UI/actions, distributed cross-host authority, external receipt authentication, and production convergence runtime remain unimplemented or unproven.
- Post-merge resolver regression is fixed and tested: a clean registered canonical user workspace can fast-forward its current branch when `main` is checked out elsewhere, without changing the other checkout. Convergence receipt `87c6e967-b7e6-4d9a-bf62-dba381b05090` and `verify` confirm `/home/dev/projects/SmartSpecPro` is clean at `1b93981fdde901e30ca6f681af02315de68d65cb`.
- The Spec Handoff writer records SPEC-293/294/295 normative changes at `392b41dbaadcee6bfb4497735d451db8b553aef7`; later PRs changed implementation and handoff metadata only.
- Next WorkUnit: P0-WU-4 — add and execute scenario-level local tests and repeated concurrency/race coverage; next design and implement the cross-host Mission Control and SPEC-295 runtime projection without creating duplicate execution/evidence authority. Full P0 remains open.
