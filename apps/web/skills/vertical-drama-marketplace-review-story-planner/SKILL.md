---
name: Vertical Drama Marketplace Review Story Planner
description: Turn Marketplace product evidence, customer journey, selected characters and real footage guidance into three editable, human-readable drama tie-in episode ideas.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: sparkles
tags:
  - vertical-drama
  - marketplace
  - tie-in
  - footage-first
  - story
---
# Vertical Drama Marketplace → ซีรีย์ Tie-in รีวิว

สร้างไอเดียตอนพิเศษที่ดูเหมือนละครซีรีย์ตอนหนึ่งจริง ๆ ไม่ใช่โฆษณา ไม่ใช่การยืนถือสินค้าแล้วพูดรีวิว และไม่ใช่รายการ bullet สรุปสรรพคุณ สินค้าต้องเข้ามาในเหตุการณ์เพราะตัวละครมีปัญหา ความต้องการ หรือความสัมพันธ์ที่ทำให้ต้องหยิบมาใช้ แล้วเรื่องต้องเดินต่อจนมีจังหวะคลี่คลายอย่างเป็นธรรมชาติ

ใช้เฉพาะรายละเอียดสินค้า ภาพ managed media, customer journey, ตัวละครที่เลือก, DNA, ความสัมพันธ์ และ `footageGuide` ที่ผู้เรียกส่งมา ห้ามดึงตัวละครอื่นเข้ามาเอง

ส่ง JSON object เดียวตาม schema ของผู้เรียก โดยมี `schemaVersion: 1` และ `ideas` จำนวน 3 ใบที่แตกต่างกันจริง ทุกใบต้องมีเรื่อง `episodeStory` เป็นร้อยแก้วภาษาไทยอย่างน้อย 3 ย่อหน้า ตั้งแต่เปิดปัญหา การปรากฏและการใช้งานสินค้า ปฏิกิริยาของตัวละคร จนถึงการคลี่คลาย พร้อม scene, beats, actions, เหตุผลที่กล่าวถึงสินค้า, ข้อดีที่มีหลักฐาน และ claimsGuard

ถ้าเป็น `character_dialogue` ให้มีชื่อผู้พูดและบทสนทนาที่พูดได้จริง ถ้าเป็น `none` ให้ `dialogue` เป็น array ว่างและ `dialogueScript` เป็นค่าว่าง ใช้ท่าทาง สีหน้า การมอง การหยิบ การทดลอง และจังหวะตัดภาพแทน

เมื่อมี footage guide ให้ยึดเวลา ฉาก เสียงพูด ช่วงเงียบ และข้อสังเกตที่มีหลักฐาน ห้ามแต่งสิ่งที่ขัดกับ footage หรืออ้างสิ่งที่ยังตรวจไม่พบ ตัวละคร ผู้พูด และ look slot ต้องมาจากชุดที่เลือกเท่านั้น หากต้องใช้ลุคหรือฉากใหม่ให้เสนอ slot เพิ่มโดยรักษา DNA เดิม

กล่าวเฉพาะข้อดีที่ข้อมูลสินค้ารองรับ ห้ามกล่าวอ้างว่า “ดีที่สุด”, รับประกันผล, รักษาโรค, ไม่มีผลข้างเคียง, ปลอดภัย 100% หรือสร้างราคา/โปรโมชัน/คะแนนขึ้นเอง สินค้าต้องเป็นส่วนหนึ่งของเหตุการณ์ ไม่ใช่คำตอบมหัศจรรย์ และห้ามส่ง shot prompts หรือ markdown นอก JSON
