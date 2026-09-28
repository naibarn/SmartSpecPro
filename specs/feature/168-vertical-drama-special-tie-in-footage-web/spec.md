# Feature 168 — Special Tie-in Footage-first Web Flow

**Status:** Implementation-ready specification  
**Date:** 2026-08-30  
**Owner:** Vertical Drama Web / Skill / Billing  
**Depends on:** Feature 160 visual-source and B-roll contracts, Feature 161 async skill jobs, Feature 162 Worker-first media intelligence, Feature 166 credit lineage, existing Special Tie-in flow and managed media boundary

## 1. Objective

เปลี่ยนหน้า `สร้างตอนพิเศษ Tie-in` ให้เป็น flow แบบ Footage-first:

```text
Upload footage จริง
  -> Worker วิเคราะห์และถอดเสียง
  -> ผู้ใช้ตรวจสอบช่วงที่ใช้ได้และสร้าง prepared footage
  -> ระบบสร้างเรื่อง Tie-in แบบไม่มีบทพูดใหม่
  -> ผู้ใช้ตรวจสอบเรื่องและการกระทำ
  -> แตกเป็น 9 ช็อตเมื่อกดยืนยัน
  -> วาง AI B-roll ตามเวลาบน footage จริง
  -> Worker render และเผยแพร่ revision ใหม่
```

ผลลัพธ์ต้องเป็นละครซีรีย์ที่มีเหตุการณ์ต่อเนื่องและ Tie-in อย่างเป็นธรรมชาติ ไม่ใช่หน้าสำหรับยืนรีวิวสินค้าโดยตรง

## 2. Product decisions

1. เพิ่ม flow ใน `SpecialTieInEpisodeDialog` เดิม แต่แสดงเป็น 3 ขั้นที่มีสถานะชัดเจน ไม่สร้างหน้าใหม่ใน MVP
2. Upload จากเว็บใช้ direct-to-managed-storage ผ่าน presigned upload; เว็บและ Server ห้าม decode หรือ transcode วิดีโอใน request
3. Footage ต้นฉบับ immutable; การ trim, dead-air removal, crop และการรวมคลิปสร้าง derived artifact/revision ใหม่เสมอ
4. `ไม่มีบทพูด` หมายถึงระบบไม่สร้างบทพูดใหม่ให้ตัวละคร ไม่ได้หมายความว่าเสียงพูดใน footage ต้นฉบับต้องถูกลบ ผู้ใช้ต้องเลือกว่าจะคงหรือ mute เสียงต้นฉบับ
5. Transcription เป็นหลักฐานประกอบการเข้าใจ footage และเป็น guide ให้ Skill ไม่ใช่การยืนยันว่าใครเป็นผู้พูดหรือเป็นข้อเท็จจริงทางสินค้า
6. ไอเดียต้องสร้างเป็นเรื่องแบบมนุษย์อ่านเข้าใจง่ายก่อน แล้วจึงแตกเป็น shot plan 9 ช็อตหลังผู้ใช้ยืนยันเรื่อง
7. AI B-roll เป็น `overlay/cutaway` โดย default และ mute โดย default; การแทนช่วง footage ต้องเป็นตัวเลือกที่ผู้ใช้สั่งเอง
8. Worker เป็นผู้ประมวลผลหนักทั้งหมด; Server เป็นเจ้าของ auth, job state, Skill, contract validation, credit ledger และ metadata
9. การสร้างไอเดียแต่ละรอบใช้ variation seed ใหม่และเก็บใน history; refresh ห้ามแสดงผลรอบเก่าเป็น current draft โดยอัตโนมัติ
10. Flow นี้ใช้ contract family `special_tie_in_footage_v2`; records/ideas ของ Special Tie-in รุ่นเดิมยังอ่านได้ แต่ห้ามถูก hydrate หรือแปลง shape แบบเงียบ ๆ เป็นรุ่นใหม่

## 3. Scope and non-goals

### In scope

