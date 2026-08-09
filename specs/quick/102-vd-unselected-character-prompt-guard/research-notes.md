# Research Notes

- The screenshot proves the current exact-cast lock is insufficient when the
  positive synopsis still contains the unselected name `ปราง`.
- `buildDeterministicPolicySafeImagePrompt` currently appends the rewritten
  synopsis verbatim after the exact physical-cast lock.
- Other prompt modes can also return names copied from synopsis/current prompt,
  so enforcement must run on the final positive prompt, not only mode input.
- `GenerateStartFrameShotPromptParams.characters` currently contains selected
  identity rows only and cannot identify other roster names.
- The router already owns tenant/series-scoped character lookup and should pass
  a bounded list of excluded roster names into the service.
- No auth, schema, tenant boundary, or paid-generation mutation needs changing.
- SocratiCode is unavailable; discovery used targeted `rg` and line reads.
