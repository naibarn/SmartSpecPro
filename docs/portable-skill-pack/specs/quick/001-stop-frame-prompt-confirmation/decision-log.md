# Decision Log

## Planning depth

- Chosen depth: `standard` quick-plan.
- Reason: three existing React/TypeScript pass-through surfaces plus focused
  tests, but one bounded UI workflow and no schema/API change.
- Promotion trigger: promote only if implementation reveals a backend contract,
  persisted-task recovery requirement, or more than the existing page/workspace/
  panel boundary.

## Decisions

1. Use the existing credit confirmation hook instead of native browser confirm
   or a new dialog component.
2. Add a page-owned `Set<number>` for prompt generation busy state and clear it
   in `finally` so submit, polling, error, and timeout paths converge.
3. Render the missing image action in the prompt section only when a non-empty
   Stop Frame prompt exists; reuse the existing image callback and busy set.
4. Add regression tests at the panel boundary, where confirmation, visibility,
   disabled state, and callback invocation are observable without provider calls.

## Plan self-review rounds

### Round 1

- Completeness: covered prompt confirmation, duplicate guard, image action, and
  verification.
- Contradictions: none.
- Security/abuse: no new boundary; paid actions remain confirm-gated.
- Obvious missing improvement: identify exact pass-through contract; captured in
  research notes.
- Result: [AUTO-FIX] added explicit page → workspace → panel contract notes.

### Round 2

- Completeness: covered cancel, confirm, busy, empty, success, and error states.
- Contradictions: none.
- Security/abuse: repeated-click path is addressed by per-shot state.
- Obvious missing improvement: ensure the image button does not render without
  a prompt; captured in acceptance criteria.
- Result: [AUTO-FIX] tightened the image visibility condition.

### Round 3

- Completeness: affected files and commands are listed.
- Contradictions: no backend/API changes are proposed.
- Security/abuse: no auth/tenant/data changes.
- Obvious missing improvement: preserve the existing image-slot action; added as
  a non-goal and implementation constraint.
- Result: [AUTO-FIX] clarified non-goal.

### Round 4

- Completeness: UI/UX contract includes target, states, responsive behavior,
  accessibility, copy, and browser evidence.
- Contradictions: no material conflicts found.
- Security/abuse: no new input or external boundary.
- Obvious missing improvement: none.
- Result: clean review; no auto-fix.

### Round 5

- Completeness: TDD section and acceptance checks align with implementation
  sections.
- Contradictions: naming and callback ownership align across sections.
- Security/abuse: no missing paid-action confirmation path.
- Obvious missing improvement: none.
- Result: clean review; plan stabilized.
