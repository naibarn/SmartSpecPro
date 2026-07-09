# Tie-in Defer → Real Arc Re-plan Proposal (Task #31)

Owner directive (2026-07-08): ข้อ 8 ที่เคย skip "เป็นฟังก์ชั่นหลักที่ต้องทำให้สมบูรณ์ ใช้งานได้จริง —
จุดไหนต้องเพิ่ม field ก็เพิ่ม ต้องปรับปรุง db ก็ปรับปรุง"

**สถานะ:** แผนสมบูรณ์ (ground truth ตรวจแล้ว 2026-07-08 21:1x) — implement ได้เมื่อ
episodes router ว่างจาก #26 และ series router/flags ว่างจาก #30-A1

---

## 0) Root cause ที่แท้จริง (ลึกกว่าที่ #24 รายงาน)

การวิเคราะห์ #24 ถูกต้อง (proposal ไม่มี field tie-in) แต่รากจริงลึกกว่านั้น:
**ระบบไม่มี "แผน tie-in ระดับซีซั่น" อยู่เลย** — การที่ตอนหนึ่งมีสินค้าเป็นการตัดสิน
*เชิงรับ* ตอน generate บทรายตอน (`evaluateFatigue` นับ `hadTieIn` ย้อนหลัง 10 ตอนจาก
script จริง — verticalDramaProductTieIn.ts:216,328) ไม่ใช่ *เชิงแผน* เมื่อไม่มีแผน →
defer จึงไม่มีอะไรให้ "ย้าย" → ได้แค่ boolean `scheduleAtRisk`

**Fix ที่สมบูรณ์ = ยกตำแหน่ง tie-in เป็นข้อมูลชั้นหนึ่งบน season plan (breakdown item)**
แล้วให้ defer สร้าง arc_replan_proposal จริงที่ย้ายตำแหน่งไปตอนอนาคต ผ่านกลไก
propose→approve→apply ที่มีครบอยู่แล้ว (ArcReplanCard UI + approve/rejectArcReplanProposal
+ applyApprovedArcReplan ที่ verticalDramaArcReplan.ts:436)

**คำตอบเรื่อง db (ตามคำสั่ง "ต้องปรับ db ก็ปรับ"):** ตรวจแล้ว**ไม่ต้องมี SQL migration** —
`episodeBreakdown`/`breakdownVersions` อยู่ใน story bible jsonb ทั้งก้อน และ zod ของ
breakdown item เป็น `.passthrough()` (contentBudget.ts:91-99, spec §7.7.2 rule 6 tolerant
parse) → เพิ่ม optional field ใหม่ = backward/forward compatible ทันที ข้อมูลเดิมทุกแถว
อ่านได้โดยไม่ migrate ไม่ mutate (นี่คือการปรับปรุง schema จริง แค่เป็นชั้น shared type+zod
ไม่ใช่ชั้น SQL — จุดที่ SQL ต้องแตะจริงไม่มี)

## 1) Shared schema (`shared/verticalDramaSeries/contentBudget.ts`)

```ts
export type VerticalDramaEpisodeTieInPlacement = {
  planned: boolean;                       // true = ตอนนี้ตามแผนต้องมีสินค้า
  intensity?: "light" | "featured";       // ระดับการปรากฏ (default light)
  benefitFocus?: string;                  // ประเด็นขายที่ตอนนี้ควรสื่อ
  source: "planned" | "deferred" | "manual"; // มายังไง
  movedFromEpisodeNumber?: number;        // ถ้า source="deferred"
};
// เพิ่มบน item (optional — legacy ไม่มี field = พฤติกรรมเดิม):
VerticalDramaEpisodeBreakdownItem += { tieIn?: VerticalDramaEpisodeTieInPlacement }
// + zod .optional() ใน verticalDramaEpisodeBreakdownItemSchema (:91)
```

- Drift reason ใหม่: `"VD_ARC_TIE_IN_DEFERRED"` ต่อท้าย
  `VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES` (:174) — ตรวจผู้บริโภค enum ทุกจุด
  (copy map ฝั่ง client ของ ArcReplanCard ต้องเพิ่มคำแปลไทย)