- Upload/เลือก managed video ใน Special Tie-in dialog
- Fullscreen preview, metadata, waveform และ timeline markers
- Worker job status ที่คงอยู่เมื่อปิด dialog หรือ refresh
- FFprobe, speech/dead-air/visual analysis result projection
- HyperFrames/Whisper word-level transcript integration
- Footage Story Guide ที่ส่งเข้า Marketplace Tie-in Skill
- สร้างไอเดีย 3 ใบต่อรอบ โดยใช้เฉพาะตัวละครที่เลือกจริง
- โหมดมีบทพูด/ไม่มีบทพูด และ validation ที่สอดคล้องกับ mode
- human-readable story, action/gesture, product rationale และ prohibited claims
- review story ก่อนแตกเป็น 9 shots
- timeline intent สำหรับวาง AI B-roll ที่ `startSec/endSec`
- additive look/scene slot requests เมื่อเรื่องต้องใช้ลุคหรือสถานที่ใหม่
- credit context, idempotency, retry, stale protection และ audit

### Out of scope

- การแก้ไขวิดีโอต้นฉบับแบบ destructive
- การตีความ transcript เป็น speaker diarization โดยไม่มีหลักฐานรองรับ
- การให้ AI ตัดสินว่าข้อความสินค้าเป็นข้อเท็จจริงทางกฎหมาย
- การสร้างบทพูดใหม่ในโหมดไม่มีบทพูด
- การ render ใน Browser หรือ Server request
- การบังคับใช้ AI B-roll ทุกช็อต
- การเปลี่ยน normal episode flow หรือ normal episode numbering

## 4. UI flow

### 4.1 Step 1 — เตรียม Footage จริง

วางส่วนนี้ด้านบนของ dialog หลังข้อมูลตอน/โหมด และก่อนภาพ Marketplace กับปุ่มสร้างไอเดีย

องค์ประกอบ:

- `อัปโหลด Footage จริง`
- `เลือกจาก Managed Media`
- รายการไฟล์พร้อม thumbnail, duration, resolution, orientation, audio badge และ upload state
- ปุ่ม `ดูภาพเต็มจอ`
- ปุ่ม `วิเคราะห์ Footage`
- สถานะ `กำลังวิเคราะห์`, `พร้อมตรวจสอบ`, `ล้มเหลว`, `ต้องลองใหม่`
- ถ้า transcript/visual guide ได้ผล `partial` หรือ `unavailable` ต้องแสดงคำเตือนและเหตุผลชัดเจน; ห้ามให้ปุ่มดำเนินต่อดูเหมือนผลวิเคราะห์สมบูรณ์
- player/timeline ที่มี markers ของ speech, silence, black/frozen frame และ scene cut
- ค่า trim start/end ที่แก้ไขได้
- ตัวเลือกเสียงต้นฉบับ: `คงเสียง`, `ปิดเสียง`, `คงเฉพาะช่วงที่เลือก`
- ปุ่ม `สร้าง Footage พร้อมใช้`

ห้ามเปิดขั้นสร้างไอเดียจนกว่า prepared artifact จะอยู่ในสถานะ `ready` เว้นแต่ผู้ใช้เลือกสร้างไอเดียจาก footage ดิบอย่างชัดเจนใน future mode; MVP ใช้ prepared-only เพื่อป้องกันเรื่องหลุดจากเวลาที่จะ render จริง

### 4.2 Footage Story Guide panel

แสดงก่อนปุ่มสร้างไอเดียและเปิดแบบอ่านได้ทันที แต่รายละเอียดเชิงเทคนิคอยู่ใน disclosure แยก:

- `สิ่งที่เห็น/ได้ยินจาก footage`
- `ช่วงเวลาที่แนะนำให้ใช้`
- `กิจกรรมและบริบทที่ระบบคาดว่าเห็น`
- `คำพูดสำคัญพร้อมเวลา`
- `แนวทาง Tie-in ที่เข้ากัน`
- `สิ่งที่ระบบไม่ควรแต่งเพิ่ม`
- confidence และแหล่งข้อมูลของแต่ละรายการ

