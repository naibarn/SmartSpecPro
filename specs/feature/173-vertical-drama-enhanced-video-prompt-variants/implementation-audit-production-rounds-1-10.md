# Feature 173 — Production-grade implementation audit (UI-only runtime)

วันที่ตรวจ: 2026-09-02

เอกสารนี้เป็น audit cycle หลัง implementation และหลังย้าย configuration ของ
Enhanced runtime ออกจาก `.env` ไปเป็น platform settings ใน Admin UI โดยตั้งใจ
ตรวจซ้ำให้ครบ 10 รอบและปิด gap ที่พบระหว่าง cycle

| รอบ | จุดตรวจ | ผลลัพธ์ | Gap ที่พบและการปิด |
|---:|---|---|---|
| 1 | ขอบเขตงานและ backward compatibility | PASS | Enhanced ยังเป็น additive path; Legacy callback, projection และ render input ไม่ถูกเปลี่ยน |
| 2 | Feature-flag matrix และ default state | PASS | UI/Jobs/Apply แยกกันและ default ปิด; เพิ่ม registry entries ให้ Admin เห็นครบทั้ง 3 ค่า |
| 3 | Admin discoverability | FIXED → PASS | เพิ่ม Vertical Drama Enhanced Runtime card ใน Infrastructure Settings และ workflow ตั้งค่าผ่าน UI |
| 4 | Configuration authority และ secret boundary | FIXED → PASS | ตัด `VD_ENHANCED_*` gates/command override; ใช้ `system_settings` และ provider credentials แบบ transient เท่านั้น |
| 5 | Runtime/package integrity | PASS | bridge path/command ถูกล็อกใน server, manifest hash และ SDK/adapter approval เป็น snapshot ใน DB, fail-closed เมื่อ probe ไม่ผ่าน |
| 6 | OpenAI Agents SDK boundary | PASS | bridge รองรับ `--health`, validate input ก่อน run, ส่ง structured result กลับโดยไม่ให้ Agent คุม credit/provider/publish |
| 7 | Model-role separation | FIXED → PASS | authoring model ถูกเลือกจาก UI และต้องมี Vision + Structured Output; image/video model ยังคงเป็นคนละ role |
| 8 | Provider/model routing | FIXED → PASS | target video model ใช้ catalog capability snapshot; authoring provider pin เป็น strict และห้าม fallback ไป credential อื่นเงียบ ๆ |
| 9 | Job, credit, stale-result และ apply isolation | PASS | idempotency/active-job/revision guard, estimate-before-spend, Apply แยกจาก generate และไม่ทับ Legacy โดยอัตโนมัติ |
| 10 | UI states, tests และ release evidence | PASS | same-editor variant flow, active-render badge, explicit Apply, focused tests/skill validator/health probe ผ่าน; browser/live-provider/deploy ยังเป็น release gates |

## Evidence

- Focused Vitest: 5 files, 57 tests passed.
- Storyboard/admin jsdom Vitest: 4 files, 41 tests passed.
- Existing tenant flag regression suite: 5 files, 32 tests passed.
- Python `py_compile`: passed.
- Generic Director v11 runtime regression: 10 checks passed.
- Generic Director package validator: passed (37 input fixtures, 16 provider
  profiles, stage/promotion/provider solver fixtures).
- Enhanced bridge health: `ok=true`, SDK `0.22.0`, adapter `1.0.0`, skill
  `11.0.0`.
- Focused `git diff --check`: passed.
- Search of owned source/spec paths: no `VD_ENHANCED_*` runtime gate or
  process environment gate reference remains.

## Explicit release boundary

Repo-wide TypeScript output still contains pre-existing unrelated errors in
other modules; it is not reported as a pass. No live provider call, browser
viewport/keyboard session, billing settlement, deployment, or production
acceptance was performed in this audit. Those are separate release gates and
do not change the fact that Enhanced is fail-closed and Legacy-safe by design.

## Post-audit closure checks

- รอบ 11: server mutation ถูกทำให้ตรวจ Vision + Structured Output เช่นเดียวกับ
  UI catalog; direct API ที่ส่งโมเดลไม่ตรง contract จะถูกปฏิเสธ
- รอบ 12: runtime approval ถูกทำให้ปฏิเสธ `unknown` adapter version ด้วย แม้
  bridge จะตอบกลับสำเร็จ เพื่อป้องกัน approval ที่ readiness ใช้งานจริงไม่ได้
- รอบ 13: production packaging gap ถูกปิดใน `node-api` Dockerfile โดยติดตั้ง
  Python/uv และ sync skill dependencies จาก lockfile พร้อมแก้ fixed-path
  resolver ให้ตรงกับ Cloud Run layout; image build ใน workspace นี้ยังไม่
  สามารถสรุปผ่านได้เพราะ build context มี artifact ขนาดใหญ่และ mount ที่อ่าน
  ไม่ได้ จึงต้องยืนยันอีกครั้งใน CI/release build
