# R12 — First Real DevelopmentRun Owner-Action Package

**Checkpoint:** `5f3c8f648d242cf4b1eac164ba91bd3672d4caf9` (`origin/main`, 2026-10-11)
**Disposition:** `BLOCKED_AUTHORITY`; no live execution or completion claimed.

## Current bounded authority inventory

| Prerequisite | State | Evidence and limit |
|---|---|---|
| Linux Runner executable/version/provenance on this host | `ABSENT` | `smartspec-runner` and `runner` are not on PATH; no running systemd unit named for Runner and no `/proc/*/comm` process named Runner was observed. This does not establish the remote registry state. |
| Registered Linux/Windows Runner, session, fresh capability/Codex snapshot | `UNKNOWN` | Canonical registration is PostgreSQL-backed. No authorized registry query succeeded in this session. Historical R11 inventory is not reused as current evidence. |
| Local Codex CLI | `AVAILABLE_BUT_UNAPPROVED` | `codex-cli 0.160.0`; local `codex login status` reports authenticated. This is not a registered Runner session, Runner-bound credential, or approval to dispatch. |
| Source/workspace binding | `UNKNOWN` | No current Runner session or registry record was readable to bind tenant, repository/ref, workspace, actor, and capability revision. |
| Existing non-production grant, job approval, scope, budget/deadline | `UNKNOWN` | These require canonical SPEC-224 authorization records. None were verified. Do not infer a grant from profile or test fixtures. |
| Non-production PostgreSQL target | `UNKNOWN` | The existing profile describes loopback PostgreSQL 15.17 and a non-production fixture class, but is not a live target grant. `smartspec_test` could not be queried: the default 5433 socket was absent and TCP 5432 rejected the available `dev` credentials. No database contents were read or changed. |
| Persisted DevelopmentRun/event/evidence authority | `UNKNOWN` | No authenticated query established the schema, event rows, evidence-store bindings, or restart-readback path for a current disposable target. |
| Remote source-trust verifier adapter/configuration | `ABSENT` | The repo has a verifier contract and an owner-approval request, but no approved production authority adapter/configuration was established. The 2026-10-09 inventory explicitly left account-level issuer/key/storage resources unknown. |
| Independent verifier authority | `UNKNOWN` | Unit-test verifier seams exist; no live separately authorized verifier/session was identified. |
| Canonical delivery policy | `AVAILABLE_BUT_UNAPPROVED` | Existing user-workspace policy remains the default. Server-managed delivery proposal is not activated and requires SPEC-224 owner/security approval plus immutable target binding. |

## Local source and remote trust decision

The shortest candidate path is a wholly local source bundle in an isolated non-production Runner workspace, using `LOCAL_NONPRODUCTION_INTEGRITY_ONLY`. The current admission code only permits that class through its bound local non-production path in `NODE_ENV=test` or `development`; it still requires canonical grants and tenant/run/job/attempt/source/workspace binding. It does not authorize Runner dispatch by itself.

This path avoids the remote-source trust class only if the selected source is actually produced and verified locally within that approved fixture. If the job obtains its source bundle from a remote source or the authority selects `REMOTE_TEST_TRUSTED`, it must satisfy the remote trust verifier and configured issuer/storage/revocation policy. No local-attestation label, S3/R2 reference, digest, or synthetic test may substitute for that authority. Keep remote-trusted admission `DENY` until it is verified.

The checked-in profile `apps/web/server/services/profiles/spec224-recovery-registered-runner-nonprod.v1.json` is a profile contract, not a grant or current Runner proof. It pins source commit `08895596129d3168bb944387d76bf86b4a9b180c` and tree `ac3ee49fae33d5fba2c54aa81396950710afb88c`, so it does not identify the current R12 source at `5f3c8f6`. Do not reuse its identity as current execution evidence without an owner-approved profile/target binding.

## One bounded owner action

**Accountable authority:** SPEC-224/workspace-authority maintainer (the role named by the canonical SPEC-224 blocker), with the Platform/Runner owner and SPEC-224 Security owner for their respective decisions. No authenticated individual owner identity was present in current evidence; those owners must be named in the approval record rather than inferred from historical commits.

Provide one durable, authenticated non-production authorization package referencing existing resources (IDs/references only; no secret values) with:

1. **Runner identity and freshness:** exact registered Runner ID, tenant, owner, platform, installed version/provenance, active session ID, fresh capability snapshot ID/revision/expiry, `agent.external_task` capability, Codex readiness, and authenticated source/workspace binding. State whether the selected host is Linux or Windows.
2. **Single-job grant:** exact DevelopmentRun/WorkUnit, actor/tenant/project, repository and permitted ref/base SHA, allowed commands, network boundary, cancellation behavior, maximum runtime/resource/economic budget, grant ID/version/scope digest, and expiry. Scope it to one reversible disposable-repository task.
3. **Disposable persistence target:** exact non-production PostgreSQL resource identity, supported current app schema and revision, authorized reader/writer principal references, and secure connection-secret reference. Confirm DevelopmentRun, worker-job/outbox, event, evidence, and Task Control persistence are available. No production migration or production DB use.
4. **Delivery target decision:** choose and record either (a) an explicitly registered disposable user workspace, retaining the existing exact-SHA local convergence requirement, or (b) the proposed server-managed canonical target with SPEC-224 owner/security approval, immutable target binding, guarded Git integration, and independent verification. Do not use the dirty primary checkout as the disposable fixture or silently change the default policy.
5. **Evidence authority:** identify the canonical issuer/event store and the independent verifier principal/service, including readback/replay authority and revocation/invalidation semantics. If the source is remote, also provide the approved remote issuer/key fingerprint, storage account/bucket/prefix, distinct writer/verifier identities, freshness limits, and revocation authority. Do not include credentials or key material.
6. **Durable approval reference:** authenticated approver identity, exact scope, expiration, budget and environment, approval record URI/ID, and the owner for revocation/incident handling.

Existing implementation to activate through its supported path: `spec224AuthorizationService.ts`, `spec224RuntimeAdmission.ts`, `spec224DevelopmentRunPersistence.ts`, `spec224RunnerContinuationReconciler.ts`, the `runner_nodes`/`runner_capability_snapshots` registry, and the existing `worker_jobs` plus outbox control plane. This package requests no new keys, buckets, service principals, grants, reservations, or binaries. If no suitable resources already exist, the named owners must provision them through their established platform workflows before execution is reconsidered.

## First task after authorization

Use one owner-authorized disposable Git repository and one bounded WorkUnit to implement a small utility with an executable acceptance test, intentionally observe the real failing test, let actual Codex run through the registered Runner to repair it, retest, and independently verify it. Persist the source commits, command/output evidence, verifier result, requirement closure, event/receipt, Task Control projection, and same-run restart readback. Run stale-lease, cancellation-race, duplicate-reconciliation, and conflicting-replay denials against the approved fixture. Do not use deterministic implementation fixtures as live execution.

## Reactivation predicate

Resume only when the durable approval package above is present and current; the Runner/session/snapshot and job grant revalidate against the exact target; the disposable schema/evidence authority can be read through approved credentials; the selected local-vs-remote source trust class is proven; and one of the two delivery modes is explicitly authorized. Until then: no dispatch, no database mutation, no remote trust downgrade, no server-managed completion activation, and no repeated synthetic acceptance cycle.
