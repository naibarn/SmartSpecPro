# Finalization (Codex)

After all manifest sections are implemented:

## 1) Run Final Validation

Run the agreed full test command (or best available equivalent) and collect pass/fail summary.

## 2) Write Summary Artifact

Create:
- `{planning_dir}/implementation-summary.md`

Include:
- sections completed
- commit hashes per section
- test results summary
- key deviations from original plan
- known residual risks
- backups created and restore notes (if any)
- recommended next steps

## 3) Output Completion Summary

Report concise status to user:
- completion count (`N/N`)
- final test outcome
- path to summary file
