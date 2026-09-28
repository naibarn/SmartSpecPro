# Adversarial self-review — Round 1

Method: re-read `claude-plan.md` as a skeptical senior architect whose job is to
find the reason this ships and does nothing. Each finding is judged by "what
actually happens on the most common user path", not by whether the plan is
internally tidy.

---

## A1 — CRITICAL: the anchor will almost never exist on the common path

**Claim in the plan (§5.6):** the anchor is "the nearest lower shot number in the
same scene that has an **approved** frame".

**What actually happens:** the storyboard has a "generate all start-frame images"
action, and the natural workflow is generate 9 shots → look at them → approve.
During that batch **nothing is approved yet**, so `selectSceneContinuityAnchor`
returns `undefined` for every shot, and the neighbor-anchoring half of Feature 138
silently does nothing on the path most users take. The feature would appear to
"not work" exactly as the previously-shipped features that were undiscoverable.

**Verdict: real, and fatal to the feature's value.** Must be fixed in the plan.

**Fix:** two changes.
1. Anchor resolution becomes a preference order, not a single source: the earlier
   same-scene shot's **approved** asset if there is one, otherwise its **most
   recently generated** asset. Approved still wins when both exist (display canon
   outranks a draft), but a scene that has never been approved still anchors.
2. Batch generation must process a scene's shots in **ascending shot order** so
   each shot can anchor to the frame the batch itself just produced. If the batch
   runs shots concurrently, it must at minimum serialize *within* a scene
   (different scenes may still run in parallel).

---

## A2 — HIGH: feature-flag names break the codebase convention

**Claim in the plan (§3.1):** flags named `vdMotionContracts` and
`vdSceneContinuity` (inherited verbatim from the design specs).

**Reality:** every shipped VD tenant flag uses the long prefix —
`verticalDramaQualityLedgers`, `verticalDramaRetentionHooks`,
`verticalDramaSeriesTieInQc`, `verticalDramaSeriesPresetMixV2`. A `vd*` flag would
be the only one of its kind in the interface, the key list, the defaults map and
the admin grouping UI.

**Verdict: real.** Rename to `verticalDramaMotionContracts` and
`verticalDramaSceneContinuity`, and note the deviation from the spec text so the
two documents don't drift silently.

---

## A3 — HIGH: scene-state invalidation is specified but not computable

**Claim (§5.2):** carry `sceneVisualStates` through plan regeneration,
"invalidating only the entries whose scene membership actually changed".

**Problem:** the `VdSceneVisualState` type has no record of which shots the scene
contained when the state was authored, so "membership changed" cannot be evaluated.

**Verdict: real.** Add `memberShotNumbers: number[]` to the stored state, captured
at authoring time. Invalidation = the newly computed group's shot list differs from
the stored one. Also decide the collision case: a `manualEdit: true` state whose
membership changed is **kept** but marked stale rather than deleted, so a user's
hand-written lock is never destroyed by a storyboard regeneration.

---

## A4 — MEDIUM: the judge-dimension "deterministic fact" as written is fragile

**Claim (§4.5):** back the new judge dimension with a fact such as "whether the
candidate's text asserts a facial-angle preservation".

**Problem:** that is substring/heuristic matching over free prose, and VD prompts
are written in Thai *or* English depending on the episode's prompt-language
setting. A phrase-matching fact will be wrong in one language, silently.

**Verdict: real.** The fact sheet should carry the **inputs** the judge needs —
`effectiveRisk` and the per-character observability summary — and let the judge do
the judging. Leave `pickBetterCandidateByHardFacts` untouched in P1; a
language-independent deterministic check is not available and a fake one is worse
than none.

---

## A5 — MEDIUM: the 6→7 vision cap raise has an unstated cost, and conflates two caps

**Observation:** `buildStartFrameShotPromptVisionImages` feeds the **prompt-authoring
LLM's vision input** — it is not the image model's reference list. Raising 6→7
therefore raises vision-token cost on every start-frame prompt call under the flag,
which is a different budget from the image model's `maxReferenceImages`.

**Verdict: partially real** (the plan is correct but under-explains, and a reader
could conflate the two). Make the distinction explicit and state the cost.

---

## A6 — MEDIUM: `repairShotImage` anchoring is the riskiest change for the smallest gain

**Observation:** adding the anchor to regenerate-in-place changes a path with a
fail-closed Hermes branch that hardcodes `roleFor: () => "current_image"` and
`requireAll: true`. The benefit is marginal — a repair already has the shot's own
image, which is the strongest continuity reference available.

**Verdict: real risk asymmetry.** Keep it in the plan but make it the **last**
sub-task and explicitly deferrable to P2 without loss of feature value.

---

## A7 — LOW: stale anchor references after a neighbor is regenerated

If shot 3 anchored to shot 2 and shot 2 is later regenerated, shot 3's image is
unchanged (deliberate: no cascades) but the UI indicator still says "anchored to
shot 2", now meaning a different image.

**Verdict: real but acceptable in P1.** Note it as a known limitation; P2's
continuity QC is what surfaces the mismatch. The indicator should therefore be
phrased as provenance ("generated using shot N as reference"), not as a live claim.

---

## A8 — LOW: loosening the prompt zod bound is a (small) input-surface change

Raising the mutation's input `max` from 3800 to the absolute 20000 lets a client
send a much larger string before the per-model runtime check rejects it.

**Verdict: acceptable, worth one line.** The bound stays finite and the runtime
check still enforces the real model limit; note it so a security reviewer sees it
was a deliberate, bounded choice.

---

## A9 — checked and found NOT to be problems

- *"Does the frame_analysis gate widening break flag-off byte-identity?"* No — the
  widened threshold is inside the flag branch on both the runner and router sides.
  Existing `mockDb.select` call-count assertions stay valid flag-off.
- *"Does the scene lock conflict with the policy-safe engine's rule that the LLM
  must not add lighting/props?"* No — that rule constrains the **LLM**; the lock is
  appended deterministically in code, after the LLM step.
- *"Could the deterministic risk floor override a skill that says 'low' when it
  should?"* It only ever raises severity (`max`), never lowers it, so a
  conservative skill answer cannot be weakened by code.
- *"Is one Scene Visual State per location per episode enough?"* For P1 yes; the
  `timeJumpSuspected` flag is the escape hatch that surfaces the case where it is
  not, without pretending to model it.

---

## Summary

| # | Severity | Status |
|---|---|---|
| A1 anchor never exists on the common path | CRITICAL | fix in plan |
| A2 flag naming convention | HIGH | fix in plan |
| A3 invalidation not computable | HIGH | fix in plan |
| A4 fragile judge fact | MEDIUM | fix in plan |
| A5 vision-cap cost/conflation | MEDIUM | clarify in plan |
| A6 repair-path risk asymmetry | MEDIUM | re-order + mark deferrable |
| A7 stale anchor provenance | LOW | note as known limitation |
| A8 input-bound loosening | LOW | note as deliberate |

8 findings, all integrated into `claude-plan.md`.
