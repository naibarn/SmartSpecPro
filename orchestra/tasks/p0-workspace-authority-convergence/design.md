# P0 Workspace Authority and Convergence — Design

Date: 2026-10-07
Baseline: `b62f61ac05032dd5908bebfe18efd46adf77f9bc`

## Approved direction

Treat the attached P0 brief as the normative product and implementation design. Extend the existing repository policy and canonical lifecycle controller with one shared Workspace Authority Resolver. Keep Git remote/ref policy in `.development-repository.toml`; store local workspace identity, explicit roles, ownership leases, observations, lifecycle state, recovery references, and convergence receipts in a transactional registry shared by linked worktrees. Git and filesystem facts are observations; registry policy assigns roles and live leases/process evidence assigns active ownership.

The resolver is a standard-library Python module under `scripts/development-lifecycle/`, callable from existing shell skills and testable against temporary repositories. `canonical_source.py`, `session-finish`, `integration-controller`, and `canonical-checkout-sync` consume the same JSON contract. Dirty work is snapshotted with hashes before any retirement or convergence attempt. Unclassified dirty work, a live owner, a unique commit, a ref race, or missing recovery evidence fails closed. Clean registered canonical workspaces may fast-forward only from the configured canonical history. Retire operations are dry-run by default and only remove clean, ownerless, integrated/archived temporary worktrees.

SPEC-293 owns project/repository/workspace authority and convergence. SPEC-294 projects those receipts and routes actions to existing owners; it does not choose authority or retire worktrees. SPEC-295 consumes source/workspace receipts and adds source-to-runtime release convergence without becoming a deployment or migration executor. Existing SPEC-224 execution and `worker_jobs`/outbox authority remains in place; final completion gains explicit canonical verification, user/managed workspace convergence, and worktree lifecycle evidence.

## Failure behavior and boundaries

- Missing or conflicting authority returns `UNKNOWN_WORKSPACE` / `AUTHORITY_AMBIGUOUS`; path names and branch names never establish role.
- Dirty checkout: produce a local recovery receipt and exact snapshot, leave the checkout byte-for-byte unchanged, and keep completion pending until every path/commit has an explicit disposition.
- Session state is independent of dirty files and registered worktrees. Expired lease or dead/mismatched process identity becomes `STALE_CLOSED_SESSION`; Git state alone never means active.
- If the canonical ref advances during synchronization, retry observation against the newer SHA once under the same registry lock; otherwise return `CANONICAL_ADVANCED` with no completion receipt.
- Recovery snapshots are evidence, not active Git worktrees. SQLite in the repository's shared Git common directory avoids a second project database and serializes concurrent linked-worktree updates.
- Production rollout, DB migration execution, provider mutation, Mission Control UI implementation, and cross-host shared-registry transport remain outside this first reference implementation; SPEC-294/295 contracts and adapters define those boundaries.

## Scale, security, and migration

The registry is indexed by project/repository/workspace identity and uses SQLite transactions with a busy timeout, making hundreds of linked worktrees practical without serializing ordinary development. Paths and raw diffs remain local; receipts store hashes and recovery links. Owner tokens and secrets are never stored. The new registry is additive and local to `.git`; existing checkouts bootstrap explicit canonical-role identity from repository policy, while all other worktrees start `UNKNOWN_WORKSPACE` until a creator registers them. Existing source leases are adapted in place; no schema migration or new dependency is introduced.

## Design review

- Authority is centralized and reusable by all specified lifecycle flows.
- Roles are explicit and exhaustive; paths/branches are only observations.
- Dirty files, index state, untracked content, local commits, and recovery receipts are distinct.
- Synchronization has race, idempotency, stale owner, and safe retirement behavior.
- Session and production claims remain distinct from Git observations and local unit proof.
- The P0 regression fixture covers all 30 supplied scenarios; provider/deployment scenarios are contract simulations, not claims of live Cloudflare proof.
