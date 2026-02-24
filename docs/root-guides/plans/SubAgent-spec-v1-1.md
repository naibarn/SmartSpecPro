# Orchestra Agent + Sub-Agents Specification
## พร้อมกลไกป้องกันข้อมูลหายจาก Context Compaction + การผสาน 3 Skill Packs (deep-project / deep-plan-codex / deep-implement)

> เวอร์ชัน: 1.1 (อัพเดต: เพิ่มรายละเอียดราย agent + ผสาน skill packs ที่ผู้ใช้อัพเหล)
> วัตถุประสงค์: ออกแบบ Orchestra agent ที่วาง/แบ่ง/ประสานงานผ่านผู้ช่วยเฉพาะทางอย่างมีวินัย และ **กันข้อการ compact** ด้วยระบบไฟล์ snapshot/progress/plan ที่ "เริ่มต่อ session ใหม่ได้จริง"

---

## 0) สรุปภาพรวม (Executive Summary)

ระบบนี้แบ่งเป็น 3 ชั้น:

1) **Orchestra agent (Coordinator/Decider + Scribe)**
   วางแผน, แบ่งงาน, ผลักดันผ่านผู้ช่วยเฉพาะทางด้วย contract, คุมคุณภาพ, และจัดการไฟล์กัน context หาย

2) **Specialist sub-agents** (ตามที่คุณระบุรายตัว)
   - Research agent
   - Planner/Architect agent
   - Implementer agent(s) (แยกตามโมดูล)
   - Test/QA agent
   - Reviewer agent
   - Security/Compliance agent (optional)
   - Docs/Release agent (optional)

3) **Skill Packs Integration (3 ตัวที่ผสมมา)**
   - `deep-project` = แบ่ง requirement ใหญ่ → split units + manifest
   - `deep-plan-codex` = วางแผนเชิงลึก + ทำ sectionized TDD plan + contract
   - `deep-implement` = ทำงาน implement ตาม sections แบบ TDD + review + commit + summary

> หลักใหญ่: "**File-first memory** + **Snapshot-before-compact**"
> ข้อมูลสำคัญไม่ขึ้นกริบกับบท แต่ขึ้นไฟล์ที่อัพเดตสม่ำเสมอ

---

## 1) เป้าหมาย (Goals)

1) ทำให้การพัฒนา/แก้โค้ดงานมีประสิทธิภาพด้วยโครงสร้าง **Orchestra → sub-agents เฉพาะทาง**
2) มีขั้นตอน **Research → Plan/Contracts → Implement (parallel) → Validate → Integrate → Release/Docs** ที่ตรวจสอบย้อนกลับได้
3) ลดความเสี่ยง "รายละเอียดหาย" จาก **context compaction** ด้วยไฟล์ snapshot/progress/backlog/decisions/contracts
4) ผู้ใช้สามารถเปิด session ใหม่แล้ว "สั่งทำต่อ" ได้โดยอ่านไฟล์ทุกหลัง (หรืออย่างน้อย snapshot)
5) รองรับการทำงานแบบ "Waves" เพื่อคุม parallelism และลด conflict

---

## 2) Non-goals (สิ่งที่ไม่จัดส)

- ไม่ล็อค framework ของ agent orchestration (เช่น LangGraph/Autogen/ฯลฯ) แต่กำหนด "สัญญาและอาร์ทิแฟกต์" ให้ใช้งานได้ทุกระบบ
- ไม่รับประกันการวัด token แม่นยำ 100% แต่ให้ **heuristics + protocol** ที่ robust

---

## 3) Agent Registry (ครอบคลุมทุกตัวที่คุณระบุ)

> ส่วนนี้คือคำอธิบาย "ครอบคลุม agent ทุกตัว"
> → ครอบคลุมกรณี + กำหนด Input/Output/Artifacts ชัดเจนข้างล่าง

### 3.1 Orchestra Agent (Coordinator / Decider / Integrator / Scribe)

