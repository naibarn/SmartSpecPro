# วิธีสั่ง LLM ให้จัดหน้า Slide แบบสวยหรูทันสมัย โดยแยกข้อความและรูปภาพเป็นองค์ประกอบที่แก้ไขได้จริง

เอกสารนี้ออกแบบมาเพื่อใช้เป็น **คู่มือพร้อมคัดลอก** สำหรับการสร้างสไลด์ด้วย LLM โดยเน้นผลลัพธ์แบบ

- ดูหรูหรา ทันสมัย คล้ายงานนิตยสารหรือ presentation ระดับ premium
- ข้อความยังเป็นข้อความจริง แก้ไขได้
- รูปภาพยังเป็นรูปภาพจริง แยกจากข้อความชัดเจน
- ไม่ flatten ทั้งสไลด์เป็นภาพเดียว
- เหมาะกับการนำไปใช้กับระบบสร้าง `.pptx` เช่น PptxGenJS หรือ python-pptx

---

## 1) เป้าหมายที่ถูกต้อง

เวลาหลายคนบอกว่าอยากให้ LLM “ทำสไลด์สวย ๆ” ระบบมักพลาดไปที่การสร้างภาพของสไลด์ทั้งหน้า ซึ่งสวยในภาพรวม แต่แก้ไขไม่ได้ใน PowerPoint เพราะทุกอย่างถูกรวมเป็นภาพเดียว

แนวทางที่ถูกต้องคือ:

> ให้ LLM ทำหน้าที่เป็น **Slide Layout Planner** ไม่ใช่ Slide Renderer

แปลว่า LLM ต้องทำหน้าที่ออกแบบว่า

- ข้อความอยู่ตรงไหน
- รูปอยู่ตรงไหน
- กล่องพื้นหลังหรือ shape อยู่ตรงไหน
- ระยะขอบเท่าไร
- ตัวอักษรแบบไหน
- ลำดับชั้นสายตาเป็นอย่างไร
- สไลด์ควรใช้โครงแบบใด

แล้วค่อยส่งผลลัพธ์ในรูปแบบ **JSON layout spec** ไปให้ตัวสร้าง PPTX วางเป็น object จริง เช่น

- title text box
- body text box
- hero image
- accent shape
- table
- chart

นี่คือหัวใจสำคัญที่สุดของทั้งระบบ

---

## 2) หลักคิดสั้น ๆ ที่ต้องยึดตลอด

### ห้ามให้ LLM วาดสไลด์เป็นภาพ
ห้ามสั่งให้โมเดล “render slide” หรือ “generate the slide as an image” ถ้าจุดหมายคือไฟล์ที่แก้ไขได้

### ให้ LLM ออกแบบเป็นโครงสร้าง
คำตอบจาก LLM ควรเป็นข้อมูลที่ชัดเจน เช่น

- layout type
- element list
- x, y, w, h
- typography
- alignment
- spacing
- image role
- contrast rule

### ให้ renderer เป็นคนสร้างไฟล์จริง
ตัว renderer ควรเป็นโค้ดที่ map JSON ไปยังคำสั่งสร้าง PowerPoint เช่น

- `addText()`
- `addImage()`
- `addShape()`
- `addTable()`
- `addChart()`

### จำกัด freedom ของโมเดล
โมเดลไม่ควรออกแบบแบบไร้ขอบเขตทุกหน้า ควรมี template หรือ layout archetype ให้เลือก เพื่อคุมคุณภาพให้คงเส้นคงวา

---

## 3) สถาปัตยกรรมที่แนะนำ

ใช้โครงสร้าง 3 ชั้นดังนี้

### ชั้นที่ 1: Content Planning
รับข้อมูลจากผู้ใช้หรือระบบ เช่น

- หัวข้อสไลด์
- key message
- body text
- bullet points
- quote
- image reference
- data points

LLM อาจช่วยสรุปเนื้อหาให้อยู่ในระดับที่เหมาะกับสไลด์ เช่น 1 หน้าไม่เกิน 1 message หลัก

