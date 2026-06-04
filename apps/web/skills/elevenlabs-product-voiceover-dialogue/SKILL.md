---
name: "ElevenLabs Product Voiceover & Dialogue"
description: Create safe, expressive product voiceover or dialogue scripts for ElevenLabs TTS from product details, storyboards, and optional product images.
category: audio_generation
version: 1.0.1
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: media-generate
strict_provider_pin: false
---
# ElevenLabs Product Voiceover & Dialogue Skill v22

Generate **plain-text** ElevenLabs-style product voiceover or dialogue for ecommerce product videos, product demos, UGC ads, storyboard narration, and category-safe product audio. Beauty and personal-care claim guards still apply when those categories appear in the source details.

## Output Contract

Return **plain text only**, never JSON, never Markdown code fences.

Final dialogue formatting rules:
- Output one spoken turn per line.
- Do not insert blank lines between dialogue turns.
- Respect `speaker_count` exactly when it is provided.
- If `speaker_count` is `1` or `"1"`, write a single-speaker voiceover as plain spoken text only. Do not prefix lines with `Speaker 1:`. Do not create `Speaker 2:` lines, listener reactions, Q&A turns, or a second persona.
- If `speaker_count` is `2`, `"2"`, or `auto`, write a two-speaker dialogue: every spoken line must start with `Speaker 1:` or `Speaker 2:`.
- Use ElevenLabs Eleven v3 bracket audio tags sparingly. Add them only when they materially guide delivery, such as the opening hook, a major reaction, a tonal turn, a pause, a breath, a whisper, or the closing call to action.
- Do not add audio tags to every line. For most scripts, 2-4 tagged lines total is enough; direct-response or dramatic scripts may use one extra non-verbal cue if it improves performance.
- Audio tags are natural-language instructions inside the spoken text, not fixed enum fields. Prefer clear English tags that describe something audible and performable.
- Choose tags that create an emotional arc: hook energy, listener reaction, reassurance/proof, and closing confidence. Avoid repeating the same tag unless the repeated delivery is intentional.
- Keep tags voice-realistic. A calm or soft voice may not perform extreme cues like shouting; use moderate delivery such as `[warmly]`, `[softly]`, `[thoughtful]`, or `[confidently]` when the voice should stay polished.
- Keep each line compact and conversational so ElevenLabs does not create long, unnatural pauses.

Preferred final output shape for `speaker_count = 1`:
[energetic] ...
...
[confidently] ...

Preferred final output shape for `speaker_count = 2` or `auto`:
Speaker 1: [playful] ...
Speaker 2: [curious] ...
Speaker 1: ...
Speaker 2: ...
Speaker 1: [excited] ...

Use natural language in the selected `output_language`. Treat `target_duration_seconds` as a real spoken-duration target, not just a maximum. For 15-55 seconds, stay concise and under the selected target. For 60-180 seconds, aim for about 80-95% of the selected duration with a fuller spoken sales arc instead of a short summary.

## Duration and Spoken-Script Contract

When the user selects a longer duration, the output must get longer and more complete. Do not make a longer-duration request shorter.

- 15-30 seconds: short hook, one key benefit, fast close.
- 45-55 seconds: hook, product fit, 2-3 grounded details, usage moment, close.
- 60-90 seconds: fuller spoken ad with hook, problem, agitation, product fit, usage moment, benefits, gentle proof, and clear CTA.
- 105-180 seconds: complete spoken script with natural sections, but still written as speakable lines, not headings.

For Thai scripts, a 90-second output should normally be around 10-14 compact spoken lines depending on delivery speed. Do not pad with filler, but do expand the actual spoken story.

If the input contains Production Director, concept, storyboard, or planning text, convert it into customer-facing spoken copy. Never output planning labels or timecodes such as `แนวคิด:`, `รายละเอียด:`, `โครงเรื่อง:`, `อารมณ์:`, `Hook:`, `CTA:`, `0-3s`, `Pain → Agitate → Relief`, or slash-separated storyboard notes. Those are source notes only; the final answer must be what the voice should say.

## Storyboard-To-Voiceover Contract

When `product_details` contains a video concept, shot-by-shot list, storyboard, timecoded beats, camera direction, scene descriptions, mood labels, overlay notes, or lines labeled like `บทพูด (ประมาณ 5 วินาที)`, treat all of that as source planning material for the video. The final answer must be the spoken voiceover or spoken dialogue that plays over the video.

- Preserve the real story order from the source: problem/context -> product enters -> main use/demo/assembly -> practical benefit -> visible result -> clear CTA.
- Write what a narrator, host, reviewer, or dialogue speakers would actually say to the audience. Do not summarize the storyboard, describe what the camera sees, or explain the production plan.
- Use each shot's `บทพูด` as message intent, not as literal visual narration. Convert visual descriptions into customer-facing spoken copy.
- Never say visual metadata such as `ภาพ:`, `มุมกล้อง:`, `อารมณ์:`, `wide angle`, `close-up`, `slow pan`, `shot`, `0-5s`, `เห็นมือกำลัง...`, or `เราจะแสดงภาพ...` unless the user explicitly asks for a production script rather than a voiceover.
- Remove repeated overlay/planning fragments such as `shot with a simple call-to-action overlay` from the spoken copy. If the fragment implies a CTA, turn it into a clean spoken next step.
- For `speaker_count = 1`, output short, unprefixed voiceover lines that follow the video beats. Do not add speaker labels.
- For `speaker_count = 2` or `auto`, make both speakers talk naturally about the unfolding problem, demo, result, and CTA. Speaker 2 should react like a real viewer or user, not read shot descriptions.
- Respect the chosen `speech_style` and `persuasion_style` in the actual wording: professional = calm and clear; friend_to_friend = everyday recommendation; energetic_host/direct_response = punchy hook and decisive CTA; luxury_polished = concise premium confidence; humorous/sarcastic = tease the situation, not the customer.
- For a 9-shot / 45-second storyboard, normally produce about 7-10 compact spoken lines, one idea per beat, unless the user requests a different duration.

Bad storyboard leakage:
```text
ภาพแรกเป็นโต๊ะข้างเตียงรก มุมกล้อง wide angle แล้วเราจะแสดงชิ้นส่วนที่แยกไว้ ก่อนปิดด้วย CTA overlay
```

Good single-speaker voiceover:
```text
[curious] ของข้างเตียงเยอะจนหยิบอะไรก็ต้องย้ายก่อนใช่ไหม?
เริ่มจากจัดชิ้นส่วนให้เห็นชัด แล้วประกอบโต๊ะ Greenforst ทีละขั้นแบบไม่ซับซ้อน
พอวางข้างเตียง โคมไฟ หนังสือ และแก้วน้ำก็มีที่ของตัวเอง
[confidently] เปลี่ยนมุมรกให้หยิบใช้สะดวกขึ้น กดดูรายละเอียดสินค้าแล้วจัดพื้นที่ให้เป็นระเบียบกว่าเดิม
```

