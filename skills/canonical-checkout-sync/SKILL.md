---
name: canonical-checkout-sync
description: Prepare a leased isolated workspace for an exact revision in the repository's configured canonical history; shared developer checkouts may be dirty or on another branch.
---

# Canonical Source Preparation

Follow the shared [development lifecycle contract](../development-lifecycle/SKILL.md) for canonical target selection and validation handoff. This skill prepares an exact source revision; it does not define work ownership or dependency waiting.

Use this after a requested revision is integrated into the repository's canonical history and before build, test, package, deploy, or verification work. It prepares an isolated Git worktree and a fenced source lease. It does not align, reset, clean, or switch the developer checkout.

Before synchronization or preparation, inspect branch/worktree, staged,
unstaged, untracked, and active merge/rebase/cherry-pick state with
`python3 skills/development-lifecycle/git_capabilities.py inspect` plus
`git status --porcelain=v1 --untracked-files=all`. Report clean, dirty-owned,
dirty-other-session, staged-uncommitted, integration-in-progress, behind,
ahead, or diverged distinctly. Do not call a dirty worktree clean or absorb its
index into the synchronization operation. If sync itself produces conflicts,
resolve only owned paths through the shared conflict policy and retain the
staged-set gate.

## Repository policy

Each repository configures its source authority in `.development-repository.toml`:

```toml
[repository]
repository_id = "stable-project-repository-id"
remote = "origin"
canonical_ref = "refs/heads/main" # example only; set from this repository's policy
source_root = "~/.cache/codex/canonical-sources"

[repository.platforms.windows]
canonical_user_workspace = "C:/Users/example/SmartSpecPro"
source_root = "C:/Users/example/AppData/Local/SmartSpecPro/canonical-sources"
lease_root = "C:/Users/example/AppData/Local/SmartSpecPro/canonical-leases"
source_fallback_roots = ["D:/SmartSpecPro/canonical-sources"]
recovery_root = "C:/Users/example/AppData/Local/SmartSpecPro/workspace-recovery"
```

`canonical_ref` is policy data; it may name `refs/heads/develop`, `refs/heads/trunk`, or another protected ref. Do not infer `main`. `source_root` must be outside the developer checkout. Another project supplies its own policy and gets a distinct workspace and lease namespace.

The optional `repository.platforms.<platform>` table overrides only the paths
configured for the current OS (`windows`, `macos`, or `linux`); repository
identity and canonical-ref policy remain shared. Windows roots must be native
absolute paths and approved for the Runner user's ACL. A POSIX path is never
translated into a guessed Windows path. If a configured root is not valid on
Windows, policy loading fails closed with the missing Windows key so the
Workspace Owner can provision and approve it.

## Prepare exact source

Run from the target repository or set `CODEX_REPOSITORY_ROOT`:

```bash
skills/canonical-checkout-sync/scripts/prepare-canonical-checkout.sh \
  <repository-root> <integrated-source-sha> <required-integrated-sha>
```

The third argument may be omitted when no specific integrated change must be proven. Set `CODEX_SOURCE_PURPOSE` to `build`, `test`, `package`, `deploy`, or `verify`; the default is `deploy`. Set `CODEX_SOURCE_POLICY` to use a policy file at another path.

Preparation fetches the configured canonical ref, verifies that the requested source revision is in its history and that the required change is an ancestor, then creates or reuses a clean detached worktree at that exact SHA. Before creation it admits only writable policy-approved roots with at least 1 GiB and 10,000 free inodes; the Git common metadata filesystem needs 16 MiB and 128 free inodes. If the primary root is short on capacity or Git reports `ENOSPC`, `EDQUOT`, `EACCES`, or `EROFS`, the shared lifecycle manager records exact diagnostics, rolls back only a just-created destination proven to belong to the locked attempt, and retries an admitted `source_fallback_roots` destination at the same SHA. A stable configured `lease_root` keeps fencing and concurrent-session ownership in one place even when workspace capacity changes. If no root is safe, it returns `RESOURCE_BLOCKED` and filesystem evidence. Stale or unknown registry entries are preserved. The result is JSON containing `source_revision`, `isolated_workspace`, `lease_file`, `lease_id`, `fencing_generation`, `source_verified`, and selected filesystem/recovery evidence.

The shared developer checkout may be dirty, detached, or on a feature branch. Its status and contents remain unchanged. A source root inside that checkout is rejected.

## Keep the registered user workspace current

The registered `CANONICAL_USER_WORKSPACE` is the stable user-facing authority.
An isolated build/test checkout is never a substitute for it and must not be
reported as the folder the user should open. At session start/resume and after
each integration, resolve authority and inspect divergence through the shared
resolver (on the SSH host when that is where the editor is connected):

```bash
python3 scripts/development-lifecycle/workspace_authority.py resolve --repository <repository-root>
python3 scripts/development-lifecycle/workspace_authority.py verify --repository <repository-root> --integrated-sha <integrated-sha>
```

