# Gap Closure Before Final

Use this protocol before every final response after implementation, debugging,
review, repair, or skill-system work. Its purpose is to prevent long-running work
from ending with obvious in-scope gaps that the conductor already found.

## Required Gap Triage

Create a compact gap triage before final summary:

```text
Gap closure:
  must_do_now:
    - <gap> | reason: <correctness/security/data/test/contract/user-goal> | action: <fixed or command>
  should_offer_next:
    - <gap> | reason: <valuable but not required> | suggested_next_step: <action>
  safely_deferred:
    - <gap> | reason: <out-of-scope/blocked/external/optional> | residual_risk: <low/medium/high>
  no_action_needed:
    - <observation> | reason: <why it is already covered>
```

If a category is empty, write `none`.

## Must-Do-Now Criteria

Classify a found gap as `must_do_now` and fix it before final summary when all
of these are true:

- It is directly related to the user's requested goal or to work changed in this
  session.
- It is safe to fix without destructive or irreversible external side effects.
- The intended fix is clear enough to act on without a product decision.
- Leaving it open would likely cause one of these outcomes:
  - correctness bug
  - failing or stale verification
  - security, privacy, tenant/user isolation, or data integrity risk
  - broken public/API contract, route, migration, schema, or runtime workflow
  - missing audit/logging needed to debug the changed behavior
  - repeated manual follow-up that Orchestra could reasonably complete now

Do not ask the user to approve `must_do_now` fixes unless the fix requires a
product choice, destructive action, external side effect, paid/high-cost action,
or accepted security risk.

## Should-Offer-Next Criteria

Classify a found gap as `should_offer_next` only when it is useful but not
required for the current goal to be correct, safe, and verified. Examples:

- broader dashboards or UI polish after backend telemetry exists
- full-suite verification beyond the targeted gates required by the changed
  surface
- nice-to-have docs, examples, or ergonomics
- future optimization after the current performance risk is not blocking

Mention these in the final summary as next steps, not as hidden backlog.

## Safely Deferred Criteria

Classify a found gap as `safely_deferred` only when it is blocked or genuinely
out of current scope. Record a concise rationale and residual risk in
`orchestra/backlog.md` or `orchestra/learning-log.md` when those artifacts are
active.

## Final Summary Requirement

## No-Unclosed-Must-Do Gap Rule

The final summary must include a short gap closure status:

- `Gap closure: no must-do-now gaps remain`
- or `Gap closure: blocked/deferred gaps remain` with the exact reason

If any `must_do_now` item remains unfixed, do not call the work complete. Report
the blocker and the smallest required next action.
