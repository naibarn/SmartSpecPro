# Plan — Create-Series Wizard: ปิดช่องว่าง "ไม่มี seed ไม่มีปุ่มสั่งงาน"

สถานะ: IMPLEMENTED — Stage 1 + Stage 2 พร้อม targeted verification
วันที่: 2026-07-19
เจ้าของ: naibarndotcom@gmail.com

---

## 0. บริบท — งานที่ทำเสร็จแล้วในเซสชันนี้ (ไม่ต้องทำซ้ำ)

| # | งาน | สถานะ |
|---|---|---|
| A | Extend deep-draft premium toggle สำหรับภาค 2 (default premium + กดคุมได้จริง) | ✅ SHIPPED |
| B | Fix ชื่อซีรีส์ต้นฉบับใน dropdown ค้างชื่อเก่า (invalidate `list` cache) | ✅ SHIPPED |
| C | เพิ่ม dropdown เลือกโมเดล LLM ในวิซาร์ดตอนสร้าง (atomic ฝั่ง server) | ✅ SHIPPED |

งานที่เหลือ = แผนฉบับนี้เท่านั้น.

---

## 1. Problem statement

ในแท็บ 1 ของวิซาร์ด ปุ่ม AI สังเคราะห์โครงเรื่อง (`resolveCreateSeriesPresetAction`,
`CreateSeriesWizard.tsx:314`) มี 5 กรณี — กรณีเดียวที่ปุ่มถูก **`blocked` (ปิด)** คือ
**ไม่มีโจทย์ (userPremise) + ไม่มี preset เลย**

ผลที่ผู้ใช้เจอ:
- เห็นปุ่มพรีวิวสีจาง + ข้อความ "พิมพ์โจทย์... หรือเลือก preset อย่างน้อย 2 แบบ" → **รู้สึกว่าตัน**
- ไม่รู้ว่า (ก) กด **"สร้าง"** แท็บสุดท้ายได้เลย (สร้างจริงต้องการแค่ชื่อ+จำนวนตอนย่อย —
  `createValid`, `CreateSeriesWizard.tsx:900` — แล้ว AI generate ทั้งเรื่องอัตโนมัติที่
  `CreateSeriesWizard.tsx:542`), หรือ (ข) พิมพ์โจทย์ 1 บรรทัดเพื่อปลดล็อกปุ่ม

**ไม่ใช่บั๊กที่สร้างไม่ได้** — สร้างได้เสมอ — แต่เป็น **discoverability gap**: ไม่มี
"ปุ่มสั่งงาน" ที่ชัดในเคสไม่มี seed และผู้ใช้ไม่รู้ว่าไม่จำเป็นต้องมี

ข้อเท็จจริงที่ยืนยันจากโค้ด (สำคัญต่อ scope):
- `synthesizeGenrePresetInput` (`verticalDramaSeries.ts:3803`) — **ทุก field เป็น optional**
  (`selectedPresetIds?`, `userPremise?`, `selectedCategories?`, `toneHint?`,
  `businessContext?`, `audienceAgeRating?`). ระดับ schema จึง**รับ call ไม่มี preset+ไม่มีโจทย์ได้**
- ตัวบล็อกอยู่ที่ **client เท่านั้น** (`resolveCreateSeriesPresetAction` คืน `blocked`)
- Sequel: มี lineage memory + carry-over เป็น seed อยู่แล้ว → เคส "ไม่มี seed" แทบไม่เกิดกับภาค 2

---

## 2. เป้าหมาย (ฟังก์ชันที่ต้องได้)

1. **มี path สั่ง AI ที่ชัดและใช้งานได้เสมอ** ไม่ว่าจะมี/ไม่มี preset หรือโจทย์
2. เคสไม่มี preset:
   - พิมพ์โจทย์ → ปุ่ม "สร้างจากโจทย์" ทำงาน (มีอยู่แล้ว — แค่ต้องสื่อสารให้เห็น)
   - ไม่พิมพ์โจทย์เลย → มีปุ่ม **"ให้ AI สร้างทั้งหมดให้"** ที่ seed จากข้อมูลพื้นฐาน
     (แนว/โทน/กลุ่มเป้าหมาย/ธุรกิจ + lineage สำหรับภาค 2)
3. สื่อสารชัดว่า **ไม่จำเป็นต้องเลือกอะไร** ก็กด "สร้าง" ให้ AI คิดทั้งหมดได้

---

## 3. แนวทาง — 2 Stage (Stage 1 ส่งได้ทันที, Stage 2 เป็น feature)

### Stage 1 — Clarity (client-only, ความเสี่ยงต่ำ, ส่งได้เลย)
เปลี่ยน copy ของสถานะ `blocked` ให้ actionable แทนข้อความตัน:
> TH: "ไม่ต้องเลือก preset ก็ได้ — พิมพ์โจทย์ 1 บรรทัดเพื่อดูตัวอย่างก่อน หรือกด 'ถัดไป'
>     จนถึงแท็บสุดท้ายแล้วกด 'สร้าง' ให้ AI คิดเนื้อเรื่องให้ทั้งหมด"
> EN: "No preset needed — type a one-line premise to preview, or click Next to the last
>     tab and press Create to let AI build the whole story."

