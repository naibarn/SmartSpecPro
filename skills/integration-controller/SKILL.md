---
name: integration-controller
description: Recover completed, partial, or stranded work and promote every safe valuable fast-gate-passing checkpoint into configured canonical ref; perform heavy verification after integration and repair against current canonical state.
---

# Integration Controller — Converge Work into Canonical State

Follow the shared [development lifecycle contract](../development-lifecycle/SKILL.md). A checkpoint may be partial; dependency waits need durable predicates and wake/recheck paths, and continuation remains attached to the WorkUnit rather than its prior session.

configured canonical ref is the first durable central landing point for safe development progress, including partial progress. Do not let readiness markers, heavy-check queues, branch discovery gaps, session shutdown, quota exhaustion, or another developer/session hide valuable work from central history.

Trunk-based progressive integration is the default for every work type. A
verified slice is eligible independently of the parent SPEC's state. Before
merge, satisfy the slice's planned and repository-required change-impact
checks, including security/authorization and compatibility checks when
applicable; the fast gate does not waive these. Require the configured merge
queue when the repository has one. It serializes only merge-critical work; do
not serialize implementation. If no remote queue exists, the controller is a
single writer for the merge section and must refresh/reconcile immediately
before each merge.

Read `references/integration-verification.md` before running promotion or post-integration checks.

For conflict handling, use `skills/development-lifecycle/git_capabilities.py` as
the shared version/state policy. Record source branch/SHA, target branch/SHA,
merge base, integration operation, expected changed paths, and the pre-integration
staged set. Resolve only owned conflict paths through the helper; Git 2.56+
uses `git add --resolved -- <paths>` and older versions use its explicit-path,
marker-checked fallback. Verify remaining unmerged paths, unexpected staged
paths, and `git diff --cached --check` before commit. Pre-existing staged paths
outside the operation's ownership block automatic commit. Record resolved
paths, verification outcome, and final integration SHA in the handoff.

## Required rule

```text
SAFE CHECKPOINT → FAST INTEGRATION GATE → commit → integrate into configured canonical ref → continue/handoff and heavy verification/UAT → repair against current canonical state
```

Before promotion, require all repository-required and slice-required checks:

- changed-scope syntax/compile/type checks and impacted tests;
- applicable security/authorization and API/schema compatibility checks;
- a usable backward-compatible or feature-off fallback for incomplete behavior;
- the FAST INTEGRATION GATE: no unresolved conflict, damaged patch, or secret.

Full typecheck, full build, heavy tests, integration/UAT, provider/rights checks, and production gates run after the integrated SHA is recorded in configured canonical ref. A resource block is never a reason to silently leave an implementation outside the central history.

## Canonicalization rule for partial work

Task completion is not a prerequisite for central integration. A checkpoint is eligible when it represents coherent valuable progress that can coexist safely with current configured canonical ref. Examples include a backend slice before UI completion, schema/repository layer before business logic, provider adapter disabled behind a feature flag, or a subset of a larger refactor that leaves the repository startable.

When a session is stopping because of quota/context/provider/time boundaries, treat that stop as an urgent reconciliation event: promote the largest safe subset now and hand off the remainder.

## Workflow

