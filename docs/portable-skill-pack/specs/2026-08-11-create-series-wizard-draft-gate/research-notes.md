# Research Notes

## Current client behavior

- `CreateSeriesWizard.tsx` resolves one preset without a premise to
  `apply_preset_verbatim`.
- `PresetSynthesisActionPanel` exposes a direct `ใช้ Preset นี้` action for that kind.
- `applyPreset` copies preset fields and sets `appliedPresetId`.
- `applyPresetDraft` already fills title/logline/plot/arc/cast/locations/visual bible and
  preserves a manually typed title, but it does not record a draft confirmation key.
- `stepComplete`, `createValid`, and the footer currently do not require an applied AI draft.
- Stepper buttons are freely navigable, including forward navigation.
- Draft title candidates already render when `draft.titleOptions` exists.

## Current server/skill behavior

- `synthesizeGenrePreset` is already skill-backed through
  `verticalDramaPresetSynthesis.ts` and credits are recorded with `sourceType: "skill"`.
- The server schema accepts one selected preset when a seed/premise is present, and the
  wizard's defaults provide a basic seed.
- `titleOptions` is schema-optional for backward compatibility and has a 4–5 item bound.
- The skill does not explicitly instruct the single-preset case to reinterpret the source.

## Impact boundary

Expected files are the wizard, focused wizard tests, synthesis service/tests, and the
vertical-drama preset synthesizer skill contract/fixtures. No schema or old-series code is
required.

## Risks

- Existing tests may assume the old direct single-preset action.
- Async mutation data may be pre-seeded in tests and must not be treated as confirmed until
  the user presses `ใช้ draft นี้`.
- Source-change detection must exclude ordinary edits to generated output fields and manual
  title edits.
- A late mutation response must not restore an older draft after regeneration.
