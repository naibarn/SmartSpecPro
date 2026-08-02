# Marketplace Staged Pipeline — คืนสถาปัตยกรรม Skill-First

สถานะ: APPROVED (ผู้ใช้สั่งตรง 2026-07-29)
กฎที่อ้างอิง: `feedback_skill_first_authoring` — "creative/prompt rules live in
skill.md + review LLM loop; TS computes facts only, never hardcode thresholds
replacing LLM judgment" และ `project_vd_start_frame_reference_mapping` —
reference mapping ต้อง **skill-authored + validator fail-closed, ห้าม
code-appended**

## 1. คำสั่งผู้ใช้ (verbatim)

> การสร้าง prompt หรือปรับปรุง prompt ใช้ความฉลาดของ llm ฉะนั้นต้องเป็น
> skill first เสมอ และไม่แต่งเติมนอก skill

## 2. การละเมิดที่ตรวจพบจริงในโค้ด (ยืนยันแล้ว ไม่ใช่การเดา)

### V1 — TS แต่งเติม prompt หลัง compile (ร้ายแรงที่สุด)
`marketplaceAutoReviewStagedPipelineService.ts` ใน `handleImageProvider`
มีบล็อก "Ensure prompt explicitly specifies character reference tag" ที่
**ต่อท้ายประโยค directive ลงบน prompt ที่ compile เสร็จแล้ว**:
`"ลักษณะตัวละคร/บุคคล: ใช้ @ImageN เป็นภาพตัวละครอ้างอิงหลัก..."`

กระทบแม้แต่ prompt ที่ skill เขียนเอง — ผู้ใช้กด "สร้าง Prompt" ให้ skill เขียน
แล้ว TS ยังไปต่อท้ายตอน dispatch = "แต่งเติมนอก skill" ตรงตัว
ขัด `project_vd_start_frame_reference_mapping` ที่ระบุว่า mapping ต้อง
skill-authored + validator ห้าม code-append

### V2 — prompt ตั้งต้นทั้ง 9 ช็อตถูกเขียนโดย TS ไม่ใช่ skill
`compileImagePromptCheckpoints` เรียก `compileStagedImagePrompt` →
`buildStagedImagePrompt` / `buildStagedVideoPrompt` ซึ่งเป็น **string template
ใน TypeScript ล้วน**

แต่ skill ทั้งสองประกาศไว้ชัดเจนว่า:
```
execution_mode: llm-only
fallback_policy: bounded_server_fallback
```
คือ LLM ต้องเป็นคนเขียน TS เป็นแค่ fallback — **implementation ทำกลับด้าน**
(TS เขียนเสมอ, skill ทำงานเฉพาะตอนผู้ใช้กดปุ่มรายช็อต)

### V3 — Wave 1 ใส่กฎเชิงสร้างสรรค์ลง TS เพิ่มอีก (งานที่ผมทำเองผิดกฎ)
ใน `marketplaceAutoReviewStoryArcPlanner.ts` มีกฎที่เป็นวิจารณญาณของ LLM
ถูก hardcode เป็นข้อความ:
- `กฎการจัดวางสองคน: ...หันหน้าเข้าหากัน...two-shot ระยะกลาง...เด่นกว่าเล็กน้อย
  (เช่น โฟกัสคมกว่า)` — การจัดองค์ประกอบภาพ = งานของ skill
- `Two-person staging rule: ...` (ฝั่ง EN)
- `ล็อกเอกลักษณ์ ห้ามสลับกัน / Identity lock — never swap`
- `Lip-sync: ผู้พูดในแต่ละช่วงต้องขยับปาก...` — การกำกับการแสดง = งานของ skill
- `TWO-VOICE LOCK: ...`

**กฎเหล่านี้อยู่ใน skill.md อยู่แล้วครบ** (ตรวจแล้ว —
`marketplace-auto-review-story-arc/skill.md` และ
`marketplace-auto-review-shot-video-director/skill.md` สอนเรื่อง cast,
castInShot, dialogueTurns, lip-sync, two-voice ครบ) → เป็นการเขียนซ้ำซ้อน
ที่ TS ไปแย่งงาน skill

