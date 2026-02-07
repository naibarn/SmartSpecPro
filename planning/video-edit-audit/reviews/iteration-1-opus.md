# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-02-06T15:30:00Z

---

# Implementation Plan Review: Media Job System & Video Editor v0.1

## Overall Assessment

The plan is well-structured and addresses real problems. The architecture of a platform-agnostic Media Job Spec contract is sound, and the phase ordering by dependency is logical. However, there are several significant issues that need to be addressed before implementation begins. The plan is simultaneously overambitious in scope and underspecified in critical implementation details.

---

## 1. Critical Architecture Issues

### 1.1 Type Placement in Client Code

The plan places the shared Job Spec types in `apps/web/client/src/types/mediaJob.ts`. This is wrong. The same types are needed by:
- The Node.js API server (`apps/web/server/routers/mediaJobs.ts` in Phase 4)
- Potentially the Python backend (for JSON schema validation)
- The Tauri shell (for Rust serde deserialization)

Types should live in `packages/shared/` or `apps/web/shared/` to be importable from both `client/` and `server/` via the existing `@shared/` path alias.

### 1.2 Node.js to Celery Communication Without Existing Infrastructure

Reading Celery's internal Redis keys directly (`celery-task-meta-{taskId}`) is coupling to an implementation detail. A better approach: have the Python Celery worker write status updates to a well-defined Redis key structure that Node.js owns (e.g., `media-job:{jobId}:status`), or use an explicit HTTP callback.

### 1.3 No Authentication or Authorization on Media Job Endpoints

The plan defines endpoints without specifying authentication. Every media job endpoint should use `protectedProcedure`, enforce per-user job isolation, and consider credit deduction.

### 1.4 File Upload Security on Web

No detail on file size limits, content type validation (magic bytes), storage location, cleanup, or pre-signed URL workflow. Should reference existing upload patterns in the codebase.

---

## 2. Significant Edge Cases

### 2.1 Time Unit Migration Breaks Existing Project Files

Use the `version` field to distinguish seconds-based (v1.0) from ms-based (v2.0) projects instead of numeric heuristics.

### 2.2 Render Engine Process Tracking Bug

The spawned FFmpeg child is never inserted into the `processes` HashMap, so `cancel_render` can never find the process to kill it.

### 2.3 `build_filter_complex` Ignores Audio-Only Assets

The algorithm always expects video+audio pairs. Must handle video-only, audio-only, and mixed scenarios.

### 2.4 `sanitize_path` Rejects Subtitle and Image Extensions

Only allows mp4/mov/avi/mkv/mp3/wav/aac. Must extend for .srt, .vtt, .jpg, .png, .webp.

### 2.5 `overlay` Track Type Inconsistency

TypeScript supports `overlay` track type but Rust and validation reject it. Document as conscious decision.

---

## 3. Missing Considerations

- No disk space management strategy
- No error recovery for long-running jobs
- No CORS configuration for SSE
- Ambiguous tRPC vs Express decision for SSE routes (should use Express for SSE, tRPC for CRUD)
- Celery task auto-discovery path does not include `app.workers`
- No audit logging integration (mandatory per CLAUDE.md)
- FFmpeg binary size (320-400MB) cannot go in git directly - must specify git-lfs or build-time download
- No database schema decision for persistent job tracking

---

## 4. Security Vulnerabilities

- SSRF in asset URI resolution (URL redirects can bypass IP validation)
- No rate limiting on job submission for web backend
- Temp file path security concerns

---

## 5. Performance Concerns

- Polling Celery state every 500ms is wasteful at scale; consider Redis pub/sub
- Full project snapshot in undo history is memory-wasteful
- No resumable upload support for large files

---

## 6. Plan Structure Issues

- Phase dependencies need a DAG
- Phase 5.6 (Web UI) is too large; should be its own phase
- TDD plan is test stubs, not actual TDD

---

## 7. Code-Level Concerns

- Remove `@ts-nocheck` from videoEditorService.ts during refactor
- Eliminate duplicate type definitions (MediaLibraryAsset, RenderJob)
- Fix validation field name mismatch (sample_rate vs sampleRate)

---

## 8. Recommendations

1. Move shared types to `apps/web/shared/types/mediaJob.ts`
2. Define Redis key schema for Node.js-Celery communication
3. Add auth/authz to every endpoint
4. Split Phase 5.6 into its own phase
5. Version the project format (v1.0=seconds, v2.0=ms)
6. Audit Phase0-3 components now to determine consolidation scope
7. Add dependency DAG
8. Define disk space and file size limits
9. Integrate with audit logging
10. Fix Celery auto-discovery path
11. Fix process-tracking bug in render.rs
12. Handle audio-only and video-only assets in filter_complex
