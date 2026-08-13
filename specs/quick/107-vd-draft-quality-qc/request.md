# Vertical Drama Draft Quality Control (QC)

## Objective

Add a skill-first quality gate before a synthesized Vertical Drama draft can be
applied to the Create Series wizard or used to create a new series. The system
must evaluate the story premise and repeatable story engine, show a transparent
scorecard to the user, and optionally revise/evaluate the draft in bounded
iterations until it reaches 9.0/10 or the selected round limit.

This is a pre-creation flow. It must not require a fake `seriesId`, must not
mutate existing series or old drafts, and must preserve the user's explicit
story identity, market, spoken-language, character heritage, and story-control
constraints.

## Approved behavior

### Rubric

The judge returns raw scores from 0 to 5. The server computes weighted scores
and the final score; the model must not be trusted to calculate the total.

| Criterion | Weight | What it checks |
| --- | ---: | --- |
| Hook Strength | 1.50 | Immediate vertical-drama hook and reason to continue |
| Premise & Core Conflict | 1.00 | Clear protagonist goal, obstacle, stakes, and premise coherence |
| Vertical Drama Engine | 1.50 | Repeatable episode engine, reversals, emotional/visual payoffs |
| Escalation & Twist Potential | 1.25 | Escalation path and earned reveals without random twists |
| Character & Emotional Engine | 1.25 | Protagonist agency, relationships, emotional progression |
| Target Audience / Market Fit | 1.25 | Fit with requested market, setting, genre, and audience |
| Originality / Differentiation | 1.00 | Distinctive angle without losing clarity |
| Long-form Sustainability | 1.25 | Enough material for the configured season without padding |

The weights total 10.0. `weightedScore = rawScore / 5 * weight`.

### Pass and hard gates

- Automatic pass requires `overallScore >= 9.0`, no critical fail, and all
  required structural facts present.
- A score from 8.0 to 8.99 is displayed as “Strong Draft” but remains blocked
  from Apply/Next unless the maximum requested QC rounds are exhausted and the
  user explicitly chooses the documented override.
- Below 8.0 is “Needs Work”.
- Critical failures include missing protagonist goal, missing core conflict,
  no repeatable engine, no escalation path, contradiction with explicit user
  constraints, market/dialogue/setting contradiction, or twists with no causal
  setup.
- A model warning/schema warning is not silently ignored. The server normalizes
  and validates allowed role values before a draft may pass.

### Improvement loop

- Baseline evaluation is always run once.
- User chooses improvement rounds from 0, 1, 2, 3, 5, or 10; default is 3.
- Each improvement round is two distinct skill calls: revise the best current
  draft, then evaluate the revised candidate.
- Keep the best candidate by server-computed score. If a candidate is worse,
  discard it and retain the previous best.
- Stop early on pass or after two consecutive non-improving rounds.
- Hard upper bound is 10 improvement rounds.
- Revision may improve clarity, escalation, emotional progression, market fit,
  and sustainability, but may not change explicit user premise, user-entered
  names/heritage, story setting, target market, spoken-language identity,
  episode/shot design, or other story-control constraints. It may not introduce
  uncontrolled subplot threads.
- Evaluation and revision use separate skill modes and strict JSON schemas.

### Credits and durability

- Show a credit estimate before starting QC, including baseline plus the selected
  improvement budget and a clear maximum.
- Use a reservation for QC only. Draw actual usage per completed model call and
  refund unused reservation on terminal completion/failure/cancel.
- Keep the existing synthesis charge behavior unchanged; do not double-charge
  QC or stack paid confirmations.
- Use a transient Redis/BullMQ draft-QC job keyed by draft session and owner so
  the pre-create flow survives polling and does not invent `seriesId=0`.
- Store only bounded, owner-scoped job state with TTL. Never trust a client score
  or receipt.
- At create time, optionally accept a server-verifiable QC receipt/run id. The
  server validates ownership, candidate fingerprint, pass/override state, and
  expiry before persisting the additive QC audit in `bible.draftQualityQc`.
- Existing series and existing bible JSON remain backward compatible.

### Contract and UI

- Add shared additive contracts for rubric criteria, score breakdown, loop
  status, credit estimate, and receipt. Keep existing draft schema valid.
- Add a new `vertical-drama-draft-quality-controller` skill with `evaluate` and
  `revise` modes and paired skill copies/schemas.
- Add a Draft QC panel in the Create Series wizard that shows status, current
  best score, pass threshold, round progress, credit estimate/actual usage,
  criterion breakdown, critical fails, strengths, weaknesses, recommendations,
  and a history of kept/discarded candidates.
- Next and Apply remain disabled until the current draft has a passing QC result
  and the user has explicitly applied that same draft. If max rounds are used
  without passing, show a clear warning and allow an explicit documented
  override only when structural hard gates are absent.
- UI copy must be available in Thai and English. Do not communicate status by
  color alone; include labels/icons/text and accessible live updates for async
  progress, errors, and completion.
- Preserve the existing one-authoritative paid confirmation flow.

## Out of scope

Draft QC does not score shot composition, camera movement, dialogue line quality,
costume continuity, face identity, location continuity, or final video quality.
Those remain downstream story-bible, storyboard, prompt, and media QC layers.

## Compatibility constraints

- Existing drafts/series without QC fields must continue to open and render.
- Existing create payloads without a QC receipt must retain their current
  behavior where no new QC gate is applicable; newly synthesized drafts in the
  wizard use the new gate.
- Do not rewrite unrelated dirty-worktree changes.
- Use the repository's existing npm/Vitest/TanStack/tRPC/Redis/BullMQ patterns.

## Acceptance criteria

1. A draft can be evaluated with a deterministic server-side weighted score and
   hard-gate result.
2. A user can start QC, poll progress, see all criterion scores and evidence,
   and identify the exact best round.
3. Improvement rounds never replace a higher-scoring draft with a lower-scoring
   one and stop at pass, two no-improvement rounds, or the configured maximum.
4. Credit estimate, reservation, actual draw, refund, and error/cancel paths are
   visible and do not double-charge synthesis.
5. QC is skill-first, strict-schema, bilingual in the UI, and protects explicit
   story identity constraints.
6. Apply/Next gating is correct for loading, error, non-pass, pass, stale draft,
   and explicit override states.
7. Existing focused Vertical Drama tests remain green and new contract/service/
   router/UI tests cover the acceptance criteria.