### V4 — skill video-director ตายสนิท
`marketplaceAutoReviewShotVideoDirector.ts` (`buildStagedShotVideoDirectorPrompt`)
ถูกอ้างอิงจาก **ไฟล์เทสต์เท่านั้น** ไม่มี production call site เลย

## 3. สถาปัตยกรรมที่ถูกต้อง

```
ผู้ใช้กด "สร้าง Prompt" / "ปรับปรุง Prompt"
        ↓
   skill (LLM) เป็นคนเขียน prompt  ← ความฉลาดอยู่ตรงนี้
        ↓
   TS validate ว่าผลลัพธ์ครบสัญญา (fail-closed)
        ↓  ถ้าไม่ครบ → retry skill
        ↓  ถ้ายังไม่ได้ → bounded fallback (facts-only) + warning
   ห้าม TS ต่อท้าย/แต่งเติมข้อความใด ๆ เด็ดขาด
```

**เส้นแบ่ง FACTS vs CREATIVE:**
| TS ทำได้ (facts) | เฉพาะ skill (creative judgment) |
|---|---|
| @ImageN ↔ ชื่อ/บทบาทตัวละคร (roster) | การจัดวางตัวละครในเฟรม, ระยะภาพ |
| บทพูดที่อนุมัติแล้ว, dialogueTurns | การกำกับ lip-sync / reaction |
| duration, ภาษา, product identity | แสง สี มุมกล้อง การเน้นตัวละคร |
| validate ว่า output ครบ (fail-closed) | ถ้อยคำ lock ต่าง ๆ |

## 4. Phases

| P | งาน | ไฟล์ |
|---|---|---|
| **P1** | ลบ late-patch V1 ทิ้ง แทนด้วย **validator fail-closed** (เช็คว่า prompt อ้าง @ImageN ครบตาม manifest; ไม่ครบ → ให้ skill เขียนใหม่ / fallback + warning) ห้าม append | `...StagedPipelineService.ts` |
| **P2** | `compileImagePromptCheckpoints` เป็น skill-first: ต่อช็อตเรียก `refreshSequentialShotPromptWithSkill`; ล้มเหลว → bounded fallback + reason code `staged_prompt_skill_fallback` | `...StagedPipelineService.ts`, export `buildStagedSingleShotRefreshInput` จาก `...StagedCheckpointRouterService.ts` |
| **P3** | ถอดกฎเชิงสร้างสรรค์ (V3) ออกจาก `buildStagedImagePrompt`/`buildStagedVideoPrompt` เหลือเฉพาะ facts → เป็น bounded fallback ที่แท้จริง | `marketplaceAutoReviewStoryArcPlanner.ts` |
| **P4** | ตรวจว่า skill.md สอนครบทุกกฎที่ถอดออก ถ้าขาด → เพิ่มใน skill.md (ไม่ใช่ TS) รักษา skill.md/SKILL.md byte-identical | `apps/web/skills/**` |
| **P5** | เทสต์: golden-prompt ว่า TS ไม่มีข้อความ creative หลงเหลือ + grep-guard กัน append กลับมา | `__tests__/**` |

## 5. ข้อควรระวัง

- **Circular import**: `checkpointRouterService` import จาก `pipelineService` อยู่แล้ว
  → pipelineService ต้อง **lazy import** (ใน function body) เท่านั้น
  มี precedent ในไฟล์เดียวกันแล้ว (`recordStagedProviderFailureAndRefund`)
- **Cost/latency**: P2 ทำให้ story-approval ยิง skill 9 ครั้ง — ยอมรับได้เพราะเป็น
  background job และตรงกับที่ผู้ใช้กดเองรายช็อตอยู่แล้ว ต้องมี fallback ต่อช็อต
  ไม่ให้ทั้ง run ล้มเพราะช็อตเดียวพัง
- **ห้ามลบ** deterministic builder ทิ้ง — มันคือ `bounded_server_fallback`
  ตามที่ skill ประกาศ แค่ต้องลดบทบาทให้เป็น facts-only
- **Optimizer**: `project_marketplace_optimizer_strips_locks` — relock หลัง optimizer
  ยังทำได้ เพราะเป็นการ **กู้คืน lock ที่ skill สั่งให้มี** ไม่ใช่การแต่งเติมใหม่
