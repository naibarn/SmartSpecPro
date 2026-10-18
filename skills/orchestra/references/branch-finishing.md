# Branch Finishing

Use this reference when a coherent task-owned checkpoint is ready for Git integration or the user explicitly requests publication. Do not wait for full SPEC verification before merging a development slice.

## Finish Options

Execute the requested or already-authorized action without re-asking whether to continue:

| User intent | Action |
|---|---|
| "commit" | stage only owned files, commit with a focused message |
| "push to main" | commit owned files and push directly to the configured canonical branch when repository rules allow it; use the required PR/merge path only when branch protection requires it; confirm the integrated Main SHA |
| "open PR" | push owned branch and open a PR; do not claim Main integration until confirmed merged |
| "keep changes" | leave working tree changes in place and report paths |
| "discard" | ask before destructive removal unless files are generated artifacts |

## Safety Rules

1. Stage only files owned by the current task.
2. Do not stage unrelated dirty user work.
3. Include verification results in the commit message body when useful.
4. Re-run `git status --short` before staging and before final report.
5. Never use destructive reset/checkout commands against unrelated or foreign-owned work.
6. After verified merge, write the integrated SHA and next action to the existing task HandOff; keep outstanding UI/UAT work as gaps, not pre-merge gates.

## Skill-System Commit Scope

For skill-system work, typical owned paths are:

- `skills/`
- `.claude/agents/`
- `orchestra/`

Application files under `apps/web/` are not owned by this workflow unless the
task explicitly says to modify application runtime behavior.
