# Spec: TypeScript Error Remediation Master Plan (apps/web)

- Date: 2026-02-12
- Owner: Web Platform / Security Hardening
- Status: Draft (Ready for implementation)
- Scope: `apps/web` (client + server + shared imports used by web)
- Primary Goal: แก้ TypeScript errors ที่ค้างอยู่ให้เหลือ `0` โดยไม่ลดมาตรฐานความปลอดภัยและไม่ทำให้ฟีเจอร์เดิมพัง

---

## 1) Problem Statement

ปัจจุบัน `npm run check` ใน `apps/web` ยังมี TypeScript errors จำนวนมาก ทำให้:

1. pipeline คุณภาพโค้ดไม่ผ่าน
2. เสี่ยง regression เพราะ type contracts แตก
3. เพิ่มโอกาสเกิด security bugs (เช่น type drift ใน auth/tenant/env contracts)

### Baseline (ล่าสุด)

- Total errors: `2589`
- Top error codes:
  - `TS2305` = 1090
  - `TS7006` = 761
  - `TS2339` = 449
  - `TS2307` = 57
  - `TS2554` = 39
- ไฟล์ที่ error สูงสุด (sample):
  - `client/src/pages/ComponentShowcase.tsx`
  - `client/src/pages/MediaStudio.tsx`
  - `client/src/pages/AdminSkills.tsx`
  - `client/src/pages/AdminSettings.tsx`
  - `client/src/pages/AdminQueues.tsx`

---

## 2) Root Causes (จัดกลุ่ม)

## 2.1 Module Resolution / Alias แตก (Critical)

อาการ:

- `TS2307 Cannot find module '@smartspec/ui/src/components/ui/*'`
- `TS2307 Cannot find module '@server/routers'`

ผลกระทบ:

- ทำให้ wrapper UI ทั้งชุด (`client/src/components/ui/*`) import ไม่ได้
- ทำให้ type ของ `trpc` พังเป็นลูกโซ่ (เกิด `TS2339` จำนวนมาก)

สาเหตุหลัก:

- `apps/web/tsconfig.json` ยังไม่ extend ฐาน config และยังไม่มี path alias ที่จำเป็น

## 2.2 Import path ผิดใน server (High)

อาการ:

- `server/routers/factory.ts` import จาก `../trpc` (ผิด path)

ผลกระทบ:

- router ไม่ได้ type ที่ถูกต้อง
- ลามเป็น `binding element implicitly any` และ API signature mismatch

## 2.3 ENV Contract Drift (High)

อาการ:

- `ENV.forgeApiUrl` / `ENV.forgeApiKey` ถูกใช้งานหลายไฟล์ แต่ไม่ประกาศใน `server/_core/env.ts`

ผลกระทบ:

- error ตรง ๆ + เสี่ยง runtime misconfiguration ในเส้นทางที่เกี่ยวกับ LLM/media/data

## 2.4 Dependency Type Gap (Medium)

อาการ:

- `Cannot find module 'stripe'` หรือ type declarations

ผลกระทบ:

- build/typecheck ฝั่ง billing/system settings ไม่ผ่าน

## 2.5 Strict Typing Debt (Medium)

อาการ:

- `TS7006` implicit any จำนวนมาก
- `TS2322` / `TS2345` contract mismatch กระจุกใน chat/admin/server services

ผลกระทบ:

- ลดความปลอดภัยเชิง type และเพิ่มความเสี่ยง regression

---

## 3) Remediation Plan (ต้องทำครบ)

## Phase A: Foundation Fix (ต้องทำก่อนทุกอย่าง)

1. แก้ `apps/web/tsconfig.json`
   - เพิ่ม `extends: ../../tsconfig.base.json`
   - ยืนยัน `target: ES2022` (รองรับ iteration/Map/Set ตามที่โค้ดใช้อยู่)
   - คง `strict: true`
   - เพิ่ม paths:
     - `@server/* -> ./server/*`
     - `@smartspec/ui/src/* -> ../../packages/ui/src/*`
2. ตรวจ alias consistency กับ `vite.config.ts` และ runtime imports
3. ล้าง cache typecheck (`tsbuildinfo`) แล้วรัน check ใหม่

### Acceptance ของ Phase A

- `TS2307` ฝั่ง ui wrappers และ `@server/routers` ต้องหายทั้งหมด
- `TS2305` จำนวนมากที่เป็นผลพวงจาก module-not-found ต้องลดลงอย่างมีนัยสำคัญ

## Phase B: Contract & Import Corrections

1. แก้ `apps/web/server/routers/factory.ts`
   - import จาก `../_core/trpc` (ไม่ใช่ `../trpc`)
2. แก้ `apps/web/server/_core/env.ts`
   - เติม fields ที่ถูกใช้งานจริง:
     - `forgeApiUrl`
     - `forgeApiKey`
   - วาง fallback chain จาก env ที่ใช้จริงในระบบ