- ไฟล์: `CreateSeriesWizard.tsx` (blockedReason ใน `resolveCreateSeriesPresetAction`),
  copy ใน `verticalDramaCopy.ts`
- ไม่มี server change. ทดสอบด้วย `presetPrimaryAction` unit test เดิม
- **ปิด gap เรื่องความเข้าใจได้ทันทีโดยไม่ต้องรอ Stage 2**

### Stage 2 — ปุ่ม "generate-from-basics" (client + skill; server มีรองรับแล้วเป็นส่วนใหญ่)
1. **Client** — เพิ่ม action kind ใหม่ `synthesize_from_basics` ใน
   `resolveCreateSeriesPresetAction`: เมื่อไม่มีโจทย์+ไม่มี preset แต่มีข้อมูลพื้นฐาน
   อย่างน้อยหนึ่งอย่าง (แนว/หมวด/โทน/ธุรกิจ) — หรือเป็น sequel (มี lineage) — คืนปุ่ม
   **ENABLED** ป้าย "ให้ AI สร้างทั้งหมดให้" / "Let AI build it all"
2. **Client payload** — ยิง `synthesizeGenrePreset` โดยส่ง `selectedCategories` /
   `toneHint` / `businessContext` / `audienceAgeRating` เป็น seed (ไม่มี preset/premise)
3. **Server** — ตรวจ/ผ่อน guard ใน `synthesizeGenrePreset` (`verticalDramaSeries.ts:5636`)
   ให้รัน basics-only ได้ (schema รับแล้ว; เช็คว่าไม่มี guard ที่ throw เมื่อ selection ว่าง)
4. **Skill-first** (ตาม `feedback_skill_first_authoring`) — กฎ "เมื่อไม่มี preset/โจทย์
   ให้ประดิษฐ์โครงเรื่องจากแนว+กลุ่มเป้าหมาย" เขียนใน **skill.md ของ preset-synthesizer**
   ไม่ hardcode ใน TS; TS แค่ส่ง facts เข้าไป
5. **สำหรับ sequel** — seed รวม lineage memory ด้วย (มี field carry-over อยู่แล้ว)

---

## 4. ไฟล์ที่กระทบ

| Stage | ไฟล์ | การเปลี่ยน |
|---|---|---|
| 1 | `client/.../CreateSeriesWizard.tsx` | blockedReason copy actionable |
| 1 | `client/.../verticalDramaCopy.ts` | copy key ใหม่ TH/EN |
| 1 | `__tests__/CreateSeriesWizard.presetPrimaryAction.test.ts` | assert copy ใหม่ |
| 2 | `client/.../CreateSeriesWizard.tsx` (+ child WizardStep) | action kind + ปุ่ม + payload |
| 2 | `server/routers/verticalDramaSeries.ts` | ผ่อน guard synthesize (ถ้าจำเป็น) |
| 2 | `server/services/verticalDramaPresetSynthesis.ts` | รองรับ seed basics-only |
| 2 | `skills/<preset-synthesizer>/skill.md` (+ lowercase twin) | กฎ generate-from-basics |
| 2 | tests: `presetPrimaryAction` + server synthesize + skill real-LLM gate | ครบทุกชั้น |

---

## 5. Risk / impact

- **Stage 1**: trivial, copy เท่านั้น — byte-identical ทุก path ที่มี seed
- **Stage 2**:
  - ต้องไม่ regress path เดิม (มีโจทย์/มี preset) → byte-identical เมื่อมี seed
  - แตะ skill.md → ระวัง dual-case file drift (`project_vd_skill_dualcase_file_drift`):
    แก้ lowercase `skill.md` + คู่ `SKILL.md` ให้เหมือนกัน
  - พิสูจน์แบบ real-LLM ไม่ใช่ existence check (`project_vd_skill_taught_not_wired`):
    generate จริงจาก basics-only แล้วดูว่าได้ logline/characters ครบ ไม่ใช่บรรทัดเดียว
  - Concurrent edits บน `CreateSeriesWizard.tsx` — atomic write + git add + re-verify

---

## 6. Verification

- Unit: ทุก action kind (verbatim / from-premise / premise+presets / presets-only /
  **from-basics ใหม่** / blocked-เมื่อว่างจริง)
- Server: `synthesizeGenrePreset` รัน basics-only คืน draft ครบ (logline/characters ≥3)
- Real-LLM smoke: สร้างจริงไม่มี preset+ไม่มีโจทย์ (แนว+กลุ่มเป้าหมายเท่านั้น) → เนื้อเรื่องมีคุณภาพ
- `pnpm check` = 0 error ใหม่ในไฟล์ที่แตะ; targeted vitest เขียว vs baseline
- Deploy: build:deploy → restart web (ถ้าแตะ server) → smoke 200

