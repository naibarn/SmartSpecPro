# Decision Log

## Planning depth

`standard` quick plan with two sections. The task crosses a shared pure domain
resolver, client readiness UI, and server assembly precondition, but needs no
schema or API redesign and remains bounded to one workflow.

## Decisions

1. Canonical shot identity is derived from explicit parent/source metadata
   before raw clip number.
2. Expected shot numbers prefer storyboard, then start-frame plan, then the
   clip-derived set.
3. Exactly one completed candidate is selected per canonical shot using the
   approved deterministic priority.
4. Client and server import the same pure shared resolver.
5. Existing raw-clip helpers stay available for unrelated callers unless impact
   verification proves they can safely delegate to the new resolver.
6. No persisted data is rewritten as part of assembly.

## Risks and mitigations

- A legacy group may contain several completed clips. Deterministic preference
  prevents non-repeatable output; no alternative record is deleted.
- A storyboard may be absent on an older episode. Ordered fallback sources keep
  the flow operable.
- Existing edits overlap the page and router. Changes must be narrow hunks and
  staging must name exact files rather than use `git add -A`.
- Full-suite failures may be pre-existing in the dirty tree. Focused regression
  evidence and changed-file type checks must distinguish task failures.

## Self-review record

- Round 1 — completeness: added explicit fallback order and no-migration scope.
- Round 2 — contradictions: aligned UI and server on exactly one selected clip
  per canonical shot; no conflicting raw-count path remains in scope.
- Round 3 — security/data boundaries: confirmed owned episode loading remains
  before resolver use; resolver performs no IO or authorization.
- Round 4 — tests/obvious improvement: added variable-count and deterministic
  selection cases, plus a panel regression for the disabled state.
- Round 5 — integration/obvious improvement: added router/service proof that the
  assembly job receives the same selected list shown as ready by the UI.
- Round 6 — stability check: no meaningful auto-fix findings.
- Round 7 — second stability check: no meaningful auto-fix findings; plan is
  stable and ready for implementation.
