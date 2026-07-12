# Consolidate speaker-switch sub-shots into ONE prompt/ONE clip

## Context

ผู้ใช้เห็นหน้า Storyboard ของช็อตที่มีบทสนทนาโต้ตอบกัน 2 คน แล้วระบบแตกเป็น **2 บล็อกพรอมต์วิดีโอแยกกัน** (คนละ prompt, คนละ clip, คนละปุ่ม "สร้างวิดีโอ", คนละค่าใช้จ่าย) — ผู้ใช้บอกว่าผิดสิ่งที่ควรจะเป็น: ต้องการให้ sub-shot (เช่น 0-3s = shot1, 3-8s = shot2) **อยู่ใน prompt เดียวกัน** เพื่อสร้างเป็นวิดีโอ multi-shot ตัวเดียว ไม่ใช่แยกเป็นคนละ prompt

ผมอธิบาย trade-off ให้ฟังก่อนตัดสินใจ: โมเดลสร้างวิดีโอ (Veo/Kling ฯลฯ) ส่วนใหญ่ไม่รองรับคำสั่ง "ตัดภาพเปลี่ยนตัวละครที่วินาทีที่ X" ภายใน 1 generation call ได้แม่นยำ และระบบเดิมให้แต่ละ sub-shot ใช้ภาพอ้างอิง (reference/identity-lock) คนละรูปตามคนที่พูดในช่วงนั้น ถ้ารวมเป็น prompt เดียวจะสูญเสียการสลับภาพอ้างอิงต่อช่วงเวลาไป — **ผู้ใช้ยืนยันเลือกแบบรวมเป็น prompt เดียว โดยรับทราบ trade-off แล้ว** (ยืนยันผ่าน AskUserQuestion): "รวมเป็น prompt เดียวจริง"

**ยึดหลัก skill-first ตลอดแผนนี้**: เนื้อหาการแต่ง prompt แบบมีจังหวะเวลา (timed segments) อยู่ใน `skill.md` เท่านั้น โค้ด TS ส่งแค่ fact (timestamp/speaker/dialogue ต่อช่วง) ห้าม hardcode ข้อความ prompt ในโค้ด

## สถานะปัจจุบัน (ยืนยันจากโค้ดจริง — Explore + Plan agent คู่ขนาน)

