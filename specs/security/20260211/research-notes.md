# Claude Research - Security Hardening (2026-02-11)

## Research Decision
- Codebase research: **Yes**
- Web research: **No** (not required for this hardening scope)
- Testing coverage analysis: **Yes**

## Scope Confirmed
- Target surfaces: Library, Document Management, Media Studio add-to-library, Admin/Ops paths.
- Must preserve existing behavior:
  - External `https://` image URLs continue to render in preview/editor/gallery flows.
  - Markdown image links from external hosts continue to work.

## Codebase Findings

### 1) Active-content uploads can be served from same origin
- Upload allowlist still includes active-content extensions and broad text mime handling:
  - `apps/web/server/services/libraryService.ts:267`
  - `apps/web/server/services/libraryService.ts:272`
  - `apps/web/server/services/libraryService.ts:276`
- Uploaded files are written into local uploads and exposed under `/uploads/...`:
  - `apps/web/server/storage.ts:50`
  - `apps/web/server/storage.ts:67`
  - `apps/web/server/_core/index.ts:180`
- Risk: uploaded HTML/SVG can execute in app origin context if opened/embedded.

### 2) `sourceUrl` / `thumbnailUrl` are weakly validated
- API layer accepts these as plain strings (length only):
  - `apps/web/server/routers/library.ts:300`
  - `apps/web/server/routers/library.ts:366`
- Service layer persists values as-is:
  - `apps/web/server/services/libraryService.ts:664`
  - `apps/web/server/services/libraryService.ts:827`
- Frontend renders these into `href/src/iframe` contexts in preview panel:
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx:111`
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx:296`
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx:315`
- Risk: unsafe schemes, hostile redirect URLs, and malformed URL payloads reaching browser sinks.

### 3) Library allowlist bypass when tenant context missing
- Current behavior allows access when allowlist exists but tenant is absent:
  - `apps/web/server/services/libraryFeatureFlags.ts:42`
- Risk: misconfigured/missing tenant context can unintentionally enable feature.

### 4) Library ops endpoints/services are not tenant-scoped end-to-end
- Router resolves tenant id but summary/retry/reprocess operations are invoked without tenant filter arguments:
  - `apps/web/server/routers/libraryOps.ts:27`
  - `apps/web/server/routers/libraryOps.ts:47`
  - `apps/web/server/routers/libraryOps.ts:85`
- Service queries/updates operate globally (no tenant predicate):
  - `apps/web/server/services/libraryOpsService.ts:39`
  - `apps/web/server/services/libraryOpsService.ts:120`
  - `apps/web/server/services/libraryOpsService.ts:164`
  - `apps/web/server/services/libraryOpsService.ts:179`
- Schema supports tenant scoping for index jobs (`library_index_jobs.tenant_id`) but callback tables currently do not:
  - `apps/web/drizzle/schema.ts:1507`
  - `apps/web/drizzle/schema.ts:1349`
  - `apps/web/drizzle/schema.ts:1377`

### 5) Office preview host checks are incomplete
- Office embed decision only blocks a narrow host subset:
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx:128`
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx:136`
- Private IPv4 ranges beyond localhost-form checks are not blocked before sending URL to external viewer.
- Risk: metadata leakage / undesired internal URL forwarding.

### 6) External image proxy exists and is useful, but can be hardened further
- Endpoint already blocks private/local hosts and non-image content types:
  - `apps/web/server/_core/index.ts:193`
  - `apps/web/server/_core/index.ts:210`
  - `apps/web/server/_core/index.ts:221`
- Gaps: no explicit fetch timeout/content-length guard and no post-redirect host re-check.

## Current Testing Coverage

### Existing tests that help
- Tenant-context requirements for library/media add-to-library:
  - `apps/web/server/routers/library.test.ts`
  - `apps/web/server/routers/media.addToLibrary.test.ts`
- Basic ACL/idempotency coverage in service layer:
  - `apps/web/server/services/libraryService.test.ts`
- Core DLQ reprocess behavior unit tests:
  - `apps/web/server/services/libraryOpsService.test.ts`

### High-priority testing gaps
1. No server-side URL policy tests for `sourceUrl` / `thumbnailUrl` allow/deny matrix.
2. No regression tests proving external `https://` image preview remains functional after hardening.
3. No tests for active-content upload controls (HTML/SVG force-download or isolation).
4. No tenant-scoping tests for `libraryOps` summary/retry/reprocess behavior.
5. No unit tests for office-preview host classification (private ranges, localhost variants).
6. No proxy-hardening tests for redirect handling, timeouts, and maximum payload size.

## Constraints for Implementation Plan
- Keep external image usage working for:
  - Document preview
  - Markdown editor insertion/render
  - Library search/gallery thumbnails
- Deny unsafe URL schemes and active-content execution paths.
- Tighten tenant safety without breaking same-tenant admin workflows.
- Add security regression tests that include both positive and negative cases.
