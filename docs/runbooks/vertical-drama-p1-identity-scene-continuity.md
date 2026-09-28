# Vertical Drama P1 — identity, scene continuity, and series look

## Scope

This runbook covers the staged rollout of Features 137, 138 P1a, and 139 P1.
All three tenant flags remain off by default:

- `verticalDramaMotionContracts` — identity-safe motion profile, observability,
  and motion-contract authoring.
- `verticalDramaSceneContinuity` — Scene Visual State planning and lock injection.
- `verticalDramaSeriesLookLock` — the editable series-level visual register.

`verticalDramaSceneNeighborAnchors` is intentionally not part of this rollout;
it is the later P1b canary and must remain off.

## Rollout order

1. Run the focused Section 14 suites from `apps/web`, then inspect the current
   Gate A/Gate B fail-set artifacts in
   `planning/vd-p1-identity-scene-continuity/baselines/`.
2. Enable the three flags for one internal tenant only. Keep the look register
   empty for a control series and choose one registered look for a test series.
3. Generate one nine-shot episode per target genre. Compare identity, scene
   lighting/layout, and look-register adherence; record prompt budgets,
   reference trimming, and generation latency.
4. Expand to one series per genre only after the control comparison shows no new
   fail-set identity, cross-tenant access, or credit/call-count regression.
5. Promote to GA only after the product quality rubric and operational metrics
   are reviewed. Do not enable the neighbor-anchor flag in this rollout.

## Safe rollback

- Turn off the affected tenant flag first. Existing persisted state is retained
  but becomes inert; no destructive data migration is required.
- If only scene planning is unhealthy, disable
  `verticalDramaSceneContinuity` while leaving motion/look controls unchanged.
- If a look is wrong, clear or switch the series look through the existing
  settings UI, then regenerate only the affected prompt/render stage.
- Treat `CONFLICT` from a scene mutation as an expected stale-editor response:
  reload the episode, show the latest revision, and retry with the new
  `expectedRevision`; never overwrite blindly.
- Do not delete scene state, frames, or assets as a rollback step.

## Manual smoke checklist

Run against an internal tenant with suitable credits and a real model:

1. With all three flags off, open an existing episode and verify the workspace
   has no scene-lock/motion/look authoring controls and the legacy prompt path
   still works.
2. Enable scene continuity. Plan one scene, refresh, and verify the lock chip,
   author, revision, and state fields are visible. Edit with the current
   revision, then submit a stale revision and verify a visible conflict.
3. Enable motion contracts. Generate a video prompt with an attached character
   reference and verify the motion profile, effective risk, observability, and
   contract text are present without an additional generation call.
4. Enable the series look. Save a look, generate two image prompts, and verify
   the same register is applied once per prompt; verify the video prompt does
   not receive image-only provider fragments.
5. With all three flags on, generate a same-scene pair and confirm the grouped
   scene lock, motion facts, and look register stay within the selected model's
   prompt/reference budgets.
6. Check audit/event records contain identifiers and outcomes only, not prompt
   text, image URLs, or user-entered free text.

## Automated live-gate replay

The real-LLM gate is opt-in and never calls a provider by itself. An authorized
adapter must write the evaluator JSON, then run:

```bash
cd apps/web
VERTICAL_DRAMA_P1_REAL_LLM_GATE=1 \
VERTICAL_DRAMA_P1_REAL_LLM_GATE_SAMPLE=/secure/path/sample.json \
npx vitest run server/services/__tests__/verticalDramaP1RealLlmGate.live.test.ts --reporter=basic
```

The default test suite replays the checked-in clean fixture through the same
pure evaluator. Missing credentials, tenant access, or credits are an external
manual-smoke blocker, not a reason to weaken the gate or enable it by default.