## ElevenLabs Eleven v3 Audio Tag Direction v22

ElevenLabs Eleven v3 reads bracket tags such as `[warmly]` or `[sighs]` as natural-language performance instructions placed inside `text`. They are not a separate `mood`, `tone`, or API parameter. Put the tag immediately before the words or turn it should affect.

Good:
```text
Speaker 1: [warmly] ผิวแห้งตึงหลังล้างหน้า ฟังทางนี้ก่อน
Speaker 2: [curious] แล้วสูตรนี้ช่วยให้ฟีลหลังล้างต่างยังไง?
```

Bad:
```text
Speaker 1: [happy] สวัสดี [excited] ครับ [warmly] วันนี้ [curious] เราจะ...
```

### Tag Selection Principles

- Use English tags even when the spoken dialogue is Thai.
- Use one tag before a whole turn or a short phrase, not between every word.
- Use punctuation with tags: `...` for thinking/hesitation, `?` for curiosity, `!` for excitement, and `:` for a clean reveal.
- Use audible instructions only. Avoid visual or non-audio tags such as `[standing]`, `[grinning]`, `[pacing]`, `[looking away]`, or `[smiling]`.
- Avoid `[music]` in this dialogue skill. If the user needs background music or sound design, keep the spoken dialogue clean and let the audio tool handle music separately.
- Prefer subtle, sales-useful tags over theatrical tags unless the requested style is comedic, trailer-like, or character-led.

### High-Value Tag Palette

Use these as a practical palette, not a closed list:

- Warm trust: `[warmly]`, `[calmly]`, `[softly]`, `[gentle]`, `[professional and reassuring]`, `[calm and empathetic]`
- Sales energy: `[energetic and upbeat]`, `[excited]`, `[excitedly]`, `[cheerfully]`, `[confidently]`, `[delighted]`
- Curiosity and contrast: `[curious]`, `[curiously]`, `[intrigued]`, `[quizzically]`, `[surprised]`, `[impressed]`
- Product storytelling: `[thoughtful]`, `[low and serious]`, `[dramatically]`, `[mischievously]`, `[playful]`
- Objection or hesitation: `[slightly nervous]`, `[hesitant]`, `[cautiously]`, `[indecisive]`, `[annoyed]`
- Close/intimacy: `[whispers]`, `[whispering]`, `[soft and slow]`
- Timing and emphasis: `[slow]`, `[short pause]`, `[long pause]`, `[jumping in]`
- Non-verbal reactions: `[laughs]`, `[chuckles]`, `[giggling]`, `[sighs]`, `[frustrated sigh]`, `[happy gasp]`, `[inhales deeply]`, `[exhales]`, `[clears throat]`, `[swallows]`

### Style-to-Tag Mapping

- `energetic_host` or `direct_response`: open with `[energetic]`, `[excited]`, or `[energetic and upbeat]`; close with `[confident]` or `[confidently]`.
- `friendly`, `soft sell`, or `routine journey`: use `[warmly]`, `[calmly]`, `[softly]`, `[gentle]`, or `[thoughtful]`.
- `professional` or regulated product mode: use `[professional and reassuring]`, `[calmly]`, `[thoughtful]`, or `[slow]`; avoid exaggerated laughing, shouting, or dramatic tags.
- `humorous`, `sarcastic-light`, or `roast-but-praise`: use `[playful]`, `[mischievously]`, `[sarcastic]`, `[chuckles]`, or `[laughs]`, but keep the product credible and do not mock the customer.
- `luxury-polished` or premium trust: use `[softly]`, `[low and serious]`, `[confidently]`, `[warmly]`, or `[slow]`; avoid noisy comedy tags.
- `complaining-but-helpful`: use `[annoyed]`, `[sighs]`, `[frustrated sigh]`, then shift to `[reassuring]`, `[thoughtful]`, or `[confidently]`.

### Emotional Arc Templates

Customer-service/reassurance:
```text
Speaker 1: [calm and empathetic] ผิวช่วงนี้ไวกับอะไรใหม่ ๆ ใช่ไหม?
Speaker 2: [softly] ใช่ เลยอยากเริ่มแบบไม่เสี่ยงเกินไป
Speaker 1: [professional and reassuring] เริ่มจากใช้ตามฉลากและทดสอบก่อนใช้ จะช่วยให้รูทีนคุมง่ายขึ้น
```

Direct-response beauty ad:
```text
Speaker 1: [energetic] ล้างหน้าแล้วสะอาด แต่ผิวตึงจนไม่สบายหน้า?
Speaker 2: [intrigued] อันนี้เจอบ่อย แล้วสูตรนี้ต่างยังไง?
Speaker 1: [confidently] จุดขายคือคลีนแบบไม่ต้องเอี๊ยด เหมาะกับรูทีนที่อยากให้ผิวรู้สึกสบายหลังล้าง
```

Soft premium routine:
```text
Speaker 1: [softly] บางทีรูทีนที่ดี ไม่ต้องเร่งผิวให้เปลี่ยนในคืนเดียว
Speaker 2: [thoughtful] แค่ใช้แล้วรู้สึกสบายและดูแลต่อได้ทุกวันก็พอ
Speaker 1: [warmly] เลือกตามสภาพผิว ใช้ตามฉลาก แล้วให้ผลลัพธ์ค่อย ๆ ไปกับรูทีน
```

Comedic but credible:
```text
Speaker 1: [mischievously] ถ้าผิวพูดได้ หลังล้างหน้าอาจบอกว่าเบาหน่อยก็ได้
Speaker 2: [chuckles] ขอแบบสะอาด แต่ไม่เอี๊ยดจนหน้าตึง
Speaker 1: [confident] งั้นโฟกัสสูตรที่ให้ฟีลคลีนและสบายหลังล้างตามรายละเอียดสินค้า
```

Single-speaker announcer voiceover:
```text
[energetic] ล้างหน้าแล้วสะอาด แต่ผิวตึงจนไม่สบายหน้า?
สูตรนี้โฟกัสฟีลคลีนแบบไม่ต้องเอี๊ยด เหมาะกับรูทีนที่อยากให้ผิวรู้สึกสบายหลังล้าง
[confidently] เริ่มจากขั้นล้างหน้าที่พอดี แล้วค่อยให้สกินแคร์ขั้นต่อไปทำงานต่อ
```

### Tag Safety and Brand Fit

- For regulated, medical-adjacent, intimate-care, dental, diagnostic, scar gel, supplement, or self-sampling scripts, keep tags calm and reassuring. Do not use `[excited]` to hype medical-adjacent decisions.
- For sensitive skin, intimate care, children, pregnancy, diagnostic kits, or oral products, prefer `[calmly]`, `[thoughtful]`, `[professional and reassuring]`, `[slow]`, and `[softly]`.
- Use non-verbal tags only when they sound natural in a spoken ad. One `[sighs]`, `[chuckles]`, `[happy gasp]`, or `[clears throat]` can add realism; several non-verbal tags in one short ad can feel gimmicky.
- Sound-effect tags such as `[applause]`, `[gentle footsteps]`, `[leaves rustling]`, `[gunshot]`, or `[explosion]` are not default for product voiceover/dialogue. Use them only if the user explicitly asks for a scene-style ad and the effect supports the voice prompt.

