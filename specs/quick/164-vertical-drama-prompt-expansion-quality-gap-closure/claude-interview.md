# Interview and Decisions

No additional blocking interview was needed. The user supplied the product
intent and boundary directly in the conversation; the following decisions are
the implementation contract.

## Confirmed product intent

- Prompt expansion should make the premise a more complete, semi-complete story
  treatment when the selected profile is `story`.
- A story treatment may include the protagonists' foundations, how they meet,
  why the relationship develops, obstacles, the largest conflict, turning point,
  ending direction, and remaining hooks when those elements can be inferred
  safely from the premise.
- It must remain editable and must not pretend to be a finished script or
  episode-by-episode Draft.
- It must not duplicate the downstream Draft. Draft is the next generation stage
  that turns the approved treatment into the series' structured production
  foundation.
- The system must be honest about the skill boundary: it may preserve unknowns
  as questions/assumptions rather than inventing canon.

## Decisions made for the plan

1. Treat the output as “AI story treatment / brief”, not “Draft เนื้อเรื่องย่อ”.
2. Keep original creator premise, approved treatment, and concise Draft handoff
   prompt distinguishable in the contract and persistence lineage.
3. Use a dedicated profile-aware structured skill contract rather than the
   generic article skill currently selected by the route.
4. Reject or visibly mark incomplete/generic/copied output. Never show the
   original premise as if it were a successful expansion.
5. Keep review, documentary, news, and software-review profiles profile-specific.
6. Keep the existing 2,000-character premise limit and counter/lock behavior;
   quality work must not weaken the input guard.
7. Finish with focused automated tests and browser evidence; deployment and
   live-provider proof are separate gates and are not claimed by this plan.

## Follow-up hard requirement

- The actual operation must call the LLM-backed skill, not a mockup, fixture,
  deterministic generator, generic skill, or local fallback.
- If the exact skill cannot be resolved, is not `llm-only`, has no configured
  provider/model, fails to return the required contract, or cannot prove a real
  run, the user must see the concrete failure reason and cannot Apply.
- Credits must not be deducted for preflight failures or calls that never reach
  an LLM. Failed real calls must use the existing reservation/void/refund
  boundary according to actual provider billing.
- A unit test with mocks is not accepted as proof of real skill execution; a
  separate non-mocked provider smoke run is required before release.
