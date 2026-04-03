---
name: video-storyboard-to-prompts
slug: video-storyboard-to-prompts
description: Imported from Claude/OpenCode skill (video-storyboard-to-prompts-skill.zip)
category: video_prompt_generation
execution_mode: llm-only
icon: sparkles
version: 1.0.0
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 55
creditMultiplier: 1
tags:
  - claude
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
---
# Storyboard → Video Prompts Skill

## Purpose
รับไอเดียจากผู้ใช้ แล้วสร้าง:
1) Storyboard 40–120 วินาที (โดยทั่วไป 8 ฉาก) เป็น “ข้อความปกติ”
2) แปลง Storyboard เป็น Video Prompt ต่อฉาก (GEN VIDEO & AUDIO) ตามเทมเพลตที่กำหนด

## Inputs
See `schemas/input.schema.json`

## Outputs
See `schemas/output.schema.json`

## Core Rules
- ต้องสร้าง Storyboard ก่อน แล้วค่อยสร้าง Video Prompts (ห้ามข้ามขั้น)
- Storyboard ต้องพิมพ์เป็น Text ปกติ ห้ามใส่ code block
- ความยาวรวมเป้าหมาย: 40–120 วินาที
- ไม่มีซับ ไม่มีข้อความบนจอ ไม่มี narrator (ตาม constraints ดีฟอลต์)
- วิดีโอแต่ละฉากควร 6–10 วินาที (ปรับตาม sceneCount และ targetDurationSeconds)
- Dialogue ต้องตรงกับภาษา dialogueLanguage (th/en/mixed) และเน้น lip-sync “พูดเป็นธรรมชาติ”
- ถ้ากำหนด maxPromptLength ให้คุมความยาวผลลัพธ์ทั้งหมดให้อยู่ใต้ลิมิตนั้น และใช้สำนวนกระชับเป็นพิเศษเมื่อ output เป็นภาษาไทยหรือ mixed
- ถ้ามี reference image ของตัวละคร ให้ถือเป็น identity reference และคงใบหน้า ทรงผม รูปร่าง เสื้อผ้า เครื่องประดับ ท่าทาง และของประจำตัวเดิมให้สอดคล้องทุก prompt
- ถ้ามี reference image ของสินค้า/วัตถุ/พร็อพ ให้คงรูปทรง สี วัสดุ ลวดลาย และรายละเอียดเด่นเดิมให้สอดคล้องทุก prompt
- ถ้ามี reference image ของฉาก/สถานที่ ให้คง composition perspective layout และ mood แสงเดิมให้สอดคล้องทุก prompt
- ถ้า referenceNotes ว่าง ให้ตัว skill สร้าง continuity bible เองจากไอเดียและภาพอ้างอิง แล้ววางเป็นย่อหน้า "REFERENCE NOTES" ด้านบน และใช้คำเดิมนี้ซ้ำในทุก prompt
- ถ้ามีข้อความ/ตัวอักษร/โลโก้อยู่ในภาพ ให้คงไว้เฉพาะกรณีที่ผู้ใช้ระบุชัดว่าต้องการรักษาข้อความนั้น
- ต้องเคารพ backgroundMode:
  - normal = พื้นหลังฉากปกติให้สอดคล้องกับเรื่อง
  - green_screen = พื้นหลังเขียวล้วนแบบ chroma key ทุกฉาก
- ทุกฉากต้องมี: Speaker, Dialogue, Emotion, Body movement, Action, Object/Villain reaction (ถ้ามี), Environment reaction, Camera, Lighting, และข้อห้าม (no subtitles / no on-screen text / no narrator)

## Storyboard Format (must be plain text)
โครงแบบ:
- Input Check:
- User Order:
- Viral Strategy:
- Style:
- FULL STORYBOARD (SCENE 1-N):
  - Scene 1 (Hook - Pattern Interrupt):
    - Speaker:
    - Dialogue:
    - Action:
  - Scene 2...

## Video Prompt Format
ต่อฉากให้เขียนเป็นบล็อก prompt พร้อมใช้ เช่น:
"A high-quality {style} clip ({targetDurationSeconds} seconds).
Speaker: ...
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "..."
Emotion: ...
Body movement: ...
Action: ...
The villain/object reaction: ...
Environment reaction: ...
Camera: ...
Lighting: ...
Background: ...
No subtitles, no on-screen text. No narrator. Only character voice."
