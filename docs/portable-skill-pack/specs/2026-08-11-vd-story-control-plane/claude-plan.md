# Vertical Drama Story Control Plane — Skill-First Implementation Plan

## 1. ผลลัพธ์ที่เลือก

แผนนี้เลือก “ยกระดับ quality ledgers และ breakdown version เดิมให้เป็น Story Control Plane เดียว” แทนการสร้างระบบ ledger ใหม่หรือเพิ่ม prompt ใหญ่ครอบทุกตอน

แกนความรับผิดชอบจะเป็นดังนี้:

| ความรับผิดชอบ | ผู้รับผิดชอบหลัก | สิ่งที่ห้ามทำ |
|---|---|---|
| แกนเรื่อง, payoff ที่มีความหมาย, เคมีคู่พระนาง, จังหวะอารมณ์, ความน่าสนใจของการพลิกเกม | `vertical-drama-full-story-architect`, `vertical-drama-script-builder`, `vertical-drama-episode-quality-review` skills | ห้ามให้ TypeScript ตัดสินคุณภาพเชิงศิลป์แทน |
| วางแผน/จัดหมวด/ผูก ID/กำหนดช่วงเวลา/คุมจำนวนปม/ตรวจบทตัวละคร | `vertical-drama-ledger-planner` skill ร่วมกับ schema และ deterministic reconciler | ห้ามให้ ledger planner เปลี่ยนแกนเรื่องหรือคิดพล็อตใหม่คนละเรื่อง |
| บันทึกสิ่งที่เกิดขึ้นจริงในตอน, หลักฐานการขยับ/เฉลย, ความรู้ของตัวละคร | `vertical-drama-series-memory-planner` skill + append-only memory events | ห้ามให้ memory planner ปิดปมจากข้อความลอยโดยไม่มีหลักฐาน |
| ตรวจ ID, episode range, ตัวละคร, action transition, silent drop, overdue และ budget | TypeScript/Zod/pure validators | ห้าม auto-invent, auto-close หรือ auto-rewrite เนื้อเรื่อง |
| การตัดสินใจแก้ไขตอนหรือ re-plan อนาคต | ผู้ใช้ผ่าน quality review/arc replan proposal | ห้ามแก้ตอนที่ผลิตแล้วเป็น side effect ของการตรวจ |

หลักนี้แก้ปัญหาต้นเหตุ: ระบบจะไม่พยายาม “ปิดปมให้ครบ” จนเรื่องเสีย แต่จะทำให้ปมที่สำคัญต้องมีเจ้าของและหลักฐาน ขณะเดียวกันอนุญาตให้ skill เลือกปล่อย hook สั้น, รวมปม, พักปม หรือเปลี่ยนเป็น sequel hook อย่างมีความหมาย

## 2. สิ่งที่ไม่ควรทำ

ต้องใส่เป็นข้อห้ามใน implementation review และ regression fixtures:

- ไม่สร้าง `StoryControlPlan` แยกจาก quality ledgers, `bible.breakdownVersions`, series memory และ memory events จนกลายเป็น source of truth ชุดที่สี่
- ไม่ส่ง ledger ทั้งซีซัน, script ทั้งหมด และ cast ทั้งหมดเข้า prompt ของทุกตอน
- ไม่บังคับให้ทุก cliffhanger เป็น `arc_thread` หรือ `season_thread`
- ไม่บังคับให้ทุกตอนต้องมีการเปิด/ปิดปมระยะยาว
- ไม่ใช้กฎแข็งแบบ “ต้องมี romance beat ทุกตอน” หรือ “ฝ่ายดีต้องชนะสลับทุกตอน” เพราะจะได้เรื่องที่เป็นสูตรและขัดกับ genre
- ไม่ให้ ledger planner แต่ง payoff ใหม่ที่ขัดกับ approved breakdown เพื่อให้ ledger ดูครบ
- ไม่ให้ `open_threads` แบบ free text และ `episode_memory` เป็นแหล่งความจริงที่แก้ไขกันเอง
- ไม่ merge หรือ auto-resolve ข้อมูล legacy เพียงเพราะชื่อคล้ายกัน
- ไม่ regenerate ตอนที่ผ่านการอนุมัติ/ผลิตแล้วเพียงเพราะพบปมเก่า
- ไม่เพิ่ม prompt fields ระดับ shot สำหรับ romance หรือ advantage curve; สิ่งเหล่านี้เป็น beat ระดับ episode/arc แล้วให้ skill แตกเป็นฉากเอง
- ไม่คำนวณจำนวนตอนจากสูตร `episodeCount * 60` หรือสมมติ `9 shots * 10 seconds`; runtime ต้อง derive จาก duration profile ที่เลือกจริง
- ไม่สับสนระหว่าง 9 logical storyboard shots กับจำนวน provider clips/frames ที่ assembly ใช้ โดยเฉพาะ profile แบบ frame-bridge ที่อาจมี 9 frames แต่ 8 clips

## 3. สถาปัตยกรรมเป้าหมาย

### 3.1 แหล่งข้อมูลกลาง

ใช้โครงสร้างที่มีอยู่แล้วเป็นฐาน:

1. `bible.breakdownVersions[active].items` เป็น approved narrative outline และ episode purpose
2. `bible.breakdownVersions[active].ledgers` เป็น planned/deterministic control state ของ breakdown version นั้น
3. เพิ่ม optional `storyControl` ใน breakdown version เดียวกันสำหรับ premise guardrails, episode slots, romance rhythm และ advantage curve โดยอ้าง `threadLedger.id` ไม่ทำสำเนา thread ledger
4. `vertical_drama_memory_events` เป็น append-only evidence จากตอนที่เกิดขึ้นจริง
5. `series.memory` / memory snapshot เป็น materialized observed projection สำหรับ retrieval/UI ไม่ใช่แผนอนาคตอีกชุด

