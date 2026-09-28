# Video-prompt provider-ready gap closure

Date: 2026-08-18

## Audit result

The Vertical Drama shot-prompt path already resolves the selected catalog model,
attaches the approved start frame and character/location evidence, validates the
structured LLM response, pins canonical dialogue, and runs provider-aware prompt
QC before persistence/render. Kie.ai/Grok resolves to a 4,096-character budget;
other models retain the 2,000-character floor unless their catalog advertises a
larger limit.

The audit found two contract gaps:

1. `ensurePromptWithinLimit` could hard-truncate an over-limit video prompt when
   the refiner failed or remained over the cap. This could remove dialogue,
   identity, or physical-action constraints while still returning a seemingly
   valid prompt.
2. `formatVideoClipRequest` could roll back its own start-frame, dialogue, or
   accent clauses to fit the legacy cap before the final provider QC boundary.
   That made the persisted prompt and provider payload semantically diverge.

## Closure

- Video prompts now default to fail-closed provider QC. Two lossless refiner
  attempts are allowed; if they cannot satisfy the selected hard cap, the path
  raises `provider_budget_exceeded` and spends no provider credit.
- Protected dialogue fragments remain mandatory and still raise the explicit
  protected-fragment overflow error when they cannot fit.
- The formatter now preserves all semantic clauses and leaves complete-payload
  compression to the final QC boundary. It never silently drops speaker,
  start-frame, or delivery instructions.
- Image prompts retain the legacy advisory truncation behavior unless a caller
  explicitly opts into `failClosed`, so this change is scoped to provider-ready
  video safety.

## Proof

Focused tests pass with a valid test `JWT_SECRET`:

```text
69 tests passed
  server/services/__tests__/verticalDramaPromptQc.test.ts
  server/services/__tests__/verticalDramaVideoPromptFormatter.test.ts
  shared/verticalDramaSeries/__tests__/videoPromptBudget.test.ts
```

The existing provider budget tests prove Kie.ai aliases resolve to 4,096 and
non-Kie models preserve the legacy floor. Browser/provider submission and live
credit reconciliation were not run in this local audit.
