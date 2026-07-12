# Retention Hooks: ฝัง 12 หลักการ hook/open-loop/retention เข้า pipeline สร้างซีรีย์แนวตั้ง

สถานะ: ร่าง — รออนุมัติก่อนลงมือ
วันที่: 2026-07-11
ที่มา: ผู้ใช้ให้หลักการ 12 ข้อ (hook แรกช็อต, open loop, result-before-cause, change cadence,
subtitle-friendly dialogue, facts→events, retention loop ending แบบแยก genre, tie-in แบบ
problem-result) และสั่ง "วิเคราะห์เอาหลักการนี้มาใช้...ให้ลึก ให้ได้ผลจริง" + "เขียน plan แบบละเอียด"

## หลักการ 12 ข้อ (ต้นฉบับจากผู้ใช้ — เก็บไว้เป็น reference ถาวร)

1. Every episode must start with a strong visual or verbal hook within the first shot.
2. Do not start with character introduction or background explanation.
3. Each episode must contain at least one open loop.
4. Show an interesting result, problem, or contradiction before explaining the cause.
5. Every 2–3 shots should introduce a visual, emotional, or informational change.
6. Dialogue must include short subtitle-friendly lines.
7. Facts must be converted into story events, experiments, conflicts, or discoveries.
8. End each episode with a retention loop: a new question, unresolved image, clue, threat,
   promise, or emotional turn.
9. If the episode is educational, the knowledge must be discovered through action, not lecture.
10. If the episode is romance, the retention loop may be a new romantic gesture, hesitation,
    misunderstanding, or emotional almost-confession.
11. If the episode is drama, the retention loop should be a new clue, revealed secret, or
    emotional wound.
12. If the episode is tie-in product, the product must appear through a problem-result moment,
    not as a forced ad.

## ข้อเท็จจริงที่ยืนยันจากโค้ดจริงก่อนวางแผน (สำรวจ 2026-07-11)

- **`genre` มีอยู่แล้วบน series row** (`drizzle/schema.ts:20373`, varchar 100) และถูกส่งเข้า
  story-bible skills แล้วหลายจุด (`verticalDramaStoryBible.ts` — `Genre: ${params.genre}`)
  **แต่ไม่เคยไหลเข้า script-builder เลย**: `GenerateEpisodeScriptParams`
  (`verticalDramaScriptGeneration.ts:224`) ไม่มี field genre, และ
  `skills/vertical-drama-script-builder/schemas/input.schema.json` ไม่มี key `genre`
  (top-level keys ปัจจุบัน: locale, story_title, story_brief, duration_seconds,
  episode_number, episode_count, season_arc, prior_episode_recap, memory_state, characters,
  product_tie_in_policy, age_control, speech_budget, content_budget, episode_draft)
  — shotgrid ก็ไม่มีเช่นกัน ที่ call site ใน pipeline (`verticalDramaEpisodePipeline.ts`
  ~1857) มี `seriesRow` โหลดอยู่แล้ว (ใช้อ่าน locale) จึง thread genre เพิ่มได้ทันที
- **script-builder มีกฎ hook อยู่แล้วระดับบท**: "Narrative grammar — MANDATORY" ข้อ 1
  "Hook lands within the first 3 seconds... never a scene-setting establishing shot" —
  ครอบคลุมหลักการข้อ 1 บางส่วน แต่ (a) ไม่ห้าม character-intro/backstory opening ตรง ๆ
  (ข้อ 2), (b) **ไม่มีกฎฝั่ง shotgrid เลยว่า shot 1 ต้อง realize hook เป็นภาพ**
  (grep "hook|first shot|opening" ใน shotgrid skill.md เจอแค่ตัวอย่าง ไม่มี rule) —
  รอยรั่วบท→ภาพ
- **ไม่มีแนวคิด open loop / retention loop เป็น structured field**: script-builder output
  schema มี `hook`, `structure.beats[]` (power_shift / is_reversal / intensity /
  dialogue_lines / estimated_speech_seconds), `character_emotional_arcs`, `cliffhanger`,
  `product_tie_in_plan` — cliffhanger เป็น string เดียว บังคับผูกกับ reversal สุดท้าย
  = retention loop "ชนิดเดียว" จาก 6 ชนิดตามหลักการข้อ 8
