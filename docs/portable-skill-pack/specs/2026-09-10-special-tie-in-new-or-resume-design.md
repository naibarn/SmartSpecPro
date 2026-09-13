# Special Tie-in: เลือกสร้างตอนใหม่หรือโหลดงานเดิม

วันที่: 2026-09-10
สถานะ: อนุมัติสำหรับ implementation

## เป้าหมาย

เมื่อผู้ใช้กด “สร้างตอนพิเศษ” จากหน้า Sub-episodes ให้เลือกโหมดการทำงานอย่างชัดเจนก่อนเปิดฟอร์ม เพื่อป้องกันการนำ idea/reference/job ของตอนก่อนหน้ามาปะปนกับตอนใหม่

## ขอบเขต

- แก้เฉพาะ flow สร้าง Special Tie-in จาก `VerticalDramaSeriesDetailPage` และ `SpecialTieInEpisodeDialog`
- ไม่เปลี่ยน flow สร้าง/ต่อเนื่องของตอนปกติ
- ไม่ลบประวัติ idea ถาวร เพราะผู้ใช้ยังต้องเลือก “โหลดงานเดิม” เพื่อกู้กลับมาได้
- การแก้ไข Special Tie-in ที่มีอยู่แล้วผ่าน `initialInput` ต้องคงพฤติกรรมเดิม

## พฤติกรรมผู้ใช้

1. กด “สร้างตอนพิเศษ”
2. แสดง dialog กลางหน้าจอ “เลือกวิธีเริ่มต้น” พร้อมสองทางเลือก
   - **สร้างตอนใหม่**: เปิดฟอร์มว่างและเริ่มงานใหม่โดยไม่โหลดประวัติเดิม
   - **โหลดงานเดิม**: เปิดฟอร์มพร้อมโหลด idea run ล่าสุดตามพฤติกรรม resume เดิม
3. เมื่อเลือกสร้างตอนใหม่ ระบบต้องเคลียร์ข้อมูลชั่วคราวทั้งหมด ได้แก่ idea, selected idea, references, characters, dialogue, location, footage/B-roll, model selections และสถานะ polling ที่ค้างในฟอร์ม
4. ในโหมดสร้างใหม่ query ประวัติ idea ต้องไม่ทำงาน และ hydration effect ต้องไม่เติมข้อมูลจากประวัติเดิม
5. เมื่อผู้ใช้สร้างตอนใหม่สำเร็จ ตอนที่สร้างและ idea run ใหม่ของมันจะเป็นข้อมูลล่าสุดสำหรับการเลือก “โหลดงานเดิม” ในครั้งถัดไป ระบบต้องไม่ย้อนกลับไป auto-load ชุดก่อนหน้า
6. การปิด dialog แล้วกดสร้างตอนพิเศษอีกครั้งต้องแสดงตัวเลือกเริ่มต้นใหม่ทุกครั้ง

## แนวทางเทคนิค

- เพิ่ม state ของ parent สำหรับ dialog เลือกโหมด และ state `fresh | resume` ที่ส่งเข้า `SpecialTieInEpisodeDialog`
- ให้ `SpecialTieInEpisodeDialog` เปิด `listMarketplaceReviewIdeas` เฉพาะเมื่ออยู่ในโหมด `resume` (หรือมี `initialInput` สำหรับการแก้ไขตอนเดิม)
- จำกัด effect ที่ auto-hydrate latest idea run ให้ทำงานเฉพาะโหมด `resume` และไม่ทำงานเมื่อมี `initialInput`
- เมื่อเข้าโหมด `fresh` ให้เรียก reset local state ก่อนเปิดฟอร์ม เพื่อป้องกัน React Query cache หรือ state จากรอบก่อนรั่วเข้ามา
- ไม่เพิ่ม migration และไม่เพิ่ม endpoint ลบ history ในงานนี้

## Edge cases และความปลอดภัยของข้อมูล

- ถ้าเลือก “โหลดงานเดิม” แต่ไม่มี history ให้แสดงข้อความชัดเจนและเปิดฟอร์มว่าง โดยไม่สร้าง fake input
- ถ้าผู้ใช้เปลี่ยนจาก resume เป็น fresh ต้องล้าง selected product/history-derived references ด้วย
- `initialInput` มี precedence เหนือ mode สำหรับหน้าแก้ไขตอนพิเศษ เพื่อไม่ให้ข้อมูลของตอนที่กำลังแก้ถูกล้าง
- การเก็บ history ไว้เป็นการรักษาความสามารถกู้คืน ไม่ใช่การนำ history มาใช้โดยอัตโนมัติในโหมด fresh

## Verification

- Component tests ยืนยันว่า click “สร้างตอนพิเศษ” เปิดตัวเลือกกลางจอ
- Component tests ยืนยันว่า fresh mode ไม่ hydrate latest history และส่งฟอร์มว่าง
- Component tests ยืนยันว่า resume mode hydrate latest history ได้
- Regression test ยืนยันว่า `initialInput` ของการแก้ไขตอนเดิมยังถูกเติมเหมือนเดิม
- รัน focused tests, `git diff --check` และตรวจ TypeScript/format เฉพาะไฟล์ที่แก้

## ทางเลือกที่ไม่เลือก

- วาง toggle ไว้ในฟอร์มหลัก: ผู้ใช้อาจเห็นข้อมูลเก่าก่อนเลือกโหมด และ query เดิมยังมีโอกาส hydrate ก่อน state เปลี่ยน
- ลบ history จากฐานข้อมูลเมื่อสร้างตอนสำเร็จ: ทำให้กู้คืนงานผิดพลาดไม่ได้ และเพิ่มความเสี่ยงต่อข้อมูลผู้ใช้โดยไม่จำเป็น
