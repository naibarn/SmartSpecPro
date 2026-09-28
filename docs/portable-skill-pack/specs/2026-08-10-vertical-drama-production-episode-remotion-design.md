# Vertical Drama Production Episode Remotion Render Design

Date: 2026-08-10
Status: approved for implementation

## Goal

เพิ่มการสร้าง Production Episode จากช่วง Sub-Episode ที่ผู้ใช้เลือก โดยใช้ Remotion ผ่าน `remotion_render_video` job เดิม ผู้ใช้กำหนดช่วงเริ่มต้น/สิ้นสุดและจำนวน Sub-Episode ต่อ EP (ขั้นต่ำ 3) ระบบแบ่งช่วงเป็น EP ต่อเนื่องอัตโนมัติ แสดงผล EP ในหน้า UI และรองรับ play, fullscreen และ download

## Approved product decisions

- รองรับ source mode: auto, compiled-only, และ shot-assembly-only
- auto ใช้ compiled video ก่อน และ fallback เป็น shot assembly เฉพาะ Sub-Episode ที่ยังไม่มี compiled video
- ผู้ใช้เลือกช่วงรวมและจำนวน Sub-Episode ต่อ EP แยกกัน
- เลข EP คำนวณอัตโนมัติตามลำดับ Production Episode ที่สร้าง
- ชื่อเรื่องใช้ชื่อซีรีส์อัตโนมัติ และเปิด/ปิดการแสดงผลได้
- ลายน้ำใช้ enabled watermark slots ทั้งหมดจาก Series Settings และคงค่าตำแหน่ง/opacity/scale เดิม เปิด/ปิดได้ต่อ render
- กลุ่มท้ายช่วงที่มีสมาชิกน้อยกว่าจำนวนที่เลือกต้องให้ผู้ใช้ยืนยันว่าจะสร้าง EP สั้นหรือข้าม
- ใช้ manifest JSONB เดิมบน series ไม่เพิ่มตารางใน increment นี้
- ใช้ queue/job contract เดิมของ Remotion ไม่สร้าง job type ใหม่

## Architecture

`VerticalDramaProductionEpisodesPanel` ส่ง mutation ที่ validate ช่วงและแบ่งกลุ่มใน server router. Server resolves each Sub-Episode into a durable Remotion segmented-render payload. Each group becomes one `remotion_render_video` job; the job uses `segmentTemplates` and the existing GenericTemplate composition. A segment contains either one compiled video layer or the source shot video layers for one Sub-Episode. EP number, series title, and configured watermarks are added as Remotion text/image layers across the segment timeline.

The server writes a pending group state before enqueueing. Completion reconciliation maps the worker output back to the exact series/group identity using the job's immutable render target metadata. Failed or canceled jobs mark only their target group as failed/canceled and preserve other groups.

## Data contract

The existing `productionEpisodesManifest` remains the durable container. Each group gains additive metadata: production episode number, source range, source mode, render job id, render options, and terminal output/error fields. Existing completed FFmpeg groups remain readable and playable. New Remotion groups are distinguished by `renderer: "remotion"`; no destructive migration or backfill is required.

Server-side input limits: `startSubEpisode >= 1`, `endSubEpisode >= startSubEpisode`, `subEpisodesPerProductionEpisode >= 3`, bounded by the series episode count and a safe maximum render range. Episode numbers must resolve to the same owned series; source assets must pass existing ownership/storage URL resolution before being placed into the job payload.

## UI/UX

Reuse the existing Production Episodes panel, compiled-video player, Radix controls, and `vdCopy` language pattern. Add a compact range/grouping form and a render-options section. The list card shows `EP.01`, Sub-EP range, source mode, title/watermark flags, status, duration, and actions. Loading, empty, pending/queued, failed, partial-success, disabled, and completed states are explicit. The form is responsive at mobile 390x844, tablet 768x1024, and desktop 1440x900; range controls stack on mobile and action buttons remain reachable.

## Failure handling

- Invalid range or fewer than 3 per EP: reject synchronously with Thai/English validation copy.
- Missing source assets in compiled-only/shot-only mode: reject the affected group with the missing Sub-EP numbers; auto mode may mix sources.
- Queue admission failure: persist group failure and return a user-visible error.
- Worker failure/cancel: terminal group error; no stale pending state.
- Refresh/reload: read manifest and render jobs; never depend on transient client state.
- Duplicate submission: use stable target/group idempotency so the same range/options does not create duplicate active jobs.

## Security and operations

All reads and mutations remain behind the existing tenant-owned Vertical Drama procedure and series ownership checks. Never accept arbitrary URLs from the browser for source videos or watermarks; resolve persisted owned assets server-side. Job payloads carry only validated asset references/URLs accepted by the existing Remotion staging allowlist. No credentials or secrets are added. Remotion rendering remains worker-pulled and does not run in the request handler.

## Verification

- Pure tests for range partitioning, minimum-three validation, remainder confirmation, source resolution, EP numbering, and overlay construction.
- Router/service tests for ownership, job enqueue, pending manifest persistence, idempotency, and completion/failure reconciliation.
- Remotion contract tests for compiled and shot segments, title/EP/watermark layer presence, and segment duration.
- UI tests for form validation, pending/failed/success states, player actions, and cached-refetch resilience.
- Focused TypeScript/tests plus `git diff --check`; browser evidence at mobile/tablet/desktop where tooling is available.

## Non-goals

- No new Production Episode database table.
- No change to existing Sub-Episode render semantics.
- No desktop worker capability expansion beyond the existing Remotion job contract.
- No automatic publishing to social channels.
