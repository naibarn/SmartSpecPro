# library-rag-spec.md — Unified Library/RAG Layer for Media + Documents

Spec ID: **SSP-LIB-RAG-2026-001**  
Spec folder: `specs/`  
Primary code boundaries:
- `apps/web/` (UI + Node server routes)
- `python-backend/` (RAG/indexing services + Celery workers)
- `apps/web/drizzle/` (DB schema/migrations)

Last updated: 2026-02-10

---

## 1) Summary
สร้าง `Library/RAG Layer` กลาง เพื่อรวมสินทรัพย์ที่สร้างจาก `Media Studio`, `Media History` และในอนาคต `Document Management` ให้ค้นหาและนำกลับมาใช้ใหม่ได้จากทั้งหน้า Chat และหน้า Media Studio โดยใช้ prompt/metadata เป็น key หลักและรองรับ semantic search ผ่าน vector database

แนวทางหลัก:
- ใช้ schema กลางสำหรับ media + document
- แยก ingestion/indexing เป็น async pipeline
- ไม่ hardcode provider query endpoint ในโค้ด แต่จัดการผ่าน admin model config
- ให้ callback/fetch-result ของ media มีความเสถียรด้วย retry + dead-letter flow

---

## 2) Problem Statement
ปัญหาปัจจุบัน:
- การดึงผลลัพธ์ media พึ่งพา endpoint/logic ที่ hardcode และมีความเสี่ยงใช้ task id ผิด field
- callback ของ provider ไม่เสถียร ทำให้ user ต้องกด fetch result เองทีละรายการ
- media ที่เคยสร้างยังไม่เป็น “คลังความรู้” ที่ค้นหาและ reuse ได้ง่ายข้ามหน้า
- ยังไม่มีโครงสร้างกลางรองรับเอกสารประเภทอื่น (pdf/docx/xlsx/pptx/md) เพื่อไปสู่ Document Management ครบวงจร

---

## 3) Goals
1. มี `Library` กลางที่เก็บ image/video/doc พร้อม metadata และสิทธิ์การเข้าถึง
2. มี `RAG indexing` สำหรับ prompt/description/transcript/OCR text เพื่อ semantic search
3. เพิ่ม `Add to Library` ได้จาก Media Studio และ Media History
4. Chat และ Media Studio ค้นหา library ได้แบบ hybrid (keyword + vector)
5. รองรับขยายไปสู่ Document Management (CRUD/share/search/preview/versioning)
6. เพิ่ม reliability ของ media result flow (provider endpoint config, callback retry, DLQ)

---

## 4) Non-goals (รอบนี้)
- ไม่ทำ auto-tagging/scene detection ขั้นสูงทั้งหมดในรอบแรก
- ไม่ทำ global policy engine แบบ enterprise เต็มรูปแบบในเฟสเริ่มต้น
- ไม่บังคับ re-index ข้อมูลเก่าทั้งระบบทันที (ทำแบบ incremental/backfill)

---

## 5) Current Foundations (ของเดิมที่ใช้ได้ทันที)
- Vector/Embedding:
  - `python-backend/app/core/vectordb.py`
  - `python-backend/app/services/embedding_service.py`
- Chat memory integration pattern:
  - `apps/web/server/routers/memory.ts`
- Media task/result flow:
  - `apps/web/server/routers/media.ts`
  - `python-backend/app/api/v1/media_generation.py`
  - `python-backend/app/models/media_task.py`

---

## 6) Target Architecture
Core components:
1. `Library Service` (CRUD + ACL + metadata normalization)
2. `Ingestion Pipeline` (extract text/media metadata -> chunk -> embed -> upsert vector)
3. `Search Service` (keyword + vector + rerank/filter)
4. `Provider Result Query Layer` (model-config driven endpoint/parser)
5. `Background Reliability Layer` (callback retry + dead-letter + scheduled reconcile)

Data flow (high-level):
1. User สร้าง media -> task completed (callback หรือ manual fetch)
2. User กด `Add to Library` หรือระบบ auto-add
3. สร้าง `library_item` + enqueue indexing job
4. worker สร้าง chunks + embeddings + vector upsert
5. Chat/Media Studio เรียก search API แล้วเลือก asset ไปใช้งานต่อ

