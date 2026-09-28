# Video Studio Preview Visual Polish

## Goal

ทำให้ preview ของ Video Studio ดูเป็นงานวิดีโอจริงและช่วยตัดสินใจได้ทันที โดยไม่สร้าง renderer คนละชุดกับ final render และไม่บังคับให้ทุกฉากต้องสร้างภาพใหม่จาก media model

## Chosen design

ใช้ `@remotion/player` และ `GenericTemplateComposition` ชุดเดิมเป็น source of truth ต่อไป แล้วปรับชั้น visual ดังนี้:

1. เปลี่ยนพื้น canvas จากดำสนิทเป็น dark stage แบบมี depth เพื่อให้ภาพ/การ์ดไม่ดูเหมือน placeholder
2. ปรับ `motionGraphic` ที่เป็น card/shape ให้ใช้ SVG gradient, highlight, border และ shadow ที่ deterministic จาก `color` เดิม จึงไม่เพิ่ม schema หรือ worker contract ในรอบนี้
3. ปรับ text layer ให้มี safe contrast, line-height และ text shadow โดยไม่เปลี่ยน timing หรือ geometry
4. ปรับกรอบ preview ใน editor ให้เป็น stage ขนาดพอดี มี aspect-ratio label, fullscreen และ letterbox ที่ชัดเจน
5. คง asset จริงเป็นลำดับแรก; visual polish เป็น fallback ของ graphic/template layer ไม่แทนที่ missing-asset error ที่ compiler ต้องรายงาน

## Trade-offs

- ไม่เพิ่ม `visualCard` schema ในรอบนี้ จึงไม่ต้อง bump worker/runtime contract และลดความเสี่ยง preview กับ worker drift
- SVG ถูกใช้เป็น implementation ของ motion graphic ที่มีอยู่ ไม่ใช่ไฟล์ภาพ raster ใหม่ จึงยัง render ได้ deterministic และปรับตาม frame ได้
- การปรับพื้น stage กระทบ template เดิมเล็กน้อย แต่ไม่เปลี่ยนตำแหน่ง, duration, subtitle timing หรือ asset URL

## Acceptance criteria

- Preview ไม่แสดง card สีเทาแบน ๆ สำหรับ motion graphic ที่มีอยู่
- Preview และ final render ใช้ composition logic เดียวกัน
- Fullscreen, controls, loading/error states เดิมยังทำงาน
- Existing template/compiler/preview tests ผ่าน
- ไม่มี contract/version bump ที่ไม่จำเป็น
