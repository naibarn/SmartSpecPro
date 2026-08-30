# TDD Guidance

## Shared contract first

1. Add failing tests that parse a legacy state without `sleepSurface` unchanged.
2. Add a valid long-bed and crib/bassinet fixture and assert normalized output.
3. Add a render test that places the structured sleep-surface constraint in the
   continuity lock and preserves explicit user/script precedence.
4. Implement the optional field, parser, and renderer.

## Mutation invalidation

1. Add a failing router test with two member frames and one unrelated frame.
2. Assert a manual patch updates the shared state, marks both members with
   `imageStaleReason: "prompt_changed"`, stamps `imageStaleAt`, clears their
   `sceneContinuity`, and retains their media anchors.
3. Assert a stale `expectedRevision` still rejects without modifying the plan.
4. Implement the transaction update and return affected shot numbers.

## UI

1. Add a failing component test that the Inspector starts collapsed and displays
   title, purpose, count, and scope explanation.
2. Add expansion tests for helper copy and all editable sections.
3. Add edit/save tests for the structured sleep surface and list rows.
4. Add error/conflict and loading/disabled state tests.
5. Implement with existing Button, Input, Textarea, Label, Badge, Accordion or
   Collapsible primitives and semantic tokens.

## Regression commands

```bash
npm --workspace apps/web test -- --run \
  shared/verticalDramaSeries/__tests__/sceneContinuity.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.sceneVisualStates.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.sceneVisualStateMutations.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaSceneLockRow.test.tsx \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx
```

Then run a bounded TypeScript check or the repository's established web check
if it completes reliably. Full typecheck is baseline-noisy/expensive in this
repository and must be reported honestly if it does not complete.
