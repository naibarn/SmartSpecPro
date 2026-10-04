# Canonical Promotion Contract

## Role separation

- Implementation work lives in isolated session worktrees/branches.
- `origin/main` is the canonical integrated remote baseline.
- `/home/dev/projects/SmartSpecPro` is the canonical promotion/build checkout.
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

## Rescue is preservation, not integration

Rescue branches are quarantine/evidence. They must not be automatically merged into main. Review/reconcile them later through the normal integration lifecycle.

## Build contract

A build is authorized only when:

- canonical branch is `main`;
- working tree is clean;
- canonical HEAD equals exact validated target SHA;
- target remains in current `origin/main` history;
- build command runs while holding the canonical promotion/build lease.
