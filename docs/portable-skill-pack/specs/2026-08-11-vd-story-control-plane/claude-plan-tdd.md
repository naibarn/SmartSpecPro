# TDD Plan — Vertical Drama Story Control Plane

## Test strategy

ใช้ Vitest ตาม convention ของ `apps/web` สำหรับ pure contracts, Zod schemas, skill wrappers, prompt shaping, reconciler, router authorization และ component behavior ใช้ Playwright สำหรับ browser evidence ของ memory/control surface เท่านั้น งานที่แตะฐานข้อมูลจริงใช้ integration tests ที่มี flag/fixture แยก ไม่ใช้ production series เป็น test fixture ที่ mutate ได้

ทุก test ต้องแยกผล focused flow ออกจาก repository-wide typecheck baseline และต้องยืนยันว่าเมื่อ feature flag ปิด ผลเดิมยังคง byte-compatible ในจุดที่กำหนด

## 1. ผลลัพธ์ที่เลือก

ก่อน implementation ให้เขียน contract tests ที่ยืนยันว่า:

- creative skill เป็นผู้ตัดสิน semantic quality และ deterministic code ไม่ให้คะแนน romance/payoff แทน
- ledger/memory ไม่สามารถ persist state โดยตรงจาก free-text
- ไม่มี code path ใหม่ที่สร้าง source of truth ชุดที่สอง
- produced/locked episode ไม่ถูกแก้จาก validation หรือ repair
- runtime ไม่ถูกอ่านจากค่าคงที่ 60/90 วินาที แต่ derive จาก duration profile/vector ของ 9 logical shots

## 2. สิ่งที่ไม่ควรทำ

สร้าง regression fixtures ที่ต้อง fail หากมีการ:

- ส่ง full ledger ทั้งซีซันเข้า episode prompt
- เปิด durable thread ทุกครั้งที่มี cliffhanger
- mark resolved จาก description อย่างเดียว
- บังคับ romance beat ทุกตอนหรือ winner สลับเป็นสูตร
- auto-merge legacy IDs หรือ rewrite episode เก่า

## 3. สถาปัตยกรรมเป้าหมาย

### 3.1 แหล่งข้อมูลกลาง

Test schema round-trip ของ breakdown version ที่มี/ไม่มี `storyControl`, ledgers รุ่นเก่า และ memory event projection โดยตรวจว่า legacy read ไม่ mutate input และ active version ยังเลือกได้ถูกต้อง

### 3.2 โครงสร้าง `storyControl`

Test cases สำหรับ:

- valid contract ที่มี premise anchor, cast matrix, episode slots, romance rhythm และ advantage curve
- valid duration contract ที่มี 9 logical shots, uniform/mixed shot durations, provider capability และ derived render runtime
- provider capability/catalog เป็นแหล่ง allowed durations เพียงชุดเดียว และ `renderSegmentDurationsSeconds` mapping อาจมี 8 หรือ 9 segmentsโดยไม่เปลี่ยน logical shot identity
- missing required fields ใน newly-created plan ถูก reject หรือคืน review state
- legacy object ที่ไม่มี fields ใหม่ยัง parse/read ได้
- thread action ทุกชนิดอ้าง ID/episode slot ได้ถูกต้อง
- payoff window ย้อนกลับ, owner character ไม่อยู่ใน cast, invalid episode range และ duplicate IDs ถูก reject
- vector ที่ไม่ครบ 9 shots, duration ที่ provider ไม่รองรับ, render mapping ไม่ตรง และ manually-entered runtime ที่สวนทางกับผลรวมถูก reject
- status transition `active -> stalled/resolved/parked/sequel_hook/legacy_unknown` ถูกต้อง และสถานะ `parked/sequel_hook/legacy_unknown` ไม่ถูก reconcile กลับเป็น active โดย implicit text match

### 3.3 Story-control seed

ทดสอบ seed adapter ว่า:

- seed ที่ valid แปลงไปยัง control plan โดยไม่สร้าง thread สำเนา
- seed ที่ขัดกับ approved breakdown คืน conflict/review และไม่แก้ breakdown
- seed ที่ขาด/parse ไม่ได้ไม่เปิด enforced deep drafting
- seed ไม่สามารถเพิ่ม canonical character ที่ไม่มีใน roster

### 3.4 Data flow

ใช้ fixture episode เดียว trace ตั้งแต่ approved outline -> slot -> script action -> memory observation -> reconcile -> quality finding/projection ตรวจว่า ID, source version และ evidence reference ไม่หายตลอดทาง

## 4. หลัก skill-first

### 4.1 Semantic responsibility

ใช้ mocked skill outputs ตรวจว่า reviewer สามารถคืน `payoff_quality`, `romance_phase_fit`, `relationship_chemistry`, `power_shift_quality` และ `premise_adherence` ได้ และระบบไม่คำนวณ/override คะแนนเหล่านี้ด้วยจำนวน field เพียงอย่างเดียว

### 4.2 Deterministic responsibility

ทดสอบ pure validator สำหรับ unknown ID, silent drop, unproven resolution, budget exceeded, canonical role mismatch, stale version และ locked episode

### 4.3 Context budget

ทดสอบ prompt builder ว่า episode author ได้เฉพาะ immutable core subset + current slot + relevant recent state และไม่รับ full ledger/open-thread list เมื่อ thread ไม่เกี่ยวข้อง ตรวจ serialized size กับ budget fixture และรักษา legacy prompt เมื่อ flag off

## 5. ลำดับ implementation

### Phase 0 — Capability and safety benchmark

เพิ่ม fixtures ภายใต้ skill/service test directories สำหรับ:

- romance mystery 20–30 episodes
- short-form 6 episodes
- legacy series 21 snapshot at episode 25

Test stubs:

- output JSON truncated -> one targeted retry -> no partial persist
- invented character -> canonical mismatch/review
- unknown thread ID -> structural failure
- semantic uncertainty -> `needs_review`, not auto-close
- prompt token/serialized size stays within declared budget
- uniform 8s x 9, mixed duration profile, 30s shot profile และ legacy 60s profile ให้ผล runtime/compatibility status ถูกต้อง
- seed conflict with outline -> no outline mutation

### Phase 1 — Canonical contract and versioned storage

Test paths:

- `apps/web/shared/verticalDramaSeries/__tests__/...` for schemas, status transitions, adapters and legacy round trips
- `apps/web/server/services/__tests__/...` for active breakdown read/write helpers

Test stubs:

- additive parse of legacy ledgers
- exact preservation of existing camelCase ledger keys
- legacy duration fields อ่านได้เป็น `legacy_compat` โดยไม่ถูก rewrite และ plan ใหม่ไม่ inherit fixed 60s เป็น canonical value
- derived `open_threads` matches canonical active IDs
- `sourceBreakdownVersionId` mismatch blocks stale write
- locked/produced episode write is rejected
- new optional JSONB fields require no migration when flags are off

### Phase 2 — Full-story seed and existing ledger planner

Test wrappers around `verticalDramaLedgerPlanner.ts` and the full-story outline boundary:

- valid seed is included only in outline/control pass, not every shot prompt
- ledger planner annotates approved breakdown rather than replacing it
- malformed row is dropped/reported according to existing tolerant pattern, but a premise conflict becomes review state
- scope classifier distinguishes moment/episode/arc/season thread
- active/new durable-thread budget is enforced deterministically
- romance pause/none is allowed and does not create false gap failure
- advantage beat with shared/unclear initiative is valid when skill explains it

### Phase 3 — Episode slot handoff and script builder

Test `verticalDramaScriptGeneration.ts` and script-builder contract:

- only allowed thread actions are accepted
- `proposed_new_thread` is non-persistent until approval
- canonical speaker and character role bindings are enforced
- valid `episode_memory` does not get silently merged with conflicting `open_loops`
- old output remains accepted under flag-off compatibility mode
- slot includes only relevant cast/state and preserves premise/forbidden contradictions
- slot ส่ง duration profile/vector ให้ script-builder และ speech budget ต่อ shot derive จาก duration จริง