**รับผิดชอบ**
- แปลงโจทย์ → `plan.md` (Single Source of Truth)
- แบ่กงานเป็น workstreams + dependency graph
- ตัดสินใจ parallelism (ทำคู่ขนานได้เมื่อไหร่/อะไรห้ามทำคู่)
- สร้าง Task Packet ให้ sub-agents
- รวมผลลัพธ์ + แก้ conflict + สั่งแก้
- คุม gate: tests/lint/review/docs
- ทำ **Context Health Check (CHC)** และ **Snapshot-before-compact** (หัวข้อ 6)

**Outputs (ต้องอัพเดตเสมอ)**
- `orchestra/plan.md`
- `orchestra/progress.md`
- `orchestra/backlog.md`
- `orchestra/decisions.md`
- `orchestra/contracts.md`
- `orchestra/snapshot.md`

---

### 3.2 Research Agent

**งานหลัก**
- สำรวจ codebase/เอกสาร/ข้อกำหนด/ข้อจำกัด/ความเสี่ยง
- สรุปทางเลือก + trade-offs + recommendation
- ทำ "Research Brief" ที่สั้นแต่ครบ

**Inputs**
- Task Packet จาก Orchestra
- ไฟล์ requirement/spec ที่เกี่ยวข้อง
- `contracts.md` (ถ้ามี)

**Outputs**
- `orchestra/research.md` (หรือ `<split>/planning/research-notes.md` ถ้าใช้ deep-plan-codex)

**รูปแบบ Research Brief (ขั้นต่ำ)**
- Findings (facts)
- Risks
- Options (A/B/C)
- Recommendation + rationale
- Open questions

---

### 3.3 Planner/Architect Agent

**งานหลัก**
- ออกแบบโครงทางเทค: โครงสร้างโมดูล, API, data flow, migration
- สร้าง "Implementation Plan" + contract ที่ทำให้ implement ทำงานได้

**Inputs**
- Research Brief
- Existing architecture / conventions
- constraints ของระบบ (compat/security/perf)

**Outputs**
- `orchestra/plan.md` (อัพเดต) + `orchestra/contracts.md` (freeze contract)
- ถ้าใช้ deep-plan-codex: `<planning_dir>/implementation-plan.md`, `<planning_dir>/sections/index.md`

---

### 3.4 Implementer Agent(s)

**งานหลัก**
- ลงมือเขียนโค้ดตาม plan/contract
- แยก implementer หลายตัวตามโมดูล (backend/frontend/db/shared) เพื่อลด conflict

**Inputs**
- `plan.md` + `contracts.md`
- Task Packet ระบุไฟล์/โมดูลชัด

**Outputs**
- Code changes + update `progress.md`
- ถ้าใช้ deep-implement: section-by-section commits + review artifacts + summary

---

### 3.5 Test/QA Agent

**งานหลัก**
- เขียน/ปรับ tests, เพิ่ม test cases, regression coverage
- สร้าง checklist สำหรับการทดสอบเชิงพฤติกรรม (manual/exploratory)

**Outputs**
- `orchestra/test_plan.md` (หรืออยู่ใน planning dir ตาม deep-plan-codex)
- เพิ่ม/ปรับ test files ใน repo
- บันทึกผลทดสอบใน `progress.md`

---

### 3.6 Reviewer Agent

**งานหลัก**
- ตรวจคุณภาพ: style, correctness, edge cases, complexity, maintainability
- ย้ำว่าเปลี่ยนแล้วไม่กัดส่วนอื่น (regression lens)
- ตรวจว่าทำตาม contract/DoD

**Outputs**
- Notes ใน `progress.md` หรือ `orchestra/reviews/*.md`
- ถ้าใช้ deep-implement: `{planning_dir}/reviews/section-NN-review.md`

---

### 3.7 Security/Compliance Agent (optional แต่จะทำเมื่อมีความเสี่ยง)

**งานหลัก**
- secrets, injection, authz/authn, PII, dependency risk
- ตรวจ migration path และ logging/telemetry ไม่รั่วข้อมูล

**Outputs**
- `orchestra/risk_register.md` (หรือบันทึกใน `progress.md` + `decisions.md`)

---

### 3.8 Docs/Release Agent (optional)

**งานหลัก**
- อัพเดต README, changelog, migration notes, usage examples
- release checklist + rollback note

**Outputs**
- `orchestra/release_notes.md`
- แก้เอกสารใน repo

