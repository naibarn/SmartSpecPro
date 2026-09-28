# Cute Child Image Generator v3

เวอร์ชันนี้อัปเดตจาก v2 โดยแก้ให้ output เป็น **prompt ชุดเดียวพร้อมใช้งาน** และเพิ่ม **ภาพ reference ตัวละคร 1-5 ภาพ** เพื่อคงใบหน้า อายุ และเอกลักษณ์ตัวละครเดิม

## สิ่งที่เปลี่ยนใน v3
1. ไม่มี negative prompt แยกแล้ว — ใช้ `generation_prompt` ชุดเดียว
2. รองรับภาพ reference ตัวละคร 0-5 ภาพ
3. มีไฟล์ schema ครบในโฟลเดอร์ `schemas/`
4. ออกแบบให้เหมาะกับการใช้เป็น source skill ของระบบ Storyboard

## โครงสร้างไฟล์

```text
cute-child-image-generator-v3/
├─ skill.meta.json
├─ scene-presets.json
├─ randomization-rules.json
├─ prompt-builder.md
├─ runtime-example.ts
├─ README.md
├─ schemas/
│  ├─ input.schema.json
│  ├─ ui.schema.json
│  └─ output.schema.json
└─ docs/
   ├─ skill-invocation-guide.md
   └─ storyboard-system-development-spec.md
```

## Output สำคัญ

- `generation_prompt`
- `generation_request`
- `prompt_debug`

`generation_request` พร้อมส่งต่อให้ image generation core ได้ทันที
