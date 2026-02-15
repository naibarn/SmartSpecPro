# Interview Notes

- date: 2026-02-15
- language: Thai
- planning_intent: `resume_progress`
- decision_mode: `smart_auto`

## Q1. Render engine choice for text clips

**Question:** ต้องการใช้ `drawtext`, subtitle/libass, หรือรองรับทั้งสองแบบ?

**Answer:** รองรับทั้งสอง แต่มี canonical path เดียวคือ Subtitle/ASS (libass) เป็นแกน และมี `drawtext` เป็น fast-path เฉพาะเคสง่าย ๆ (optional optimization)

## Q2. Font policy

**Question:** ฟอนต์ v1 ต้องการแบบไหน และต้องการ parity กับ preview ระดับใด?

**Answer:** ใช้ whitelist ฟอนต์ตายตัว และ bundle ฟอนต์ไปกับ renderer; preview ใน browser ต้องโหลดฟอนต์ชุดเดียวกันผ่าน `@font-face`

## Q3. Keyframe easing model

**Question:** easing เป็นระดับ segment เดียว หรือ override ต่อ property ได้?

**Answer:** มี easing default ต่อ segment และ override ต่อ property ได้ (UI อาจเริ่มจาก easing เดียวทั้งช่วงก่อน แล้วค่อยเปิด advanced)

## Q4. Overlap rule on T1

**Question:** text clip ซ้อนกันบน `T1` จัดการอย่างไร?

**Answer:** อนุญาตการซ้อน และกำหนด z-order ชัดเจนตาม `track order > clip order`

## Q5. Fast-path gate criteria

**Question:** เกณฑ์เข้า `drawtext` fast-path ควรเป็นแบบใด?

**Answer:** ใช้ `drawtext` เฉพาะเมื่อแปลงได้ครบ 100% เท่านั้น; ถ้าไม่ครบให้ fallback ไป ASS

## Q6. Unsupported style behavior

**Question:** หาก style ใน editor render ไม่ครบควรจัดการแบบใด?

**Answer:** ใช้ strict parity: UI อนุญาตเฉพาะสิ่งที่ render ได้จริง

## Q7. Canonical clip order source

**Question:** `clip order` สำหรับ z-order ให้ยึดอะไรเป็น canonical?

**Answer:** ยึดลำดับใน array ของ clips ใน track เป็น canonical z-order

## Q8. Keyframe schema scope in v1

**Question:** v1 จะรองรับ override ต่อ property ใน data model เลยหรือไม่?

**Answer:** รองรับใน data model ตั้งแต่ v1 แม้ UI ยังไม่ expose ทั้งหมด

## Interview Outcome

1. Canonical render path: ASS/libass
2. `drawtext` fast-path: opt-in optimization only when representation is 100% lossless
3. Strict parity policy controls UI and render capabilities
4. Z-order semantics are deterministic by clip array order
5. Data model must include segment easing + optional per-property easing overrides from day one
