# Work Plan: Hermes Claude Subscription DirectSDK Alignment

## Scope and decision rules

- Task source: user-provided `TASK: SmartAIHub — Hermes Claude Subscription DirectSDK Architecture Alignment, Canonical Spec Update & True Handoff Reconciliation` (2026-10-09).
- Canonical base: `origin/main` at `05ffe1c9640fda1e3324514daaa456cb3f0d020a` as observed when the isolated worktree was created (recheck before promotion).
- Worktree: `/home/dev/worktrees/hermes-claude-subscription-directsdk-20261009`, branch `codex/hermes-claude-subscription-directsdk-20261009`.
- No implementation, plugin install, runtime enablement, production migration, or deployment is in scope.
- Preserve any `DORMANT_UNRESOLVED` disposition and ownership conflict. Additions to those Specs must be explicitly conditional; do not elevate proposed execution authority.
- Canonical handoff source is `tools.spec_handoff`; never edit generated `STATUS.md` or repository-wide indexes directly.

## Work units

1. **Baseline and authority audit** — inspect repository policy, identity registry, dynamic inventory, status index, manifests, ledgers, history, owner decisions, implementation references, concurrent workspaces and PRs. Completion: a before-state matrix and explicit unresolved conflicts.
2. **Pinned upstream review** — read official Hermes catalog/docs and full-SHA source; classify behavior VERIFIED / EXPERIMENTAL / UNKNOWN. Completion: source-linked evidence and limitations; no install/run.
3. **Cross-Spec design alignment** — write minimal additive contracts for model routing (231), delegated agent semantics (200), user-owned Runner selection (269), durable execution (267), local credential boundaries (272), DevRun approval/certification (224), and Task Control status (277), subject to canonical authority. Completion: requirements distinguish model-only calls from autonomous agents and preserve all current execution/billing authorities.
4. **True handoff reconciliation** — update only handoff records permitted by the canonical writer; append evidence/history without fabricating completion. Completion: ledger rows have stable IDs, `NOT_STARTED` (or schema equivalent), and design evidence distinct from execution proof.
5. **Ten-dimension review and validation** — record each dimension and run focused Spec/handoff validators, index consistency, and whitespace/syntax checks. Completion: all gaps fixed within scope or named with owner/predicate/next action.
6. **Delivery** — run FAST INTEGRATION GATE on exact candidate, commit, use normal non-force PR route, attach PR, and report merge/integration separately. If merge is unauthorized or protected, leave reviewable PR.

## Known authority constraints

- The live status index marks Specs 200, 224, 231, 267, 272, and 277 `DORMANT_UNRESOLVED` / `RECONCILIATION_REQUIRED`; no text saying implementation-ready overrides this.
- Spec 231 R6 says 231 is LLM Routing, 232 is Redis/BullMQ migration, and 245 is the broader Cloudflare migration. The index still marks 231/232/245 unresolved, so do not resolve ownership from the Spec's own claim alone.
- Spec 269 is `ACTIVE_CANONICAL` / `VALIDATION_PENDING`; preserve its runtime acceptance blockers.
- Spec 268 is active and supporting, but context runtime acceptance remains incomplete.

## Validation profile

Documentation/spec scope: use official `tools.spec_handoff` reconciliation/validation and index check, plus `git diff --check` and JSON parsing for any handoff payload. Do not run a repository-wide build or typecheck.
