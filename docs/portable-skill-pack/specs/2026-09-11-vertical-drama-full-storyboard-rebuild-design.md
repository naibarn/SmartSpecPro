# Vertical Drama Full Storyboard Rebuild

## Goal

ให้ `regenerateStage(stage = storyboard_shotgrid)` ทำงานเป็นการสร้าง storyboard ใหม่จากศูนย์สำหรับ episode เดียวอย่างแท้จริง: ล้าง storyboard เดิมทั้ง 9 ช็อตและข้อมูล downstream/shot-level ที่อ้างอิง storyboard แล้วสร้างใหม่ด้วย flow ปกติ โดยคงเฉพาะ master character/location stock และภาพอ้างอิงระดับซีรีส์ไว้

## Current problem

เส้นทาง asynchronous storyboard regenerate ปัจจุบันสร้าง run ใหม่และล้าง downstream หลัง generation สำเร็จ แต่ยังแสดงและเก็บ storyboard เดิมระหว่างรอ job และไม่ได้ล้าง shot-reference bindings ก่อนเริ่มงาน จึงทำให้ UI ดูเหมือนงานใหม่ไม่ทำงานหรือข้อมูลเก่าปะปนกับผลลัพธ์ใหม่ได้

## Design

### 1. Destructive reset boundary

เพิ่ม service boundary เดียวสำหรับ `resetEpisodeStoryboardGenerationState(owner)` และเรียกก่อน enqueue storyboard rebuild โดยตรวจ ownership ใน transaction เดียวกับการล้างข้อมูล:

- ล้าง `vertical_drama_shot_references` ของ episode
- ล้าง shot-level B-roll, object assignments และ detector suggestions ของ episode
- ล้าง episode run/checkpoint/artifact rows ของ `storyboard_shotgrid` และทุก stage downstream
- ตั้งค่า `storyboard`, `startFramePlan`, `dialogueAudioPlan`, `motionPromptPack`, `assemblyManifest` และ `storyboardReviewId` เป็น `null`
- ไม่ลบ `media_assets`, character rows/looks, location rows หรือ location/character master assets

ข้อมูล media ที่เคยสร้างจะยังอยู่ใน Media History ตาม lifecycle เดิม แต่จะไม่ถูกผูกกับ episode generation รอบใหม่

### 2. Queue and execution flow

`regenerateStage(storyboard_shotgrid)` จะ:

1. ตรวจ owner และ policy gates เดิม
2. reset state แบบ transaction
3. สร้าง queued run ใหม่และ enqueue job
4. worker สร้าง storyboard 9 ช็อตผ่าน `generateRealStoryboard`
5. บันทึก storyboard ใหม่และ reconcile locations/character looks
6. finalize run เป็น `succeeded` หรือ `failed`

หาก reset สำเร็จแล้ว provider/job ล้มเหลว ระบบจะแสดงสถานะ `failed` พร้อม error และไม่แสดง storyboard เก่ากลับมา เพื่อไม่ให้ผู้ใช้เข้าใจว่าผลเก่ายังเป็นผลใหม่

### 3. Continuity contracts

การสร้างใหม่จะใช้กติกาที่แก้แล้ว:

- canonicalize `หน้าคลินิก` และ `ลานจอดรถหน้าคลินิก` เป็น physical location เดียว และเลือก canonical roster row ที่มี approved reference image
- outfit cue ต้องผูกกับตัวละครที่ระบุ ไม่กระจายไปยังตัวละครอื่นใน shot เดียวกัน
- outfit ที่ถูกเลือกแล้วจะถูก lock ใน adjacent shots ที่อยู่ scene/location เดียวกัน จนกว่าจะมี transition, time change หรือ manual override
- master character/location stock ไม่ถูกสร้างซ้ำจากการ rebuild

### 4. Observability and UI contract

ผลลัพธ์จาก mutation และ polling ต้องแยกสถานะให้เห็นอย่างชัดเจน:

- `resetting`: กำลังล้าง storyboard เดิม
- `queued` / `running`: กำลังสร้างชุดใหม่
- `succeeded`: ชุดใหม่ถูกบันทึกแล้ว
- `failed`: ชุดใหม่ไม่สำเร็จ พร้อมข้อความผิดพลาด

หลัง success ให้ invalidate episode/storyboard/run queries เพื่อให้หน้าแสดงข้อมูลใหม่ทันที

## Failure and safety

- reset ต้อง tenant/user/series/episode scoped ทุก statement
- ใช้ transaction เพื่อไม่ให้ episode ถูกล้างบางส่วน
- ไม่ลบ media asset จริง เพราะอาจถูกใช้ใน Media History หรือ episode อื่น
- idempotency เดิมของ stage submit ยังคงทำงาน เพื่อป้องกัน double enqueue
- worker ต้อง mark run failed เมื่อ generation หรือ persistence ล้มเหลว

## Verification

เพิ่ม/ปรับ focused tests สำหรับ:

1. reset ล้าง episode columns, shot references และ downstream run rows แต่ไม่แตะ master assets
2. regenerate storyboard reset ก่อน enqueue และสร้าง queued run ใหม่
3. failed generation ไม่คืน storyboard เก่า
4. successful generation persist storyboard ใหม่และ reconcile locations
5. 9-shot continuity: physical location grouping และ character wardrobe lock
6. UI แสดง reset/queued/running/succeeded/failed ตาม polling state

ไม่ทำ production DB mutation หรือ provider generation ระหว่างการทดสอบใน repository
