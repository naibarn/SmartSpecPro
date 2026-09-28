# Implementation Plan: Voice-Guided Visual Match Preview

## Outcome

Add a production-safe Media Workspace action that turns a real voice track into timed speech segments, analyzes image slides through an authorized vision-skill adapter, proposes semantically aligned image windows, and lets the user preview and confirm the result. High-confidence cases may include an alternate image order; low-confidence cases retain the existing order.

## Boundaries and invariants

- HyperFrames is the only transcription authority for this feature. The selected audio source and its source checksum are recorded.
- A `VoiceTimelineMap` converts source timestamps through clip trim, speed, and timeline offset. Multiple source clips are processed independently and concatenated in project time; unmappable clips block apply.
- A vision analysis request contains only an authorized image representation, asset fingerprint, contract version, and bounded prompt. It returns structured captions, subjects, actions, setting, objects, OCR, keywords, safety, analyzer, and model revision. The server resolves tenant/worker/user scope.
- Matching is deterministic after analysis: Thai/English normalization, lexical/keyword overlap, action/setting/object weights, and an optional semantic score. If semantic scoring is unavailable, lexical confidence is capped and reorder is disabled unless the configured high-confidence floor is still met.
- The original order is always the baseline. Reordering requires a global improvement margin and high confidence for every moved image; duplicate image reuse is forbidden unless explicitly enabled by the project policy.
- A proposal is immutable after preview generation and is identified by a fingerprint of transcript, source map, asset fingerprints, analyses, matcher revision, and policy.
- Apply is guarded by the proposal fingerprint and current project revision. It updates image clips only and stores the previous project snapshot for undo.
- No provider/skill network call occurs during preview confirmation; preview is read-only after analysis.

## Planned files and responsibilities

1. `apps/worker-app/src/screens/media-workspace/voiceGuidedVisualMatch.ts`: pure contracts, timestamp mapping, text normalization, scoring, order decision, duration/window allocation, plan fingerprint, and apply projection. No Tauri, React, or network imports.
2. `apps/worker-app/src/screens/media-workspace/voiceGuidedVisualMatch.test.ts`: deterministic tests for mapping, scoring, high-confidence reorder gate, low-confidence fallback, duration coverage, gaps, and image-only mutation.
3. `apps/worker-app/src-tauri/src/commands.rs` and `src-tauri/src/lib.rs`: add an authenticated vision-skill command that accepts bounded image bytes/data URLs, calls a dedicated server worker route with device proof, and returns structured analysis. Reject unsupported MIME/size and never expose credentials to the webview.
4. `apps/web/server/routes/workerSeriesControlPlane.ts`: add a worker-scoped vision analysis route. Validate body size/schema, worker/tenant scope, image type/size, and a fixed skill contract. Resolve the image through the existing server vision helper/skill prompt; return structured JSON only with analyzer/model revision and safe error codes. Do not accept arbitrary skill IDs, local paths, or client tenant IDs.
5. `apps/web/server/routers/skills.ts` or a small adjacent service: export/reuse the existing tenant-scoped vision call only through the new fixed-purpose adapter. Keep billing/skill authorization explicit and bounded; do not expose the general public skill endpoint to raw Worker payloads.
6. `apps/worker-app/src/screens/media-workspace/VoiceGuidedVisualMatchModal.tsx`: analyze/preview UI with loading/error/empty states, before/after order, sentence windows, confidence/reason labels, and Apply original timing/Apply reordered/Cancel/Undo controls. Use existing locale hook and modal primitives.
7. `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx`: wire action into the workspace and apply callback. Preserve the existing subtitle action and image editing behavior.
8. `apps/worker-app/src/types/nleProject.ts`: add additive metadata types for the plan fingerprint, matcher/analysis revisions, source map, and undo snapshot reference. Existing projects remain readable.
9. Locale files: add Thai and English strings for action, preview, confidence, fallback, errors, and confirmation.
10. Worker App package/release metadata: increment patch version only after focused tests and typecheck pass; use the existing release script and copy the installer to the established public release paths.

## Server adapter contract

`POST /api/workers/:workerId/media-workspace/visual-match/analyze-image` (name may follow existing route naming) accepts `{ contractVersion, imageDataUrl, assetFingerprint, analysisPromptVersion }`. It requires the connected worker's media-processing scope and device proof, limits one image per request, rejects data URLs over the configured byte cap, and derives tenant/user from the authenticated worker. It invokes a fixed image-description skill prompt and returns `{ contractVersion, assetFingerprint, analyzer, modelRevision, caption, subjects, actions, setting, objects, ocrText, keywords, safety, confidence }`. The response contains no raw provider response, credentials, or signed URL. Same fingerprint plus analyzer revision may be cached; cache invalidation is explicit.

## UI/UX contract

- Target user: video editor with a voice track and slide images.
- Entry point: Media Workspace toolbar/action menu, labelled in Thai and English.
- States: idle, collecting inputs, transcribing, analyzing images (with progress), building preview, ready, low-confidence fallback, applying, applied, error.
- Preview shows voice sentence start/end, transcript text, selected image thumbnail/name, confidence, matched terms/reason, and a before/after order strip. It clearly labels when original order was retained.
- Primary actions: `Apply original timing`, `Apply reordered plan` (disabled unless eligible), `Cancel`; after apply, `Undo visual match` restores the exact prior project snapshot.
- Accessibility: keyboard reachable action and buttons, focus trapping in modal, status/live region for progress and errors, explicit labels for confidence and reason.
- Responsive: usable at 390x844, 768x1024, and 1440x900 without horizontal overflow; preview list scrolls inside the modal.

## Rollout and safety

Ship behind a Worker App feature flag/default-disabled if the server adapter is unavailable. Preview may be generated with original-order timing even when reorder is disabled. If HyperFrames lacks word timings, sentence timings remain valid and UI says sentence-level matching. If any image analysis fails, preserve original order and mark that image manual review; do not silently invent a caption. Existing projects and manual editing continue unchanged.

## Verification

Run pure Vitest tests, Worker App TypeScript typecheck, web route/service tests, Rust cargo tests for the new command, and a Tauri build/typecheck. Verify static invariants: no direct provider call from React, no raw local path in server payload, no voice/subtitle clip mutation in apply projection, and no reorder without high-confidence gate. Build and package the next Worker App installer using existing scripts; copy to both public release locations and report artifact hash/size plus platform limitations.