การเลือกเก็บ `storyControl` ใน breakdown version ทำให้แผนใหม่ใช้กลไก append-only version เดิม และไม่ต้องเปิด migration table ชุดใหม่ในระยะแรก หากภายหลังต้องการ audit การแก้แผนแบบละเอียดจึงค่อยเพิ่ม dedicated revision table โดยไม่เปลี่ยน contract ของ skill

### 3.2 โครงสร้าง `storyControl` ระดับแผน

เป็น type/schema ใหม่ใน `apps/web/shared/verticalDramaSeries/storyControl.ts` โดยทุก field optional/additive เมื่ออ่าน legacy แต่ required เมื่อสร้าง control plan ใหม่ ประกอบด้วย:

- `contractVersion`: เวอร์ชัน contract
- `premiseAnchor`: `corePromise`, `mustRemainTrue`, `forbiddenDrift`, `endingDirection` และ `audienceEmotionalPromise`
- `threadPolicy`: profile/genre, `maxActiveArcThreads`, `maxNewDurableThreadsPerEpisode`, scope rules และวิธีจัดการ `parked`/`sequel_hook`
- `castMatrix`: canonical `characterKey`, display name, narrative role, relationship anchors, knowledge boundaries และ allowed/forbidden role substitutions
- `episodeSlots[]`: ตอนละหนึ่ง slot เฉพาะตอนที่วางแผนแล้ว
- `romanceRhythm`: คู่หลัก/คู่รอง, phase windows, beat gap warning, phase transition evidence และตอนที่มีเหตุผลให้พัก romance
- `advantageCurve`: ตอน/ช่วง, side with initiative, shift, cost, antagonist response และ evidence intent
- `durationPolicy`: `logicalShotCount` (ปัจจุบัน 9), allowed profile IDs, provider capability source และวิธีจัดการ `duration_pending`/legacy compatibility
- `sourceBreakdownVersionId`, `generatedAt`, `approvedAt`, `mode`

`episodeSlots[]` ต้องเก็บ `durationProfileId` และ duration vector ที่ slot นั้นใช้เมื่อพร้อม โดยแยกชัดเจนเป็น `logicalShotCount=9`, `shotDurationsSeconds` (ถ้ามีครบ 9 logical shots), `renderSegmentDurationsSeconds` (ความยาวตาม provider mapping ซึ่งอาจมี 8 หรือ 9 segments) และ `renderDurationSeconds` ที่ derive จาก mapping; ถ้า profile ยังไม่ถูกเลือกให้ใช้ `duration_pending` และห้ามเดา runtime

ถ้าทั้ง 9 shots ใช้ duration เดียวกัน runtime จะเท่ากับ `9 * duration`; ถ้าใช้ mixed profile ให้รวม duration ของ vector แทน ห้ามเก็บ `episodeRuntimeSeconds` เป็นค่าที่กรอกซ้ำได้โดยอิสระจาก vector หากจำเป็นต้องแสดงค่าให้ระบุว่าเป็น derived value พร้อม source profile/version

`episodeSlots[].activeThreadActions[]` ต้องอ้าง ID ใน `ledgers.threadLedger` หรือระบุเป็น `proposed_new` ที่ยังไม่ persist จนกว่าจะผ่าน budget/semantic review รูปแบบ action ที่อนุญาตคือ `advance`, `reveal`, `resolve`, `defer`, `merge_candidate`, `park`, `sequel_hook`

`threadLedger` เดิมต้องขยายแบบ backward-compatible ให้รองรับอย่างน้อย `scope`, `ownerCharacters`, `plantEpisode`, `payoffWindow`, `expectedEvidence`, `resolutionCost`, `lastEvidenceEpisode`, `statusReason` และสถานะ `active`, `stalled`, `resolved`, `parked`, `sequel_hook`, `legacy_unknown` โดยยังรักษา field เดิม เช่น `lastMovedEpisode` และ `mustMoveAgainByEpisode`

การขยายสถานะต้องมาพร้อม transition table: `parked`, `sequel_hook` และ `legacy_unknown` ห้ามถูก `reconcileLedgers` เปลี่ยนกลับเป็น `active` เพียงเพราะพบข้อความคล้าย label ในตอนถัดไป การกลับมาใช้งานต้องเป็น explicit `reopen` proposal ที่มี actor/reason และสร้าง lifecycle ใหม่หรือ ID ใหม่ตาม policy

### 3.3 Duration semantics และการค่อย ๆ เปลี่ยนจาก fixed runtime

หลักใหม่ของ story control คือ “จำนวน logical shots คงที่ตาม storyboard contract แต่ความยาว episode ไม่คงที่” โดยใช้ duration profile เป็นสะพานระหว่าง story planning กับ production:

1. `shotCount=9` ยังคงเป็นโครงสร้างของ storyboard ที่ skill ต้องส่งออก
2. แต่ละ logical shot รับ duration ที่ provider/catalog อนุญาต เช่น 8, 10, 15, 20, 25 หรือ 30 วินาที ตาม profile ที่เลือก
3. runtime ของ episode derive จาก logical-shot vector และผลรวม render segments ตาม mapping ที่ประกาศ ไม่ใช่ค่าคงที่ของ story planner
4. profile เดิม 60 วินาทีถูกเก็บเป็น `legacy_compat` สำหรับ episode/assembly ที่มีอยู่ ไม่ใช้เป็นกติกาของเรื่องใหม่
5. ถ้า assembly profile แปลง 9 frames เป็น 8 clips ให้เก็บ mapping และผลรวม output แยกจาก logical shot vector ไม่เปลี่ยนความหมายของ shot 1–9