3. เติม dependency/types ที่ขาด (เช่น stripe) ให้ตรงกับโค้ดที่อ้างอิง

### Acceptance ของ Phase B

- `TS2307`/`TS2339` ที่มาจาก env/import drift หาย
- ไม่มี field access ที่ไม่ได้ประกาศบน `ENV`

## Phase C: tRPC Type Recovery (หลัง alias fix)

1. validate `client/src/lib/trpc.ts` ให้ชี้ `AppRouter` ถูกต้อง
2. รัน check เฉพาะกลุ่มไฟล์ chat/admin ที่เคยแตกเพราะ `trpc` unknown
3. แก้เฉพาะจุดที่ยังพังจริง (ไม่ใช้ `any` ปิดปัญหา)

### Acceptance ของ Phase C

- error ข้อความแนว `property ... does not exist on type "The property 'useContext'..."` ต้องหาย

## Phase D: Strict Cleanup (Batch by area)

ลำดับแก้:

1. `client/src/pages/Admin*` + `client/src/pages/MediaStudio.tsx`
2. `client/src/components/chat/*`
3. `server/services/*` และ `server/_core/*`

แนวทาง:

- แทน implicit `any` ด้วย type alias/interface จริง
- แยก runtime guards สำหรับ `unknown`
- แก้ function signatures ให้ตรง overload
- แก้ tenantId string/number contracts ให้ชัดเจน (ไม่ cast ทับ)

### Acceptance ของ Phase D

- `TS7006`, `TS2322`, `TS2345`, `TS2554` เหลือ 0
- ไม่มี `as any` ใหม่ที่ไม่จำเป็น

## Phase E: Hardening & Regression Guard

1. เพิ่ม CI gate สำหรับ typecheck (`apps/web`)
2. เพิ่ม script แยก:
   - `check:client`
   - `check:server`
3. บันทึก baseline ก่อน/หลังทุกเฟสลง artifact หรือ markdown report

### Acceptance ของ Phase E

- `npm run check` ผ่าน 100%
- CI fail ทันทีเมื่อมี type regressions

---

## 4) Detailed Fix Inventory (ไฟล์สำคัญที่ต้องแตะ)

### Config / Infra

- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts` (ตรวจความสอดคล้อง alias)
- `apps/web/package.json` (scripts/check split)

### Core Type Contracts

- `apps/web/client/src/lib/trpc.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/_core/trpc.ts`
- `apps/web/server/_core/env.ts`

### Broken Import Hotspots

- `apps/web/server/routers/factory.ts`
- `apps/web/client/src/components/ui/*` (ทุกไฟล์ wrapper)
- `apps/web/client/src/lib/utils.ts`

### High-Error App Areas (ต้องไล่ครบ)

- `apps/web/client/src/pages/Admin*.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/ComponentShowcase.tsx`
- `apps/web/client/src/components/chat/*.tsx`
- `apps/web/server/services/modelSyncService.ts`
- `apps/web/server/_core/llmRoutes.ts`

---

## 5) Security Constraints (ห้ามทำ)

1. ห้ามปิด `strict` หรือ `noEmit` เพื่อให้ผ่านปลอม
2. ห้ามแก้โดย cast เป็น `any` จำนวนมาก
3. ห้ามลบ validation/runtime guard ที่เกี่ยวกับ auth/tenant/url safety
4. ห้ามเปลี่ยนพฤติกรรม auth/session โดยไม่มี test ครอบ

---

## 6) Verification Matrix

## 6.1 Mandatory commands

1. `cd apps/web && npm run check`
2. รัน unit tests ของโมดูลที่แก้
3. รัน smoke ของ flows สำคัญ:
   - login/auth context
   - admin settings
   - media studio
   - document management

## 6.2 Done Criteria

1. TypeScript errors = 0
2. ไม่มีการลดมาตรฐาน strictness
3. Critical flows ใช้งานได้
4. ไม่มี security regression ใหม่จากการแก้ type

---

## 7) Implementation Sequence (แนะนำ)

1. Phase A + B ใน PR แรก (ลด error ก้อนใหญ่สุด)
2. Phase C ใน PR ที่สอง (tRPC/type chain)
3. Phase D แบ่งตาม area (admin/chat/server) ทีละ PR
4. Phase E ปิดท้ายด้วย CI gate + report

---

## 8) Reporting Format ต่อรอบแก้

ทุก PR ต้องรายงาน:

1. ก่อนแก้: error count แยกตาม code
2. หลังแก้: error count แยกตาม code
3. ไฟล์ที่แก้
4. risk ที่เหลือ
5. next batch

---

## 9) Current Priority Order (Immediate)

1. `tsconfig` + alias (`@server`, `@smartspec/ui/src`)
2. `factory.ts` import fix
3. `env.ts` forge fields
4. rerun check และ capture delta
5. เริ่ม batch แก้ `TS7006` ในไฟล์ top 10