## Stop-Scroll Audio Rule v19

When `speech_style` is `energetic_host` or `persuasion_style` is `direct_response`, the script must sound like a short-form sales audio that can stop a scrolling listener.

Do:
- Open with a concrete pain point, tension, or curiosity hook in the first line.
- Keep the first spoken line short enough to land in about 2 seconds.
- Use punchy spoken Thai/English, not formal presenter language.
- Write for audio performance, not reading. Prefer short beats, concrete words, and clean pauses.
- For `speaker_count = 2` or `auto`, let Speaker 2 sound like a real skeptical or curious listener, not a sales assistant.
- For `speaker_count = 1`, keep the same punchy sales structure as a single unprefixed voiceover.
- Use benefit lines that are specific, sensory, and grounded in the product details.
- End with a confident next step, not a generic slogan.

Hook quality bar:
- The first line must make the listener want the second line. It should create a small unresolved question, friction, pain recognition, or surprising contrast.
- The first line should usually be a direct statement, sharp question, or contrast. Avoid soft tag-on questions like “...อยู่เหรอ?” when they weaken urgency.
- Do not use fake-grand claims, absurd exaggeration, or jokes that make the product sound unbelievable.
- If using `sarcastic_light`, the sarcasm must tease the problem or habit, not mock the customer or make the product look silly.
- For beauty/personal-care sales audio, a stronger hook usually comes from a real routine pain: tight skin after washing, greasy feel, heavy texture, dull-looking routine, confusing ingredients, rushed morning, or “clean but uncomfortable” tension.

Punchy ad-read rules for energetic/direct-response output:
- Keep most spoken turns under 85 Thai characters or 14 English words.
- Use one idea per line. Split long ingredient/benefit lists into two shorter turns.
- For `speaker_count = 2` or `auto`, Speaker 2 should use short reactions: “ใช่”, “แล้วต่างยังไง?”, “ตรงนี้แหละที่อยากรู้”, “โอเค อันนี้น่าสน”.
- Avoid soft filler: “ฟังดูดี”, “น่าสนใจนะ”, “ต้องลองแล้ว” unless followed by a sharper buying reason.
- Use 2-4 strong audio tags total. For sales energy, prefer `[energetic]`, `[intrigued]`, `[confident]`, `[confidently]`, `[excited]`, or `[energetic and upbeat]`. Avoid `[playful]` as the opening tag when the user asks for high sales impact unless the hook itself is very strong.
- Do not end with a weak curiosity line. End with a clear action or routine moment.

Do not open with generic presenter lines:
- “สวัสดีครับทุกคน”
- “วันนี้เรามี...”
- “ขอแนะนำ...”
- “คุณกำลังมองหา...อยู่หรือเปล่า”
- “Have you heard about...”
- “หน้าเบาเหมือนลอยอยู่ในอากาศ” or other floating/fictional exaggerations unless the user explicitly requests surreal comedy.

For high-energy direct response, use this structure:
1. Stop-scroll hook: one sharp problem or curiosity line.
2. If `speaker_count = 2` or `auto`, listener reaction: short, human, skeptical/curious. If `speaker_count = 1`, skip the listener reaction and continue as a single announcer.
3. Product fit: name the product and one grounded reason.
4. Proof-like details: ingredients/features from source only, softened safely.
5. Usage moment: when/how it fits the routine.
6. Closing push: clear but not exaggerated.

Example direction:
Speaker 1: [energetic] ล้างหน้าแล้วสะอาด แต่ผิวตึงจนไม่สบายหน้า?
Speaker 2: ใช่ เหมือนล้างเสร็จแล้วหน้าแห้งทันที
Speaker 1: Dr.PONG เป็นเจลล้างหน้า pH กรดอ่อน ๆ มี Ceramides และ Tea Tree Oil ตามสูตร
Speaker 2: แล้วต่างจากเจลล้างหน้าทั่วไปยังไง?
Speaker 1: [confident] จุดขายคือคลีนผิวแบบไม่ต้องเอี๊ยด เริ่มรูทีนให้ผิวรู้สึกสบายกว่า

## No Meta-Compliance Dialogue Rule v12

The final script is **customer-facing ad dialogue**, not a moderation report. Speakers must never say internal compliance instructions such as:

- “ไม่ควรนำคำเคลม…” / “ห้ามใช้คำว่า…” / “ไม่ควรเคลมว่า…”
- “This claim is risky…” / “Do not mention…” / “Avoid claiming…”
- Lists of banned words, legal checks, rule names, policy explanations, or why a claim was removed.

Compliance must happen silently during drafting. If risky details are found, rewrite them into safe, natural benefits **without explaining the rewrite to the listener**.

Bad:
```text
Speaker 2: [calm] ไม่ควรใช้คำว่า anti-hairloss หรือกระตุ้นผมใหม่ในบทพูด
```

Good:
```text
Speaker 2: [calm] ใช้เป็นรูทีนสระผมที่ช่วยให้หนังศีรษะรู้สึกสะอาด และผมดูเบาสบายขึ้น
```


## Input Options

See `schemas/input.schema.json`.

Key options:
- `output_language`: default `English`; supports Thai and popular languages.
- When `output_language` is `auto`, infer the spoken language from `ui_locale`, `browser_locale`, or `app_language` first. If the UI/app locale starts with `th`, default to Thai unless the user explicitly requests another language or the product details are overwhelmingly in another target language. If the UI/app locale is English, default to English unless the product details or user request clearly ask for Thai/another language.
- `speech_style`: professional, friendly, friend-to-friend, humorous, sarcastic-light, complaining-but-helpful, roast-but-praise, luxury-polished, soft-caring, energetic-host.
- `persuasion_style`: benefit-led, problem-solution, storytelling, review-like, educational, soft sell, direct response, humor hook, premium trust, routine journey.
- `speaker_count`: if set to `1`/`"1"`, output plain spoken text with no speaker labels. If set to `2`/`"2"` or `auto`, output two-speaker dialogue.
- `evergreen_mode`: ignore short-term promotions, discounts, giveaways, shipping policy, shop terms, review conditions, return rules, and marketplace noise unless the user explicitly asks for promo copy.
- `regulated_product_mode`: when the product is medical-adjacent, dental-adjacent, intimate-care-adjacent, or a non-cosmetic personal hygiene item, keep copy factual, cautious, and instruction-led.

## Core Dialogue Method

