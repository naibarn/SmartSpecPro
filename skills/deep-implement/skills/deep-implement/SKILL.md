---
name: deep-implement
description: Implement all sections of an existing deep-plan, continuously integrate coherent code, then debug and close gaps.
license: MIT
compatibility: Requires uv (Python 3.11+)
---

# Deep Implement

Build software, not review paperwork. Complete all independently executable sections in a continuous loop and put working checkpoints into the canonical development branch. Remaining bugs, UI polish and final acceptance gaps belong to subsequent debug/review loops, not to a mandatory pre-merge freeze.

## Input and setup

Input: `/deep-implement @path/to/sections/` containing `index.md` with `SECTION_MANIFEST` and `section-NN-*.md` files. Discover `plugin_root` from `DEEP_PLUGIN_ROOT` or locate `scripts/checks/setup_implementation_session.py`; read and respect `state_dir`, `checkpointed_sections`, `resume_from`, and the existing resumed state reported by setup.

```bash
uv run {plugin_root}/scripts/checks/setup_implementation_session.py --sections-dir "{sections_dir}" --plugin-root "{plugin_root}"
```

Pass `--session-id` or `--target-dir` only if actually needed and valid for the script. Use the configured target repository and preserve unrelated dirty files. An existing dirty checkout is not a reason to reset it or block work in a separate owned worktree. Task-list reminders and external reviewer availability are optional execution aids. The setup script creates implementation/commit/checkpoint tasks, not mandatory review interviews or periodic compaction prompts.

## Implementation loop

For each ready section, without asking for continuation:

1. Read the section, relevant current code and existing HandOff (`{state_dir}/HANDOFF.md` for this implementation, plus any canonical Spec HandOff). Avoid repeating completed sections. Use targeted file search or SocratiCode when available; fallback to ordinary search immediately when unavailable.
2. **Before starting a new section or lengthy operation, persist its in-flight step** with `scripts/tools/update_section_state.py --state-dir "{state_dir}" --section "{section_name}" --status in_progress --next-action "<exact recoverable action>"`. This creates/refreshes `{state_dir}/HANDOFF.md` and an append-only history; no new approval/review gate is implied. Then implement the specified behavior, including relevant interfaces and tests. Debug real failures using errors/logs and adjust the approach when repeated attempts provide no new information. A missing field or unapplied migration in an **authorized development database** is a repair task, not a terminal wait.
3. Run the smallest relevant syntax/compile/focused test check for the changed code. Fix integration-critical failures. Browser tests, full project suites, design reviews and final SPEC evidence may run after integration when not independently required by repository protection.
4. Commit only task-owned files. Invoke the existing [integration-controller](../../../integration-controller/SKILL.md) to promote each coherent checkpoint through normal protected Git and required repository checks. **Do not wait for every section or every known bug to be closed.** Verify the resulting Main SHA rather than treating an open PR as integrated.
5. **Persist the section checkpoint after the commit succeeds**, using the existing `scripts/tools/update_section_state.py --state-dir "{state_dir}" --section "{section_name}" --commit-hash "{actual_commit_sha}"`. This writes `deep_implement_config.json`; never mark a failed/uncommitted section checkpointed. After a **verified merge**, persist `--merged-main-sha "{actual_main_sha}" --next-action "<next step>"` using that same state-update tool. It records the merged Main SHA separately from the local commit; the generated HandOff carries WorkUnit/section, remaining gaps and next action. Add `--gap "<unresolved issue>"` when a gap opens; record `--resolve-gap "<same issue>"` when closed and identify the active owner using `--session-id`/`--worktree` when multiple lanes share a plan; keep the canonical Spec HandOff in sync when that repository writer is available. A local commit is not a completed merge. Continue to the next ready section from current canonical Main; reconcile in-flight work only at a checkpoint.

If a section cannot proceed, keep its exact blocker, evidence, owner and next action in HandOff, then continue any independent section. Do not request human approval merely to debug, retry, merge-conflict repair or continue an authorized development task. Do not overwrite another session's work or force-push.

## Resume after interruption or context loss

Inspect the current HandOff at any time using `scripts/tools/update_section_state.py --state-dir "{state_dir}" --show`, or read `{state_dir}/HANDOFF.md` directly. Rerun `setup_implementation_session.py` with the **same** sections directory to recover its actual `state_dir`, checkpointed sections and `resume_from` section; setup repairs a missing/stale generated HandOff without discarding the authoritative JSON. Reconcile that state with Git commits, files, PR merge status and the canonical HandOff **before** executing a section again. If a section was committed but its state write was interrupted, verify the commit and recover the state record; if a PR was merged, recover the actual Main SHA instead of opening a duplicate PR. If implementation was interrupted mid-section, keep uncommitted owned files and resume from the last verified sub-step; never reset them to replay from scratch.

Update on-disk section/HandOff progress after each meaningful checkpoint and before an anticipated session/context stop, including worktree path, last successful commit, merged SHA (if any), pending sections, failures and next action. State writing is a lightweight durability operation, **not** a prerequisite for final UAT or extra approval. Do not declare a section complete solely because a state record claims success; verify actual files/commit evidence.

## Build, test and debug

As soon as an integrated functional slice can run, build it on the authorized development environment and expose the development preview. Test the actual UI, correct bugs and repeat **fix → focused check → commit → integrate → preview**. An incomplete UI or missing hosted UAT is a normal review/acceptance gap, not proof that earlier implementation must remain outside Main.

Reviewers, section-by-section interviews, mandatory repeated clean review rounds, and exhaustive requirement matrices are **not prerequisite steps**. Use them only to resolve a concrete issue or if the user explicitly requests that depth. Record outstanding requirements without calling them complete.

Stop only the affected operation for a genuine external authority/product decision, unauthorized destructive/production action, or an actual repository-required check that cannot yet pass. Continue independent work. Report code integrated, what visibly works, pending gaps and specific next steps.
