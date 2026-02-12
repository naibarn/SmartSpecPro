# Implementation Spec

Date: 2026-02-12
Scope: `apps/web` TypeScript remediation
Source inputs:
- `spec.md`
- `research-notes.md`
- `interview-notes.md`

## 1) Objective

แก้ TypeScript errors ใน `apps/web` ให้เหลือ `0` โดย:
- ไม่ลด security baseline
- ไม่เปลี่ยนพฤติกรรม auth/tenant เดิมโดยไม่ตั้งใจ
- ไม่พึ่งพา unsafe shortcuts แบบกว้าง

## 2) Explicit Requirements

1. `npm run check` ใน `apps/web` ต้องผ่านทั้งหมด
2. แก้ root-cause ก่อน cleanup:
   - alias/module resolution
   - broken imports
   - ENV contract drift
   - missing dependency types
3. strict typing cleanup ทำตาม contract จริง ไม่ใช้ `as any` กลบปัญหา
4. เพิ่ม verification gate ชัดเจนก่อนปิดงาน
5. ส่งมอบแบบ single batch ตามที่ผู้ใช้กำหนด

## 3) Non-Goals

1. ไม่ redesign architecture ทั้งระบบ
2. ไม่เปลี่ยน business behavior ที่ไม่เกี่ยวกับ type correctness
3. ไม่ทำ DB schema migration เว้นแต่จำเป็นจริงเพื่อ type correctness (ค่าเริ่มต้น: no schema change)

## 4) Technical Constraints

1. Keep `strict: true` และ `noEmit` behavior
2. ห้ามปิด checking flags เพื่อให้ผ่านแบบปลอม
3. Preserve tenant/auth/url-safety flows
4. Allowed to add required dependencies/types

## 5) Work Breakdown (Functional)

## 5.1 Foundation
- Fix `tsconfig` inheritance and path aliases for:
  - `@server/*`
  - `@smartspec/ui/src/*`
- Ensure target/lib compatibility for Set/Map iteration and modern regex usage

## 5.2 Contract Corrections
- Fix wrong server import in `server/routers/factory.ts`
- Add missing ENV fields used by storage integration
- Resolve known schema/type drift in `systemSettings` and related router flows

## 5.3 Type Recovery and Strict Cleanup
- Recover tRPC typing propagation to client
- Fix high-volume implicit-any and mismatch errors in Admin/Media/Chat and server services
- Handle each category with concrete types and guards

## 5.4 Verification and Guardrails
- Pre/post error baselines (count by code and by file)
- Targeted test runs for sensitive areas (library/media/tenant/security)
- Final full typecheck gate

## 6) Acceptance Criteria

1. `apps/web npm run check` exits with code `0`
2. No broad introduction of `any`/`@ts-ignore`
3. No regression in tenant attribution and auth guard behavior (validated by tests)
4. Documentation artifacts updated with before/after metrics

## 7) Risk Classification

- Data risk: `none` (expected)
- Security risk: `medium` if unsafe casts slip in
- Regression risk: `high` due to broad touch surface; mitigated with phased internal gates and final full check