- **quality-review scorecard v2 มีแกนใกล้เคียงอยู่แล้ว**: reversal_count,
  reversal_sharpness, emotion_variety, dialogue_naturalness, pacing, overall,
  hook_strength, cliffhanger_strength, continuity_consistency, tie_in_naturalness +
  `density_metrics` (deterministic facts: estimated_speech_seconds, silent_gap_count,
  duplicate_line_count, max_consecutive_same_emotion, ...) — **มี precedent ชัดเจนของ
  "deterministic fact คำนวณใน TS แล้วส่งให้ skill review"** ที่เราจะทำตาม
- **กลไก closed-loop enforcement สร้างเสร็จแล้ว**: `verticalDramaQualityLoop.ts`
  (`evaluateScorecardAgainstPolicy` + re-review + `escalated_regression`) และ
  `verticalDramaQualityReviewApply.ts` (`applyQualityReviewSuggestions` + stage-repair
  order) — กฎใหม่แค่ "เสียบแกนเพิ่ม" เข้าเครื่องเดิม ไม่ต้องสร้าง loop ใหม่
- **dialogue rules v2 ครอบคลุมข้อ 6 ไปแล้วเชิงคุณภาพ**: single source of truth อยู่ที่
  `shared/verticalDramaSeries/qualityCriteria.ts`'s `buildDialogueRulesV2Fragment()`
  (read-aloud one-idea-per-line, spoken register) — ขาดเฉพาะ **เกณฑ์ตัวเลขตรวจได้ด้วยโค้ด**
- **tie-in §13 ครอบคลุมข้อ 12 ไปแล้วครึ่งหนึ่ง**: "never a forced insert, never ad copy...
  must serve an in-scene function" — ขาด framing "problem→result moment" ที่เป็นหัวใจของข้อ 12
- **Convention การเพิ่ม prompt section ใหม่ของ repo นี้**: flag-gated + byte-identical เมื่อ
  flag ปิด (ตัวอย่าง: `speechBudgetEnabled`, `verticalDramaMultiPassQc`, scorecard v3 opt-in
  ที่ `verticalDramaEpisodeQualityReview.ts:794`) — แผนนี้ทำตามเป๊ะ
- **Skill-first mandate**: กฎ/คำสั่ง prompt ทั้งหมดต้องอยู่ใน skill.md; TypeScript ส่งเฉพาะ
  structured facts + ทำ parsing/validation ล้วน

## แนวคิดหลัก: SKILL-FIRST — LLM เป็นตัวตัดสินหลัก, ห้าม hardcode กฎเชิงสร้างสรรค์ไว้นอก skill

**หลักที่ผู้ใช้ย้ำ (2026-07-11): "แก้ไขใน skill มากกว่ามา hardcode แปะภายนอก ใช้ความฉลาดของ
LLM เป็นหลัก"** — แผนนี้จึงยึด 2 เสาหลักที่เป็น LLM ล้วน และใช้ TypeScript แค่ "นับ fact
ป้อนให้ LLM ตัดสิน" เท่านั้น ไม่ใช่ตัดสินแทน LLM

| เสา | กลไก | บทบาท |
|---|---|---|
| **A. Authoring (skill.md)** | ทุกกฎของ 12 หลักการเขียนเป็น instruction + worked example ใน skill.md; บังคับ LLM **declare ผลเป็น structured field** (open_loops, retention_loop, change_type) เพื่อให้ตรวจต่อได้ | **หลัก** — LLM เขียนตามความเข้าใจ ไม่ใช่ทำตาม template ตายตัว |
| **B. Review (quality-review skill)** | แกน scorecard ใหม่ + rubric ขยาย → LLM อ่านบท/สตอรีบอร์ดจริงแล้วให้คะแนน+ชี้ issue → เข้า apply/re-review loop เดิมที่ convergence เอง | **หลัก** — LLM เป็นผู้พิพากษาคุณภาพ |
| C. Deterministic fact (TS) | นับ fact ที่นับได้ล้วน (จำนวน open_loop, ความยาวบรรทัด, streak ช็อตนิ่ง, type ซ้ำข้ามตอน) **ส่งเป็น input ให้ review LLM อ้างอิง** — pattern เดียวกับ `density_metrics` เป๊ะ | **สนับสนุน** — ให้ LLM มี ground truth ไม่ต้องเดา ไม่ hard-fail แทน LLM |

