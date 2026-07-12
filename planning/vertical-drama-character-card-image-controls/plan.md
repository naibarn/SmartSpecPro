# Character card image controls: delete / expand / download / drag-drop-replace

## Problem statement

ในหน้า Characters tab (`VerticalDramaCharacterStockPanel.tsx`) ผู้ใช้ขอ 4
ความสามารถบนรูปภาพของการ์ดตัวละคร (ทั้งรูปใหญ่หลักและรูปเล็ก "ลุค"/variant
chip ใต้รูปใหญ่):
1. ปุ่มถังขยะเล็กๆ สำหรับลบภาพเดิม (ไม่ให้ระบบเอามาอ้างอิงต่อเมื่อกด "สร้างใหม่")
2. เหมือนกันสำหรับรูปเล็ก (variant chip เช่น "ชุดยูนิฟอร์ม"/"ชุดนอน")
3. กดขยายเต็มจอได้
4. กด download ภาพได้
5. ลากภาพจาก panel อื่นหรือจาก harddisk มาวางทับเปลี่ยนภาพได้

## สำรวจโค้ดจริงก่อนวางแผน (สำคัญ — ส่วนใหญ่มีอยู่แล้ว)

**รูปใหญ่หลัก (`VerticalDramaCharacterStockPanel.tsx:1552-1580`) มีอยู่แล้ว:**
- ขยายเต็มจอ: ปุ่ม `<button onClick={... setLightboxImage(...)}>` ครอบรูปอยู่แล้ว
  (line 1554-1575) — เปิด `<ImageLightbox>` ที่ render อยู่แล้วที่ line
  3077-3079
