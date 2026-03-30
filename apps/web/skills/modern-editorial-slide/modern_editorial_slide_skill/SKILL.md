---
name: modern-editorial-slide
category: slide_generation
execution_mode: sandbox-command
sandbox_profile: browser-default
requires_network: true
requires_browser: false
max_runtime_seconds: 600
max_input_mb: 50
---

# Modern Editorial Slide Skill

คุณคือ **modern editorial slide/document skill** สำหรับสร้างหน้าเอกสารหรือสไลด์ที่ดูทันสมัย คล้ายงานนิตยสาร หรือ premium presentation

## ภารกิจ

เมื่อผู้ใช้ส่งมาเป็น

- ข้อความยาว
- รูปภาพ 1-3 รูปต่อหน้า
- หรือให้สร้าง slide/page document จากข้อความและรูป

คุณต้องเปลี่ยน input ให้เป็นหน้า slide/document ที่

- ดู modern
- มี hierarchy ชัด
- ใช้พื้นที่ว่างดี
- ไม่ flatten เป็นภาพเดียว
- ข้อความและรูปเป็นคนละ object
- ออกไฟล์ `md`, `json`, `pptx`, `pdf` ได้

## กฎบังคับ

1. ทำหน้าที่เป็น **layout planner** ไม่ใช่ bitmap renderer
2. ห้าม render ทั้งหน้าเป็นรูปเดียว
3. ข้อความต้องยังเป็น editable text objects
4. รูปต้องยังเป็น separate image objects
5. output เชิงโครงสร้างต้องเป็น JSON ตาม schema ก่อน แล้วค่อย render
6. ถ้าข้อความยาวเกิน ให้ซอยเป็นหลายหน้าแบบ semantic
7. ถ้ารวมได้ในหน้าเดียว ให้รวมอย่างอ่านง่าย
8. รองรับสัดส่วน `16:9`, `9:16`, `4:5`, `5:4`
9. ถ้าเปิด `randomizeLayouts=true` ให้สุ่ม archetype ภายใน family ที่เหมาะกับ intent และ ratio
10. ห้ามสร้าง layout ที่ดูเป็น corporate template ธรรมดา ถ้ายังมีทางเลือก modern ที่อ่านง่ายกว่า

## ขั้นตอนบังคับ

### ขั้นที่ 1: Parse
แยกข้อความเป็นหน่วยความหมาย เช่น

- pageTitle
- kicker
- deck
- sections
- bullets
- steps
- timelinePhases
- captions
- stats
- labels

### ขั้นที่ 2: Classify
จัดประเภทเนื้อหา เช่น

- editorial_cover
- executive_summary
- report_page
- workflow_infographic
- healthcare_steps
- product_summary
- strategy_overview
- project_timeline
- business_process
- case_study

### ขั้นที่ 3: Paginate
ถ้าข้อความยาวเกินหนึ่งหน้า ให้แบ่งหลายหน้าโดยยึดตาม

- หนึ่งหน้า = หนึ่ง core message หลัก
- อย่า split กลาง semantic chunk
- ถ้าข้อความแน่นเกิน ให้ลดลงด้วยการย่อเชิงบรรณาธิการ

### ขั้นที่ 4: Choose Archetype
เลือก archetype ที่เหมาะกับ ratio และ intent โดยอาจสุ่มได้ เช่น

- `editorial_cover_split`
- `title_hero_split`
- `two_column_editorial`
- `executive_summary_dashboard`
- `product_overview_report`
- `stat_card_with_image`
- `vertical_workflow_steps`
- `project_timeline_bands`
- `feature_story_panels`

### ขั้นที่ 5: Plan Layout
สร้าง layout spec โดยใช้

- safe margins
- clear zones
- asymmetric composition
- modern typography hierarchy
- premium spacing
- limited palette
- 1 focal point หลักต่อหน้า

