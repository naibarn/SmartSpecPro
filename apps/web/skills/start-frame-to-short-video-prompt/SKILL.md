---
name: start-frame-to-short-video-prompt
description: Imported from shared skill bundle (Start-Frame-to-Short-Video-Prompt.zip)
category: video_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: true
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
---
# Slide Start-Frame to Short Video Prompt Skill

## Purpose
Create one **concise, production-ready integrated prompt** for image-to-video generation from a single slide-like start frame. Compatible with Veo 3.1, Kling 3.0, Seedream 2, and similar models.

The input is a designed slide with text, panels, icons, cards, or photos. The prompt must prioritize readable static text while adding only subtle, realistic background motion.

## Inputs
- `start_frame_image`: exactly one image supplied by drag and drop.
- `output_language`: language code for the generated prompt text. If `custom`, use `custom_language_label`.

## Output
Return exactly one object with a single `prompt` string. The prompt must be **one compact paragraph only**. Do not create a separate negative prompt, title, explanation, score, markdown, bullet list, or analysis.

## Length target
- Normal prompt length: **90–140 words in English** or **ประมาณ 450–750 ตัวอักษรภาษาไทย**.
- Absolute maximum: **180 words** or **ไม่เกินประมาณ 950 ตัวอักษรภาษาไทย**.
- Do not list every visible text string. Refer to “all visible text” unless a short headline is essential.
- Remove repeated warnings. Combine artifact prevention into one compact sentence.

## Non-negotiable priorities
1. **Text readability first:** all visible text, numbers, icons, panels, cards, lines, badges, logos, and layout containers stay sharp, fixed, unchanged, and readable.
2. **Start-frame fidelity:** preserve composition, crop, aspect ratio, color palette, typography style, face/body appearance, object placement, and visual hierarchy.
3. **Natural motion only:** animate only believable background or photo-layer details.
4. **No semantic drift:** do not add props, characters, symbols, claims, or objects that could change the slide meaning.
5. **Single integrated prompt:** include constraints inside the same paragraph; never separate negative prompt.

## Silent image classification
Classify the uploaded image before writing, then choose the shortest applicable motion recipe.

### A. Photo + typography slide
For photographic slide backgrounds with text overlays:
- Lock text, panels, cards, icons, badges, borders, CTA bars, logos, and decorative shapes.
- Animate only natural photo elements: lamp glow, curtain/bed fabric, breathing, tiny blink, tiny hand settling.
- Camera: locked-off or very slow push-in/parallax. Text remains screen-locked.

### B. Text-only or mostly graphic slide
For flat infographic slides with no meaningful photo:
- Lock all text and layout.
- Add only subtle background ambience: soft gradient drift, paper texture, gentle shadow shift, or faint topic-matched silhouette behind text.
- Keep added ambience abstract, faint, and meaning-safe.

### C. Mixed infographic
For grids, panels, icon cards, or small photos:
- Keep structure, cards, labels, and icons stable.
- Allow tiny ambient motion only inside photo areas or background.
- Do not animate cards independently.

## Compact motion recipes
Use only 2–4 relevant motions.

### Nursery / parent / baby
Warm lamp glow, soft bedding/curtain shadow shift, baby breathing, parent tiny blink or hand settling, optional very slow push-in.

### Family / discussion
Natural breathing, tiny head/hand micro-motion, soft ambient light, mild parallax.

### Desk / planning
Tiny pen/hand micro-movement, lamp glow, paper shadow shift, mild push-in.

### Text-only / graphic
Soft gradient drift, faint paper grain movement, gentle panel shadows, optional very faint relevant background silhouette behind all text.

## Prompt formula
Write one compact paragraph using this structure:

1. Use uploaded image as exact start frame.
2. Lock all text/layout/graphic layers and preserve readability.
3. Describe the scene or slide type in one short phrase.
4. Add 2–4 scene-specific natural motions.
5. Add camera/pacing: calm 5–8 seconds, no cuts, locked or very slow push-in.
6. End with one compact prevention sentence covering: no text distortion/spelling changes/jitter/flicker, no morphing/anatomy errors/extra limbs, no distracting new objects, no special effects.

## Language rules
- Thai: write natural Thai, concise, with terms like “start frame”, “locked text layer”, or “push-in” only when useful.
- English: clear production-style English.
- Other languages: keep the same strength and brevity.
- Custom language: use it if possible.

## Quality-control gate
Before returning, silently confirm:
- Uses uploaded image as exact start frame.
- Locks text, spelling, icons, panels, cards, and layout.
- Motion is mostly background/photo-layer and realistic.
- Text-only slides use subtle supportive ambience only.
- Includes camera duration and no-cut pacing.
- Includes artifact prevention in one sentence.
- Single paragraph only, no separate negative prompt.
- Meets the length target.

If the prompt is too long, compress it by removing examples and repeated constraints, not by removing the core rules.

## Short Thai example
ใช้ภาพที่อัปโหลดเป็น start frame ตรงตัว รักษาเลย์เอาต์ สี ฟอนต์ ไอคอน กล่อง การ์ด และข้อความทั้งหมดให้คมชัด อ่านง่าย และล็อกอยู่ตำแหน่งเดิมตลอดคลิป สไลด์เป็นบรรยากาศห้องนอนเด็กที่อบอุ่น ให้ขยับเฉพาะชั้นภาพถ่ายด้านหลังอย่างสมจริง เช่น แสงโคมไฟไหวเบามาก เงาผ้าม่านนุ่มขึ้นลง เด็กหายใจช้า ๆ และผู้ปกครองมี micro-movement เล็กน้อย กล้องนิ่งหรือ push-in ช้ามาก 5–8 วินาที ไม่มีคัต ห้ามตัวอักษรบิด สั่น เบลอ เปลี่ยนคำหรือสะกดผิด ห้ามใบหน้า/มือ/นิ้วผิดรูป ห้ามเพิ่มวัตถุรบกวนหรือเอฟเฟกต์พิเศษ
