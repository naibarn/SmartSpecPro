---
name: character-prompt-skill
description: Generate series-aware structured prompts and character profiles for fictional Asian/Thai leads, child flashbacks, antagonists, elders, ordinary supporting cast, and memorable secondary characters. Supports role tiers, relationships, age continuity, real-skin realism, face diversity, near-duplicate prevention, visual translation of genre/tone/world/personality, and JSON Schema output. Use when creating, varying, comparing, or stocking fictional characters for series, films, or image-generation workflows.
category: image_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Character Prompt Skill

ใช้ skill นี้เพื่อสร้าง prompt บุคคลสมมติสำหรับซีรีย์ โดยต้องรักษา “คุณภาพใบหน้า” แยกจากเสื้อผ้า แสง ฉาก และการแต่งหน้า

## Required resources

ก่อนสร้าง structured profile หรือ prompt หลายรายการ ให้ทำตามลำดับนี้:

1. ถ้ามี `series_dna` ให้อ่าน `schemas/series-dna.schema.json`
2. ถ้ามีข้อมูลตัวละคร ให้อ่าน `schemas/character-input.schema.json`
3. ถ้า input เป็น request เต็มชุด ให้อ่าน `schemas/character-prompt-request.schema.json`
4. อ่าน `schemas/character-prompt-profile.schema.json` และใช้เป็น output contract
5. อ่าน `references/series-context-processing.md` เมื่อมี `series_dna` หรือข้อมูลบุคลิก/โลกของเรื่อง
6. อ่าน `references/role-taxonomy.md` เมื่อมี role tier, ตัวละครตอนเด็ก, ตัวร้าย, ตัวรอง หรือความสัมพันธ์ระหว่างตัวละคร
7. อ่าน `references/face-quality-gate.md` ทุกครั้ง
8. อ่าน `references/diversity-and-presentation.md` เมื่อผู้ใช้ขอหลายใบหน้า หรือพูดถึงเสื้อผ้า แสง ฉาก และความโดดเด่น
9. อ่าน `references/safety-and-realism.md` เมื่อมีการระบุอายุวัยรุ่น เด็ก ความเซ็กซี่ ความสมจริง หรือการแต่งหน้า

ห้ามสร้างฟิลด์ใหม่ที่ขัดกับ JSON Schema และห้ามอ้างว่า profile ที่สร้างแล้ว “ผ่านภาพจริง” จนกว่าจะมีการตรวจผลลัพธ์หลัง render

## Series-aware input

เมื่อมี `series_dna` ห้ามสร้างใบหน้าแบบสุ่มโดยไม่อิงเรื่อง ให้ใช้ข้อมูลในซีรีย์เป็นบริบทกลางของทุกตัวละคร และใช้ข้อมูลตัวละครเป็นตัว override เฉพาะบุคคล โดยรักษาลำดับความสำคัญดังนี้:

```text
character input / visual overrides
  > series DNA
  > skill defaults
```

`series_dna` ต้องถูกนำไปใช้จริงอย่างน้อยใน 5 จุด:

- `genre` และ `tone` -> mood, expression, lighting และ emotional tension
- `storyWorld` และ `visualCulture` -> location, materials, wardrobe และ camera language
- `emotionalEngine` -> subtext ของสายตา ท่าทาง และระยะห่างระหว่างตัวละคร
- `dominantColors` และ `signatureMotifs` -> palette, separation และ scene anchors
- `beautyDirection`, `realismLevel` และ `prohibitedRepetition` -> quality gate, realism และ negative prompt

ถ้าข้อมูลใน `region_ethnicity` มี `explicit: true` ให้ใช้เป็น regional direction ตามที่ผู้ใช้ระบุ ห้ามเปลี่ยนเป็น Western beauty template และห้ามอนุมานข้อมูลชาติพันธุ์เพิ่มเติมจากใบหน้า

ต้องอ่าน `references/series-context-processing.md` เพื่อแปลง input เป็น `visual_translation` และต้องแสดง trace นี้ใน structured output เพื่อให้ตรวจได้ว่า series DNA มีผลต่อ prompt อย่างไร

### Canonical naming and lossless normalization

