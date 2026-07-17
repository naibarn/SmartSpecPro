# ความจำซีรีย์ที่ใช้งานได้จริง → ภาค 2 (Sequel) + ภาคพิเศษ (Special Edition)

## Context

ผู้ใช้ต้องการเพิ่มโหมดใน wizard สร้างซีรีย์แนวตั้ง: **ภาค 2/ภาคถัดไป** (ตัวละคร+DNA+ความสัมพันธ์เดิม
ปมใหม่ ไม่ซ้ำซาก) และ **ภาคพิเศษ** (ตัวละครเดิม เนื้อเรื่องไม่ผูกปมเดิม สั้น 1-2 ตอนย่อย เพื่อรีวิว/
แนะนำสถานที่/บริการ/สินค้าแบบเนียน) เลือกเรื่องเก่าจากรายการที่มี ทั้งสองโหมด skill-first + user แก้ได้จริง

**ข้อกำหนดที่แข็งที่สุด (ผู้ใช้ระบุตรง ๆ):** ภาคใหม่ต้องต่อเนื่องจนคนดูที่อินกับภาคเดิมเข้าใจได้ —
ใครคบกับใคร ความสัมพันธ์แต่ละคู่เป็นยังไง **เปิดเผยแล้วหรือยังแอบอยู่หรือยังไม่เคยบอก** งานค้างธรรมดา ๆ
(รีโนเวทบ้านยังไม่เสร็จ) ใครรู้อะไร ปมไหนยังไม่คลี่ — ไม่ใช่เล่ากันคนละเรื่อง
และ **ชื่อเรื่องตั้งไปแล้ว → เนื้อหาต้องสัมพันธ์กับชื่อเรื่อง เปลี่ยนแนวเรื่องไม่ได้**

### ผลตรวจข้อมูลจริง — ทำไมแผนแรกใช้ไม่ได้

แผนแรกตั้งอยู่บนสมมติฐานว่ามีข้อมูลต่อเนื่องอยู่แล้ว **ผิดทั้งหมด**:

| แหล่งที่คิดว่าจะใช้ | ความจริง |
|---|---|
| `vertical_drama_memory_events` | **0 แถว** — stage ไม่เคยรันเลยใน 233 runs |
| `currentState.relationshipNotes` | **phantom type** — 0 readers, 0 writers, 0/60 ตัวละครมีคีย์นี้ |
| `relationshipMap` (contracts.ts:110) | 0 entries ทั้ง 9 ซีรีส์ — type ตาย |
| `open_threads` | คำนวณที่ `verticalDramaStoryBible.ts:3959` แล้ว**ทิ้ง**; `verticalDramaSeries.ts:1981` hardcode `openThreads: []` |
| ระดับการเปิดเผยความสัมพันธ์ | **ไม่มี concept นี้ในระบบเลย** — ทั้ง 12 memoryKind, bible, script schema, story_state |

**รากของปัญหา:** `summarize_episode_to_series_memory` เป็น **stage สุดท้ายของ pipeline ทั้งหมด**
(`verticalDramaEpisodePipeline.ts:186`) อยู่ถัดจาก `render_or_import_video_clips` +
`assemble_episode_manifest` → ต้องเรนเดอร์วิดีโอครบและประกอบตอนเสร็จก่อนถึงจะได้ความจำ
ซ้ำยัง approval-gated + เสียเครดิต + `if (!plannerPayload) return;` (`:1164`).
**ความจำเป็นเรื่องของเนื้อเรื่อง แต่ถูกวางไว้ท้ายงานโพสต์โปรดักชัน** — usage จริงหยุดที่ storyboard/start-frame

สถานะโลกตอนจบของ "รักข้ามเวลา" (30 ตอน) ที่ระบบบันทึกไว้ **ทั้งหมด** = ประโยคเดียว:
> "พิมพ์ดาวและกวินท์เริ่มสร้างความสัมพันธ์ใหม่บนพื้นฐานของความทรงจำที่หายไป"

**ของจริงที่มี:** `vertical_drama_episodes.script` → `character_state_deltas`, `open_loops`,
`continuity_notes` — ผลิตโดย `plan_episode_script` ซึ่ง**รันจริง 35 ครั้ง** แต่ `character_state_deltas`
เป็น per-character label (ศัตรู→พันธมิตร) **ไม่ใช่ pair** จึงยังตอบ "ใครคบใคร" ไม่ได้ และทั้งหมดเป็น
`z.object({}).passthrough()` — เขียนแล้วไม่มีใครอ่าน

**บั๊กที่กระทบข้อ "แนวเรื่องเปลี่ยนไม่ได้" โดยตรง:** field `genre` ถูกยัด logline/ชื่อสำรอง
→ ทุก prompt วันนี้ยิงชื่อเรื่องซ้อนสองอัน เช่นซีรีส์ 17: `Title: รักข้ามเวลา` /
`Genre: คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา` — ผู้ใช้สั่งให้แก้ในงานนี้

### การตัดสินใจที่ผู้ใช้ให้มา

1. **ทำ "ความจำซีรีย์" ให้ใช้งานได้จริงก่อน** แล้วโยนตัวสรุปนั้นเข้า skill คิดเรื่องภาคใหม่ —
   ไม่ใช่ให้ระบบย้อนอ่านเนื้อทั้งเรื่อง (20-100 ตอนย่อย = input มากเกินไป)
2. Carry-over ตัวละคร: **AI เสนอสถานะ + user แก้ได้**
3. ภาคพิเศษ: **project แยก แต่ผูก parent**
4. ภาคพิเศษ source: **ครบทั้ง 3** (marketplace / อัปโหลดรูป+สรุป / user เลือก story function)
5. **แก้บั๊ก genre ในงานนี้เลย**
6. ซีรีส์เนื้อบาง: **เตือน + ให้ user เติมเอง**

**Outcome:** Part 1 ทำให้ทุกซีรีส์มีความจำที่อ่านแล้วเข้าใจทั้งเรื่อง (มีค่าในตัวเอง ship แยกได้)
→ Part 2 ภาค 2/ภาคพิเศษ กินของนั้น. โหมดเดิมของ wizard ต้องไม่เปลี่ยนแม้แต่ไบต์เดียว

