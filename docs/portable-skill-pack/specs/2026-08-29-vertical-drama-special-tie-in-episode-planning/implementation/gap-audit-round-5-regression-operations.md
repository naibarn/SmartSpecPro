# Gap audit round 5 — regression and operations

Checked: shared component boundaries, normal episode contract (9 storyboard shots/8 clips),
feature-flag fail-closed behavior, retry/polling, imports, build, test scope, migration
visibility, and dirty-worktree safety.

Fixes applied: special behavior is additive through shared episode/storyboard components;
normal creation mutation and its existing UI handler were not changed; special status polling
refreshes the existing episode detail when prompts become ready; model selection is stored in
special episode data rather than normal memory.

Evidence: focused special tests pass; Vite client/widget build passes. Full workspace
TypeScript check was attempted with 6GB heap and still ended in Node OOM; the existing router
model-selection test remains blocked by its pre-existing incomplete `adminProcedure` mock.
No additional code gap was found in this audit, but production migration, browser, provider,
credit, and deployment evidence are not claimed.