### ชั้นที่ 2: Layout Planning
LLM สร้าง **layout spec** ของแต่ละสไลด์ เช่น

- ใช้ layout แบบไหน
- text block อยู่ฝั่งซ้าย
- hero image อยู่ฝั่งขวา
- caption อยู่ล่างรูป
- มี accent panel ด้านหลังข้อความ
- ขนาดและตำแหน่งของทุกองค์ประกอบ

### ชั้นที่ 3: PPTX Rendering
ตัวสร้างเอกสารอ่าน JSON แล้วสร้าง `.pptx` จริง

- ข้อความ -> textbox
- รูป -> image
- แถบสี/พื้นหลัง -> shape
- ตาราง -> table
- กราฟ -> chart

ผลลัพธ์คือไฟล์ที่เปิดใน PowerPoint แล้วเลือกข้อความได้ แก้ได้ ย้ายได้

---

## 4) ลักษณะของสไลด์ที่ดูหรูหราและทันสมัย

สไตล์ “luxury modern editorial” มักมีลักษณะดังนี้

### 4.1 ใช้พื้นที่ว่างเยอะ
ไม่ยัดทุกอย่างแน่น

### 4.2 ลำดับชั้นสายตาชัด
- หัวข้อใหญ่เด่น
- เนื้อหาสั้นลง
- caption เล็กลง

### 4.3 ภาพเด่นเพียง 1 ภาพ
แทนที่จะใช้หลายภาพเล็ก ๆ ที่ทำให้ดูเหมือนโบรชัวร์ราคาถูก

### 4.4 ข้อความและภาพแยกโซนกันชัด
- text zone
- image zone
- optional accent panel

### 4.5 ใช้สีอย่างประหยัด
มักใช้เพียง
- พื้นหลัง 1 สี
- สีตัวอักษรหลัก 1 สี
- สี accent 1 สี

### 4.6 ตัวอักษรไม่มากเกินไป
สไลด์ที่ดูแพงมักเขียนน้อย แต่จัดวางดี

### 4.7 ใช้ typography ช่วยความรู้สึก
เช่น
- heading serif ดู luxury / editorial
- body sans-serif ดู modern / clean

---

## 5) กฎการออกแบบที่ควรบังคับในระบบ

คัดลอกส่วนนี้ไปใช้เป็น design rules ได้ทันที

```text
Design rules:
- Aspect ratio: 16:9
- Large safe margins on all sides
- Keep text and image in clearly separated zones
- Prefer asymmetric editorial compositions
- Use one hero image per slide
- Maximum 3 text blocks per slide
- Keep text density low
- Strong visual hierarchy: title > body > caption
- Use restrained premium palette
- Avoid clutter, excessive icons, and decorative noise
- Never rasterize the whole slide
- All text must remain editable text objects
- All images must remain separate image objects
- If text overlaps image, add a solid panel behind the text
- Every element must include x, y, w, h
- Avoid placing long paragraphs on slides
- Use alignment and whitespace to create elegance
```

---

## 6) Layout archetypes ที่ควรเตรียมไว้ล่วงหน้า

เพื่อให้คุณภาพงานออกมาสม่ำเสมอ ควรมีโครงแบบมาตรฐานให้ LLM เลือก เช่น

### 6.1 `title_hero_split`
เหมาะกับ
- opening slide
- brand story
- feature introduction

ลักษณะ
- ซ้าย = headline + supporting text
- ขวา = รูปใหญ่
- มี shape หรือ panel รองหลังบางส่วน

### 6.2 `two_column_editorial`
เหมาะกับ
- idea explanation
- strategy page
- insight page

ลักษณะ
- ซ้าย = narrative
- ขวา = visual, callout, highlight, quote, or cards

### 6.3 `stat_card_with_image`
เหมาะกับ
- KPI
- market opportunity
- business results

ลักษณะ
- ตัวเลขเด่นมาก
- มี card หรือ block แยกชัด
- รูปใช้เสริม mood ไม่แข่งกับตัวเลข

