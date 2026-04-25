---
slug: media-generation
title: สร้างรูปภาพ วิดีโอ และเสียง
description: สร้างสื่อด้วย AI
icon: Image
section: content-creation
order: 30
pages: ["/chat", "/media-studio"]
tags:
  - "image"
  - "video"
  - "audio"
  - "generation"
  - "media"
  - "create"
  - "help"
  - "help/th"
  - "help/media"
  - "media-generation"
aliases:
  - "media-generation"
  - "สร้างรูปภาพ วิดีโอ และเสียง"
  - "สร้างรูปภาพ วิดีโอ และเสียง help"
---

# สร้างรูปภาพ วิดีโอ และเสียง

## สร้างสื่อจาก Chat

การสร้างสื่อทั้งหมดเริ่มต้นที่ Chat อธิบายสิ่งที่ต้องการและแพลตฟอร์มจะดำเนินการให้

- **Generate Image** — ใช้ Generate Image เพื่อเริ่มด้วย `create image:` แล้วอธิบายภาพที่ต้องการ เช่น `create image: โต๊ะทำงานมินิมอลพร้อมแล็ปท็อปและกาแฟ มุมมองจากด้านบน แสงนุ่มนวล`
- **Generate Video** — ใช้ Generate Video เพื่อเริ่มด้วย `create video:` สำหรับผลลัพธ์แบบเคลื่อนไหว เช่น `create video: แม่น้ำในภูเขาที่สงบงามยามพระอาทิตย์ขึ้น cinematic 4K`
- **Generate Audio** — ใช้ Generate Audio เมื่อต้องการสร้างเสียงพูด เพลง หรือเสียงประกอบ
- **Prompt enhancement** — พิมพ์ไอเดียคร่าวๆ แล้วใช้ action prompt-enhance เพื่อให้ระบบปรับปรุง prompt ก่อนสร้างสื่อ เพื่อผลลัพธ์ที่ดีกว่า
- **แนบภาพตัวอย่าง** — แนบภาพอ้างอิงและขอให้โมเดลแก้ไข ต่อยอด หรือใช้เป็นแนวทางสไตล์

## Media Studio

สื่อที่สร้างแล้วจะบันทึกไว้ใน **Media Studio** ซึ่งคุณสามารถ:

- เรียกดูประวัติการสร้าง (7 วันล่าสุด สูงสุด 50 รายการ)
- ดาวน์โหลดหรือแชร์รายการแต่ละชิ้น
- นำ prompt ไปสร้าง variation ใหม่

## เคล็ดลับสร้างสื่อให้ได้ผลดี

| เป้าหมาย | เคล็ดลับ |
|---|---|
| สไตล์ที่สม่ำเสมอ | ใช้รูปอ้างอิงสไตล์ หรือระบุสไตล์ชัดเจนใน prompt |
| ขนาดที่แน่นอน | ระบุอัตราส่วน: `16:9`, `1:1`, `9:16` |
| ภาพสมจริง | เพิ่ม `photorealistic, DSLR, 4K, detailed` ใน prompt |
| สไตล์แอนิเมชัน | ระบุประเภทการเคลื่อนไหว: `slow pan`, `zoom in`, `timelapse` |
| prompt ที่ดีขึ้น | ลอง prompt-enhance กับไอเดียคร่าวๆ เสมอก่อนสร้าง |

## Provider ที่รองรับ

การสร้างสื่อจะถูกส่งไปยัง provider ที่ดีที่สุดสำหรับประเภทคำขอของคุณ Provider รวมถึงบริการ AI สำหรับรูปภาพ วิดีโอ และเสียงที่ผู้ดูแลระบบกำหนดค่าไว้ โมเดลที่ใช้ได้อาจแตกต่างกันตามแผนบัญชีของคุณ

<!-- knowledge-graph:related:start -->
## หัวข้อที่เกี่ยวข้อง

- [[getting-started|เริ่มต้นใช้งาน]]
- [[document-management|จัดการเอกสาร]]
- [[gallery|แกลเลอรี่]]
- [[presentations|สร้าง Presentation จาก Chat]]
- [[video-editor|Video Editor]]
<!-- knowledge-graph:related:end -->
