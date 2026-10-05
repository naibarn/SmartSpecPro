# Lifecycle Migration Audit — Checkpoint

Audit basis: refreshed `origin/main` SHA `8cf37809415ac64624744f8036a6e54ca395de3d`, prior convergence branch at `ca0d3bd09264113e03b946818508075b55fe4226`, and targeted source/caller scans on 2026-10-05.

## Implemented or partially implemented

| Surface | State | Evidence / residual work |
|---|---|---|
| `AGENTS.md` | Partial | Now describes continuous checkpoints against a configured canonical ref; other local/session policy and source lifecycle still need full audit. |
| `session-finish` | Partial | Task completion is no longer the trigger; generic ref names and policy-backed branch verification are in place. Checkpoint commit/promotion/handoff is still procedural and does not persist a generic WorkUnit record. |
| `integration-controller` | Partial | Discovery is marker-independent and compares candidates to configured canonical ref; it inventories refs/worktrees, but it does not yet reconcile all durable worker/run/handoff/provider records or perform semantic deduplication. |
| `canonical-checkout-sync` | Partial runtime migration | Active prepare/run wrappers now use the isolated source adapter; old mutate-shared-checkout scripts fail closed as deprecated. All repository CI/release/deploy/provider callers are not proven migrated. |
| Exact Git source adapter | Implemented local slice | `scripts/development-lifecycle/canonical_source.py` reads repository policy, validates exact ancestry, prepares clean detached worktrees outside the shared checkout, and fences local leases by repo/revision/purpose. Cross-host leases still require the existing distributed `worker_jobs`/outbox path. |
| Orchestra resume | Partial | Snapshot/canonical authority is documented; generic durable handoff lookup and overlap suppression against authoritative records remain unimplemented. |
| Spec 224 `DevelopmentRun` | Existing authority, incomplete compatibility | Existing runtime persists work/run execution projection in `worker_jobs.progressJson.spec224`; targeted search did not find a canonical integrated-SHA/completed-scope/remaining-scope handoff contract in its service implementation. Extend this owner only after source-origin identity is mapped. |
| Spec 186 `worker_jobs` and outbox | Implemented authority | Keep execution status, lease/fencing, events, dispatch and durable long-running work here; this change adds no queue. |
| Spec 278 runner session | Existing authority | Local/remote runner continuity must re-check current job authorization and the exact canonical source. This audit does not prove provider/cloud execution migration. |
| Specs 261/277 app and Task Control surfaces | Partial/proposed | Keep immutable app versions with Spec 261 and task projection with existing read-model owner. Partial accepted drafts and generic lifecycle visibility remain unverified. |

## Active source/build callers

Targeted `rg` across tracked scripts, `.github`, skills, and root documentation found the canonical-checkout skill as the only repository caller of `prepare-canonical-checkout.sh` / `run-certified-command.sh`. The wrappers now route to the source lease. No CI, release, or deploy script caller was found in that search; absence of a match is not proof that external deployment systems are migrated.

The remaining canonical checkout helper files are deprecated and return `DEPRECATED_USE_ISOLATED_CANONICAL_SOURCE_LEASE` without mutation. `session-finish` and `integration-controller` inventory/baseline scripts resolve remote/ref via the same repository policy rather than inferring `origin/main`.

## Safety boundaries

- The local source lease is advisory/fenced on the local filesystem and is not a distributed cross-host lock. Remote/cloud execution must obtain canonical `worker_jobs`/outbox authority and use its fencing tokens.
- Git-only source preparation is not a generic non-Git canonical target adapter.
- A clean source worktree proves SHA/input isolation; it does not prove build success, provider acceptance, deployment, or runtime behavior.
- The source lease does not persist WorkUnit ownership, continuation triggers, validation obligations, or Task Control status.

## Not reconciled

The previously discovered 85 branch-ref records, 117 worktrees, 27 dirty current inventory entries, and durable run/task records have not been semantically reconciled in this checkpoint. Unknown-owner, dirty, rescue, and detached work remains preserved. The prior inventory is triage only and must be refreshed before any promotion or cleanup decision.
