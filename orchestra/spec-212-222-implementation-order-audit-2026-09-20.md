# Specs 212–222 Implementation Order Audit

วันที่ตรวจ: 2026-09-20

## ผลสรุป

ลำดับเดิมยังไม่สามารถนำไปทำเป็น topological implementation plan ได้ เพราะ `Depends on` ของ Specs 218–222 เป็นความสัมพันธ์แบบ full integration แต่ถูกเขียนเหมือน bootstrap dependency ทำให้เกิดวงจร 218 ↔ 219 ↔ 220 และ Spec 222 อ้างทุกระบบพร้อมกัน

แก้แล้วโดยแยก `Core depends on` กับ `Integration dependencies` และบันทึกลำดับกลางไว้ใน:

- `spec-216-222-companion-alignment-addendum.md` Section 8
- `spec-217-222-contract-profile-r3.json` field `implementation_order`

## ลำดับที่ต้องใช้

| Wave | ลำดับ implement | Gate ก่อนขยับต่อ |
|---:|---|---|
| 0 | Freeze existing authorities: Feature 195/`worker_jobs`, Tenant identity, Spec 207, Specs 199/200/206/208/211 และ Spec 209 baseline | baseline inventory/ownership freeze |
| 1 | Spec 214 canonical Node Type/admission → Spec 215 WorkflowInterface, bindings, scopes, policies, instrumentation/compiler contract | contract schema + admission tests |
| 2 | Spec 216 Phases 0–3: registry authoring, canonical definition, compiler/runtime cutover | Studio emits only admitted 214/215 contracts |
| 3 | Spec 220 gateway core: invocation envelope, tenant authorization, Asset/RAG, secret handles, egress | direct Core credential denial + tenant isolation |
| 4 | Spec 217 Product/Tenant/Brand/Mini App identity, entitlement, release lineage | immutable Product identity/release lineage |
| 5 | Spec 222 Phases 1–2 context/harness foundation → Spec 221 Skill identity/dependency/eval/review/release contracts | ContextPack and Skill admission |
| 6 | Spec 218 WorkPackage/DevelopmentJob/ChangeSet/ReleaseCandidate control plane | immutable/resumable build-test-preview evidence |
| 7 | Spec 219 managed runtime, namespaces, domains, promotion, rollback, suspension | staging/production isolation + release admission |
| 8 | Integration hardening: Spec 216 Phases 4–8, 217 publication, 220 runtime enforcement, 221 capability-gap, 222 Phases 3–5 | cross-spec security/economic/conformance gates |
| 9 | Spec 212 R20 representative slices → full corpus | critical failures block release |

Spec 213 เป็น parallel lane สำหรับ hardening ของ Spec 208/Computer Use: ไม่ block Waves 1–4 แต่ต้องผ่าน provider/conformance gate ก่อนนำ Computer Use เข้า Wave 5 harness integration และ R20 slices ที่เกี่ยวข้อง

## Codebase evidence used

- Workflow Studio baseline: `apps/web/server/routers/workflowStudio.ts`, `workflowStudioContracts.ts`, `workflowStudioRuntime.ts`, `workflowBuilderCompiler.ts`
- Durable execution: `createControlPlaneJob` + `worker_jobs`/outbox boundary
- Persistence baseline: `apps/web/drizzle/0341_feature_209_workflow_studio.sql`
- Current code still uses pre-upgrade graph/compiler shapes, including `feature-209-v1`; therefore Spec 216 Phases 1–3 must precede Product/agentic production integrations

## Verification

- Contract profile JSON parses successfully
- Package manifest hashes/byte counts must be refreshed after this ordering change
- Final validation must assert no cycle is treated as a bootstrap dependency and all wave references resolve to existing specs
