# Requirement-to-Test Matrix

These are acceptance-test designs, not claims of completed platform verification. Tests must run against a named integrated SHA. P0.1 fixture evidence covers only candidate discovery for unmarked/local-only refs and dirty detached worktrees.

| Scenario | Contract | Test / evidence design | State |
|---|---|---|---|
| A — quota/session stops | Every safe subset is canonical; remainder has durable owner and next action | Simulate two independent task branches with distinct changed paths; stop before task completion; assert the largest safe subset is reachable from main and each remainder's handoff is discoverable from canonical records. | PENDING |
| B — heavy verification unavailable | Safe checkpoint proceeds; heavy check is pending/not run against SHA | Stub resource admission as blocked; assert fast gate and promotion proceed and obligation remains `PENDING`/`NOT_RUN` bound to integrated SHA. | PENDING |
| C — partial feature | Safe backend slice integrates without incomplete UI | Split backend and unsafe UI paths; assert backend commit is usable and canonical, UI paths stay preserved with recovery ref and owner. | PENDING |
| D — unmarked branch | Marker absence cannot hide valuable work | Git fixture creates unmarked remote and local-only branches; assert discovery outputs ref, tip, relation, marker `NONE`, and action. | PARTIAL PASS — discovery fixture |
| E — dirty worktree | Dirty files are never discarded by discovery | Git fixture creates a dirty detached worktree; assert every path is reported dirty and action says preserve/classify; assert no destructive Git command is run. | PARTIAL PASS — discovery fixture |
| F — overlapping edits | Promotions reconcile latest main and expose conflicts | Create two candidate commits touching the same lines; integrate first, then assert second promotion has an explicit merge conflict and does not overwrite the first. | PENDING |
| G — duplicate request | Resume only remaining scope from canonical handoff | Create partial checkpoint/handoff, submit equivalent request, assert latest canonical revision is loaded and completed paths are not regenerated. | PENDING |
| H — interrupted Mini App authoring | Accepted draft survives; publication stays separate | Persist a partial SPAAS draft, stop authoring session, start a new session, and assert the same canonical draft/version resumes without publishing. | PENDING |
| I — provider says completed | Parent work can remain partial/pending | Return terminal provider receipt while required verification remains pending; assert job receipt and parent DevelopmentRun/UI states remain distinct. | PENDING |
| J — controller/restart recovery | Canonical source + handoff suffice without original chat | Terminate controller after a checkpoint, restart from a fresh session, reconstruct state from canonical revision and durable handoff, then continue. | PENDING |
