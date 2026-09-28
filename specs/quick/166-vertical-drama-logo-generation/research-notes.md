# Research notes

- `VerticalDramaSettingsTab.tsx` มี watermark card สอง slot: primary inline และ secondary nested; upload image จะ set `type=image`, `enabled=true` แต่ยัง save ผ่าน `updateSeriesWatermark` แบบ explicit
- `apps/web/shared/mediaModelCapabilities.ts` มี `resolveTransparentBackgroundCapability` ซึ่ง fail-closed เมื่อ `supportsTransparentBackground` ไม่เป็น true และคืน input key/value/output format
- `media.generateImageAsync` มี validation model/prompt, credit reservation/refund, rate limit, audit, provider transport และ task id; ใช้ `extraParams` และ `outputFormat` ได้
- Existing Vertical Drama callers use lazy `mediaRouter.createCaller(ctx)` for in-process media procedures, avoiding network duplication
- `verticalDramaMediaAssetService.getVerticalDramaTaskScope` อ่าน `__vd_series_id`/`__vd_purpose`; unified polling จะ ingest completed result เป็น managed Vertical Drama asset
- `updateSeriesWatermark` ตรวจ tenant feature flag และ series ownership แล้วเขียน JSONB watermark เดิม
- Existing watermark schema accepts managed relative URLs and has no mediaAssetId field; apply must therefore only persist the durable URL returned by the trusted task boundary
- `VerticalDramaSeriesDetailPage.tsx` already passes title, seriesId, readOnly, watermark and feature flag into Settings
- Repository is heavily dirty with unrelated changes; owned edits must be limited to the new spec/plan artifacts, shared logo helper, verticalDramaSeries router, Settings UI/copy/tests
- SocratiCode tools were not exposed in this session; bounded `rg`/targeted reads were used as fallback