- Pure helpers (deterministic, มี unit tests ครบ):
  - `planSeasonTieInPlacements(items, {perTenCap, plannedCount, formatProfile?})` →
    กระจายตำแหน่งเริ่มต้นทั้งซีซั่น: เว้นระยะสม่ำเสมอ, เลี่ยงตอน 1 (hook ล้วน) โดย default,
    เคารพ budget จาก `resolveTieInEpisodeBudget` ของ #23 (ซีรีส์สั้น prorate แล้ว ≥1) —
    ใช้โดย #22 ตอน generate และเป็น fallback bootstrap แผนให้ซีรีส์เก่า
  - `proposeTieInDeferReplan({items, fromEpisodeNumber, producedEpisodeNumbers, perTenCap})`
    → `{ok:true, proposedBreakdown, targetEpisodeNumber, rationaleTh}` |
      `{ok:false, reason:"no_future_slot"|"cap_exhausted"|...}`
    กติกา: เลือกตอนอนาคตที่ใกล้สุดซึ่ง (ยังไม่ผลิต, ไม่มี tie-in ตามแผน, ใส่แล้ว fatigue
    window ไม่เกิน cap); เขียน target.tieIn={planned:true, source:"deferred",
    movedFromEpisodeNumber:E}; เคลียร์ planned ของตอนต้นทาง; **ห้ามแก้
    workingTitle/logline/keyBeats/contentBudget ของ item ใด ๆ** (คุณสมบัติที่ทำให้
    proposal นี้ deterministic ได้โดยไม่ต้องแต่งเนื้อเรื่อง — จุดที่เคยคิดว่าต้องใช้ LLM
    ที่จริงไม่ต้อง เพราะเราเพิ่ม field แล้วเนื้อเรื่องไม่ถูกแตะ)

## 2) Defer → proposal จริง (`server/routers/verticalDramaEpisodes.ts` — deferEpisodeTieIn)

พฤติกรรมปัจจุบัน (คงไว้เป็นฐาน): backup script เป็น artifact
`tie_in_defer_prior_script` → strip tie-in plan ออกจาก script → คำนวณ scheduleAtRisk

เพิ่ม (หลัง flag F131Y `verticalDramaSeriesTieInReplan` เปิด):
1. โหลด active breakdown version; ถ้าซีรีส์ไม่เคยมีแผน tie-in บน items เลย →
   bootstrap ด้วย `planSeasonTieInPlacements` เฉพาะใน memory ของ proposal
   (ไม่แตะ version จริงจนกว่าจะ approve)
