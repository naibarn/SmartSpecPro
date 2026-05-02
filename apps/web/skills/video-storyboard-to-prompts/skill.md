---
name: video-storyboard-to-prompts
slug: video-storyboard-to-prompts
description: Imported from Claude/OpenCode skill (video-storyboard-to-prompts-skill.zip)
category: video_prompt_generation
execution_mode: llm-only
chainTo: video-creator
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
config:
  media_studio:
    accepts_reference_images: true
---

# Storyboard → Video Prompts Skill

## Purpose

รับไอเดียจากผู้ใช้ แล้วสร้าง:

1. Storyboard 40–120 วินาที (โดยทั่วไป 8 ฉาก) เป็น “ข้อความปกติ”
2. แปลง Storyboard เป็น Video Prompt ต่อฉาก (GEN VIDEO & AUDIO) ตามเทมเพลตที่กำหนด
3. รองรับการจัดแพ็ก prompt สำหรับ Veo 3.1 บน Media Studio ครบทั้ง TEXT_2_VIDEO, FIRST_AND_LAST_FRAMES_2_VIDEO และ REFERENCE_2_VIDEO
4. รองรับโหมดเล่าข่าว (`contentMode=news_narration`) สำหรับสร้างหลาย prompt แบบ Multi Video โดยแต่ละ prompt เป็นคลิป Veo 3.1 แยกกัน

## Inputs

See `schemas/input.schema.json`

## Outputs

See `schemas/output.schema.json`

## Core Rules

- ต้องสร้าง Storyboard ก่อน แล้วค่อยสร้าง Video Prompts (ห้ามข้ามขั้น)
- Storyboard ต้องพิมพ์เป็น Text ปกติ ห้ามใส่ code block
- ความยาวรวมเป้าหมาย: 40–120 วินาที
- ไม่มีซับ ไม่มี caption/lower-third ไม่มีข้อความ/ตัวเลข/โลโก้ตัวอักษรบนจอ ไม่มี narrator (ตาม constraints ดีฟอลต์)
- วิดีโอแต่ละฉากควร 6–10 วินาที (ปรับตาม sceneCount และ targetDurationSeconds)
- Dialogue ต้องตรงกับภาษา dialogueLanguage (th/en/mixed) และเน้น lip-sync “พูดเป็นธรรมชาติ”
- ใช้ `audioPersona` เพื่อเลือก Audio Cue ของเสียงพูด: `auto_match` ให้ skill เลือกจาก use case/คาแรคเตอร์เอง; ใน `native` ทุก prompt ต้องมีบรรทัด `Audio Cue:` พร้อม cue ภาษาอังกฤษที่ resolve แล้ว แต่ใน workflow แยกเสียงให้ใช้ cue กับ `VOICEOVER SCRIPT` เท่านั้นและห้ามใส่ `Audio Cue:` ใน prompt วิดีโอ
- `Audio Cue` คือสีเสียง/Persona ส่วน `Speech Delivery` คือจังหวะพูดตามเวลา ทั้งสองบรรทัดต้องเสริมกัน ไม่ขัดกัน ถ้าเลือก Persona ที่ช้าหรือ casual ในโหมดข่าว ให้ปรับเป็น hybrid ที่ยังคงคาแรคเตอร์นั้นแต่พูดแบบ news/explainer ที่กระชับ ไม่ลากเสียง
- ใน `native` ทุก prompt ต้องมี `Sound Design:` โดยใช้ sound bed ต่ำ ๆ ชุดเดียวกันทั้งเรื่อง และใส่ได้เฉพาะ accent เล็ก ๆ ตามฉาก ห้ามดังทับเสียงพูด; ใน workflow แยกเสียงให้ใส่ sound bed ที่ `SOUND BED BRIEF:` เท่านั้น
- ต้อง sync `videoAudioWorkflow` กับ Media Studio เสมอ:
  - `native` = prompt วิดีโอมี Audio Cue, Speech Delivery, Sound Design และบทพูดตามปกติ เพื่อให้ Veo สร้างเสียงในวิดีโอ
  - `separate_voice`, `separate_music`, `separate_voice_music` = แยกเสียงออกจาก prompt วิดีโออย่างชัดเจน: ใส่ `VOICEOVER SCRIPT:` ด้านบนเมื่อ workflow มี voice และใส่ `SOUND BED BRIEF:` ด้านบนเมื่อ workflow มี music แต่ prompt block ที่ส่งสร้างวิดีโอต้องเป็น visual-only ห้ามมี `Audio Cue:`, `Speaker:`, บทพูด, `Speech Delivery:`, `Sound Design:` หรือประโยค `Only presenter voice`; อย่าสั่งให้ Veo เงียบสนิท ให้ยอมรับ neutral ambient room tone ได้เพราะ Media Studio จะ mute เสียง native ทิ้ง
  - ใน workflow แยกเสียง ให้ prompt วิดีโอบอกว่าพรีเซนเตอร์/ตัวละครเคลื่อนไหวและแสดงสีหน้าอย่างเป็นธรรมชาติ แต่ไม่พูด ไม่ขยับปากเป็นคำ และไม่สร้าง speech/dialogue/music/sound effects เพราะ voice/music จะถูก merge ใน video editor; neutral ambient room tone ยอมรับได้เพราะ Media Studio จะ mute เสียงวิดีโอเดิม
  - ในโหมดแยกเสียง ต้องทำให้บทพูดรวมทั้งเรื่องอ่านต่อเนื่องเป็น voiceover เดียวได้ธรรมชาติ และ sound bed ต้องเป็นคำอธิบายเพลง/ambience รวมทั้งเรื่อง ไม่ใช่เสียงแตกต่างกันทุกคลิป
