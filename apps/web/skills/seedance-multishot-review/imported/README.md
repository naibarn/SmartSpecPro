# Seedance Multi-Shot Review Prompt Skill

Skill สำหรับสร้าง prompt ข้อความปกติสำหรับวิดีโอรีวิวสินค้าแบบ multi-shot โดยอ้างอิงจากภาพสินค้า ภาพคน และหมวดสินค้า

## Version 1.1.0

อัปเดตหลัก: เพิ่มระบบกรองคำเข้มขึ้น เพื่อไม่ให้ output หลุดคำไม่ต้องการ เช่น

- ชื่อสินค้า / ชื่อบริษัท / ชื่อร้าน / ชื่อแพลตฟอร์ม / named style reference
- คำที่ฟังเหมือนรับประกันผลลัพธ์ หรือเปรียบเทียบเกินจริง
- คำด้านความทนทาน ความปลอดภัย ประสิทธิภาพ การรับรอง หรือการรับประกัน
- คำต้องห้ามที่ผู้ใช้เพิ่มเองใน `banned_output_terms`
- ตัวหนังสือบนวัตถุในฉาก เช่น caption, ป้าย, เลข, ฉลาก, ชื่อหนังสือ, เครื่องหมายบนสินค้า

## ไฟล์สำคัญ

- `skill.manifest.json`
- `skill.instructions.md`
- `schemas/input.schema.json`
- `schemas/ui.schema.json`
- `schemas/output.schema.json`
- `tools/sanitize_check.py`
- `examples/strict-minimal-coffee-table-output.txt`

## ค่าแนะนำ

```json
{
  "strict_sanitization": true,
  "sanitize_level": "ultra",
  "remove_all_visible_text": true,
  "disallow_named_style_references": true,
  "include_generator_name_in_prompt": false
}
```

## หลักการเขียน output

ให้ใช้คำเชิงภาพแทนคำเสี่ยง เช่น

- very clean, airy, soft-toned, neutral, minimal, uncluttered
- warm light wood, pale textiles, soft daylight, quiet home atmosphere
- modern workspace mood
- premium dark room mood
- clear product appearance
- visible frame structure
- close-up of the surface finish
- neatly arranged setup

## การใช้งาน character reference

ถ้ามีภาพ character ให้ skill ใส่ character lock อัตโนมัติ เช่นคงใบหน้า แว่น ทรงผม สัดส่วน และตัวตนโดยรวม พร้อมให้ character เคลื่อนไหวตามธรรมชาติถ้าคลิปเป็นแนว lifestyle หรือ cinematic