1. Refresh configured canonical ref and inventory completed, partial, stranded, marked, **unmarked**, and dirty task refs/worktrees. Readiness markers are legacy evidence only and MUST NOT be required for discovery. Record each candidate's committed tip, dirty state, relation to the configured canonical ref, likely owner/scope, and recoverable delta.
2. Preserve unrelated dirty changes. For a dirty task worktree, identify and durably commit/preserve the task-owned delta without staging other work. If ownership cannot be separated safely, report `FAST_GATE_BLOCKED` with the path, owner/session if known, durable location, and next action; never discard it.
3. Reconcile each candidate with current configured canonical ref, inspect its diff, and identify the largest coherent safe checkpoint. Run its required impacted checks and FAST INTEGRATION GATE. If the whole delta is unsafe, split and promote independent safe subsets before preserving the remainder.
4. Commit and promote every verified safe checkpoint promptly through the normal non-force PR/merge-queue path, whether the parent task is complete or partial. Serialize only promotion. Do not wait for unrelated sessions, task completion, or unrelated/heavy checks.
5. Verify that each promoted SHA is reachable from the new configured canonical ref. Record task/work ID, SHA, source ref/worktree, `PARTIAL|IMPLEMENTATION_COMPLETE`, completed scope, remaining scope, and next action in the integration report/handoff. Open/merge the next slice only after refreshing against this SHA and ensuring previous required mainline checks have not reported a regression.
6. Resolve and converge the registered `CANONICAL_USER_WORKSPACE` after each promotion through `scripts/development-lifecycle/workspace_authority.py` (run it on the SSH host that owns that checkout when applicable): `resolve`, then `converge --integrated-sha <sha> [--task-id <development-run-id>]`, then `verify --integrated-sha <sha>`. When producing Spec 224 completion evidence, pass the exact run ID and register its task worktree with the same ID so both receipts bind to that run. Do not create a permanent alternate canonical folder. The resolver must prove repository identity, explicit role, exact SHA parity, and clean state. Dirty work is preserved and linked to recovery evidence; blocked convergence remains open and actionable.
7. After promotion, queue heavy checks against the integrated SHA with a durable owner, status, and next action. A canceled, unavailable, or resource-blocked check is `NOT_RUN`/`PENDING`, never a pass.
8. If post-integration checks fail, create a repair task against latest configured canonical ref; pass the fast gate, promote the repair, and refresh the canonical working workspace again. Keep the original and repair commits visible in history.
9. Classify worktrees for retirement through the shared resolver. Use dry-run first; retire only after proving no active owner, dirty/untracked/ignored/stashed content, or unique unpushed commit remains, and integration or explicit archival disposition is evidenced. Retain a recovery manifest/archive rather than a live Git worktree when recovery is needed. Never perform blind mass deletion.

## Branch and worktree discipline

- Do not create or retain per-session branches as the durable progress destination. If required by concurrent isolation or repository protection, use a temporary branch/PR, but canonicalize safe checkpoints to the configured canonical ref throughout the work lifecycle rather than waiting for final completion.
- Never force-push or bypass repository protection. If protection prevents immediate direct push, complete the required PR path promptly and keep the task visible as promotion-pending until the merge SHA is verified. Explicitly reject `git push --force`, `git push -f`, `git push --force-with-lease`, and equivalent force refspec options in normal integration. Fetch and reconcile or use the normal non-force GitHub PR path. Only a dedicated emergency/recovery authority path may authorize a force update, with recorded approver, exact before/after refs and SHAs, preserved recovery refs, and rollback plan.
- Never use destructive reset/clean/prune/remove operations against another session's worktree. A worktree count is not proof that its contents are disposable.
- A dirty or stale registered user checkout remains the authority. Preserve it and report convergence pending until the shared resolver safely advances that same location; an internal exact-SHA build checkout is not a user-facing substitute.
- configured canonical ref promotion is not deployment. Report deployment/runtime evidence separately.

## Required report

Report:

- initial and final configured canonical ref SHA;
- each task found and its source SHA/ref;
- each promoted SHA and proof it is reachable from configured canonical ref;
- fast-gate result;
- post-integration checks passed, failed, canceled, or pending, tied to the integrated SHA;
- canonical working workspace absolute path, verified SHA/clean status, and which existing dirty/stale checkouts were preserved;
- preserved/blocked task work with owner and next action;
- worktrees/temporary refs safe to clean and any that must remain.
- progressive integration metrics per merge: branch age at integration (hours
  from first slice commit), merge latency (minutes from WorkUnit start),
  integration delta (commits/files/insertions/deletions), conflict attempts and
  attempts total (conflict rate), main build health for the exact integrated
  SHA, and time-to-first-preview (minutes plus preview URL, or `N/A` with the
  reason). Use Git/PR timestamps and exact-SHA evidence; mark unavailable
  values `UNKNOWN`, never estimate them.

Controller completion requires that every discovered valuable delta is either integrated (partial or complete), already present in the configured canonical ref, or explicitly preserved as `FAST_GATE_BLOCKED` with a durable recovery location and named next action. A parent task may remain open after partial canonicalization. Never require a readiness marker for visibility, never report pending validation as completion, and never allow an uncanonicalized valuable delta to disappear from inventory.

After canonicalizing partial progress, return to the open requirement ledger and
the next ready WorkUnit. Integration is not task closure.

## Canonical Spec integration evidence

For Spec-backed work, after promotion update the canonical Handoff with configured canonical ref, exact integrated SHA/time, affected requirements, and evidence freshness using the shared writer contract in `skills/development-lifecycle/spec-handoff-contract.md`. Integration is distinct from verification, deployment, acceptance, and completion. On stale generation/SHA, reload and reconcile before retry.