---

# PART 1 — ความจำซีรีย์ที่ทำงานจริง (ฐานราก)

## Stage 1.1 — Contract ของความจำ (ship เดี่ยว, ไม่เปลี่ยนพฤติกรรม)

**ไฟล์ใหม่ `apps/web/shared/verticalDramaSeries/seriesMemoryState.ts`** — ประกาศ concept ที่ระบบยังไม่มี:

```ts
/** สถานะความสัมพันธ์แบบ materialized (ไม่ใช่ delta) */
export type VdRelationshipState = {
  pair: [string, string];              // characterKey (stable ข้าม series → ภาค 2 ใช้ต่อได้)
  status: string;                       // "คบกัน" | "หย่าแล้ว" | "พี่น้องห่างเหิน" — free text, skill เขียน
  /** concept ที่ไม่เคยมีในระบบ — โจทย์หลักของผู้ใช้ */
  disclosure: "secret" | "known_to_some" | "public" | "undeclared";
  knownBy: string[];                    // characterKey ที่รู้เรื่องนี้ (undeclared = ยังไม่มีใครพูดออกมา)
  sinceEpisode: number;
};

/** ปมค้าง — มี class เพื่อให้ "รีโนเวทบ้านค้าง" มีที่อยู่ */
export type VdOpenThread = {
  threadId: string;
  description: string;
  threadClass: "plot" | "domestic" | "career" | "financial" | "health" | "relationship";
  openedEpisode: number;
  resolvedEpisode?: number;             // มี = คลี่คลายแล้ว (ไม่ใช่หายไปเงียบ ๆ แบบวันนี้)
};

/** ก้อนที่ skill เขียนต่อ 1 ตอนย่อย */
export type VdEpisodeMemory = {
  episodeNumber: number;
  recap: string;                        // สรุปตอนนี้
  canonicalFacts: string[];             // ข้อเท็จจริงหลักที่ตอนนี้ปักหมุด
  threadsOpened: VdOpenThread[];
  threadsResolved: string[];            // threadId
  relationshipChanges: VdRelationshipState[];  // สถานะ**หลัง**ตอนนี้ ไม่ใช่ delta
  knowledgeChanges: Array<{ characterKey: string; learned: string }>;
};

/** ตัวสรุปสะสมบน series.memory — "อ่านแล้วเข้าใจทั้งเรื่อง" */
export type VdSeriesMemory = {
  contractVersion: 1;
  episodes: VdEpisodeMemory[];
  /** fold ของ episodes ด้วย TS ล้วน ไม่เรียก LLM */
  currentState: {
    relationships: VdRelationshipState[];  // ล่าสุดต่อ pair
    openThreads: VdOpenThread[];           // ที่ยังไม่มี resolvedEpisode
    canonicalFacts: string[];
    characterKnowledge: Record<string, string[]>;
  };
  compactSummary: string;                  // token-bounded, ใช้ป้อน skill ภาค 2
  lastFoldedEpisode: number;
  userEdited?: boolean;                    // user แก้แล้ว → อย่าทับ
};
```

**`foldSeriesMemory(episodes): currentState`** — pure function, TS ล้วน, **ไม่เรียก LLM**
รีเพลย์ตามลำดับตอน เอาสถานะล่าสุดต่อ pair, ตัด thread ที่ resolved ออก
นี่คือคำตอบของ "delta → state" ที่วันนี้ทำไม่ได้ และเป็น pure function → unit test ตรง ๆ

## Stage 1.2 — ให้ความจำถูกเขียน ณ เวลาที่เนื้อเรื่องถูกเขียน (หัวใจของ Part 1)

**หลัก: เกาะ LLM call ที่เกิดขึ้นอยู่แล้ว → 0 call เพิ่ม, 0 เครดิตเพิ่ม, ไม่มี approval gate**

**Producer A — deep-draft (ตัวหลัก).** `vertical-drama-full-story-architect` เขียนทุกตอนย่อยอยู่แล้ว
และเป็น**ขั้นเดียวที่แตะทุกตอน** (ซีรีส์ 100 ตอนที่ไม่เคยทำ script ก็ยังได้ความจำ)
→ เพิ่ม `episode_memory` เป็น **optional block** ต่อตอนใน output ของ skill
→ persist ตอน chunk ถูกบันทึก (จุดเดียวกับ `persistDeepDraftDeclaredLocations`)

> **ต้อง optional** ตาม pattern เดิมของไฟล์ (`open_loops`/`retention_loop` ใน
> `scriptBuilderOutputSchema:262-269` เป็น optional superset ด้วยเหตุผล backward-compat เดียวกัน)
> และเพราะ **weak-model JSON failure class** ที่บันทึกไว้ใน memory — schema VD ที่หนักขึ้นทำให้
> โมเดลถูก ๆ พ่น JSON เสีย. ถ้าไม่มี block → fallback deterministic ที่ project เท่าที่ได้จาก
> logline/keyBeats/cliffhanger (recap ได้, relationship ไม่ได้) แล้วให้ Producer B มาเติมทีหลัง

**Producer B — `plan_episode_script` (ตัวละเอียด).** รันจริง 35 ครั้ง และ**มีวัตถุดิบเกือบครบแล้ว**
(`character_state_deltas`, `continuity_notes`, `open_loops`) → เพิ่ม `episode_memory` ใน
`scriptBuilderOutputSchema` (optional เช่นกัน) → เขียนทับ/refine record ของตอนนั้น (supersede by episodeNumber)

**`summarize_episode_to_series_memory` — ลดชั้นเป็น refinement ทางเลือก** ไม่ใช่แหล่งเดียวอีกต่อไป
ไม่ต้องย้าย stage (เสี่ยงต่อ pipeline ที่ใช้งานอยู่) แค่ไม่ต้องพึ่งมัน. ปุ่ม manual trigger เดิม
(`verticalDramaEpisodes.ts:15391`) ยังใช้ได้สำหรับคนที่อยากได้ความจำละเอียดสุด