- ห้ามสั่งให้โมเดลสร้างตัวอักษรที่อ่านได้ในภาพ เว้นแต่เปิด text overlay ชัดเจน: ห้าม subtitles, captions, lower-thirds, title cards, labels, brand names, logo ที่มีตัวอักษร, UI words, chart labels, numbers, watermark, random glyphs ให้ใช้ icon/สี/diagram/กราฟแบบไม่อ่านได้แทน
- ถ้ากำหนด maxPromptLength ให้คุมความยาวผลลัพธ์ storyboard ปกติให้อยู่ใต้ลิมิตนั้น แต่ใน `news_narration` ห้ามตัดแพ็กข่าวทั้งชุดจนเล่าไม่จบ เพราะ limit ของ Veo ต้องใช้กับแต่ละ prompt ตอน generate
- ถ้า `contentMode=news_narration`:
  - ใช้ `newsScript` เป็นต้นฉบับข่าว ถ้าว่างให้ใช้ `userIdea`
  - ต้องตั้ง Media Studio Output Type เป็น Multi Video
  - ต้อง output เป็น `PROMPT 1 (8 seconds):`, `PROMPT 2 (8 seconds):` ฯลฯ เพื่อให้ parser แยกส่งไป Kie.ai ทีละ prompt
  - ห้ามใช้หัวข้อ `SCENE 1:` ก่อน `PROMPT 1` เพราะ parser multi-video จะตัดผิด
  - ต้องคำนวณจำนวน prompt จากเนื้อหาข่าวอัตโนมัติ ไม่ใช่ยึด sceneCount แบบตายตัว โดย sceneCount เป็นแค่ค่าขั้นต่ำ/คำใบ้
  - ถ้า Media Studio ส่ง `storyboardAudioDurationSeconds` มากกว่า 0 พร้อม workflow แยกเสียง ให้ถือเป็น audio-first timing lock: ต้องสร้างจำนวน `PROMPT N (8 seconds):` ให้เท่ากับ `storyboardAudioPromptCount` พอดี เพราะระบบวัด/สร้างเสียงพูดไว้ก่อนแล้ว
  - ถ้ามี `storyboardPreparedVoiceoverScript` ให้ `VOICEOVER SCRIPT:` ต้องตรงกับสคริปต์นั้นในสาระและลำดับ อนุญาตให้ขึ้นบรรทัดใหม่เพื่อแบ่ง beat ได้ แต่ห้ามแปล/เขียนใหม่/ตัดประเด็น/เพิ่มประเด็น เพราะไฟล์เสียงถูกสร้างจากข้อความนี้แล้ว
  - ข่าวจริงต้องมีอย่างน้อย 4 prompts; ข่าว 2–5 ย่อหน้าปกติควรได้ 5–8 prompts และยาวกว่านั้นเพิ่มได้สูงสุด 12 prompts เพื่อเล่าให้จบทุกประเด็น ยกเว้น audio-first timing lock ที่ต้องทำตาม `storyboardAudioPromptCount` แม้เกิน 12 prompts
  - ถ้ามี `newsClipDensity`: `auto` ให้คำนวณตามเนื้อหา, `compact` ให้สั้นที่สุดเท่าที่ยังครบ, `detailed` ให้แตกละเอียดขึ้น แต่ความครบถ้วนสำคัญกว่า compact target เสมอ
  - ต้องใช้ `newsSpeechPace` เพื่อกำหนดจังหวะการพูด: `natural` = ธรรมชาติ, `brisk_news` = จังหวะข่าวกระชับแบบ default, `fast_social` = เร็วขึ้นแบบคลิปสั้น แต่ทุกโหมดต้องไม่ฟังดูรีบจนลิปซิงก์หลุด
  - ถ้า `videoAudioWorkflow=native` ในแต่ละ prompt ของข่าวให้ใส่บรรทัด `Audio Cue:` และ `Speech Delivery:` โดย `auto_match` ต้อง resolve เป็น News Broadcast cue เป็นค่า default และย้ำว่าผู้ประกาศพูดด้วยจังหวะข่าวที่เป็นธรรมชาติ กระชับ ไม่ลากเสียง ไม่เว้น pause ยาว และไม่พูดช้าแบบ dramatic narration
  - ถ้า `videoAudioWorkflow` เป็นโหมดแยกเสียง ห้ามใส่ `Audio Cue:`, `Speaker:`, บทพูด, `Speech Delivery:` หรือ `Sound Design:` ใน `PROMPT N` blocks; ให้รวมบทพูดทั้งหมดไว้ใน `VOICEOVER SCRIPT:` และรวมเพลง/ambience ไว้ใน `SOUND BED BRIEF:` แทน
  - ใช้ semantic beat packing สำหรับคลิป 8 วินาที: ไม่ตัดข่าวเป็นวลีสั้น ๆ แบบแข็งทื่อ ให้ rewrite เป็น 1 ประโยคเล่าข่าวที่สมบูรณ์ประมาณ 5.0–6.5 วินาที ถ้า fact สั้นเกินไปให้รวมกับรายละเอียด/ผลลัพธ์ที่เกี่ยวข้อง ถ้ายาวหรือไม่เกี่ยวกันให้แยก prompt
  - ห้ามปล่อยเงื่อนไขที่ยังไม่ resolve เช่น `unless includeTextOverlays=true` ลงไปใน prompt จริง ถ้าไม่เปิด overlay ให้เขียนห้าม on-screen text แบบตรงไปตรงมา
  - ห้ามสรุปข่าวหลายย่อหน้าเหลือ 1–2 prompts; ต้องแตกเป็น beat เช่น เปิดตัว/ชื่อ, จุดเด่น, use case, ตัวเลข/claim, caveat, สรุป
  - แต่ละ beat ต้องมีบทพูดสั้นกว่า 8 วินาที และควรไม่เกิน `maxSpokenSecondsPerClip` แต่ไม่ควรสั้นจนคลิปโล่งโดยไม่จำเป็น สำหรับข่าวไทยให้เล็ง 1 ประโยคสมบูรณ์ราว 55–110 ตัวอักษรเมื่อทำได้
  - ถ้าข่าวเป็นภาษาไทยและ `videoAudioWorkflow=native` ต้องเขียนในแต่ละ prompt ว่า `ผู้ประกาศพูดเป็นภาษาไทยว่า "..."`
  - ถ้าข่าวเป็นภาษาอังกฤษและ `videoAudioWorkflow=native` ต้องเขียนในแต่ละ prompt ว่า `The presenter speaks in English: "..."`
  - ถ้าเป็น workflow แยกเสียง ให้เขียนบทพูดภาษาไทย/อังกฤษไว้ใน `VOICEOVER SCRIPT:` เท่านั้น
  - ฉากหลังต้องมีภาพประกอบ/จอ visual wall/B-roll ที่ละเอียดและสัมพันธ์กับประเด็นข่าวของ prompt นั้น ๆ ห้ามเขียนกว้าง ๆ เช่น "ข่าวเทคโนโลยี" และต้องเป็นภาพแบบ text-free ไม่มีตัวอักษร/ตัวเลข/label/logo ให้อ่าน
  - prompt ข่าวแบบ native ต้องมี `Sound Design:` ที่คง sound bed เดิม เช่น modern newsroom/tech ambience เสียงเบา ๆ และมี transition whoosh/soft hit ได้เฉพาะเล็กน้อย; workflow แยกเสียงต้องย้ายข้อมูลนี้ไป `SOUND BED BRIEF:`
  - ต้องใช้ presenter/anchor คนเดิม ชุดเดิม สตูดิโอ/visual wall เดิม และกล้อง/แสงเดิมทุก prompt เพื่อให้วิดีโอที่สร้างแยกกันยังดูเป็น segment เดียวกัน
  - ถ้ามี `NEWS BEAT PLAN` ให้ใช้ `Beat 1 -` / `Beat 2 -` เท่านั้น ห้ามใช้ `PROMPT N`, `SCENE N`, `SHOT N`, หรือ `CLIP N` ภายใน beat plan
