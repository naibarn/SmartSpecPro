# Section 02 — Server Vision Adapter

Add a fixed worker-scoped image-analysis endpoint under `workerSeriesControlPlane.ts`. Reuse worker auth, require the narrow Media Workspace scope, verify path worker ID, and derive tenant/user from the authenticated worker. Never accept tenant IDs, user IDs, arbitrary skill IDs, local paths, or provider settings in the body.

Validate contract, asset fingerprint, prompt revision, MIME (`png`, `jpeg`, `webp`), and decoded byte limit. Use an existing tenant-scoped vision helper behind a dedicated service function. The fixed prompt returns JSON fields for caption, subjects, actions, setting, objects, OCR, keywords, safety, and confidence. Validate and bound every field, attach analyzer/model revision, redact provider errors, and avoid logging data URLs/raw provider output.

Add route tests for auth, scope, size/MIME/schema errors, structured success, provider failure redaction, and fingerprint convergence.
