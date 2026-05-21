# Claude Interview - Feature 115 Extension Local AI Analysis Layer

Date: 2026-05-21
Mode: self_review
Interview style: Auto-interview from user instruction and specification because the user explicitly requested completion without further confirmation.

## Resolved Questions

### 1. Should Prompt API be required for capture?

No. Existing Shopee/TikTok Shop capture must continue unchanged when Prompt API is missing, unsupported, downloading, disabled by flag, or failing.

### 2. Should unsupported machines receive a complete journey?

Yes. Unsupported machines use server AI fallback when enabled, otherwise raw-capture-only behavior. The UI must explain the provider path and still allow capture, preview, and sync of allowed data.

### 3. Should the feature prioritize popup or side panel?

Side panel for v1 analysis/review because the journey needs capability status, download progress, cancellation, insight preview, evidence references, claim review, and send actions. Popup remains an entry point and compact status/action surface.

### 4. Should Feature 115 connect directly to the upcoming storytelling system in Feature 114?

Yes. The plan must produce a typed `MarketplaceStorytellingHandoff` that Feature 114 can import without free-form parsing.

### 5. Should the storytelling bridge immediately generate video?

No. Feature 115 creates structured briefs and readiness metadata. Feature 114 / AI Video Studio should require user confirmation before project creation or rendering.

### 6. Should raw page data be synced by default?

No. Default sync sends structured insight only. Raw capture text, reviews, comments, and debug model output require explicit user/developer settings.

### 7. Should Thai output be guaranteed?

No. Thai is best-effort for local Prompt API. The system validates structure, evidence, and safety, then offers server review/fallback when local language quality is insufficient.

### 8. Should prompts be remote-configurable?

No. Prompts must come from local templates. Remote config can enable/disable features, provider choices, limits, and rollout percentages, but not arbitrary prompt text.

### 9. Should insight storage be dedicated?

Preferred yes. A dedicated insight record supports lifecycle status, idempotency, parent insight links, claim review, readiness gates, and Feature 114 queries. Versioned JSON on existing capture/product records is only a fallback behind a migration decision gate.

### 10. What is the minimum complete customer journey?

Capture page, sanitize data, select provider, analyze or fallback, validate output, preview evidence-linked insight, resolve claims if needed, sync structured insight, import storytelling handoff, then either open Gemini Omni Storytelling or route to review based on readiness.

## Auto-Decisions

- Use `tiktok_shop` for persisted TikTok commerce insight contracts where repo contracts require it.
- Use Zod or the repo's existing schema validation pattern for all AI outputs and sync payloads.
- Use existing marketplace capture auth/origin controls for insight sync.
- Use provider priority: local Prompt API, server AI fallback, noop/raw capture.
- Use a cache key of platform, URL, normalized payload hash, analysis type, schema version, provider, and parent insight IDs.
- Treat claim provenance as first-class data, not UI-only annotations.
- Block direct storytelling generation when required product truth, customer journey stage, image fidelity, or claim confidence is missing.
- Do not add broad host permissions or arbitrary tab access unless a specific implementation test proves it is required.

## Non-Blocking Assumptions

- Exact database migration shape can be finalized during implementation after inspecting the current ORM schema.
- Exact side panel component names can follow current extension conventions.
- Exact Feature 114 import route can be adapted to the route names present during implementation.
- Product/image readiness scoring can start rule-based and become model-assisted later.
