# TDD guidance

## Tests first

1. Pure helper tests for exact Thai prompt templates, required channel name, slot patch preserving position/opacity/scale/margin, and managed URL acceptance.
2. Router tests for compatible-model filtering, fail-closed unsupported model, generated task metadata/transparent params, ownership/scope/status/durability rejection, successful primary/secondary patch, and idempotent apply.
3. UI tests for model loading/empty state, title prompt, channel-name dialog, editable prompt, generate confirmation, one submission under repeated clicks, polling completion/error, preview, apply confirmation, cancel, and apply failure retry.

## Expected initial failures

- New helper exports and router procedures do not exist.
- Settings component has no AI-logo controls or modal states.

## Regression checks

- Existing `VerticalDramaSettingsTab.watermark.test.tsx` must remain green.
- Existing textOverlay schema/render tests must remain green.
- Existing media transparent capability tests must remain green.
- Typecheck catches tRPC client shape and JSONB slot type drift.
