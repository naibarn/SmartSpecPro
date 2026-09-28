# Drama Series — Option "Remotion Render" สำหรับวิดีโอรวม Sub-episode

สถานะ: APPROVED (ผู้ใช้สั่งตรง 2026-07-30)
คำสั่ง: เพิ่ม option ให้ VD ประกอบวิดีโอรวม sub-episode ผ่านคิว render-jobs (Remotion) แนวทางเดียวกับ marketplace ที่เพิ่งเสร็จ โดย**พก config ทั้งหมดจาก UI "ตัวเลือกการเรนเดอร์วิดีโอ" ไปด้วย**: รวมเสียงพูด+loudness, รูปแบบ/ขนาดซับไตเติล, badge อายุผู้ชม, แบนเนอร์, และ "ข้อความบนวิดีโอ" ทุกแบบ (ท้ายตอน/เติมตอนที่แล้ว/ป้ายชื่อเรื่อง/เลข Sub-ep มุมจอ/ป้ายแนะนำตัวละคร/การ์ดกลางตอนผูกช็อต)

## ของที่ reuse ได้ (จากงาน marketplace เพิ่งเสร็จ)
- `marketplaceAutoReviewStagedRemotionRender.ts`: pattern buildCaptionLines (timing จริงจาก ffprobe) + buildRemotionTemplate (video layers เต็มเฟรม + audio layer) + enqueue `queueRemotionRenderVideoJob` + `dispatchLaneARemotionRenderJob` (Lane A ทำงานจริง) + reconcile workerJobs row
- `RemotionTemplateConfigSchema` มี `text` layer (ข้อความ/CSS) + image layer → รองรับ overlay ทุกแบบของ VD
- `captionPresetId` 10 preset + `ass_burn`; VD subtitle เดิมเป็น SRT+ffmpeg (`verticalDramaAssembly.ts:208,373`) ต้อง map preset VD ("กล่องคลาสสิก" ฯลฯ) ↔ preset กลาง + ขนาด font

## ความเสี่ยงเฉพาะ VD
- Lane A render (chromium) รันใน process smartspec-web ที่มี cgroup MemoryHigh 1.25GB — VD เคยมี ffmpeg hang D-state (`project_vd_assembly_cgroup_throttle`) → option ต้อง**opt-in ต่อครั้ง** default = ffmpeg เดิม + fallback อัตโนมัติเมื่อ enqueue ล้ม
- VD ffmpeg path ห้ามแตะ/ถอด — เป็น default ต่อไป

## Waves
- W1 (backend): `verticalDramaRemotionRender.ts` — adapter VD assembly config → `RemotionRenderVideoWorkerInput` (clips จาก sub-episode, subtitle cues จาก dialogue/subtitle plan เดิม, text layers จาก overlay config ทุก toggle, banner เป็น image layer, age badge, audio+loudness) + enqueue + reconcile ลง `assemblyManifest` field เดิม + reason codes additive + tests
- W2 (frontend): checkbox "ใช้ Remotion render (คิวใหม่)" ในการ์ด "ตัวเลือกการเรนเดอร์วิดีโอ" + สถานะ job + fallback แจ้งชัด
- W3: ทดสอบจริง + deploy
