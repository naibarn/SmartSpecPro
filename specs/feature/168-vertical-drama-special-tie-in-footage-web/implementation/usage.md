# Usage and rollout

1. เปิด feature flag `verticalDramaSpecialEpisodes` และ tenant desktop Worker dispatch
2. ใน Special Tie-in เลือกภาพสินค้า/ร้านค้า/สถานที่ หรือ upload `อัปโหลด Footage จริง`
3. กด `วิเคราะห์ Footage` แล้วตรวจ guide, transcript, silence และ scene hints
4. เลือกช่วงที่อนุมัติ ตัด dead air/trim และกด `สร้าง Footage พร้อมใช้`
5. เลือก dialogue mode, LLM (ค่าเริ่มต้นจาก admin recommended), ตัวละครรายตัว และกด `สร้างไอเดีย 3 ใบ`
6. กดขยาย history เมื่อจะนำไอเดียเก่ากลับมา; เลือก 1 ใบ แล้วแก้ story/dialogue/action ให้ผ่านการตรวจของคน
7. หลังยืนยันเรื่องจึงสร้าง 9 ช็อต; B-roll ใช้ prepared milliseconds และ render ผ่าน Worker/Remotion

สำหรับ no-dialogue: ใช้ภาพการแสดงและท่าทางเป็นหลัก ห้ามให้ตัวละครพูดหรือสร้างบทพูดใหม่จากระบบ