สำหรับเป้าหมายซีรีส์ 2–3 ชั่วโมง ระบบต้องคำนวณจาก `sum(renderDurationSeconds ของทุก episode)` หลังเลือก profile/shot vector แล้ว จึงค่อยประเมินจำนวน episode ที่ต้องใช้ ถ้ายังไม่เลือก profile ให้แสดงเป็น runtime range/unknown ไม่สร้างจำนวนตอนจาก 60 หรือ 90 วินาที

การ rollout ระยะแรกไม่จำเป็นต้องเปลี่ยน assembly เดิมทันที: เพิ่ม schema/projection/validator แบบ additive, อ่าน 60-second record เดิมเป็น `legacy_compat`, เปิด profile ใหม่เฉพาะ episode ที่วางแผนหลัง approval และให้แต่ละ phase มี focused fixture ก่อนเปลี่ยน default production path

### 3.4 Story-control seed จากผู้สร้างแกนเรื่อง

ใน flow การคิดเรื่องเต็ม ให้ `vertical-drama-full-story-architect` สร้าง `story_control_seed` เฉพาะระดับซีซัน/อาร์กตั้งแต่รอบ outline แรก ประกอบด้วย premise anchor, core cast/relationship anchors, durable-thread candidates, romance phase skeleton และ advantage intent แบบสั้น ๆ การ seed นี้เป็น “เจตนาของผู้เขียน” ไม่ใช่ ledger ที่ระบบตัดสินเอง และไม่บรรจุ shot drafts ทั้งซีซัน

เมื่อ outline ถูก approve แล้ว `vertical-drama-ledger-planner` จึงทำหน้าที่ map/ตรวจ seed กับ episode breakdown และแปลงเฉพาะรายการที่สอดคล้องเป็น ledger/episode slots หาก seed ขัดกับ breakdown ให้หยุดที่ warning/review ไม่ให้ ledger planner แต่งเรื่องทับ seed หรือทำให้ full-story architect ต้องรับ context ledger ใหญ่ขึ้นในทุก chunk

### 3.5 ปฏิสัมพันธ์ของแหล่งข้อมูล

```text
approved story outline
        |
        v
ledger planner skill -- annotate, classify, schedule, never rewrite premise
        |
        v
versioned breakdown.ledgers + storyControl episode slots
        |
        v
bounded slot + relevant canon -> script-builder skill
        |
        v
episode script/storyboard -> memory planner observes actual evidence
        |
        +--> deterministic reconciliation (IDs, roles, dates, budgets)
        |
        +--> episode quality skill (payoff/romance/advantage/premise judgment)
        |
        v
append evidence + update materialized state, or needs_repair/user proposal
```

### 3.6 API และ persistence boundaries

- Read path: เพิ่ม/ขยาย read-only tRPC projection ของ `verticalDramaSeries` สำหรับ `storyControlState` โดยคืน active breakdown version, thread rows, status findings, evidence references, romance rhythm และ advantage curve ในรูปที่ UI ใช้ได้โดยไม่ต้องอ่าน raw `bible` เอง
- Legacy audit path: ใช้ procedure/job แยกสำหรับ `storyControlAudit` ซึ่งคืน report และไม่ mutate series; report ต้องมี `auditMode`, `sourceVersionId`, counts และรายการ classification
- User disposition path: การเลือก `carry`, `parked`, `sequel_hook` หรือการขอ `resolve_with_new_scene` ต้องเป็น proposal ที่มี actor, reason, source thread ID และ target future episode; การอนุมัติใช้ existing append-only breakdown/arc-replan flow ไม่ให้ UI เขียน `resolved` ตรง ๆ
- Episode write path: pipeline เป็นผู้ persist validated evidence/action หลังตรวจ series ownership, active version และ lock/produced status แล้วเท่านั้น
- ทุก response ต้องแยก `planned`, `observed`, `audit` และ `needsReview` ให้ UI ไม่แปล warning เป็น resolved state

## 4. หลัก skill-first ที่นำไปใช้ได้จริง

### 4.1 งานที่ skill ทำได้จริง

Skill เหมาะกับการตัดสินความหมายจากข้อความที่มี context จำกัดและชัดเจน เช่น:

- ปมนี้เป็นแกนเรื่องจริงหรือเป็นเพียง hook ชั่วคราว
- การเฉลยตอบคำถามที่ผู้ชมรอหรือเป็นคำตอบแบบยัดเข้ามา
- romance phase ในตอนนี้สอดคล้องกับสิ่งที่ตัวละครผ่านมาหรือไม่
- การสลับความได้เปรียบมีเหตุผล มี cost และทำให้เรื่องเดินหรือไม่
- dialogue/scene ยังอยู่ใน premise และไม่สลับความรู้ของตัวละครหรือไม่
- ควร merge, defer, park หรือแยก hook เพื่อรักษาแกนเรื่องอย่างไร

Skill ต้องได้รับข้อมูลเฉพาะที่จำเป็นและส่ง JSON ตาม contract ไม่ควรได้รับสิทธิ์แก้ persisted state โดยตรง

### 4.2 งานที่ deterministic code ต้องทำ

โค้ดต้องตรวจสิ่งที่เป็นข้อเท็จจริงได้เท่านั้น:

- thread ID ถูกลงทะเบียนและไม่ถูกเปิดซ้ำใน lifecycle เดียวกัน
- action อ้าง episode ที่ถูกต้องและอยู่ใน slot ที่ได้รับอนุญาต
- `resolve` มี evidence episode/beat หรือถูกเปลี่ยนเป็น `needs_repair`
- ไม่มี active thread หายจาก episode state โดยไม่มี `advance`, `defer`, `park` หรือ `sequel_hook`
- thread ไม่เกิน active/new-thread budget
- payoff window ไม่ย้อนกลับและไม่หมดอายุโดยไม่มี warning
- speaker/character/role ใช้ canonical key และอยู่ใน cast packet
- relationship pair เป็น canonical pair และไม่เกิด role reassignment เงียบ ๆ
- romance phase และ advantage plan ใช้ episode range ที่ถูกต้อง
- duration profile มี provider capability source, logical shot count ถูกต้อง และ duration vector ผ่าน allowed values
- `renderDurationSeconds` เท่ากับผลรวมจาก assembly mapping; ไม่มี fixed `60`/`90` ที่ขัดกับ profile
- ไม่บันทึกผลที่ schema invalid หรือแก้ version/episode ที่ locked แล้ว

