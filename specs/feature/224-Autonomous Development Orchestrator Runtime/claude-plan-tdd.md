# Focused TDD Guidance

1. Workspace registry first: assert create produces a registered task workspace with exact base, task ID, session/process owner, active lease and initial fence. Assert insufficient/free-space failure creates no claimed workspace.
2. Claim/recovery: test live process deny despite expired lease; terminated owner claim advances fence once; concurrent claim has one winner; stale owner write/heartbeat/release fails; wrong SHA and invalid grant fail closed; crash during transfer is atomic; replay returns same receipt and never repeats a tool effect.
3. Fast-lane policy: authenticated in-scope developer can run only local R1/R2 allowed paths/tools within budget; unauthenticated, cross-project, protected/production/destructive/out-of-budget requests deny or request existing approval. Existing Protected Runner checks remain unchanged.
4. Agents SDK: deterministic first test failure triggers repair; interruption after persisted receipt resumes same run/tool operation; final test and independent verify receipts bind the exact source.
5. UI acceptance: use disposable Mini-App fixture; browser assertions verify a real visible behavior, navigation/state, no console/page errors, then preserve trace/screenshot and final receipt. Browser failure triggers repair and another run.
6. CI SHA binding: positive PR synthetic-merge SHA differs from PR head but checks bind to actual checkout; stale, wrong-source, missing, failed, skipped and duplicate required checks remain rejected.

Keep tests focused to each section. Do not rerun already-passing broad suites without source changes.