### 6.4 `full_bleed_image_with_text_panel`
เหมาะกับ
- quote page
- keynote statement
- luxury brand page

ลักษณะ
- รูปกินพื้นที่มาก
- ข้อความไม่ได้ลอยบนรูปตรง ๆ แต่มีแผ่นพื้นหลังทึบรอง

### 6.5 `image_caption_story`
เหมาะกับ
- case study
- editorial narrative
- founder message

ลักษณะ
- รูปเด่นหนึ่งฝั่ง
- อีกฝั่งมี title + short body + small caption

---

## 7) สิ่งที่ต้องบอก LLM ให้ชัดมาก

LLM ต้องรู้ชัดว่า “งานของมันคืออะไร”

ใช้ข้อความแนวนี้ใน system prompt หรือ developer prompt:

```text
You are a slide layout planner.
You do not render slides as images.
You create editable slide specifications.

Your job is to design each slide as a structured layout made of separate objects:
- text
- image
- shape
- table
- chart

All text must remain editable text boxes.
All images must remain separate image objects.
Never flatten or rasterize the whole slide.
Return JSON only.
```

---

## 8) Prompt หลักสำหรับสั่ง LLM

ด้านล่างคือ prompt แบบพร้อมใช้

```text
You are a premium presentation layout planner.

Goal:
Create luxurious, modern, editorial-style slide layouts for a PowerPoint presentation.
The output must describe editable slide objects, not rendered slide images.

Requirements:
- All text must remain editable text objects
- All images must remain separate image objects
- Do not rasterize, flatten, screenshot, or convert the whole slide into a single image
- Return valid JSON only
- Every element must include x, y, w, h
- Use 16:9 slide coordinates
- Maintain strong visual hierarchy
- Keep text and image clearly separated
- Use large margins and elegant whitespace
- Prefer magazine-like asymmetric layouts
- Keep slides minimal, premium, and modern

Allowed element kinds:
- text
- image
- shape
- table
- chart

Allowed layout archetypes:
- title_hero_split
- two_column_editorial
- stat_card_with_image
- full_bleed_image_with_text_panel
- image_caption_story

Design rules:
- Max 1 hero image per slide
- Max 3 text blocks per slide
- Keep body copy short
- Use solid text panels if text needs contrast over an image
- Avoid clutter, decorative icons, and dense bullet lists
- Use restrained premium color palette

Forbidden:
- No HTML output
- No SVG output
- No canvas output
- No full-slide bitmap output
- No merging multiple text blocks into a single image
- No long paragraphs

Input:
{INPUT_CONTENT}

Output schema:
{JSON_SCHEMA}
```

---

## 9) Prompt เสริมสำหรับคุมความหรูหรา

ใช้ต่อจาก prompt หลัก หรือใส่เป็น style instruction

```text
Style direction:
- The presentation should feel like a luxury editorial brand deck
- Spacious, calm, refined, and modern
- Elegant typography with clear scale differences
- Minimal but intentional use of shapes
- Warm neutral palette or monochrome premium palette
- Avoid startup-template clichés
- Avoid default corporate PowerPoint look
- Avoid crowded layouts
- Focus on balance, whitespace, and visual confidence
```

---

## 10) Prompt เสริมสำหรับคุมการแยกข้อความกับภาพ

```text
Text and image separation rules:
- Text must occupy its own readable zone
- Image must occupy its own visual zone
- Do not place paragraphs directly over complex images
- If text appears on an image, add a solid or semi-opaque panel behind the text
- Keep at least one clear alignment edge between text and image regions
- Do not let body text cross into the hero image area without a background panel
```

---

## 11) JSON Schema ที่แนะนำ

ตัวอย่าง schema แบบใช้งานจริง

