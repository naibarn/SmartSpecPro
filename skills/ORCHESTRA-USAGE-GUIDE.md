# Orchestra Usage Guide

คู่มือนี้อธิบายวิธีเรียกใช้ `orchestra` สำหรับงานพัฒนาระบบทั่วไป
โดยเน้นการใช้งานจริงผ่าน Codex/Claude-compatible hosts จาก skill pack เดียวกัน

## หลักการใช้งาน

ใช้ `orchestra` เมื่ออยากให้ agent จัดการงานแบบครบวงจร ตั้งแต่ทำความเข้าใจงาน
วางแผน แยกงาน เลือก sub-agent ลงมือแก้ ตรวจคุณภาพ และสรุปผล

รูปแบบทั่วไป:

```text
[$orchestra] [งานที่ต้องการ] โดย [ข้อจำกัด/สิ่งที่ห้ามเปลี่ยน] ตรวจ [สิ่งที่ต้อง verify] ให้ครบ
```

ตัวอย่างสั้น:

```text
[$orchestra] ปรับปรุง UI เดิมของหน้า /admin/monitoring ให้ premium, responsive และ accessible โดยคง behavior/API เดิมไว้ ตรวจ loading/empty/error states และรัน verification ให้ครบ
```

ถ้าอยู่ใน Claude Code ที่ใช้ slash command:

```text
/orchestra ปรับปรุง UI เดิมของหน้า /admin/monitoring ให้ premium, responsive และ accessible โดยคง behavior/API เดิมไว้
```

## เมื่อไรควรใช้ Orchestra

ใช้เมื่อมีสัญญาณเหล่านี้:

- งานแตะหลายไฟล์หรือหลาย subsystem
- ต้องวางแผนก่อนลงมือ
- ต้องการให้ทำจนจบ end-to-end
- ต้องการให้เลือก sub-agent ให้เอง
- งานเสี่ยง เช่น auth, permission, tenant isolation, security, migration
- งาน UI/UX ที่ต้องตรวจ responsive, accessibility, states, dark mode
- งาน bug ที่ root cause ยังไม่ชัด
- งานที่ต้องตรวจ test/audit/verification ก่อนสรุปว่าเสร็จ

ไม่จำเป็นต้องใช้เมื่อ:

- ถามข้อมูลสั้น ๆ
- ขอรันคำสั่งเดียว เช่น `git status`
- แก้ typo จุดเดียวที่รู้ไฟล์แน่นอน
- ขอ rewrite ข้อความหรือแปลภาษาอย่างเดียว

## สูตร Prompt ที่แนะนำ

### สูตรพื้นฐาน

```text
[$orchestra] ทำ [เป้าหมาย] ใน [พื้นที่/ไฟล์/route] โดยคง [สิ่งที่ห้ามเปลี่ยน] และตรวจ [verification] ให้ครบ
```

### สูตรสำหรับงาน UI เดิม

```text
[$orchestra] ปรับปรุง UI เดิมของ [หน้า/route/ไฟล์] ให้ [style/quality] โดยคง behavior/API/business logic เดิมไว้ ตรวจ responsive, accessibility, dark mode, loading/empty/error/disabled states และรัน verification ที่เกี่ยวข้อง
```

### สูตรสำหรับ feature ใหม่

```text
[$orchestra] วางแผนและ implement feature [ชื่อ feature] ให้ครบทั้ง backend/frontend/tests โดยเริ่มจากวิเคราะห์ scope, สร้าง plan, แยกงานเป็น waves, แล้วทำจนผ่าน quality gates
```

### สูตรสำหรับ bug

```text
[$orchestra] วิเคราะห์และแก้ bug: [อาการ/error/log] หา root cause ก่อน แล้วแก้เฉพาะ scope ที่จำเป็น พร้อมเพิ่ม test หรือ verification กัน regression
```

### สูตรสำหรับ security

```text
[$orchestra] ตรวจและแก้ security risk ใน [พื้นที่] โดยเน้น auth, permission, tenant isolation, input validation, secrets และรัน security gate ก่อนสรุป
```

## การใช้ Deep Workflow ผ่าน Orchestra

โดยปกติไม่จำเป็นต้องเรียก `deep-project`, `deep-plan`, `deep-plan-quick`,
หรือ `deep-implement` แยกเอง ให้เรียกผ่าน `orchestra` แล้วบอกระดับความชัดของงาน
และเป้าหมายที่ต้องการแทน

ลำดับภาพรวม:

```text
งานใหญ่มาก/ยังคลุมเครือ
→ deep-project
→ deep-plan ต่อ split/spec ที่ได้
→ deep-implement
→ quality gates/security gates
→ final verification

งาน feature เดี่ยวที่ชัดพอสมควร
→ deep-plan
→ deep-implement
→ quality gates/security gates
→ final verification

งานเล็ก-กลางที่ยังควรวางแผน
→ deep-plan-quick
→ deep-implement หรือ direct implementation waves
→ quality gates
→ final verification

งานเล็กมากและชัดเจน
→ direct edit/single agent
→ targeted verification
```

