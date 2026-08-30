# TDD guidance

## Tests first

1. เพิ่ม assertions ใน `MediaHistory.compile.test.tsx` สำหรับค่าคงที่/options ของ task query: 30s stale, 15m gc, mount revalidation และ window-focus policy
2. เพิ่ม regression test ฝั่ง media router ให้ source promises ถูกเริ่มพร้อมกัน (ใช้ deferred promises/barriers) และผล merge ยังเรียงตาม createdAt
3. ปรับ `protectedMediaCache.test.ts` ให้ยืนยัน policy เป็น private, multi-day และไม่เป็น public พร้อมคง weak/strong ETag matching

## Expected initial failure

- ก่อน patch query options ยังไม่มีค่าที่ export/ตรวจสอบได้
- ก่อน patch source calls จะรอ source ก่อนหน้าจึงไม่ผ่าน timing/barrier test
- ก่อน patch cache contract ยังคง `max-age=60`

## Regression checks

- Existing series filter/durability tests ต้องผ่านโดยไม่เปลี่ยน pagination, dedup หรือ tenant rejection
- Media History compile test ต้อง import ได้และไม่เปลี่ยน helper behavior
- ตรวจว่าการ lazy load ไม่ถูกใช้กับ fullscreen/detail ที่ต้องแสดงทันทีหลัง user interaction