---

## 7) Data Model (Proposed)

### 7.1 `library_items`
เก็บ asset หลักทุกประเภท (`image`, `video`, `document`)
- `id` (uuid, pk)
- `tenant_id`
- `owner_user_id`
- `type` (`image|video|document`)
- `source` (`media_studio|media_history|upload|import|api`)
- `title`
- `prompt_text` (nullable)
- `description` (nullable)
- `model_name` (nullable)
- `provider_name` (nullable)
- `storage_url` / `thumbnail_url` (nullable)
- `mime_type`, `size_bytes`, `duration_sec` (nullable)
- `visibility` (`private|team|public`)
- `tags` (jsonb/string[])
- `status` (`ready|indexing|failed|archived`)
- `metadata` (jsonb)
- `created_at`, `updated_at`, `deleted_at` (soft delete)

### 7.2 `library_chunks`
เก็บ chunks ที่ใช้ index/search
- `id` (uuid, pk)
- `library_item_id` (fk)
- `chunk_index`
- `content_text`
- `content_type` (`prompt|ocr|transcript|caption|notes|metadata`)
- `token_count`
- `embedding_model`
- `embedding_vector_id` (ref ใน vector db)
- `created_at`

### 7.3 `library_links`
ผูก item กับแหล่งที่มาเดิม
- `id` (uuid, pk)
- `library_item_id` (fk)
- `link_type` (`media_task|gallery_item|message|document_version`)
- `link_id` (string/uuid)
- `provider_task_id` (nullable)
- `internal_task_id` (nullable)
- `created_at`

### 7.4 `library_permissions` (ถ้าไม่ใช้ ACL ใน item โดยตรง)
- `id`, `library_item_id`, `principal_type`, `principal_id`, `role(view|edit|admin)`

### 7.5 `library_index_jobs`
- `id`, `library_item_id`, `job_type`, `status`, `attempt_count`, `last_error`, `run_at`, `created_at`, `updated_at`

### 7.6 `provider_model_configs` (ขยาย admin/media-models)
- `id`, `provider`, `model_key`, `result_query_endpoint`, `result_parser`, `auth_mode`, `enabled`, `metadata`

---

## 8) API & Contract Requirements

### 8.1 Admin Media Models
เพิ่ม config ต่อ model:
- `result_query_endpoint`
- `result_parser` (enum/handler key เช่น `kie_veo_record_info_v1`)
- `task_id_field_mapping` (`provider_task_id` required)

### 8.2 Media Result Query
- บังคับ query provider ด้วย `provider_task_id` เท่านั้น
- แยกชัดเจน:
  - `internal_task_id` = task id ภายในระบบ
  - `provider_task_id` = task id ของผู้ให้บริการภายนอก (เช่น Kie.ai)

### 8.3 Library APIs (ขั้นต่ำ)
- `POST /api/library/items` (manual add)
- `POST /api/library/items/:id/index`
- `POST /api/library/items/:id/share`
- `GET /api/library/items/:id`
- `GET /api/library/search?q=&type=&model=&owner=&tags=&date_from=&date_to=`
- `DELETE /api/library/items/:id` (soft delete)

### 8.4 Media Integration APIs
- `POST /api/media/tasks/:id/add-to-library`
- optional: auto-add hook หลังสถานะ `completed`

---

## 9) UI Requirements

### 9.1 Media Studio
- ปุ่ม `Add to Library` ในผลลัพธ์ภาพ/วิดีโอ
- panel ค้นหา `Search Library` แล้วดึง asset กลับมา reuse
- แสดงสถานะ index (`indexing|ready|failed`)

### 9.2 Media History
- ปุ่ม `Add to Library` ต่อรายการ
- แสดงสถานะว่า item นี้อยู่ใน library แล้วหรือยัง

### 9.3 Chat
- เพิ่ม source picker: `Search from Library`
- เลือก item แล้ว attach เข้า conversation/context ได้ทันที

### 9.4 Document Management (เฟสขยาย)
- หน้าเดียวสำหรับเพิ่ม/ลบ/แชร์/ค้นหา/preview/versioning
- รองรับไฟล์: `pdf`, `docx`, `xlsx/csv`, `pptx`, `md`

