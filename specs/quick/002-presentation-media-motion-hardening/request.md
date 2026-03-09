# Request

วางแผนงานต่อยอดจาก media motion v1 ที่ implement แล้ว เพื่อเก็บทุกจุดที่แนะนำจาก code review รอบล่าสุด:

- ลดความเสี่ยง preview/export drift จากการมี motion math สองชุด
- เพิ่ม regression coverage สำหรับ pause/resume ให้แน่ใจว่า motion หยุดจริงและ resume ต่อจาก progress เดิม
- ขยาย pan presets ให้ครอบคลุมหลายทิศทางมากขึ้น และลดโอกาสเห็นขอบว่างระหว่าง pan
- ทำให้ warning `SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED` ถูกสื่อสารถึงผู้ใช้ใน export UX จริง ไม่ใช่มีแค่ใน render spec/test backend
- ยืนยันว่า effect แสดงครบในทุก playback surface ที่ผู้ใช้ใช้จริง:
  - `Play Slideshow` ใน Presentation Editor
  - `PlayMode` (`/presentation/:itemId/play`)
  - `export mp4`

## Assumptions

- งานนี้เป็น hardening + v1.1 enhancement ต่อจาก package `001-presentation-media-effects`
- ยังไม่ต้องทำ DB migration หรือ schema version bump ถ้า field เดิมสามารถขยายแบบ backward-compatible ได้
- แนวทางหลักยังคงเดิม: media motion เป็น additive transform บน image/video เท่านั้น
- MP4 export ต้องเป็น source of truth สำหรับ motion-preserving export ส่วน `png/jpg/pdf` ยังคง degrade เป็น static พร้อม warning

## Non-goals

- ยังไม่ทำ timeline/keyframe editor แบบอิสระ
- ยังไม่ทำ easing แบบ custom bezier
- ยังไม่เพิ่ม motion ให้ element ประเภท text/shape