- ถ้า `contentMode` ไม่ใช่ `news_narration` ให้ ignore ค่า default ของ news-only fields ทั้งหมด แม้ field เหล่านั้นจะถูกส่งมาจาก schema defaults
- โมเดล Veo 3.1 ที่รองรับ:
  - `veo3_lite` = Veo 3.1 Lite (default)
  - `veo3_fast` = Veo 3.1 Fast
  - `veo3` = Veo 3.1 Quality
  - `__selected_media_studio_veo_model__` = ใช้โมเดล Veo ที่เลือกอยู่ใน Media Studio เพื่อรองรับ Veo รุ่นใหม่ในอนาคตผ่านค่า `veoProviderModel`
- Generation Modes ของ Veo 3.1:
  - `TEXT_2_VIDEO` = ไม่ต้องใช้รูปอ้างอิง
  - `FIRST_AND_LAST_FRAMES_2_VIDEO` = ต้องมีรูปที่ลากเข้า Media Studio 1–2 รูป โดย `@Image1` คือ Start frame และ `@Image2` คือ End frame เมื่อมีรูปที่สอง
  - `REFERENCE_2_VIDEO` = ต้องมีรูปที่ลากเข้า Media Studio 1–3 รูป และใช้ได้เฉพาะโมเดลตระกูล Veo แบบ Fast (`veo3_fast` สำหรับ Veo 3.1 หรือ Fast variant ของ Veo รุ่นใหม่)