1. Extract product category and stable product facts from user details.
2. Remove marketplace noise: shipping, COD, vouchers, coupon, review policy, seller schedule, return policy, chat hours, packaging disputes, and platform-specific instructions.
3. Detect short-term promo info and omit it in evergreen scripts.
4. Build product journey:
   - 0-3s hook based on a real pain point or desired outcome.
   - Main usage moment.
   - Real feature/benefit from source details only.
   - Category-specific caution/disclaimer.
   - Soft call to action.
5. Insert emotions/audio tags naturally.
6. Apply bilingual claim guard silently before final output.
7. Remove all meta-compliance language from the spoken dialogue.
8. Run the internal final quality review below.
9. Repair until no banned claim, unsupported medical/brand/institutional endorsement, overclaim, unsafe instruction, compliance explanation, weak hook, awkward tag, or unsuitable wording remains.

## Internal Final Quality Review v22

Before returning the final dialogue, silently review the draft as if a second LLM editor is checking it. Do not output the review, scores, notes, or headings. Output only the repaired final dialogue.

The draft must pass all checks:
- Hook check: first line is short, concrete, and stop-scroll worthy. It is not a greeting, intro, generic product announcement, empty hype, absurd exaggeration, or joke that weakens trust.
- Sales-energy check: for `energetic_host`, `direct_response`, or `humor_hook`, the script has momentum, contrast, and a clear reason to keep listening within the first 2 lines.
- Audio-impact check: lines are short enough to read with energy; there is no long explanatory sentence that makes TTS slow down; pauses, punctuation, and non-verbal tags are useful but not cluttered; the closing line gives a clear action/routine reason.
- Voice naturalness check: lines sound speakable in real Thai/English, with no stiff presenter wording, no long ingredient dump, and no line likely to create slow unnatural TTS pacing.
- Storyboard-to-voiceover check: if the source contains shots, timecodes, camera notes, mood labels, overlays, or Production Director planning text, the final script has converted them into actual spoken voiceover/dialogue. It does not describe the images, camera movement, scene labels, storyboard structure, or production plan.
- Speaker-count check: if `speaker_count` is `1` or `"1"`, there are no speaker labels, no `Speaker 2:` lines, and no implied second persona. If `speaker_count` is `2`, `"2"`, or `auto`, Speaker 1 leads the sales idea and Speaker 2 reacts like a real listener with curiosity, skepticism, or a short objection. Speaker 2 must not become another announcer.
- Audio-tag check: tags are sparse, strong, and placed only where they improve delivery. Most scripts should use 2-4 tags total and should form a clear emotional arc. Tags must be audible/performance-based, written in English, and realistic for the voice. Remove weak, repetitive, visual-only, unsafe, or unnecessary tags.
- Wording suitability check: no insulting, over-sarcastic, creepy, shame-based, medically risky, or culturally awkward line. Humor must support the sale, not make the product sound fake.
- Claim-safety check: all claims are grounded in user-provided details and category guards. Rewrite treatment-style claims into cosmetic/routine language or omit them.
- Format check: plain text only, no Markdown fences, no blank lines. For `speaker_count = 1`, output unprefixed spoken lines with no speaker labels. For `speaker_count = 2` or `auto`, every line starts with `Speaker 1:` or `Speaker 2:`.

If any check fails, rewrite the script internally and review again. Return only the version that passes.

## Facial Cleanser Hard Claim Block v21

When the product is a facial cleanser, face wash, gel cleanser, acne-prone cleanser, sensitive-skin cleanser, or rinse-off face cleansing product, the following phrases and meanings are **hard fail** in final output. If any appear, delete or rewrite the whole line before returning.

Hard-fail Thai phrases:
- “ผิวโดนทำลาย”
- “เสริมชั้นผิวให้แข็งแรง”
- “ช่วยเสริมชั้นผิว”
- “ซ่อมเกราะผิว”
- “ฟื้นฟูเกราะผิว”
- “ไม่ทำลายชั้นผิว”
- “ไม่มีสารระคายเคือง”
- “ปราศจากสารระคายเคือง”
- “เหมาะกับผิวแพ้ง่าย” when stated as a guarantee
- “ช่วยเรื่องสิว”
- “ลดสิว”
- “สิวหาย”
- “สิวแห้งเร็ว”
- “ฆ่าเชื้อ”
- “ฆ่าเชื้อแบคทีเรีย”
- “ลดการอักเสบ”
- “ลดอักเสบ”

Hard-fail English meanings:
- repairs/restores/strengthens skin barrier as a result claim
- does not damage skin barrier as a guarantee
- no irritants / irritation-free / allergen-free as an absolute
- kills bacteria, reduces inflammation, dries acne, cures/prevents acne

Allowed replacements:
- “ผิวรู้สึกสบายหลังล้าง”
- “ล้างแล้วไม่เอี๊ยด”
- “สูตรอ่อนโยนตามฉลาก”
- “pH กรดอ่อน ๆ”
- “มี Ceramides และ Tea Tree Oil ตามสูตร”
- “มีรายการ free-from ตามที่ระบุ”
- “เหมาะกับรูทีนล้างหน้าประจำวัน” if supported by product details
- “สำหรับคนที่ไม่ชอบฟีลล้างแล้วตึง” 
- “ดูแลความรู้สึกผิวหลังล้าง” 

Bad final output:
Speaker 1: ใช่! Tea Tree Oil ช่วยฆ่าเชื้อแบคทีเรีย ลดการอักเสบให้สิวแห้งเร็วขึ้น

Good rewrite:
Speaker 1: Tea Tree Oil อยู่ในสูตรนี้ ช่วยให้ฟีลหลังล้างดูสดชื่นและคลีนขึ้น

Bad final output:
Speaker 1: pH อ่อนโยน ไม่มีสารระคายเคืองเลย

Good rewrite:
Speaker 1: pH กรดอ่อน ๆ และมีรายการ 5-free ตามที่แบรนด์ระบุ

Example of a weak hook to rewrite:
Speaker 1: [sarcastic] ล้างหน้ากับเจลล้างหน้า Dr.PONG แล้วหน้าเบาเหมือนลอยอยู่ในอากาศเหรอ?

Stronger direction:
Speaker 1: [energetic] ล้างหน้าแล้วสะอาด แต่ผิวตึงจนไม่สบายหน้า?
Speaker 2: ใช่ เหมือนล้างเสร็จแล้วหน้าแห้งทันที
Speaker 1: Dr.PONG เป็นเจลล้างหน้า pH กรดอ่อน ๆ มี Ceramides และ Tea Tree Oil ตามสูตร
Speaker 2: แล้วต่างจากเจลล้างหน้าทั่วไปยังไง?
Speaker 1: [confident] ฟีลคือคลีนแบบไม่ต้องเอี๊ยด เหมาะกับรูทีนที่อยากให้ผิวรู้สึกสบายหลังล้าง
Speaker 2: แล้วเรื่อง free-from ล่ะ?
Speaker 1: มีรายการ 5-free ตามที่แบรนด์ระบุ เริ่มล้างหน้าให้พอดี แล้วค่อยไปต่อสเต็ปบำรุง

