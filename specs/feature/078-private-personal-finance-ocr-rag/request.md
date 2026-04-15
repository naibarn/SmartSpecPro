# Request

## Original user request

เพิ่มเติมระบบรายรับ-รายจ่ายประจำวันแบบ private เฉพาะบุคคล และมีระบบ OCR ช่วยอ่านเอกสาร/ใบเสร็จ พร้อมต่อยอดให้แยกข้อมูลส่วนตัวกับงานออกจากกัน ไม่ให้ปะปนกันในแชท, memory, library, และ RAG

## Normalized brief

Create the next feature package under `specs/feature` for a **private personal finance workflow** inside SmartSpecPro.

The feature should let a user:

- record daily income and expense entries through chat
- create recurring finance rules
- upload receipt / invoice / expense images and PDFs for OCR-assisted drafting
- confirm or edit structured drafts before they become authoritative transactions
- keep personal data isolated from work data, with personal scope owned per user
- retrieve supporting documents through the existing library/RAG stack without cross-domain leakage

The spec should be grounded in the current repository and should continue the existing feature lineage instead of inventing a new product surface.

## Repository-informed assumptions

- The main chat surface already exists in `apps/web/client/src/components/chat/ChatView.tsx` and related chat components.
- Chat persistence and project scoping already exist in `apps/web/server/routers/chat.ts`.
- Project-scoped memory already exists in `apps/web/server/services/memoryService.ts` and `apps/web/server/routers/memory.ts`.
- Library upload, indexing, search, and allowed-scope filtering already exist in `apps/web/server/routers/library.ts`, `apps/web/server/services/libraryService.ts`, and `apps/web/drizzle/schema.ts`.
- `library_items`, `library_chunks`, and `library_index_jobs` already carry `allowed_scopes` for retrieval filtering.
- `library.uploadFile` already supports sandbox-dispatched parsing for complex documents.
- `apps/web/server/routers/fileParseTool.ts` handles tabular parsing today, but it is not an OCR pipeline.

## Constraints

- Continue the numbering and folder structure style already used in `specs/feature`.
- Preserve all existing chat, library, and memory behavior outside the finance flow.
- Keep private finance owner-only by default.
- Lock personal chats to `projectId = "personal"` on the server, not only in the UI.
- Treat `projectId = "personal"` as a per-user reserved namespace, not a shared tenant bucket.
- Require draft-first confirmation for OCR and LLM extracted monetary data.
- Keep daily and monthly totals authoritative in the database, not model-generated.
- Enforce tenant / project / scope filtering before retrieval ranking.
- Enforce safe file handling for OCR inputs with allowlisted MIME types, size/page caps, and sandboxed processing.

## Non-goals

- Do not add bank sync in v1.
- Do not build a full accounting or tax suite.
- Do not replace the existing chat or library systems.
- Do not make personal finance data visible in work chats by default.
- Do not rewrite the current vector provider abstraction.
- Do not route OCR or finance documents to cloud providers when tenant policy forbids outbound processing.