ข้อความต้องระบุว่าเป็น “แนวทางจากการวิเคราะห์” ไม่ใช่การยืนยันบุคคล/สถานที่/สรรพคุณ

### 4.3 Step 2 — เรื่อง Tie-in

ใช้ข้อมูลสินค้า/ร้านค้า/สถานที่, ภาพ managed media, Customer Journey, Footage Story Guide และตัวละครที่ผู้ใช้เลือก

ถ้า guide มีสถานะ `partial` หรือ `unavailable` ผู้ใช้ต้องกดรับทราบคำเตือนก่อนสร้างเรื่อง และ payload ต้องส่งสถานะ/unknowns เดิมเข้า Skill เสมอ ระบบห้ามแสดงหรือบันทึกผลว่าเป็นการวิเคราะห์ครบถ้วน

ตัวเลือกด้านบนขวาเป็น authoritative:

- `มีบทพูด`: ผลลัพธ์มีบทพูดที่ระบุ speaker ชัดเจน และต้องใช้เฉพาะ speaker ที่เลือก
- `ไม่มีบทพูด`: ผลลัพธ์ต้องไม่มี `dialogueLines` และต้องบรรยายการแสดง/ท่าทางแทน ห้ามมีคำสั่งให้ตัวละครพูด กระซิบ ตอบ หรือสนทนา

ก่อนสร้างไอเดียต้องมี LLM model ที่ valid และมี default จาก model ที่ admin mark recommended; ผู้ใช้เปลี่ยนได้ผ่าน searchable scrollable selector และต้องแสดง selector แบบเดียวกันสำหรับ `Model สร้างภาพ` และ `Model สร้างวิดีโอ` ที่ใช้สร้าง AI B-roll/prompt ของตอนนี้ ทั้งสามช่องต้องค้นหาได้ เลื่อนรายการได้ แสดง capability/อัตราส่วน/ข้อจำกัด และตรวจจาก catalog ปัจจุบันก่อน submit

Default model resolution เป็น deterministic: เลือก active model ที่ admin mark `recommended` ตาม priority สูงสุด แล้วใช้ `updatedAt` ล่าสุดและ `modelId` เป็นตัวตัดสินกรณีเสมอ; หากไม่มี model ที่ compatible ให้แสดง `ไม่มี model ที่พร้อมใช้งาน` และ disable เฉพาะ action ที่ต้องใช้ model นั้น ห้าม fallback ไปยัง model ที่ browser จำค่าไว้

ผลลัพธ์ 3 ใบแต่ละใบต้องมี:

- ชื่อแนวคิด
- เรื่องราวแบบต่อเนื่อง 1 ตอน ภาษามนุษย์อ่านเข้าใจได้
- เหตุการณ์ตั้งต้น/ปัญหา/การคลี่คลาย
- ฉากและช่วงเวลาที่อ้างอิงกับ footage
- เหตุผลที่สินค้าปรากฏในเรื่อง
- บทพูดที่ใช้จริง เฉพาะ mode มีบทพูด
- ท่าทาง สีหน้า blocking และการกระทำ
- ประโยชน์ที่พูด/แสดงได้ตามข้อมูลสินค้า
- claims ที่ห้ามเกินจริง
- continuity/DNA checks
- suggested B-roll windows
- additive look/scene slot requests ถ้าจำเป็น

การ์ดไอเดียต้องแยก `เรื่องละคร` และ `บทพูด/ท่าทาง` ให้แก้ไขได้ชัดเจน แต่ยังต้องมี narrative ฉบับอ่านต่อเนื่องให้ตรวจสอบก่อน

### 4.4 Story review gate

เมื่อเลือกไอเดีย ให้เปิด editor แบบสองส่วน:

1. `เรื่องราวฉบับเต็ม` — prose ต่อเนื่อง แก้ไขได้
2. `การแสดงและบทพูด` — scene/beat rows แยกชัดเจน แก้ speaker, line, gesture, intention ได้

โหมดไม่มีบทพูดต้องแสดง `บทพูด: ไม่มี — ใช้การแสดงและท่าทางแทน` และ reject หากมี line ที่ไม่ว่าง