### 4.3 ขอบเขต context ที่ส่งเข้า skill

ทุก call ต้องใช้ context แบบ 4 ชั้น:

1. **Immutable core**: premise anchor, genre/tone, canonical cast subset, world rules ที่เกี่ยวข้อง
2. **Current episode slot**: purpose, selected thread actions, romance/advantage beat, duration profile/vector, required characters, forbidden contradictions
3. **Recent state**: episode ล่าสุดที่เกี่ยวข้อง, unresolved thread summaries ที่เลือกมา, knowledge/trust changes ที่เกี่ยวข้อง
4. **Task instruction**: งานของ skill รอบนั้นและ output contract

ไม่ส่ง full ledger และไม่ส่ง open thread ทั้งหมดโดยอัตโนมัติ ให้ retrieval เลือกเฉพาะ thread ที่อยู่ใน slot, overdue, owner character เดียวกัน หรือเป็น premise-critical

การเพิ่ม context จะต้องมี budget test วัด serialized prompt size และต้องรักษาเพดาน retrieval policy เดิม (`maxPromptTokens`) หรือเพิ่มเพดานด้วยเหตุผลและ regression evidence เท่านั้น

## 5. ลำดับ implementation

### Phase 0 — Capability and safety benchmark (ไม่แตะ production state)

วัตถุประสงค์คือพิสูจน์ก่อนว่า skill ทำงานภายใต้ context ที่จำกัดได้จริง ไม่ใช่เพิ่ม field แล้วหวังว่า model จะตามได้

งาน:

- สร้าง fixture 3 แบบ: romance mystery 20–30 ตอน, short-form 6 ตอน และ fixture จาก series 21 ที่หยุดตรวจที่ตอน 25
- สำรวจและตรึงแหล่งข้อมูล provider/catalog ที่บอก allowed shot durations; story-control contract ต้องอ่าน capability จากแหล่งนี้ ไม่สร้างรายการ duration แยกแบบ hard-code
- สร้าง duration fixtures อย่างน้อย: uniform 8s x 9, mixed profile, provider profile ที่มี 15/20/25/30s และ legacy 60s assembly profile
- วัด parse success, output completeness, canonical character match, thread count, duplicate IDs, prompt token size, duration-vector validity, runtime derivation, romance phase coherence และ advantage continuity
- ให้ full-story architect เป็นผู้สร้าง story outline fixture; ledger planner มีหน้าที่ annotate outline เดิมเท่านั้น
- ทดสอบ failure cases: output truncated, missing `episodeSlots`, invented character, unknown thread ID, payoff ไม่มี evidence, romance beat ที่ขัด relationship state, vector ไม่ครบ 9 shots, duration ไม่อยู่ใน provider capability และ runtime ที่ถูกกรอกสวนทางกับผลรวม
- ทดสอบ seed/ledger conflict: เมื่อ `story_control_seed` หรือ ledger planner ขัดกับ approved breakdown ต้องคืน review state และห้าม mutate outline
- เกณฑ์ผ่าน: invalid output ไม่ถูก persist, retry มีได้หนึ่งครั้งแบบ targeted, และเมื่อ skill ประเมินไม่ได้ต้องคืน `needs_review` ไม่ใช่แต่งคำตอบเพิ่ม

ผลลัพธ์: benchmark report และ fixtures ที่ใช้เป็น baseline ก่อนเปิด feature flag

### Phase 1 — Canonical contract และ versioned storage

งาน:

- เพิ่ม shared schema/type สำหรับ `storyControl`, enhanced thread row, thread action, romance beat, advantage beat และ evidence reference
- เพิ่ม shared duration-profile/vector contract ที่แยก logical 9-shot plan, provider render mapping และ derived runtime; อ่าน record 60s เดิมแบบ `legacy_compat` โดยไม่ rewrite
- เพิ่ม schema/type ของ `story_control_seed` แยกจาก persisted `storyControl` และกำหนด adapter จาก seed -> approved control plan; seed ที่ยังไม่ approved ห้ามถูกอ่านเป็น enforcement state
- ขยาย `verticalDramaQualityLedgers` แบบ additive โดยไม่เปลี่ยนชื่อ camelCase เดิมที่ consumers ใช้อยู่
- เพิ่ม optional `storyControl` ใน active breakdown version schema และ helper read/write ที่ tolerant ต่อ legacy
- ทำให้ `open_threads` เป็น derived compatibility projection จาก canonical thread IDs ไม่ใช่ input/output source หลัก
- กำหนด status transition table และ reason codes ที่ UI/API ใช้ร่วมกัน
- เพิ่ม `contractVersion` และ `sourceBreakdownVersionId` เพื่อป้องกันอ่านแผนคนละรุ่น

ยังไม่เปิดบังคับใช้กับผู้ใช้เก่าใน phase นี้

### Phase 2 — Upgrade full-story seed และ existing ledger planner, ไม่สร้าง planner ซ้ำ

แก้ `apps/web/skills/vertical-drama-full-story-architect/skill.md` ให้มี output seed ระดับ outline และแก้ `apps/web/skills/vertical-drama-ledger-planner/SKILL.md`, schema/reference ที่เกี่ยวข้อง และ `apps/web/server/services/verticalDramaLedgerPlanner.ts` ให้:

- full-story architect ยังคงเป็นผู้ตัดสินแกนเรื่องและสร้าง narrative outline โดยประกาศ `story_control_seed` แบบสั้น ไม่ต้องเติม ledger fields ลงในทุก episode/shot
- seed ต้องระบุ core promise, ตัวละครคู่หลัก, relationship direction, durable-thread candidates และ phase/advantage intent ที่เป็นไปได้ตาม genre แต่อนุญาตให้มี `none`/pause และไม่บังคับสูตรเดียวทุกเรื่อง
- ถ้า seed สร้างไม่ครบหรือ parse ไม่ได้ ให้เก็บ outline เป็น draft/review และไม่เปิด deep drafting แบบ enforced
- ledger planner อ่าน seed + approved breakdown แล้วทำหน้าที่ annotate/validate ไม่คิด narrative replacement

- อ่าน approved breakdown และ cast/bible เดิม
- จัด scope ของ hook ตามความสำคัญของเรื่อง
- เติม payoff window/expected evidence เฉพาะปมที่ outline รองรับ
- สร้าง episode slots จาก beat/logline ที่มีอยู่ ไม่คิด episode ใหม่คนละเรื่อง
- สร้าง romance rhythm และ advantage curve เป็น planning annotations ระดับ episode
- ให้ episode slot อ้าง duration profile ที่เลือกจริงหรือ `duration_pending`; ใช้ profile เพื่อ derive speech/beat capacity ไม่ใช้ fixed episode seconds
- ให้ `proposed_new` หรือ `uncertain` ออกเป็น finding/review state ไม่ persist เป็น durable thread ทันที
- reject/flag เมื่อ skill พยายามเพิ่มตัวละครที่ไม่อยู่ใน canonical roster หรือเปลี่ยน premise anchor

เมื่อ ledger planner ให้ผลขัดกับ outline ให้เก็บเป็น planning warning และส่งกลับให้แก้ ledger/outline ผ่าน flow ที่ผู้ใช้อนุมัติ ไม่ให้ planner เขียนทับ outline อัตโนมัติ

### Phase 3 — Episode slot handoff และ skill contract ของ script builder

งาน:

- เพิ่ม bounded `episodeSlotContext` ให้ `verticalDramaScriptGeneration.ts`
- ส่ง duration profile/vector ของ slot เข้า script-builder และให้ speech budget ใช้ helper ต่อ-shotที่มีอยู่แล้วใน `contentBudget.ts`/`dialogueQuality.ts`
- ปรับ `vertical-drama-script-builder` ให้ส่ง `thread_actions`, `romance_beat`, `advantage_beat`, `character_role_bindings` และ `evidence_refs` ในระดับ episode
- ให้ `thread_actions` ใช้เฉพาะ action ที่ slot อนุญาต; หากบทต้องการปมใหม่ให้ส่ง `proposed_new_thread` พร้อมเหตุผล ไม่สร้าง ID ถาวรเอง
- บังคับให้ speaker/character ใช้ canonical key จาก cast packet
- คง output เก่าเพื่อ backward compatibility ในช่วง flag off โดยสร้าง projection ไป contract ใหม่เมื่อข้อมูลพอ
- ห้ามเติม action ลงจากข้อความ `open_loops` หลังจาก `episode_memory` parse ผ่านแล้ว; ให้มี reconciler เดียวที่รับ explicit action เท่านั้น

### Phase 4 — Evidence reconciliation และ quality loop

งาน:

- ขยาย `verticalDramaQualityLedgerReconcile.ts` ให้ reconcile action กับ actual episode content และ memory event
- เพิ่ม deterministic findings: `unknown_thread_id`, `silent_thread_drop`, `unproven_resolution`, `thread_budget_exceeded`, `character_role_mismatch`, `romance_phase_gap`, `advantage_streak_without_cost`, `payoff_window_missed`, `invalid_duration_profile`, `shot_runtime_mismatch`
- ตรวจว่า episode มี logical shot contract 9 รายการ, duration ทุก shot ผ่าน provider capability และ runtime ที่แสดงตรงกับ assembly output; ความผิดพลาดของ duration ต้องแยกจาก semantic quality finding
- ให้ `vertical-drama-series-memory-planner` รับ canonical thread IDs และส่ง evidence/state observation ไม่ใช่สร้าง future plan
- ทำ compatibility adapter สำหรับ memory planner/open-loop รุ่นเก่า: episode-specific fallback IDs หรือ hook ที่ไม่มี registered opening ให้เป็น `legacy_unknown`/observation เท่านั้น ห้าม promote เป็น canonical durable thread อัตโนมัติ
- ให้ `hook_resolved` เกิดได้เมื่อมี registered ID + explicit resolution action + evidence reference; semantic quality ของ payoff ให้ reviewer ตัดสินต่อ
- ขยาย episode quality review ด้วยมิติ `premise_adherence`, `arc_coherence`, `payoff_quality`, `romance_phase_fit`, `relationship_chemistry`, `power_shift_quality`, `canonical_character_consistency`
- ใช้ repair loop ได้สูงสุดหนึ่งรอบแบบ targeted โดยส่งเฉพาะ finding ที่เกี่ยวข้องกับตอนนั้น หากยังไม่ผ่านให้ `needs_repair`/user review
- การเปลี่ยนอนาคตหลายตอนให้ใช้ `arc_replan_proposal` เดิม ไม่แอบแก้ active version หรือ produced episodes

ทุก skill call ต้องผ่าน boundary เดิมของระบบ: ตรวจ tenant/user ownership ของ `seriesId`, ใช้ model/credit/rate-limit resolver เดิม, ไม่เปิด endpoint ใหม่ที่ข้าม auth, และไม่ persist ผลจาก series ที่ผู้ใช้ไม่มีสิทธิ์เข้าถึง หาก LLM call, schema retry, credit deduction หรือ rate limiter ล้มเหลว ให้คง state เดิมและบันทึก failure/needs-review; ห้ามเขียน partial ledger หรือ partial memory