**เขียนที่ไหน:** `series.memory` jsonb (มีอยู่แล้ว `schema.ts:~20470`) — **ไม่ต้อง migration**.
`vertical_drama_memory_events` ยังคง append ต่อไปตามเดิมสำหรับ audit trail แต่ `series.memory`
คือ projection ที่ทุกคนอ่าน (เร็ว, bounded, ไม่ต้อง replay 100 แถว)

**ไฟล์ใหม่ `apps/web/server/services/verticalDramaSeriesMemoryProjection.ts`** —
`upsertEpisodeMemory(seriesId, episodeMemory)` → merge เข้า `series.memory.episodes` (supersede by
episodeNumber) → `foldSeriesMemory` → เขียน `currentState` + `compactSummary` กลับ. Best-effort
ทั้งหมด (ตาม convention ของ `seedCharactersFromDraft`) — ความจำพังต้องไม่ทำให้ draft พัง

## Stage 1.3 — Skill: สอนให้เขียนสิ่งที่ไม่เคยเขียน

**`skills/vertical-drama-full-story-architect/skill.md`** + **`skills/vertical-drama-script-builder/skill.md`**
— เพิ่ม section "EPISODE MEMORY" (guard: *"emit this block for each episode"*), craft ทั้งหมดอยู่ที่นี่:
- **`disclosure` คือแกนที่ไม่เคยมี** — ทุกความสัมพันธ์ต้องระบุว่า public / secret (ใครรู้บ้าง) /
  known_to_some / undeclared (ทั้งคู่รู้สึกแต่ไม่มีใครพูด). อธิบายว่าทำไมมันเปลี่ยนเรื่อง:
  คู่ที่ "แอบคบ" กับ "คบเปิดเผยแล้ว" เล่นฉากเดียวกันไม่ได้
- **`threadClass: domestic`** — สั่งให้บันทึกงานค้างธรรมดา ("รีโนเวทบ้านยังไม่เสร็จ", "ยังไม่ได้คืนเงินแม่")
  ไม่ใช่แค่ปมพล็อต. วันนี้ตัวอย่างใน skill เป็น `"sister's clinic funding"` ล้วน → โมเดลเลยเขียนแต่ปมพล็อต
- `relationshipChanges` = **สถานะหลังตอนนี้** ไม่ใช่ delta ("trust → rivalry" ใช้ไม่ได้)
- ตัวอย่างใน skill.md ต้องมีเคส domestic + undeclared ให้เห็น — ตัวอย่างคือสิ่งที่โมเดลลอก

**`skills/vertical-drama-series-memory-planner/skill.md`** — อัปให้ output ตรง contract ใหม่
และ**รัด `schemas/output.schema.json`**: วันนี้ทุก array เป็น `items:{type:"object",
additionalProperties:true}` **ไม่มี required เลย** → planner พ่น `[{}]` ก็ผ่าน. ต้องใส่ required inner shape

## Stage 1.4 — Series Memory tab (user แก้ได้จริง)

Tab ใหม่ในหน้า series detail — แสดง `VdSeriesMemory` แบบอ่านรู้เรื่อง: ไทม์ไลน์ตอน + สรุปสะสม +
**การ์ดความสัมพันธ์ (คู่ + สถานะ + เปิดเผยระดับไหน + ใครรู้)** + ปมค้างแยก class + ปุ่มแก้ทุกช่อง
`userEdited: true` เมื่อแก้ → producer ห้ามทับของที่ user แก้ (merge เฉพาะตอนใหม่)
นี่คือ "custom ได้จริง" และเป็นทางออกของซีรีส์เนื้อบาง (เตือน coverage + ให้เติมเอง)

## Stage 1.5 — แก้บั๊ก genre + persist openThreads

- **genre**: `verticalDramaSeries.ts` create/update — validate ว่า `genre` ไม่ใช่สำเนา `title`
  และไม่ยาวเกินแนวเรื่อง (วันนี้ limit 100 ตัว แต่ยัด logline เข้ามาได้). เพิ่ม data-repair script
  สำหรับ 9 แถวที่มีอยู่ (backup ก่อนตาม Database Safety Protocol) + prompt ต้องไม่ยิง
  `Genre:` เมื่อ genre ≈ title
- **openThreads leak**: `verticalDramaSeries.ts:1981` hardcode `openThreads: []` →
  อ่านจาก `series.memory.currentState.openThreads` แทน. `finalOpenThreads`
  (`verticalDramaStoryBible.ts:3959`) ที่คำนวณแล้วทิ้ง → ป้อนเข้า projection

---

# PART 2 — ภาค 2 + ภาคพิเศษ

## Stage 2.1 — Schema

**`drizzle/schema.ts`** `verticalDramaSeries` +4 คอลัมน์:

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| `parentSeriesId` | bigint → self, **ON DELETE SET NULL** | ลบภาค 1 ต้องไม่ลบภาค 2 |
| `createMode` | varchar(24) nullable | `"sequel"`/`"special_edition"`. **NULL = original ห้าม backfill** |
| `seasonNumber` | integer nullable | |
| `lineage` | jsonb nullable | carry-over ที่ user อนุมัติ + special-edition source + snapshot `parentTitle` |

`NULL = original` ทำให้ "โหมดเดิมไม่เปลี่ยน" เป็นการรับประกันเชิงโครงสร้าง ตรงกับ convention
ของทุกคอลัมน์ additive บนตารางนี้ (`watermark`, `trailer`, `llmModelPolicy`)

**ไฟล์ใหม่ `drizzle/manual_vertical_drama_series_lineage.sql`** — **`drizzle-kit generate/migrate`
ใช้กับตระกูล `vertical_drama_*` ไม่ได้** (meta-journal collision 0146/0147, ระบุใน `schema.ts:20501-20535`);
คอลัมน์พี่น้อง 13 ไฟล์ลงมือเขียนเองหมด. ลอกสไตล์ `manual_vertical_drama_character_variant_columns.sql`
(header อ้าง collision + ไล่ชื่อไฟล์พี่น้อง + risk line "ADD COLUMN (nullable) = Low risk") แล้ว
`BEGIN; ALTER TABLE … ADD COLUMN IF NOT EXISTS …; COMMIT;` + index `(tenantId, parentSeriesId)`.
ไฟล์พี่น้องใช้ bare `REFERENCES` — เราต่างตรง `ON DELETE SET NULL` ต้องเขียนเหตุผลใน header

