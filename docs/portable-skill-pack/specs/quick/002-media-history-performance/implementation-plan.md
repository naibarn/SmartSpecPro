# Implementation plan

## Objective

ทำให้ Media History เปิดเร็วขึ้นและไม่แสดงภาพเก่าค้างแทนรายการใหม่ โดยแยก cache ของ “metadata/list” ออกจาก cache ของ “ไฟล์สื่อ” อย่างชัดเจน

## Affected areas

- `apps/web/client/src/pages/MediaHistory.tsx`
- `apps/web/server/routers/media.ts`
- `apps/web/server/services/protectedMediaCache.ts`
- tests ของ Media History, media listTasks และ protected media cache

## Approach

1. เพิ่ม query options เฉพาะ Media History: cache รายการ 30 วินาที, เก็บใน memory 15 นาที, ใช้ข้อมูลเดิมเป็น placeholder, revalidate เมื่อ mount เสมอ และไม่ refetch ทุก window focus
2. ให้ Library status query ใช้แนวทางเดียวกันในระดับที่ไม่ทำให้ผลสถานะเดิมหายระหว่าง fetch
3. คำนวณ tenant id ครั้งเดียว และอ่าน provider/deferred/hyperframes พร้อมกัน จากนั้นอ่าน MCP/Hermes พร้อมกันหลังจากข้อมูลที่ใช้ dedup พร้อมแล้ว
4. เปลี่ยน protected media cache policy เป็น `private` อายุ 7 วันและ stale-while-revalidate 30 วัน โดยรักษา ETag, `Vary`, authorization และ range response
5. ใส่ `loading="lazy"`/`decoding="async"` ให้ preview ภาพที่อยู่ในรายการ และให้ video fallback ใช้ IntersectionObserver โหลด metadata เมื่ออยู่ใกล้ viewport; dialog/fullscreen ยังโหลดตาม interaction

## Risks and mitigations

- รายการใหม่อาจถูกซ่อนด้วย cache: ใช้ `refetchOnMount: "always"` และคง polling สำหรับงาน pending
- cache อาจรั่วข้าม tenant: ใช้ `private` และไม่แตะ authorization หรือ public gallery route
- parallel source call อาจเปลี่ยนลำดับผล: merge/sort/dedup หลัง `Promise.all` และคงสูตร total เดิม
- lazy video อาจลด preview นอกจอ: ใช้ root margin เพื่อเริ่มโหลดก่อนเข้า viewport และยังเปิด fullscreen ได้เสมอ

## Acceptance criteria

- เข้า Media History แล้วเห็น cached page เดิมทันทีเมื่อมี cache พร้อม request revalidate รายการใหม่
- รายการ/ภาพที่สร้างใหม่ปรากฏหลัง revalidate โดยไม่ต้องรอ cache หมดอายุ
- source reads ที่ไม่พึ่งพากันเริ่มทำงานพร้อมกัน และผลลัพธ์/การกรองเดิมไม่เปลี่ยน
- managed media response ยังคง private/authenticated แต่ browser reuse ไฟล์เดิมได้หลายวันและรองรับ ETag 304
- initial page load ไม่เริ่มโหลด preview ภาพ/วิดีโอครบทั้ง page พร้อมกัน

## Verification

- รัน focused Vitest ของ MediaHistory, media.listTasks และ protectedMediaCache
- รัน `npm --workspace apps/web run typecheck` และแยก baseline failure หากมี
- ตรวจ `git diff --check` และ status เฉพาะไฟล์ที่เป็นเจ้าของงาน