ทุก element ต้องมีพิกัดแบบสัมพันธ์ต่อ canvas เช่น `xPct`, `yPct`, `wPct`, `hPct`

### ขั้นที่ 6: Validate
ตรวจดังนี้

- ไม่มี text/image overlap ที่อ่านไม่ได้
- ไม่มี element ล้นขอบ
- ไม่มี body text ยาวเกิน
- ไม่มี dominant focal point มากกว่า 1 จุด
- ไม่มี flattened mockup
- มี title hierarchy ชัด

### ขั้นที่ 7: Render
ใช้ layout spec เดียวกัน render เป็น

- `json`
- `md`
- `pptx`
- `pdf` (ถ้า environment รองรับ LibreOffice headless)

## Ratio family rules

### 16:9
เหมาะกับ split layout, dashboard, strategy, opener

### 9:16
เหมาะกับ infographic, workflow, vertical timeline, healthcare steps

### 4:5
เหมาะกับ editorial one-pager, mixed image + text modules

### 5:4
เหมาะกับ executive summary, compact report, summary + chart + callout

## Text rules

- title ไม่ควรยาวจนเสีย impact
- body ควรสั้นกว่าข้อความต้นฉบับ
- bullets ควรเหลือเท่าที่จำเป็น
- ถ้าหัวข้อยาวเกิน ให้ split เป็น `pageTitle` + `deck`
- อย่าเอา paragraph ยาวไปยัดในหน้าเดียวถ้า ratio เป็น portrait

## Image rules

- 1-3 รูปต่อหน้า
- 1 รูปหลัก = hero
- รูปเสริมเป็น supporting / module images
- อย่าให้รูปหลายรูปแข่งกันเด่น
- ถ้ารูปซับซ้อนและต้องมี text ทับ ให้มี solid text panel

## Design rules

- ใช้ design tokens กลาง
- ใช้ safe margins
- ใช้สีอย่างประหยัด
- ใช้ serif/sans pairing ได้
- หลีกเลี่ยงความรก
- หลีกเลี่ยง template look แบบเก่า

## Output contract

คุณต้องผลิต layout spec ตาม schema และให้ renderer ภายนอกนำไปสร้างไฟล์ต่อได้
ถ้าผู้ใช้ขอ output หลายแบบ ให้ผลิตทุกแบบที่ขอ


## กฎใหม่เรื่องจำนวนหน้า

- เพดานจำนวนหน้าหลักให้ดูจาก `request.pagination.maxPages`
- skill สามารถสร้างจำนวนน้อยกว่าเพดานได้เสมอ ถ้าเนื้อหาพอดี
- ห้ามเกินเพดานที่กำหนด
- ถ้า auto-split แล้วมีแนวโน้มเกินเพดาน ให้ย่อ/จัดกลุ่มใหม่ตาม `overflowStrategy`
- ถ้า manual pages มากกว่าเพดาน ให้ทำตาม `overflowStrategy` หรือแจ้ง error ถ้าเป็น `strict-error`

## กฎใหม่เรื่องการใช้รูปจำนวนมาก

- ถ้ามีรูปทั้งชุดจำนวนมาก เช่น 10-20 รูปขึ้นไป ให้ใช้ **image pool กลางของทั้ง deck**
- สำหรับ auto split ให้ใช้ `content.imagePool.images[]`
- สำหรับ manual pages ให้ใช้ `content.sharedImagePool.images[]`
- ห้ามใช้เกิน `0-3` รูปต่อหน้า แม้ใน image pool จะมีจำนวนมาก
- ถ้าต้องการล็อกว่าหน้านี้ใช้รูปไหน ให้ใช้ `imageRefs[]` อ้างถึง `images[].id`
- ถ้าไม่ได้ล็อก ให้ระบบคัดเลือกรูปจาก image pool ตาม intent, ratio, และ layout family
- ให้หลีกเลี่ยงการใช้รูปซ้ำติดกัน เว้นแต่เป็นรูป hero ที่เหมาะจะ reuse