### deep-project ใช้เมื่อไร

ใช้เมื่อ requirement กว้าง คลุมเครือ หรือเป็นระบบใหม่ที่ควรแตกเป็นหลาย planning units
ก่อน เช่น module ใหม่ทั้งระบบ, product area ใหม่, platform ใหม่, หรือหลาย feature
ที่มี dependency กัน

สัญญาณที่ควรใช้:

- ยังไม่มี spec ชัดเจน
- งานมีหลาย component ใหญ่ เช่น auth, billing, editor, admin, analytics
- ต้องแยก dependency ก่อนว่าอะไรควรทำก่อนหลัง
- ถ้าทำทีเดียวจะเสี่ยง scope บาน
- ต้องการ requirements, split specs, และ implementation order

Prompt แนะนำ:

```text
[$orchestra] ใช้ deep-project เพื่อแตกงานระบบ Skills Marketplace ออกเป็น planning units ก่อน ยังไม่ต้อง implement จนกว่าจะได้ split specs, dependency order, risks และ acceptance criteria ชัดเจน
```

Prompt ให้ทำต่ออัตโนมัติ:

```text
[$orchestra] โปรเจกต์นี้ยังเป็น requirement กว้าง ให้เริ่มจาก deep-project แตกเป็น splits แล้วต่อด้วย deep-plan และ deep-implement เฉพาะ split แรกที่ dependency ต่ำที่สุดจนผ่าน verification
```

ลำดับที่ orchestra ควรทำ:

1. สร้างหรือปรับ `specs/project/.../requirements.md`
2. วิเคราะห์ requirement และถามเฉพาะ product ambiguity ที่บล็อกจริง
3. แตก project เป็น split specs
4. จัด dependency order
5. เลือก split แรกหรือ split ที่ user ระบุ
6. ส่ง split นั้นเข้า `deep-plan`
7. ส่ง section files เข้า `deep-implement`
8. รัน quality/security gates

ผลลัพธ์ที่ควรได้:

- requirements file
- manifest/split list
- spec ของแต่ละ split
- dependency order
- backlog หรือ next splits ที่ยังไม่ทำ

### deep-plan ใช้เมื่อไร

ใช้เมื่อเป็น feature เดี่ยวหรือ split เดี่ยวที่มี scope ชัดพอ และต้องการแผนละเอียดก่อนลงมือ
เหมาะกับงานที่มีหลายไฟล์ หลาย domain หรือมี security/test/architecture risk

สัญญาณที่ควรใช้:

- feature เดี่ยวแต่แตะ backend/frontend/tests
- มี spec หรือ brief อยู่แล้ว
- ต้องการ research, architecture, TDD plan, section files
- งานมี contract ระหว่าง agents
- ต้องให้ implementation แบ่งเป็น section เล็ก ๆ ได้

Prompt แนะนำ:

```text
[$orchestra] ใช้ deep-plan สำหรับ feature Saved Views จาก specs/feature/012-saved-views/spec.md สร้าง implementation plan, TDD plan และ section files ก่อน จากนั้นค่อย deep-implement
```

Prompt แบบไม่มีไฟล์ spec แต่รู้ scope:

```text
[$orchestra] สร้าง spec สำหรับ feature Saved Views แล้วใช้ deep-plan วางแผนละเอียดก่อน implement ครอบคลุม DB, tRPC, frontend, tests, tenant isolation และ security review
```

ลำดับที่ orchestra ควรทำ:

1. ตรวจว่ามี spec/brief หรือยัง
2. ถ้าไม่มี ให้สร้าง spec เบื้องต้นจากคำขอ
3. Research codebase และ pattern เดิม
4. สัมภาษณ์/ถามเฉพาะ ambiguity ที่กระทบ product outcome
5. สร้าง implementation plan
6. สร้าง TDD plan
7. แตก section files
8. Verify plan artifacts ว่าครบ
9. ส่งต่อเข้า `deep-implement`

ผลลัพธ์ที่ควรได้:

- `implementation-plan.md` หรือ `claude-plan.md`
- `implementation-plan-tdd.md` หรือ `claude-plan-tdd.md`
- `sections/index.md`
- `sections/section-*.md`
- risks, contracts, gates ที่ต้องใช้ตอน implement

### deep-plan-quick ใช้เมื่อไร

ใช้เมื่อเป็นงานเล็ก-กลางที่ยังควรวางแผน แต่ไม่หนักพอสำหรับ full `deep-plan`
เช่น 2-5 ไฟล์, feature ย่อย, UI flow ย่อย, routing behavior, skill update เฉพาะจุด

สัญญาณที่ควรใช้:

- request สั้น แต่มี hidden complexity
- ต้อง scan codebase ก่อนแก้
- ต้องมี mini research + decision log
- ควรมี section files ให้ `deep-implement` ทำต่อ
- ยังไม่ต้องใช้ full interview/research หนัก