---

## 10) Reliability & Callback Strategy
1. callback receiver ต้อง idempotent (กัน insert/update ซ้ำ)
2. callback fail -> retry queue (exponential backoff)
3. เกิน retry limit -> dead-letter log + admin reprocess endpoint
4. scheduled reconciliation job:
   - ตรวจ task ค้าง `processing` นานผิดปกติ
   - ยิง query endpoint ตาม model config เพื่อตามผลอัตโนมัติ

---

## 11) Phased Delivery Plan

### Phase 0: Stabilize Media Result Flow
- เพิ่ม `result_query_endpoint` + `result_parser` ใน admin/media-models
- fix mapping ใช้ `provider_task_id` ตอน query provider
- เพิ่ม callback retry + DLQ + reconciliation job
- ลดการพึ่ง user manual fetch

### Phase 1: Library Schema กลาง
- เพิ่มตาราง `library_items`, `library_chunks`, `library_links` (+ permissions/jobs)
- migration + backfill strategy สำหรับข้อมูล media ล่าสุด

### Phase 2: Add to Library
- เพิ่มปุ่ม `Add to Library` ใน Media Studio/History
- manual add + optional auto-add เมื่อ completed
- สร้าง Celery indexing jobs

### Phase 3: Search/Retrieval
- hybrid search API + filters
- integrate กับ Chat และ Media Studio reuse flow
- response format รองรับ attach เข้า chat context

### Phase 4: Document Management
- ingest + chunk + embedding สำหรับ pdf/docx/xlsx/pptx/md
- OCR/transcript สำหรับไฟล์ที่ไม่ใช่ plain text
- UI document management ครบ workflow

### Phase 5: Governance & Monitoring
- RBAC/ACL + audit log + soft delete/restore
- index dashboard + alerting
- metrics: recall, latency, add-to-library success rate

---

## 12) Security & Compliance
- tenant isolation ทุก query/index operation
- signed URL หรือ controlled media access policy
- redact secrets/PII จาก logs
- audit trail สำหรับ add/share/delete/reindex

---

## 13) Performance Targets (Initial SLO)
- Search API P95 < 800ms (query ทั่วไป)
- Add-to-library API P95 < 300ms (async index)
- Index job start latency < 30s (queue ปกติ)
- Callback recovery success > 99% ภายใน 15 นาที

---

## 14) Testing Strategy
1. Unit tests:
   - parser mapping per provider/model
   - ACL enforcement
   - chunking/index job state machine
2. Integration tests:
   - media task -> add-to-library -> indexed -> searchable
   - callback failure -> retry -> success / DLQ
3. E2E tests:
   - Media Studio add/search/reuse
   - Media History add/search/reuse
   - Chat search + attach asset
4. Regression tests:
   - เดิมของ media generation ต้องไม่พัง

---

## 15) Rollout Plan
1. เปิด feature flag สำหรับ tenant ภายใน
2. เปิดเฉพาะ image/video ก่อน (Phase 2-3)
3. monitor queue/search metrics 1-2 สัปดาห์
4. ค่อยเปิด document ingest และ sharing ระดับทีม

---

## 16) Definition of Done (MVP)
- มี schema + API + UI `Add to Library` สำหรับ image/video ใช้งานได้จริง
- search จาก Chat และ Media Studio ได้ทั้ง keyword + semantic
- media result flow ไม่ต้อง fetch manual เป็นหลักอีกต่อไป
- มี dashboard เห็น index job status และ error retry/DLQ

---

## 17) Open Questions
1. default visibility ตอน add ใหม่ควรเป็น `private` หรือ `team`?
2. ต้องการ auto-add ทุก completed task หรือให้เปิดเป็น per-model/per-tenant?
3. vector DB target ใน production จะใช้ provider ใดเป็นหลัก (Chroma/pgvector/อื่น)?
4. versioning document ต้องเป็น immutable ทุก revision หรือ overwrite ได้บางกรณี?
5. share policy ต้องมี link expiry/ดาวน์โหลดจำกัดหรือไม่?

