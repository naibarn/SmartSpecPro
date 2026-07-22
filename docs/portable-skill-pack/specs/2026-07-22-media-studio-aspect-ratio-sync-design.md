# Media Studio Aspect Ratio Sync Design

## Problem

Media Studio currently keeps aspect ratio in multiple state locations:

- `tabState.aspectRatio`, shown by the Settings selector
- `dynamicFormValues.aspectRatio` / `dynamicFormValues.aspect_ratio`, populated by Advanced Skill state
- model input values synchronized from the selected model metadata

The Advanced Skill aspect-ratio controls are excluded from the rendered form, but stale
values may remain in `dynamicFormValues`. Generation and retry currently prefer that
hidden value over the visible Settings selector. This allows the UI to show `9:16` while
the submitted request contains `16:9`.

## Decision

Use `tabState.aspectRatio` as the canonical Media Studio aspect ratio for ordinary image
and video generation. Keep all secondary state projections synchronized with it.

The existing Veo storyboard resolver remains a deliberate exception because it combines
generation type, model inputs, skill inputs, and the Studio control under a specialized
contract.

## Synchronization Contract

1. A change from the Settings selector updates the canonical `aspectRatio`.
2. Model input fields whose `syncWith` target is `aspect_ratio` continue to project the
   canonical value and remain read-only where currently configured.
3. When Advanced Skill values are updated by a preset, restored snapshot, URL handoff,
   or form callback, a valid `aspectRatio` or `aspect_ratio` value updates the canonical
   value.
4. After an Advanced-originated update, any aspect-ratio aliases already present in the
   Advanced value object are normalized to the same canonical value.
5. Ordinary Generate and Retry submissions use the canonical value and never give a
   stale hidden Advanced value precedence.
6. Veo storyboard generation continues through `resolveVeoSyncedAspectRatio`.

## Implementation Shape

- Add a small pure helper for reading and normalizing Advanced aspect-ratio aliases. The
  helper receives the selected model's allowed ratios so unsupported values cannot become
  canonical UI state.
- Update the Advanced form change handler to synchronize valid Advanced-originated
  aspect-ratio changes back to `tabState.aspectRatio`.
- Update Settings-originated changes to normalize any existing Advanced aliases without
  adding unrelated hidden fields to skills that do not define them.
- Replace the ordinary Generate and Retry precedence expressions with the canonical
  `aspectRatio` value.
- Keep the change scoped to Media Studio state and tests; no API, database, provider, or
  catalog changes are required.

## Failure Handling

- Empty, non-string, or values unsupported by the selected model do not overwrite the
  canonical value.
- If both Advanced aliases arrive with different valid values, prefer `aspectRatio`, then
  normalize the existing aliases to that value.
- Model-aware validation remains responsible for rejecting ratios unsupported by the
  selected model.

## Tests

Add focused regression coverage for:

1. Settings changes from `16:9` to `9:16` normalize existing Advanced aliases.
2. Advanced changes from `16:9` to `9:16` update the canonical value.
3. Conflicting aliases resolve deterministically.
4. Empty or malformed Advanced values do not replace the canonical value.
5. Ordinary generation resolution ignores a stale hidden Advanced value.
6. Retry uses the same resolution contract.
7. Existing Media Studio payload tests still prove the canonical value is forwarded.

## Rollout and Risk

This is a client-only state-correction change with no migration or external API changes.
The primary regression risk is accidentally changing Veo storyboard aspect resolution;
focused tests must prove the Veo branch remains unchanged. No production generation is
required for verification because it would consume provider credits; a live smoke can be
performed separately after deployment if desired.
