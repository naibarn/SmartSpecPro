# P0 Workspace Authority and Convergence — Plan

## Task analysis

- Scope: large, cross-cutting lifecycle implementation with normative changes to SPEC-293/294/295.
- Risk: high for local-data preservation and completion truth; no production mutation or destructive bulk cleanup is in scope.
- Activation: direct from the user's detailed implementation brief; no repository archaeology repeat.
- Baseline in the supplied brief: `b62f61ac05032dd5908bebfe18efd46adf77f9bc`. Latest canonical source for this handoff: `5ee20aa109acd39ec5c876dc1d79161d05113663` (`origin/main`).
- Current route: direct conductor with one required read-only architecture scout; implement sequentially because core registry, script callers, backend completion, and specs have dependency edges and shared contracts.
- Dispatch preference: `direct-standard-light`; no parallel writers.

## WorkUnits

| ID | Scope | Completion predicate | State |
|---|---|---|---|
| WU-1 | Shared SQLite registry/resolver, stable identities, explicit roles, local owner leases, divergence and dirty recovery receipt | Focused fixtures cover explicit roles, external clone binding, live/stale owner distinction, byte-preserving dirty snapshots, and explicit-role persistence across inventory of 120 worktrees | IMPLEMENTED_LOCAL; cross-host authority adapter remains open |
| WU-2 | Canonical convergence and safe worktree retirement | Fixtures cover clean fast-forward, dirty preservation, stash/local-work gates, dry-run retirement, local bundle recovery, main-in-use convergence, and five repeated canonical-advance races | PARTIAL; large automatic retirement and remaining race/stress coverage remain open |
| WU-3 | Integrate lifecycle skills, preflight, shared completion policy, deep-implement and Spec-224 completion gate | Skills and runtime CLI bind convergence/retirement receipts to Spec 224 run identity; final completion validates structured receipt fields and evidence refs. External artifact authentication and non-Spec-224 runtime adapters remain open | PARTIAL |
| WU-4 | SPEC-293/294/295 amendments and 30-case regression fixture | Normative authority boundaries, a Runner-card workspace projection, and local scenario tests exist; the full UI/actions, all local cases, repeated races, and production runtime behavior remain unproven | PARTIAL |
| WU-5 | Installed skill sync, scoped tests, review, canonical checkpoint/handoff | PRs #93, #95, #96, #97, #98, #99, #100 merged; skill parity, Handoff validation, focused gates, and canonical user-workspace SHA convergence recorded | CHECKPOINT_PROMOTED_PARTIAL |

## Test-first requirements

See `test-design.md`. Run the focused red tests before implementation. Do not run repository-wide typecheck/build under shared-host policy.

## Impact boundary

- In scope: `.development-repository.toml`; `scripts/development-lifecycle/`; lifecycle policy and tests; `apps/web/server/services` Spec-224 completion/WorkUnit contracts and tests; skills named by the P0 request; SPEC-293/294/295 and their Handoff evidence; task-specific regression scenario fixture.
- Quality gate only: Runner workspace/session registry; read-only compatibility audit required before adapting any data model. Do not duplicate that runtime's identity or live-process authority.
- Separately gated: production migrations/deployments and Cloudflare provider mutations. Required follow-up, not completed here: a full Mission Control operational view/actions and a cross-host registry/authority adapter. No new queue/job/evidence authority or blind worktree sweep is permitted; unrelated stale Orchestra task records remain outside this task.

## Loop policy