## Universal Safety Rules

Never overstate. Do not claim guaranteed results, permanent effects, medical treatment, disease prevention, clinical superiority, competitor superiority, or brand authorization unless legally permitted and explicitly evidenced in the user-provided details.

Do not use third-party brand names as endorsement or as an authorized partnership unless the user clearly provides permission/evidence. It is acceptable to describe category-level features without amplifying brand authority.

เลขจดแจ้ง / FDA / อย. may be kept only as neutral label information, not as proof of efficacy, endorsement, safety, or superiority.

## Bilingual Claim Guard

See `claim_guard/bilingual-risk-dictionary.md`. The skill must detect Thai, English, transliterations, mixed Thai-English, misspellings, and marketing phrases.

If a risky claim appears:
- Do not repeat it directly.
- Rewrite to a softer cosmetic/personal-care framing.
- Add a category-appropriate disclaimer when needed.
- If it is a treatment/disease claim, omit it.
- For facial cleanser/acne-prone wording, always soften or remove claims such as kills bacteria, dries acne fast, reduces inflammation, prevents acne, repairs the skin barrier, safe for sensitive skin, safe for everyone, hypoallergenic guarantee, and irritation-free.
- For Thai cleanser scripts, remove or soften phrases like “ช่วยลดการอักเสบ”, “ลดสิว”, “สิวหาย”, “ฆ่าเชื้อ”, “เสริมชั้นผิวให้แข็งแรง”, “ซ่อมเกราะผิว”, “ปราศจากสารระคายเคือง”, and “ปลอดภัยกับผิวแพ้ง่าย”. Safer replacements include “ช่วยให้ผิวรู้สึกสบายขึ้น”, “ดูแลผิวหลังล้าง”, “สูตรอ่อนโยนตามฉลาก”, “เริ่มรูทีนแบบไม่เอี๊ยด”, and “มีรายการ free-from ตามที่ระบุ”.

## Category Guards v13

### Hair color / color cream / color shampoo
Allowed: shade range, helps cover grey/white hair, easier home use, developer or mixing steps if stated, ammonia-free if stated.
Avoid: prevents grey hair, prevents hair loss, regrows hair, cures dandruff/itch, safe for everyone, no stain guarantee, no scalp irritation, no hair damage, exact-color guarantee.
Caution: patch test before use; wear gloves; follow timing; avoid eyes; color varies by base hair and hair condition.

### Bath bomb / bubble bath
Allowed: foam experience, aroma, relaxation routine, use under running water, works better with strong water flow if stated.
Avoid: no tears, safe for all kids, toxic-free as absolute safety, no irritation, guaranteed foam/refund claim, hotel majority selection as proof.
Caution: avoid eyes; do not ingest; supervise children; stop if irritated; bathtub/surface staining may vary by use and surface condition.

### Face/body serum, lotion, oil, hand cream
Allowed: moisturizes, softens, reduces dry-feel, makes skin look smoother or more radiant.
Avoid: whitening, brightening as skin color change, melasma/freckle/dark-spot removal, repairs skin, anti-aging cure, anti-inflammatory, hair-loss improvement, root strengthening unless it is a permitted hair product and phrased safely.
Caution: results vary; patch test; stop if irritation; avoid broken skin.

### Glutathione / AHA / exfoliating soap
Allowed: cleansing, fresh feel, smoother-looking skin, gentle exfoliating feel if stated.
Avoid: accelerated whitening, sunburn repair, severe brightening, skin peeling guarantee, face-safe for everyone, allergy-free.
Caution: patch test; avoid eyes; use sunscreen in daytime when exfoliating ingredients are mentioned; stop if irritated.

### Sunscreen face/body
Allowed: SPF/PA stated on label, lightweight texture, daily sun-protection routine, water/sweat activity if stated but not guaranteed.
Avoid: blocks all UV, acne treatment, prevents spots/wrinkles, repairs skin, pore tightening, safe for all sensitive/acne-prone skin, no clogging guarantee, strongest/best protection.
Caution: apply generously and reapply as directed; results depend on amount used, activity, sweat, and water exposure; patch test for sensitive skin.

### Facial cleanser / mask / acne-prone or sensitive skin wording
Allowed: cleanses, hydrates, softens, skin looks fresh/smoother, free-from ingredient list if stated.
Avoid: acne cure/prevention, inflammation reduction, scar healing, collagen stimulation, anti-aging reversal, UV damage repair, hypoallergenic guarantee, allergen-free guarantee, safe for all sensitive skin.
Caution: patch test; avoid eyes; stop if irritation; consult professional for persistent skin issues.

### Shampoo / anti-hairloss / scalp care / scalp brush
Allowed: cleanses hair/scalp, hair looks fuller/has more volume, helps massage scalp, helps distribute shampoo.
Avoid: reduces hair loss as treatment, stimulates new hair growth, better than Minoxidil, treats scalp disease, cures itch, heals wounds, boosts blood circulation as medical effect.
Caution: do not use on broken/irritated scalp; stop if discomfort; consult a professional for unusual hair loss or scalp symptoms.

### Deodorant / antiperspirant / underarm cream/spray
Allowed: helps reduce odor, helps manage sweat, fresh scent, lightweight or dry feel, 24/48h as label context only if not overstated.
Avoid: sweat-free guarantee, no dark underarms, whitening, pore tightening, treats chicken skin/inflammation, no irritation, safe for everyone, organic 100% unless verified.
Caution: underarms are sensitive; stop if irritated; avoid broken/just-shaved skin; for aerosol sprays, use in well-ventilated area and keep away from flame.

### Toothpaste / whitening dental products
Allowed: helps remove surface stains, teeth look cleaner/brighter, fluoride information if provided, fresh breath.
Avoid: instant/permanent whitening, whitening from inside, repairs enamel, no sensitivity/no damage guarantee, cures gum disease, guaranteed clinical result.
Caution: use as directed; results vary; consult dentist for sensitivity, gum disease, braces, dental work, children.

### Orthodontic wax / dental appliance comfort aids
Allowed: helps cushion brackets or appliance edges, portable, easy to apply.
Avoid: prevents wounds, treats oral ulcers, medical cure, suitable for everyone, food-grade as safety proof beyond label.
Caution: temporary comfort aid; keep clean; consult orthodontist/dentist if pain, bleeding, or sores persist.

### Makeup sponge / puff / applicator
Allowed: soft touch, helps blend powder/foundation/cushion, size/shape, easy grip, cleanable if stated.
Avoid: non-irritating guarantee, suitable for all sensitive skin, antibacterial unless supported, professional flawless guarantee.
Caution: wash and dry regularly; replace when worn; stop use if skin reacts.

### Portable urine bag / travel urinal bag
Allowed: portable urine collection aid, zip-lock design, absorbent gel if stated, travel/camping/emergency use.
Avoid: medical suitability for all people, leak-proof guarantee, odor-proof guarantee, reuse encouragement without hygiene caveat, child/elderly/pregnancy medical endorsement.
Caution: single-use or follow label; seal and dispose hygienically; wash hands; caregiver/medical use should follow professional advice.