ปุ่มถัดไปคือ `ยืนยันเรื่องและสร้าง 9 ช็อต` ไม่ใช่ปุ่ม render ทันที ผู้ใช้ต้องเห็นและแก้เรื่องก่อน

### 4.5 Step 3 — วาง AI B-roll

หลัง story review และ 9-shot plan ผ่าน validation:

- แสดง video player ของ prepared footage
- แสดง timeline วินาทีจริงและช่วงที่มี speech/important action
- เลือก AI video ที่เป็น managed artifact
- กำหนด `เริ่มที่วินาที`, `จบที่วินาที` หรือ duration
- เลือก `overlay/cutaway` หรือ `replace` พร้อม warning
- เลือก fit/crop และ audio policy
- แสดง conflict เมื่อวางทับ speech สำคัญหรือเกิน footage duration
- preview แบบ low-cost ก่อน render
- ปุ่ม `ส่ง Worker render`

การเปลี่ยน story, prepared revision, source transcript หรือ selected character หลังสร้าง placement ต้องทำให้ placement/shot plan เป็น `stale` และไม่ render ด้วย snapshot เก่า

### 4.5.1 ความสัมพันธ์ระหว่าง 9 ช็อตกับ footage timeline

9 ช็อตคือ narrative/production beats ของตอน ไม่ได้หมายความว่าจะนำ footage จริงไปแบ่งเป็น 9 ส่วนเท่า ๆ กันโดยอัตโนมัติ ในขั้นยืนยัน 9 ช็อต แต่ละช็อตต้องมี `baseWindow` ที่อ้างถึงช่วงเวลาของ prepared footage หรือระบุว่าเป็น beat ที่ใช้เป็น context เท่านั้น

- ถ้ามี `baseWindow` ให้ B-roll placement ของช็อตนั้นใช้ prepared time และตรวจไม่ให้เกิน window เว้นแต่ผู้ใช้เลือก `ข้ามขอบเขตช็อต` พร้อมยืนยัน
- ถ้าไม่มี `baseWindow` ระบบห้ามเดาเวลาและห้ามวาง B-roll อัตโนมัติ ให้ผู้ใช้กำหนดเวลาเอง
- การสร้าง 9 ช็อตไม่สร้างหรือ render AI B-roll โดยอัตโนมัติ
- `overlay/cutaway` เป็นการวางภาพประกอบบน timeline เดิม; `replace` ต้องแสดงผลกระทบต่อเสียงและเนื้อหา footage ก่อนยืนยัน

### 4.6 Reload/history behavior

- current dialog state เก็บเฉพาะ input draft และ job references ที่ยังดำเนินอยู่
- generated ideas เก็บใน history พร้อม run/version/model/guide fingerprint
- refresh ไม่ hydrate ideas ล่าสุดเข้า current idea cards
- ผู้ใช้กด `ดูประวัติไอเดีย` แล้วเลือกนำกลับมาเป็น draft ใหม่ได้
- prepared footage และ Worker job status ต้อง hydrate กลับมาได้ เพราะเป็นงานที่กำลังดำเนินการ/ผลลัพธ์ถาวร
- story/ideas ที่ยังไม่ได้กด `บันทึกฉบับตรวจสอบ` ไม่ถือเป็น current draft ที่ต้อง hydrate; history เท่านั้นที่ใช้เปิดกลับมาอย่างชัดเจน

## 5. Shared contract boundary

Web และ Worker ต้องใช้ versioned Zod/JSON contract เดียวกัน โดยกำหนดใน shared package ไม่สร้าง shape เฉพาะหน้าเว็บหรือ Rust ที่ตีความต่างกัน

### 5.1 Footage analysis envelope

