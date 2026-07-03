# Synthesized Spec: Feature 131 Vertical Drama Series Storyboard Video Flow

Date: 2026-07-03
Mode: self_review
Source files:

- `spec.md`
- `claude-research.md`
- `claude-interview.md`

## Objective

Build a production-grade Dashboard workflow for creating long-running 9:16 vertical drama series, inspired by Chinese-style short vertical drama. A user can create a series project, maintain a durable series bible and character stock, generate episode plans over 10-100 episodes, create 3x3 contact-sheet start-frame candidates, select the best frames, generate provider-ready motion prompts, and create a Storyboard Review project for each episode.

## Primary User Value

Users get a dedicated vertical-drama production workspace instead of repeatedly using a one-shot article/video builder. The workspace remembers characters, plot arcs, unresolved hooks, product tie-in history, and prior episode summaries so future episodes remain coherent.

## External Guide Parity

The implementation must adapt `naibarn/vertical-drama-video-flow` at commit `e2dbef07d07447489d041112d862d994adeac5d4`.

Required guide concepts:

- imported character visual bible skill;
- imported storyboard shotgrid skill;
- imported shot start-frame render skill;
- imported video motion prompt pack skill;
- equivalent dry-run/run/repair/assemble development paths;
- guide manifest/config parity terms and schema vocabulary;
- provider capability gates for first/last-frame bridge;
- approval checkpoints, QC reports, repair queues, assembly manifests, and run artifacts.

SmartSpecPro must adapt these concepts into the existing web app architecture rather than copying the standalone Python CLI layout.

## In Scope

- New Dashboard entry and routes for Vertical Drama Series.
- Feature flags defaulted off.
- Eight skill packages under `apps/web/skills`.
- Shared TypeScript contracts for series, episodes, memory, artifacts, contact sheets, provider routing, audio/dialogue/subtitles, product tie-in, Storyboard Review handoff, and assembly.
- Drizzle-backed durable tables for series, episodes, runs, approvals, append-only memory events, compact memory snapshots, character assets, run artifacts, and QC reports.
- Tenant-owned media asset linkage through existing `mediaAssets`.
- Episode pipeline with dry-run, approval, repair, and full execution modes.
- 9-shot default vertical storyboard profile and 8 first/last-frame bridge clip profile when provider capabilities allow it, preserving the GitHub default `8 + 8 + 8 + 8 + 8 + 8 + 8 + 4 = 60` second timing.
- `contact_sheet_3x3_batch` start-frame mode with multiple concurrent sheet jobs, crop metadata, candidate-frame selection, and prompt visibility.
- Image model selection through registry, defaulting to `google-banana-2-lite`.
- Video model selection through registry and aliases, including Veo 3.1 Lite/Quality/Fast, Gemini Omni/Omni Flash, Grok Imagine variants, Seedance variants, and future compatible models.
- Storyboard Review handoff with reviewable prompts, models, provider payload previews, start/stop frames, audio/subtitle metadata, product tie-in, continuity warnings, and idempotency.
- Dialogue, voice continuity, subtitle, native audio, separate TTS, and final assembly metadata.
- Product tie-in planner that avoids unsupported claims and repetitive placements.
- Final assembly artifact ledger and export-ready manifest.

## Out Of Scope For This Deep-Plan

- Running provider jobs against paid external APIs.
- Generating actual video/image/audio assets.
- Shipping visual polish beyond planning the UI/UX contract.
- Implementing deep-implement changes in this turn.

## Product Decisions

- First screen must be the workspace, not a landing page.
- Existing Article Video Builder behavior must remain unchanged.
- Paid generation must remain explicit and gated.
- Character reference stock is durable per series.
- Long-series memory must support 10, 20, 30, and up to 100 episodes.
- Product tie-ins are optional, auditable, removable, and cannot unrealistically solve the main conflict.
- Contact-sheet mode is the default start-frame generation path because it is cheaper and faster to review.
- User must see every image prompt, per-cell prompt, negative prompt, video prompt, selected model, credit estimate, selected candidate frame, and provider payload preview before paid generation.

## Key Technical Constraints

- Feature flags must fail closed.
- Canonical source-spec feature flags must be preserved or local aliases must map to them through one tested adapter.
- Series state must not live only in Storyboard Review metadata.
- `mediaAssets` remains the durable media registry.
- Storyboard Review `task.prompt` must contain only video-generation prompt text.
- Raw upstream GitHub artifact JSON must preserve snake_case fields and unknown provider fields.
- App-safe equivalents for `vdflow validate`, `vdflow run`, `vdflow render-images`, `vdflow render-video`, `vdflow assemble`, and `vdflow repair` must be available through tests, services, routes, or admin-safe flows.
- Approval checkpoints are immutable; repairs create new artifacts and supersede prior candidates without overwriting the audit chain.
- Provider jobs must expose create, poll, webhook, download/import, cancel, retry, stale, and repair states.
- No secrets, provider bearer tokens, signed upload URLs, or webhook secrets may be stored in run artifacts or browser-visible JSON.
- OpenAI Sora/OpenAI Videos must not become silent first/last-frame human-face bridge providers without a future provider audit.

## Acceptance Summary

The feature is ready for implementation when the plan defines:

- all tables/contracts/services/routes/UI surfaces;
- all eight skill packages and parity tests;
- artifact ledger and memory update rules;
- contact-sheet batch generation and candidate selection;
- registry-backed image/video model routing;
- Storyboard Review handoff mapping and idempotency;
- audio/dialogue/subtitle/tie-in/QC/repair behavior;
- final assembly/export artifacts;
- focused tests and verification commands per implementation section.