### Feminine care / sanitary pad / pantiliner / sanitary pants
Allowed: soft touch, breathable feel, helps absorb, helps reduce leakage concerns, size info.
Avoid: no leak guarantee, 100% dry, no irritation, medical postpartum safety, antibacterial claims unless verified, extreme absorbency as proof.
Caution: change regularly; choose size/flow; stop if irritation; consult professional postpartum or if symptoms occur.

### Alcohol hand sanitizer / alcohol solution
Allowed: hand-cleaning, quick-dry feel, no added fragrance/color if stated, volume, use with dispenser if stated.
Avoid: kills all germs, sterilizes, medical-grade protection, prevents disease, 100% safe.
Caution: external use only, keep away from flame/heat, avoid eyes/wounds, keep out of reach of children.

### Retainer / aligner cleansing tablets
Allowed: helps clean retainers/aligners, helps reduce odor, reaches areas brushing may miss.
Avoid: kills 99.99%, disinfects/sterilizes, prevents disease, removes all tartar.
Caution: not for oral consumption; rinse appliance thoroughly before putting back in mouth; follow dental appliance instructions.

### Ear picks / ear cleaning tools
Allowed: portable tool, stainless-steel material, storage case.
Avoid: deep-clean ear canal, removes all wax safely, medical ear hygiene guarantee.
Caution: use only around outer ear, do not insert deeply, keep away from children, consult medical professional for pain/blocked ear.

### Generic beauty accessories
Allowed: material, dimensions, convenience, storage, use cases.
Avoid: 100% satisfaction, best/cheapest, competitor comparison, guaranteed professional result.
Caution: use as intended.


## v13 Expanded Category & Risk Guards

### Acne / BHA / sulfur cleansing bars and acne-prone wording
Allowed: cleansing, fresh-feel, oil/sweat removal, ingredient presence from the label such as sulfur/BHA, gentle-use routine, rinse-off use.
Avoid: acne treatment/cure/prevention, killing C.acnes, anti-inflammatory, dermatitis relief, repairing skin barrier, enzyme inhibition, sphingolipid stimulation, “for sensitive skin safely for everyone”, guaranteed one-month result.
Caution: patch test, avoid eyes and broken/irritated skin, rinse well, reduce frequency if dry/tight, consult a professional for persistent or severe skin concerns.

### Foot scrub / callus file / body exfoliating tool
Allowed: removes dead-skin feel, helps smooth rough-looking areas, use on wet skin if stated, follow with moisturizer.
Avoid: treating cracked heels, removing corns/calluses medically, no irritation, guaranteed smoothness, safe for diabetic/poor-circulation feet.
Caution: use gently, avoid wounds/bleeding/cracked-open skin, do not over-scrub; people with diabetes, poor circulation, or foot wounds should seek professional advice.

### Perfume / fragrance / inspired scent listings
Allowed: size, scent families such as floral/fruity/powdery/fresh/warm, portable use, choose by mood.
Avoid: using famous brand names, implying authorized dupe/copy, “pheromone attraction” claims, guaranteed long-lasting, cheapest/best, counterfeit warnings as a selling hook.
Caution: patch test on fabric/skin as appropriate, avoid eyes, stop if irritated, scent performance varies by skin and environment.

### Eye mask / lip mask / under-eye patch
Allowed: cooling routine, moisturizing feel, under-eye area looks fresher/rested, lip feels softer, chill-before-use if stated.
Avoid: dark-circle removal, puffiness treatment, wrinkle reduction, collagen rebuilding, eye-fatigue medical relief, instant result.
Caution: avoid direct contact with eyes, do not use on broken/irritated skin, patch test, stop if stinging or redness.

### Multi-SKU or mixed product listings
When one listing contains many unrelated products or formulas, do not combine their claims into one “super product.” Create a neutral script about choosing the right formula and following the label, or focus only on the single selected item if the user specifies one.
Avoid: merging acne gel, melasma serum, DD cream, sunscreen, and facial serum claims into one dialogue.

### Hair tonic / hair growth serum / lash-brow serum
Allowed: scalp/hair care routine, lightweight texture, hair feels conditioned, helps hair look smoother/fuller by appearance when safely phrased.
Avoid: accelerates hair growth, regrows hair, reduces hair loss, follicle stimulation, 9x/one-week result, rebuilding cells, lash/brow growth, medical comparisons.
Caution: avoid eyes, do not use on irritated scalp/skin, stop if discomfort, seek professional advice for unusual hair loss.

### Waxing / hair-removal wax
Allowed: kit components, at-home hair-removal routine, aloe gel included if stated.
Avoid: painless, irritation-free, safe for all areas/skin, permanent hair removal.
Caution: patch test, follow temperature/use instructions, avoid wounds/sunburn/irritated skin, do not use immediately after harsh exfoliation, stop if severe irritation.

### Makeup brushes / beauty tools near eyes
Allowed: brush count, use cases, soft feel, storage/cleaning steps.
Avoid: non-irritating guarantee, safe for sensitive skin, professional result guarantee, never sheds.
Caution: clean and dry regularly; use gently near eyes; replace damaged tools.

### Brow pencil / eye makeup pencil
Allowed: shade options, creamy texture, easy draw, natural-looking brow finish, water-resistant/long-wear as label context.
Avoid: no-smudge/no-fade guarantee, sweat-proof all day, safe for everyone.
Caution: avoid direct eye contact; remove gently; performance varies with skin oil, sweat, and activity.

### Hair treatment / conditioner / treatment sachet
Allowed: helps hair feel soft, smooth, easier to comb, less frizzy-looking, conditioning ingredients.
Avoid: repairs damaged hair, UV protection as health claim, restores hair, fixes chemical damage, instant result from first use.
Caution: rinse as directed; avoid eyes/scalp irritation; results vary by hair condition.

## Repair Loop

Before final answer, check:
- plain text only
- selected output language
- no JSON braces as output wrapper
- first line hook under roughly 3 seconds
- no unsupported risky claims
- no meta-compliance phrases such as “ไม่ควรเคลม”, “ห้ามใช้คำ”, “do not mention”, “risky claim”, or banned-word lists inside the spoken dialogue
- no temporary promo details in evergreen mode
- no unsafe medical, dental, institutional, or professional endorsement
- relevant category-specific caution included
- no direct famous-brand perfume dupes or unauthorized brand comparisons
- no multi-SKU claim merging
- no storyboard leakage, visual metadata, camera notes, timecodes, overlay notes, or scene-description narration when the user asked for voiceover/dialogue
- under duration limit


## v14 Expanded Category & Risk Guards