> ⚠️ **ลำดับ deploy คือจุดคมที่สุด** — `loadOwnedSeries` ใช้ `.select()` (เลือกคอลัมน์ตาม TS
> description) → **schema.ts ที่ลงก่อน SQL จะพัง VD read ทุกเส้นทันทีทั้ง dev และ prod**

Contract `VerticalDramaSeriesLineage` → **ไฟล์ใหม่ `shared/verticalDramaSeries/lineage.ts`**
(ไม่ยัด `contracts.ts` ซึ่งเป็น bible contract ยาว 1000+ บรรทัด — ตาม precedent `audienceAgeRating.ts`)

## Stage 2.2 — Carry-over planner (AI เสนอ, user แก้)

**ตัดสินใจ: synchronous mutation ไม่ใช่ job** — `VerticalDramaStoryJobPayload`
(`verticalDramaStoryJobs.ts:188`) บังคับ `seriesId` ซึ่งยังไม่มีตอนอยู่ใน wizard และ checkpoint/resume
ไม่มีอะไรให้ resume เข้า. `synthesizeGenrePreset` (`verticalDramaSeries.ts:4223`) คือ shape เดียวกันเป๊ะ
และ**พิสูจน์แล้วใน wizard ตัวนี้**: LLM call → transient draft → `applyPresetDraft`
(`CreateSeriesWizard.tsx:324`) ยัดลง `useState` → user แก้อิสระ → `create` ค่อย persist

**Skill ใหม่ `skills/vertical-drama-season-carry-over-planner/skill.md`** (ตัวเล็ก —
`skillFiles.ts:7` อ่าน `skill.md` ก่อน `SKILL.md`)

- **TS ป้อน fact จาก `series.memory` ของ parent เท่านั้น** (compactSummary + currentState) —
  **ไม่ใช่เนื้อทั้งเรื่อง** ตรงตามที่ผู้ใช้สั่ง: bounded ไม่ว่าซีรีส์จะ 20 หรือ 100 ตอน
- **skill ถือดุลพินิจ**: ตัวร้ายติดคุก → ต้องมี beat ปล่อยตัวที่ earn มาจริง หรือหาตัวร้ายใหม่;
  ตัวที่ตายเขียนออกแต่กลับมาเป็น flashback ได้; ภาคใหม่ต้องเปิดปมใหม่จริงไม่ใช่ re-run;
  ความสัมพันธ์ที่ carry มาต้อง**ขยับ**จากตอนจบแล้ว; คู่ที่ `undeclared` = โอกาสเปิดประเด็นที่ยังไม่มีใครรู้

Output (zod mirror `synthesizedPresetDraftSchema` `verticalDramaPresetSynthesis.ts:170`):
`characters[{characterKey, name, postFinaleStatus, availability: returns|returns_with_explanation|write_out|cameo_only, returnJustification?, suggestedStateUpdate?}]`,
`newCharacterSuggestions[]`, `newConflictDirections[]`, `antagonistStrategy`,
`carriedRelationships[]` (จาก `currentState.relationships` — user เห็นและแก้ได้), `carriedThreads[]`

**Router** `verticalDramaSeries.proposeSeasonCarryOver` `{parentSeriesId, premise?}`

## Stage 2.3 — Lineage read + clone-on-create

**`server/services/verticalDramaSeriesLineage.ts`** — `loadLineageContext(parentRow, tenantId, userId)`
รวม `series.memory` (compact) + roster + locations + visual identity + audience rating.
Ownership: router เรียก `loadOwnedSeries` (`verticalDramaSeries.ts:656`) แล้วส่ง row เข้ามา —
ไฟล์นี้ห้าม import router (กัน circular import ตาม convention `verticalDramaStoryJobs.ts`).
Series picker ใช้ `verticalDramaSeries.list` เดิม (`:3235`) ไม่ต้องมี endpoint ใหม่

**`server/services/verticalDramaSeriesClone.ts`** — เรียกใน `create` หลัง insert row ก่อน
`seedCharactersFromDraft`. `loadOwnedSeries(parentSeriesId)` **hard throw** (parent ข้าม tenant
แล้วได้ sequel ว่างเงียบ ๆ = บั๊กทรง data-leak ต้องดัง), ที่เหลือ best-effort ตาม convention ของไฟล์

- **Pass 1 characters** (`availability !== "write_out"`): **`characterKey` คงเดิมเป๊ะ** — ปลอดภัย
  เพราะ unique index เป็น `(seriesId, characterKey)` และทำให้ auto-registration
  (`verticalDramaSeries.ts:1686-1695`) เจอ row เดิมแทนปั๊มตัวซ้ำ — **เหตุผลสำคัญที่สุดที่ต้อง
  pre-seed ก่อน generate**. copy `data`(DNA) + merge `currentState` จากการ์ดที่ user อนุมัติ +
  `data.lineage = {parentSeriesId, parentCharacterId, carriedOver:true}`. copy `voiceConfig`,
  `narrativeRole`, `roleTier`, `occupation`, `roleVisualIntent`
- **Pass 2 remap self-FK** (จุดที่ naive copy พลาด): `parentCharacterId`/`sharesFaceWithCharacterId`
  ชี้ row ของ parent series → UPDATE ผ่าน `Map<oldId,newId>`; referent ที่ถูกเขียนออก → null
- **Portraits: copy `vertical_drama_character_assets`** — จำเป็น (`seriesId` notNull + ทุก read
  scope ด้วย seriesId, `verticalDramaSeries.ts:3737-3742`) และปลอดภัย: row ใหม่ชี้ **`mediaAssetId`
  เดิมร่วมกัน**, ไม่มี unique constraint บน mediaAssetId, FK เป็น SET NULL → ลบภาค 2 cascade
  แค่ junction ไม่แตะรูป. copy `approved`/`qcStatus` → cast ภาค 2 **approved มาแล้ว** ไม่เสียเครดิต
