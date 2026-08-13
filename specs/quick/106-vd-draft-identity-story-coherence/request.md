# Request

## Task

ปรับระบบสร้าง Vertical Drama Draft ให้แยก Target Market, Story Setting,
Lead Background และ Spoken Dialogue ออกจากกัน แก้ role/roleTier warning และทำให้
Draft มี story-design contract ที่รักษา romance engine, pressure, early payoff
และการสลับความได้เปรียบเสียเปรียบ โดยไม่กระทบซีรีย์เก่า

## Constraints

- ใช้ additive optional fields ใน shared/server/UI/skill; ไม่ migration และไม่ rewrite ข้อมูลเก่า
- ภาษาหน้าจอควบคุม prose; ภาษาพูดควบคุมบทพูด/subtitle/TTS เท่านั้น
- ห้ามสุ่มหรืออนุมานสัญชาติจากตลาดภาษาอย่างเดียว
- Explicit premise, user-entered names, heritage, setting และ casting มี priority สูงกว่า AI inference
- ปุ่ม Apply ต้องไม่ผ่าน structural contract error ที่ยังซ่อมไม่ได้
- Reuse existing Story Control contracts และ existing wizard card/state patterns

## Non-goals

- ไม่แก้ชื่อหรือลุคของซีรีย์เก่าอัตโนมัติ
- ไม่เปลี่ยน `targetAudienceRegion` ให้กลายเป็น nationality contract
- ไม่สร้างระบบตรวจชื่อด้วย blacklist เชื้อชาติ
- ไม่เพิ่มช่องบังคับให้ผู้ใช้กรอกข้อมูลทุก tab