```json
{
  "schemaVersion": "vd-footage-guide-v1",
  "sourceAssetId": "media_123",
  "sourceRevision": 2,
  "sourceFingerprint": "sha256:...",
  "timelineTimebase": "milliseconds",
  "probe": {
    "durationMs": 38400,
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "hasAudio": true
  },
  "speechRanges": [{ "startMs": 4200, "endMs": 8900 }],
  "silenceRanges": [{ "startMs": 0, "endMs": 3100, "kind": "leading" }],
  "sceneRanges": [{ "startMs": 3100, "endMs": 14800, "confidence": 0.82 }],
  "keyframes": [{ "timeMs": 5000, "assetId": "frame_1" }],
  "transcript": {
    "language": "th",
    "model": "large-v3",
    "text": "ลองเรียงจากชิ้นใหญ่ไปชิ้นเล็กดูนะลูก",
    "tokens": [{ "text": "ลอง", "startMs": 4200, "endMs": 4600 }]
  },
  "semanticGuide": {
    "observations": [{ "text": "เห็นของเล่นสีสดหลายชิ้นบนพื้น", "confidence": 0.72, "evidence": "frame_1" }],
    "recommendedTieIn": [{ "text": "ใช้ช่วงเด็กกำลังจัดเรียงของเล่นเป็นบริบท", "evidence": "speech:4200-8900" }],
    "avoid": [{ "text": "ห้ามสรุปว่าใครเป็นผู้พูดจากภาพนี้", "evidence": "analysis-policy" }],
    "confidence": 0.72
  },
  "status": {
    "probe": "ready",
    "transcript": "ready",
    "visual": "partial",
    "guide": "partial",
    "warnings": ["visual_analysis_partial"]
  }
}
```

Hard facts, model observations, and user edits must be separate fields. A text-only observation must never mutate Character DNA or Scene Visual State. Partial/unavailable analysis must be visible and cannot be represented as an empty successful result.

Each `status` field is one of `ready | partial | unavailable | failed`; `ready` is allowed only when that source produced a validated result, while `partial/unavailable/failed` must carry a bounded warning/reason code.

เวลาใน API/contract ให้เก็บเป็น integer milliseconds (`startMs`, `endMs`) เป็นหลัก; `startSec/endSec` ที่แสดงใน UI เป็น decimal projection เท่านั้นและต้อง round กลับตาม timebase เดิม การแปลงต้องไม่ทำให้ช่วงเวลาสั้นลงหรือปลายทางเกิน duration

### 5.2 Story and B-roll contract

The web-owned input to the Skill must include:

- product/store/location snapshot and managed image IDs
- Customer Journey snapshot
- selected character IDs only, with bounded DNA and relationship facts
- `dialogueMode`
- selected LLM model snapshot
- prepared footage ID/revision and Footage Story Guide
- previous idea fingerprint and new variation seed

Model snapshot ต้องมี `modelId`, `provider`, `catalogVersion`, `recommendedAtSelection` และ `capabilitySnapshot`; Server ต้อง resolve จาก catalog ปัจจุบันอีกครั้งและ reject model ที่ถูกปิด/ไม่รองรับก่อนเรียก Skill ไม่ใช้ค่า default จาก browser เก่า

Character identity ใน payload ใช้ canonical character ID เป็นหลัก ชื่อที่แสดงเป็นค่าที่ Server resolve จาก ID เท่านั้น; adapter ต้อง reject ทั้ง ID และชื่อที่ไม่อยู่ใน selected allowlist และต้องไม่ใช้ชื่อซ้ำ/ชื่อที่โมเดลแต่งขึ้นเป็นตัวระบุบุคคล

The output must contain exactly three ideas. A story-confirmation payload must include the selected idea ID, edited prose/beats, guide fingerprint, character IDs, and dialogue mode. A B-roll placement must include:

```text
placementId, baseFootageRevision, sourceMediaAssetId, sourceRevision,
storyBeatId, timelineTimebase, startMs, endMs, sourceInMs, sourceOutMs,
placementMode, fitMode, baseAudioPolicy, brollAudioPolicy, reason, approvedByUser
```

Server validates all IDs and times; client values are suggestions only.