Series DNA input ใช้ชื่อฟิลด์แบบ camelCase ตาม `schemas/series-dna.schema.json` เช่น `storyWorld`, `emotionalEngine` และ `dominantColors` ส่วน structured profile ใช้ชื่อแบบ snake_case เช่น `story_world`, `emotional_engine` และ `dominant_colors` ให้แปลงชื่อเพื่อให้ตรง output schema แต่ห้ามตัดความหมายหรือค่าภายในทิ้ง

Character input ต้องคง `character_id`, `name`, `role`, `narrative_role`, `role_tier`, `description`, `occupation`, `personality_traits`, `relationship_to_lead`, `timeline_stage`, `adult_character_id`, `continuity_anchors`, `region_ethnicity` และ `visual_overrides` ที่มีอยู่ใน input โดย `role` เป็นป้ายบทบาทที่มนุษย์อ่านได้ ส่วน `role_tier` เป็นค่า enum สำหรับเลือก quality gate

## Workflow

### Deliverable-aware generation contract

The caller requests exactly one render deliverable per execution through
`generation.render_context`: `portrait`, `turnaround`, or `sheet:<type>`. Author
one `positive_prompt` and one `negative_prompt` for that requested deliverable
only. Do not return sibling portrait, turnaround, full-body, expression, or
outfit prompts, and do not spend reasoning on unused variants. Keep the face
blueprint and diversity signature stable across deliverables for the same
character; change only presentation details required by the requested render
context. `images_per_character` is a render count, not a reason to create
additional prompt variants.

For `portrait`, compose a single clean identity-first image prompt. For
`turnaround`, describe one coherent multi-angle reference sheet. For
`sheet:<type>`, describe one requested Character Design Bible sheet. The
structured profile remains the source of truth for the selected deliverable;
`review_status` must be `generated` until a rendered image is reviewed.

### 1. Normalize request and context

แยกคำขอเป็น:

- `narrative_role`: protagonist, co_protagonist, antagonist, supporting หรือ love_interest
- `role_tier`: lead_male, lead_female, protagonist, child_hero, child_heroine, antagonist_male, antagonist_female, supporting_male, supporting_female, elder_patriarch, elder_matriarch, support_memorable หรือ support_general
- `relationship_to_lead`: เช่น younger_brother_of_heroine, younger_sister_of_heroine, heroine_best_friend หรือ custom
- `timeline_stage`: present_day, flashback_child หรือ flashback_teen
- `age_band`: child_6_12, teen_13_17 หรือกลุ่ม adult ที่เหมาะสม
- `gender_presentation`
- `region_direction`: ใช้ `thai_contemporary` หรือ `east_asian_contemporary` เมื่อผู้ใช้ต้องการใบหน้าเอเชียร่วมสมัย
- จำนวนภาพ/ตัวละคร
- mood, scene, wardrobe, makeup, lighting และ camera
- ระดับความเป็นธรรมชาติและข้อจำกัดพิเศษ

ถ้ามี `series_dna` ให้เก็บค่าเรื่องไว้ครบก่อนย่อความหมาย ห้ามทิ้ง `emotionalEngine`, `signatureMotifs` หรือ `prohibitedRepetition` เพราะเป็นข้อมูลที่ทำให้ตัวละครไม่กลายเป็น stock image ทั่วไป

ถ้ามี `character` ให้แยก:

- identity: name, age/age_band, role_tier, narrative_role, relationship_to_lead, timeline_stage, region_ethnicity
- story function: description, occupation และ personality_traits
- visual overrides: face, hair, wardrobe, makeup และ expression direction

ถ้าเป็นตัวละครเด็กตอนเด็ก ให้เก็บ `adult_character_id` และ `continuity_anchors` ถ้ามี เพื่อให้วัยเด็กเชื่อมกับตัวละครโตขึ้นโดยไม่ทำให้ดูเป็นผู้ใหญ่ตัวเล็ก

ถ้าอายุระบุชัดใน `description` แต่ไม่มีฟิลด์ `age` ให้สกัดอายุเป็น internal value และคำนวณ `age_band` ให้ตรงกันได้ โดยตั้ง `age_ok` เป็น true เมื่อช่วงอายุชัดเจนและอยู่ในขอบเขต schema; ให้ตั้ง `age_ok` เป็น false และขอข้อมูลเพิ่มเฉพาะเมื่ออายุคลุมเครือ ขัดกัน หรืออยู่นอกขอบเขต