- **`vertical_drama_character_aliases` (schema.ts:20716) — ต้อง copy ด้วย** (แผนรอบแรกตกไป,
  เพิ่ม 2026-07-17 หลังตรวจตารางจริง). unique index เป็น `(seriesId, normalizedAlias)` → clone
  ได้โดยคง alias เดิม. **ถ้าไม่ copy ภาค 2 พัง**: character-bible prompt
  (`verticalDramaStoryBible.ts` ~`:2930`) บังคับว่า *"every `characters[].name` and
  `dialogue_lines[].speaker` MUST be EXACTLY one of these declared strings — the canonical
  `name` or one of its `aliases`"* → ชื่อเล่นที่ภาคเดิมใช้จะกลายเป็นชื่อผิดทันที
- **Locations** เหมือนกัน `locationKey` คงเดิม + copy `vertical_drama_location_assets`
- **ห้าม copy `vertical_drama_shot_references` (schema.ts:21012)** — ผูก `episodeId`+`shotNumber`
  ของภาคเก่า; ภาคใหม่มีช็อตของตัวเอง
- ⚠️ **`approvedReferenceAssetIds` (contracts.ts:83) เป็น field ผี** — grep ทั้งโค้ดเบส: 0 writers,
  0 readers (ตระกูลเดียวกับ `relationshipMap` / `currentState`). **ห้ามออกแบบ clone โดยอิงมัน**
  ตัวจริงที่ต้อง clone คือ junction table ข้างบน
- **ห้าม copy**: `productTieIn` (`marketplaceCaptureId` เป็น string เปล่าไม่ใช่ FK → copy แล้ว dangle
  ไปพังแบบงง ๆ ที่ `verticalDramaProductTieIn.ts:769-794`), `memory` (เป็นของภาค 1 — ภาค 2 เริ่มความจำใหม่
  แต่ `lineage` เก็บ compactSummary ของภาค 1 ไว้), episodes, runs

**Branch `crossSeriesUniqueness`** — วันนี้ `verticalDramaCharacterDesignContext.ts:302-311` ทำ
`ne(verticalDramaSeries.id, series.id)` = ซีรีส์อื่น**ทุกเรื่อง**รวม parent → ภาค 2 จะโดนบอกให้
"ทำให้ต่างจากตัวเองในภาคก่อน" แล้ว `characterProfile.ts:143-152` hard-fail lead ที่ uniqueness < 16.
แก้จุดเดียว: `series.parentSeriesId ? ne(verticalDramaSeries.id, series.parentSeriesId) : undefined`.
**ไม่ต้องแตะ zod** — `:271` ทำ `approvedDesignDna: extractCharacterDesignDna(input.target.data)` อยู่แล้ว
→ ตัว clone มี DNA เป็น approved ทันที; และกฎนั้นยังถูกต้องสำหรับตัวละคร**ใหม่**ของภาค 2

## Stage 2.4 — Sequel authoring (skill-first, title/genre ล็อค)

**Fact ใหม่ optional บน `buildDeepDraftPrompts`** (`verticalDramaStoryBible.ts:2851`) ข้าง `knownLocations`:
`seasonLineage?: { seasonNumber, parentTitle, priorSeasonSummary (compactSummary ของภาค 1),
carriedRelationships: VdRelationshipState[], carriedThreads: VdOpenThread[],
carriedCharacters[], writtenOutCharacters[], antagonistStrategy }`

**Renderer `buildSeasonLineagePromptBlock(): string | null`** วางถัดจาก `buildKnownLocationsPromptBlock`
(`:2822`) ลอก contract เป๊ะ: `if (!lineage) return null;` → ถูก `.filter(Boolean)` ตัดเอง.
**นี่คือทั้งหมดของการรับประกัน byte-identity** — ไม่เพิ่ม filter chain ไม่สลับลำดับ entry เดิม.
ใส่ใน **user prompt** (ที่เดียวกับ `knownLocations`) ไม่ใช่ system prompt ซึ่งมีข้อผูกมัด
byte-identity เข้มสุดในไฟล์ (`:4687`)

**craft อยู่ใน `skills/vertical-drama-full-story-architect/skill.md`** section "SEQUEL / NEXT SEASON"
guard ด้วย *"When the user message contains a SEASON LINEAGE block, additionally…"* — guard นี้คือสิ่งที่
ทำให้โหมดเดิมนิ่งสนิท (skill body ไบต์เดียวกันสำหรับทุกคน). **อย่าสร้าง architect skill แยก** —
จะ fork craft การเขียนซีซั่นเป็น 2 ก๊อปปี้ที่ drift ออกจากกัน

**Title/genre ล็อค (ข้อกำหนดผู้ใช้):** sequel **inherit `genre`/`tone` จาก parent และแก้ไม่ได้ใน UI**
(disabled + อธิบายว่าทำไม). title ใหม่ได้แต่ต้องอยู่ในตระกูลเดิม → skill.md สั่งว่าเมื่อมี lineage block
เนื้อหาต้องสัมพันธ์กับ `parentTitle` และห้ามเปลี่ยนแนวเรื่อง. **ต้องพึ่ง Stage 1.5** — ถ้า genre
ยังเป็น logline อยู่ การ "ล็อค genre" คือการล็อคขยะ

**`episodeNumber === 1` branch (`:2938`): ไม่แตะ** — ให้ขอ `protagonist_stake` + `world_rules` ใหม่ต่อไป
เพราะภาคใหม่ = ปมใหม่ stake ส่วนตัวใน**ปมนี้**ใหม่จริงแม้เป็นคนเดิม; inherit stake ภาค 1 คือความซ้ำซาก
ที่ผู้ใช้สั่งให้เลี่ยงพอดี. ที่เปลี่ยนคือ**คำสั่งใน skill**: เมื่อมี lineage → `world_rules` ต้อง
*สอดคล้อง*กับโลกที่ carry มา, `protagonist_stake` ต้อง*ใหม่และเจาะจงกับปมภาคนี้*. **TS 0 บรรทัด**

**Threading:** `runGenerateStoryBibleDeepJob` (`verticalDramaSeries.ts:1391`) อ่าน `series.lineage` +
`series.parentSeriesId` ประกอบเอง → **client ไม่ต้องแก้** (`CreateSeriesWizard.tsx:270` fire-and-forget
เหมือนเดิม) และเลี่ยงบั๊ก `userPremise` ที่ `:4457-4467` ไม่ forward แทนที่จะทำซ้ำมัน

