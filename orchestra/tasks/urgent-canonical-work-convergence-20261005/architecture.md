# Universal Development Lifecycle Core — Architecture Checkpoint

## Objective

Provide one project- and work-type-neutral lifecycle contract. A session or provider is an execution context; durable work ownership belongs to the work/run identity and its existing canonical owner. Git source handling is one adapter beneath that contract.

## Authorities

| Concern | Authority | Checkpoint state |
|---|---|---|
| Multi-phase development lifecycle and handoff | Existing DevelopmentRun owner (Spec 224) | Existing owner; missing generic source-origin and partial canonical handoff projection is still under audit. |
| Job execution, leases, events, fencing and dispatch | `worker_jobs` + outbox (Spec 186) | Reuse; no new queue is introduced. |
| Runner process continuity | Existing runner-session owner (Spec 278) | Reuse; a resumed process must re-check current job authority and canonical source. |
| Product/application identity and released versions | Existing SPAAS owner (Spec 261) | Reuse; no Mini App version store is introduced. |
| Exact Git source selection | `scripts/development-lifecycle/canonical_source.py` | Implemented as a local adapter: policy-driven ref, ancestry checks, isolated worktree, fenced source lease. |
| Human-readable policy and routing | `AGENTS.md`, `session-finish`, `integration-controller`, Orchestra | P0.1 partial checkpoint; cross-agent/runtime callers are not fully migrated. |
| Task Control projection | Existing task/run read-model owner | Pending compatibility audit; UI must not become a second state authority. |

## Generic WorkUnit projection target

The core identity must not contain a Spec number or provider identity as its primary key. It correlates an existing durable run/job/application/work record and carries source origin as data:

```yaml
work_id: stable existing owner ID
project_id: stable project ID
repository_id: repository policy ID or non-Git canonical target ID
source: {type: issue|prompt|bug|feature|maintenance|generated|migration|refactor|research-derived, ref: ...}
ownership: {actor: ..., session: ..., harness: ...}
canonical: {kind: git|application-version|workflow-revision|artifact-revision, ref: ..., base_revision: ..., last_integrated_revision: ...}
progress: {state: PARTIAL_INTEGRATED, completed_scope: [], remaining_scope: []}
validation: {completed: [], pending: [], failed: []}
handoff: {resume_from: ..., next_action: ..., next_owner: ...}
artifacts: []
```

This is a contract projection, not authorization to create a second database ledger. Runtime persistence must extend the already-authoritative owner after its ID mapping, tenant boundary, and event semantics are resolved.

## Canonical source request and lease

Repository policy lives at `.development-repository.toml`. The source adapter fetches its configured remote/ref, verifies the exact revision is in that canonical history and any required integrated revision is an ancestor, then prepares a detached worktree outside the shared checkout. The returned lease binds repository ID, canonical ref, exact SHA, purpose, workspace, lease ID, expiry, and fencing generation. Build/test/package/deploy execution validates and holds the lease while running.

The lease/workspace key includes repository ID, revision, and purpose. Different projects, revisions, and purposes cannot silently reuse mutable workspace contents. Expired leases can be reclaimed with a higher generation; a stale generation cannot start execution.

## Lifecycle state boundaries

`CANONICALIZED`, `IMPLEMENTATION_COMPLETE`, `VALIDATION_PENDING`, `VALIDATED`, `RELEASE_READY`, `DEPLOYED`, and `VERIFIED_COMPLETE` are separate facts. A partial checkpoint is a normal continuation state. Heavy verification is revision-bound and follows canonicalization. A failed post-integration check creates a repair against the latest canonical source.

## Not implemented in this checkpoint

- Durable generic WorkUnit/handoff persistence and cross-session lookup.
- All checkpoint trigger integrations (quota, provider shutdown, controller restart, preemption, runner disconnect).
- Integration-controller semantic inventory for every durable branch, dirty worktree, agent artifact, and task/run record.
- Migration of CI, release, remote runner, and deployment callers to source leases; repository search currently finds only the canonical-checkout skill wrappers.
- Non-Git canonical source adapters, multi-project acceptance, overlap/deduplication against durable WorkUnits, and remaining acceptance scenarios.
- Complete post-integration obligation scheduling and Task Control projection.