- **Gate logic** `shared/verticalDramaSeries/subShots.ts` — `computeSpeakerSwitchSubShotPlan` เป็น pure function กำหนดว่าช็อตต้องแตกไหม (≥2 คนพูดสลับกัน, ≥2 turns, duration พอ) และสร้าง `windows[]` (`{subShotNumber, characterKey anchor, lineIndexes[], durationSeconds}`) — **ฟังก์ชันนี้ไม่ต้องแก้เลย** ยังคงเป็นตัวให้ fact จังหวะเวลาเหมือนเดิม เปลี่ยนแค่ตัว "ผู้บริโภค" ผลลัพธ์
- **สอง skill คู่กัน**: `vertical-drama-shot-video-prompt` (single-shot, output `{prompt, negative_motion_prompt, dialogue[], audio_direction?}`) กับ `vertical-drama-shot-video-prompt-subshots` (ปัจจุบันคืน `{subShots: [{subShotNumber, cameraSetup, prompt, negative_motion_prompt, transitionIn}], ...}` — คนละ prompt ต่อ sub-shot)
- **Router**: `generateAndPersistSplitShotVideoPrompt` (`server/routers/verticalDramaEpisodes.ts` ~5340-5605) เรียก service `generateVerticalDramaShotVideoPromptSubShots` แล้วสร้าง **N clip แยกกัน** (`clipNumber: shotNumber*100+subShotNumber`, แต่ละ clip มี `startFrameAssetId` เป็นภาพของคนพูดในช่วงนั้นๆ) เขียนทับ `motionPromptPack.clips[]`
- **Video generation call** ยืนยันแล้วว่า **รองรับ reference image หลายรูปต่อ 1 call จริง** (`referenceImageUrls: string[]`, `maxReferenceImages` ต่างกันตามโมเดลใน `modelRegistry.ts` เช่น Veo=3, Kling=5-9) — นี่คือกลไกที่จะใช้แทนการสลับภาพต่อ sub-shot
- **Frontend** `VerticalDramaStoryboardPanel.tsx` render clip แบบ generic loop ต่อ shot อยู่แล้ว (1 clip = 1 กล่องธรรมดา, N clips = "(1/N)" labels) — **ไม่ต้องแก้เลย** ถ้า backend ส่งกลับมาเป็น 1 clip ต่อ shot เหมือนช็อตปกติ ระบบเดิมจะ render ถูกต้องเองทันที (ยืนยันจาก test `VerticalDramaStoryboardPanel.speakerSubShots.test.tsx` ที่ inject 1-clip กับ 2-clip แยกกันอยู่แล้ว)
- **บั๊ก stale-clip ที่เพิ่งแก้ไปแยกต่างหาก** (task #73, คนละเรื่อง ไม่เกี่ยวกับ redesign นี้ — เป็น transaction/lock fix ในฝั่ง single-clip path ที่มีอยู่แล้ว ห้ามแตะซ้ำ)

## Design ที่เลือก

### 1. Gate logic — ไม่แก้เลย

`shared/verticalDramaSeries/subShots.ts` + `subShots.test.ts` — 0 changes

### 2. Skill — ปรับปรุงในที่เดิม (ไม่สร้าง skill ใหม่)

**เหตุผลที่ไม่สร้าง skill ใหม่**: คง slug/DB row/skill-registry wiring เดิม, router branch ("ถ้า needsSplit เรียก subshots skill") ยังเหมือนเดิม เปลี่ยนแค่ input/output contract

`skills/vertical-drama-shot-video-prompt-subshots/skill.md` (+ `SKILL.md` mirror ให้ตรงกันเหมือนเดิม):
- **Output contract ใหม่ = เหมือน single-shot skill เป๊ะ**: `{prompt, negative_motion_prompt, dialogue[], requiredDisclosure?, audio_direction?}` — ลบ `subShots[]` array, ลบ `cameraSetup`/`transitionIn` structured fields (ยุบเป็นส่วนหนึ่งของ prose แทน)
- **เนื้อหาที่ต้องเขียนใหม่ (สาระ ไม่ใช่ถ้อยคำเป๊ะ — implementer เขียนเอง)**:
  - เปลี่ยน framing: ไม่ใช่ "each sub-shot becomes its OWN separate clip" อีกต่อไป — ผู้เรียกคำนวณช่วงเวลามาให้แล้ว (2-3 ช่วง) งานคือเขียน prompt เดียวที่บรรยายลำดับการตัดภาพแบบมีเวลากำกับ ("0-3s: ...; 3-8s: cut to ...") เป็น prose ธรรมชาติ ไม่ใช่ timestamp แบบ JSON
  - กฎ "ห้ามบรรยายหน้าตา/รูปร่าง" ยังอยู่ แต่เหตุผลเปลี่ยน: ตอนนี้ identity ของทุกคนที่พูดมาจาก **reference image หลายรูปที่แนบเข้า generation call เดียว** (ไม่ใช่สลับภาพต่อ segment แบบเดิม) ต้องเขียนอธิบายเหตุผลนี้ไว้ในกฎด้วย ให้คนแก้ในอนาคตเข้าใจ
  - **ส่วนกลางใหม่ (แทนที่ shot-reverse-shot continuity เดิม)**: สอนให้เขียน prose ต่อเนื่องครอบคลุมความยาวเต็มของช็อต แต่ละช่วงเปิดด้วยกรอบเวลา+ตัวละคร/แอ็กชัน บรรยายการตัดภาพแบบภาพยนตร์ ("cut to", "camera whips to") ปิดท้ายด้วยว่าช่วงสุดท้ายจบลงยังไง ต้องอิงฉาก/แสง/สถานที่เดียวกันตลอดให้รู้สึกเป็นฉากต่อเนื่อง ไม่ใช่ช็อตแยกที่เอามาต่อกัน
  - **budget ตัวอักษรแบ่งสัดส่วน**: cap 2000 ตัวอักษรเดิมตอนนี้ต้องแบ่งกันทุกช่วงใน 1 prompt (ไม่ใช่ 2000 ต่อ sub-shot แบบเดิม) — สอนให้ประมาณ 2000/จำนวนช่วง ตัดรายละเอียดที่ไม่จำเป็นก่อนถ้าเกิน
  - **ย่อหน้ายอมรับข้อจำกัดอย่างตรงไปตรงมา (บังคับตามที่ user สั่ง)**: ระบุชัดว่าโมเดลวิดีโอไม่การันตีว่าจะตัดภาพตามเวลาที่สั่งได้แม่นยำ 100% — เขียน prompt ให้ชัดและเป็นภาพยนตร์ที่สุดเพื่อเพิ่มโอกาส แต่เป็น best-effort ไม่ใช่ hard guarantee (ย่อหน้านี้ต้องอยู่ใน skill.md ให้คนอ่านในอนาคตเข้าใจ trade-off โดยไม่ต้องขุดโค้ด)
  - ลบ `transitionIn` enum field, ลบ `cameraSetup` field — พับรวมเป็นส่วนหนึ่งของ prose

### 3. Service (`server/services/verticalDramaVideoMotionPromptGeneration.ts`)

- Rename `generateVerticalDramaShotVideoPromptSubShots` → `generateVerticalDramaShotVideoPromptSpeakerSwitch` (ชื่อเดิมโกหก contract ใหม่ — ไม่มี `subShots[]` แล้ว) พร้อม type ที่เกี่ยวข้อง
- **ลบ schema ซ้ำซ้อน**: ลบ `speakerSwitchSubShotOutputSchema`, ใช้ `shotVideoPromptOutputSchema` (ของ single-shot skill) ตรงๆ แทน — ไม่ต้อง maintain 2 schema คู่กัน
- Result shape ใหม่: `{prompt, negativeMotionPrompt?, dialogue[] (flatten ทุก window ตามลำดับเวลา), durationSeconds (= sum ของทุก window), distinctSpeakerCharacterKeys[] (anchor คนแรกก่อน แล้วตามลำดับที่ปรากฏใหม่), creditsUsed, model, usedVision, requiredDisclosure?, audioDirection?}`
- `buildSpeakerSwitchSubShotUserPrompt`: เปลี่ยนจาก "builder ต่อ sub-shot block" เป็น "cumulative-timestamp fact builder" — เดินตาม `windows[]` สะสม `startSeconds`/`endSeconds` ต่อช่วง ส่งเป็น fact block ต่อช่วง (anchor character, [start,end), บทพูดช่วงนั้น) ยังเป็น structured fact ล้วน ไม่ใช่ authored prose (หน้าที่แต่งประโยคเป็นของ skill.md)

### 4. Router (`server/routers/verticalDramaEpisodes.ts`)

**4a. เพิ่ม field ใหม่ใน clip type** (`shared/verticalDramaSeries/contracts.ts`, `VerticalDramaMotionPromptPack.clips[]`) — JSONB column ไม่ต้อง migration:
```ts
/** Reference-image asset ids เพิ่มเติมนอกจาก startFrameAssetId — เช่น
 *  ภาพของผู้พูดคนอื่นๆ ใน consolidated speaker-switch clip เดียว ให้ identity
 *  ของทุกคนไปทาง multi-reference-image ของโมเดลแทนการสลับภาพต่อ segment */
extraReferenceAssetIds?: string[];
```
mirror field เดียวกันใน frontend type `VerticalDramaMotionPromptClipView` เพื่อความตรงกัน (ฝั่ง client ไม่ต้องอ่านค่านี้จริง)

**4b. `generateVideoClip`'s reference resolution** (~9389-9401) — เพิ่ม `extraReferenceAssetIds` เข้าไปอยู่ **ก่อน** shot-level manual references ตอน merge+trim ด้วย `maxReferenceImages` เดิม (เปลี่ยนแค่ 3-4 บรรทัด) — clip ที่ไม่มี field นี้พฤติกรรมเดิมทุกประการ

**4c. `generateAndPersistSplitShotVideoPrompt`** (~5340-5605) — เขียนใหม่:
1. เรียก service เวอร์ชันใหม่ → ได้ผลลัพธ์เดียว ไม่ใช่ N
2. Post-process **ครั้งเดียว** (ลบ loop `Promise.all` เดิม) — brand sanitize → `ensurePromptWithinLimit` → preset-style-token append เหมือนเดิมแต่ไม่ loop
3. Resolve ภาพอ้างอิงของทุกคนพูดจาก `distinctSpeakerCharacterKeys` (anchor ก่อน) ผ่าน `getPrimaryPortraitAssetId` เดิม ได้ array แทน Map
4. สร้าง clip เดียว **รูปร่างเหมือน single-shot clip ปกติทุกประการ**: `clipNumber: shotNumber` (ไม่ใช่ `shotNumber*100+n` แล้ว), ไม่มี `parentShotNumber`/`subShotNumber`, `startFrameAssetId` = ภาพ anchor speaker, `extraReferenceAssetIds` = ภาพคนอื่นที่เหลือ — **นี่คือจุดที่ทำให้ frontend ไม่ต้องแก้อะไรเลย**
5. **เพิ่ม transaction lock แบบเดียวกับ single-path** (ที่เพิ่งแก้ไปใน task #73) — path นี้ไม่เคยมี lock มาก่อน ตอนนี้ทั้งสอง path จะสร้าง 1 clip เหมือนกันแล้ว จึงควร lock เหมือนกันด้วย เพื่อปิดช่องโหว่ race condition แบบเดียวกัน (**สร้างเป็น block ใหม่แยกต่างหาก ห้ามแก้ block ของ single-path เดิม**)
6. Return shape ตัดฟิลด์ `subShots: [...]` ออก (ยืนยันแล้วว่า frontend ไม่เคยอ่านค่านี้)

**4d.** Branch condition (`if (subShotDecision?.needsSplit) { return generateAndPersistSplitShotVideoPrompt(...) }`) ไม่ต้องแก้โครงสร้าง แค่ปรับ comment

### 5. Frontend — ไม่ต้องแก้ (ยืนยันแล้ว)

Generic per-clip render loop ที่มีอยู่แล้วจัดการ 1-clip-ต่อ-shot ถูกต้องอัตโนมัติ — `isSplitShot` จะเป็น false เองเมื่อมีแค่ 1 clip ต่อ shot **โค้ด "(1/2)" label เดิมทิ้งไว้ ไม่ต้องลบ** — ยังจำเป็นสำหรับ render ช็อตที่แตกแบบเก่าที่ยังค้างอยู่ใน production จนกว่าผู้ใช้จะ regenerate

### 6. Migration — ไม่ต้องมี backfill script

ช็อตเก่าที่แตกเป็น N clip ค้างอยู่ใน DB ยัง render ตามเดิมจนกว่าผู้ใช้กด "สร้างพรอมต์วิดีโอ" ใหม่ — ตอน regenerate filter เดิม (`sourceShotNumbers?.includes(shotNumber) || parentShotNumber === shotNumber`) จะลบ clip เก่าทั้ง N ตัวออกก่อนใส่ clip ใหม่ 1 ตัว ตรงตามภาพที่ user เจอปัญหาพอดี

### 7. Tests
- Gate logic: ไม่แก้
- Service test: ปรับตาม result shape ใหม่ + schema ที่ reuse
- Router test ใหม่: จำลอง 2+ คนพูดสลับกัน → assert ว่าเหลือ clip เดียว, `clipNumber === shotNumber`, ไม่มี `subShotNumber`, `extraReferenceAssetIds` ถูกต้อง, clip เก่าที่เป็น legacy split ถูกลบหมด
- `generateVideoClip` reference-merge test: มี/ไม่มี `extraReferenceAssetIds` ทั้งสองกรณี
- Frontend `speakerSubShots.test.tsx`: ไม่ต้องแก้ (กลายเป็น legacy-compat regression test)

## Delegation
งานนี้เป็น backend ล้วน (skill+service+router+shared type) — **ส่งแค่ `ssp-backend`** ไม่ต้อง `ssp-frontend`

## Verification
- `pnpm check` + test ที่เกี่ยวข้องหลังทำเสร็จ
- Manual: สร้างช็อตที่มีบทสนทนาโต้ตอบ 2 คน → กด "สร้างพรอมต์วิดีโอ" → ต้องเห็น "กล่องเดียว" ไม่ใช่ (1/2)/(2/2), prompt มี timing แบบ 0-3s/3-8s อยู่ใน text เดียว; กด regenerate ช็อตที่เคยแตกแบบเก่า (จาก screenshot จริง) → ต้องเหลือ 1 clip; กด "สร้างวิดีโอ" →ยืนยัน request ที่ส่งไปมี `referenceImageUrls` มากกว่า 1 รูปเมื่อโมเดลรองรับ
