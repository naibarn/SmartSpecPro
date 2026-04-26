# Branch Finishing

Use this reference after implementation and verification when the user asks for
git publication or when a branch is ready to hand off.

## Finish Options

Offer or execute the option that matches the user's request:

| User intent | Action |
|---|---|
| "commit" | stage only owned files, commit with a focused message |
| "push to main" | commit owned files, push current `main` branch |
| "open PR" | push branch and open a PR |
| "keep changes" | leave working tree changes in place and report paths |
| "discard" | ask before destructive removal unless files are generated artifacts |

## Safety Rules

1. Stage only files owned by the current task.
2. Do not stage unrelated dirty user work.
3. Include verification results in the commit message body when useful.
4. Re-run `git status --short` before staging and before final report.
5. Never use destructive reset/checkout commands unless the user explicitly asks.

## Skill-System Commit Scope

For skill-system work, typical owned paths are:

- `skills/`
- `.claude/agents/`
- `orchestra/`

Application files under `apps/web/` are not owned by this workflow unless the
task explicitly says to modify application runtime behavior.