Prompt แนะนำ:

```text
[$orchestra] ใช้ deep-plan-quick สำหรับเพิ่ม loading/empty/error states ในหน้า MyRequests วางแผนสั้น ๆ ก่อน แล้ว implement ให้ครบพร้อม verification
```

Prompt สำหรับงาน skill:

```text
[$orchestra] ใช้ deep-plan-quick เพื่อเพิ่ม behavior scenario ใหม่ให้ orchestra routing แล้ว implement พร้อม audit validation
```

ลำดับที่ orchestra ควรทำ:

1. สร้าง `specs/quick/NNN-slug/request.md`
2. ทำ lightweight research
3. บันทึก decision-log
4. สร้าง implementation plan
5. สร้าง TDD plan
6. แตก section files 1-5 ส่วนตามความเหมาะสม
7. ส่งต่อเข้า `deep-implement` หรือ implement เป็น waves ถ้าง่ายกว่า
8. รัน verification

ผลลัพธ์ที่ควรได้:

- `request.md`
- `research-notes.md`
- `decision-log.md`
- `implementation-plan.md`
- `implementation-plan-tdd.md`
- `sections/index.md`
- `sections/section-*.md`

### deep-implement ใช้เมื่อไร

ใช้เมื่อมี section files หรือ implementation plan พร้อมแล้ว และต้องการให้ลงมือทำตามแผน
แบบ test-backed/TDD พร้อม review และ verification

สัญญาณที่ควรใช้:

- มี `sections/index.md`
- มี `section-*.md`
- มี TDD plan หรือ acceptance criteria
- ต้อง implement เป็นส่วน ๆ
- ต้องการ atomic progress และ quality gates

Prompt แนะนำ:

```text
[$orchestra] ใช้ deep-implement ทำตาม sections ใน specs/quick/004-saved-views/sections/ ให้ครบทุก section พร้อม TDD, review, quality gates และ final verification
```

Prompt ทำเฉพาะบาง section:

```text
[$orchestra] ใช้ deep-implement เฉพาะ section-02 และ section-03 ของแผน Saved Views ก่อน ห้ามแตะ section อื่น แล้วรัน tests ที่เกี่ยวข้อง
```

ลำดับที่ orchestra ควรทำ:

1. อ่าน `sections/index.md`
2. เลือก section ที่พร้อมทำตาม dependency
3. อ่าน section detail และ TDD plan
4. เขียน/ปรับ tests ก่อนเมื่อเป็น behavior logic
5. implement เฉพาะไฟล์ใน scope
6. run targeted verification
7. review code
8. mark section complete หรือบันทึก blocker
9. ทำ section ถัดไปจนเสร็จ
10. run final gates

### วิธีบอกให้ Orchestra เลือก Deep Workflow เอง

ถ้าไม่แน่ใจว่าควรใช้ตัวไหน ให้เขียนแบบนี้:

```text
[$orchestra] วิเคราะห์ก่อนว่างานนี้ควรใช้ deep-project, deep-plan, deep-plan-quick หรือ direct implementation แล้วเลือก route ที่เหมาะสมเอง จากนั้นทำต่อให้ครบพร้อม verification
```

ถ้าอยากให้เร็วแต่ยังมีแผน:

```text
[$orchestra] ถ้างานนี้ไม่ใหญ่พอสำหรับ deep-plan ให้ใช้ deep-plan-quick แทน แล้ว implement ต่อจนผ่าน quality gates
```

ถ้าอยากกันไม่ให้แผนหนักเกิน:

```text
[$orchestra] ใช้ deep-plan-quick เท่านั้น ถ้าพบว่างานใหญ่เกินให้หยุดและรายงานเหตุผลก่อน promote เป็น deep-plan
```

ถ้าอยากให้ทำต่ออัตโนมัติ:

```text
[$orchestra] ถ้าต้องสร้าง plan ให้สร้างเอง แล้วต่อ deep-implement อัตโนมัติ ไม่ต้องรอให้ฉันเรียก deep-* แยก ยกเว้นมี product ambiguity หรือ destructive risk
```

## การตรวจสอบปัญหา Error และ Debug

งาน error/debug ควรเริ่มจากการหาประเภทปัญหาก่อน แล้วค่อยเลือก agent หรือ gate ที่เหมาะสม
อย่าเริ่มแก้จากอาการปลายทางทันทีถ้ายังไม่รู้ root cause

ลำดับทั่วไป:

```text
รับอาการ/error/log
→ classify domain
→ เก็บหลักฐานจริง
→ หา root cause
→ วาง fix scope
→ implement แบบ minimal
→ เพิ่ม regression test หรือ verification
→ run quality/security gates
→ สรุป root cause + files changed + tests
```

### ข้อมูลที่ควรใส่ใน prompt debug

ใส่ให้มากที่สุดเท่าที่มี:

- error message เต็ม
- stack trace
- route/page/API ที่เกิด
- user role/tenant ที่เกิด
- steps to reproduce
- expected behavior
- actual behavior
- log path หรือ traceId
- commit/branch ที่เริ่มพัง
- test command ที่ fail
- screenshot/trace ถ้าเป็น UI/E2E

Prompt template:

```text
[$orchestra] Debug ปัญหา [อาการ] โดยใช้ข้อมูลนี้: [error/log/steps] หา root cause ก่อน ห้ามเดา แล้วแก้แบบ minimal พร้อม test/verification กัน regression
```

### 1. TypeScript / Frontend Error

ใช้เมื่อ:

- `pnpm check` fail
- React component render พัง
- import/type mismatch
- TanStack Query/tRPC client type ไม่ตรง
- UI state undefined/null

Prompt:

```text
[$orchestra] Debug TypeScript error จาก cd apps/web && pnpm check: [paste error] หาไฟล์ต้นเหตุ แก้ type/contract ให้ถูก และรัน pnpm check ซ้ำ
```

ลำดับ:

1. อ่าน error เต็ม
2. map file:line กับ type/contract ที่เกี่ยวข้อง
3. ตรวจว่าปัญหามาจาก frontend, shared type, หรือ backend router output
4. ถ้าเป็น UI-only ให้ frontend/ui-builder แก้
5. ถ้า contract ผิด ให้ backend/frontend coordinate ผ่าน orchestra
6. run `cd apps/web && pnpm check`

### 2. Runtime UI Error

ใช้เมื่อ:

- หน้า blank
- component crash
- state undefined
- modal/form กดแล้วพัง
- data loading แล้ว render ไม่ได้

Prompt:

```text
[$orchestra] Debug runtime UI error หน้า WorkRequest: [อาการ/console error] ตรวจ state, props, tRPC data shape, loading/error states แล้วแก้พร้อม test หรือ verification
```

ลำดับ:

1. reproduce route/state
2. ตรวจ console error และ component stack
3. ตรวจ data shape จาก query/mutation
4. เพิ่ม guard/loading/error state ที่เหมาะสม
5. ตรวจ responsive/accessibility ถ้าแก้ UI flow
6. run typecheck/test

### 3. tRPC / Backend Error

ใช้เมื่อ:

- procedure fail
- Zod validation error
- tenant data leak risk
- DB query error
- 500 จาก router/service

Prompt:

```text
[$orchestra] Debug tRPC error ใน workOs router: [error/stack] ตรวจ input validation, ctx.user/tenantId, service call, DB query และเพิ่ม regression test
```

ลำดับ:

1. อ่าน stack trace และ procedure name
2. ตรวจ Zod input schema
3. ตรวจ auth/protected/admin procedure
4. ตรวจ tenantId isolation
5. ตรวจ service/query layer
6. เพิ่ม unit test ที่ reproduce
7. run targeted tests + typecheck
8. ถ้าแตะ auth/tenant/security ให้ security gate

### 4. Database / Migration Error

ใช้เมื่อ:

- migration fail
- schema mismatch
- Drizzle query พัง
- column/table ไม่ตรง
- data backfill เสี่ยง

Prompt:

```text
[$orchestra] Debug migration/schema error: [error] ตรวจ schema, migration, generated SQL, data compatibility และใช้ backup-first ถ้ามี data risk
```

ลำดับ:

1. ห้ามแก้ destructive migration ทันที
2. ตรวจ schema กับ migration history
3. ตรวจ nullable/default/backfill impact
4. ถ้ามี data risk ให้ backup-first
5. แก้ migration/schema ให้ minimal
6. run migration validation/tests
7. run backend tests ที่ใช้ table นั้น

### 5. Python / FastAPI / Celery Error

ใช้เมื่อ:

- Python traceback
- Celery task fail
- FastAPI endpoint error
- worker import/config issue

Prompt:

```text
[$orchestra] Debug Python/Celery error: [traceback] ตรวจ task registration, imports, config/env, retry behavior และเพิ่ม pytest/ruff verification
```

ลำดับ:

1. อ่าน traceback เต็ม
2. ระบุ module/function ที่ fail
3. ตรวจ imports/config/env
4. ตรวจ retry/idempotency ถ้าเป็น Celery
5. เพิ่ม pytest หรือ unit test
6. run `ruff check app/` และ pytest ที่เกี่ยวข้อง

### 6. E2E / Playwright Error

ใช้เมื่อ:

- browser flow fail
- auth state fail
- selector หาย
- responsive route พัง
- screenshot/trace มีหลักฐาน

Prompt:

```text
[$orchestra] Debug Playwright failure ใน flow create request: [test output] ใช้ screenshot/trace วิเคราะห์ root cause แล้วแก้ UI/test เฉพาะจุด พร้อมรัน E2E หรือ targeted verification
```

ลำดับ:

1. อ่าน test output
2. เปิด screenshot/trace ถ้ามี
3. แยกว่า app bug หรือ test selector flaky
4. ถ้า app bug ให้แก้ UI/flow
5. ถ้า test brittle ให้ปรับ selector ให้ user-facing มากขึ้น
6. run targeted Playwright test
7. ถ้าแก้ UI ให้ใช้ responsive/accessibility gates ตามเหมาะสม

### 7. CI / GitHub Actions Error

ใช้เมื่อ:

- workflow fail
- dependency install fail
- lint/test fail ใน CI แต่ local ผ่าน
- deploy/release step fail

Prompt:

```text
[$orchestra] Debug CI failure ล่าสุด ตรวจ workflow/job logs, dependency cache, env, scripts และแก้ root cause พร้อม workflow validation
```

ลำดับ:

1. ระบุ workflow/job/step ที่ fail
2. อ่าน log เฉพาะ step ที่ fail
3. แยก failure เป็น test/lint/dependency/env/config
4. ตรวจความต่าง local vs CI
5. แก้ minimal
6. run local equivalent
7. ถ้า workflow file เปลี่ยน ให้ CI/release gate

### 8. Performance / Timeout / Slow Query

ใช้เมื่อ:

- endpoint ช้า
- N+1 query
- timeout
- memory/cpu spike
- bundle load ช้า

Prompt:

```text
[$orchestra] วิเคราะห์ performance regression ของ workRequests.list ทำ baseline ก่อน หา bottleneck เช่น N+1/query/cache แล้วแก้พร้อม verification หลังแก้
```

ลำดับ:

1. เก็บ baseline ก่อนแก้
2. ระบุ endpoint/query/component ที่ช้า
3. ตรวจ DB query, loops, network calls, bundle chunks
4. แก้ bottleneck ที่มี evidence
5. วัดซ้ำ
6. สรุป before/after

### 9. Security Error / Vulnerability

ใช้เมื่อ:

- auth bypass
- permission ผิด
- tenant isolation เสี่ยง
- XSS/CSRF/CORS/CSP
- secrets leak
- file upload/deserialization

Prompt:

```text
[$orchestra] ตรวจและ debug security issue: [รายละเอียด] ให้ security specialists ตรวจ root cause, impact, exploit path, remediation และรัน pre-merge security gate
```

ลำดับ:

1. classify severity
2. ถ้า critical ให้หยุดก่อนสรุป pass
3. ตรวจ affected domain: tRPC/FastAPI/frontend
4. ใช้ security specialists
5. แก้ root cause ไม่ใช่แค่ symptom
6. เพิ่ม test/security assertion
7. run security gate

### 10. Skill / Orchestra Routing Error

ใช้เมื่อ:

- orchestra route ผิด agent
- skill ไม่ถูกเรียก
- installed skill drift
- behavior scenario ไม่ครอบคลุม
- sub-agent registry mismatch

Prompt:

```text
[$orchestra] Debug skill routing issue: เมื่อ user ขอ [ข้อความ] ควรเข้า [expected route] แต่ไม่เข้า ตรวจ intent matrix, routing-decision, behavior scenarios, sub-agent registry และ audit validation
```

ลำดับ:

1. เพิ่มหรืออ่าน behavior scenario ที่ reproduce ปัญหา
2. ตรวจ `intent-matrix.md`
3. ตรวจ `routing-decision.md`
4. ตรวจ `sub-agent-dispatch.md`
5. ตรวจ registry ใน `skills/sub-agents/README.md`
6. ปรับ docs/rules ให้ route ถูก
7. run `bash skills/audit-skills.sh`
8. publish/verify installed skills ถ้าเปลี่ยน skill runtime

### 11. Installed Skill Drift

ใช้เมื่อ repo skill กับ installed runtime ไม่ตรงกัน

Prompt:

```text
[$orchestra] ตรวจ installed skill drift ระหว่าง skills/ กับ /home/dev/.codex/skills ถ้ามี drift ให้ publish repo skills ไป installed runtime แล้ว verify sync
```

ลำดับ:

1. run `bash skills/verify-installed-skills-sync.sh`
2. ถ้า drift จาก repo เป็น source of truth ให้ run `bash skills/publish-to-installed-skills.sh`
3. verify อีกครั้ง
4. run audit ถ้าเปลี่ยนโครงสร้าง

## การเลือก Route สำหรับ Error แบบเร็ว

| อาการ | Route/Agent ที่ควรเริ่ม |
|---|---|
| ไม่รู้ไฟล์ต้นเหตุ | `research` → `debugger` |
| มี stack trace ชัด | `debugger` |
| audit log/traceId | `error-detective` |
| TypeScript/check fail | `frontend`, `backend`, หรือ owner ตาม file path |
| UI runtime crash | `frontend` + visual UI reviewers ถ้าแก้ UI state |
| Playwright fail | `e2e-playwright` |
| tRPC 500/validation | `backend` + security gate ถ้า auth/tenant เกี่ยวข้อง |
| Python traceback | `python` หรือ `debugger` |
| Migration/schema | `database` |
| CI fail | `ci-release` |
| Dependency/vulnerability | `dependency-supply-chain` |
| Slow endpoint/query | `performance` |
| Auth/permission/security | security specialists + `security-review` |
| Skill route ผิด | skill behavior tests + orchestra references |