ถ้าผู้ใช้ไม่ได้ระบุรายละเอียด ให้เลือกค่าแบบร่วมสมัยเอเชียและถามเฉพาะสิ่งที่จำเป็นจริง ๆ เท่านั้น

### 2. Translate series and character into visual direction

ก่อนสร้าง prompt ให้สร้าง internal mapping อย่างน้อย 5 รายการ:

```text
tone -> lighting / contrast / expression
storyWorld -> environment / props / wardrobe materials
emotionalEngine -> gaze / posture / relationship subtext
character description -> visible behavior / styling logic
dominantColors + motifs -> palette / separation / recurring anchors
```

ตัวอย่าง romantic legal thriller ในกรุงเทพ: ใช้ charcoal, amber, deep teal, rain reflections, old wood, glass, city lights และ legal-document props ได้ แต่ต้องคงใบหน้าพระเอก/นางเอกให้อบอุ่น เข้าถึงได้ และไม่เป็น villain-coded lead

ห้ามให้ `genre` หรือ `tone` เป็นคำสั่งเปลี่ยนโครงหน้าโดยตรง ความตึงเครียดควรไปอยู่ที่สายตา ท่าทาง framing แสง และบริบท

### 3. Resolve role-specific quality gate

ใช้ `references/role-taxonomy.md` เลือก gate ก่อนสร้างใบหน้า:

- lead/protagonist: ใช้ lead face gate เต็มระดับ
- child_hero/child_heroine: ใช้ child-safe face gate และ continuity anchors
- antagonist_male/antagonist_female: รักษาความน่าดึงดูด แต่เพิ่ม threat ผ่าน expression, styling และ light
- supporting_male/supporting_female: ต้องจำง่ายและผ่านคุณภาพ แต่ลด first-impression เมื่อเทียบกับตัวหลัก
- elder_patriarch/elder_matriarch: ใช้เกณฑ์ตัวประกอบอาวุโส ใบหน้าธรรมดาที่สมจริงตามวัย มีริ้วรอย ผมหงอก และร่องรอยอาชีพ/สภาพแวดล้อม ไม่ยกระดับให้เป็นใบหน้าพระเอกหรือนางเอก
- support_memorable: ใช้ใบหน้าคนทั่วไปที่อ่านบทบาทได้ และมีจุดจำ 1–2 จุดจากคิ้ว รอยยิ้ม แว่น ทรงผม หรือพร็อพ ไม่ใช่ความงามแบบนักแสดงนำ
- support_general: ใช้ใบหน้าคนทั่วไปที่น่าเชื่อถือและไม่แย่งความสนใจจากตัวละครหลัก ให้ความสำคัญกับอายุ อาชีพ ภูมิภาค และความสัมพันธ์กับฉาก

ตรวจ role compatibility ก่อนสร้าง prompt: `elder_patriarch`, `elder_matriarch`, `support_memorable` และ `support_general` ต้องใช้ `narrative_role: supporting` (หรือบทบาทที่เทียบเท่าซึ่งผู้ใช้ระบุชัด); `child_hero`/`child_heroine` ต้องมี child/teen age band และ timeline flashback ที่สอดคล้อง; `lead_male`/`lead_female` และ `antagonist_male`/`antagonist_female` ต้องไม่ถูกจับคู่กับ child mode โดยอัตโนมัติ หากขัดกันให้รายงาน conflict ก่อนสร้างภาพ

ตัวประกอบไม่จำเป็นต้องผ่าน lead beauty gate: ห้าม reject เพียงเพราะไม่ได้กรามเรียว ใบหน้าคม หรือมี first-impression สูงแบบพระเอกนางเอก แต่ยังต้องผ่าน anatomy, age realism, natural skin, regional direction และบทบาทในฉาก ตัวประกอบอาวุโสต้องดูเป็นคนอายุจริง ไม่ใช่ใบหน้าหนุ่มสาวที่เติมริ้วรอยด้วยฟิลเตอร์

ตัวละครพี่น้องควรมี shared anchors 1–2 จุดและ face axes ต่างกันอย่างน้อย 2–3 แกน ส่วนเพื่อนสนิทควรมี contrast ที่อ่านออก

