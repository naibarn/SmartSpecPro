# Progress — Urgent Canonical Work Convergence

- [COMPLETE] discovery — read attachment as requirements data; checked repository policy, current Orchestra state, latest `origin/main`, and relevant existing skill/spec paths.
- [COMPLETE] P0.1 candidate — updated partial checkpoint semantics, marker-independent discovery, explicit canonical checkout targeting, and scenario coverage.
- [COMPLETE] P0.1 focused evidence — shell syntax and JSON parse pass; fixture discovers remote unmarked and local-only branches plus a dirty detached worktree.
- [PARTIAL] P0.1 skill audit — project-specific hardcoded checkout references were removed. `bash skills/audit-skills.sh` still fails on existing generated `ssp-research` drift, missing `browser-automation-sandbox-reviewer`, and three existing route mismatches (`LOOP-POLICY-001/002`, `DEBUG-DATA-001`). These do not originate in this checkpoint; do not silently claim the audit passed.
- [COMPLETE] refreshed discovery snapshot — 85 branch-ref rows and 117 worktree rows at `origin/main` `8cf37809415ac64624744f8036a6e54ca395de3d`; 27 worktrees are dirty. Added committed changed-path counts so marker-only refs are not mistaken for integration candidates. Raw details are in `inventory-2026-10-05.tsv`.
- [COMPLETE] P0.2 — canonical spec index checked across `origin/main` and all 117 registered worktrees; local proposals 279–281 were considered; Spec 282 and initial implementation/authority matrices added.
- [COMPLETE] P0.1 classifier fixture — verified unmarked remote, local-only branch, clean marker-only branch, dirty detached worktree, and uniform 13-column TSV output.
- [COMPLETE] acceptance test design — scenarios A–J mapped to test/evidence designs; only discovery subcases D/E have current fixture evidence.
- [PENDING] P0.3–P2 — resolve Spec 269/275 references and generic Work/Goal ownership; compatibility audit; semantic stranded-work reconciliation; remaining tests; Task Control/app version behavior; P2 follow-up.

No original worktree files were staged, edited, or removed. No branch/worktree was deleted, reset, cleaned, pruned, or merged by this discovery pass. This PR carries a partial policy/spec/discovery checkpoint; it does not complete P0.5 semantic reconciliation or P0.3–P2.
