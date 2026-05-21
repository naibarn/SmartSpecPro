# Claude Plan - Feature 115 Extension Local AI Analysis Layer

Date: 2026-05-21
Mode: self_review
Source files:

- `spec.md`
- `request.md`
- `claude-research.md`
- `claude-interview.md`
- `sections/index.md`

## Objective

Implement an optional local AI analysis layer for the SmartSpecPro Chrome extension using Chrome Prompt API / Gemini Nano where available, while preserving existing Shopee and TikTok Shop capture behavior on all machines. The feature must produce validated, evidence-linked marketplace insights and a typed storytelling handoff for Feature 114.

## Delivery Principles

- Additive only: no existing capture, upload, or server analysis path should depend on Prompt API.
- Runtime-first support: detect `LanguageModel` and requested modality/language capability at runtime.
- User-triggered local AI: detection may happen passively, but model download/session creation requires user action.
- Structured by default: AI output must validate before preview, cache, sync, or handoff.
- Evidence-backed storytelling: Product truth, claim provenance, image fidelity, and customer journey readiness decide whether Feature 114 can proceed.
- Privacy by default: no full HTML, tokens, cookies, hidden inputs, private account/order/chat data, or raw prompts in sync or telemetry.

## Implementation Sequence

### Phase 0 - Pre-Implementation Spikes

Resolve implementation unknowns before changing shared contracts or UI.

Tasks:

- Confirm Prompt API execution support in extension contexts: side panel, popup, service worker, offscreen document, and content script.
- Inspect current extension file layout and choose exact file ownership for capability detection, provider orchestration, local cache, and side panel components.
- Inspect current web/API persistence layer and decide dedicated insight table versus versioned JSON with migration gate.
- Confirm current Feature 114 import/read surfaces and route names for storytelling handoff consumption.
- Confirm the existing package manager scripts for extension typecheck/build and web test/check commands.

Acceptance:

- One implementation note records selected Prompt API execution context and fallback context.
- Storage decision is explicit before adding sync/read routes.
- Feature 114 handoff target route/component is named before coding the bridge.

### Phase 1 - Contracts, Schemas, And Sanitizer

Owns the shared data model used by extension, web, API, and Feature 114.

Tasks:

- Add local AI capability and provider decision contracts.
- Add sanitized marketplace capture and evidence contracts.
- Add insight output contracts for product brief, review insight, TikTok Shop trend brief, video brief, combined opportunity, and storytelling handoff.
- Add insight lifecycle contracts for status, claim resolution, parent insight IDs, payload hash, schema version, readiness state, and raw capture inclusion flags.
- Implement sanitizer limits for title, description, reviews, comments, evidence count, and total prompt payload size.
- Remove or redact hidden fields, HTML, cookies, tokens, private account data, payment/order/chat data, and unrelated PII before prompt or sync.
- Add schema migration/backward-compatibility rules for persisted insight records.
- Add stale-state markers when source capture, user edits, claim resolution, schema version, or selected images change after an insight was generated.

Acceptance:

- Existing capture payloads can be converted into sanitized prompt inputs.
- Invalid or oversized data is trimmed deterministically.
- Contracts compile across extension/web shared boundaries.
- Older insight versions can be rejected, migrated, or shown read-only according to a documented rule.

### Phase 2 - Capability Detection, Provider Decision, And Extension UX

Owns Prompt API optionality and the complete supported/unsupported machine journey.

Tasks:

- Add `detectChromePromptAPI()` using `globalThis.LanguageModel` and `LanguageModel.availability()` with the same expected options used for session creation.
- Model support states: `not_exposed`, `unavailable`, `downloadable`, `downloading`, `available`, `error`.
- Add provider decision: `chrome_prompt_api`, `server_ai`, `noop`.
- Add user-triggered `LanguageModel.create()` with download monitor, progress state, and `AbortController` cancellation.
- Implement side panel local AI status, action panel, preview shell, fallback explanation, and raw-capture-only messaging.
- Keep popup as launcher/status surface if current extension architecture already uses a popup.
- Preserve current detect/scan/upload/analyze flows and labels.
- Add a single state machine for capture and analysis UI: `idle`, `capturing`, `capture_ready`, `detecting_ai`, `download_required`, `downloading`, `analyzing_local`, `analyzing_server`, `insight_ready`, `needs_review`, `syncing`, `synced`, `failed`, and `cancelled`.
- Persist user preferences for local AI, structured-only sync, raw capture inclusion, reviews/comments inclusion, and debug output.

