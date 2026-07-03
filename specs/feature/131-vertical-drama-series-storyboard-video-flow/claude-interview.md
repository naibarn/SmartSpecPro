# Interview Transcript: Feature 131 Vertical Drama Series Storyboard Video Flow

Date: 2026-07-03
Mode: self_review

## Interview Outcome

No blocking stakeholder questions remain. The source spec already settles the product direction, target workflow, model requirements, GitHub guide parity, contact-sheet behavior, Storyboard Review handoff, production-grade persistence, and tie-in product requirements.

## Auto-Decisions

### A1. Planning Scope

Proceed with a full deep-plan for Feature 131 using `spec.md` as the canonical input. Existing short section files are treated as planning notes and will be rewritten into deep-plan-compatible sections with `PROJECT_CONFIG` and `SECTION_MANIFEST`.

### A2. Implementation Boundary

This deep-plan produces implementation-ready planning artifacts only. It does not run deep-implement in this turn because the user explicitly asked to do deep-plan next.

### A3. Architecture Direction

Use first-class Vertical Drama tables for series/episode/run memory and artifact state, while using existing Storyboard Review persistence for review workspaces and existing `mediaAssets` for durable media records.

### A4. Model Routing

Resolve image and video models through existing model registry/provider config. Keep `google-banana-2-lite` as the workflow default image model but never hard-code the available model list.

### A5. Storyboard Review Handoff

Follow Feature 127's handoff pattern: `task.prompt` is video-only; image prompts, contact-sheet prompts, candidate lineage, selected frames, model choices, provider payload previews, audio/subtitle metadata, and continuity metadata are visible through review metadata panels.

### A6. Rollout

Default to disabled feature flags, dry-run/plan-only flows, explicit approval gates, and paid-generation blocking until prompts, models, credits, and provider payloads are visible.

### A7. Testing

Use Vitest for TypeScript shared/service/router/UI behavior and `pnpm check` for type checking. Use pytest only if provider behavior is modified in `python-backend`.