**สิ่งที่จงใจ *ไม่* ทำ (กันหลุดไป hardcode):**
- ❌ ไม่มี TS validator ที่ hard-fail/บังคับ retry ด้วยเลขวิเศษ (เช่น "บรรทัด >42 ตัว = fail",
  "open_loop=0 = retry") — เกณฑ์พวกนี้เป็น *กฎใน skill.md* ให้ LLM ทำตาม แล้ว *review LLM*
  เป็นคนจับว่าไม่ทำตาม ผ่าน apply/re-review loop เดิม ไม่ใช่ gate ตายตัวใน TS
- ❌ ไม่ยัด prompt text / creative rule ใด ๆ ลงในโค้ด TS — โค้ดส่งแค่ structured fact
- ✅ ข้อยกเว้นเดียวที่ TS "นับ" ได้คือ fact ล้วนที่ไม่มีวิจารณญาณ (นับจำนวน, วัดความยาว) และ
  ใช้ *เป็น input ให้ LLM* เท่านั้น — ตรงกับ precedent `density_metrics` ที่มีอยู่แล้ว

หลักการตัดสิน: ทุกกฎเริ่มที่เสา A (skill.md) เสมอ → บังคับใช้จริงผ่านเสา B (review LLM + loop)
→ เสา C แค่ป้อนตัวเลขจริงให้เสา B อ้างอิง ไม่เคยตัดสินแทน

## Mapping 12 ข้อ → จุดลงมือ

| ข้อ | สถานะเดิม | เสา A: skill.md (หลัก) | เสา C: fact ป้อน review | เสา B: review LLM (หลัก) |
|---|---|---|---|---|
| 1 hook shot แรก | มีระดับบท ขาดระดับภาพ | script-builder (มีแล้ว) + **shotgrid ใหม่** | — | hook_strength (มีแล้ว, ขยาย rubric) |
| 2 ห้ามเปิดด้วย intro | implied ไม่ explicit | script-builder + shotgrid | — | รวมใน hook_strength rubric |
| 3 open loop ≥1 | ไม่มี | script-builder: `open_loops[]` ใหม่ | นับ `open_loop_count` (fact) | `open_loop_quality` ใหม่ (LLM ตัดสิน) |
| 4 result ก่อน cause | ไม่มี | script-builder + shotgrid | — | รวมใน pacing/hook rubric |
| 5 เปลี่ยนทุก 2-3 ช็อต | มีเฉพาะมิติอารมณ์ (ฝั่งตรวจ) | shotgrid: `change_type` ต่อช็อต | `max_static_streak` (fact) | `change_cadence` ใหม่ (LLM ตัดสิน) |
| 6 subtitle-friendly | มีเชิงคุณภาพ (rules v2) | (มีแล้ว) + เพิ่มกฎ "บรรทัดสั้นพอเป็น subtitle บรรทัดเดียว" | `max_line_chars` (fact ป้อน review) | dialogue_naturalness (มีแล้ว) |
| 7 facts→events | ไม่มี | script-builder (genre-conditional) | — | รวมใน retention/genre rubric |
| 8 retention loop 6 ชนิด | มีแค่ cliffhanger | script-builder: `retention_loop {type}` ใหม่ | type rotation streak (fact) | `retention_loop_quality` ใหม่ (LLM ตัดสิน) |
| 9-11 ตาม genre | genre ไม่ไหลเข้า skill เลย | **thread genre fact** + genre-conditional rules | — | review รับ genre fact ด้วย |
| 12 tie-in problem-result | มีครึ่ง (§13) | เติมกฎใน §13 เดิม | — | tie_in_naturalness (มีแล้ว, ขยาย rubric) |

## Design รายละเอียด

### Flag เดียวคุมทั้งฟีเจอร์: `verticalDramaRetentionHooks`

Tenant feature flag ใหม่ ตาม convention เดิม (`getTenantFeatureFlags`, ดูตัวอย่าง
`resolveVerticalDramaVoiceChainFlag` ใน `verticalDramaCharacters.ts` / density flags ใน
`verticalDramaEpisodes.ts`) — คุม: (a) การ render prompt section ใหม่ทุกจุด, (b) แกน scorecard
ใหม่, (c) hard-gate ของ validator ชั้น 2 (เมื่อ flag ปิด → ไม่ validate ไม่ retry เพิ่ม)
เมื่อปิด: **ทุก prompt byte-identical กับปัจจุบัน** (มี test ยืนยันตาม convention เดิม)
Deterministic metrics ที่เป็น additive field ล้วน (เช่น max_line_chars) คำนวณเสมอได้ ไม่ผูก flag

### W1: Thread `genre` เป็น structured fact (ปลดล็อกข้อ 7, 9-11)

