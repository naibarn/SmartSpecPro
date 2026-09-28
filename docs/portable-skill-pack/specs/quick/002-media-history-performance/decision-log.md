# Decision log

## Planning depth

เลือก `standard` quick-plan: งานอยู่ใน client page, media router และ storage cache helper แต่ contract เดิมชัดเจนและไม่ต้องเปลี่ยน schema/API shape จึงยังไม่ต้อง promote เป็น full deep-plan

## Decisions

1. ใช้ `staleTime` สั้นสำหรับรายการ (30 วินาที), `gcTime` 15 นาที, `placeholderData` และ `refetchOnMount: "always"` เพื่อให้ cache แสดงได้เร็วพร้อมดึงรายการใหม่ทุกครั้งที่เข้า page
2. ปิด refetch เมื่อ window focus สำหรับหน้านี้ เพื่อลด request ซ้ำ และคง polling 15 วินาทีสำหรับงานที่ยัง pending
3. รัน source reads ที่ independent ด้วย `Promise.all` แต่คง dedup, sort, pagination และ artifact projection ตามเดิม
4. เพิ่ม cache ไฟล์ managed media เป็น private 7 วัน พร้อม `stale-while-revalidate` 30 วัน; ไม่ใช้ `public` และไม่เปลี่ยน authorization
5. ใช้ native lazy loading สำหรับภาพและไม่ preload video fallback จนกว่าจะอยู่ใกล้ viewport เพื่อไม่ดึง media ทั้ง 50 รายการพร้อมกัน

## Self-review rounds

- รอบ 1: ครบทั้งรายการใหม่, body cache, server latency และ preview network แล้ว
- รอบ 2: ตรวจแล้วว่า `refetchOnMount: "always"` ป้องกันการซ่อนรายการใหม่จาก stale list cache
- รอบ 3: ตรวจ tenant boundary แล้ว cache เป็น private และคง `Vary`/ETag
- รอบ 4: ตรวจลำดับ dedup/projection แล้ว parallelize เฉพาะ I/O ที่ไม่พึ่งพากัน
- รอบ 5: ตรวจ test plan แล้วครอบคลุม query options, source concurrency และ cache header contract
- รอบ 6: ไม่พบ `[AUTO-FIX]` เพิ่มเติม; ขอบเขตพร้อม implement
