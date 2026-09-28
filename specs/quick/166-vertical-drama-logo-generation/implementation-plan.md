# Implementation plan

## Objective

Implement end-to-end generated title/channel logo flow in Vertical Drama Settings with two confirmation gates and safe replacement of existing watermark slots.

## Affected files

- `apps/web/shared/verticalDramaSeries/logoGeneration.ts` — pure slot/prompt helpers and client-safe model/capability types
- `apps/web/shared/verticalDramaSeries/logoGeneration.test.ts` — exact prompt and patch behavior tests
- `apps/web/server/routers/verticalDramaSeries.ts` — model list, async submit, and trusted apply procedures
- `apps/web/server/routers/__tests__/verticalDramaSeries.logoGeneration.test.ts` — router authorization/capability/task tests
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx` — modal lifecycle, model picker, prompt editor, polling, preview/apply controls
- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaSettingsTab.logoGeneration.test.tsx` — UI flow and duplicate-submit coverage
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaTextOverlayCopy.ts` — localized labels/status/error copy if needed
- `orchestra/ui-browser-evidence.md` — route-level verification record

## Backend sequence

1. Add shared pure `buildSeriesLogoPrompt({slotId, seriesTitle, channelName})` and `patchGeneratedLogoSlot(config, slotId, durableUrl)` helpers.
2. Add `listTransparentLogoModels` under `verticalDramaSeries`: require feature/tenant/ownership context, query enabled image rows, merge static config, filter through `resolveTransparentBackgroundCapability`, and return stable display fields plus capability.
3. Add `generateSeriesLogo`: validate owned active series, prompt and model, resolve model row/capability, then call `mediaRouter.createCaller(ctx).generateImageAsync` with model, prompt, `outputFormat`, provider-native transparent param, `originSurface`, idempotency key, and `__vd_series_id`/`__vd_purpose` metadata. Return task envelope.
4. Add `applyGeneratedSeriesLogo`: validate owned series and slot, retrieve task through `getUnifiedMediaTask`, verify task completed, scoped to this series, purpose `series_logo`, image result and managed `/api/storage/files/` URL; patch only the selected slot while preserving all placement fields; persist via existing watermark update semantics. Make repeat apply with the same durable URL safe/idempotent.
5. Keep server errors generic enough for UI while preserving typed TRPC codes for unsupported model, ownership, transient task visibility, and invalid apply state.

## Frontend sequence

1. Add “สร้างโลโก้ด้วย AI” action to each watermark slot, hidden/disabled for read-only.
2. Open a dialog with slot label, compatible model select, channel-name input only for secondary, exact generated prompt in editable textarea, and an explicit “ตรวจสอบ prompt/ดำเนินการสร้าง” confirmation action.
3. After confirmation, disable modal controls and submit exactly once. Poll `media.getTask` with bounded retry handling; keep transient polling errors non-terminal.
4. On completed task, show preview using the trusted task result URL and explicit “ใช้ภาพนี้แทนโลโก้” / cancel actions. Apply sends taskId and slotId only.
5. On apply success, update local slot state/query cache and close/reset; on failure retain preview and allow retry without resubmitting generation.
6. Cover model-list loading/empty/error, validation, pending, preview, apply failure, read-only and narrow viewport states with accessible labels and focusable controls.

## Acceptance criteria

- Only enabled native-transparent image models appear.
- Title prompt and channel prompt match the approved exact templates before editing.
- User must confirm before generation and again before replacement.
- Repeated clicks cannot submit duplicate generation or apply mutations while pending.
- Generated PNG result is durable and watermark stores managed URL, never an unverified provider URL.
- Apply preserves slot placement settings and enables image watermark.
- Unsupported/foreign/incomplete tasks cannot be applied.
- Existing upload/text watermark behavior and legacy secondary omission remain intact.

## Verification

- Run focused shared/router/component tests.
- Run `npm --workspace apps/web test -- ...` with jsdom for UI tests.
- Run affected workspace typecheck; report baseline failures separately.
- Attempt browser verification at 390x844, 768x1024, and 1440x900; record skipped live-provider/auth evidence explicitly.