### 4. Build Face Blueprint first

เลือกโครงหน้าและรายละเอียดใบหน้าก่อนเลือก styling เสมอ สำหรับ hero/heroine ต้องผ่าน hard gate ใน `references/face-quality-gate.md`

อย่างน้อยต้องระบุความแตกต่างของใบหน้า 3 แกนจากรายการนี้:

- face family และสัดส่วนยาว/กว้าง
- jaw/chin profile
- eye geometry
- forehead/brow
- nose geometry
- mouth geometry
- cheek/lower-face profile
- distinctive detail

ห้ามนับทรงผม เสื้อผ้า ฉาก หรือสีแสงเป็นความแตกต่างของใบหน้า

### 5. Build Presentation Profile

หลังจากโครงหน้าผ่าน gate แล้ว จึงเลือก:

- ทรงผมและการแต่งหน้า
- เสื้อผ้าที่ช่วยแยกตัวละครออกจากฉาก
- แสงที่สร้างมิติและ rim separation
- pose/expression ที่ทำให้บทบาทอ่านออก
- ฉากและ composition

เสื้อผ้า แสง หรือความเซ็กซี่เล็กน้อยช่วยเพิ่ม presentation quality ได้ แต่ห้ามใช้กู้ใบหน้าที่กรามใหญ่ หน้าเหลี่ยม คางทู่ หรือ lower third หนัก

### 6. Compose prompts

สร้าง `positive_prompt` ตามลำดับ:

```text
subject/age -> role -> region direction -> face blueprint -> hair/makeup
-> wardrobe -> expression/pose -> lighting/environment -> camera
-> realistic skin/material requirements
```

สร้าง `negative_prompt` ให้ครอบคลุม:

- broad square jaw, heavy jawline, wide lower face, broad blunt chin
- plastic skin, porcelain skin, waxy face, paper-flat skin, airbrushed skin
- generic influencer face, repeated facial template, identical face
- ทุกค่าจาก `series_dna.prohibitedRepetition` ที่ไม่ต้องการให้เกิด
- visual patterns ที่ขัดกับ `storyWorld` หรือ `visualCulture` เช่น generic CEO suit เมื่อเรื่องกำหนดทนายในสำนักงานกฎหมายเก่าแก่
- anatomy/artifact errors
- age-inappropriate or sexualized styling when `teen_13_17`
- adult makeup, adult glamour or sexualized styling when `child_6_12` or `teen_13_17`
- adult facial proportions or adult body styling in child flashbacks

ใช้ถ้อยคำที่สื่อถึงคนจริง เช่น natural pores, subtle asymmetry, fine tonal variation, realistic facial planes และ physically plausible lighting

สำหรับ `elder_*`, `support_memorable` และ `support_general` ให้เปลี่ยนคุณภาพเป้าหมายจาก lead beauty เป็น ordinary believable face, age accuracy, role readability และ controlled visual dominance; ห้ามใช้เสื้อผ้า แสง หรือ makeup เพื่อยกระดับใบหน้าธรรมดาให้กลายเป็นนักแสดงนำโดยไม่สอดคล้องกับบท

### 7. Validate before returning

ตรวจทั้งเชิงเนื้อหาและเชิง schema:

- ชนิดข้อมูลและ enum ต้องตรงกับ JSON Schema
- ถ้าใช้ camelCase input ต้องแปลงเป็น output naming convention แบบไม่สูญเสียค่า และคง `character_id`/`role` ไว้เมื่อมีใน input
- ถ้ามี `quality_gate` ต้องสอดคล้องกับ `role_tier`, `narrative_role`, `age_band` และ `safety_mode`; profile รุ่นเก่าที่ไม่มีฟิลด์นี้ยัง validate ได้เพื่อรักษา backward compatibility
- `heroine` ต้องไม่ใช้ jaw/chin ที่ขัดกับ hard gate
- `child_hero`/`child_heroine` ต้องใช้ child-safe mode และ timeline/age ที่สอดคล้องกัน
- `antagonist_male`/`antagonist_female` ต้องไม่ใช้ villain face ที่บิดเบี้ยวหรือ stereotype
- supporting relationships ต้องสะท้อนใน wardrobe, expression, blocking และ continuity/contrast rules
- `teen_13_17` ต้องใช้ `teen_age_appropriate`
- adult tasteful allure ใช้ได้เฉพาะ adult mode
- `positive_prompt` และ `negative_prompt` ต้องไม่ขัดแย้งกัน
- หลายใบหน้าต้องมี `diversity_signature` แตกต่างกัน
- ต้องมี `series_context`, `character_identity` และ `visual_translation` ถ้า input มี Series DNA/Character Input
- ตรวจว่า `prohibitedRepetition` ถูกนำไปใช้ใน negative prompt หรือ rejection rule
- ตรวจว่า `region_ethnicity.explicit` ถูกสะท้อนใน `region_direction` และ prompt
- ตั้ง `review_status` เป็น `generated` จนกว่าจะตรวจภาพจริง

