# Spec completeness audit — round 8

วันที่: 2026-08-27

ตรวจซ้ำ 5 รอบหลังจากรอบ implementation audit ก่อนหน้า โดยแยก “ความครบถ้วน
ของ spec” ออกจากหลักฐานการทำงานจริงของ browser, ComfyUI/Cloud และ production
ที่ต้องทดสอบใน environment เฉพาะ

| รอบ | ขอบเขตตรวจ | ผลตรวจ | การปิด gap |
|---|---|---|---|
| 1 | โครงสร้าง section, dependency, ownership, traceability | ผ่าน 9/9 sections; ไม่พบ section หายหรือหัวข้อซ้ำ | ยืนยัน section 01–09 และ owner boundary |
| 2 | Worker/Web projection, endpoint, pagination, revision, parity | พบการอ้าง route แบบแนะนำและ cursor ยังไม่ตายตัว | กำหนด `GET /api/worker-runtime/jobs/summary`, token-derived identity, signed cursor, snapshot counts และ stale-cursor errors ใน spec/section 06 |
| 3 | permission, revocation, capability, credential, security | พบความเสี่ยงที่ empty scope อาจถูกตีความเป็นไม่มีสิทธิ์/สำเร็จ | กำหนด server-issued permission manifest, effective-state calculation, permission-denied state และ reauthorization boundary ใน Section 22 |
| 4 | workflow input/output, local-only, transfer, recovery, migration | ต้องทำให้ multi-output และ local-only result มี acceptance ที่ตรวจได้ | กำหนด output-role cardinality, all-or-nothing publication, local-only ห้าม resolve target/upload และหลักฐาน negative tests |
| 5 | UI/UX, localization, duplicate surfaces, release evidence | พบตัวเลือก route/หน้าซ้ำและเกณฑ์ “พร้อม” อาจปนกับ external proof | กำหนด Sidebar ComfyUI 3 หน้าหลัก, legacy redirect, locale ก่อน first render, Overview active-above-fold และ evidence 3 classes |

## Closure result

- Section checker: 9/9 complete.
- UI contract checker: 9/9 passed.
- Exact endpoint and route references are consistent across `spec.md`, the
  impact map, and Section 06.
- The spec now has deterministic contracts for cursor binding, permission
  truth, output roles, local-only completion, canonical navigation, and proof
  classification.
- No unresolved spec-level MUST_FIX, TBD, alternative endpoint, or ownership
  ambiguity remains in the audited scope.

## Evidence boundary

This document does not claim that real browser/WebView, ComfyUI MCP transports,
Cloud credentials, production queue/DB, migration apply, or signed installer
proof has been performed. Those are explicitly `pending` release evidence in
Section 22.5 and must remain separate from deterministic test results.
