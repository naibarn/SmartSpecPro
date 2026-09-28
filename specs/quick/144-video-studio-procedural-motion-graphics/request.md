# Request: Video Studio Procedural Motion Graphics

## User request

ออกแบบแผนสำหรับเพิ่ม motion graphics ใน Video Studio ให้สัมพันธ์กับเนื้อหาที่
บรรยาย โดยให้ได้งานระดับ particle field, network graph และ glowing sphere แบบ
ตัวอย่างที่สร้างด้วย Remotion พร้อม preview และ render ที่ใช้ composition เดียวกัน

## Context

ปัจจุบัน Video Studio มี timeline editor, Remotion Player preview, motion-template
registry แบบ `layer_pack`, `motionGraphic` primitive และ `scene3d` registry ที่มี
ฉากตัวอย่างหนึ่งฉากแล้ว แต่ยังไม่มี procedural visual system ที่คำนวณ particle,
เส้นเชื่อม, glow และ 3D sphere ตาม frame/semantic beat

## Desired outcome

- ให้ AI/skill สร้าง Visual Beat Plan จากบทพูดก่อนเลือก motion
- ให้ motion สัมพันธ์กับช่วงความหมายและ cue ของเสียง ไม่ใช่สุ่มเอฟเฟกต์
- รองรับ 2D particle/network/kinetic systems และ 3D glowing sphere
- preview ใน Player และ final render ใน Worker ต้องใช้ source composition เดียวกัน
- user เลือก preset ได้ง่าย พร้อมปรับเฉพาะค่าที่จำเป็น
- ไม่เปิดช่องให้ user/LLM ส่ง arbitrary React, JavaScript หรือ scene code เข้า worker

## Constraints and non-goals

- รักษา layer/timeline และ motion candidate flow เดิมให้ backward-compatible
- ไม่สร้าง media generation model ใหม่สำหรับ procedural graphics
- ไม่ขยายให้เป็น full NLE หรือ particle editor ระดับ After Effects
- ไม่สร้างอนุภาคเป็น Remotion layers หลายร้อยชิ้นจนชน layer budget
- ไม่แก้ไฟล์ unrelated ใน dirty worktree

## Working assumptions

- เริ่มจาก registry-driven procedural compositions โดยใช้ declarative JSON props
- ใช้ SVG/HTML สำหรับ 2D vector และ text, ใช้ canvas/SVG ตาม benchmark สำหรับ particle,
  และใช้ `@remotion/three` สำหรับ 3D
- cue timestamp ของเสียงพากย์เป็น source of truth; waveform เป็นเอฟเฟกต์เสริม
- หากต้องเพิ่ม layer variant หรือ runtime dependency จะทำ contract/version/release
  review แยกเป็น gate ก่อน deploy