## Stage 2.4b — Loop engineering: มิติตัดสิน `prior_season_continuity` (เจ้าของสั่งเพิ่ม 2026-07-17)

**โจทย์เจ้าของ:** *"ควรมีระบบ loop engineering เพื่อให้แน่ใจว่าเนื้อหาใหม่ เกลามาแล้วว่าสอดคล้องกับภาคเดิม
จริงหรือไม่ หลุดหรือเปล่า … เพื่อให้แน่ใจว่าคนดูจะไม่สงสัยว่าเรื่องหลุดจากโครงเก่า เช่นความสัมพันธ์ของ
ตัวละคร ความก้าวหน้าของตัวละคร ที่จำเป็นต้องอ้างอิงมาจากภาคเดิม"*

**ไม่ต้องสร้างลูปใหม่ — เครื่องมีอยู่แล้ว** (`verticalDramaStoryBible.ts`):
- 8 มิติหลักให้คะแนนทุกตอน (`premiumScoreDimensionsShape` ~`:500-524`)
- `VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS = 4` (`:4389`), floor `VD_PREMIUM_DRAFT_MIN_DIMENSION = 3` (`:4395`)
- season continuity sweep (`VD_PREMIUM_DRAFT_SWEEP_ROUND = 3`, `:544`)
- **premium เป็น client default** (project memory) → ภาค 2 ได้ลูปนี้โดยปริยาย

**แม่แบบที่ต้องลอกให้เป๊ะ: `tie_in_naturalness`** (`premiumTieInNaturalnessShape` ~`:539`) — มิติ
**optional แบบมีเงื่อนไข** ที่จงใจแยกออกจาก 8 มิติหลัก แล้ว thread เป็น field optional ของตัวเอง
ทุกจุด (`meetsPremiumDraftFloor` `:4521` / `scoreToScorecard` / `worstCasePremiumScorecard` /
`composePremiumScoreFeedback` `:4807`) → *"present → floor-check ด้วย; absent → เพิกเฉยทั้งหมด"*
ซึ่งทำให้ call site เดิมทุกตัว **byte-identical**

**เพิ่ม `prior_season_continuity`** ด้วยรูปแบบเดียวกันเป๊ะ:
- ให้คะแนน **เฉพาะเมื่อ `seasonLineage` มีค่า** (คือโหมดภาค 2 เท่านั้น) — ซีรีส์ปกติต้องไม่เปลี่ยนแม้แต่ไบต์เดียว
- ผู้ตัดสินได้ fact = `series.memory` ของ parent (compactSummary + currentState: ความสัมพันธ์+
  `disclosure`, ปมค้างแยก class, `characterKnowledge`) — **ไม่ใช่เนื้อภาคเดิมทั้งเรื่อง** (bounded)
- < 3 → เข้าลูปเกลาเดิมอัตโนมัติ (สูงสุด 4 รอบ) ไม่ต้องเขียน retry ใหม่

**เกณฑ์ตัดสินอยู่ใน `skills/vertical-drama-season-dramaturgy-critic/skill.md` เท่านั้น** (กฎโปรเจกต์:
TS คำนวณ fact, skill ถือดุลพินิจ — **ห้าม hardcode เกณฑ์ใน TS**). สิ่งที่ skill ต้องจับ:
- **ความสัมพันธ์ถอยหลัง** — คู่ที่ภาคเดิมจบแบบ `public` กลับมาเป็น `secret` โดยไม่มีเหตุ = หลุด
- **ตัวละครถอยหลัง** — คนที่ภาคเดิมโตแล้วกลับไปเป็นคนเดิมเพื่อให้ปมใหม่เดินได้ = ขี้โกง
- **ใครรู้อะไรผิด** — ตัวละครที่ `characterKnowledge` บอกว่ารู้แล้ว กลับมาไม่รู้ = คนดูจับผิดทันที
- **ปมค้างถูกทิ้งเงียบ** — `domestic` thread ที่ค้างจากภาคเดิมหายไปเฉย ๆ โดยไม่ปิดและไม่พูดถึง
- **อ้างเหตุการณ์เก่าผิด** — ขัดกับ `canonicalFacts`
- ต้องแยก *"เปลี่ยนแปลงอย่างมีเหตุผล"* (ดี — ความสัมพันธ์ต้องขยับ) ออกจาก *"หลุด/ขัดกัน"* (แย่)
  — มิตินี้ต้องไม่ลงโทษการที่เรื่องเดินหน้า

**เทสต์:** `seasonLineage: undefined` ⇒ scorecard ไม่มีคีย์นี้ + prompt byte-identical
(`.toBe()` เทียบสอง build); มีค่า ⇒ มิติโผล่ + floor-check ทำงาน + คะแนนต่ำเรียก revise จริง

## Stage 2.5 — ภาคพิเศษ

series row ใหม่, `createMode="special_edition"`, `targetEpisodeCount = 1-2`. Pipeline ไม่ต้องแก้เลย
เพราะทุกอย่างขับด้วย `targetEpisodeCount` — เหตุผลที่ "project แยกแต่ผูก parent" ถูก

**Skill ใหม่ `skills/vertical-drama-special-edition-planner/skill.md`** — craft ของ "เนียน":
ใช้ความผูกพันที่คนดูมี, แยกรีวิวตรง ๆ vs tie-in, สถานที่/สินค้าต้อง earn เวลาบนจอผ่าน
*ความอยากของตัวละคร* ไม่ใช่การ pitch, และ**ต้องไม่ไปเปิดปมของซีซั่น**.
**ประกอบร่วมกับ** `vertical-drama-product-tie-in-planner` เดิม ไม่แทนที่ — planner ใหม่ตัดสิน story shape
แล้ว `planTieIn` (`verticalDramaProductTieIn.ts:127`) ทำ placement/claims/fatigue เหมือนเดิม
ภาคพิเศษยัง**กิน `series.memory` ของ parent** เพื่อให้ความสัมพันธ์/สรรพนาม/สถานะถูกต้อง (คนดูจะจับผิดทันที)