Allowed values are versioned and shared: `dialogueMode = with_dialogue | no_dialogue`; `placementMode = overlay | cutaway | replace`; `fitMode = cover | contain | crop`; `baseAudioPolicy = preserve | mute | selected_ranges`; `brollAudioPolicy = mute | mix | replace`. Unknown values, missing `storyBeatId`, negative times, `endMs <= startMs`, source overflow or a placement against a stale prepared revision are rejected before queueing.

Every Worker job also returns a durable status envelope containing `jobId`, `stage`, `status`, `attempt`, `heartbeatAt`, `progress`, `errorCode`, `traceId`, `inputFingerprint` and `outputArtifactIds`. The UI must reconcile from this envelope rather than relying on a browser-held request.

### 5.3 Control-plane event contract

Server DB/job ledger is the authoritative state. Redis/cache may accelerate polling but cannot be the only copy. Worker sends events through the existing authenticated control-plane endpoint `POST /api/worker-jobs/:jobId/events` using the Worker execution token, device proof, lease owner token and assignment attempt. Each event has a unique `eventId`, monotonic `sequenceNumber` per job, `eventType`, `stage`, `status`, `inputFingerprint`, `traceId`, `occurredAt` and bounded `payloadJson`. Server replies with `accepted/replayed` and the latest job projection; duplicate `(jobId, sequenceNumber, eventId)` is idempotent, an old sequence is replayed/ignored, and a conflicting fingerprint is rejected. Worker must persist an unsent event outbox/checkpoint locally and retry transient transport/auth-refresh failures without re-running media work.

The Web status query reads the Server projection and exposes `lastEventSequence`, `heartbeatAt`, `attempt`, `staleAfter`, and a typed terminal status. A browser may poll/subscribe, but never posts Worker completion directly and never treats a missing event as success.

## 6. Web/Server implementation boundaries

### 6.1 Shared and skill resources

Likely owned files:

- `apps/web/shared/marketplaceReviewIdeas/contracts.ts`
- `apps/web/shared/verticalDramaSeries/specialTieInContracts.ts`
- new `apps/web/shared/verticalDramaSeries/specialTieInFootageContracts.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/skills/vertical-drama-marketplace-review-story-planner/`
- existing Skill registry/import and admin skill validation

Extend contracts additively. Legacy ideas and normal episodes must remain parseable.

The new Marketplace Tie-in Skill must be discoverable in Admin Skills through the existing folder-sync/import path, with its input/output/UI schemas validated before it can be selected. If no enabled compatible LLM is available, the LLM selector and generate action are disabled with an actionable message; the client must not invent a model ID.

### 6.2 Services and routers

