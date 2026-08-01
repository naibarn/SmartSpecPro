# Section 14 implementation record

Completed the code-side closeout for Features 137/138 P1a/139:

- `verticalDramaP1FlagOffParity.test.ts` captures five stable prompt/reference
  surfaces at merge-base `9eda150ce...` and proves omitted/explicit-false parity.
- `verticalDramaP1BothFlagsOn.test.ts` covers the joint scene/motion matrix,
  lock ordering, reference cap, and prompt budget.
- `verticalDramaP1RealLlmGate.ts` plus offline/live suites provide a frozen,
  pure evaluator. Live execution is opt-in and requires an authorized sample;
  no provider call is made by default.
- Router, scene-lock UI, storyboard UI, and workspace forwarding tests cover
  mutation guards, stale revisions, feature-off rendering, and fallback wiring.
- The selected-model budget call now has explicit `getStaticModelById` mocks in
  the legacy router suites, restoring the frozen Gate B fail-set.
- The existing scene mutation implementation also received a narrow row type
  assertion and locale narrowing so the touched VD surface has no type errors.

Evidence:

- Gate A: 5 failures / 263 passes; final fail-set is identical to
  `gate-a-failset-current.txt`.
- Gate B: 57 failures; `comm -13` against `gate-b-failset-after.txt` is empty.
- Focused Section 14 run: 36 passed, 1 opt-in live test skipped.
- Full typecheck remains non-green outside VD P1 (41 repository-wide errors);
  the changed-surface filter is empty.

Still external/manual: internal tenant browser smoke and one authorized
real-LLM sample. P1b neighbor anchoring remains intentionally deferred.