**3 sources → facts:**
1. **Marketplace ในสเต็ปนี้เลย** — `trpc.marketplaceCapture.listProducts` **wired อยู่ใน wizard แล้ว**
   (`CreateSeriesWizard.tsx:216-219`, gate `enabled: form.productTieInEnabled` → ขยายเป็น
   `|| createMode === "special_edition"`). component เดิม query เดิม คนละสเต็ป — และไหลเข้า pipeline
   เดิมจริงเพราะผลิต `productTieIn` JSONB ก้อนเดียวกับ tab "สินค้าผูกเรื่อง"
2. **อัปโหลดรูป + สรุปย่อ** — `trpc.ai.upload` เก็บ `{url,mimeType,fileName}` ใน `WizardState`.
   **ห้ามใช้ `resolveMediaAssetForImport`** (`verticalDramaCharacters.ts:2206`) เพราะเรียก
   `loadOwnedSeries` ที่ `:2240` → ต้องมี series ก่อน ซึ่ง wizard ยังไม่มี. ใช้
   **`createAssetFromAttachment`** (`server/services/mediaAssetService.ts:134`) ใน best-effort block
   ของ `create` — รับ context แค่ tenant+user ไม่ผูก series → assetId → `productTieIn.referenceAssetIds`
   (idempotent dedup ด้วย checksum `:147-159` → retry ปลอดภัย)
3. **Story function** — radio → `allowedStoryFunctions`. รีวิวตรง → `["soft_cta","daily_use"]`;
   tie-in หา solution → `["plot_clue","memory_trigger","relationship_token"]`

**เติม `VerticalDramaProductTieInConfig` ให้ครบจริง** (วันนี้ wizard เขียน config ขาด 5 required fields
แล้ว `z.record(z.unknown())` ไม่จับ): `referenceAssetIds` (เมื่อก่อน `[]` เสมอ),
`disclosurePolicy: "caption_disclosure"` (ภาคพิเศษรับเงิน = โฆษณา เปิดเผยตรงไปตรงมา),
`maxEpisodesWithTieInPerTenEpisodes: 10` (ภาคพิเศษคือ tie-in ทั้งเรื่อง — fatigue cap ไม่มีความหมาย
และต้องไม่ suppress placement), `requireHumanApproval: isRegulatedCategory(...)` (reuse
`verticalDramaProductTieIn.ts:60`). **validate ด้วย contract จริงก่อน insert เฉพาะ
`createMode==="special_edition"`** — ปล่อยเส้นทาง `z.record` ของโหมดเดิมไว้เหมือนเดิมเป๊ะ

## Stage 2.6 — Wizard UX

**`wizardSteps` เป็นฟังก์ชัน แต่ original คืน array object เดิม** (`verticalDramaCopy.ts:731-745`):
`resolveWizardSteps(mode)` → original คืน **reference เดิมตัวเดียวกัน** → stepper/`stepComplete`/`isLast`
เหมือนเดิมทุกไบต์ และ copy test เดิมไม่ต้องแก้

**Mode selector อยู่ใน step 0 (`basic`) ไม่ใช่ step ใหม่** — แทรก step จะ renumber
`switch (stepIndex)` (`:862`) และทุก case = diff ใหญ่เสี่ยง regression บน switch 6 ทาง เพื่อ control
ที่ตามตรรกะควรอยู่กับ "เรากำลังทำอะไร" อยู่แล้ว. toggle 3 ทางบนหัว body ของ case `basic` (`:863`);
เลือกโหมดแล้วเผย series picker inline

| step | เดิม | ภาค 2 | ภาคพิเศษ |
|---|---|---|---|
| basic | คงเดิม | + toggle, picker, seasonNumber; **genre/tone locked** | + toggle, picker; ตอนย่อยล็อค 1-2 |
| story | คงเดิม | + `newConflictDirections` chips | **แทนที่** — "จะรีวิว/แนะนำอะไร" |
| characters | คงเดิม | **แทนที่** — carry-over grid + การ์ดความสัมพันธ์/ปมค้าง | ซ่อน (ยกทั้ง cast) |
| bible | คงเดิม | prefill จาก parent, **visual แก้ได้ / genre ล็อค** | prefill, genre ล็อค |
| product | คงเดิม | คงเดิม | **แทนที่** — picker 3 sources |
| review | คงเดิม | + lineage + memory coverage warning | + lineage summary |

**Rekey `switch` จาก index เป็น `steps[stepIndex].id`** — จำเป็นเพราะ array แปรผันตามโหมด
เป็น refactor เชิงกลไก ไม่เปลี่ยนพฤติกรรมโหมดเดิม (id คือ `basic`/`story`/… อยู่แล้ว)
กันด้วยเทสต์ว่าโหมดเดิม render 6 body เดิม

**Memory coverage warning** (ผู้ใช้เลือก "เตือน + ให้เติมเอง"): step review แสดง
"สรุปจากบทจริง 8/30 ตอน ที่เหลือเป็นโครงเรื่องย่อ — ความต่อเนื่องอาจไม่ครบ" + ลิงก์ไป Series Memory tab

`createValid` (`:452`) เพิ่ม: sequel/special ต้องมี `parentSeriesId`.
`INITIAL_WIZARD` เพิ่ม `createMode: undefined` (ไม่ใช่ `"original"` — mirror กติกา NULL-is-original)

**Badge:** `VerticalDramaShell.tsx` card อ่าน `createMode`/`lineage.parentTitle` →
`ภาคพิเศษ ของ <ชื่อเรื่อง>` / `ภาค <seasonNumber>`. string ลง `verticalDramaCopy.ts` สองภาษา

**Feature flag `verticalDramaSeriesLineage`** ตาม convention VD เดิม (`verticalDramaSeriesPresetMixV2`,
`verticalDramaUserPremise`) — gate เฉพาะ UI + create branch **ไม่ gate เส้นทาง read ของ schema**

---

## Verification

```bash
# Stage 2.1 — SQL ก่อน schema.ts เสมอ
psql "$DATABASE_URL" -c 'SELECT count(*) FROM vertical_drama_series;'   # baseline
psql "$DATABASE_URL" -f apps/web/drizzle/manual_vertical_drama_series_lineage.sql
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns
  WHERE table_name='vertical_drama_series' AND column_name IN
  ('parentSeriesId','createMode','seasonNumber','lineage');"            # ต้องได้ 4
psql "$DATABASE_URL" -c 'SELECT count(*) FROM vertical_drama_series;'   # ต้องเท่า baseline

cd apps/web && pnpm check && pnpm vitest run server/services/__tests__/verticalDrama
```

