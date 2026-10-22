# SmartAIHub Progressive Integration Backlog

1. **Done:** fast-gated and integrated the PR preflight correction and pinned development-build provenance changes.
2. **Done:** verified existing progressive continuation, exact-head receipts, lock serialization, and no-dispatch-before-merge behavior; corrected integration tests to model GitHub's actual `BLOCKED` state.
3. **Partial, read-only:** 23 open PRs (19 to main, 4 stacked), 77 workspace-authority warnings, 967 Git worktrees. The full candidate scanner exceeded several minutes while querying all worktrees and was stopped; no changes made. Focused PR review found no unrelated candidate whose content, ownership, and current mergeability were all verified.
4. **Waiting external authority:** resolve SPEC-224 canonical authority/disposition through its existing process before normative edits. SPEC-293/294/310 already cover the applicable boundaries and need no expansion.
5. **Done for scoped evidence:** outcomes A-J covered by existing/new focused tests; production freshness tests pass. Do not run repository-wide typecheck or production promotion.
6. **Partial:** integration slices pushed directly to unprotected `main`; elapsed build duration for a real application artifact was not measured, and no build was published or served.
