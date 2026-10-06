# Repository / GitHub Main Reconciliation Audit

Date: 2026-10-06 (Asia/Bangkok)
Disposition: `CHECKPOINT_PROMOTED_PARTIAL` — local canonical `main` is synchronized; repository-wide worktree convergence is not complete.

## Canonical state

- GitHub `origin/main`: `1b044cda1d6a49fa67da46b70918b608248f2384` at audit time.
- The clean local `main` worktree `/home/dev/worktrees/urgent-canonical-convergence-20261005` was fast-forwarded from `0510ecbe6fe35deaeaf5a0b2a1f9420988482876` to the exact `origin/main` SHA above. `git rev-list --left-right --count origin/main...HEAD` returned `0 0`; worktree status was clean.
- The primary checkout `/home/dev/projects/SmartSpecPro` is intentionally not synchronized: branch `codex/spec261-spaas-phase-a-20261005`, HEAD `168641dcfa01a827cc68530a5096c821457d7fdb`, four committed unique commits, and 170 dirty entries (131 tracked + 39 untracked; 91 deletion markers). `smartspec-web.service` is active with `WorkingDirectory=/home/dev/projects/SmartSpecPro/apps/web`; changing or staging this mixed checkout risks active runtime and unreconciled work.
- No reset, clean, stash operation, or worktree removal was performed. Three stashes remain untouched.

## PR disposition and already-integrated candidates

- PR #21 and PR #22 were closed as superseded after both symmetric merge-base diffs against `origin/main` were verified empty; their only unique commit at the branch tips is a session-ready marker. Their historic failed CI runs are not current code deltas. PRs: [#21](https://github.com/naibarn/SmartSpecPro/pull/21), [#22](https://github.com/naibarn/SmartSpecPro/pull/22).
- Candidate `codex/audit-skills-continuation` commit `a97a8682a1a73782c43afd1bf8f118297759938d`: its three changed file blobs exactly match `origin/main`; no cherry-pick is needed.
- Recovery snapshots `canonical-dirty-rescue-*` / `canonical-history-rescue-*`, zero-tree-diff session marker branches, detached verification/build worktrees, and stashes are preservation/evidence sources, not merge candidates.

## Valuable deltas still requiring reconciliation

| Candidate | Evidence at audit | Required next action |
|---|---|---|
| `codex/runner-desktop-build-ui` | 10 unique commits, 12 paths, +478/-42; overlaps Runner download/history branches and the closed historical PRs | Select one canonical Runner change set; compare against current `main`, run focused tests/CI, then update/open one PR. |
| `codex/spec261-spaas-phase-a-20261005` + primary dirty changes | Four unique commits; current branch implementation differs materially from current `packages/spaas-standard` and Orchestra files on `main` (current-main SPAAS commit `003e52ec` exists). The dirty delta mixes Spec 278, public SEO/home, SPAAS, specs, and 90+ Orchestra deletions. | Preserve current state; split by owner/path into isolated candidates, compare each to current main and active runtime, then promote only fast-gate-passing coherent subsets. Do not cherry-pick the four commits as a unit. |
| `codex/spec266-unified-data-evidence-20261005` | 13-commit candidate; 118 paths, +14,624/-832, inherited Spec 261 work; `git diff --check` reports Markdown hard-break trailing whitespace | Review spec authority and semantic overlap, fix/justify whitespace, run focused package/service checks on a current-main candidate. |
| `codex/worktree-reconciliation-20261003` | 11 unique commits; 28 paths, +1,293/-365; mixes build reproducibility, Spec 263, and job-control fixes | Split by behavior and reconcile with active dirty overlaps before promotion; run affected checks. |
| `codex/spec-handoff-dispositions-20261006` | 1 commit, 6 paths, +2,494/-6; introduces/updates Specs 281/284/285/292; related handoff worktree has over 1,000 dirty paths | Resolve the active handoff dataset ownership and duplicate/spec-authority review before importing. |
| Spec 226 / Spec 278 / Spec 224 and Feature 130 worktrees | Several dirty or detached trees, including Spec 226 (128 changes/103 untracked), Spec 278 (35/18), Spec 224 D385 (29/4), Feature 130 (43/18), and `/home/dev/smartspec-web-recovery` (39/9) | Identify live owner and separate candidate changes from caches, scratch files, retired-system work, and unrelated work. Do not bulk-stage. |

Additional untracked items needing explicit disposition include `artifacts/codex-parallel-development-skills.zip` and `apps/web/--skeleton/`; their presence alone is not authorization to commit them.

## Resource / execution boundary

- Root filesystem reported 922G total, 875G used, 433M available (100%); a full worktree checkout failed with `No space left on device` before any cherry-pick. The incomplete path was absent and its temporary no-op branch was safely deleted.
- No full build, repository-wide typecheck, or broad test suite was run. Do not retry a full checkout/build until fresh disk admission exists; use existing clean worktrees or a dedicated runner for focused checks.

## Resume protocol

1. Re-fetch `origin/main` and repeat candidate ancestry/tree-diff checks before each integration.
2. Continue with the Runner release workstream only after one owner consolidates the overlapping branches; run the changed-scope tests and respect CI protection.
3. Split primary dirty work by ownership without editing `/home/dev/projects/SmartSpecPro`; service/runtime and schema changes require exact-SHA and rollback compatibility review.
4. Reconcile Spec 266 and spec-handoff candidates against current canonical specs/authority, then promote safe, bounded commits through normal PRs.
5. Inventory every remaining dirty worktree with its owner and status. Do not equate a remote branch, readiness marker, or clean candidate with implementation completion.
6. After each successful PR merge, fast-forward the clean local `main` worktree and verify it equals fetched `origin/main`.

This audit confirms the canonical local main matches GitHub at the recorded SHA; it does **not** confirm that every local branch, dirty worktree, or candidate change is represented on GitHub, nor that production is synchronized.