### 8. Return result

ส่งผลลัพธ์ 2 ชั้น:

1. Prompt cards ที่คนอ่านและนำไปใช้ได้ทันที
2. JSON structured profiles ที่ validate ตาม schema ได้

สำหรับ profile ที่สร้างใหม่ ให้ใส่ `quality_gate` เพื่อบันทึกว่าใช้ gate แบบ lead, child, antagonist, elder, support_memorable หรือ support_general แม้ schema จะเปิดให้ profile รุ่นเก่ายังใช้งานได้

ในแต่ละ profile ให้แสดง `visual_translation` สั้น ๆ ว่า:

- tone ถูกแปลงเป็นแสง/อารมณ์อย่างไร
- story world ถูกแปลงเป็นฉาก/วัสดุอย่างไร
- emotional engine ถูกแปลงเป็นสายตา/ท่าทางอย่างไร
- character description ถูกแปลงเป็น wardrobe/behavior อย่างไร
- ข้อห้ามใดถูกใส่ใน negative prompt

เมื่อสร้างหลายแบบ ให้สรุปจำนวน face family และแกนที่แตกต่างกันด้วย ถ้าเป็นชุด 50–100 แบบ ให้แบ่ง batch และบอกว่าแต่ละ batch ต้องผ่าน manual visual review ก่อนรวมเข้า stock

## Hard quality policy

- ตัวละครหลักต้องดูเด่นตั้งแต่ภาพแรก แต่ไม่ใช่ความงามแบบ Western โดยอัตโนมัติ
- ให้คงความเป็นคนไทย/เอเชียร่วมสมัยตามที่ผู้ใช้ขอ
- ผิวต้องมี texture และมิติ ไม่เรียบเป็นกระดาษหรือพลาสติก
- ใบหน้าที่ไม่ผ่าน hard gate ต้องเป็น `reject_face` หรือ `pass_supporting` ไม่ควรยกระดับด้วยฉากหรือแสง
- `approved` หมายถึงผู้ใช้หรือผู้ตรวจยืนยันจากภาพที่ render แล้วเท่านั้น
- ตัวละครเด็กตอนเด็กให้ประเมิน “ความสำคัญและความน่าติดตามของตัวละคร” แยกจากมาตรฐานความสวยแบบผู้ใหญ่

## Safety policy

บุคคลอายุ 13–17 ปีต้องอยู่ใน teen mode และบุคคลอายุ 6–12 ปีต้องอยู่ใน child mode: เสื้อผ้าและท่าทางเหมาะกับวัย บริบทโรงเรียน/บ้าน/กิจกรรมวัยรุ่นหรือครอบครัว และไม่มีการเน้นเรื่องเพศหรือ styling แบบผู้ใหญ่

สำหรับ `child_hero` และ `child_heroine` ให้สร้าง flashback ที่ดูเป็นเด็กจริง มี continuity anchors กับตัวละครโตได้ แต่ห้ามใช้ adult makeup, adult glamour, revealing clothing หรือทำให้ดูเป็นผู้ใหญ่ตัวเล็ก

ห้ามจำลองหรือระบุตัวบุคคลจริง ห้ามใช้คำอธิบายเพื่ออนุมานเชื้อชาติ บุคลิก สุขภาพ หรืออัตลักษณ์จากภาพจริง ให้ใช้เป็นการออกแบบตัวละครสมมติเท่านั้น
