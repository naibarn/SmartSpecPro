# Vertical Drama episode preview sets

## Goal

เพิ่มพื้นที่ “ตัวอย่างซีรีย์” ในส่วนประกอบวิดีโอรวมของ Sub-episode ให้ผู้ใช้สร้าง preview ได้สูงสุด 4 ชุด โดยแต่ละชุดเลือก 2 shots จาก 1-9, รวมด้วย Remotion, แสดงชื่อ Sub-EP เป็น overlay ชัดเจน และปิดท้ายด้วยหน้าปกของตอนนั้น

## Architecture

- Reuse `remotion_render_video` + `GenericTemplate` ที่มีอยู่แล้ว โดยใช้ `renderProfile.profile = preview`
- เพิ่ม preview template option ใน `verticalDramaRemotionRender.ts`: selected clip layers, large intro title overlay, and full-frame episode cover end card
- เก็บสถานะใน `assemblyManifest.episodePreviews[]` ซึ่งเป็น JSONB เดิม ไม่เพิ่มตาราง/migration
- เพิ่ม router mutation สำหรับ submit และ reconcile preview job ผ่าน `getEpisodeDetail` polling เดิม
- แยก `VerticalDramaEpisodeCoverSurface` เป็น component กลาง แล้ว reuse ใน Episodes tab และ preview panel

## Data contract

แต่ละชุดมี `slotId` 1-4, `selectedShotNumbers` 2 ค่าไม่ซ้ำ, `status` pending/completed/failed, `pendingJobId`, `videoUrl`, `durationSeconds`, timestamps และ error ตามสถานะ

การ submit จะตรวจ tenant/user/series/episode ownership, clip ของทั้งสอง shot ต้องพร้อม, และหน้าปกต้องมี asset URL ที่เข้าถึงได้ ถ้าไม่พร้อมจะคืน `PRECONDITION_FAILED` โดยไม่สร้าง job

## UI/UX contract

### Target user / JTBD

- ผู้สร้าง Vertical Drama ที่กำลังประกอบวิดีโอรวม
- ต้องการทำ teaser หลายแบบจาก 2 shots เพื่อดู/ดาวน์โหลดได้เร็ว
- Entry point คือ card “วิดีโอรวม Sub-episode” ในหน้า episode workspace
- Success คือเห็น preview cards สูงสุด 4 ใบใน row เดียวบน desktop และใช้งานได้เมื่อ reload

### Existing Pattern Reference

- `VerticalDramaSeriesDetailPage.tsx` — หน้าปกตอนย่อย, credit confirmation, model picker, upload/download
- `VerticalDramaStoryboardPanel.tsx` — compiled video state card, fullscreen, download, pending/failed states
- Decision: reuse component/state conventions; diverge only by adding slot-based shot selection and preview grid

### Surface inventory

| Surface                               | Change                                |
| ------------------------------------- | ------------------------------------- |
| Episode workspace compiled-video card | เพิ่ม preview panel แยกกรอบชัดเจน     |
| Episodes tab cover surface            | เปลี่ยนไปใช้ shared cover component   |
| Remotion queue                        | รับ preview render ผ่าน contract เดิม |

### State matrix

- loading: cover/status/job spinner
- empty: ยังไม่มีหน้าปกหรือยังไม่เลือก shot พร้อมคำแนะนำ
- selected: slot เลือกได้ exactly 2 shots
- pending: แสดงคิว render และลิงก์ Render Jobs
- success: เล่น video, fullscreen, download
- error: แสดง error และปุ่มสร้าง slot เดิมใหม่
- disabled/focus/hover: ปุ่ม disabled เมื่อ shot/cover ไม่พร้อม และ controls มี focus ring

### Responsive matrix

- mobile 390x844: panel stack แนวตั้ง, slot cards เลื่อนแนวนอน, controls touch-friendly
- tablet 768x1024: options อยู่บนผลลัพธ์, preview grid 2 columns
- desktop 1440x900: cover/options ซ้ายและ result slots row เดียวสูงสุด 4 ใบ

### Accessibility acceptance

- shot checkboxes มี label ชัดเจน, keyboard ใช้ได้, disabled state ไม่สื่อด้วยสีอย่างเดียว
- video controls ใช้ native controls พร้อมปุ่ม fullscreen/download แยก
- pending/error ใช้ `role=status`/`role=alert` ตามความเหมาะสม

## Failure and cost handling

- ทั้งสร้างปกและสร้าง preview ใช้ credit confirmation ที่จุดกด paid action
- preview ไม่สร้าง job หาก cover หรือ selected clips ไม่พร้อม
- job terminal state ถูก reconcile กลับไปยัง slot เดิม; output URL รองรับทั้ง public URL และ storage reference ตาม helper เดิม
- จำกัด concurrency ตาม `queueRemotionRenderVideoJob` เดิม และจำกัด slot 1-4 ฝั่ง server

## Verification

- shared validation/template unit tests
- router submit/reconcile tests with mocked queue/job rows
- component tests for shot selection, max-four slots, cover action, pending/success/error controls
- `git diff --check`, focused Vitest, and targeted TypeScript diagnostics