### Phase 5 — Legacy audit และ current series ตอนที่ 25

งาน:

- สร้าง read-only audit ที่แยก `registered`, `matched`, `missing_opening`, `duplicate`, `legacy_unknown`, `overdue` และ `unresolved`
- ไม่ทำ automatic merge จาก description similarity และไม่ mark resolved จาก `threads_resolved` ที่ไม่มี opening/evidence
- สำหรับ series 21 ให้สร้าง future-horizon proposal ตั้งแต่ตอนถัดจากตอนที่ถูก lock/ผลิตแล้ว (ตามข้อมูลจริง ไม่ hard-code ว่าต้อง 26 หากมีตอนที่ยังไม่ผลิตอยู่ใน breakdown) โดยไม่แก้ตอน 1–25
- ให้ผู้ใช้เลือกแต่ละ legacy item ว่า `carry`, `resolve_with_new_scene`, `parked`, `sequel_hook` หรือ `legacy_unknown`; การเลือกต้องมีเหตุผลและผู้ดำเนินการ
- เปิด control gate กับตอนใหม่หลัง approval เท่านั้น; ข้อมูลเดิมยังแสดงใน UI และไม่ถูกลบ
- ถ้า old `episode_memory` ไม่มีโครงสร้างพอ ให้ใช้ audit-only ไม่พยายาม reconstruct plot ด้วย LLM แบบเงียบ ๆ
- อ่าน duration ของ episode เก่าจาก assembly/profile ที่มีหลักฐาน; ถ้าไม่มีให้แสดง `legacy_duration_unknown` หรือ `legacy_compat` ตามข้อมูลจริง ห้ามเดา 60/90 วินาทีและห้าม rewrite ตอนเก่า

### Phase 6 — UI/observability และ operational rollout

งาน:

- reuse `VerticalDramaSeriesMemoryStateTab` และ `VerticalDramaSeriesMemoryTab` ตามหน้าที่เดิม ไม่สร้างรายการปมคู่ขนาน
- รักษาขอบเขตของสองแท็บ: state tab แสดง/แก้ materialized episode memory ตาม contract เดิม ส่วน event-log tab แสดง append-only evidence; ห้ามรวม mutation หรือทำให้ผู้ใช้เข้าใจว่า event log เป็นแผนปมที่แก้ได้
- เพิ่ม filter/summary ของ story control: active, stalled, overdue, needs review, resolved evidence, parked, legacy unknown
- ใน card ของแต่ละ thread แสดง ID, scope, owner characters, opened/last moved/payoff window, evidence episode/beat, resolved episode/time, status reason และ source version
- แสดง romance rhythm และ advantage curve เป็น timeline แบบ read-only ก่อน ไม่ให้ UI บังคับเขียนบทหรือ reorder episode โดยตรง
- แสดง duration profile, logical shots, runtime ที่ derive แล้ว และสถานะ `duration_pending`/`legacy_compat`; UI ต้องไม่แสดงว่า episode ทั้งหมดมี 60 วินาทีโดยอัตโนมัติ
- เพิ่ม link จาก finding ไป episode/beat ที่เป็นหลักฐาน และแยก “ยังไม่พิสูจน์การเฉลย” ออกจาก “ปมยังเปิด” ให้ชัด
- rollout flags: `storyControlPlan`, `storyControlAudit`, `storyControlEnforced`; default ของ legacy เป็น audit-only

### Phase 7 — เปิดใช้ทีละระดับ

1. เปิด benchmark/validator แบบ no-write
2. เปิด plan generation สำหรับซีรีย์ใหม่ แต่ยังให้ผู้ใช้ approve ก่อน active
3. เปิด episode slot + structural gate สำหรับซีรีย์ใหม่
4. เปิด semantic quality/review และ repair loop
5. เปิด future-horizon audit ให้ซีรีย์เดิม รวม series 21
6. จึงพิจารณาเปิด enforcement กับ replan ที่ผู้ใช้อนุมัติ

ทุก phase ต้องมี kill switch ที่ fallback เป็น flow เดิมโดยไม่ลบ plan/evidence ที่สร้างไว้

## 6. Acceptance criteria

### Story integrity

- ทุก episode ที่สร้างภายใต้ enforcement อ้าง `sourceBreakdownVersionId` และ `episodeSlot`
- ทุก episode ที่สร้างภายใต้ enforcement อ้าง duration profile/vector; runtime ที่แสดงคำนวณได้จาก shots จริง และไม่มี validator ที่ใช้ 60/90 วินาทีเป็น canonical rule
- ไม่มี episode ใหม่ที่เปลี่ยน premise anchor, canonical character role หรือ relationship fact โดยไม่มี explicit proposal
- full-story architect ยังคงเป็นผู้สร้างแกนเรื่อง; ledger planner ไม่สามารถทำให้ outline เปลี่ยนเพียงเพื่อให้ ledger ผ่าน
- prompt ของ script builder มีเฉพาะ relevant slot/state และผ่าน context budget test

### Thread integrity

- durable thread ทุกตัวมี stable ID, scope, owner, plant episode, payoff window และ expected evidence หรือสถานะ `parked`/`sequel_hook`/`legacy_unknown`
- ไม่มี silent drop ระหว่าง episode state
- ไม่มี `resolved` ที่ขาด registered opening, explicit action หรือ evidence
- `moment_hook` สามารถจบในตอนหรือกลายเป็น retention detail โดยไม่เพิ่ม season debt
- active thread/new thread budget ตรวจได้และมี warning/repair เมื่อเกิน

### Character and relationship integrity

