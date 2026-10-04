# Canonical promotion contract

The canonical checkout is a build/deploy source, not a parallel implementation workspace.

## Source invariants

- `origin/main` is the canonical integrated baseline.
- A validated target SHA is the exact source version authorized for the next build.
- `/home/dev/projects/SmartSpecPro` may lag `origin/main`; lag is normal until promotion.
- Build is forbidden until canonical checkout HEAD equals the validated target SHA.

## Dirty canonical checkout policy

Dirty canonical state must not block deployment forever and must not be discarded.

Default policy:

1. preserve the exact dirty state outside the repository;
2. reproduce it on a dedicated rescue branch/worktree;
3. commit and push the rescue branch;
4. verify remote SHA;
5. only then remove the preserved dirty delta from canonical checkout;
6. fast-forward canonical checkout to validated target;
7. keep rescue branch for later semantic reconciliation.

The rescue branch is not automatically merged into main.

Sensitive untracked runtime-local files are the exception: do not push them. Preserve them locally with restrictive permissions and require explicit disposition.

## No destructive shortcuts

Never use broad destructive cleanup as promotion logic:

- no `git reset --hard`;
- no `git clean -fd[x]`;
- no automatic stash;
- no force push;
- no pruning other worktrees.

Targeted `git restore`/exact untracked removal is allowed only after the exact same dirty delta has been committed, pushed, and remote-SHA verified on the rescue branch.

## Build lease

After certification, the build should execute under the canonical promotion lock using `run-certified-command.sh` when concurrent automation could otherwise move the checkout.