### Steam eye mask / self-heating eye patch
Allowed: warm eye-area rest routine, aroma options, portable single-use format, approximate use time from label.
Avoid: treating headache, eye pain, dark circles, insomnia, stress, medical eye fatigue relief, safe while sleeping, safe for all users.
Caution: use only as directed; stop if too hot, stinging, or uncomfortable; avoid use over eye disease, eye injury, inflamed skin, or immediately after eye procedures unless advised by a professional.

### Intimate feminine cleanser
Allowed: external cleansing, pH value if stated, soap-free/free-from list as label information, fresh clean feel.
Avoid: treating odor/infection, balancing vaginal flora as a medical claim, safe for all sensitive skin, prevents discharge/itch, internal use.
Caution: external use only; do not use internally; stop if burning/itching/irritation occurs; consult a healthcare professional for abnormal odor, discharge, pain, pregnancy/postpartum concerns, or persistent symptoms.

### Dermocosmetic balm / sensitive-skin balm / family-use balm
Allowed: moisturizes dry-feeling skin, helps skin feel comfortable, ingredient facts such as Vitamin B5/prebiotic/madecassoside if provided, texture.
Avoid: dermatologist/doctor endorsement as sales proof, healing wounds, repairing skin barrier as medical fact, safe for babies/everyone, clinically safe for all sensitive skin.
Caution: avoid eyes and open wounds; patch test if sensitive; children/infants and intimate-area use should follow the product label or professional advice.

### Heat styling appliance / hair straightener / curler
Allowed: temperature levels, plate size, fast heating as stated, styling use cases such as straight/curve/volume.
Avoid: damage-free, hair-shine guarantee, safe for all hair types, salon result guarantee, heat protection guarantee.
Caution: use on dry hair unless label says otherwise; keep away from water; unplug after use; keep from children; use appropriate temperature and heat protection when needed.

### Earplugs / noise-reduction plugs
Allowed: sponge/PVC material, storage case, helps reduce surrounding noise, portable use.
Avoid: anti-snoring cure, sleep-disorder treatment, total noise cancellation, medical hearing protection guarantee, underwater/diving use.
Caution: insert gently and not too deep; keep clean/dry; do not use for diving unless specified; consult a professional for ear pain, infection, or blocked-ear symptoms.

### Mirrors / hair patches / simple styling accessories
Allowed: size, portability, random color/design, keeps hair away from face during makeup, lightweight convenience.
Avoid: cheapest/best, no-break guarantee, professional result guarantee, medical/skin claims.
Caution: use as intended; keep small items away from children; mirror surface can break if dropped.

### Nail adhesive tabs / peel-off nail polish / press-on accessories
Allowed: quantity, easy application, press time, peel-off/removal steps, no-lamp formula if stated.
Avoid: no nail damage, no irritation, guaranteed wear time, waterproof guarantee, salon result guarantee.
Caution: apply on clean dry nails; avoid skin and wounds; remove gently with warm water or label method; stop if irritation occurs.

### Eye makeup / mascara / brow pencil / eyelash curler
Allowed: shade options, brush/pencil design, curl/volume/look effects, water-resistant or long-wear as label context.
Avoid: exact 24h guarantee, no smudge/no clump absolute, eye-safe for everyone, celebrity/global ranking as trust point.
Caution: avoid direct eye contact; stop if eye irritation; remove gently; do not share eye products.

### Serum technology / multi-SKU active skincare listings
When a listing contains many actives and formulas, do not merge acne, melasma, pore, whitening, wrinkle, and barrier claims into one product promise. Create a neutral script about selecting the right formula and using it consistently.
Allowed: hydration, smoother-looking skin, routine fit, formula-selection guidance, label facts.
Avoid: seeing results faster/better, 11.5x absorption as efficacy proof, acne clearing, melasma reduction, whitening, pore tightening, anti-aging reversal, skin-barrier rebuilding.
Caution: patch test; introduce one formula at a time; results vary; consult a professional for persistent skin concerns.

## v15 Expanded Category & Risk Guards

### Acne cushion / longwear cushion / makeup for acne-prone skin
Allowed: shade range, coverage, oil-control look, smoother-looking makeup finish, water/sweat-resistant or longwear as label context.
Avoid: acne reduction, clinical percentage as ad promise, dermatologist research as sales proof, non-comedogenic guarantee, no-clog guarantee, safe for all acne-prone/sensitive skin, flawless skin guarantee.
Caution: remove makeup thoroughly; patch test; if acne or irritation persists, consult a qualified professional.

### Concealer / color corrector / under-eye corrector
Allowed: peach/blue/corrector color logic, medium-full coverage as makeup finish, bright-looking under-eye area, semi-matte texture, shade selection.
Avoid: erasing dark circles, treating pigmentation, all-day no-crease guarantee, covers every flaw, exact sweat/waterproof guarantee.
Caution: shade and coverage depend on skin tone, lighting, texture, and application; avoid direct eye contact.

### Urea body cream / rough dry skin cream
Allowed: urea percentage from label, moisturizes dry-feeling rough areas, elbows/knees/heels, smoother skin feel.
Avoid: fixing keratosis pilaris/chicken skin as treatment, healing cracked skin, TEWL numbers as guaranteed efficacy, pregnancy-safe claim unless handled by label/professional guidance.
Caution: avoid open wounds; patch test; stop if stinging or irritation; pregnancy/medical skin conditions should follow professional advice.

### Mouth spray / propolis oral spray
Allowed: fresh breath, mouth-feel freshness, portable use, sugar/alcohol/paraben free if stated, oral-care routine.
Avoid: treating sore throat, oral ulcers, infection, inflammation, killing bacteria as medical effect, pharynx targeting, disease prevention, safe frequent use for everyone.
Caution: use as directed; do not swallow excessively; consult a dentist/doctor if sore throat, mouth sores, pain, or odor persists.

### Retinal / retinoid / anti-aging body oil or cream
Allowed: moisturizing oil feel, smoother-looking skin, night body-care routine, ingredient presence.
Avoid: anti-aging reversal, wrinkle reduction guarantee, tightening/young skin promise, prevention of wrinkles.
Caution: follow label; avoid pregnancy/breastfeeding when the label warns; use sunscreen in daytime for retinoid/exfoliating routines; stop if irritation.

### AHA/BHA body cleanser, face wash, body solution
Allowed: cleansing, exfoliating routine, smoother-feeling skin, BHA/AHA percentage if stated, rinse-off or leave-on use instructions.
Avoid: acne treatment/cure, statistically significant acne reduction as ad promise, pore unclogging as medical effect, guaranteed brightening/whitening.
Caution: start slowly for leave-on acids; avoid face if label says body only; avoid eyes/broken skin; use sunscreen in daytime; stop if irritated.

### Hand cream with UV filters / sunscreen hand cream
Allowed: SPF/PA label facts, moisturizes hands, soft feel, daily hand-care routine, reapply after washing.
Avoid: anti-aging/rejuvenation claims, spot/freckle removal, retinol-comparison superiority, hypoallergenic guarantee.
Caution: reapply especially after washing; results vary; patch test.

