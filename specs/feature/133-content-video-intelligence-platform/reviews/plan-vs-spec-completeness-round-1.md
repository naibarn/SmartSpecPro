# Plan vs Spec Completeness Review — Round 1

Compared `claude-plan.md` + the 8 section files against `spec.md`, scoped to
spec §22 Phase 1 (MVP). The plan covers the Phase-1 deliverables well; four gaps
found (1 mandatory, 1 MVP-completeness, 2 minor hardening). All fixed.

## Coverage confirmed (spec → plan)

| Spec (Phase-1 relevant) | Covered in |
|---|---|
| §5 Neutral schema + compiler + audio layer | section-01 |
| §6 render contract (schema, gating, enums, fixtures) | section-03 (+04 exec) |
| §7 Motion Template Registry (2D) + cost model | section-02 |
| §8.2/8.4/8.6 Catalog + Motion studios, Guided mode, preview | section-08 |
| §10 Brand Kit + locks | section-05 (persist) + section-01 (lock enforce) |
| §11 Claim registry/validation | section-06 + section-07 (resolve) |
| §12 QA loop (single round) | section-06 |
| §14.1/14.2 DB tables | section-05 |
| §15 tRPC router + async queue | section-07 |
| §16 UI (routes, pages, a11y alert, i18n, sidebar) | section-08 |
| §17 security (tenant iso, SVG, SSRF, no-secrets) | all sections |
| §18.2 preview downscale + 1-preview cap | section-04 + section-07 |
| §18.4 credits (render + TTS) | section-04 + section-07 |
| §20 VI_* error codes | sections 01/04/07 |
| §21 feature flags | section-04 (create) + section-08 (complete) |
| §23 testing tiers + E2E | all + section-08 (Playwright) |

## Gaps found & fixed

1. **[MANDATORY] Observability / audit logging (§19) was unowned.** `traceId`
   existed only as a payload field; no section wired the audit-JSONL events the
   repo's LLM & Media Debugging Protocol (CLAUDE.md) requires. Without this, a
   failed render can't be traced end-to-end.
   → Fix: added a plan **§9.4 Observability** and wired concrete requirements
   into section-04 (worker emits `remotion_render.{queued,started,post_pass,
   completed,failed}` to `logs/audit/` JSONL mirrored with `worker_job_events`,
   sharing the payload `traceId`) and section-07 (stage runners emit
   `video_project_stage`; TTS emits `media_request`/`media_response`; the
   `traceId` is minted at project-stage/queue entry and threaded through).

2. **[MVP completeness] Caption cues never generated from narration.**
   `captionCues` were consumed (compiler → text layers; `exportCaptions`) but
   nothing populated them, so a narrated Catalog video would ship caption-less
   unless hand-authored — a weak MVP for a "video intelligence" platform.
   → Fix: `runNarrationStage` (section-07) deterministically derives
   `scene.captionCues` from the narration text (chunked and timed proportionally
   across the scene's `[startMs,endMs]`) alongside the TTS audio. Transcription-
   based (Whisper) refinement of cue timing is explicitly deferred to Phase 2.

3. **[minor] §18.6 "1 Remotion render per worker process" not stated.**
   → Fix: added to section-04 Lane-A executor (Chromium memory; serialize
   in-process renders).

4. **[minor] §18.5 render-submission (≤6/min) + CRUD (≤60/min) limits were
   UI-only / generation-only.** Server-side render + CRUD limits were implied but
   not assigned.
   → Fix: section-04 enforces ≤6 render-submissions/min in the queue function;
   section-07 enforces ≤60 CRUD/min on the router (both via the existing
   Bottleneck/BullMQ limiter, admin ×5).

## Not gaps (correctly deferred, verified against §22)

- Media Intelligence / `media_clip_index` / semantic search — Phase 4.
- scene3d templates, pre-render cache (`renderHash`), `VI_COST_BUDGET_EXCEEDED`
  enforcement — Phase 5 (cost model exists in Phase 1 as informational only).
- Auto mode, multi-round auto-improve, campaign variants — Phase 3.
- Worker App fleet (Lane B) Rust dispatch + runtime pack, Expert Video Editor
  bridge, VD export adapter — Phase 6.
- Rust golden-fixture parse test — Phase 6 (the JSON anchor ships in Phase 1).

Performance p95 targets (§18.1) are acceptance/NFR criteria, not implementation
steps; referenced from the plan's §13 risks and left as verification targets
rather than duplicated into every section.
