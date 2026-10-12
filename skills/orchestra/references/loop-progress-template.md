# Loop Progress Template — Durable, Not a Gate

For an ongoing multi-wave Orchestra session, keep `orchestra/progress.md` concise and current. Write after each meaningful implementation/merge checkpoint and before a known context/session interruption; store log paths, not raw transcripts.

```text
Task / WorkUnit: <goal/id>
Workspace owner/path: <owner/absolute path>
Source base SHA: <sha>
Current step: <phase / section / operation>
Completed: <sections or waves with artifacts and commit SHAs>
Integrated Main SHA: <sha or NOT_MERGED>
In progress: <owned changed paths, branch/PR, command if still running>
Pending: <remaining sections, gaps, dependencies>
Verification: <focused checks and actual PASS/FAIL/NOT_RUN>
Resume from: <earliest actually incomplete step>
Next action: <one executable step>
Last persisted: <timestamp>
```

Update `orchestra/backlog.md` for pending items. For an existing orchestration session, preserve `orchestra/lifecycle.md` if in use but do not require the old seven-stage ledger or arbitrary iteration/tool-call/review quotas before merging. On resume, reconcile the file record with actual Git/artifacts before repeating any operation.