- ทุกชื่อที่ใช้ใน script/relationship action resolve กับ canonical cast matrix
- ไม่มีการส่งตัวละครที่ไม่เกี่ยวข้องเข้า episode prompt เพื่อประหยัด context และลด role confusion
- romance phase มีเหตุผลต่อเนื่องกับ relationship state; gap warning เป็นข้อมูลให้ skill/reviewer ไม่ใช่คำสั่งให้ยัดฉากหวาน
- advantage beat ระบุผู้ได้เปรียบ, shift, cost และ antagonist response หรือเหตุผลว่าทำไม episode นั้นจงใจคงดุลเดิม

### Legacy and safety

- series 21 และ series เก่าทั้งหมดอ่านได้เหมือนเดิมเมื่อ flag off
- audit ไม่ mutate episode/bible/memory โดยอัตโนมัติ
- produced/locked episode ไม่ถูก rewrite จาก validator หรือ repair loop
- model/schema failure ไม่ทำให้ partial plan ถูก persist
- มี focused tests และ browser evidence สำหรับทุก changed flow; full-repo baseline failures แยกจาก focused result

## 7. UI/UX Contract

### Target User / JTBD

- Role: ผู้สร้าง/ผู้ตรวจซีรีย์ Vertical Drama และผู้ดูแลคุณภาพเนื้อหา
- Goal: รู้ว่าปมใดเปิดอยู่ ปิดเมื่อไร ปิดด้วยหลักฐานอะไร ปมใด legacy/ไม่รู้สถานะ และตอนถัดไปถูกวางให้เดินแกนใด
- Entry point: `/drama-series/:seriesId` ใน tab `seriesMemory`/memory state และลิงก์จาก quality finding ไป episode workspace
- Success outcome: ผู้ใช้ตรวจสถานะ continuity, romance rhythm และ advantage curve ได้โดยไม่ต้องอ่าน prompt หรือเดาจากข้อความสรุป

### Existing Pattern Reference

- Search performed with targeted `rg` for `VerticalDramaSeriesMemoryStateTab`, `VerticalDramaSeriesMemoryTab`, `VerticalDramaMemoryTimeline`, and route `/drama-series/:seriesId`.
- Found patterns: `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSeriesMemoryStateTab.tsx`, `VerticalDramaSeriesMemoryTab.tsx`, `VerticalDramaMemoryTimeline.tsx`, and `VerticalDramaSeriesDetailPage.tsx`.
- Decision: reuse.
- Reason: current memory state tab already shows thread IDs, resolved history, loading/error/read-only behavior, and the page already owns the tab routing. Add control metadata to this surface rather than introduce a second source-of-truth page.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Series memory state | `VerticalDramaSeriesDetailPage.tsx`, `/drama-series/:seriesId?tab=seriesMemory` | Add control summary, statuses, filters, evidence links |
| Thread card/history | `VerticalDramaSeriesMemoryStateTab.tsx` | Add scope, owner, age, payoff/evidence/resolved metadata |
| Quality finding deep link | Existing quality review/episode workspace surfaces | Link finding to source episode/beat; no new editing authority |
| Story control timeline | Same `seriesMemory` surface, collapsible read-only section | Show romance phase and advantage curve |
| Legacy audit | Same surface, audit-only panel | Show unknown/missing opening without marking resolved |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaSeriesMemoryStateTab` | existing file | query state, tab composition, read-only/edit boundary | series memory + story control projection |
| `StoryControlSummary` | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryControlSummary.tsx` | aggregate counts, duration profile status and warning labels | derived deterministic status/duration counts |
| `ThreadControlCard` | `VerticalDramaSeriesMemoryStateTab.tsx` or extracted `VerticalDramaThreadControlCard.tsx` | one thread's identity/status/evidence display | enhanced thread row |
| `StoryRhythmTimeline` | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryRhythmTimeline.tsx` | romance/advantage and duration-profile read-only timeline | episode slots and quality findings |
| `LegacyThreadAuditPanel` | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaLegacyThreadAuditPanel.tsx` | legacy classification display | audit report |

No component may mutate a produced episode or directly mark a thread resolved. Any future edit action must use the existing proposal/approval flow.

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | preserve existing skeleton; summary/cards not shown as zero | component test + browser screenshot |
| empty/no plan | explain that story control has not been generated; show legacy memory if available | component test |
| audit-only | clear badge; show warnings and unknown items; no enforcement language | component test + browser evidence |
| success/enforced | show counts, IDs, payoff/evidence and active filters | component test |
| partial success | show plan loaded but semantic review/audit incomplete, never imply all closed | component test |
| duration pending/legacy compat | show profile status and derived/unknown runtime explicitly; never display fixed 60s as universal | component test + browser evidence |
| error | preserve cached data if available and show actionable retry/error copy | component test |
| disabled/read-only | hide/disable mutation affordances; keep inspection links | component test |
| selected/hover/focus | selected filter/card remains obvious; focus ring visible | keyboard/browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | cards stack; status/ID remain visible; timeline becomes horizontal scroll or compact list; no hidden evidence fields | Playwright/screenshot |
| tablet 768x1024 | two-column cards only when readable; filters wrap | Playwright/screenshot |
| laptop 1024x768 | preserve current sidebar/content arrangement; no accidental horizontal page overflow | Playwright/screenshot |
| desktop 1440x900 | summary + filters + two-column thread cards/timeline fit existing density | Playwright/screenshot |
| small-mobile 360x800 | ID/status use wrap/truncation with accessible full label; actions remain reachable | Playwright/screenshot |
| wide-desktop 1280x800 | dense cards may use two columns, but evidence metadata cannot be clipped | Playwright/screenshot |

### Accessibility Acceptance

- Keyboard can reach filters, thread cards, evidence links and accordions in reading order.
- Every status badge and icon-only action has an accessible name; IDs are selectable/copyable as text.
- Collapsible timeline/audit panels expose semantic headings and expanded state.
- Focus rings, contrast and existing light/dark tokens remain visible.
- Color is never the only signal for overdue, resolved, legacy or needs-review.
- Reduced-motion preference disables timeline animation; motion is not required to understand status.

