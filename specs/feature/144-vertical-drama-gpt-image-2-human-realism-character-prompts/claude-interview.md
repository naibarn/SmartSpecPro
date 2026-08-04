# Feature 144 Interview Transcript

## Interview status

No blocking follow-up question was required. The user request, the reviewed
Feature 144 spec, and the repository contracts already define the necessary
business scope. Technical choices below are recorded as architect decisions so
implementation can proceed without guessing.

## Q1 — Which model families are in scope?

**Answer from the user-confirmed requirements and spec:** GPT Image 2, the Nano
Banana family, and the Seedream family are the target image-model families.
Target prompt ceilings are 20,000 characters for GPT Image 2 and Nano Banana,
and 5,000 characters for Seedream. Other providers retain their existing
behavior until separately scoped.

## Q2 — What visual outcome matters most?

**Answer from the user-confirmed requirements and spec:** Characters must feel
like natural human beings: attractive or handsome and suitable for dramatic
casting, but not fashion models, influencers, catalog faces, or plastic/CGI
renders. The implementation must be especially careful with age, identity,
reference locks, anatomy, skin, and safety.

## Q3 — How should negative prompting work?

**Answer from the user-confirmed requirements and spec:** Do not send a separate
negative prompt for target families. Express avoidance intent as natural prose
inside the positive prompt. Legacy negative data may remain readable for
compatibility, but it must not reach a target provider as a second instruction.

## Q4 — What rollout and verification boundary is acceptable?

**Answer from the user-confirmed requirements and spec:** Keep the first slice
skill-first, do not create a second Human Realism skill, do not run paid image
generation in unit tests, and require a bounded per-family A/B evaluation before
broad enablement.

## Auto-decisions

- Use the existing `vertical-drama-character-visual-bible` skill as the only
  creative prompt author.
- Add a factual provider capability contract to the existing model catalog/config
  and resolve it after the final image model/reference route is known.
- Use the existing `configJson.maxPromptLength` resolver as the budget source and
  add explicit target-family metadata rather than a loose model-name substring
  map.
- Pass the capability facts into the skill prompt so the skill authors either a
  rich profile (20,000) or compact Seedream profile (5,000). Do not add an LLM
  refiner or raw string truncation in the first slice.
- Validate the final render prompt before any paid provider submission. If it
  exceeds the resolved cap, allow a bounded skill retry only when critical
  clauses are preserved; otherwise fail with an actionable error. Never silently
  truncate.
- Centralize target-family negative suppression at the media payload boundary
  and test portrait, sheet, approved-prompt reuse, Hermes, and MCP paths.
- Treat candidate portrait mode from Feature 134 as part of the same prompt
  contract so it cannot bypass the combined-prompt or capability checks.
