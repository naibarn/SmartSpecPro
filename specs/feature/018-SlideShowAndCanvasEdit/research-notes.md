# Research Notes

## Codebase Recon

### Scope and Entry Points Reviewed
- Spec: `specs/feature/018-SlideShowAndCanvasEdit/spec.md`
- Frontend integration points:
  - `apps/web/client/src/pages/DocumentManagement.tsx`
  - `apps/web/client/src/components/library/DocumentGridList.tsx`
  - `apps/web/client/src/lib/documentManagementUi.ts`
  - `apps/web/client/src/App.tsx`
  - `apps/web/client/src/components/videoeditor/*`
  - `apps/web/client/src/types/videoEditor.ts`
- Backend integration points:
  - `apps/web/server/routers.ts`
  - `apps/web/server/routers/library.ts`
  - `apps/web/server/services/libraryService.ts`
  - `apps/web/server/services/vectorize-indexing.ts`
  - `apps/web/server/routers/mediaJobs.ts`
  - `apps/web/shared/types/mediaJob.ts`
  - `python-backend/app/tasks/media_job_worker.py`
  - `apps/web/drizzle/schema.ts`

### Existing Architecture and Module Boundaries
- Library/document flows are centralized in `library` router + `libraryService`, with Document Management UI consuming `trpc.library.*` methods.
- Rendering/export responsibilities are split:
  - Web app assembles render specs via `mediaJobs` APIs.
  - Python worker executes FFmpeg jobs (`render_mp4_h264`, transitions, concat/audio handling).
- Video editor has mature timeline/clip/transition abstractions (`videoEditor.ts`, `mediaJob.ts`) that can be reused for presentation-to-video conversion.
- Route registration is centralized in `apps/web/server/routers.ts`; no existing presentation-specific router is currently registered.

### Data Model and Storage Dependencies
- Existing library schema is already multi-tenant and permission-aware:
  - `library_items`, `library_chunks`, `library_permissions`, `library_index_jobs`.
- `library_items.itemType` is flexible (`varchar`), so `presentation` can be introduced without altering that column.
- Important current behavior mismatch:
  - Upload inference maps PPT/PPTX to `document` (`inferLibraryItemType`), while Drive sync can map MIME to `presentation`.
- `library_chunks` has unique key on `(libraryItemId, chunkIndex)` only.
  - Risk: multi-slide chunk strategies can collide with existing markdown/source chunking unless indexing strategy is explicitly namespaced.
- Existing `video_editor_projects` table is user-scoped and does not carry tenant ownership metadata, so it is not a direct fit for tenant-owned presentation entities.
- Storage patterns already include tenant/user scoping in keys (`library/uploads/{tenantId}/{userId}/...`) and upload-key linking in `library_links`.

### Tests and Coverage in Impacted Areas
- Strong existing backend test surface for library/media/vectorize primitives:
  - `apps/web/server/routers/library.test.ts`
  - `apps/web/server/services/libraryService.test.ts`
  - `apps/web/server/__tests__/vectorize-indexing.test.ts`
  - `apps/web/server/routers/media.addToLibrary.test.ts`
- Strong existing video editor component/unit coverage in `apps/web/client/src/components/videoeditor/__tests__/`.
- Gaps for this feature scope:
  - No presentation editor/page tests yet.
  - No presentation router/service tests yet.
  - No migration tests for presentation-specific tables (because tables do not exist yet).

### Tenant Attribution, Permissions, and Security Controls
- Tenant resolution pattern for library operations is explicit (`resolveTenantIdVarchar`) and fail-fast when missing context.
- Library access checks are layered:
  - Auth gate via `protectedProcedure`.
  - Tenant/feature gates in router (`resolveLibraryTenantId`, `assertLibraryEnabled`).
  - Per-item effective permission checks in `libraryService` (`read/write/delete/owner`, group and role aware).
- Upload security controls are already present:
  - MIME/extension allowlists.
  - size cap (30MB) and SVG sanitization.

### Migration and Data Safety Risk Classification
- DB schema change profile for proposed presentation tables is **low** if implemented additively.
- Integration/data integrity risk is **medium** in these areas:
  - Keeping `library_chunks` indexing semantics collision-free for slide text + markdown coexistence.
  - Ensuring presentation assets and links are deleted/restored atomically with library lifecycle behavior.
  - Preserving tenant and permission boundaries when adding new endpoints and shared links.

### Destructive/Data-Loss Risk Detection
- No direct destructive migration is required if adopting additive table creation.
- Explicit data-loss risk to control:
  - Accidental overwrite/collision in `library_chunks` chunk indices for shared `libraryItemId`.
  - Incomplete cleanup of linked storage assets during permanent delete flows.

## Web Research
- Pending topic selection.

## Web Research

### 1) Canvas editor architecture and performance (DOM transforms vs Canvas/scene graph)

Key findings:
- `OffscreenCanvas` can move rendering work off the main thread via workers, reducing UI-thread pressure for heavy draw workloads.
- Layered canvas and pre-rendering are established optimizations for complex scenes (static + dynamic split).
- Konva performance guidance emphasizes reducing event hit-testing (`listening(false)`), caching complex shapes, and minimizing expensive draw paths.
- CSS `transform` remains broadly available and useful for element positioning, but large editable object counts and hit-testing complexity can push toward canvas/scene-graph approaches.

Planning implications:
- Use a hybrid strategy: DOM/text editing where accessibility/editability matters, with canvas/scene-graph rendering path for high-object interactive composition.
- Include explicit performance budget/thresholds to switch optimization modes (caching, interaction disabling on background layers, worker/offscreen rendering).