- Download: มีอยู่แล้วในตัว `ImageLightbox`
  (`client/src/components/chat/media/ImageLightbox.tsx`'s `handleDownload`)
  — ไม่ต้องทำอะไรเพิ่ม แค่เปิด lightbox ได้ก็ได้ download ฟรี
- ลากวางทับเปลี่ยนภาพ (ทั้ง panel และ harddisk): มีอยู่แล้วเต็มรูปแบบ —
  `onDragOver`/`onDragLeave`/`onDrop` (line 1501-1550) ใช้
  `readDroppedImageInput` (จาก `@/components/media/ImageSourcePicker`, รองรับ
  ทั้ง `dataTransfer.files` จาก harddisk และ URL-drag จาก panel ในแอป) →
  `assignDroppedReference(characterId, url)` (line 1168-1216, upload ถ้าเป็น
  data: URL แล้ว `linkMutation` ด้วย `role: "primary_portrait"`)
- **ที่ขาด**: ปุ่มลบ (ไม่มีเลย)

**Variant chip รูปเล็ก (`VerticalDramaCharacterStockPanel.tsx:1670-1725`)
ขาดครบทั้ง 4 อย่าง**: ตอนนี้เป็นแค่ `<img>` ธรรมดาในปุ่ม
`onClick={selectVariant}` — ไม่มี expand, ไม่มี drag-drop, ไม่มี trash เลย

**Pattern ลบที่มีอยู่แล้ว (ใช้ซ้ำ ไม่สร้างใหม่)**: side panel "อ้างอิงของตัวละคร"
(line ~2820-2860) มี 2-step confirm (`confirmingDeleteAssetLinkId` state →
กดถังขยะ → ปุ่ม "ยกเลิก"/"ลบ" (destructive) ยืนยัน) เรียก
`deleteAssetMutation.mutate({seriesId, assetLinkId})` — ต้อง reuse
`deleteAssetMutation` ตัวเดิม (ประกาศไว้แล้ว line 851) และ pattern ยืนยัน
2-step เดิม ไม่ใช่คิด flow ใหม่

## Design

### 1. Helper ใหม่: resolve asset (ไม่ใช่แค่ URL) สำหรับทั้งรูปใหญ่และรูปเล็ก

`getCharacterCardThumbnail(characterId)` (line 1231) คืนแค่ `string | null`
(URL) — ไม่พอสำหรับปุ่มลบที่ต้องการ `assetLinkId` ต้องเพิ่ม sibling helper
(เช่น `getCharacterCardPortraitAsset(characterId): {thumbnailUrl: string;
assetLinkId: string} | null`) ใช้ logic การเลือก asset เดียวกันทุกประการ
(approved ก่อน, fallback newest generated/imported) แค่คืน object ที่มี
`assetLinkId` ด้วย — ให้ `getCharacterCardThumbnail` เรียก helper ใหม่นี้แล้ว
`?.thumbnailUrl` แทนที่จะ implement การเลือกซ้ำสองที่ (DRY)

ใช้ helper ตัวเดียวกันนี้กับทั้งรูปใหญ่ (`characterId = c.characterId`) และ
รูปเล็ก variant chip (`characterId = v.characterId` — variant row เป็น
character row ของตัวเองอยู่แล้ว มี characterId ของตัวเอง ใช้ query `assets`
array เดิมกรองด้วย characterId ของ variant ได้ตรงๆ ไม่ต้องแก้ schema/backend)

### 2. รูปใหญ่หลัก — เพิ่มปุ่มถังขยะ

เพิ่มปุ่มถังขยะเล็ก (ใช้ `Trash2` icon, import ไว้แล้ว line 28) overlay มุม
บนขวาของรูปใหญ่ (แสดงตอน hover การ์ด, `group-hover:opacity-100` ตาม
convention เดิมของโค้ดเบส) — คลิกแล้วเข้า 2-step confirm เดียวกับ side panel
(reuse `confirmingDeleteAssetLinkId` state ตัวเดิมที่มีอยู่แล้ว ไม่สร้าง state
ใหม่ซ้ำซ้อน — ต้องตรวจสอบว่า state เดิมรองรับการใช้ร่วมกับปุ่มใหม่นี้ได้โดยไม่
ชนกับปุ่มเดิมใน side panel) เรียก `deleteAssetMutation.mutate({seriesId,
assetLinkId})` ด้วย assetLinkId จาก helper ใหม่ในข้อ 1

ปุ่มนี้ต้อง `stopPropagation()` ไม่ให้ trigger การเลือกตัวละคร/เปิด lightbox
พร้อมกัน (เหมือนปุ่มอื่นๆ ในการ์ดที่ stopPropagation ไว้แล้ว)

ซ่อนปุ่มนี้เมื่อไม่มี asset ให้ลบ (thumbnailUrl เป็น null) และเมื่อ `readOnly`
(ตาม convention เดิมของการ์ด — ปุ่ม generate/sheet ก็ซ่อนตอน readOnly)

### 3. Variant chip รูปเล็ก — เพิ่มครบทั้ง 4 อย่าง

โครงสร้างปัจจุบัน (line 1679-1723) เป็นปุ่มเดียวครอบทั้งรูป+ label ทำหน้าที่
"เลือกลุคนี้" — ต้องแยกส่วนรูปออกมาเป็นพื้นที่ของตัวเอง (คล้ายที่รูปใหญ่แยกปุ่ม
"ดูภาพขยาย" ออกจากปุ่ม "เลือกตัวละคร" ที่ line 1552-1650):
- คลิกที่รูป → เปิด `setLightboxImage({src, alt: variantLabel})` (reuse
  lightbox เดิม ไม่สร้างใหม่)
- คลิกที่ label/พื้นที่อื่นของ chip → ยังคง `setSelectedCharacterId(v.characterId)`
  เหมือนเดิม
- Drag-drop: เพิ่ม `onDragOver`/`onDragLeave`/`onDrop` บน chip ทั้งก้อน (หรือ
  เฉพาะพื้นที่รูป) reuse `readDroppedImageInput` +
  `assignDroppedReference(v.characterId, url)` — **function เดิมใช้ได้ตรงๆ
  ไม่ต้องแก้** เพราะรับ characterId เป็นพารามิเตอร์อยู่แล้ว
- Trash: ปุ่มถังขยะเล็กมาก (chip สูงแค่ `h-9 w-6` = 36×24px) — ต้องเป็น
  hover-only overlay จริงๆ ไม่ใช่ปุ่มถาวรที่จะแน่นเกินไป ใช้ icon size เล็กสุด
  ที่ยังกดได้จริง (แนะนำ `h-2.5 w-2.5` หรือใกล้เคียง ปรับตามที่ render จริง
  แล้วดูด้วยตา) — reuse `deleteAssetMutation` + confirm pattern เดียวกับข้อ 2
  แต่ต้องคิดเรื่อง layout ให้ confirm popover ไม่ล้นออกนอกจอบนรูปที่เล็กขนาด
  นี้ (อาจใช้ popover ลอยแทนปุ่ม inline 2 ปุ่มถ้า inline ไม่พอที่)

### 4. Test coverage

ไม่มี full-component render test ของไฟล์นี้อยู่ก่อน (มีแต่ pure-function unit
test เช่น `VerticalDramaCharacterStockPanel.buildCharacterRosterEntries.test.ts`)
— เพิ่ม unit test สำหรับ helper ใหม่ในข้อ 1 (`getCharacterCardPortraitAsset`
หรือชื่อที่เลือกใช้จริง) ถ้าฟังก์ชันนี้ extract ออกมาเป็น pure function ที่
test ได้แบบเดียวกับ `buildCharacterRosterEntries`/`dedupeCharacterAssetsForDisplay`
— ถ้า logic เกี่ยวพันกับ React state มากเกินจะแยกเป็น pure function ให้พิจารณา
เขียน minimal render test แทน (เลือกแนวทางที่ทำได้จริงและสอดคล้อง convention
เดิมของไฟล์)

## Constraints

- ไฟล์เดียว: `client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  (ถ้าจำเป็นต้อง export helper ไปใช้ที่อื่น ค่อยพิจารณา แต่ไม่คาดว่าจะต้อง)
- ห้ามสร้าง lightbox/drag-drop/upload mechanism ใหม่ — reuse ของเดิมทั้งหมด
  ตามที่ระบุไว้ในหัวข้อ "สำรวจโค้ดจริง" ด้านบน
- ห้ามเปลี่ยน backend/schema — `deleteAsset`/`linkAsset`/`resolveMediaAssetForImport`
  mutation ทั้งหมดมีอยู่แล้วครบ
- ลบแค่ asset ที่แสดงอยู่ปัจจุบัน (ตัวที่ `getCharacterCardThumbnail`/helper
  ใหม่เลือกมาแสดง) — ไม่ใช่ bulk-delete ทั้งหมด (ผู้ใช้ไม่ได้ขอ ถ้าเหลือ asset
  เก่าอื่นอยู่ ระบบจะ fallback ไปอันถัดไปตาม behavior เดิมของ
  `getPrimaryPortraitUrl` ฝั่ง backend — เป็น behavior ที่มีอยู่แล้ว ไม่ใช่บั๊ก
  ใหม่จากงานนี้)
- ต้อง `pnpm check` ผ่าน + รัน test ที่เกี่ยวข้องทั้งหมดผ่าน ก่อนถือว่าเสร็จ

## Verification

- ตรวจ diff เอง (การ conductor จะตรวจสอบเองไม่เชื่อรายงาน agent อย่างเดียว)
- `pnpm check`
- รัน test ของไฟล์นี้ทั้งหมด + test ที่เกี่ยวข้อง (ค้นหา import ของไฟล์นี้ก่อนรัน)
- Manual reasoning: ตรวจว่าปุ่มใหม่ไม่ไปชนกับ `stopPropagation`/state ของปุ่ม
  เดิม (โดยเฉพาะ `confirmingDeleteAssetLinkId` ถ้าใช้ state เดิมร่วมกับ 3 จุด
  พร้อมกัน — main card, variant chip, side panel — ต้องแน่ใจว่าค่า state
  แยกแยะได้ถูกต้องว่ากำลัง confirm ลบตัวไหนอยู่)
