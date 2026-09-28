# Vertical Drama Character Reference Policy

สถานะ: ออกแบบเพื่อทบทวนก่อน implementation

## เป้าหมาย

ทำให้การสร้างภาพหลักของตัวละครสามารถสร้างใหม่ซ้ำได้โดยไม่ต้องลบภาพเก่า และไม่ใช้ภาพหลักเก่าเป็น reference โดยอัตโนมัติ ขณะเดียวกันต้องรักษาพฤติกรรมของการสร้างลุคใหม่ที่ใช้ภาพหลักเป็น reference และต้องไม่ทำให้กรณี user แนบหรือเลือกภาพ reference เองสูญเสียความตั้งใจนั้น

## พฤติกรรมที่ต้องเป็นจริง

| กรณี | reference ที่ส่งให้ image provider | สถานะภาพเก่า |
|---|---|---|
| สร้างภาพหลักใหม่ โดย user ไม่ได้เลือก/แนบภาพ | ไม่มี reference | อยู่ใน history แต่ไม่เป็น current primary |
| สร้างภาพหลักใหม่ โดย user เลือก/แนบภาพเอง | ใช้ asset ที่ user ระบุเท่านั้น | อยู่ใน history ตามเดิม |
| สร้างลุคใหม่ โดยไม่ได้เลือก reference เฉพาะ | ใช้ภาพหลักตาม auto policy | ภาพหลักยังเป็น reference ได้ |
| สร้างลุคใหม่ โดยเลือก reference เฉพาะ | ใช้ asset ที่ user ระบุเท่านั้น | ไม่เปลี่ยนสถานะภาพหลัก |
| ตัวละคร variant/twin ที่ต้องสืบทอด likeness | คง inherited/auto policy เดิม | ไม่ลบหรือเปลี่ยน asset ต้นทาง |

## สัญญา reference policy กลาง

เพิ่ม policy ที่ backend เป็น source of truth โดยแยกความหมายของ input ให้ชัดเจน:

- `none`: ห้าม auto-resolve primary หรือ inherited portrait และห้ามส่ง `referenceImageUrls`
- `auto`: ใช้ resolver ปัจจุบันตามลำดับของ flow เช่น look ใช้ primary และ variant ใช้ต้นแบบ
- `explicit`: ใช้ `referenceAssetLinkId` ที่ผ่าน tenant/user/series ownership check เท่านั้น

ลำดับสิทธิ์ของคำขอ:

1. `referenceAssetLinkId` ที่ user ระบุเองต้องชนะ auto policy เสมอ
2. ถ้าไม่มี asset ที่ระบุ ให้ใช้ policy ที่ caller ระบุ
3. สำหรับ main portrait ค่าเริ่มต้นต้องเป็น `none`
4. สำหรับ look generation ค่าเริ่มต้นต้องเป็น `auto`

เพื่อป้องกัน caller เก่าที่ไม่ส่ง policy ระบบจะกำหนด default แบบปลอดภัยตามบริบท: main character ใช้ `none`; look/variant ใช้ `auto` เฉพาะ flow ที่ประกาศว่าเป็น look/variant แล้ว ห้ามให้การไม่มี field กลับไปดึง primary ของ main portrait แบบเงียบ ๆ

## การยืนยันว่า user แนบภาพเองไม่เสียหาย

- UI ต้องส่ง `referenceAssetLinkId` เมื่อ user เลือกภาพจาก picker หรือแนบภาพใหม่สำเร็จ
- ค่า default ที่แสดงภาพหลักปัจจุบันใน UI ต้องไม่ถูกนับเป็น explicit selection เพียงเพราะถูกแสดงไว้
- Backend ต้อง resolve asset ที่ระบุแบบ exact และ reject หาก asset ไม่อยู่ใน tenant/user/series scope หรือไม่มี URL ที่ใช้ได้
- เมื่อมี explicit asset แล้ว ห้าม `none` หรือ `auto` มา override asset นั้น
- เพิ่ม tests ทั้งกรณีเลือกภาพเดิม, ภาพจาก history และภาพแนบใหม่ เพื่อพิสูจน์ว่า provider ได้ reference ที่ user ตั้งใจจริง

## Lifecycle ของภาพหลัก

เมื่อ generation ใหม่สำเร็จและถูกตั้งเป็นภาพหลัก:

- ห้ามลบ asset เดิม
- demote ภาพหลักเดิมให้เป็น history/non-current ตาม stock service contract
- ให้มี current primary ที่ระบบ auto resolver เลือกได้เพียงรายการเดียว
- `none` ต้องไม่อ่าน current primary กลับมาเป็น reference แม้ยังมี asset อยู่ในฐานข้อมูล
- หาก generation ล้มเหลว ห้ามเปลี่ยนหรือ demote ภาพหลักปัจจุบัน

ไม่ต้องมี migration หรือลบข้อมูลย้อนหลัง เว้นแต่การตรวจสอบ implementation พบว่า generated replacement ไม่ได้ demote sibling ตาม contract; กรณีนั้นให้แก้เป็น idempotent state transition ที่รักษาประวัติ

## ขอบเขตไฟล์และจุดแก้หลัก

- `apps/web/server/routers/verticalDramaCharacters.ts`: input contract, policy resolution, ownership validation และ provider payload
- `apps/web/server/services/verticalDramaCharacterStock.ts`: ยืนยันการ demote/เลือก current primary โดยไม่ลบ history
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`: main portrait ส่ง `none` โดย default และส่ง explicit asset เฉพาะเมื่อ user เลือก/แนบเอง; look generation ส่ง `auto`
- tests ของ router, generation service และ UI request builder ตามจุดที่มีอยู่แล้ว

## Acceptance criteria

1. มี primary เดิมแล้วกดสร้างภาพหลักใหม่ได้ทันทีโดยไม่ต้องลบภาพเดิม
2. task ของ main portrait ที่ไม่ได้เลือก reference มี `referenceImageUrls` ว่าง/ไม่มี field และ provider ไม่ได้รับภาพเดิม
3. หลังสร้างสำเร็จ ภาพเดิมยังเปิดดูได้จาก history แต่ไม่ถูกเลือกเป็น current primary
4. user แนบหรือเลือกภาพเองแล้ว task มีเฉพาะ reference asset ที่เลือก/แนบ และไม่ถูก policy `none` ตัดทิ้ง
5. สร้าง look ใหม่โดยไม่เลือก reference แล้วยังคงใช้ current primary เป็น reference
6. explicit reference ที่ไม่อยู่ใน scope ถูกปฏิเสธและไม่สร้าง task/ไม่เปลี่ยน primary
7. generation failure ไม่เปลี่ยนสถานะ primary เดิม
8. tests ป้องกัน regression ของทั้ง main portrait, look, variant/twin และ history lifecycle

## ความเสี่ยงและการตรวจสอบหลังแก้

- ตรวจทุก caller ของ `generateCharacterImage` ไม่ให้ main portrait เก่าหลุดผ่าน path อื่น
- ตรวจ payload ที่บันทึกใน media task/history ไม่ใช่ดูเฉพาะ state ใน UI
- รัน focused unit tests และ typecheck ที่เกี่ยวข้อง; browser/provider verification ต้องทำแยกใน environment ที่เชื่อมต่อจริง