### Visual Direction and Design Token Extraction

Sources: existing `VerticalDramaSeriesMemoryStateTab.tsx`, `VerticalDramaSeriesMemoryTab.tsx`, `VerticalDramaMemoryTimeline.tsx`, shared UI primitives under `apps/web/client/src/components/ui/`, and current theme tokens.

- Color: reuse existing semantic `Badge`, `Alert`, `Card`, and status variants; no raw hex values.
- Typography: preserve current Thai body/label/caption scale and monospace treatment for IDs already used by the tab.
- Spacing/radius/elevation: reuse existing Card, Accordion, Separator, Skeleton and Button primitives; do not introduce a new visual language.
- Motion: restrained expand/collapse only; honor reduced motion.
- Density: balanced operational view; show identity and status first, secondary evidence in expandable content.
- Do not change the existing sidebar, route tabs, or memory edit granularity as part of this plan.

### Copy Contract

- Tone: clear, factual, non-accusatory Thai; English fallback follows existing locale behavior.
- Primary language: Thai (`th`); all labels need English fallback where the component already supports it.
- Required labels: `รหัสปม`, `ขอบเขต`, `ผู้เกี่ยวข้อง`, `เปิดในตอน`, `คืบหน้าล่าสุด`, `ช่วงเฉลย`, `หลักฐานการเฉลย`, `ปิดในตอน`, `ค้างเกินกำหนด`, `ยังไม่ทราบจากข้อมูลเก่า`, `พักปม`, `ปมสำหรับภาคต่อ`.
- Validation/error copy must distinguish `ยังไม่พบหลักฐานการเฉลย` from `ปมยังเปิดอยู่` and `ไม่พบรายการเปิดปมต้นทาง`.
- Empty/loading/success copy must never say “ปิดครบ” when the system only has an audit or unresolved legacy state.
- Localization fallback: reuse current `verticalDramaSeriesMemoryCopy` pattern; no hard-coded English-only labels.

### Browser Evidence Required

Use `implementation/ui-browser-evidence.md` following `ui-browser-verification.md` with mobile 390x844, tablet 768x1024 and desktop 1440x900 required; add small-mobile/laptop/wide-desktop because the surface is data-dense and sits beside a sidebar. Verify no console errors, no unintended overflow, keyboard path, accessible names, loading/empty/error/read-only states, and light/dark readability.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Ledger checklist overwhelms the writer | bounded episode slot, only relevant state, thread scopes and budgets |
| Skill invents a different story | planner annotates approved outline; conflict is warning/review, never rewrite |
| Too many romance beats become repetitive | phase windows and gap warnings, with `none`/pause allowed and semantic review |
| Advantage curve becomes mechanical | schedule initiative/cost/response as intent; skill writes scene and reviewer judges quality |
| Legacy data appears falsely fixed | explicit `legacy_unknown`/`missing_opening`; no similarity auto-merge |
| Two memory sources diverge | explicit action/evidence reconciler; `open_threads` becomes projection only |
| New contract breaks existing production | optional versioned fields, flags, fallback, append-only versions, focused fixtures |
| Prompt/token cost grows | context budget benchmark and relevant-subset retrieval |
| Reviewer over-repairs episode | one targeted repair; cross-episode changes require proposal/user approval |
| Two users/jobs write against different plan versions | include `sourceBreakdownVersionId` and active-version compare at persist time; stale writes become reviewable conflict, never last-write-wins |
| Unauthorized series access through a new control endpoint | reuse existing tRPC auth/tenant ownership guards and add negative authorization tests for every read/write procedure |
| LLM/credit/rate-limit failure after a valid prior state | persist only after full schema + ownership + transition validation; retain prior version and expose retry/needs-review |
| Story planner กลับไปยึด fixed 60/90 วินาที | แยก logical shot contract จาก render duration profile, เพิ่ม duration-vector fixtures และทำให้ fixed runtime ใช้ได้เฉพาะ `legacy_compat` |
| 9 logical shots กับ 8 provider clips ของ frame-bridge profile ให้ runtime/beat ไม่ตรงกัน | เก็บ explicit mapping และคำนวณ output runtime จาก render segments ขณะยังรักษา shot identity 1–9 |
| เปลี่ยน duration profile แล้วบทพูดล้นหรือเนื้อหาแน่นเกิน | derive speech/beat budget ต่อ shot จาก duration จริง, ให้ quality reviewer ตัดสิน semantic pacing และเปิด profile ใหม่แบบ gradual |

## 9. Definition of ready for implementation

Implementation should not start until:

- Phase 0 fixtures and capability criteria are accepted.
- The single-source-of-truth decision in section 3 is approved.
- Existing quality ledger keys and consumers are mapped; no second ledger namespace is introduced.
- Current series 21 treatment is explicitly audit/future-horizon and not retroactive.
- Skill-vs-code responsibility matrix is represented in contract tests.
- UI contract and browser evidence plan are accepted.
- duration semantics, legacy compatibility boundary และ vector/runtime fixtures are accepted; ไม่มีส่วนใดของ plan ใช้ fixed 60/90 เป็น source of truth

The implementation must use the existing append-only breakdown-version policy. Phase 1 adds no mandatory database migration: new fields are optional JSONB inside the versioned bible/ledger shape and existing memory-event rows remain the audit trail. If a later phase proves that concurrent plan editing needs a dedicated revision table, that is a separate approved migration with backfill/audit and cannot be smuggled into this rollout.

Implementation is complete only when focused tests, schema/flow regressions, legacy audit proof, and required browser evidence all pass. A repository-wide typecheck failure unrelated to this flow must be reported separately and cannot be silently presented as a clean global pass.
