# Adversarial Self-Review — claude-plan.md, Round 1

**Date:** 2026-08-02
**Stance:** skeptical senior architect. For each section: *what could go wrong
that isn't addressed? what assumption might be wrong? is this specific enough to
implement without guessing?*

Five material findings. All were verified against source, not inferred.

---

## A1 🔴 The cost estimate has no basis — the confirm dialog would show a made-up number

**Where:** plan §5.5, decision D4.

The plan says the estimate uses "the existing loop-credit estimator". That
function is, in full:

```ts
export function estimateVideoProjectQualityLoopCredits(perRound: number, maxRounds: number): number {
  const clampedRounds = Math.max(1, Math.trunc(maxRounds));
  return Math.max(0, perRound) * clampedRounds;
}
```

It **takes `perRound` as a given and nothing in the codebase computes it.** The
plan never says where it comes from. An implementer would either invent a
constant or leave it zero — and D4 requires the user to *confirm* that number,
so a fabricated estimate is worse than none.

Compounding it: the estimate is described as `perRound × maxLoops`, but D1 makes
repair automatic, so one confirm can authorise far more than one call per round.
A worst-case round is: 1 review + up to 3 LLM-backed repair stages
(`content`, `narration`, `claims`) + 1 re-review. With `maxLoops: 2` that is up
to **9 LLM calls**, not 2.

**Fix:** define the cost model explicitly.
- `perRound` is derived from the resolved model's own catalog pricing
  (`pricingInput`/`pricingOutput` on the model row, already loaded by the
  resolver) multiplied by a token estimate from the document's actual size
  (scene count, narration/caption character totals) — not a magic constant.
- The dialog must present the **worst-case ceiling**
  `(1 review + 3 repair + 1 re-review) × maxLoops`, labelled as a ceiling, with
  the typical case shown alongside. Under-quoting a number the user clicks
  "confirm" on is the failure to avoid.
- State plainly that the estimate is indicative: actual billing comes from real
  token usage inside `callLLMStructured`.

---

## A2 🔴 Auto-repair is not idempotent under BullMQ redelivery

**Where:** plan §7, §9.

BullMQ can redeliver a job whose executor already completed. The plan handles
this for *credits* (idempotency key) but not for the *document*. A redelivered
repair job would re-read the stored review and apply those repairs **again** — on
a document that has already been repaired and whose revision has moved. Caption
cues would be split twice, scene boundaries shifted twice.

The hook already exists and is unused: the ledger entry records `revision`, "the
document revision this review judged".

**Fix:** make repair revision-guarded. `applyQualityRepairs` refuses to apply a
review whose recorded `revision` does not match the document's current
`revision`, failing with `VI_REPAIR_STALE_REVIEW` (new). A redelivery then
becomes a safe no-op rather than a double application. This also protects the
human case — a user editing the document between review and repair.

---

## A3 🟠 `fill_empty` mode contradicts the timeline and layer-budget rules

**Where:** plan §6.3, §6.4.

The two rules were written for a whole-document plan, but `fill_empty` (the
default) plans only *some* scenes:

- **Timeline:** the invariants say scenes must not overlap and must fit within
  the format duration — but nothing says the planner must respect the time
  ranges of the scenes it is *not* planning. As written, a `fill_empty` plan
  could be internally consistent and still collide with existing scenes.
- **Layer budget:** §6.3 says to "sum the layers the selected templates would
  emit". In `fill_empty` that sum excludes the layers already present, so the
  combined document can exceed 40 and become unrenderable — the exact failure
  the rule exists to prevent.

**Fix:** state both rules over the **merged** document, not the planned subset.
The planner receives existing scene time ranges as an occupied-interval list and
existing layer count as `used`, and validation runs against the merged result.

---

## A4 🟠 The recommended-model revocation alert has no mechanism

**Where:** plan §9 observability.

The plan requires alerting on recommended-model auto-revocation, and correctly
notes the circuit breaker "emits only console output today, no audit row and no
metric" — then asks for an alert anyway, without saying how. That is a
requirement with no implementation path; it would silently not get built.

**Fix:** the mechanism is ours to add.
`recordRecommendedModelQualityStrike` returns `{ recorded, revoked, strikeCount }`.
The resolver inspects that return value and, when `revoked === true`, emits a
`video_project_stage` audit event with the model id, strike count and reason.
The alert then keys off an audit row instead of a log line. This does not modify
the breaker — it consumes its existing return contract.

---

## A5 🟡 Model resolution timing is unspecified and can drift

**Where:** plan §5.1, §5.5.

The model must be resolved twice under the plan as written: once at dispatch (to
show the estimate, which depends on the model's pricing) and once in the job (to
make the call). Between the two, an admin edit or a circuit-breaker revocation
can change the answer — so the user confirms a price for model A and is billed
for model B.

**Fix:** resolve **once**, at dispatch, and carry the resolved model id in the
job payload (`input` is already a free-form record). The executor uses the
carried id and does not re-resolve. If that model has since become unavailable,
the job fails with `VI_NO_RECOMMENDED_MODEL` rather than silently substituting —
consistent with AD-3's no-silent-degradation rule.

---

## Checked and found sound (no change needed)

- Step 0's fail-fast enqueue + orphan sweep with a re-orphan cap: correct, and
  the re-orphan cap genuinely prevents the poison-pill loop.
- The non-duplication compile guards: real, already proven in the shipped
  interface, and extending them costs nothing.
- Rolling back a repair that worsens `blocksFinalRender`: correct direction —
  the compliance gate must never be loosened by an automated edit.
- Not tightening the shared document schema: correct call; tightening it would
  retroactively invalidate existing hand-authored documents.
- The known rewrite of the two loop tests is flagged rather than discovered
  mid-implementation.

---

## Disposition

A1–A5 integrated into `claude-plan.md`. One new error code added
(`VI_REPAIR_STALE_REVIEW`). No change to scope or the 5.5-day estimate: A2, A3
and A5 are constraints on code that was already going to be written, and A1/A4
are small additions inside Steps 1 and 5 respectively.