```json
{
  "theme": {
    "palette": ["#F5F1EA", "#141414", "#A38B6D"],
    "background": "#F5F1EA",
    "titleFont": "Playfair Display",
    "bodyFont": "Inter",
    "titleColor": "#141414",
    "bodyColor": "#2A2A2A",
    "accentColor": "#A38B6D"
  },
  "slides": [
    {
      "id": "slide_01",
      "layout": "title_hero_split",
      "background": "#F5F1EA",
      "elements": [
        {
          "kind": "text",
          "role": "title",
          "text": "A New Standard of Boutique Hospitality",
          "x": 0.8,
          "y": 0.9,
          "w": 5.4,
          "h": 1.3,
          "fontSize": 26,
          "fontFace": "Playfair Display",
          "bold": false,
          "color": "#141414",
          "align": "left",
          "valign": "mid"
        },
        {
          "kind": "text",
          "role": "body",
          "text": "A refined guest experience shaped by design, privacy, and personalized service.",
          "x": 0.8,
          "y": 2.5,
          "w": 4.9,
          "h": 1.0,
          "fontSize": 14,
          "fontFace": "Inter",
          "color": "#2A2A2A",
          "align": "left",
          "valign": "top"
        },
        {
          "kind": "shape",
          "role": "panel",
          "shape": "roundRect",
          "x": 6.5,
          "y": 0.7,
          "w": 5.7,
          "h": 5.8,
          "fill": "#E7DED2",
          "line": "#E7DED2",
          "radius": 18
        },
        {
          "kind": "image",
          "role": "hero",
          "sourceKey": "hotel_lobby_01",
          "x": 6.9,
          "y": 1.0,
          "w": 5.2,
          "h": 5.3,
          "fit": "cover",
          "cornerRadius": 12
        },
        {
          "kind": "text",
          "role": "caption",
          "text": "Signature arrival experience with warm material tones",
          "x": 6.9,
          "y": 6.45,
          "w": 4.5,
          "h": 0.4,
          "fontSize": 9,
          "fontFace": "Inter",
          "color": "#5B534A",
          "align": "left",
          "valign": "mid"
        }
      ]
    }
  ]
}
```

---

## 12) ความหมายของ field สำคัญ

### ระดับสไลด์
- `id` = รหัสของสไลด์
- `layout` = archetype ที่เลือกใช้
- `background` = สีพื้นหลัง

### ระดับองค์ประกอบ
- `kind` = ประเภท เช่น text, image, shape
- `role` = บทบาท เช่น title, body, hero, panel, caption
- `x, y, w, h` = ตำแหน่งและขนาด
- `fontSize` = ขนาดตัวอักษร
- `fontFace` = ชื่อฟอนต์
- `fit` = วิธีวางรูป เช่น cover / contain
- `cornerRadius` = ความโค้งของมุม

---

## 13) ข้อห้ามที่ควรใส่ทุกครั้ง

คัดลอกส่วนนี้ได้เลย

```text
Forbidden behaviors:
- Do not generate the entire slide as a single image
- Do not return rendered mockups instead of structured layout data
- Do not embed text inside images
- Do not use screenshots as slide content
- Do not overlap long body text on busy images
- Do not create more than one dominant focal point per slide
- Do not produce crowded or template-looking corporate layouts
- Do not place elements without coordinates
- Do not output prose explanations outside the JSON
```

---

## 14) วิธีทำให้ผลลัพธ์นิ่งและดีขึ้น

### 14.1 ให้โมเดลเลือกจาก layout archetype เท่านั้น
แทนที่จะให้ invent ใหม่ทุกครั้ง

### 14.2 ใช้ design tokens
กำหนดส่วนกลางไว้ เช่น

- สีหลัก
- สีรอง
- ฟอนต์หัวข้อ
- ฟอนต์เนื้อหา
- spacing scale
- corner radius

### 14.3 ใช้ safe area
กำหนดขอบปลอดภัย เช่น

- ซ้ายขวาไม่น้อยกว่า 0.7–1.0 นิ้ว
- บนล่างไม่น้อยกว่า 0.5–0.7 นิ้ว

### 14.4 จำกัดข้อความต่อสไลด์
เช่น

- title ไม่เกิน 12 คำ
- body ไม่เกิน 35 คำ
- bullets ไม่เกิน 3 ข้อ