## Use Cases

### 1. ปรับปรุง UI เดิมให้ดูดีขึ้น

```text
[$orchestra] ปรับปรุง UI เดิมของ apps/web/client/src/pages/MyRequests.tsx ให้ดู modern, clean และ production-ready โดยคง business logic เดิมไว้ ตรวจ loading/empty/error states, responsive, accessibility และ dark mode
```

Orchestra จะ route เข้า `visual-ui-flow`:

```text
visual-ui-requirement-analyzer
→ visual-ui-direction
→ ui-builder หรือ frontend
→ visual-ux-reviewer
→ accessibility-reviewer
→ responsive-reviewer
→ visual-final-refactor ถ้าต้องแก้ต่อ
→ visual UI quality gates
```

### 2. ปรับหน้า dashboard ให้ premium

```text
[$orchestra] ปรับ dashboard หน้า /admin/monitoring ให้ premium, enterprise calm และอ่านง่ายขึ้น โดยไม่เปลี่ยน API เดิม ตรวจ mobile/tablet/desktop และ component states ให้ครบ
```

### 3. แก้ UX บนมือถือ

```text
[$orchestra] แก้ mobile UX ของหน้า WorkRequest ให้ใช้งานง่ายขึ้น ไม่มี horizontal overflow ปุ่มแตะง่าย และ form ไม่ล้นจอ โดยคง logic เดิมไว้
```

### 4. ตรวจ accessibility อย่างเดียว

```text
[$orchestra] ตรวจ accessibility ของหน้า MyRequests แบบ read-only ก่อน ยังไม่ต้องแก้ code ตรวจ keyboard, focus states, labels, icon-only buttons, contrast และ ARIA usage
```

### 5. ตรวจ UI ก่อนแก้จริง

```text
[$orchestra] Review UI ของหน้า /admin/monitoring ก่อน ยังไม่ต้องแก้ code สรุปปัญหา hierarchy, UX friction, responsive, accessibility และเสนอแผนแก้
```

### 6. ปรับ Tailwind/shadcn ให้เป็นระบบ

```text
[$orchestra] Refactor Tailwind/shadcn UI ในหน้า Settings ให้ใช้ semantic tokens, existing components, consistent spacing และ dark-mode friendly โดยไม่เพิ่ม dependency ใหม่
```

### 7. เพิ่ม loading/empty/error states

```text
[$orchestra] เพิ่ม loading, empty, error, disabled และ success states ให้หน้า MyRequests โดยใช้ component pattern เดิม และรัน typecheck/test ที่เกี่ยวข้อง
```

### 8. สร้าง feature ใหม่แบบครบวงจร

```text
[$orchestra] สร้าง feature Team Invitation ให้ครบ end-to-end ทั้ง DB schema, tRPC router, frontend UI, validation, tests และ security gate
```

### 9. วางแผน feature ก่อนทำ

```text
[$orchestra] วางแผน feature Template Marketplace ก่อน ยังไม่ต้องแก้ code แตก scope, risk, wave plan, affected files และ acceptance criteria
```

### 10. ทำ feature จาก requirement สั้น ๆ

```text
[$orchestra] ยังไม่มี spec แต่ต้องการเพิ่มระบบ saved filters ให้ dashboard ช่วยวางแผนแบบ quick-plan แล้ว implement ต่อให้ครบ
```

### 11. แก้ bug จาก error message

```text
[$orchestra] แก้ error นี้ให้ครบ: TypeError: Cannot read properties of undefined reading tenantId ใน apps/web/server/routers/workOs.ts หา root cause ก่อน แล้วเพิ่ม test กัน regression
```

### 12. แก้ bug ที่ไม่รู้ไฟล์

```text
[$orchestra] ผู้ใช้กด submit ในหน้า WorkRequest แล้วบางครั้ง request หายไปโดยไม่มี error ช่วยสืบ root cause จาก flow ทั้ง frontend/backend แล้วแก้ให้ครบ
```

### 13. Debug log/audit trail

```text
[$orchestra] วิเคราะห์ audit log traceId=abc123 จาก apps/web/logs/audit/audit-2026-04-26.jsonl หา timeline และ root cause ก่อน ยังไม่ต้องแก้ code
```

### 14. แก้ Playwright/E2E failure

```text
[$orchestra] แก้ E2E test ที่ fail ใน workflow create request ตรวจ route, viewport, auth state, screenshot/trace แล้วแก้เฉพาะสาเหตุจริง
```

### 15. เพิ่ม tRPC procedure ใหม่

```text
[$orchestra] เพิ่ม tRPC procedure workRequests.search พร้อม Zod input validation, tenant isolation, tests และ frontend usage ตัวอย่าง โดยไม่แตะ auth middleware
```