- ถ้าเลือก `REFERENCE_2_VIDEO` แต่โมเดลไม่ใช่ Fast variant ให้ resolve เป็น Fast Veo model ที่พร้อมใช้ใน output และระบุใน Input Check
- Output Quality ที่รองรับคือ `720p`, `1080p`, `4K` โดย default `720p`
- aspectRatio ที่รองรับคือ `auto`, `16:9`, `9:16` โดย default `auto`
- สำหรับ `REFERENCE_2_VIDEO` ต้องใช้ aspectRatio แบบ explicit คือ `16:9` หรือ `9:16`; ถ้าเป็น `auto` ให้ resolve เป็น `16:9` เว้นแต่ brief ชี้ชัดว่าเป็นวิดีโอแนวตั้ง
- ต้องใส่ `enableTranslation` และ `enableFallback` เป็น true/false และใส่ `watermark` เฉพาะเมื่อผู้ใช้ระบุ
- ถ้ามี reference image ของตัวละคร ให้ถือเป็น identity reference และคงใบหน้า ทรงผม รูปร่าง เสื้อผ้า เครื่องประดับ ท่าทาง และของประจำตัวเดิมให้สอดคล้องทุก prompt
- ถ้ามี reference image ของสินค้า/วัตถุ/พร็อพ ให้คงรูปทรง สี วัสดุ ลวดลาย และรายละเอียดเด่นเดิมให้สอดคล้องทุก prompt
- ถ้ามี reference image ของฉาก/สถานที่ ให้คง composition perspective layout และ mood แสงเดิมให้สอดคล้องทุก prompt
- เมื่อ `reference_images` มี `@Image1`, `@Image2`, `@Image3` ให้ใช้ความสามารถ vision วิเคราะห์ภาพทุกภาพก่อนเขียน output แล้วจัด role ให้แต่ละภาพอย่างน้อยหนึ่งประเภท: character/person identity, product/brand/object, animal/prop, scene/location/background, start frame, end frame หรือ supporting visual
- ในโหมดข่าว ถ้าภาพเป็นคน/ตัวละคร ให้พิจารณาใช้เป็น presenter หรือบุคคลที่ปรากฏใน visual wall ตามความเหมาะสม; ถ้าเป็นสินค้า/โลโก้/วัตถุ ให้ใช้เป็น product/object reference ในฉากหลังหรือพร็อพ; ถ้าเป็นฉาก ให้ใช้เป็น newsroom/background/B-roll reference; ถ้าเป็นสัตว์หรือสิ่งของประกอบ ให้ใส่เป็น prop/action ที่คงรายละเอียดเด่นเดิม
- `REFERENCE NOTES` ต้องสรุปบทบาทของรูปด้วย handle ชัดเจน เช่น `@Image1 role: presenter identity`, `@Image2 role: product reference`, พร้อมรายละเอียดจาก vision ที่ต้อง preserve ห้ามเขียนว่า `none required` เมื่อมีรูปอ้างอิงจริง
- สำหรับ `TEXT_2_VIDEO` รูปที่แนบใน Media Studio เป็น visual analysis/reference สำหรับเขียน prompt เท่านั้น ไม่ต้องสั่งให้ provider ใช้ `imageUrls`; สำหรับ `FIRST_AND_LAST_FRAMES_2_VIDEO` และ `REFERENCE_2_VIDEO` ให้เขียนบทบาทของ `@ImageN` ให้ตรงกับรูปที่จะส่งไปสร้างวิดีโอ
- ต้องสร้าง `REFERENCE NOTES` และ `CONTINUITY NOTES` จากตัว skill เสมอ แล้ววางไว้ด้านบนก่อน prompt blocks เพื่อให้ Media Studio sync กลับเข้า field ได้
- ถ้า referenceNotes ว่างหรือสั้นเกินไป ให้ตัว skill สร้าง/ขยาย visual reference bible เองจากไอเดีย ข่าว และภาพอ้างอิง แล้ววางเป็นย่อหน้า `REFERENCE NOTES` ด้านบน ห้ามเขียนแค่ข้อความว่าไม่มีรูปอ้างอิงโดยไม่มีข้อมูลใช้งาน
- ถ้า continuityNotes ว่างหรือสั้นเกินไป ให้ตัว skill สร้าง/ขยาย story continuity bible เอง โดยระบุ character/presenter identity, wardrobe, props, setting, lighting, style, camera language, story arc, transition logic และ `Continuity Lock` ที่ต้องใช้ซ้ำทุก prompt
- ทุก prompt ต้องมี `Continuity Lock:` ที่ใช้ phrase เดียวกันจาก `CONTINUITY NOTES` และมี action/progression เฉพาะของ prompt นั้น เพื่อให้วิดีโอที่สร้างแยกกันต่อเนื่องเป็นเรื่องเดียวกัน
- ถ้ามีข้อความ/ตัวอักษร/โลโก้อยู่ในภาพ ให้คงไว้เฉพาะกรณีที่ผู้ใช้ระบุชัดว่าต้องการรักษาข้อความนั้น
- ต้องเคารพ backgroundMode:
  - normal = พื้นหลังฉากปกติให้สอดคล้องกับเรื่อง
  - green_screen = พื้นหลังเขียวล้วนแบบ chroma key ทุกฉาก
