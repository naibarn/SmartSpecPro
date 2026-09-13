# Character Prompt Skill Category Design

## Goal

เพิ่มหมวดหมู่ skill ใหม่สำหรับการสร้างพรอมต์ตัวละคร โดยแสดงชื่อสองภาษาให้ถูกต้องและทำให้หมวดนี้ใช้งานได้เหมือนหมวด prompt-generation ที่มีอยู่ในระบบ

## Naming

- Canonical category: `character_prompt_generation`
- Thai label: `สร้างพรอมต์ตัวละคร`
- English label: `Create Character Prompts`

## Scope and data flow

เพิ่มค่า canonical category ใน PostgreSQL enum และ Drizzle schema พร้อม migration แบบ additive และ alias แบบ kebab-case ใน shared skill parser/backend mapper จากนั้นให้ metadata กลางอนุญาต execution mode เดิมของ prompt-generation (`llm-only`, `enhance-prompt`, `python`) และให้หน้า Admin, Skill Browser และ Marketplace รู้จักค่าเดียวกันผ่านรายการ category ของแต่ละหน้า

เพิ่มคำแปลใน locale ทั้งสองรูปแบบที่โปรเจกต์ใช้ (`client/src/lib/i18n/locales` และ `client/src/locales`) เพื่อไม่ให้ fallback แสดง slug ดิบในหน้าใดหน้าหนึ่ง

หมวดนี้จะถูกจัดเป็น image prompt capability ใน skill catalog, prompt enhancement fallback และ presentation draft capability เพื่อให้ skill ที่เลือกหมวดใหม่นำไปใช้กับ workflow ภาพตัวละครได้โดยไม่ตกไปเป็น specialist/text-only

## Compatibility and safety

- หมวดเดิมและค่าที่บันทึกอยู่ไม่เปลี่ยนแปลง
- migration เพิ่ม enum value แบบไม่ลบ/สร้าง enum ใหม่ และไม่มีการแก้ข้อมูล skill ที่มีอยู่โดยอัตโนมัติ
- ไม่เพิ่ม provider call, credit behavior, auth behavior หรือ dependency ใหม่
- การเปลี่ยน category ใน Admin จะใช้ execution-mode compatibility guard เดิม

## Verification

- เพิ่ม/ปรับ focused tests ให้ยืนยัน metadata ของ `character_prompt_generation`
- เพิ่ม migration/journal contract test และยืนยัน category mapper รองรับทั้ง underscore และ kebab-case
- ตรวจ source contract ว่ารายการ category และคำแปลมี key ใหม่ครบทุก surface
- รัน focused Vitest และ `git diff --check`
