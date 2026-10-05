# Canonical Promotion Contract

## Role separation

- Active implementation may use isolated session worktrees/branches for concurrency, but they are temporary execution workspaces, not durable progress stores. Safe valuable checkpoints must converge to `origin/main`.
- `origin/main` is the canonical integrated remote baseline.
- The repository's explicitly selected canonical checkout is the promotion/build checkout.
- The canonical checkout is not a normal feature-development workspace.

## Allowed automatic recovery

When the canonical checkout contains local state not represented by the validated target, automation may realign it only after that state is made durable and remotely verifiable.

### Dirty working state

Preserve exact tracked/untracked delta on a dedicated rescue branch, verify remote SHA, then clean only exact rescued paths.

### Local-only commits / divergence

Preserve exact pre-realignment local HEAD on a dedicated rescue branch, verify remote SHA equals that HEAD, then atomically move the local `main` ref to the validated target and reattach the checkout.

This operation changes only the local canonical branch pointer. It never force-pushes `origin/main`.

## Compare-and-swap requirement

Any local main pointer movement must prove the ref still points at the exact SHA that was preserved. If it changed concurrently, abort rather than overwriting the new state.

## Target validity

The validated target must exist and remain reachable from current `origin/main`. If it falls out of main history, integration validation is stale and deployment must stop.

For a feature-specific build, the caller may provide the SHA of the commit produced by integration (including the squash/merge commit). The canonical orchestrator must verify that this integrated-change SHA is an ancestor of the validated target before it recovers or moves the checkout. If it is absent, return `CANONICAL_TARGET_MISSING_REQUIRED_CHANGE`, leave canonical state untouched, and route back to integration. A plain sync without a required-change SHA certifies only the chosen main revision, not that a particular requested feature was included.

## Rescue is preservation, not integration

Rescue branches are quarantine/evidence. They must not be automatically merged into main. Review/reconcile them later through the normal integration lifecycle.

## Build contract

A build is authorized only when:

- canonical branch is `main`;
- working tree is clean;
- canonical HEAD equals exact validated target SHA;
- target remains in current `origin/main` history;
- build command runs while holding the canonical promotion/build lease.

Preparation is not build, deployment, or runtime proof. Keep each stage's SHA and result separate; feature delivery is complete only after the requested post-deploy runtime check passes.