- ทุกฉากใน `native` ต้องมี: Speaker, Dialogue, Emotion, Body movement, Action, Object/Villain reaction (ถ้ามี), Environment reaction, Camera, Lighting, Sound Design และข้อห้าม (no subtitles / no captions / no readable text or numbers / no narrator)
- ทุกฉากใน workflow แยกเสียงต้องมีเฉพาะข้อมูลภาพ: Continuity Lock, style/duration, visual action, emotion/gesture, background visuals, camera, lighting, transition และข้อห้าม text/audio โดยห้ามฝังคำสั่งเสียงใน prompt block
- บทพูดต้องยาวพอดีกับความยาวฉาก: ใช้ประมาณ 60–75% ของเวลาฉากสำหรับเสียงพูด และเหลือเวลาไว้สำหรับการตอบสนอง/การเคลื่อนไหว/จังหวะกล้อง
- ถ้าฉากสั้นมาก โดยเฉพาะ 4–8 วินาที ให้ใช้บทพูดสั้นมาก 1 ประโยคสั้นหรือ 1 วลีเท่านั้น หลีกเลี่ยง monologue หรือประโยคยาวหลายท่อน
- ถ้าข้อมูลที่ต้องสื่อมีเยอะกว่าที่ฉากรองรับได้ ให้แบ่งไปฉากถัดไปแทนการยัดบทพูดให้ยาวเกินไป
- ให้คิดเป็น “speech budget” ต่อฉากเสมอ: ฉากยิ่งสั้น บทพูดต้องยิ่งสั้น และถ้าคลิปเป็น Veo 3.1 หรือแพลตฟอร์มที่คลิปสั้น ให้กระชับเป็นพิเศษ
- ถ้าต้องเลือกระหว่างใส่รายละเอียดภาพเพิ่มกับทำให้บทพูดยาวเกินเวลา ให้ตัดบทพูดก่อน แล้วคง visual action ไว้แทน
- ให้เขียน speech budget ออกมาเป็นบรรทัดชัดเจนในผลลัพธ์ของแต่ละฉาก เช่น "Dialogue Budget: 1 short sentence, ~5-6 seconds max" เพื่อบังคับจังหวะพูดให้สอดคล้องกับคลิป
- ตัวอย่าง speech budget ตามความยาวฉาก:
  - 4 วินาที: `Dialogue Budget: 1 short clause, ~3 seconds max`
  - 6 วินาที: `Dialogue Budget: 1 short sentence, ~4-5 seconds max`
  - 8 วินาที: `Dialogue Budget: 1 short sentence, ~5-6 seconds max`
  - 10 วินาที: `Dialogue Budget: 1 short sentence + brief reaction beat, ~7 seconds max`