### 14.5 ใช้สองขั้นตอน
1. ให้ LLM สรุปเนื้อหาให้พอดีกับสไลด์
2. ให้ LLM จัด layout จากเนื้อหาที่สรุปแล้ว

ระบบสองขั้นตอนมักนิ่งกว่าสั่งรวบทีเดียว

---

## 15) ตัวอย่าง use case แบบนิตยสาร

### Use case: Boutique Hotel Brand Deck
โจทย์:
- มีภาพ lobby โรงแรม
- ต้องการหน้าเปิดที่ดูหรูและสงบ
- มี headline, subheadline, caption

คำสั่งเนื้อหา:

```text
Create slide 1 for a boutique hospitality brand deck.
Message: quiet luxury, intimate scale, personalized guest experience.
Include one hero image, one large editorial title, one short supporting paragraph, and one caption.
```

รูปแบบที่ควรได้:
- ฝั่งซ้ายเป็นหัวข้อใหญ่ serif
- body สั้น ๆ ใต้หัวข้อ
- ฝั่งขวาเป็นภาพใหญ่ในกรอบหรือ panel
- มี caption เล็กใต้ภาพ
- ใช้ neutral palette เช่น ivory / taupe / charcoal

---

## 16) ตัวอย่าง output ที่ดี

```json
{
  "slides": [
    {
      "id": "slide_01",
      "layout": "title_hero_split",
      "background": "#F7F3EC",
      "elements": [
        {
          "kind": "text",
          "role": "title",
          "text": "Quiet Luxury,
Redefined",
          "x": 0.9,
          "y": 1.0,
          "w": 4.8,
          "h": 1.6,
          "fontSize": 28,
          "fontFace": "Cormorant Garamond",
          "color": "#171717",
          "align": "left"
        },
        {
          "kind": "text",
          "role": "body",
          "text": "An intimate hospitality experience shaped by thoughtful design, material warmth, and deeply personal service.",
          "x": 0.9,
          "y": 3.0,
          "w": 4.5,
          "h": 1.0,
          "fontSize": 13,
          "fontFace": "Inter",
          "color": "#303030",
          "align": "left"
        },
        {
          "kind": "shape",
          "role": "panel",
          "shape": "roundRect",
          "x": 6.4,
          "y": 0.8,
          "w": 5.8,
          "h": 5.9,
          "fill": "#E8DED2",
          "line": "#E8DED2",
          "radius": 18
        },
        {
          "kind": "image",
          "role": "hero",
          "sourceKey": "boutique_hotel_lobby_main",
          "x": 6.8,
          "y": 1.1,
          "w": 5.1,
          "h": 5.2,
          "fit": "cover",
          "cornerRadius": 10
        },
        {
          "kind": "text",
          "role": "caption",
          "text": "Arrival lounge with textured stone, walnut, and soft evening light",
          "x": 6.8,
          "y": 6.45,
          "w": 4.4,
          "h": 0.35,
          "fontSize": 8,
          "fontFace": "Inter",
          "color": "#6A625B",
          "align": "left"
        }
      ]
    }
  ]
}
```

---

## 17) เงื่อนไข validation ก่อนสร้าง PPTX

ก่อนส่ง JSON ไป render ควรตรวจดังนี้

### Validation ด้านโครงสร้าง
- มี `slides`
- ทุก slide มี `layout`
- ทุก element มี `kind`
- ทุก element มี `x, y, w, h`

### Validation ด้าน design
- มี title อย่างมาก 1 block
- hero image อย่างมาก 1 block
- จำนวน text block ไม่เกิน threshold ที่กำหนด
- body text ไม่ยาวเกินที่กำหนด
- element ไม่ล้นนอก safe area
- image กับ text ไม่ทับกันผิดกฎ

### Validation ด้าน output
- ไม่มี field ที่บอกให้ render เป็นภาพรวม
- ไม่มี base64 ของ slide ทั้งหน้า
- ไม่มี HTML/SVG/canvas ที่ใช้แทน object layout