---

## 4) Parallelism Rules (กฎตัดสินใจทำคู่ขนาน)

Orchestra ตัดสินใจตาม 3 ปัจจัย:

1) **File/Module overlap ต่ำ** (แยกคนละส่วน) → ทำงานได้
2) **มี Contract กัน** (API/type/schema) → ทำงานได้มากขึ้น
3) **Integration risk** (migration/refactor ใหญ่) → ลดคู่ขนาน, ทำเป็น waves

**ข้อบังคับ:** ถ้า contract ยังไม่ freeze → ให้ทำ Research/Plan ก่อน แล้วค่อยแบ่ง Implement ทำงาน

---

## 5) File-first Artifact System (ไฟล์ที่ต้องมี)

### 5.1 โครงสร้างไดเรกทอรี (แนะนำ)
```
workspace/
  requirements.md
  orchestra/
    spec.md
    plan.md
    progress.md
    backlog.md
    decisions.md
    contracts.md
    snapshot.md
    research.md           (optional)
    test_plan.md          (optional)
    risk_register.md      (optional)
    release_notes.md      (optional)
  splits/                 (ถ้าใช้ deep-project)
    01-xxx/
      spec.md             (deep-project output)
      planning/           (deep-plan-codex output)
        implementation-spec.md
        research-notes.md
        implementation-plan.md
        implementation-plan-tdd.md
        sections/
        reviews/
        implementation-summary.md
```

### 5.2 ไฟล์ "ต้องมี" ในระดับ orchestra
- `plan.md` → แผนงานปัจจุบัน (Single Source of Truth)
- `progress.md` → ความก้าวหน้า + สถานะ
- `backlog.md` → งานค้าง/ต้องทำต่อ (จัดลำดับ)
- `decisions.md` → Decision log (ADR-lite)
- `contracts.md` → interface/API/contract ที่ผลักดัน parallel
- `snapshot.md` → สรุปสำหรับเริ่มต่อ session ใหม่ (อัพเดตก่อนต้อง compact)

---

## 6) Compaction Safety Protocol (กฎระมัดระวังเรื่อง compact)

### 6.1 นิยาม
- **Compaction** = การสรุป/ตัดทอน context โดยระบบหรือโดยการสั่ง
- ความเสี่ยงหลัก: "DoD/contract/สถานะงาน/เหตุผลการตัดสินใจ" หาย → ทำต่อผิดทาง

### 6.2 Context Health Check (CHC) → ทำเมื่อไร
Orchestra ต้องทำ CHC:
- หลังจบแต่ละ wave/หัวข้อใหญ่
- ก่อนเริ่มงานเสี่ยงสูง (migration/refactor/security)
- เมื่อคุยยาวมาก/มีหลาย sub-agents ทำงานพร้อมกัน

### 6.3 สถานะจริงๆ (Green/Yellow/Red)
ให้ Orchestra บันทึกใน `progress.md` บรรทัดเดียว เช่น:
- `context_state: green|yellow|red`

**Heuristics**
- **Yellow (เตือน)**: เริ่มมีหลาย decision + หลาย dependency + มีเนื้อยาว/ส่งยาว ๆ เข้ามา
- **Red (ต้อง snapshot ก่อนทำต่อ)**: มีความเสี่ยงสูงว่าถ้า compact จะลืม contract/DoD/งานค้าง หรือกำลังจะเปลี่ยนหัวข้อใหญ่

### 6.4 กฎ Snapshot-before-compact (บังคับ)
เมื่อ `context_state = red` หรือกำลังจะเปลี่ยนหัวข้อใหญ่:
1) อัพเดต `snapshot.md` ให้ตรง template (6.5)
2) อัพเดต `progress.md` + `backlog.md` ให้ตรงกัน
3) แจ้งผู้ใช้เตือนว่าได้บันทึกแล้ว และบอกวิธี resume (อยู่ใน snapshot)
4) จากนั้นค่อยคุยต่อ/อนุญาตให้ compact