After promotion, request safe convergence of the registered user workspace:

```bash
python3 scripts/development-lifecycle/workspace_authority.py converge --repository <repository-root> --integrated-sha <integrated-sha> [--task-id <development-run-id>]
```

When this convergence is evidence for Spec 224 Final Verify, pass that run's
exact ID with `--task-id`; register its task worktree with the same task ID so
the convergence and retirement receipts bind to one run.

The resolver only fast-forwards a clean workspace after checking its explicit
role, repository identity, intended local commits, owner lease, and the latest
canonical ref. If it is dirty, it writes recovery evidence and leaves every
file/index entry untouched. If local commits, a stash, ownership, branch use,
or canonical advancement make convergence uncertain, it returns a blocker and
the workspace must remain unchanged. Never create a permanent alternate
“canonical” directory to avoid resolving the registered workspace. Temporary
internal clean worktrees remain allowed for exact-SHA builds; register their
role and owner explicitly and retire them only through the resolver's dry-run
then apply path.

## Run under the lease

Use the lease values returned by preparation:

```bash
skills/canonical-checkout-sync/scripts/run-certified-command.sh \
  <lease-file> <lease-id> <fencing-generation> -- <command> [args...]
```

The runner checks the lease fence, expiry, workspace cleanliness, and exact source SHA immediately before execution. It holds an exclusive active lease, renews it during execution, and expires it when the command exits. A reclaimed lease has a higher fencing generation; stale lease holders cannot run or renew work.

## Central build after parallel sessions

When multiple sessions changed the repository, merge all intended work through the normal protected path first. Then start the build from the main workspace; the builder fetches the configured canonical ref and uses its latest tip, never the caller's branch or dirty files.

Use this command to produce a verified full-stack build artifact from the latest
configured canonical revision. It works at the repository root and from
`apps/web`; both package scripts invoke the same central builder:

```bash
pnpm run build:canonical
```

This build runs in an isolated canonical-source workspace. For SmartSpecPro it
builds the web assets, Cloudflare staging bundle, and Linux backend package; it
does not publish assets or switch/restart production services. `npm run
build:deploy` and `pnpm run release:web:linux` build, prepare, and promote the
compatible Linux full-stack release. They restart only `smartspec-web.service`
through the existing sudo-gated workflow, then require health verification or
rollback. Use `pnpm run build:canonical` when only an artifact is needed. See
`docs/WEB_RELEASE_WORKFLOW.md` for the commands and browser verification.

To require specific merge commits to be included, repeat the revision option; the build fails before running if any required commit is not in the fetched canonical tip:

```bash
pnpm run build:canonical -- \
  --required-integrated-revision <merge-sha-1> \
  --required-integrated-revision <merge-sha-2>
```

For an older checkout that does not yet contain these package scripts, use the installed central entry point:

```bash
~/.codex/skills/canonical-checkout-sync/scripts/build-canonical-main.sh \
  <repository-root>
```

The central entry point loads its controller from the latest configured canonical revision, serializes builds for the repository, invokes the repository's configured build target in the isolated source workspace, and returns a result record with the exact source SHA. `BUILD_PASSED` means the configured build command passed for that SHA. A completed development build that returns `STALE_CANONICAL_ADVANCED` keeps its artifact and digest bound to the recorded source SHA; report the newer canonical SHA separately. It is not a build failure and must not be described as the latest main. Production promotion keeps its latest-source recheck and rebuild behavior.

After a passing build, the command fast-forwards the invoking checkout only when it is clean and already on the configured canonical branch. A dirty or feature-branch checkout is left untouched and reports `primary_workspace_sync` as blocked with the reason and a sample of dirty paths. Resolve/preserve that work, then run the command from a clean canonical checkout to make all integrated files visible there. The build output remains at the reported isolated workspace path.

Concurrent operations for distinct repository/revision/purpose tuples use independent workspaces and leases. Requests for an already-active tuple are rejected. Do not run commands directly in the isolated workspace without the certified runner when the operation depends on the lease.

## Boundaries

- This skill certifies source selection and execution placement only. A successful source lease is not a passing build, test, deployment, or runtime check. `BUILD_PASSED` certifies an artifact for its recorded source SHA and digest only; it does not establish publication or that a frontend/backend process is serving that revision. Report those states separately with evidence.
- Bind all verification results to `source_revision`; a later revision can stale earlier evidence.
- Heavy verification and long-running execution still use the repository's canonical `worker_jobs` plus outbox control plane where required. This source lease is not a job queue.
- The older `canonical-sync-preflight.sh`, dirty-rescue, and local-branch realignment helpers are not part of this path. Do not use them to prepare build input.

## Canonical Spec identity

For Spec-backed work, consume the canonical Handoff identity and expected canonical SHA before preparing a source workspace. Bind source verification to the manifest digest and configured canonical revision; do not create a separate status or authority record in the checkout lease. The integration controller updates canonical integration state after promotion.