- ถ้า dialogueLanguage เป็นไทย ให้คงหลักเดิมแต่เขียนเป็นคำไทยได้ เช่น `1 วลีสั้น` หรือ `1 ประโยคสั้น` ส่วนภาษาอังกฤษใช้ `short clause` / `short sentence`
- ให้คำนวณ base scene duration ก่อนจาก targetDurationSeconds ÷ sceneCount แล้วค่อยคำนวณ speech budget เป็นประมาณ 65–70% ของค่านั้น จากนั้นเขียนค่าออกมาเป็นข้อความชัดเจนในแต่ละ prompt
- ถ้าคำนวณได้ ให้เขียนเป็นตัวเลขประมาณจริงใน 0.5 วินาที เช่น `~4.5 seconds max`, `~5.0 seconds max`, `~6.5 seconds max`
- ถ้า dialogueLanguage เป็นไทย ให้เขียน budget label เป็น `~4.5 วินาที max`; ถ้าเป็นอังกฤษให้ใช้ `~4.5 seconds max`; ถ้าเป็น mixed ให้ผสมได้ แต่ควรยังอ่านง่ายในบรรทัดเดียว

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

ต่อฉากให้เขียนเป็นบล็อก prompt พร้อมใช้ สำหรับ `native`:
"A high-quality {style} clip ({targetDurationSeconds} seconds).
Audio Cue: [resolved English cue from audioPersona, adapted if needed so it does not conflict with scene timing]
Speaker: ...
The character speaks the following {dialogueLanguage} dialogue naturally with lip-sync: "..."
Speech Delivery: [combine resolved Audio Cue with scene timing in a non-conflicting way; for news_narration, use newsSpeechPace; default brisk_news = natural, crisp presenter cadence, no dragged-out syllables, no long pauses]
Emotion: ...
Body movement: ...
Action: ...
The villain/object reaction: ...
Environment reaction: ...
Camera: ...
Lighting: ...
Background: ...
Sound Design: [same shared low-volume sound bed; optional subtle accent only, never louder than speech]
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no narrator. Only character voice."

สำหรับ `separate_voice`, `separate_music`, หรือ `separate_voice_music` ให้ใช้โครงนี้แทน:

VOICEOVER SCRIPT:
[continuous spoken script only, one line per clip or paragraph, no labels that should be spoken]

SOUND BED BRIEF:
[one consistent music/ambience brief for the whole sequence, only when workflow includes music]

PROMPT 1 (8 seconds):
Continuity Lock: ...
A high-quality {style} visual-only clip ({targetDurationSeconds} seconds).
Visual action: [presenter/character gestures naturally without speaking or lip-syncing words]
Background Visuals: ...
Continuity Transition: ...
Camera: ...
Lighting: ...
No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator, no speech, no dialogue, no lip-sync or mouth-wording. Neutral ambient room tone is acceptable because native Veo audio will be muted and replaced later.
