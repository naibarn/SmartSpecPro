# Vertical Drama end-to-end coverage hardening

## Original request

วางแผนปรับปรุงระบบ Vertical Drama ให้สมบูรณ์ รองรับทั้งกรณีไม่มี preset, user เลือก preset, การสร้างภาคต่อ S2 เป็นต้นไป และภาคพิเศษที่มีภาพอ้างอิง โดยให้ข้อมูลไหลครบจนถึง QC

## Audit-derived scope

- Preserve the working no-preset and selected-preset synthesis paths.
- Preserve sequel lineage, carry-over, ownership checks, and atomic cast cloning.
- Close the special-edition uploaded-reference gap: uploaded `referenceAssetIds` are persisted but are not resolved into image-generation attachments.
- Make QC semantics explicit and consistent across Wizard create, direct API create, episode media generation, and final assembly.
- Carry lineage facts into the direct episode-continuation path instead of relying only on the full-story path.
- Add regression and integration evidence for every combination above.

## Assumptions

- Uploaded reference asset IDs are storage handles; render-time code must resolve them with tenant + user ownership checks and must not trust arbitrary client IDs.
- Existing series and legacy/manual callers need a compatibility path, but new production generation should fail closed when mandatory QC or required references are missing.
- Existing feature flags remain the rollout mechanism; no tenant should silently receive a new paid hard gate without an explicit flag/observability event.

## Non-goals

- Redesigning preset synthesis UX or changing the visual identity schema.
- Replacing the existing quality-review repair loop.
- Changing provider model catalogs or adding a new provider.
- Broad cleanup of unrelated dirty-worktree changes.