- `GenerateEpisodeScriptParams` เพิ่ม `genre?: string | null` — `buildUserPrompt` render
  เป็น key `genre` (ตาม input.schema.json ใหม่) เฉพาะเมื่อ flag เปิด + มีค่า
- Call sites: `verticalDramaEpisodePipeline.ts` (~1857 และ ~2260) — `seriesRow` โหลดแล้ว
  แค่ select เพิ่ม `genre` แล้วส่งต่อ
- `skills/vertical-drama-script-builder/schemas/input.schema.json`: เพิ่ม `genre` (string,
  optional, free-text — เพราะคอลัมน์เป็น varchar อิสระ ไม่ใช่ enum; skill.md สอนการ map
  คำไทย/อังกฤษที่พบบ่อย เช่น "โรแมนซ์/romance", "ดราม่า/drama", "ความรู้/educational" เข้า
  พฤติกรรม 3 กลุ่มของข้อ 9-11 + default drama-like เมื่อไม่เข้ากลุ่มไหน)
- shotgrid + quality-review รับ `genre` เช่นกัน (input.schema.json + service param + render)

### W2: script-builder — open loop + retention loop + กฎเปิดเรื่อง (ข้อ 2, 3, 4, 7, 8, 9-11)

**Output schema ใหม่ (additive, optional ใน Zod เพื่อ backward-compat กับ artifact เก่า
แต่ MANDATORY ตาม skill.md เมื่อ flag เปิด — validator ชั้น 2 เป็นตัวบังคับจริง):**

```jsonc
"open_loops": [            // ≥1 เมื่อ flag เปิด
  {
    "question": "<คำถามที่ผู้ชมค้างในใจ ประโยคเดียว>",
    "planted_at_beat": 3,   // beat ที่เปิด loop
    "expected_resolution": "this_episode" | "future_episode" | "season"
  }
],
"retention_loop": {         // ตอนจบของตอน — superset ของ cliffhanger เดิม
  "type": "new_question" | "unresolved_image" | "clue" | "threat" | "promise" | "emotional_turn",
  "description": "<สิ่งที่ค้างไว้ เขียนเป็น moment ไม่ใช่ premise>",
  "ties_to_beat": 9
}
```

`cliffhanger` (string เดิม) **คงไว้ไม่แตะ** — ทุก consumer เดิม (quality review, shotgrid,
continuation) อ่านต่อได้; `retention_loop` เป็น structured companion ของมัน skill.md สั่งให้
สองอย่างสอดคล้องกัน (cliffhanger prose = การเล่า retention_loop.description แบบเต็ม)

**กฎใหม่ใน "Narrative grammar — MANDATORY" (ต่อท้ายข้อ 6 เดิม เป็นข้อ 7-10):**
- ข้อ 7 (จากหลักการ 2): "NEVER open with character introduction, backstory, or world
  explanation — beat 1 ต้องเป็นเหตุการณ์ที่กำลังเกิด ไม่ใช่การปูพื้น ชื่อ/ความสัมพันธ์/อดีต
  ของตัวละครให้ผู้ชมเรียนรู้ระหว่างเหตุการณ์ ไม่ใช่ก่อนเหตุการณ์" + ตัวอย่าง bad/good
- ข้อ 8 (จากหลักการ 4): "Result-before-cause ordering — เมื่อ beat มีเหตุ+ผล ให้โชว์ผล/
  ปัญหา/ความขัดแย้งที่เห็นได้ก่อน แล้วค่อยเฉลยเหตุ (ในภายหลังของตอน หรือตอนถัดไปผ่าน
  open loop)" + ตัวอย่าง
- ข้อ 9 (จากหลักการ 3+8): open_loops ≥1 + retention_loop MANDATORY + กฎ "อย่าใช้ type
  ซ้ำกับ `recent_retention_loop_types` ที่ให้มา ถ้าเลี่ยงได้" (รับ input fact ใหม่ —
  ดู W5 rotation)
- ข้อ 10 (จากหลักการ 7+9): genre-conditional — educational: ความรู้ต้องถูกค้นพบผ่าน action/
  experiment/conflict ไม่ใช่ตัวละคร lecture; ทุก fact แปลงเป็น story event เสมอ

**Section ใหม่ "Retention loop by genre — MANDATORY WHEN `genre` PROVIDED"** (แยก section
เพราะยาว): แนวทาง 3 กลุ่มตามหลักการ 9-11 (educational → discovery-through-action loop;
romance → gesture/hesitation/misunderstanding/almost-confession; drama → clue/secret/wound)
+ default + worked example ต่อกลุ่ม