---

## 18) แนวทาง map JSON ไปยัง PowerPoint

### สำหรับ text
- สร้าง textbox
- ตั้ง font, size, color, align
- เปิด word wrap ตามจำเป็น

### สำหรับ image
- วางภาพตามพิกัด
- ใช้ fit แบบ cover หรือ contain
- ใส่ crop ตามกติกา
- ถ้าต้องการมุมโค้ง ให้ใช้ masking หรือกรอบเสริมตาม library ที่รองรับ

### สำหรับ shape
- ใช้เป็น panel, divider, background accent, card
- อย่าใช้มากเกินไป

### สำหรับ table/chart
- ใช้เฉพาะเมื่อข้อมูลต้องการจริง ๆ
- คุม style ให้ minimal

---

## 19) Prompt สำหรับสรุปเนื้อหาก่อนจัดหน้า

ใช้กรณีที่ข้อความต้นฉบับยาวเกินไป

```text
You are a presentation editor.
Condense the input into slide-ready content.
Rules:
- One core message per slide
- Title: max 10 words
- Body: max 30 words
- Max 3 bullets if needed
- Prefer elegant editorial phrasing
- Remove repetition and filler
Return JSON only with fields: title, body, bullets, caption
```

---

## 20) Workflow ที่แนะนำแบบ end-to-end

### ขั้นที่ 1 รับเนื้อหา
เช่น
- หัวข้อ
- ข้อความหลัก
- รูปที่ใช้ได้
- จำนวนสไลด์

### ขั้นที่ 2 ย่อเนื้อหาให้พอดีสไลด์
ใช้ LLM ตัวแรกหรือ prompt ชุดแรก

### ขั้นที่ 3 เลือก archetype ต่อสไลด์
เช่น
- slide 1 -> title_hero_split
- slide 2 -> two_column_editorial
- slide 3 -> stat_card_with_image

### ขั้นที่ 4 ให้ LLM สร้าง JSON layout spec
โดยบังคับ schema ชัดเจน

### ขั้นที่ 5 ตรวจ validation
กัน layout แปลก ๆ หรือผิดกฎ

### ขั้นที่ 6 Render เป็น PPTX
ด้วย PptxGenJS หรือ python-pptx

### ขั้นที่ 7 ทำ post-processing
เช่น
- ปรับ spacing เล็กน้อย
- crop รูป
- เช็ค overflow ของข้อความ

---

## 21) สูตร prompt แบบสั้นสำหรับใช้งานจริง

### สูตรสั้น 1

```text
Design this slide as an editable luxury editorial PowerPoint layout.
Keep text and image as separate objects.
Do not flatten the slide into an image.
Return JSON only with coordinates for each element.
```

### สูตรสั้น 2

```text
Create a modern magazine-like slide layout.
Use one hero image, one large title, one short body text, and optional caption.
All text must remain editable.
All images must remain separate image objects.
Return JSON only.
```

### สูตรสั้น 3

```text
Plan, do not render.
Structure the slide as text boxes, image boxes, and shapes.
No bitmap slide output.
Use premium spacing and clear visual hierarchy.
```

---

## 22) ปัญหาที่พบบ่อยและวิธีแก้

### ปัญหา 1: โมเดลชอบทำ text ทับรูป
วิธีแก้:
- ใส่ rule ว่า text ต้องอยู่คนละ zone
- ถ้าจำเป็นต้องวางบนรูป ต้องมี solid text panel

### ปัญหา 2: โมเดลใส่ข้อความเยอะเกิน
วิธีแก้:
- แยก stage สรุปเนื้อหาก่อน
- จำกัดจำนวนคำใน schema หรือ validator

### ปัญหา 3: layout ดูเหมือน template ทั่วไป
วิธีแก้:
- ใช้ editorial archetype
- เพิ่ม whitespace
- ลด bullets
- ใช้ serif heading + sans body

### ปัญหา 4: แต่ละหน้า style ไม่คงที่
วิธีแก้:
- ใช้ design tokens กลาง
- บังคับ palette / typography / spacing scale
- ใช้ slide master