### Phase 4 — Evidence reconciliation and quality loop

Test `verticalDramaQualityLedgerReconcile.ts`, memory planner adapter and quality review orchestration:

- explicit action + registered ID + evidence produces resolvable observation
- missing opening, episode fallback ID or free-text hook becomes legacy/unknown, never canonical
- resolve without evidence yields `unproven_resolution`/`needs_repair`
- silent thread drop is found even when episode text does not mention the label
- `parked`, `sequel_hook`, `legacy_unknown` remain stable across reconcile passes
- semantic quality finding does not directly mutate ledger status
- invalid duration profile, incomplete 9-shot vector and shot/render runtime mismatch become structural findings separate from semantic review
- one targeted repair is attempted; second failure becomes user review
- LLM, credits, rate limit and schema retry failures retain prior state
- ownership/auth negative cases reject cross-tenant/cross-user access

### Phase 5 — Legacy audit and current series at episode 25

Test read-only audit fixtures:

- matched opening/resolution is reported as matched
- missing opening, duplicate and fallback ID are separately classified
- no similarity-based automatic merge
- series 21 future-horizon starts after the actual last locked/produced episode
- episodes 1–25 and prior memory events remain byte-identical after audit
- disposition proposal records actor/reason/source ID and does not mark resolved before approval
- old missing `episode_memory` remains audit-only
- legacy episode with known 60s assembly is labeled `legacy_compat`; missing duration evidence is `legacy_duration_unknown`; audit never infers a new profile

### Phase 6 — UI and observability

Component tests for existing `VerticalDramaSeriesMemoryStateTab` and new focused components:

- render ID, scope, owner, age, payoff window, evidence and resolved metadata
- distinguish open, stalled, overdue, needs review, resolved evidence, parked and legacy unknown
- show duration profile, logical shot count, derived runtime and `duration_pending`/`legacy_compat` without implying every episode is 60 seconds
- resolved history and append-only event log remain distinct
- loading/empty/error/partial/audit-only/read-only states do not imply all threads are closed
- filters and evidence deep links preserve selected state
- Thai copy and English fallback exist for new labels/errors
- keyboard focus, accessible names and non-color status signals are present

Browser test stubs:

- route `/drama-series/:seriesId?tab=seriesMemory` at 390x844, 768x1024, 1440x900
- extended 360x800, 1024x768 and 1280x800 for dense cards/sidebar
- no new console errors or unintended horizontal overflow
- loading/empty/error/read-only/audit-only states render as planned
- light/dark readability and reduced-motion behavior remain intact

### Phase 7 — Rollout

Test flag matrix:

- all flags off: legacy behavior and payload shapes preserved
- plan-only: generates proposal, no episode enforcement
- audit-only: findings visible, no writes
- enforced: structural gates active only for approved new/future plan
- kill switch: fallback works and does not delete stored plan/evidence

## 6. Acceptance criteria

The final focused suite must cover each acceptance criterion in the implementation plan with at least one fixture. In particular, no test may rely only on `resolved === true`; it must verify registered ID, explicit action, evidence, source episode and semantic-review state.

## 7. UI/UX Contract

UI test coverage must mirror the state/responsive/accessibility matrix in `claude-plan.md`. Browser evidence is an artifact requirement, not a substitute for component tests, and skipped browser checks must be reported as skipped.

## 8. Risks and mitigations

Add regression tests for each listed risk: stale concurrent version, unauthorized access, provider/credit failure, prompt growth, status reactivation, legacy false closure, over-repair, fixed-runtime regression, unsupported shot duration and logical-shot/render-clip mapping drift.

## 9. Definition of ready for implementation

Implementation may start only when the contract tests, fixtures, focus paths and browser evidence commands are written down in the corresponding section tasks, and the test runner can execute the Phase 0 no-write benchmark without production credentials or production database mutations.