**Tie-in §13 เดิม**: เติมย่อหน้าเดียว — "placement ต้องเป็น problem→result moment: ตัวละคร
เผชิญปัญหาที่เห็นได้ → product เกี่ยวข้องกับ result ที่เห็นได้ ห้ามโผล่แบบ static display/
กล่าวถึงลอย ๆ" + ปรับ 1 ตัวอย่าง

### W3: shotgrid — shot-1 hook + change cadence (ข้อ 1, 2, 4, 5)

**Section ใหม่ "Shot 1 hook realization — MANDATORY"**: shot 1 ต้อง realize `hook` ของบท
เป็นภาพ/เสียงที่เกิดขึ้นจริงในเฟรม (ไม่ใช่ establishing shot, ไม่ใช่ช็อตแนะนำตัวละคร);
ถ้า hook เป็น verbal → shot 1 ต้องมี dialogue/สีหน้า/ปฏิกิริยาที่ทำให้ hook นั้น "ได้ยิน/เห็น"
ภายในช็อตแรก; result-before-cause ระดับช็อต (ผลที่เห็นได้มาก่อนคำอธิบาย)

**Per-shot field ใหม่ (additive)**: `change_type: string[]` — ค่าจาก
`["visual","emotional","informational","none"]` เทียบกับช็อตก่อนหน้า (shot 1 = ทุกมิติ
โดยนิยาม) + **Section "Change cadence — MANDATORY"**: ห้ามมี 3 ช็อตติดที่ `change_type`
เป็น `["none"]` หรือซ้ำมิติเดิมล้วน; ทุกหน้าต่าง 3 ช็อตต้องมี ≥1 การเปลี่ยนจริง
(ต่อยอด `max_consecutive_same_emotion` ที่ตรวจฝั่ง review อยู่แล้ว จากมิติเดียว → 3 มิติ)

Zod schema ใน `verticalDramaStoryboardGeneration.ts` + output.schema.json อัปเดตคู่กัน

### W4: Deterministic FACTS (เสา C — ป้อน review LLM เท่านั้น, ไม่ hard-gate — ข้อ 3, 5, 6, 8)

**สำคัญ (skill-first):** module นี้ *นับ* fact ล้วน ๆ แล้ว *ป้อนให้ review LLM อ้างอิง*
เท่านั้น — **ไม่มี hard-fail / บังคับ retry ด้วยเลขวิเศษ** การบังคับใช้จริงเกิดที่ review LLM
(เสา B) + apply/re-review loop เดิม ที่ `shared/verticalDramaSeries/` (module ใหม่
`retentionFacts.ts` หรือรวมใน `qualityCriteria.ts` ตามขนาดจริง — function pure + unit test):

1. `computeSubtitleLineFacts(dialogueLines)` → `{ max_line_chars, longest_line_excerpt }`
   — แค่ *วัดความยาว* บรรทัดที่ยาวสุด (นับ grapheme ไม่ใช่ byte เพราะไทยมี combining chars)
   ส่งเป็น fact ให้ review LLM เห็นตัวเลขจริง; **ไม่มี cap ตายตัวในโค้ด** — เกณฑ์ "สั้นพอ
   เป็น subtitle บรรทัดเดียว" เป็น *กฎใน skill.md* (เสา A) และ review LLM เป็นคนตัดสินว่า
   ยาวเกินไปไหมตามบริบท (ประโยคยาวบางประโยคอ่านลื่น สั้นบางประโยคขาดจังหวะ — วิจารณญาณ ไม่ใช่เลข)
2. `computeRetentionStructureFacts(script)` → `{ open_loop_count, retention_loop_type,
   retention_loop_present }` — นับจาก field ที่ LLM declare
3. `computeShotChangeCadenceFacts(shots)` → `{ max_static_streak, windows_without_change }`
   — นับจาก `change_type` ที่ declare; cross-check กับ field จริง (emotion/camera/location)
   เป็น *fact* ("LLM ประกาศ change แต่ field ไม่ต่าง") ให้ review LLM ชี้ ไม่ auto-reject
4. `computeRetentionLoopRotation(currentType, recentTypes)` → `{ repeated_streak }`

การใช้ (ทางเดียว): ป้อนเข้า `density_metrics`-style block ใหม่ `retention_metrics` ใน
**quality-review user prompt** (pattern เดียวกับ density facts เดิมเป๊ะ) — review LLM อ้าง
ตัวเลขจริงแทนการเดา แล้ว *ตัดสินเอง* ว่าผ่าน/ไม่ผ่าน ผ่าน apply/re-review loop เดิม