### ปัญหา 5: ภาพกับข้อความแข่งกันเด่นเกินไป
วิธีแก้:
- ให้มี focal point หลักเพียง 1 จุด
- ถ้ารูปเด่นมาก ให้ body text สั้นลง
- ถ้า title เด่นมาก ให้ลดความซับซ้อนของภาพ

---

## 23) Checklist ก่อนใช้งานจริง

คัดลอกเช็กลิสต์นี้ไปใช้ได้ทันที

```text
[ ] โมเดลถูกกำหนดบทบาทเป็น layout planner ไม่ใช่ image renderer
[ ] มีการบังคับให้ output เป็น JSON เท่านั้น
[ ] มี schema ชัดเจน
[ ] ทุก element มี x, y, w, h
[ ] ข้อความกับรูปภาพเป็น object แยกกัน
[ ] ไม่มีการ flatten ทั้งสไลด์เป็นภาพเดียว
[ ] มี layout archetype ที่จำกัดไว้ล่วงหน้า
[ ] มี design tokens กลาง
[ ] มี validator ตรวจ overlap, overflow, และ text length
[ ] renderer สร้างไฟล์ PPTX เป็น object จริง
```

---

## 24) ข้อสรุปที่ควรจำให้ขึ้นใจ

ถ้าต้องการสไลด์ที่
- สวยหรู
- ดูทันสมัย
- คล้ายงานนิตยสาร
- ยังแก้ไขข้อความและรูปได้แยกกันจริง

แนวทางที่ถูกต้องคือ

> ให้ LLM ออกแบบ “โครงสร้างสไลด์” ไม่ใช่ “ภาพของสไลด์”

สูตรสำเร็จคือ

> Content -> Layout Spec -> Validation -> PPTX Render

ไม่ใช่

> Content -> Render เป็นภาพทั้งหน้า

เมื่อคุณแยกหน้าที่แบบนี้ได้ชัด ระบบจะนิ่งขึ้น สวยขึ้น และใช้งานต่อได้จริงในระดับ production

---

## 25) เวอร์ชันคัดลอกเร็วที่สุด

```text
Use the LLM as a slide layout planner, not a slide renderer.
Return structured JSON for editable slide objects only.
All text must remain editable text boxes.
All images must remain separate image objects.
Never flatten the whole slide into a single image.
Use premium editorial layouts with large margins, strong hierarchy, low text density, and clear separation between text and image zones.
```

---

## 26) เวอร์ชันพร้อมวางใน system prompt

```text
You are a premium presentation layout planner.
Your job is to design editable PowerPoint slide layouts as structured objects.

You must:
- keep all text as editable text objects
- keep all images as separate image objects
- return valid JSON only
- include x, y, w, h for every element
- use elegant editorial layout principles
- maintain clear separation between text and image
- keep slides minimal, luxurious, and modern

You must not:
- render the whole slide as a bitmap image
- flatten text into images
- output HTML, SVG, or canvas instead of structured layout data
- create cluttered corporate template layouts
```

---

## 27) เวอร์ชันพร้อมวางใน user prompt

```text
Create a 16:9 luxury editorial slide layout for a boutique hospitality brand.
Use one hero image, one large title, one short supporting text, and one caption.
Keep text and image clearly separated.
All text must remain editable.
All images must remain separate objects.
Do not flatten the slide into an image.
Return JSON only.
```

---

## 28) ข้อแนะนำปิดท้าย

ถ้าจะทำระบบนี้ให้ดีในระดับใช้งานจริง ให้เริ่มจากเพียง 3 archetype ก่อน

- title_hero_split
- two_column_editorial
- stat_card_with_image

เมื่อระบบนิ่งแล้วค่อยเพิ่มรูปแบบอื่นภายหลัง เพราะยิ่ง layout เปิดอิสระมากเท่าไร ความไม่นิ่งของผลลัพธ์ก็จะสูงขึ้นตามไปด้วย