---

## 7. ลำดับลงมือ (เมื่ออนุมัติ)

1. Stage 1 ทั้งชุด → build:deploy → ให้ผู้ใช้ลองก่อน (ปิด gap ความเข้าใจทันที)
2. รับ feedback → Stage 2 (client action+ปุ่ม, server guard, skill.md, tests) → deploy

---

## 8. Implementation result (2026-07-19)

- เพิ่ม action `synthesize_from_basics` และปุ่ม
  **"ให้ AI สร้างทั้งหมดให้" / "Let AI build it all"** เมื่อไม่มี
  preset/premise โดยใช้ค่า default ของ wizard เป็น basic seed
- payload ส่ง title/genre/category/tone/business/product/episode-count/
  audience-age และ lineage/carry-over สำหรับ sequel/special edition
- router ส่ง title/genre/audience context เฉพาะ basics-only path ส่วน
  lineage เป็นข้อยกเว้นที่ต้องส่งทุก path เพื่อให้ภาคต่อรักษา canon เดิม
- service v1/v2 ยอมรับ zero selection เมื่อมี basic seed และใส่
  `GENERATE FROM BASICS` + audience constraint + lineage facts ใน prompt
- skill `vertical-drama-preset-synthesizer` ทั้ง `skill.md`/`SKILL.md`
  อัปเดตเป็น v1.4.1 และสอนทั้งกฎ generate-from-basics กับ
  `continuity outranks premise` ตรงกัน
- targeted Vitest: 126 tests ผ่าน (wizard/action/lineage/router/service/skill)
- `cd apps/web && pnpm check`: ผ่าน
- dual-case skill comparison: ผ่าน
- browser screenshot/manual viewport pass: ไม่ได้รัน; ใช้ jsdom interaction
  tests ยืนยันปุ่ม enabled, accessible name, payload และ action switching แทน
- repository-wide `skills/audit-skills.sh`: ยัง fail จาก runtime artifacts
  เดิมใน `skills/deep-*` (`.venv`, `.pytest_cache`, `__pycache__`) ซึ่งไม่
  เกี่ยวกับ feature นี้และไม่ได้ลบให้
- real-LLM smoke, build/deploy/restart: ยังไม่รัน เพราะเป็น external/
  paid/runtime side effect และไม่ได้ทำใน implementation pass นี้

### Sequel continuity follow-up (2026-07-19)

- แก้ regression จากเคสในภาพ: เมื่อเลือกภาค 2 แล้วกรอกโจทย์
  `lineageContext` จะไม่ถูกตัดทิ้งที่ router อีกต่อไป
- prompt v1/v2 กำหนดให้เรื่องเดิม ตัวละคร ความสัมพันธ์ โลก และปมค้าง
  เป็น primary canon; โจทย์เป็น new-season direction และห้ามสร้าง reboot
  ที่ไม่เกี่ยวข้อง
- UI เปลี่ยนป้ายและคำอธิบายใน lineage mode เป็น
  **"ให้ AI สร้างภาคต่อจากเรื่องเดิม + โจทย์"**
- แก้ final-create validation error: `applyPresetDraft` ไม่ใช้
  `draft.title` เป็น genre อีกต่อไป; ภาคต่อคง genre ของเรื่องเดิม และ
  ซีรีส์ใหม่ใช้ `draft.category` เมื่อช่อง genre ยังว่าง; หาก genre เดิม
  เป็น legacy data ที่ซ้ำ/ปนชื่อเรื่อง จะ fallback ไป `draft.category`
  ทั้งตอน apply draft และก่อนส่ง create payload
- แก้ carry-over planner schema error จากปุ่ม
  **"ให้ AI เสนอการกลับมาของตัวละคร"**: `returnJustification` บังคับเฉพาะ
  `returns_with_explanation`; สถานะอื่นรับ `null`/ค่าว่างและ normalize
  เป็นไม่มีค่า เช่นเดียวกับ `suggestedStateUpdate`
- แก้ model-policy regression ในขั้นสร้างเนื้อเรื่องเต็ม: deep draft ทั้ง
  standard และ premium ต้อง resolve โมเดลจาก policy ของซีรีส์ก่อนเสมอ
  ทำให้ candidate/judge/revise/re-judge/continuity sweep ใช้โมเดลที่ผู้ใช้
  เลือก (เช่น Gemini 3.5 Flash) ร่วมกันทั้งหมด; auto selector ใช้เฉพาะเมื่อ
  ซีรีส์ไม่ได้ pin โมเดลไว้
- regression suite เฉพาะ follow-up: 103 tests ผ่าน และ
  `cd apps/web && npm run check` ผ่าน