### 16. เพิ่ม backend service

```text
[$orchestra] เพิ่ม service สำหรับคำนวณ request SLA ใน apps/web/server/services พร้อม unit tests และเชื่อมกับ router ที่เหมาะสม
```

### 17. เพิ่ม FastAPI/Celery task

```text
[$orchestra] เพิ่ม Python Celery task สำหรับตรวจ health ของ media jobs โดยไม่เชื่อม external LLM API เพิ่ม tests และ verification ที่เกี่ยวข้อง
```

### 18. เพิ่ม DB migration

```text
[$orchestra] เพิ่ม schema/migration สำหรับ table saved_views โดยต้อง backup-first, ตรวจ tenantId, เขียน service/router/test และรัน migration validation
```

### 19. ตรวจ tenant isolation

```text
[$orchestra] ตรวจ tenant isolation ของ routers workOs และ mediaJobs แบบ security review แล้วสรุป findings ก่อน ยังไม่ต้องแก้ code
```

### 20. แก้ auth/permission

```text
[$orchestra] แก้ permission ของ admin monitoring route ให้เฉพาะ admin เข้าถึงได้ ตรวจ auth, RBAC, frontend guard, tests และ security gate
```

### 21. ตรวจ secrets/API keys

```text
[$orchestra] ตรวจว่าไม่มี secrets หรือ API keys หลุดใน config, logs, tests และ docs ของ skill/runtime system พร้อม remediation plan
```

### 22. ตรวจ dependency/supply chain

```text
[$orchestra] ตรวจ dependency และ lockfile drift หลังอัปเดต package โดยดู vulnerability, license risk, package integrity และ GitHub Actions versions
```

### 23. แก้ CI failing

```text
[$orchestra] แก้ CI failure ล่าสุดของ branch main ตรวจ workflow logs, หาสาเหตุจริง, แก้แบบ minimal และรัน validation ที่เกี่ยวข้อง
```

### 24. ปรับ performance

```text
[$orchestra] วิเคราะห์ performance ของ endpoint workRequests.list หา N+1 หรือ query ช้า ทำ baseline ก่อน แล้วแก้พร้อม verification
```

### 25. ลด bundle/UI load time

```text
[$orchestra] ตรวจและปรับ frontend bundle/load time ของ dashboard โดยไม่เปลี่ยน behavior เดิม รายงาน baseline และผลหลังแก้
```

### 26. ทำ release readiness

```text
[$orchestra] ตรวจ release readiness ของ feature นี้: tests, docs, migration notes, rollback plan, CI, security และ remaining risks
```

### 27. เขียน docs หลัง implement

```text
[$orchestra] สร้าง docs/changelog/migration guide สำหรับ feature Server Monitoring จาก code ที่มีอยู่ โดยไม่แก้ production code
```

### 28. ปรับ skill system

```text
[$orchestra] เพิ่ม behavior scenario ใหม่ให้ skill routing เมื่องาน UI ระบุ dark mode และ responsive ต้องเข้า visual-ui-flow พร้อมอัปเดต audit tests
```

### 29. เพิ่ม sub-agent ใหม่

```text
[$orchestra] เพิ่ม sub-agent ใหม่สำหรับ API contract reviewer ให้ครบทั้ง skills/sub-agents/agents, .claude/agents, registry, dispatch mapping และ audit validation
```

### 30. ตรวจ skill pack ก่อนส่งต่อเครื่องอื่น

```text
[$orchestra] ตรวจความพร้อมของ skills ทั้งชุดก่อนนำไปติดตั้งเครื่องอื่น ตรวจ mirrored skills, installed sync, runtime artifacts, .venv dependency และ audit tests
```

### 31. Publish installed skills

```text
[$orchestra] publish skills repo ไป installed runtime และ verify sync ให้ครบ โดยไม่ commit ไฟล์ app/web ที่ไม่เกี่ยวข้อง
```

### 32. Commit และ push เฉพาะงานที่เกี่ยวข้อง

```text
[$orchestra] commit และ push งาน skill-system นี้ไป main โดย stage เฉพาะ skills, .claude/agents, orchestra ห้าม stage dirty files อื่น
```

### 33. Review code อย่างเดียว

```text
[$orchestra] Review changes ใน skills/orchestra แบบ read-only ก่อน ยังไม่ต้องแก้ code เน้น routing gaps, missing tests, security และ maintainability
```

### 34. ทำงานต่อจาก session เดิม

```text
[$orchestra] resume งาน skill-system vNext จาก orchestra state แล้วทำ wave ที่เหลือต่อให้ครบ
```

### 35. เริ่ม session ใหม่ไม่เอาของเก่า

```text
[$orchestra] เริ่ม session ใหม่สำหรับงาน visual UI audit ไม่ต้อง resume งานเก่า archive orchestra state เดิมก่อน
```

## Prompt Keywords ที่ช่วยให้ Route ถูก

### UI/UX

ใช้คำเหล่านี้เมื่อต้องการให้เข้า visual UI workflow:

- `premium`
- `modern`
- `professional`
- `production-ready`
- `responsive`
- `accessible` หรือ `accessibility`
- `dark mode`
- `Tailwind`
- `shadcn`
- `visual polish`
- `UX`
- `loading/empty/error states`
- `mobile/tablet/desktop`

### Security

ใช้คำเหล่านี้เมื่อต้องการ security gate:

- `auth`
- `permission`
- `role`
- `RBAC`
- `tenant isolation`
- `JWT`
- `session`
- `input validation`
- `secrets`
- `CORS`
- `CSP`
- `file upload`
- `deserialization`

### Testing/Quality

ใช้คำเหล่านี้เมื่อต้องการ verification หนักขึ้น:

- `เพิ่ม test`
- `กัน regression`
- `typecheck`
- `lint`
- `unit test`
- `integration test`
- `Playwright`
- `screenshot`
- `quality gates`
- `verify ก่อนสรุป`

## Orchestra จะเลือก Agent อย่างไร

| งาน | Agents ที่มักใช้ |
|---|---|
| Product/UX unclear | `product-ux` |
| Research codebase | `research` |
| Architecture | `architect` |
| Frontend feature | `frontend` |
| Visual UI polish | `visual-ui-requirement-analyzer`, `visual-ui-direction`, `ui-builder` |
| UI review | `visual-ux-reviewer`, `accessibility-reviewer`, `responsive-reviewer` |
| Backend/tRPC | `backend` |
| Python/FastAPI/Celery | `python` |
| DB/migration | `database` |
| Tests | `test-qa` |
| Browser workflow | `e2e-playwright` |
| Security | `security`, `security-trpc`, `security-fastapi`, `security-frontend`, `security-review` |
| Debugging | `debugger`, `error-detective` |
| Infrastructure | `infrastructure` |
| Performance | `performance` |
| CI/release | `ci-release` |
| Dependencies | `dependency-supply-chain` |
| Docs/release notes | `docs-release` |

## Verification ที่ควรขอใน Prompt

สำหรับงาน skills:

```text
รัน bash skills/audit-skills.sh, publish installed skills และ verify sync ให้ครบ
```

สำหรับงาน frontend:

```text
รัน cd apps/web && pnpm check และ test ที่เกี่ยวข้อง ถ้าเป็น route-level UI ให้ใช้ Playwright/screenshot gate เท่าที่เหมาะสม
```

สำหรับงาน backend:

```text
รัน cd apps/web && pnpm check และ unit tests ของ router/service ที่เกี่ยวข้อง
```

สำหรับงาน Python:

```text
รัน cd python-backend && ruff check app/ และ pytest ที่เกี่ยวข้อง
```

สำหรับงาน security:

```text
รัน pre-merge security gate และสรุป PASS/CONDITIONAL/FAIL พร้อม findings
```

## ข้อควรระวัง

- ถ้ามี dirty files ที่ไม่เกี่ยวข้อง ให้บอกชัดว่าไม่ให้ stage/commit
- ถ้าต้องการ review อย่างเดียว ให้เขียนว่า `read-only` หรือ `ยังไม่ต้องแก้ code`
- ถ้าต้องการให้แก้เลย ให้เขียนว่า `ตรวจแล้วแก้ให้ครบ`
- ถ้างานเสี่ยงกับ DB หรือ external state ให้ขอ `backup-first`
- ถ้าเป้าหมาย product ยังไม่ชัด ให้ขอ product-UX brief ก่อน implementation
- ถ้าต้อง commit/push ให้ระบุ scope ของไฟล์ที่ให้ stage

## ตัวอย่าง Prompt แบบเต็ม

```text
[$orchestra] ปรับปรุง UI เดิมของ apps/web/client/src/pages/MyRequests.tsx และ apps/web/client/src/pages/WorkRequest.tsx ให้ production-ready มากขึ้น โดยคง API, business logic และ routing เดิมไว้ เพิ่ม visual polish, responsive layout, accessibility, focus states, loading/empty/error/disabled states และ dark-mode-friendly styling ตรวจด้วย visual UI gates และรัน cd apps/web && pnpm check ก่อนสรุป ห้าม stage/commit ไฟล์อื่นที่ไม่เกี่ยวข้อง
```

```text
[$orchestra] เพิ่มระบบ saved views สำหรับ dashboard ให้ครบ end-to-end เริ่มจาก quick-plan ถ้าจำเป็น แล้ว implement DB schema, tRPC router, frontend UI, tests, tenant isolation และ security gate ก่อนสรุปผล
```

```text
[$orchestra] ตรวจความสมบูรณ์ของ skills ทั้งชุดก่อนนำไปใช้เครื่องอื่น ตรวจว่าไม่มี .venv runtime artifact, ไม่มี external LLM API dependency, mirrored skills sync กับ installed runtime, agents registry ครบ, behavior scenarios ครบ และรัน audit ทั้งหมด
```