### Anti-dust mite pillowcase / bedding adjacent hygiene product
Allowed: microfiber material, zip design, thread density if stated, helps reduce direct contact with dust and allergens when phrased cautiously.
Avoid: allergy reduction/treatment, 99.99% protection as guarantee, anti-bacterial/anti-fungal as medical proof, kid-safe/hypoallergenic guarantee, institutional endorsement as sales proof.
Caution: wash and care as directed; not a medical treatment; consult a healthcare professional for allergy/asthma symptoms.

### Medical/institutional/clinical/statistical proof claims
When clinical trials, dermatologist references, hospital labs, numbers such as 50%, 70.9%, 11.5x, 99.99%, or “clinically proven” appear, keep them out of spoken dialogue unless the user explicitly asks for a factual evidence script and the claim is permitted. Prefer customer-facing, product-use benefits and general variability disclaimers.

### Brand-heavy official listings
Do not amplify brand authority, global rankings, doctor/dermatologist recommendations, or “official store” as trust proof. If the brand name is necessary for product identification, keep it neutral and brief, but do not turn it into endorsement.


---

## v16 Additional Category Rules

### Medical-device scar gel / wound-adjacent products
- Use neutral language such as film-forming gel, silicone gel, clean closed/minor wound care, and label-based usage.
- Do not promise scar prevention, scar removal, infection prevention, bacterial protection, or wound healing.
- Include: use only as directed, on cleaned/appropriate skin, avoid open/unclean wounds, consult a medical professional for deep, infected, painful, or abnormal wounds.

### HPV self-sampling / diagnostic test kits
- Keep dialogue factual and service/instruction-led.
- Do not imply diagnosis, treatment, guaranteed accuracy, or replace clinician screening.
- Include: read device instructions, follow collection/shipping timing, consult healthcare professional for results or symptoms.
- Default evergreen scripts must remove clearance, price, and no-return terms.

### Hair-loss set with supplement
- Do not use hair regrowth, anti-hairloss, follicle stimulation, better-than-Minoxidil, anagen extension, or quantified hair-growth claims as sales hooks.
- If supplement is present, add food supplement warning: eat a balanced diet from all five food groups, read label, not for disease treatment/prevention, consult a professional for pregnancy, illness, or medication use.

### Scalp acne/dandruff/seborrheic-style products
- Say scalp-cleansing routine, refreshing feel, oil-control feel, flake-prone scalp care.
- Do not claim treating acne, dandruff, fungal infection, seborrheic dermatitis, inflammation, itch cure, or bacterial/fungal inhibition.
- Include professional advice for persistent redness, flakes, itch, wounds, or hair-loss symptoms.

### Intimate cleanser
- Keep to external-use cleansing, pH/free-from facts, freshness, and gentle routine.
- Do not claim treating discharge, infection, odor causes, itching, irritation, flora imbalance, bacterial overgrowth, or gynecological symptoms.

### Textile UV apparel
- Say UPF/UV label fact, coverage, lightweight comfort, outdoor layering.
- Do not promise medical sun protection, skin-damage prevention, or 99.9% absolute protection in spoken hook.
- Include: still use sunscreen and sun-safe habits for exposed skin.

### Evidence and clinical-number simplifier
- Do not turn percentages, x-times, trial counts, “doctor/dermatologist confirmed”, or “research-proven” into the spoken hook.
- Convert to practical, non-guaranteed benefits and add “ผลลัพธ์ขึ้นกับแต่ละบุคคล” where relevant.


# v17 Additional Guard Rules

## SET / Bundle Orchestration Guard
When a listing is a set or cart bundle, identify each product role before writing the dialogue. Do not merge functions into one impossible claim. Describe the set as a routine only when the steps are compatible. If the set contains a dietary supplement, include a natural consumer-facing reminder to eat a varied diet from all 5 food groups, read the label, and avoid treating the supplement as disease prevention or treatment.

## Whitening / Brightening Sets
For underarm, body, face, lip, or dental whitening language, convert to safer appearance-language such as “ผิวดูสดใสขึ้น”, “สีผิวดูสม่ำเสมอในลุคการดูแล”, “ฟันดูสะอาดขึ้นจากการดูแลคราบบนผิวฟัน”. Never promise permanent color change, instant results, or medical pigment outcomes.

## Medical-Adjacent Self-Sampling and Scar Gel
For diagnostic kits, self-sampling kits, medical-device scar gel, or regulated health products, keep the dialogue factual and process-focused. Include reading instructions, correct sample handling, and professional follow-up for results or abnormal symptoms. Do not diagnose, promise accuracy, or replace medical advice.

## Apparel / Textile UV and Support Products
For UV jackets, pillowcases, wraps, support belts, knee supports, and related textile products, describe physical features and usage conditions. Do not promise disease prevention, cure, permanent pain relief, or guaranteed UV/allergen/bacterial protection. Mention fit, correct use, washing, and professional consultation for persistent symptoms when relevant.

## No Meta-Compliance Reinforcement
Final output must never say “ไม่ควรเคลม”, “ห้ามใช้คำ”, “คำเคลมเสี่ยง”, “banned claim”, “avoid claiming”, or similar internal review language. Rewrite silently into natural ad dialogue only.


## v18: Optional Product Image Uploads

The skill now accepts optional product images through direct upload/drag-and-drop via `product_images` in `schemas/input.schema.json`.

- Images are optional; the only required field remains `product_details`.
- Users may upload up to 5 images.
- Upload must be via file picker or drag-and-drop, not URL entry.
- Use images to improve product understanding, confirm visible package/label details, and detect conflicts or risk signals.
- Product text remains the primary source. Images support the text but must not create new claims.

When images are included:

1. Analyze the product text first.
2. Inspect images for clearly visible/readable details only: product type, package size, variant, visible warnings, ingredients, usage instructions, label terms, texture, shade, scent, and expiration if readable.
3. Compare text and images. If they conflict, use conservative overlapping facts and avoid turning conflicting details into a stronger claim.
4. Treat before/after images, doctor/pharmacist imagery, certificates, awards, clinical-looking graphics, and extreme result visuals as risk signals, not proof.
5. Keep the final output as natural customer-facing plain-text dialogue. Do not mention “image analysis,” “risk check,” “ไม่ควรเคลม,” or compliance notes in the spoken dialogue.

Safe image-assisted phrasing examples:

```text
Speaker 1: [confident] จากแพ็กเกจเป็นเจลล้างหน้าขนาด 100 มล. จุดเด่นคือสูตรอ่อนโยนและ free-from list ตามฉลาก
Speaker 2: [warmly] ล้างให้สะอาดแบบไม่เล่นใหญ่ แล้วให้ผิวได้เริ่มรูทีนแบบสบาย ๆ
```

Avoid using images to say:

```text
แพทย์รับรอง, เห็นผลทันที, ขาวขึ้นจริง, รักษาสิว, ลดฝ้าถาวร, ปลอดภัยทุกคน, การันตีผล
```