2. `proposeTieInDeferReplan(...)`:
   - ok → persist `arc_replan_proposal` ผ่านช่องทางเดียวกับ
     `runArcDriftCheckAndProposeIfNeeded` (โครง VerticalDramaArcReplanProposal:
     driftReasons=[VD_ARC_TIE_IN_DEFERRED], affectedEpisodeNumbers=[E,E'],
     rationale ไทยอธิบายการย้าย, proposedBreakdown ทั้งชุด) →
     return {deferred:true, proposal:{proposalId, targetEpisodeNumber}, scheduleAtRisk:false}
   - not ok → พฤติกรรมเดิม scheduleAtRisk:true + reason code ใหม่แนบไปให้ UI
     อธิบายว่า "ย้ายอัตโนมัติไม่ได้เพราะอะไร" (เช่น ไม่มีตอนอนาคตว่าง — แนะนำขยายซีซั่น
     ↔ เชื่อมกับงาน #26 ที่ทำ banner "ขยายแผนซีซั่น" อยู่)
3. Flag ปิด = โค้ดเดิม 100% (grandfather)

## 3) Apply guard (`server/services/verticalDramaArcReplan.ts`)

`applyApprovedArcReplan` (:436) append proposedBreakdown เป็น version ใหม่อยู่แล้ว —
tieIn ขี่ไปบน items โดยอัตโนมัติ เพิ่ม 1 อย่าง: **deterministic guard สำหรับ proposal
ชนิด VD_ARC_TIE_IN_DEFERRED** — ทุก item ใน proposedBreakdown ต้องเท่ากับ active
version ทุก field ยกเว้น `tieIn` (เทียบ field-by-field) ไม่งั้น reject พร้อม audit
artifact (แนวเดียวกับ story_lock_violation ของ #19) — กัน proposal ปลอมที่แอบแก้เนื้อเรื่อง

## 4) ผู้บริโภคอ่านแผน (grandfather ทุกจุด: ไม่มี field = พฤติกรรมเดิม)

- **สร้างบทตอน (plan_episode_script)**: ถ้า item ของตอนมี `tieIn.planned===true` →
  บังคับ include tie-in ใน generation input (ส่ง benefitFocus/intensity เข้า context ที่
  ระบบรายตอนมีอยู่แล้ว); `planned===false` ชัดเจน → exclude แม้ fatigue จะอนุญาต;
  ไม่มี field → ตรรกะ fatigue เดิม
- **Wizard + TieInReportCard**: บรรทัดสถานะ "ตามแผนซีซั่น: ตอนนี้มีสินค้า
  (ย้ายมาจากตอนที่ X)" / "ตอนนี้ไม่มีสินค้าตามแผน"
- **Overview (series detail)**: badge ตอนที่มีแผน tie-in (โครงเดียวกับ badges ของ #22 —
  #22 จะมาต่อยอด field นี้ตรง ๆ)
- **ArcReplanCard**: copy ไทยเฉพาะชนิด tie-in ("ข้อเสนอย้ายสินค้า: ตอน E → ตอน E'")
  + แสดง diff แบบย่อ (ตอนไหนได้/เสียตำแหน่ง) — reuse การ์ดเดิม เพิ่ม branch ตาม
  driftReasons
- **Defer UX**: หลังกด defer สำเร็จ → toast "สร้างข้อเสนอย้ายไปตอนที่ E' แล้ว —
  รออนุมัติที่หน้าภาพรวม" + ลิงก์

## 5) Flag + spec + ลำดับ

- Flag `verticalDramaSeriesTieInReplan` (F131Y): 4 จุด register + admin group +
  default false + เปิด 2 tenants หลัง deploy (ทำพร้อมรอบ wiring F131X/F131W)
- Spec sync: อัปเดต §13.1 defer path (จาก "raise scheduleAtRisk" → "สร้าง
  arc_replan_proposal ชนิด VD_ARC_TIE_IN_DEFERRED; scheduleAtRisk เฉพาะเมื่อย้ายไม่ได้")
  + §7.7.3 เพิ่ม field tieIn บน breakdown item — ทำใน task เดียวกัน
- **ความสัมพันธ์กับ #22**: แผนนี้คือ "รากฐาน" — #22 (tie-in aware deep drafts) จะใช้
  `planSeasonTieInPlacements` ตอน generate เต็มซีซั่นและอ่าน `tieIn` ตอนร่าง 9 ช็อต
  → ลำดับบังคับ: **#31 ก่อน #22**
- **ชนไฟล์**: episodes router (#26 กำลังใช้), series router + featureFlags (#30-A1 กำลังใช้)
  → เริ่ม #31 ได้เมื่อ #26 จบ; ส่วน flag registration รอ #30-A1

## 6) Tests

- Pure: planSeasonTieInPlacements (กระจาย/เลี่ยงตอน1/budget สั้น-ยาว/edge N=3),
  proposeTieInDeferReplan (ย้ายใกล้สุด, ข้ามตอนผลิตแล้ว, cap แน่น → no_future_slot,
  ไม่แตะเนื้อเรื่อง byte-identical)
- Router: defer → proposal persisted + โครงถูก; flag ปิด = เดิม; bootstrap series เก่า
- Apply guard: proposal แอบแก้ logline → reject + artifact
- Consumer: script gen บังคับ include/exclude ตามแผน; grandfather ไม่มี field
- Client: การ์ด/toast/badge

## Definition of Done

กดปุ่ม defer บนตอนที่มีสินค้า → ระบบเสนอย้ายไปตอนอนาคตที่ดีที่สุดโดยอัตโนมัติ →
user เห็นข้อเสนอบน ArcReplanCard หน้าภาพรวม → กดอนุมัติ → แผนซีซั่นเวอร์ชันใหม่มี
สินค้าที่ตอนใหม่จริง → บทของตอนใหม่ที่ generate หลังจากนั้น include สินค้าจริง →
ตอนต้นทางไม่มีสินค้า → จำนวนตอนที่มีสินค้าทั้งซีซั่นคงเดิมตามสัญญา
