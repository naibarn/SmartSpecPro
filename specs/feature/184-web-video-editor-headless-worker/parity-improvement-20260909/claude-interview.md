# Planning interview transcript — 2026-09-09

The request supplies all 18 capability areas and asks for a detailed solution
plan. No blocking clarification was required for the planning artifact; the
following defaults are recorded so an implementer does not have to guess.

| Topic | Decision used in the plan | Reason/trade-off |
|---|---|---|
| Bin default | Open the editor on **Bin / สื่อในโปรเจกต์** | Directly addresses the reported empty-Bin workflow; Library and Media History remain one click away. |
| Upload sizes | Single PUT for small files, resumable multipart for large files, aggregate selection with bounded concurrency | Keeps small uploads simple and makes large video retryable without buffering it through the app server. |
| Canonical storage | Existing tenant-scoped `media_assets`/R2 proxy and `worker_jobs` | Avoids a second asset registry and preserves Worker ownership checks. |
| Keyframe semantics | Transform is the evaluated visual state; Keyframes are time-stamped control points; both support video and still-image clips | Makes the two concepts explainable and maps cleanly to preview interpolation and render plans. |
| Heavy processing | Web previews and review; Worker handles analysis, render, proxy, GPU, MP3 and frame capture when needed | Prevents blocking the browser while preserving immediate authoring feedback. |
| Silence workflow | Analyze → review segments → approve edit map → apply/undo → render | Prevents destructive automatic cuts and matches the Worker App's review-first behavior. |
| Render modes | Auto chooses the best advertised capability; Manual exposes Remotion/FFmpeg; GPU is shown only when advertised | Makes the button truthful and allows a safe CPU fallback. |
| Microphone | Browser `getUserMedia` + `MediaRecorder`, device picker, permission/error states, managed upload | Works with every browser-visible microphone without exposing OS paths; requires HTTPS and permission. |
| AI music/speaker/subtitle | Server/Worker job with credit estimate, consent, idempotency, reviewable artifact | Avoids provider calls in the browser and prevents unreviewed AI output from mutating the timeline. |
| Subtitle export | Export validated SRT/VTT as a managed artifact or deliberate local download, with encoding/timebase and filename checks | Closes the Worker App subtitle create/import/export path without overwriting newer cues. |
| Blur tracking | Manual region first; optional Worker face/object track; fail closed for required privacy blur | Protects privacy when analysis is unavailable and keeps the result auditable. |
| AI overlay code | Declarative validated manifest in a sandbox, preview before approval, Remotion render after approval | Safer and more reproducible than executing arbitrary generated React/Three.js code. |
| Worker control parity | Compound/decompose, Ken Burns, CapCut draft, Project settings, AI Media Studio, portable project JSON and track controls get explicit Web owners; local folder/Explorer actions become managed upload/download replacements | Prevents screenshot-level parity from hiding unowned controls or unsafe local-path behavior. |
| Envelope and tenancy | Internal revision-pinned envelope carries typed options/requester/idempotency; old `MediaJobEnvelope` remains a lossless wire adapter; tenant is verified with revision/link ownership in one transaction | Avoids breaking current Workers while making admission, callback auth and cross-tenant isolation explicit. |
| Preview | Fit/frame mode, guides, and a render-faithful mode with visible quality/performance state | Lets creators inspect framing without accidentally baking guides into output. |
| Compatibility | `/render-jobs` remains redirect only; product label is Worker Jobs / คิวงาน Worker | Preserves old bookmarks while matching the actual queue scope. |
| Verification | Focused Vitest/jsdom, Rust tests, esbuild/build, then authenticated browser/Worker/R2 gates; skip typecheck in this wave | Follows the user's memory constraint and keeps environment proof distinct from source proof. |

## Out-of-band gates to resolve during implementation

- Confirm production R2 binding supports the new multipart API and configure
  lifecycle cleanup for abandoned uploads.
- Confirm which Worker hosts advertise Remotion, FFmpeg, GPU, vision/face/object,
  audio-analysis and speaker capabilities.
- Confirm provider/credit policy and user-facing consent copy for AI Music,
  speaker analysis and code-overlay generation.
- Confirm browser support matrix for MediaRecorder MIME types and minimum HTTPS
  deployment requirements.