**Part 1 คือสิ่งที่ต้องพิสูจน์ก่อน** — รัน deep-draft ซีรีส์ 16 (มีบทจริง 18/20 ตอน) แล้ว:
```sql
SELECT jsonb_array_length(memory->'episodes') FROM vertical_drama_series WHERE id=16;
SELECT jsonb_pretty(memory->'currentState'->'relationships') FROM vertical_drama_series WHERE id=16;
```
ต้องเห็นคู่ความสัมพันธ์พร้อม `disclosure` จริง — **ถ้าตรงนี้ว่าง Part 2 ไม่มีความหมาย หยุดแล้วแก้ก่อน**

| ไฟล์เทสต์ | assert |
|---|---|
| ใหม่ `seriesMemoryState.fold.test.ts` | `foldSeriesMemory` pure: deltas หลายตอน → สถานะล่าสุดต่อ pair; thread resolved หลุด; ตอนซ้ำ supersede |
| `verticalDramaStoryBible.productionGradeFullStory.test.ts` (มีอยู่ — เจ้าของ coverage `knownLocations`) | **`seasonLineage: undefined` ⇒ prompt `.toBe()` prompt ที่ไม่ส่ง field เลย** (snapshot equality ทั้ง user+system) + `.not.toContain("SEASON LINEAGE")`; `episode_memory` หายไป → draft ไม่พัง |
| ใหม่ `verticalDramaSeriesMemoryProjection.test.ts` | upsert supersede by episodeNumber; `userEdited` ไม่ถูกทับ; ความจำพังไม่ทำให้ draft พัง |
| `verticalDramaSeries.createPresetStamp.test.ts` / ใหม่ `createLineage.test.ts` | **โหมดเดิม create เขียน 4 คอลัมน์ใหม่เป็น NULL และไม่เปลี่ยนอย่างอื่น**; sequel clone จริง |
| ใหม่ `verticalDramaSeriesClone.test.ts` | characterKey คงเดิม; variant FK remap ไม่ dangle; asset row แชร์ `mediaAssetId`; write_out ไม่มา; `productTieIn` ไม่ถูก copy |
| `verticalDramaCharacterDesignContext.test.ts` (มีอยู่) | parent หลุดจาก `recentLeadArchive` เมื่อมี `parentSeriesId`; ไม่มี → เหมือนเดิม |
| ใหม่ `verticalDramaSeasonCarryOver.test.ts` + `.skillContent.test.ts` | schema parse; skill.md โหลดได้ (pattern `verticalDramaPresetSynthesizer.skillContent.test.ts`) |
| `verticalDramaProductTieIn.test.ts` (มีอยู่) | config ภาคพิเศษผ่าน `VerticalDramaProductTieInConfig` เต็มรูป |

**E2E บน https://smartaihub.app:** สร้างภาค 2 จากซีรีส์ 16 → cast มาครบพร้อมรูป (ไม่เสียเครดิต) →
deep-draft ออกปมใหม่ที่**อ้างอิงสถานะจากภาค 1 ถูกต้อง** (คู่ไหนเปิดเผยแล้ว ปมไหนค้าง) →
ภาคพิเศษ 1 ตอนผูกสินค้า marketplace → โหมดเดิมยังสร้างได้เหมือนเดิม

---

## Risks

1. **Part 1 ยังไม่เคยพิสูจน์กับข้อมูลจริง** — ไม่มีซีรีส์ไหน `status='completed'` เลย (9/9 เป็น draft)
   และ pipeline หยุดที่ storyboard. ความว่างเปล่าอาจสะท้อนว่า"ยังไม่มีใครขับจนจบ" ไม่ใช่แค่โค้ดผิด.
   **ต้องรัน Part 1 กับซีรีส์ 16 ให้เห็นความสัมพันธ์+disclosure จริงก่อนเริ่ม Part 2**
2. **Weak-model JSON risk** — เพิ่ม `episode_memory` เข้า output schema ที่หนักอยู่แล้ว เสี่ยงตาม
   failure class ที่บันทึกไว้ (โมเดลถูก → JSON เสีย). กันด้วย optional block + deterministic fallback
   + `VD_SCHEMA_MAX_RETRIES=2` ที่มีอยู่ **ห้ามแก้ด้วยการเปลี่ยนโมเดล** (ผิด cost policy)
3. **ลำดับ deploy (Stage 2.1)** — schema.ts ก่อน SQL = VD read พังหมดทันที เป็น deploy-order
   requirement ไม่ใช่แค่ comment
4. **Skill cache ไม่ invalidate** (`verticalDramaStoryBible.ts:4646` module-level `let`) →
   แก้ skill.md แล้วเงียบจนกว่าจะ restart web service. footgun ของทุกคนที่เทสต์ Stage 1.3/2.4
5. **`genre` repair แตะข้อมูลผู้ใช้** — 9 แถวมี logline/ชื่อสำรองอยู่ ต้อง backup ก่อนตาม
   Database Safety Protocol และให้ user ยืนยัน mapping ไม่ใช่เดาเอง
6. **Rekey switch (index → step id)** แตะ case label ของทุก step เดิม — ปลอดภัยเชิงกลไกแต่
   reviewer จะเห็นเป็น "ทำไมไฟล์โหมดเดิมเปลี่ยนเยอะ"
7. **ภาคพิเศษ 1 ตอน** ได้ `episodeNumber === 1 === totalEpisodeCount` → ขอ `protagonist_stake` +
   `world_rules` + `price_paid` ครบในตอนเดียว 9 ช็อต หนักไปสำหรับรีวิวโรงแรม.
   **แก้ที่คำสั่งใน skill ไม่ใช่ TS branch** (TS branch = story logic ใน TS ผิดกฎโปรเจกต์ +
   ยัด conditional เข้าฟังก์ชันที่ byte-identity สำคัญที่สุด)
