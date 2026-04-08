# Modern Editorial Slide Skill

ชุด skill สำเร็จรูปสำหรับสร้าง **slide / page document** ที่ดูร่วมสมัย คล้ายงานนิตยสาร และเรนเดอร์เป็น **PPTX, PDF, JSON layout spec และ Markdown** ได้จาก input ที่มี **ข้อความ + รูปภาพ 1-3 รูปต่อหน้า หรือ image pool กลางทั้งชุด** หรือข้อความยาวที่ต้องให้ระบบ **ซอยอัตโนมัติเป็นหลายหน้า** ตามความหนาแน่นของเนื้อหา

## สิ่งที่ได้ในแพ็กนี้

- `SKILL.md` คำสั่งเชิงนโยบายสำหรับ LLM / agent
- `schemas/input.schema.json` และ `schemas/ui.schema.json`
- `schemas/` สำเนาแบบมาตรฐาน
- `prompts/` prompt แยก stage สำหรับ content parsing, layout planning, validation
- `src/` reference implementation แบบ Node.js + PptxGenJS
- `examples/demo.input.json` ตัวอย่าง input

## เป้าหมายหลัก

- ให้ LLM ทำหน้าที่เป็น **layout planner** ไม่ใช่ image renderer
- ข้อความยังเป็น **textbox จริง**
- รูปยังเป็น **image object จริง**
- ห้าม flatten ทั้งหน้าเป็นรูปเดียว
- รองรับ ratio แบบ **16:9 / 9:16 / 4:5 / 5:4**
- สุ่มเลย์เอาต์ให้หลากหลาย แต่ยังอยู่ในกรอบ modern editorial
- ถ้าข้อความยาวเกิน ให้แบ่งเป็นหลายหน้าอัตโนมัติ
- ถ้ารวมได้ในหน้าเดียว ให้รวมอย่างอ่านง่าย

## รองรับ output

- `json` : layout spec
- `md` : outline / content summary
- `pptx` : ไฟล์สไลด์จริง
- `pdf` : แปลงจาก PPTX ผ่าน LibreOffice headless

## โครงสร้าง input

มีได้ 2 แบบ

### แบบ 1: ส่งข้อความก้อนเดียว แล้วให้ระบบซอยหน้าอัตโนมัติ
ใช้ `request.content.rawText`

### แบบ 2: ส่งหน้าแต่ละหน้าไว้แล้ว
ใช้ `request.content.pages[]`

## Quick start

```bash
npm install
node src/index.mjs ./examples/demo.input.json ./dist
```

ถ้าต้องการ PDF ต้องมี LibreOffice (`soffice`) อยู่ใน PATH:

```bash
node src/index.mjs ./examples/demo.input.json ./dist
# ถ้า outputFormats มี pdf ระบบจะพยายามแปลง PPTX -> PDF ให้
```

## หมายเหตุสำคัญ

reference implementation ใน `src/` ใช้ **heuristic planner + seeded randomness** เพื่อให้รันได้จริงโดยไม่ผูกกับ provider ใด provider หนึ่ง

ส่วนการใช้ “ความฉลาดของ LLM” จริง ๆ ให้ใช้ไฟล์ใน `SKILL.md` และ `prompts/` เป็น policy/prompt สำหรับ agent แล้วส่งผลลัพธ์ layout spec ที่ผ่าน schema เข้า renderer นี้

## ตัวอย่างไฟล์สำคัญ

- `SKILL.md`
- `schemas/input.schema.json`
- `schemas/ui.schema.json`
- `src/index.mjs`
- `src/planner.mjs`
- `src/render-pptx.mjs`

## รูปแบบหน้า (archetypes) ที่รองรับ

- `editorial_cover_split`
- `title_hero_split`
- `two_column_editorial`
- `executive_summary_dashboard`
- `product_overview_report`
- `stat_card_with_image`
- `vertical_workflow_steps`
- `project_timeline_bands`
- `feature_story_panels`

## ลิขสิทธิ์ฟอนต์ / รูปภาพ

แพ็กนี้ไม่ bundle ฟอนต์เชิงพาณิชย์มาให้ ต้องใช้ฟอนต์ที่มีในเครื่องผู้ใช้ หรือเปลี่ยนชื่อฟอนต์ใน input/theme เอง


## การจำกัดจำนวนหน้า

เวอร์ชันอัปเดตรองรับ `request.pagination.maxPages` อย่างชัดเจนแล้ว

- skill อาจสร้างตั้งแต่ `1..maxPages` หน้า
- ถ้าเนื้อหาสั้นพอ จะสร้างน้อยกว่าได้
- ถ้าเนื้อหายาวเกินเพดาน จะทำตาม `request.pagination.overflowStrategy`
  - `condense` : ย่อและบีบกลุ่มเนื้อหาใหม่ให้อยู่ในเพดาน
  - `merge-tail` : รวมส่วนท้ายเข้าหน้าสุดท้ายเท่าที่จำเป็น
  - `strict-error` : แจ้ง error ถ้าเกินเพดาน

ตัวอย่าง: ถ้าต้องการห้ามเกิน 5 หน้า ให้ตั้ง `pagination.maxPages = 5`

## แนวทางส่งรูปที่เหมาะสม

ถ้ามีรูปทั้งชุดจำนวนมาก เช่น 20 รูป **ไม่ควร** ส่งแยก 20 รูปในทุกหน้า เพราะจะทำให้ input ซ้ำและควบคุมยาก

แนวทางที่แนะนำคือ

1. **โหมด auto split**
   - ส่งรูปทั้งหมดไว้ที่ `request.content.imagePool.images[]`
   - skill จะคัดเลือกรูปที่เหมาะกับแต่ละหน้าให้อัตโนมัติ
   - จำกัดการใช้จริงต่อหน้าไว้ที่ `0-3` รูป ด้วย `maxImagesPerPage`

2. **โหมด manual pages**
   - ส่งรูปทั้งชุดไว้ที่ `request.content.sharedImagePool.images[]`
   - แต่ละหน้าเลือกใช้ผ่าน `imageRefs[]` หรือให้ระบบเติมให้อัตโนมัติด้วย `imageSelectionMode`

3. **กรณีงานเล็ก**
   - ถ้ามีรูปน้อยและง่าย สามารถใช้ `images[]` แบบเดิมได้
   - แต่ถือเป็น legacy shortcut มากกว่ารูปแบบหลัก
