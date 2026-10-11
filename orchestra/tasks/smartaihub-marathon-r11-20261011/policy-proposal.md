# SPEC-224 Canonical Delivery Policy Proposal (Not Activated)

## Current decision

Keep the existing `CANONICAL_USER_WORKSPACE` convergence and task-worktree retirement requirements for every DevelopmentRun. No worker-controlled metadata, completion flag, or evidence reference may weaken them. R21 names the long-lived user-owned workspace as the primary context, and no trusted server-managed target policy or owner approval was found in the current canonical contracts.

## Exact additive contract change proposed for owner review

Add a server-resolved, immutable `deliveryTarget` binding when a DevelopmentRun is created:

```ts
type DevelopmentDeliveryTarget =
  | Readonly<{
      kind: "USER_WORKSPACE";
      projectId: string;
      repositoryId: string;
      canonicalRef: string;
      canonicalUserWorkspaceId: string;
    }>
  | Readonly<{
      kind: "SERVER_MANAGED_CANONICAL";
      projectId: string;
      repositoryId: string;
      canonicalRef: string;
      policyId: string;
      policyRevision: string;
      authorizedBy: string;
    }>;
```

The target must be resolved by trusted server policy at run creation and persisted with the run. Workers may provide neither `kind` nor policy identity. The existing user-workspace mode remains the default and retains convergence plus retirement. The proposed server-managed mode may replace only local workspace convergence; it still requires guarded integration on the authorized canonical ref, exact integrated SHA, current independent verification, persisted requirement closure, no open required work/blockers, and independently reopened final evidence. Worktree retirement is still required for task worktrees created for the run.

Receipt/evidence binding must include run ID, tenant, actor, project, repository, target kind/identity, canonical ref, exact integrated SHA, verifier revision and evidence digest. Replays with a different payload and revoked/expired target policy must fail closed. Duplicate reconciliation must remain idempotent.

## Executable acceptance tests required before activation

1. Default and explicit `USER_WORKSPACE` targets cannot complete without fresh authority-issued convergence and retirement receipts bound to this run and integrated SHA.
2. A worker-supplied `SERVER_MANAGED_CANONICAL` field or policy ID cannot change the persisted target or completion path.
3. A server-created `SERVER_MANAGED_CANONICAL` target can complete only after authoritative guarded integration evidence and fresh independent verification/closure evidence match every binding.
4. Wrong run, tenant, actor, project, repository, ref, target policy/revision, SHA, verifier revision, digest, or revoked policy is rejected.
5. Missing integration, stale verification, open requirement/blocker, stale lease, cancellation race, missing receipt, conflicting idempotency replay, or required task-worktree retirement keeps the run non-terminal.
6. Restart/readback and duplicate reconcile produce the same single terminal event and Task Control result.

## Approval and activation gate

Required: SPEC-224 owner and security approval for the semantic change, plus a trusted target-policy authority and durable evidence lookup. Until those are present, this proposal is documentation only and the production default stays unchanged.