Acceptance:

- Extension loads and captures normally when `LanguageModel` is undefined.
- Download never starts on passive panel load.
- User can cancel download/analysis without losing the capture.
- Every support state has clear UI and provider fallback behavior.
- UI state transitions are deterministic and testable from capture through sync.

### Phase 3 - Prompts, Validation, Repair, Cache

Owns local generation quality and local persistence.

Tasks:

- Build local prompt templates from code only; do not execute remote prompt text.
- Prompt templates must include task, target schema, language preference, sanitized evidence, no-fabrication rule, evidence ID rule, and JSON-only instruction.
- Add strict validators for every AI output and storytelling handoff.
- Enforce unknown top-level field rejection or cleanup according to schema policy.
- Enforce confidence range, max string/array lengths, evidence IDs, scene timing, supported claim status, and source capture IDs.
- Add one local repair attempt for malformed JSON when Prompt API is available.
- Add fallback to server AI repair/generation when enabled.
- Add local cache keyed by platform, URL, normalized payload hash, analysis type, schema version, provider, and parent insight IDs.
- Add re-analysis rules when cache is stale because payload, schema, image selection, claim decisions, language preference, or user settings changed.
- Keep raw model output only when developer/debug setting allows it, and never sync raw output by default.

Acceptance:

- Valid fixtures pass and invalid fixtures fail with actionable errors.
- Bad local AI output cannot be synced or sent to Feature 114.
- Cached insights are reused only when source payload and schema are unchanged.
- Stale cached insights are labeled and cannot silently feed storytelling generation.

### Phase 4 - Insight Sync, Read Lifecycle, And Claim Review

Owns persistence, ownership, and web-side review.

Tasks:

- Add insight sync API under the existing marketplace capture API boundary, preferably `/api/marketplace-captures/insights` or equivalent tRPC route.
- Store extension version, platform, source URL, captured timestamp, insight type, provider, payload, schema version, payload hash, idempotency key, raw capture inclusion, parent insight IDs, and lifecycle status.
- Add read queries by capture ID, product ID, insight ID, and readiness state.
- Add claim review mutations: approve, edit, remove, request more evidence, and mark unresolved.
- Enforce auth, tenant/user ownership, origin rules, idempotency, and raw-capture settings.
- Add preview UI for structured insight, evidence references, confidence, claims, and readiness blockers.
- Add server AI fallback result parity so server-generated insights use the same schemas, evidence checks, lifecycle states, and storytelling handoff path as local Prompt API insights.
- Add error taxonomy mapping from extension/provider/API failures to user-facing messages and telemetry-safe event properties.

Acceptance:

- Sync is idempotent and safe to retry.
- Feature 114 can retrieve typed insights without relying on extension-local state.
- Claim decisions update readiness while preserving provenance.
- Local and server provider records are interchangeable for downstream preview/storytelling except for provider metadata.

### Phase 5 - Storytelling And AI Video Studio Bridge

Owns the customer journey handoff into Feature 114.

Tasks:

- Build `MarketplaceStorytellingHandoff` from validated insights.
- Include customer journey stage, product truth summary, target audience, pain/objection, content angle, hooks, CTAs, scene plan, evidence IDs, image candidates, claim QA metadata, readiness state, and blockers.
- Gate Feature 114 launch on Product Truth, Image Truth, Claim Truth, and Customer Journey readiness.
- Add actions for "Send to SmartSpecPro", "Open Storytelling", "Send to AI Video Studio", and review routes when blocked.
- Ensure imported video brief creates a draft/review state only. It must not trigger immediate render.
- Ensure Gemini Omni/Storyboard Review receives typed data and never parses raw local AI text.
- Add roundtrip rules when Feature 114 review edits claims, selected images, journey stage, or scene plan: update provenance, mark derived insights stale where needed, and allow re-analysis.
- Add reduced-confidence path for basic product video creation when local/server insights are missing but confirmed product fields and selected images are present.

Acceptance:

- Complete handoff opens the intended storytelling workflow.
- Incomplete handoff opens evidence/claim/image review.
- User must confirm project creation/render in SmartSpecPro.
- Feature 114 edits do not break provenance or silently reuse obsolete insight data.

### Phase 6 - Operational Readiness And Rollout

Owns release safety.

Tasks:

