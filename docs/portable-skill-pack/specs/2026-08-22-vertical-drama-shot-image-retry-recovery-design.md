# Vertical Drama Shot Image Retry Recovery

## Goal

ให้การ retry ภาพของ Vertical Drama ไม่หยุด workflow เมื่อ prompt ที่บันทึกไว้เก่าไม่มี `CURRENT SHOT COMPOSITION LOCK` แต่ composition ปัจจุบันมีอยู่แล้ว พร้อมแจ้งผู้ใช้ให้เข้าใจว่าระบบกำลังซิงก์ prompt ใหม่หรือกำลัง retry provider

## Design

- ส่ง error ของ image task ปัจจุบันจาก `VerticalDramaStoryboardPanel` กลับไปยังหน้า episode ตอนกด “สร้างภาพใหม่”
- เพิ่ม policy แบบ deterministic ใน `VerticalDramaEpisodePage`:
  - ถ้า error มี marker `missing_current_shot_composition_lock` ให้ re-author prompt ของช็อตจากข้อมูลล่าสุดก่อน แล้วจึง submit ภาพ
  - ถ้าเป็น provider/sync error อื่น ให้ reuse prompt เดิมเพื่อหลีกเลี่ยง LLM cost และการเปลี่ยน prompt โดยไม่จำเป็น
- ถ้า guard composition เกิดระหว่างการ submit ครั้งแรก ให้ auto-recover หนึ่งรอบต่อช็อตทันที ไม่บันทึกเป็น failed task และไม่ปล่อยให้ workflow หยุดด้วย error เดิม
- ฝั่ง server ต้องซ่อม prompt เก่าที่ขาด lock จาก composition ปัจจุบันก่อนตรวจ guard และก่อนส่ง provider เพื่อไม่ปล่อย `412` ในกรณีที่ซ่อมได้อย่างปลอดภัย
- แสดง toast ชัดเจนก่อนเริ่มแต่ละ recovery path และใช้ error message เดิมเฉพาะเมื่อ retry ยังล้มเหลว
- คง server guard ไว้ เพื่อไม่ให้ prompt ที่ขาด composition ถูกส่งไปสร้างภาพแบบเสียเครดิต

## Failure handling

การเติม lock ฝั่ง server เป็นการ repair จากข้อมูล composition ที่ authoritative อยู่แล้ว ไม่ใช่การ bypass guard; หากไม่มี composition จริง guard ยังคงป้องกันการ submit paid image เช่นเดิม การ re-author ฝั่ง client เป็น fallback สำหรับข้อมูลเก่าหรือกรณี repair รอบแรกไม่สำเร็จ ส่วน provider error จะยัง retry ด้วย prompt เดิมตามสัญญาเดิม

## Validation

- เพิ่ม unit tests ให้ policy แยก composition guard กับ provider error
- เพิ่ม source/contract assertion ว่า retry ส่ง error เข้า policy และ panel ส่ง error ปัจจุบันกลับไป
- รัน focused Vitest สำหรับ page flow และ storyboard panel
- รัน `pnpm check` หรือ typecheck ที่แคบที่สุดตามสคริปต์ repo พร้อมแยก baseline diagnostics ที่ไม่เกี่ยวข้อง

## Trade-off

การเลือก re-author เฉพาะ marker ทำให้แก้ปัญหา stale composition ได้โดยไม่เปลี่ยน prompt ของ provider failure ทั่วไป และไม่เพิ่มการเรียก LLM ใน retry ปกติ ข้อจำกัดคือ error จากระบบเก่าที่ไม่มี marker จะยังใช้ prompt เดิม ซึ่งรักษาความปลอดภัยด้านค่าใช้จ่ายและพฤติกรรมเดิมไว้
