# TDD plan

1. Add red tests for normalizing a police role, bounded group counts, removing
   invalid/empty entries, and preserving explicit empty customization.
2. Add red storyboard generation tests for `supporting_presence` schema and
   shot-local prompt instructions; verify no cross-shot propagation.
3. Add red start-frame prompt tests proving the role is rendered as text and is
   absent from portrait attachment manifests.
4. Add red router tests for replacing entries, editing counts, deleting all
   entries, and setting the customization marker.
5. Add red UI tests for auto entry display, edit/add/remove/suppress actions, and
   explicit shot-local copy.
6. Implement the smallest shared contract first, then generation/persistence,
   then UI.
7. Run focused Vitest suites, changed-file TypeScript checks, and `git diff --check`.
8. Report unrelated repository-wide baseline diagnostics separately.