Sources:
- MDN OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- web.dev canvas performance: https://web.dev/articles/canvas-performance
- Konva performance tips: https://konvajs.org/docs/performance/All_Performance_Tips.html
- MDN CSS transform: https://developer.mozilla.org/en-US/docs/Web/CSS/transform

### 2) FFmpeg slideshow rendering patterns (transitions + audio sync)

Key findings:
- `xfade` requires both video inputs to have matching resolution, pixel format, frame rate, and timebase.
- `xfade` transition timing is controlled by `duration` and `offset`.
- `acrossfade` supports sequential multi-input audio crossfades (`n`) and configurable overlap behavior.
- `setpts/asetpts` are the canonical tools to normalize/rebase timestamps.
- `concat` behavior uses longest stream duration per segment and can pad shorter audio; mismatched segment durations can cause stitch desync if unmanaged.

Planning implications:
- Normalize assets before transition graph assembly (`scale/fps/format/timebase/PTS normalization`).
- Derive deterministic timeline math from slide durations and transition durations for both video and narration/music tracks.
- Add validation checks for desync risk (duration mismatch) before dispatching render jobs.

Sources:
- FFmpeg filters docs (`xfade`, `acrossfade`, `setpts`, `concat`): https://patches.ffmpeg.org/ffmpeg-filters.html

### 3) PostgreSQL ordered data + concurrency/versioning

Key findings:
- PostgreSQL supports `DEFERRABLE` constraints for `UNIQUE`/`PRIMARY KEY`/`EXCLUDE`/`REFERENCES`.
- Deferrable constraints cannot be used as `ON CONFLICT` arbiters.
- Locking semantics are explicit; `ACCESS EXCLUSIVE` is the strongest table lock and blocks ordinary `SELECT`.
- `READ COMMITTED` is default and can observe concurrency anomalies for complex update patterns; `SERIALIZABLE` gives strongest guarantees but requires retry handling on serialization failures.

Planning implications:
- For slide and element ordering, model uniqueness with transactional reorder strategy that avoids transient conflicts (or uses deferrable constraints where appropriate).
- Define optimistic version checks for editor saves, plus conflict/retry policy for concurrent mutation hotspots.
- Keep lock scope narrow (row-level where possible) to avoid broad table lock contention.

Sources:
- PostgreSQL `CREATE TABLE`: https://www.postgresql.org/docs/current/sql-createtable.html
- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL `SET CONSTRAINTS`: https://www.postgresql.org/docs/current/sql-set-constraints.html

### 4) Multi-tenant media security (signed URLs, uploads, token handling)

Key findings:
- S3/R2 presigned URLs are bearer-style capabilities; anyone with URL can use it until expiry.
- Expiry and capability are bounded by signer credentials and explicit URL TTL; short TTLs are recommended for sensitive operations.
- Content constraints (e.g., signed `Content-Type`) and CORS can be used to limit abuse for browser uploads.
- Upload hardening should include extension allowlists, content-type skepticism, size limits, generated filenames, and authorization checks.
- JWT `exp` semantics are explicit: token must not be accepted on/after expiration time.

Planning implications:
- Use short-lived, operation-scoped presigned URLs (method + key + content-type constraints).
- Keep server-side enforcement for tenant ownership, permission checks, and post-upload validation.
- Treat share/view tokens as bearer credentials with strict expiration and revocation strategy.

Sources:
- AWS S3 presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- Cloudflare R2 presigned URLs: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- RFC 7519 (JWT): https://www.rfc-editor.org/rfc/rfc7519

### 5) RAG indexing strategy for slide decks

Key findings:
- Embeddings rely on chunk quality and token limits; chunking must respect model input ceilings.
- Structure-aware chunking (headings/semantic paragraphs) improves retrieval relevance compared with naive fixed slicing.
- For multitenant vector storage, namespace-per-tenant patterns improve isolation and reduce broad-filter scanning costs; large metadata filter lists have practical limits.

Planning implications:
- Index slide decks as semantically meaningful chunks (slide title, notes, text elements, optional image-description text) with stable metadata for slide position and deck ID.
- Enforce tenant partitioning explicitly in retrieval index strategy (namespace/scope filtering consistent with app tenant model).
- Add re-index triggers on slide content mutation and maintain deterministic chunk IDs for updates/deletes.

Sources:
- OpenAI key concepts (embeddings/tokens context): https://platform.openai.com/docs/concepts
- Azure AI Search chunking guidance: https://learn.microsoft.com/en-us/azure/search/search-how-to-semantic-chunking
- Pinecone multitenancy guidance: https://docs.pinecone.io/guides/index-data/implement-multitenancy

## Testing

### Existing Test Framework and Conventions
- Runtime stack for impacted code is TypeScript (`apps/web`).
- Test framework is Vitest via `apps/web/package.json` script `test` (`vitest run` with required `JWT_SECRET` test env).
- Backend router/service tests currently live under:
  - `apps/web/server/routers/*.test.ts`
  - `apps/web/server/services/*.test.ts`
  - targeted server integration specs in `apps/web/server/routers/*.integration.test.ts`
- Frontend/component tests follow Vitest + Testing Library patterns under:
  - `apps/web/client/src/components/**/__tests__/*.test.tsx`

### Commands and Execution Notes
- Primary command for feature test development: `cd apps/web && npm test`.
- Coverage command: `cd apps/web && npm run test:coverage`.
- DB integration tests are opt-in and require `RUN_DB_INTEGRATION_TESTS=true` with valid `DATABASE_URL`.

### Planning Implications
- Keep new tests colocated with existing router/service/component suites to preserve team conventions.
- Prefer deterministic unit/contract tests for optimistic conflict and export-contract behavior.
- Add integration scenarios only where cross-module guarantees are required (tenant isolation, conversion lifecycle, export enqueue path).