### 6.5 Snapshot Template (ต้องขอเริ่มต่อได้จริง)
`snapshot.md` ต้องมี:
- Snapshot Date
- Current Goal
- What's Done
- In Progress
- Open Questions / Decisions Pending
- Blocking Issues / Risks
- Contracts summary + link ไป `contracts.md`
- Next Steps (5–12 ข้อเรียงลำดับ)
- **Commands for New Session** (หัวข้อ 8 ใส่ไว้ให้ไฟล์ช่วย)
- Files Index (ไฟล์ที่ต้องแบ่งเพื่อ resume)

---

## 7) ผสาน 3 Skill Packs ที่ผสมมา (deep-project / deep-plan-codex / deep-implement)

ผมตรวจไฟล์ที่คุณใช้แล้ว ทั้ง 3 แพ็คหลัก:
- `deep-project` (requirements decomposition → split dirs + project-manifest)
- `deep-plan-codex` (research → interview → review → TDD plan → split sections)
- `deep-implement` (TDD implement per section → code review → commit → progress artifacts)

### 7.1 Mapping: Skill Packs → Roles
| Skill Pack | ครอบคลุมบทบาท | คุณใช้เป็น | อาร์ทิแฟกต์หลัก |
|---|---|---|---|
| deep-project | Research (ระดับ requirement) + Planner (แบ่งงาน) | แยก requirement ใหญ่เป็น unit ที่ทำงานได้ | `project-manifest.md`, `splits/*/spec.md` |
| deep-plan-codex | Research + Planner/Architect | ทำแผนเชิงลึก + sectionized TDD plan | `implementation-spec.md`, `implementation-plan.md`, `sections/index.md` |
| deep-implement | Implementer + Test/QA + Reviewer (ตาม workflow) | ทำงานเขียนโค้ด section, TDD, review+commit | `reviews/`, `implementation-summary.md` |

> ผลลัพธ์: Orchestra สามารถใช้ 3 skill packs ได้เป็น "subsystem" ที่ทำงานตามไฟล์เดียวกัน และสอดคล้องกับแนวคิด file-first

### 7.2 วิธีให้ Orchestra "รู้จัก" และเรียกใช้ skill packs
Orchestra ต้องมี "Capability Registry" (อยู่ใน `plan.md` หรือ `spec.md`) ระบุ:
- Trigger: งานแบบไหนควรใช้ skill pack ไหน
- Inputs: ต้องมีไฟล์อะไร
- Outputs: จะได้ไฟล์อะไร แล้วต้อง sync เข้าสู่ `orchestra/` อย่างไร

**Trigger แนะนำ**
- แบ่งย่อยใหญ่/ทำรวม → เริ่มด้วย **deep-project**
- ต้องการรายละเอียดพร้อม sections → ใช้ **deep-plan-codex**
- มี sections แล้วต้อง implement แบบ TDD + review/commit → ใช้ **deep-implement**

### 7.3 กฎ sync ไฟล์จาก planning subsystem กลับสู่ orchestra
เมื่อใช้ deep-*:
- Orchestra ต้องอัพเดต `orchestra/progress.md` ให้สะท้อนสถานะใน `<planning_dir>/implementation-summary.md`
- contract สำคัญต้องถูก copy/สรุปเข้า `orchestra/contracts.md`
- decision สำคัญต้องถูกบันทึกใน `orchestra/decisions.md`
- ก่อน compact: ต้องรวม "สิ่งที่ค้าง" จาก planning dir มาไว้ใน `orchestra/backlog.md`

### 7.4 รูปแบบ manifest ที่ควรรองรับ (เพื่อทำงานร่วมกับ deep-project/deep-plan-codex)
- `project-manifest.md` ต้องมีบล็อก `SPLIT_MANIFEST` ชัดสุด
- `sections/index.md` ต้องมีบล็อก `PROJECT_CONFIG` และ `SECTION_MANIFEST`

(รายละเอียดรูปแบบให้ยึดตามเอกสารแต่ละตัวที่คุณใช้)

---

## 8) วิธีเริ่มต่อใน Session ใหม่ (คำสั่งแบบแปะ)

### 8.1 ไฟล์ขั้นต่ำ
ขั้นต่ำสุดเพื่อทำต่อ "ได้สมบูรณ์":
- `orchestra/snapshot.md` (สำคัญที่สุด)
- แนะนำเพิ่ม: `orchestra/plan.md`, `orchestra/progress.md`, `orchestra/backlog.md`, `orchestra/contracts.md`, `orchestra/decisions.md`