**ไม่มีการ wire fact เหล่านี้เข้า generation retry loop เป็น hard-gate** (ต่างจากร่างแรก) —
เพราะนั่นคือการเอา LLM ออกจากการตัดสิน ขัดหลัก skill-first ที่ผู้ใช้ย้ำ ถ้า LLM ลืมใส่ open
loop → review LLM จับได้แล้ว apply loop สั่งแก้เอง (กลไก convergence ที่มีอยู่แล้ว)

### W5: Retention loop rotation ข้ามตอน (ข้อ 8 — กัน pattern ซ้ำ)

- Pipeline (จุดที่ประกอบ `prior_episode_recap`/memory bundle อยู่แล้ว): อ่าน
  `retention_loop.type` จาก script artifact ของ N ตอนก่อนหน้า (N=3) → ส่งเป็น input fact
  ใหม่ `recent_retention_loop_types: string[]` เข้า script-builder (input.schema.json +
  render เมื่อ flag เปิด) — ตอนเก่าที่ไม่มี field นี้ → ข้าม (array สั้นลง ไม่ error)
- skill.md (อยู่ใน W2 กฎข้อ 9): เลี่ยง type ซ้ำ 3 ตอนติด
- Validator (W4.4) นับ streak เป็น fact ให้ review — advisory ไม่ hard-fail (บาง genre
  ซ้ำ type ได้ถ้า execution ต่าง)

### W6: quality-review — แกนใหม่ + ผูก loop (เสา B — จุดบังคับใช้หลัก)

- Scorecard เพิ่มแบบ v2-superset pattern เดิม (optional ใน Zod, สั่งใน prompt เมื่อ flag
  เปิด): `open_loop_quality` (1-5), `retention_loop_quality` (1-5), `change_cadence` (1-5)
- ขยาย rubric ของแกนเดิม (แก้ prompt text ใน skill.md เท่านั้น ไม่แตะ schema):
  - `hook_strength`: เพิ่มเกณฑ์ "หัก 2+ คะแนนถ้าเปิดด้วย character intro/backstory/
    establishing แม้ hook prose จะเขียนดี" + "shot 1 ของ storyboard realize hook จริงไหม"
  - `tie_in_naturalness`: เพิ่มเกณฑ์ problem→result moment
  - `pacing`: เพิ่มเกณฑ์ result-before-cause
- `retention_metrics` block (จาก W4) เข้า user prompt — พร้อม instruction ว่าตัวเลขเหล่านี้
  เป็น ground truth ห้ามเดาแย้ง
- `evaluateScorecardAgainstPolicy` (`verticalDramaQualityLoop.ts`): แกนใหม่เข้า policy
  แบบ opt-in — policy เดิมที่ไม่ประกาศ threshold ของแกนใหม่ = ไม่ gate แกนนั้น
  (ตรวจ shape ของ policy object จริงตอน implement; ห้ามทำให้ policy เดิม fail เพราะแกน
  ที่มันไม่รู้จัก)
- `applyQualityReviewSuggestions` / stage-repair order: ตรวจว่า issue จากแกนใหม่ route
  เข้า stage เดิมถูกต้อง (open_loop/retention → script stage, change_cadence → storyboard
  stage) — คาดว่า repair_queue ทำงานผ่าน stage tag อยู่แล้ว แค่ verify + เพิ่ม mapping
  ถ้าจำเป็น

### W7: Video/motion layer — hook-shot + retention-ending motion energy (ข้อ 1, 8 ระดับ execution)

**ขอบเขตแคบมากโดยตั้งใจ — ยืนยันจากการอ่านโค้ดจริง (2026-07-11):**
- **sub-shot ไม่แตะ** (`vertical-drama-shot-video-prompt-subshots`) — เป็นกลไก identity-lock
  split ล้วน (ตัดช็อตเป็น 2-3 คลิปตามคนพูด กันหน้า/ชุดคนไม่พูดดริฟต์) ไม่ใช่การเล่าเรื่อง
  มี shot-reverse-shot continuity + unique-prompt rules ครบแล้ว ควรโง่เรื่อง narrative ต่อไป