Likely owned seams:

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaMarketplaceReviewSkillAdapter.ts`
- `apps/web/server/services/verticalDramaMediaIngestService.ts`
- `apps/web/server/services/verticalDramaBrollService.ts`
- `apps/web/server/services/verticalDramaInteractiveJobExecutor.ts`
- `apps/web/server/services/creditContext*` and existing skill billing services

Required procedures/jobs:

1. create managed footage upload intent
2. register uploaded footage and enqueue Worker analysis
3. read analysis/prepared-footage status
4. create/retry preparation job
5. generate 3 ideas with guide snapshot
6. list compatible image/video models and LLM models with recommended defaults
7. generate 3 ideas with guide snapshot
8. list history and explicitly select/re-hydrate one idea
9. save/validate reviewed story
10. create exactly 9 shot plan after review
11. create/request AI B-roll assets using the selected compatible model
12. create/update/delete B-roll placements
13. enqueue final Worker composition/render
14. read Worker capability/doctor status and expose compatible transcription/render routes
15. read/reconcile Worker event cursor and explicitly cancel a queued/running stage

Each procedure must authorize tenant, user, series, episode context, source media, characters, product capture and managed images server-side.

### 6.3 Persistence

Use additive migration(s) and existing media/job/credit conventions. The exact table names must follow the current Drizzle schema after an impact check. The persisted model must cover:

- source asset and immutable revision/fingerprint
- analysis revision and guide artifact
- prepared artifact and segment map from source time to prepared time
- transcript artifact and provenance/model/version
- idea run and three cards
- reviewed story revision
- 9-shot plan revision
- B-roll placements and render revision
- pending look/scene slot requests
- job state, retry count, error code and trace ID
- worker event cursor, credit operation/context IDs and reconciliation status
- last accepted event sequence, terminal reconciliation timestamp, retention/deletion state and current contract family

Do not store only large JSON in an unbounded episode field. Keep bounded snapshots plus references to durable artifacts.

Migration must be additive, include indexes for `(tenantId, seriesId, sourceAssetId, sourceRevision)` and `(tenantId, runId)`, and have a rollback procedure that removes only new empty structures. Existing rows and old special episodes must remain readable during mixed-version rollout.

All new records/artifacts require an owner/tenant scope and a configured retention/deletion policy. Deleting the source, series or user-owned draft must enqueue an idempotent derived-artifact cleanup; cleanup failure is visible and must not silently orphan private media.

## 7. Skill behavior and grounding rules

The Skill must:

- use only selected characters; unselected characters cannot appear as speaking/supporting characters
- preserve Character DNA and relationship constraints
- use transcript and visual guide as continuity input, not as permission to invent unseen facts
- use simple Thai prose suitable for direct human review
- create a real dramatic event with setup, problem, action, consequence and natural product appearance
- make product benefit claims only from supplied product details/customer journey
- carry a versioned product/customer-journey snapshot and preserve user edits as overrides; the Skill never auto-approves legal/medical/safety claims
- attach a source/evidence reference or `unknown` label to every non-trivial recommendation
- put unsupported claims in `prohibitedClaims`
- in no-dialogue mode return no dialogue lines and convert intent into gesture/action
- distinguish original footage facts from suggested new look/scene slots
- propose a slot request when a new room, wardrobe or location is necessary, without mutating existing records
- produce three materially different stories by using a new server-generated variation seed

The adapter must reject output that:

- has fewer/more than three ideas
- includes unselected character IDs
- includes dialogue in no-dialogue mode
- names a character not present in the selected roster
- uses a stale guide/source revision
- treats partial guide output as complete without showing its warnings
- omits narrative, action, product rationale or prohibited claims
- claims a technical/product benefit absent from the authorized snapshot

## 8. Credit, security, and operations

- Upload, probe and local deterministic metadata may be zero-credit operations but still write an audit event.
- Transcription, Skill generation, AI B-roll generation and final render use existing operation/credit catalog with distinct operation names (`footage_transcription`, `tie_in_story_ideas`, `broll_media_generation`, `footage_broll_render`); if an operation is configured as free, the ledger still records a zero-credit context.
- Worker never deducts credits directly. It reports operation usage/result; Server reserves/finalizes/refunds idempotently.
- Retry with the same input fingerprint may reuse a completed artifact; a new idea generation always receives a new variation seed and a new run identity.
- Before any billable transcription/Skill/B-roll-generation/render submission, Server creates a credit preflight/reservation with an idempotency key derived from operation, user, source/story fingerprint and attempt. Worker completion cannot finalize a credit context that Server did not reserve.
- A reservation has an explicit expiry/reconciliation path: never-claimed, cancelled, stale, rejected or failed-before-provider-start work is released/refunded idempotently; only a server-verified provider/Worker start can finalize usage, and a retry/replay cannot create a second reservation for the same operation fingerprint.
- Raw provider URLs are never canonical references.
- Protected media previews use tenant/user authorization, private cache behavior, Range and ETag preservation.
- Skill text is untrusted output; schema validation, bounds, prompt safety and authorization happen before persistence or render.
- Failed jobs remain inspectable and retryable; no episode or paid media task is created from a failed analysis/story validation.
- Upload limits, duration limits, allowed MIME/container profiles and storage capacity are checked before queueing; limits are tenant/admin configurable and shown before upload where possible.
- Upload uses resumable/multipart managed storage with a finalize checksum; interrupted upload can resume or be cancelled, and analysis cannot be queued until the finalize record is complete. The same source fingerprint cannot be registered twice under different source revisions.

## 9. UI/UX contract

**Target user / job:** drama creator who has real footage and wants a natural, silent product tie-in episode with optional AI B-roll.

**Surface inventory:** existing Special Tie-in dialog; fullscreen media preview; analysis disclosure; story review editor; B-roll timeline; history disclosure; existing Character/Scene tabs for pending slot requests.

**State matrix:**

| State | Required UI |
|---|---|
| no footage | upload/select action and explanation |
| uploading | progress, cancel/retry, no analysis action |
| analyzing | durable progress, close-safe notice |
| analysis ready | markers, transcript, guide and trim controls |
| preparing | immutable source notice and progress |
| prepared | enable story generation |
| ideas ready | exactly 3 cards, history link, select one |
| story review | editable prose and structured action/dialogue view |
| story invalid | field-level errors; block 9-shot creation |
| placement conflict | explicit warning and user decision |
| rendering | durable Worker progress; prevent duplicate submit |
| failed | error code, trace ID, retry and preserved prior revision |

**Responsive matrix:** desktop uses two-column controls plus full-width timeline; tablet stacks controls before timeline; narrow screens use a bottom-sheet/fullscreen preview and horizontally scrollable timeline; no essential control is icon-only.

**Accessibility:** keyboard-operable upload, selectors, timeline fields, fullscreen dialog and history; focus trap and restore; Escape closes preview only when safe; labels for every time input; status announced with `role=status`; color is not the only marker; reduced-motion support.

**Copy contract:** Thai primary labels: `อัปโหลด Footage จริง`, `วิเคราะห์ Footage`, `สร้าง Footage พร้อมใช้`, `แนวทางจาก Footage`, `สร้างไอเดีย 3 ใบ`, `ตรวจสอบเรื่อง`, `สร้าง 9 ช็อต`, `วาง AI B-roll`, `เริ่มที่วินาที`, `ไม่มีบทพูดใหม่`. English fallback must preserve the same distinction between original audio and generated dialogue.

**Browser evidence:** authenticated test must prove upload/preview/fullscreen, F5 recovery, no-dialogue validation, selected-character grounding, searchable model selector, timeline start/end placement, pending slot link and error/retry states.

## 10. Acceptance criteria

1. User uploads footage from the Special Tie-in page and sees a protected thumbnail/fullscreen preview.
2. Analysis and preparation run asynchronously and survive closing/reopening/F5.
3. Guide visibly separates transcript, observations, recommendations and unknowns.
4. Ideas are generated only after prepared footage is ready and contain exactly three distinct human-readable series stories.
5. Selected characters are the only characters allowed in generated ideas.
6. No-dialogue mode yields zero dialogue lines and uses actions/gestures instead.
7. User can edit story and dialogue/action blocks before generating exactly nine shots.
8. User can place AI B-roll at a chosen start/end second and receives conflict/overflow validation.
9. Final render uses a Worker job and produces a new artifact without overwriting source footage.
10. Every billable Skill/transcription/render operation has an idempotent credit context.
11. Refresh shows no current ideas automatically; history remains available explicitly.
12. Existing normal episode flows, old ideas and old episodes remain unchanged.
13. A stale/partial/unavailable guide, unavailable model, duplicate submit, cancelled job or deleted source cannot create a ready story/render or charge a second credit context.

## 11. Test and rollout plan

Test-first order:

1. shared contract fixtures for guide, no-dialogue story, selected-character guard and placement bounds
2. service tests for authorization, stale revisions, idempotency, history and credit contexts
3. Skill adapter tests for exactly-three output, grounding and claim limits
4. router tests for upload/analyze/status/story/placement lifecycle
5. component tests for preview/fullscreen, all three model searches/default resolution, character selection and no-dialogue UI
6. browser test for the complete three-step flow and refresh behavior
7. migration/rollback and Worker contract compatibility tests
8. contract tests for event ordering/replay, upload finalize/resume, model catalog snapshot and retention cleanup

Roll out behind an additive tenant flag. Existing Special Tie-in can remain available as fallback until authenticated browser evidence, Worker runtime doctor, migration execution and one real transcription/render run pass.
