# Feature 173 Implementation Audit — 10 Rounds

วันที่ตรวจ: 2026-09-01

วัตถุประสงค์ของ audit นี้คือยืนยันว่า Enhanced เป็นทางเลือกแบบ additive และไม่เปลี่ยน Legacy flow, projection, paid render admission หรือ data shape เดิมเมื่อ feature ถูกปิด

| รอบ | ขอบเขต | ผลตรวจ | การแก้ไข/หลักฐาน |
|---|---|---|---|
| 1 | Variant schema, bounds, malformed/future store | PASS หลังแก้ | จำกัด prompt/diagnostics, strict store, invalid store กลับไปอ่าน Legacy projection แบบปลอดภัย |
| 2 | Legacy projection และ existing readers | PASS | store อยู่ข้าง `clip.*`; Apply เท่านั้นที่เปลี่ยน active projection; clip ที่ไม่มี store ยังอ่านเป็น Legacy |
| 3 | Package identity, manifest, SDK, adapter | AUTO-FIX แล้ว PASS | เพิ่ม manifest hash approval, exact v11 package/version gate, frontmatter version ให้ตรง 11.0.0, fail-closed เมื่อ runtime ไม่ครบ |
| 4 | Generic input/stage boundary และ Agent safety | AUTO-FIX แล้ว PASS | bridge validate `input.schema.json` ก่อน run และส่งเฉพาะ strict package envelope; Agent เป็น plan-only ไม่มี provider/credit side effect |
| 5 | Canonical Drama context และ Feature 170 media | AUTO-FIX แล้ว PASS | เพิ่ม series/episode/shot/cast/location/language/policy context, typed media bundle และ target capability snapshot ลง input/fingerprint |
| 6 | URL/reference safety และ capability routing | AUTO-FIX แล้ว PASS | reject local/unusable vision URL, reject mixed invalid refs, enforce <=12 refs, check exact capability profile ก่อน readiness |
| 7 | Jobs, concurrency, late result, stale state | PASS | job key แยก tenant/user/shot/operation/idempotency, lock/re-read, revision/fingerprint guard และ no fallback |
| 8 | Credits, Apply/finalize separation, recovery | PASS | Apply ไม่ต้องเปิด jobs, generation ใช้ Agent estimate/actual token settlement, failure ไม่ทับ Legacy และ retry state ยังชัดเจน |
| 9 | UI, feature flags, accessibility, old flow | AUTO-FIX แล้ว PASS | readiness map ถูกส่งถึง Storyboard, Enhanced CTA fail-closed เมื่อ unknown, UI/jobs/apply flag แยกกัน, Legacy button/callback ไม่ถูกเปลี่ยน |
| 10 | Existing writers และ render provenance | AUTO-FIX แล้ว PASS | whole-pack/บทพูด/repair Legacy writers รักษา variant store, model/language change mark เฉพาะ Enhanced stale, Apply รักษา media และ mark `prompt_mismatch` หรือ `provenance_unknown` |

## Final convergence

- `check-sections.py`: 4/4 sections complete.
- `check-ui-contracts.py`: 4/4 UI sections, failures 0.
- Focused TypeScript tests: 25 passed.
- Generic Director v11 runtime regression: 10 checks passed.
- Generic package validation: passed.
- Python bytecode compilation: passed.
- `git diff --check` on owned modified paths: passed.

## Explicit non-claims

Full repository typecheck, browser viewport/keyboard QA, live OpenAI/provider call, live billing settlement, database migration, deployment and production acceptance remain release gates; they are not treated as passed by this audit. Existing unrelated dirty-worktree/typecheck and router-test mock failures remain outside Feature 173 ownership and must not be used as evidence that the Legacy flow changed.

## Independent re-audit cycle — 10 rounds

หลังจากแก้ไขรอบแรก ได้ตรวจซ้ำอีกหนึ่ง cycle เพื่อจับ regression จาก writer และ
render lineage ที่เพิ่มเข้ามา:

| รอบ | ผลตรวจ | ข้อสรุป |
|---|---|---|
| 1 | PASS | schema/store bounds และ malformed-store quarantine ยังครบ |
| 2 | PASS | absent-store Legacy compatibility ยัง byte-compatible |
| 3 | PASS | manifest/version/SDK/allow-list gate ยัง fail-closed |
| 4 | PASS | bridge ยัง validate strict package input ก่อน Agent |
| 5 | PASS | canonical context และ capability snapshot ยังถูก fingerprint |
| 6 | PASS | invalid/local vision URL และ unsupported media combination ถูก block |
| 7 | PASS | job lock/revision/idempotency และ late-result guard ไม่เปลี่ยน |
| 8 | PASS | credit/Apply/finalize separation ไม่เพิ่ม side effect ให้ Legacy |
| 9 | PASS | readiness map/flag matrix/UI active-render state ยัง fail-closed |
| 10 | AUTO-FIX แล้ว PASS | start-frame/cast-lock/identity-change paths เก็บ opted-in clip ไว้, mark stale และ paid render block จน regenerate; Legacy-only path คง behavior เดิม |