- **motion layer รับ narrative signal ถูกต้องอยู่แล้ว** — `vertical-drama-video-motion-prompt-pack`
  skill.md กฎข้อ 3 อ่าน `is_reversal: true` จากบทแล้วสั่งกล้อง/การแสดงให้ power shift ลงจริง
  = precedent ที่ W7 ทำตามเป๊ะ (narrative fact จากบน → execution energy ที่ล่าง)

**ช่องว่างเดียวที่ปิด:** motion ของ "ช็อต hook (เปิด)" กับ "ช็อต retention-loop (ปิด)" ไม่รู้
ว่าตัวเองเป็นช็อตพิเศษ จึงอาจเปิดด้วย establishing/pan ช้าที่ทอน hook หรือปิดแบบตัดเรียบที่
ไม่ land ภาพค้างคา

- **เสา C (fact ป้อน skill):** ที่ service ที่ประกอบ payload ให้ 2 video skill
  (`verticalDramaVideoMotionPromptGeneration.ts` — มี `shotNumber`/`sourceShotNumbers` อยู่แล้ว)
  ส่ง fact เพิ่ม: `is_opening_shot` (ช็อตแรกของตอน), `is_retention_ending_shot` (ช็อตสุดท้าย)
  พร้อม text ของ `hook` / `retention_loop.description` จากบทเป็น context — flag-gated
  (`verticalDramaRetentionHooks` เดิม), byte-identical เมื่อปิด ตำแหน่ง "ช็อตแรก/สุดท้าย" ได้จาก
  shotNumber + จำนวนช็อตที่มีอยู่แล้ว ไม่ต้องคิดใหม่
- **เสา A (skill.md — หลัก):** เพิ่มกฎใน **2 skill** (`vertical-drama-shot-video-prompt` +
  `vertical-drama-video-motion-prompt-pack`) แบบเดียวกับกฎ `is_reversal` เดิม:
  - คลิปเปิด (`is_opening_shot`): เปิดด้วยพลังงาน/ความน่าสนใจทันทีให้เข้ากับ hook (ไม่เปิดด้วย
    establishing/pan ช้า/pose นิ่ง) — LLM ใช้วิจารณญาณเลือก camera move ที่ hook ต้องการ
  - คลิปปิด (`is_retention_ending_shot`): motion ต้อง land ภาพค้างคา/emotional turn ของ
    retention loop (ค้าง/ตอกย้ำ/ถือจังหวะ) ไม่ตัดจบเรียบ
- **ไม่มี TS validator/hard-gate** — เหมือนทุก W: กฎอยู่ใน skill.md, LLM ทำตาม + review LLM จับ

**ขอบเขตไฟล์:** `verticalDramaVideoMotionPromptGeneration.ts` (ส่ง fact),
`skills/vertical-drama-shot-video-prompt/skill.md`, `skills/vertical-drama-video-motion-prompt-pack/skill.md`
+ schemas + tests — **ไม่แตะ pipeline, ไม่แตะ subshot skill**

### หมายเหตุขอบเขต improve-script (`vertical-drama-improve-script` skill)

improve-script ทำงานระดับ season script text (logline/key beats ต่อตอน) — หลักการ 1-4, 7-11
ใช้ได้ที่ granularity หยาบกว่า: เพิ่ม 1 section สั้นใน skill.md ของมัน (hook-first ordering
ของ key beats, ทุกตอนต้องมี open question ค้าง, จบด้วย retention moment ไม่ใช่บทสรุป) —
**ไม่เพิ่ม structured field** ที่เลเยอร์นี้ (โครง text-block เดิมแคบ การยัด field ใหม่กระทบ
parser `storyScriptText.ts` เกินคุ้ม) จุดบังคับจริงอยู่ที่ script-builder ต่อตอนอยู่แล้ว

## Work packages + ลำดับ (ตาม Rule 1b — delegate ให้ ssp-backend, conductor verify ทุก phase)

**Round 1 (ขนาน — ไฟล์ไม่ทับกัน):**
- **R1** (ssp-backend): W1 genre threading + W2 ทั้งหมด — ไฟล์: `verticalDramaScriptGeneration.ts`,
  `verticalDramaEpisodePipeline.ts` (2 call sites), script-builder skill.md + input/output
  schemas, flag helper ใหม่ + tests (รวม byte-identical-when-flag-off test ตาม convention)
- **R2** (ssp-backend): W3 shotgrid — ไฟล์: `verticalDramaStoryboardGeneration.ts`,
  shotgrid skill.md + schemas + tests (⚠️ `verticalDramaEpisodePipeline.ts` ทับกับ R1 —
  R2 **ห้ามแตะ pipeline**; การ thread genre เข้า shotgrid call site เป็นงานชิ้นท้ายของ R1)