ถ้าใช้ deep-* ให้แนบเพิ่ม:
- `project-manifest.md` + `splits/*/spec.md` (ถ้าอยู่ช่วงแบ่กงาน)
- `<planning_dir>/implementation-plan.md` + `sections/index.md` (ถ้าอยู่ช่วง implement)

### 8.2 Command Template (ให้ผู้ใช้บันทึกใช้ได้เลย)

**Template A (ดีที่สุด: ไฟล์ทุกหลัก)**
```text
เริ่มงานต่อจากโปรเจ็คนี้เดิม
- ไฟล์: orchestra/snapshot.md, orchestra/plan.md, orchestra/progress.md, orchestra/backlog.md, orchestra/contracts.md, orchestra/decisions.md
ขอให้:
1) อ่าน snapshot.md ใช้เป็น source of truth
2) สรุปสถานะปัจจุบัน 5–10 บรรทัด (Done / In progress / Blocked / Next)
3) ตรวจว่า plan/progress/backlog/contracts/decisions สอดคล้องกันหรือไม่ แล้วแก้ให้ตรง
4) เริ่มทำ Next Steps ข้อ 1 ต่อที
```

**Template B (ไฟล์เดียวแต่ได้ snapshot)**
```text
เริ่มงานต่อจากก snapshot นี้ (แปะ snapshot.md แล้ว)
ขอให้:
- สร้าง/อัพเดต plan.md + progress.md + backlog.md + contracts.md + decisions.md ให้สอดคล้องกับ snapshot
- แล้วเริ่มทำ Next Steps ข้อแรกต่อที
```

**Template C (สงสัยว่ามี compact เกิดขึ้นระหว่างทาง)**
```text
เหมือน session ก่อนหน้ามีการ compact
กรุณาใช้ snapshot ล่าสุดเป็นแหล่งความจริง
แล้วตรวจว่ามี contract/DoD/งานค้างอะไรที่หายไปหรือไม่ ถ้าหายให้ตามแก้เฉพาะจุดที่ทำได้
```

---

## 9) Review ความครบถ้วนก่อนจบงาน (Plan Completeness Review)

Orchestra ต้องเช็ค:
- [ ] `plan.md` มี Scope/DoD/Workstreams/Parallelism plan/Gates
- [ ] `progress.md` สถานะล่าสุดถูกต้อง (Done/In progress/Blocked/Next) + `context_state`
- [ ] `backlog.md` งานค้างถูกจัดลำดับ และ dependencies ชัด
- [ ] `contracts.md` ตรงสำหรับงานที่ทำอยู่
- [ ] `decisions.md` บันทึก decision ที่มีผลต่ออนิศทาง/สถาปัตย์
- [ ] `snapshot.md` สั่งแก้ได้เริ่มต่อ session ใหม่ได้จริง + มีคำสั่ง resume (หัวข้อ 8)

---

## 10) Definition of Done (DoD) ของระบบ Orchestra

ระบบพร้อมใช้งานเมื่อ:
- สร้างไฟล์ทุก `orchestra/` ครบ และอัพเดตตาม protocol ได้จริง
- มี CHC + snapshot-before-compact ที่ผู้ใช้ให้ข้อดี (เตือนทัน)
- เปิด session ใหม่แล้วทำต่อได้ด้วย Template A/B โดยไม่หลง requirement
- ผสาน deep-project/deep-plan-codex/deep-implement ได้: อินพุต/เอาท์พุตตรง, sync กลับเข้า orchestra ได้

---

## Appendix: ตัวอย่าง "ข้อความเตือนก่อนไฟล์ต้อง compact"
> "ตอนนี้จริงๆเริ่มยาวและเสี่ยงว่า compact แล้วรายละเอียดสำคัญ (DoD/contract/สถานะงาน) อาจหายไป
> ผมจะอัพเดต `snapshot.md` + `progress.md` + `backlog.md` ให้ล่าสุดก่อน แล้วค่อยคุยต่อ"

---
**สิ้นสุดสเปค**