- Add feature flags: local Prompt API, default preference, server fallback, side panel, raw capture sync, AI Video Studio bridge, storytelling handoff, kill switch.
- Add minimal telemetry events with no raw text, titles, prompts, comments, reviews, or product content.
- Add retention, export/delete, and local debug output policies.
- Add Chrome Web Store privacy review checklist.
- Add i18n and accessibility smoke checks for side panel states.
- Add rollback behavior so disabling local AI leaves capture and server sync intact.
- Add privacy consent copy and settings-review checkpoints for raw capture, reviews/comments, local debug output, and server fallback.
- Add support/diagnostic export that includes capability state and error codes without page text or prompts.

Acceptance:

- Local AI can be disabled remotely/local without breaking capture.
- Privacy checklist is complete before Web Store submission.
- QA can verify supported and unsupported Prompt API machines with one matrix.
- Support diagnostics can explain provider choice without leaking marketplace content.

## Dependency Order

1. Pre-implementation spikes.
2. Contracts and sanitizer.
3. Capability/provider decision.
4. Side panel status and actions.
5. Prompt builders and validators.
6. Local cache and fallback.
7. Sync and read lifecycle.
8. Claim review and readiness.
9. Storytelling/AI Video Studio handoff.
10. Rollout, telemetry, privacy, QA.

## Likely File Ownership

Exact paths should follow the inspected repo structure, but implementation should be split roughly as follows:

- Extension shared contracts and schemas: existing extension/shared marketplace capture types or a new local AI shared module.
- Extension local AI provider: capability detector, Prompt API provider, server fallback adapter, noop provider, provider decision function.
- Extension capture hygiene: sanitizer, evidence selector, payload hash, cache key builder.
- Extension side panel UI: local AI status, action panel, insight preview, claim/evidence review, settings.
- Web/API sync: marketplace capture routes or tRPC router, persistence model/migration, insight read queries, claim resolution mutations.
- Feature 114 bridge: storytelling handoff importer, readiness gate, Storyboard Review data adapter.
- Tests/fixtures: sanitizer fixtures, provider state mocks, schema fixtures, sync/read API fixtures, storytelling handoff fixtures.

## Rollout Milestones

### Milestone A - Safe Shell

Capability detector, provider decision, feature flags, side panel status, privacy settings, and no Prompt API generation yet.

Exit criteria: existing capture works unchanged with Prompt API disabled and enabled.

### Milestone B - Local Product Brief

Sanitizer, ProductBrief prompt, validator, local cache, and preview.

Exit criteria: ProductBrief generation can succeed/fail/fallback without blocking upload selected.

### Milestone C - Full Insight Set

ReviewInsight, TikTokShopTrendBrief, VideoBrief, combined opportunity, server fallback parity, and cache invalidation.

Exit criteria: all insight schemas validate and share one lifecycle.

### Milestone D - Sync And Review

Insight persistence, read APIs, preview, claim review, and readiness states.

Exit criteria: web can query typed insights and update claim readiness.

### Milestone E - Storytelling Handoff

MarketplaceStorytellingHandoff, Feature 114 import, readiness gates, AI Video Studio draft bridge.

Exit criteria: ready handoffs open storytelling; incomplete handoffs open review.

### Milestone F - Production Hardening

Telemetry, diagnostics, privacy review, i18n/accessibility, manual Chrome matrix, rollback.

Exit criteria: kill switches preserve capture and sync behavior.

## Key Risks And Mitigations

- Prompt API unavailable or inconsistent: runtime detection, provider fallback, noop raw-capture-only path.
- Thai local output quality: structure-first validation, best-effort Thai, server review/fallback option.
- Prompt injection or remote prompt abuse: local prompt templates only, sanitized input only, no arbitrary remote prompt execution.
- Data leakage: sanitizer, default structured-only sync, telemetry redaction, raw debug opt-in.
- Storytelling hallucination: evidence IDs, claim review, readiness gates, unsupported claim blocking.
- Storage model ambiguity: prefer dedicated insight records; require explicit migration decision if embedding JSON in existing records.
- State drift after user edits: mark dependent insights/handoffs stale and require review or re-analysis.
- Provider parity gap: validate server fallback outputs through the same schemas and lifecycle as local Prompt API outputs.
- Extension context mismatch: verify execution context in Phase 0 and provide offscreen/panel fallback before UI work depends on it.

## Completion Definition

The feature is complete when the extension supports capture on both Prompt API supported and unsupported machines, can produce or fallback from validated insight generation, can sync and read typed insight records, and can pass a `MarketplaceStorytellingHandoff` into Feature 114 with readiness gates that prevent unsupported generation.