- **R3** (ssp-backend): W4 validators — ไฟล์ใหม่/shared ล้วน: `shared/verticalDramaSeries/
  retentionFacts.ts` + unit tests (pure functions, ไม่พึ่ง R1/R2 — เขียนจาก type contract
  ที่ plan นี้ระบุ)

**Round 2 (รอ Round 1 — ใช้ field/fact ที่ Round 1 สร้าง):**
- **R4** (ssp-backend): W5 rotation — ส่ง `recent_retention_loop_types` เข้า script-builder
  ไฟล์: pipeline + scriptGeneration (ต่อจาก R1) — **ไม่มี hard-gate wiring แล้ว** (ตัดออก
  ตามการปรับ skill-first: การบังคับใช้อยู่ที่ review LLM ไม่ใช่ retry gate)
- **R5** (ssp-backend): W6 quality-review + quality loop + apply routing — ไฟล์:
  `verticalDramaEpisodeQualityReview.ts`, `verticalDramaQualityLoop.ts`,
  `verticalDramaQualityReviewApply.ts`, quality-review skill.md + schemas + tests
  (**จุดบังคับใช้หลักของทั้งฟีเจอร์** — LLM ตัดสิน + loop convergence)
- **R6** (ssp-backend, ชิ้นเล็ก): improve-script skill.md section เดียว + skillContent test
- **R7** (ssp-backend): W7 video/motion hook+ending energy — ไฟล์:
  `verticalDramaVideoMotionPromptGeneration.ts`, `vertical-drama-shot-video-prompt/skill.md`,
  `vertical-drama-video-motion-prompt-pack/skill.md` + schemas + tests (รอ R1 เพราะอิง
  `hook`/`retention_loop` text จากบท; **ห้ามแตะ subshot skill / pipeline**) — ขนานกับ R5 ได้
  (คนละไฟล์)

## Risk assessment

| ความเสี่ยง | ระดับ | การกัน |
|---|---|---|
| Prompt regression กระทบคุณภาพ series ที่รันอยู่ | สูง | flag ปิดโดย default + byte-identical tests ทุก render path ที่แตะ |
| Zod แตกกับ artifact เก่า (script ที่ไม่มี open_loops) | กลาง | field ใหม่ optional ทั้งหมดใน Zod; กฎ MANDATORY อยู่ใน skill.md, บังคับใช้ผ่าน review LLM (เสา B) ไม่ใช่ Zod hard-fail |
| Policy loop เดิม fail เพราะแกนใหม่ | กลาง | แกนใหม่ opt-in ใน policy; ไม่ประกาศ = ไม่ gate |
| `change_type` ที่ LLM declare ไม่ตรงความจริง | ต่ำ | W4.3 นับเป็น fact ให้ review LLM ชี้ (ไม่ auto-reject) |
| genre free-text map ไม่เข้ากลุ่ม | ต่ำ | skill.md มี default group + ตัวอย่างคำไทย/อังกฤษที่พบบ่อย |
| LLM ลืมใส่ open loop/retention loop | กลาง | review LLM (เสา B) จับผ่าน scorecard → apply/re-review loop สั่งแก้เอง (convergence เดิม) แทน hard-gate |

ไม่มี DB schema change (ไม่มี migration risk) — ทุกอย่างอยู่ใน JSONB artifact เดิม + skill
files + service code

## Verification

- `pnpm check` + test ที่เกี่ยวข้องหลังทุก phase; conductor ตรวจอิสระ (diff read + รัน test
  เอง + scope check) ก่อนปิดทุก phase ตามวินัยเดิม
- Byte-identical tests: ทุก buildUserPrompt ที่แตะ ต้องมี test ยืนยัน flag ปิด = prompt
  เดิมเป๊ะ (convention `speechBudgetEnabled` เดิม)
- Manual (flag เปิดบน series ทดสอบ): (1) generate ตอนใหม่ → เช็ค open_loops/retention_loop
  ใน artifact จริง, (2) generate 3 ตอนติด → retention_loop.type ต้องไม่ซ้ำหมด, (3) รัน
  quality review → เห็นแกนใหม่ + retention_metrics ตรงกับ artifact, (4) ตอนที่จงใจไม่มี
  open loop (mock) → ต้องโดน retry, (5) series แนว romance vs drama → retention loop
  คนละกลุ่มจริง