```text
orchestra_id: p0_workspace_authority_convergence
purpose: implement shared development workspace authority
iteration: 2/12
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

- PR #93 merged as `392b41dbaadcee6bfb4497735d451db8b553aef7`; PR #95 merged as `a6c67a6cd888b64d7822a22e736e9ca3cd845527`; PR #96 merged as `1b93981fdde901e30ca6f681af02315de68d65cb`; PR #97 merged as `064f07851a0fe27f531cb2139ad0644a94dbf3f8`; PR #98 merged as `52fe0fead65f8d3542d73f21e0abbf24ce70fb2f`; PR #99 merged as `6b68c02dc9cfe51ac50bf6c34207fad7fea22225`; PR #100 merged as `5ee20aa109acd39ec5c876dc1d79161d05113663`.
- The shared Spec Handoff writer reconciled SPEC-293/294/295 and regenerated global status/index views. Manifests at generation 7 record source SHA `6b68c02dc9cfe51ac50bf6c34207fad7fea22225`, lifecycle `PARTIAL_INTEGRATED`, and next WorkUnit P0-WU-4. Validation/index checks pass.
- P0-WU-3 now binds convergence and retirement receipt fields, repository/project/task identity, receipt IDs, Git SHAs, clean state, ownership state, and timestamps to Spec 224 Final Verify. CLI and lifecycle skill instructions pass the run ID; receipts remain structured evidence without cryptographic signatures or external artifact-source authentication.
- On exact source SHA `1b93981fdde901e30ca6f681af02315de68d65cb`, focused Spec-224 verification passed 13/13, workspace authority/lifecycle policy tests passed 23, and Spec Handoff framework tests passed 82. Skill audit passed 330. Full two-file Spec-224 run passed 25 tests and retains one unrelated resource-event idempotency failure (`RUN_IDEMPOTENCY_CONFLICT`, before completion logic).
- P0-WU-4 now also includes a read-only Runner-card projection for sanitized workspace HEAD/branch/dirty facts; it labels authority unknown and explicitly says clean does not prove sync. It does not provide canonical SHA, project-level Mission Control actions, or cross-host authority. Remaining 30-case, Mission Control, and production proof is open.
- Regression expansion also exposed and fixed two resolver defects: Git bundle creation used raw commit IDs and failed on unique local commits; inventory refresh overwrote explicitly registered roles as `UNKNOWN_WORKSPACE`. The recovery bundle now uses an ephemeral namespaced ref, and resolver refresh preserves the registered role. Latest local suite: 19 authority tests passed, including 120-worktree indexing and five repeated concurrency/ref-advance/resume operations. Runner projection/router and the targeted UI test passed 4 cases.
- Post-merge resolver regression is fixed and tested: a clean registered canonical user workspace can fast-forward its current branch when `main` is checked out elsewhere, without changing the other checkout. Convergence receipt `87c6e967-b7e6-4d9a-bf62-dba381b05090` and `verify` confirm `/home/dev/projects/SmartSpecPro` is clean at `1b93981fdde901e30ca6f681af02315de68d65cb`.
- A later post-PR-97 sync receipt `6dd474ae-8f43-4f4c-98c5-56d8896f7836` verifies the same path clean at `064f07851a0fe27f531cb2139ad0644a94dbf3f8`.
- A post-PR-99 sync receipt `5b55baab-ad6a-4f3a-bb17-ceee24ba44db` verified `/home/dev/projects/SmartSpecPro` clean at `6b68c02dc9cfe51ac50bf6c34207fad7fea22225`. After PR #100, receipt `333c1e42-9c02-4af4-850b-02deb230ee8e` and `verify` confirmed that workspace clean at `5ee20aa109acd39ec5c876dc1d79161d05113663`; final Spec Handoff validate/index reported no drift. Handoff manifests record source SHA `6b68c02dc9cfe51ac50bf6c34207fad7fea22225`; PR #100 changed handoff/task records only.
- Next WorkUnit: P0-WU-4 — integrate the read-only Runner projection, then add/execute remaining scenario-level local tests and repeated concurrency/race coverage; design the cross-host Mission Control and SPEC-295 runtime projection without creating duplicate execution/evidence authority. Full P0 remains open.

## P0-WU-4 continuation — PR #102 and current local checkpoint

- PR #102 (`51404bdab1101ad1f93c7a0d49503049bcbd8a6f`) merged the zero-session/dirty-work closeout, stale metadata retention, and recovery-workspace retirement refusal tests.
- The registered user workspace was converged by receipt `workspace-convergence:0939be35-6c37-46fa-9c6b-05ecd7950ca3` after PR #102 merged as `5dbfe3e2d121fd4519540cfe69abe38c25c58904`; `verify` returned `CANONICAL_CONVERGENCE_VERIFIED` with no reasons.
- Current uncommitted WU-4 checkpoint adds explicit live external-runner lease and patch-equivalent classification tests, maps every `LOCAL_EXECUTABLE` matrix row to a discovered unittest, expands registry scale coverage to 220 worktrees, and retains seven cross-host/release/runtime cases as `CONTRACT_SIMULATION`. Focused gate: 24 authority tests passed; Python compile and `git diff --check` passed. This new checkpoint is not yet integrated.
- The patch-equivalence fixture initially lacked the canonical commit object. After correcting the test to fetch the target first, review showed failed `git cherry` could be misclassified as patch equivalence; resolver classification now fails closed on Git errors.
- SPEC-293/294/295 Handoff manifests are generation 8 and record PR #102's SHA. Post-update `validate --all` passes across 463 records/306 canonical Specs; `index --check` is clean after regenerating the three global projections.
- Remaining P0 scope: cross-host shared authority, complete project-level Mission Control workspace/status/actions, runtime-produced authenticated receipts, SPEC-295 source-to-deployment/migration/Cloudflare/container convergence projection, and live acceptance/production evidence. No production action has been executed. P0 is still `PARTIAL_INTEGRATED`, next WorkUnit P0-WU-4.
