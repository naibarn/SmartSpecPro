# Feature 117: Production Director Agents SDK Auto Storyboard And Video

Version: 1.22.0
Date: 2026-05-31
Status: Proposed
Supersedes:
- Marketplace Capture direct storyboard/video orchestration behavior from Features 114 and 115 where it enters Media Studio automation
Depends-on:
- Feature 101 OpenAI Agents SDK Chat And Team Orchestration
- Feature 106 OpenAI Agents Python Native Skill System
- Feature 107 OpenAI Agents Python Subagent Skill Runtime
- Feature 112 Storyboard Studio Skill Based Prompt Generation QA Loop
- Feature 113 Marketplace Capture Extension
- Feature 114 Gemini Omni Suite Media Assets
- Feature 115 Extension Local AI Analysis Layer
- Existing SmartSpecPro LLM gateway, credit ledger, media generation routers, media job workers, Storyboard Review, Video Edit, Media Library
Audience: Media Studio, Marketplace Capture, Python Backend, Node Backend, LLM Gateway, Credits/Billing, Media Generation, QA, Security, Product

---

## 1. Executive Summary

Feature 117 turns the existing Marketplace Auto Review and Production Director automation into a stage-based creative production runtime for creating product review storyboards and videos from existing product data. Node canvas is not part of this feature.

The target product behavior is:

```text
Marketplace product or Production Project
  -> Marketplace Auto Review run or Production automation run
  -> product preflight and evidence lock
  -> automatic creative concept generation
  -> selected or auto-selected storyboard direction
  -> prompt, storyboard, script, and shot contract
  -> generation with provider-credit safety
  -> visual/audio/story/product-truth QA
  -> targeted repair loops
  -> Storyboard Review and/or final video render
  -> Media Library output
```

The user should be able to select a product in Marketplace Capture or Media Studio and choose:

- `Create Storyboard`
- `Create Video`
- `Auto Create Review Video`

The system then performs the long multi-step work with minimal user involvement. It should make creative decisions automatically, but it must inspect and verify each stage carefully enough that the run finishes reliably and does not silently produce broken or misleading media.

This feature uses `openai/openai-agents-python` as the replacement orchestration runtime for Production Director and Marketplace product storytelling automation. It is not a shadow, canary, or parallel evaluation path. The new runtime replaces the old planner/verifier orchestration for eligible Production Director and Marketplace Capture storyboard/video actions.

For Marketplace Capture, the replacement target is the existing Auto Review pipeline. Feature 117 must not create, update, execute through, or depend on node canvas, `ProductionSpace`, or `flowNodes`. If any current execution path still requires those structures, implementation must replace or bypass that dependency for this automation path.

The SDK may only be used behind the existing SmartSpecPro backend boundary. Any LLM call made by the SDK runtime must go through the SmartSpecPro LLM gateway. No direct OpenAI, direct provider, or side-channel LLM path is allowed. Credit estimation, reservation, deduction, refund, and audit must remain owned by the existing platform credit system.

---

## 2. Product Problem

SmartSpecPro already has many strong pieces:

- Marketplace Capture can capture product data and selected images.
- Feature 115 can produce `MarketplaceStorytellingHandoff` with customer journey, evidence-backed claims, image fidelity, and readiness.
- Media Studio can create Production Projects and already has story concept/prompt planning surfaces.
- Marketplace Capture already has a real Auto Review flow that starts from a selected product and advances through durable run stages.
- Storyboard Review and Video Edit can assemble completed clips and render MP4 output.
- Existing media generation routers and workers already handle provider calls, media jobs, render queues, and library persistence.

The missing piece is a reliable automation conductor that can:

1. Imagine fresh video concepts from the same product repeatedly without copying the same angle.
2. Keep product truth strict so the LLM does not invent unsupported claims.
3. Keep product image identity stable so the product is not visually altered beyond approved transformations.
4. Keep character, face, shot, story, and audio continuity across the whole clip.
5. Continue through a long workflow until storyboard or video output is complete.
6. Detect failures, make repair decisions, and retry only the failed stage instead of abandoning the job.
7. Spend credits only when the platform has properly estimated, reserved, and authorized the step.
8. Produce enough trace and audit data to explain what happened after an automated run completes.

Feature 117 exists to close that gap.

### 2.1 Current Codebase Alignment

As of 2026-05-31, the implementation is already beyond the old node-canvas assumption. The current codebase has these concrete surfaces:

- `apps/web/server/services/marketplaceAutoReviewService.ts` owns `marketplaceAutoReviewRuns`, `marketplaceAutoReviewStages`, deterministic plan creation, image/video/audio scheduling, Storyboard Review projection, Video Edit projection, render submission, and Media Library finalize.
- `apps/web/server/jobs/marketplaceAutoReviewJob.ts` advances active runs durably in the background.
- `apps/web/server/routers/marketplaceCapture.ts` exposes `startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, and `cancelAutoReviewRun`.
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` already lets a user choose `storyboard_images` or `full_video` directly from a product.
- `apps/web/client/src/pages/MediaStudio.tsx` already uses story concept and storyboard prompt planning that can feed shot-level automation.
- `python-backend/app/services/openai_agents_adapter.py` and `openai_agents_gateway_model.py` already provide a gateway-routed Agents SDK boundary, but the runtime contract does not yet include a dedicated `media_production` surface.

Therefore Feature 117 must be implemented as an upgrade of the current stage-based automation. Node canvas is out of scope and must move to a separate future feature/spec.

Current Marketplace Auto Review stages are:

| Stage | Current purpose | Feature 117 change |
| --- | --- | --- |
| `product_preflight` | Product access, product fields, selected images, supporting insights. | Add stricter product/evidence lock, volatile-signal classification, and LLM-safe context packaging. |
| `production_project` | Create or link a Production Project for ownership, metadata, and downstream surfaces. | Keep the project record, but do not create or update node canvas/`ProductionSpace` artifacts for this automation path. |
| `concept_story` | Deterministic 9-shot concept/template today. | Replace with Agents creative concept generation, novelty memory, and product truth review. |
| `prompt_plan` | Deterministic storyboard, prompt, and voiceover package today. | Replace with Agents storyboard/prompt/audio contract plus verifier output. |
| `image_generation` | Existing media execution service creates storyboard grid or start/stop frames. | Reuse existing provider path; add QA and repair decisions before proceeding. |
| `storyboard_review` | Create Storyboard Review projection. | Keep as user-facing review/output surface with stronger QA trace. |
| `video_generation` | Existing media execution service creates video clips. | Reuse existing provider path; add continuity QA and scoped repair. |
| `audio_generation` | Native video audio, separate TTS, or silent path. | Add audio continuity, duration, voice, and gap QA before render. |
| `video_edit` | Create Video Editor project projection. | Keep deterministic assembly from accepted clips/audio. |
| `render` | Existing media job/render worker creates MP4 or uses render cache. | Keep existing render path; add render preflight/final QA. |
| `library_finalize` | Save final video to Media Library and index. | Keep and attach trace/evidence/credit summary. |

The first implementation work should target `marketplaceAutoReviewService.ts` and its run/stage contracts. Media Studio Production automation can share the same Agents contracts later, but Marketplace Auto Review is the concrete, already wired vertical slice.

### 2.2 Feasibility Assessment Against Current Code

This feature is feasible because the hardest non-LLM plumbing already exists:

- Product-detail UI can start storyboard-only or full-video automation.
- Runs and stages are durable and can be advanced by query/mutation, in-process timer, or external scheduler.
- Image and video generation plumbing already exists, but Feature 117 scheduling must use direct shot payloads instead of canvas-shaped execution inputs.
- Storyboard Review and Video Edit projections already exist.
- Render submission, render cache, FFmpeg/media job worker, final library item creation, and indexing already exist.

The main gaps are not canvas-related. The gaps are:

- `buildAutoReviewPlan` is deterministic and does not yet create fresh LLM-driven concepts.
- Product truth is partly string-based and must become structured evidence, claim, and volatile-signal policy.
- Existing planner/verifier names in Auto Review are labels, not actual Agents SDK steps.
- Current Python Agents runtime contract supports `chat`, `team`, `responses`, and `skill`, but not a dedicated `media_production` surface.
- Current stage status cannot yet distinguish `completed_with_warnings`, `blocked_needs_user`, and `failed_terminal`; either add status detail fields or version the status contract without breaking existing UI.
- QA is described in metadata but does not yet perform full product-fidelity, face-continuity, audio-continuity, and final-render inspection.
- Credit safety must be verified end to end for LLM planning, media providers, audio generation, repair attempts, and render, with idempotency tied to run/stage/shot.
- Any current Marketplace Auto Review dependency on `ProductionSpace`, `flowNodes`, or canvas-shaped execution must be removed or bypassed for Feature 117. The new implementation should schedule media from validated shot payloads and stage checkpoints directly.

The right implementation direction is therefore an incremental replacement inside the existing run/stage pipeline, with node canvas excluded entirely.

### 2.3 Feature 118 Alignment And Upgrade Scope

Feature 118 is the implemented snapshot of the current Marketplace Auto Review system. Feature 117 must treat it as the baseline to preserve unless explicitly replacing a behavior with the new Agents SDK runtime.

Feature 117 must preserve these Feature 118 contracts:

- Marketplace Capture product detail remains the primary entry point for product auto review.
- The existing output modes remain recognizable:
  - `storyboard_images`
  - `full_video`
- The existing frame strategy choices remain recognizable:
  - `auto`
  - `storyboard_3x3_split`
  - `video_shot_start_stop`
- The existing audio strategy choices remain recognizable:
  - `auto`
  - `native_video_audio`
  - `separate_tts_voiceover`
  - `silent`
- `startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, and `cancelAutoReviewRun` remain the API baseline or receive a compatible versioned successor.
- `marketplace_auto_review_runs` and `marketplace_auto_review_stages` remain the durable workflow baseline or receive a compatible versioned successor.
- Storyboard-only mode completes through `storyboard_review`.
- Full-video mode completes through `library_finalize`.
- Output traceability continues to carry marketplace product ID, production run ID, auto review run ID, concept ID, shot ID/order, frame strategy, output mode, audio strategy, and resolved audio strategy.
- Product variant/SKU context, when present in Marketplace Capture evidence, must be preserved as part of product truth and output traceability.
- Shared-product access, evidence freshness, asset-use rights, and provider moderation refusals must be resolved before paid media generation.
- Existing durable provider callback/DLQ infrastructure must be reused or extended with Feature 117 run/stage binding, event authenticity, replay safety, and timeline-visible recovery states.
- Payload, trace, storage, render, and transcode budgets must be enforced before expensive work creates oversized metadata, unplayable files, unrecoverable temporary URLs, or quota failures.
- Marketplace evidence privacy, audio/music/SFX rights, target-platform distribution profiles, and tenant-safe creative feedback memory must be explicit before broad auto-video rollout.
- Synthetic-media disclosure/provenance, CTA/landing integrity, QA calibration, and post-publish governance must be explicit before generated assets are promoted beyond internal review.
- Storyboard Review, Video Edit, render, and Media Library remain downstream output surfaces.
- Active-run dedupe and idempotency behavior must remain at least as strong as Feature 118.
- Background advancement and manual advancement must continue to work for active runs.

Feature 117 intentionally improves or replaces these Feature 118 behaviors:

- Deterministic `buildAutoReviewPlan` becomes Agents-driven creative concept, storyboard, prompt, and voiceover planning.
- Fixed 9-shot/45-second planning becomes configurable within safe platform limits while preserving a reliable default.
- String-only `PRODUCT FACTS LOCK` becomes structured product truth, evidence mapping, volatile-signal policy, and product visual identity constraints.
- `concept_story` and `prompt_plan` stage outputs become structured artifacts with schema validation, audit, model usage, and credit metadata.
- Current planner/verifier labels become real gateway-routed Agents runtime steps.
- Current QA metadata becomes actual product-truth, product-fidelity, story-continuity, face-continuity, audio-continuity, render-preflight, and final QA gates.
- Current fail/complete statuses gain structured detail for warnings, blocked-needs-user, terminal failure, repair history, and partial outputs without breaking existing UI status mapping.
- Current dependency on `ProductionSpace`/`flowNodes` for Marketplace Auto Review execution is removed or bypassed.

Feature 118 should remain a factual implemented snapshot. Do not rewrite Feature 118 to describe proposed behavior. When Feature 117 ships, either update Feature 118 as a new implemented snapshot revision or create a new implementation snapshot spec that records the shipped Feature 117 behavior.

---

## 3. Non-Negotiable Decisions

1. **This is a replacement runtime, not a shadow path.**
   - Eligible Production Director planning, verification, shot payload configuration, QA, and Marketplace product storytelling automation must use the Agents SDK runtime.
   - The system must not run the legacy planner and Agents SDK planner side by side for comparison.
   - The system must not silently choose between two orchestration runtimes during one run.
   - If the feature is disabled, the product may fall back to manual existing surfaces, but not to hidden dual execution.

2. **Marketplace Auto Review run/stage state is the primary source of truth for product auto-review.**
   - Marketplace product storyboard/video automation must advance through `marketplaceAutoReviewRuns` and `marketplaceAutoReviewStages`, or their explicit versioned successor.
   - Automation completion must not depend on the user opening, editing, arranging, or approving a node canvas.
   - Feature 117 must not create, update, or repair `ProductionSpace`, node canvas, or `flowNodes`.
   - Agents must output concept, storyboard, prompt, QA, repair, and shot media payload contracts directly against the run/stage model.
   - If a legacy service can only schedule provider tasks from flow nodes, that service boundary must be extended or bypassed for this feature rather than generating compatibility nodes.

3. **Node canvas is moved to a separate future topic.**
   - No Feature 117 implementation work should touch node canvas UI, node graph editing, canvas layout, canvas persistence, or node catalog expansion.
   - Future node canvas capability can consume completed storyboard/video artifacts later, but it is not part of this automation runtime.

4. **The Python backend is the only place that may import `openai-agents-python`.**
   - Frontend code, Node routers, shared TypeScript packages, extension code, and skill bundles must not import SDK classes.
   - One Python adapter boundary owns SDK construction, tool registration, handoffs, guardrails, sessions, tracing, and runner calls.

5. **All SDK-driven LLM calls must go through the SmartSpecPro LLM gateway.**
   - The SDK runtime must not call OpenAI or any LLM provider directly.
   - The SDK runtime must use the platform's OpenAI-compatible gateway endpoint and platform-issued gateway credentials.
   - Gateway traffic must include tenant, user, surface, origin surface, production run, agent run, model, credit, and audit metadata.
   - Direct provider API keys must not be exposed to the SDK adapter.
   - Marketplace Capture actions in this feature must not start new extension-local LLM calls, Chrome Prompt API calls, direct browser AI calls, or remote LLM calls outside the backend gateway.
   - Existing Feature 115 local insight records may be consumed as prior evidence when already present, but Feature 117 automation must not depend on or trigger a second LLM path in the extension.

6. **Credit accounting remains platform-owned.**
   - Planning LLM credits, verifier LLM credits, visual/audio QA LLM credits, media provider credits, render credits, refunds, and retry costs must be recorded through the existing credit ledger.
   - Agents may request a credit estimate or reserve step, but may not deduct credits by themselves.
   - Provider generation must not start until the platform has reserved generation credits for the exact execution plan and the user or automation policy has authorized it.

7. **Agents make creative decisions but cannot invent product truth.**
   - The runtime may invent story structures, scene ideas, camera language, metaphors, hooks, pacing, and review angles.
   - It must not invent product specs, certifications, discounts, ratings, warranty, medical benefits, durability claims, materials, dimensions, or before/after effects not present in evidence.
   - Every product claim in voiceover, captions, on-screen text, product card, CTA, and scene premise must map to evidence IDs or explicit user-approved wording.
   - Price, discount, rating, sold count, review count, commission, and campaign terms are volatile marketplace signals. They may be stored in evidence metadata, but Agents must not use them as spoken/captioned/visual claims unless the user explicitly approves current-use wording for that run.

8. **Product visual identity is protected.**
   - Product images from Marketplace Capture are evidence assets, not style inspiration that may be freely mutated.
   - The runtime must preserve product shape, logo, color, material, visible packaging, labels, and distinctive details unless the user explicitly approves a visual transformation.
   - Generated shots must be rejected or repaired if the product becomes a different object, an impossible variant, a misleading packaging design, or a materially changed product.
   - When a marketplace product has variants such as color, size, volume, bundle, scent, package count, or seller SKU, the selected variant snapshot is part of the product identity. The runtime must not show, narrate, price, or render a different variant unless the run is explicitly created as a new variation with its own snapshot.

9. **Creative imagination must be stronger, but bounded by ad truth and evidence.**
   - Hooks may be cinematic, surprising, emotionally specific, or trend-aware, but they must not create a misleading net impression.
   - The runtime must prefer product-grounded story tension: buyer hesitation, use context, proof sequence, expectation management, and honest CTA.
   - The runtime must not use fake urgency, fake scarcity, fake discounts, fake social proof, fake testimonials, exaggerated superlatives, health/financial/body claims, or before/after implications without evidence and policy approval.
   - Ad compliance must be checked at concept, storyboard, voiceover/caption, generated media, and final render stages.

10. **Human identity continuity is protected when people appear.**
   - If a presenter, actor, hand model, or character appears across more than one shot, the runtime must decide whether continuity is required and persist a character continuity lock.
   - Face, age range, skin tone, hair, wardrobe, body type, presenter role, and speaking identity must remain consistent across continuity-required shots.
   - A person turning around, revealing their face, entering a new shot, or reappearing after a cut must not produce a different face or different person.
   - If continuity cannot be verified, the runtime must repair, switch to product-only shots, or block rather than silently continue.

11. **Voiceover and dialogue must sound natural and policy-safe.**
   - Spoken text must fit the shot duration, target language, normal speech rhythm, and platform style.
   - The script should sound like a real creator explaining a product, not like keyword stuffing or a hard-sell ad.
   - The runtime must avoid unnatural repetition, overlong clauses, abrupt CTA, unsupported claims, and robotic transitions between shots.

12. **Automation must finish or stop with a durable reason.**
   - Long-running automated jobs must not disappear halfway.
   - Every run must end as `completed`, `completed_with_warnings`, `blocked_needs_user`, `failed_terminal`, or `cancelled`.
   - Recoverable failures must create scoped repair attempts.
   - Terminal failures must preserve partial artifacts, issue summaries, credit state, and next actions.
   - Provider callback/polling events must be authenticated or trusted only through provider-owned polling, deduped, replay-safe, and bound to the expected tenant/run/stage/media task before they can advance a run.
   - Payload, trace, storage, and render-size limits must block before new spend when continuing would exceed platform budgets or produce unusable output.

13. **Human review is minimal by default but available at hard safety boundaries.**
   - The default mode is auto-first.
   - The system may pause for user review only when policy, evidence, image fidelity, budget, legal/regulated content, or repeated QA failure requires it.
   - A user should not need to manually approve every normal step for a low-risk product review video.

14. **Marketplace privacy, audio rights, and delivery profile are first-class gates.**
   - Captured marketplace screenshots, DOM text, reviews, comments, usernames, profile photos, account headers, order/cart/payment data, phone numbers, addresses, and chat snippets must not leak into prompts, generated visuals, captions, voiceover, traces, or final media unless explicitly allowed and redacted.
   - Review text may inform product risk/evidence only when policy allows it; the system must not create named customer testimonials, reviewer identities, review screenshots, review stars, or social proof visuals without evidence, rights, and approval.
   - Music, SFX, TTS voices, native generated audio, and uploaded audio references must have provenance and commercial-use rights before they can be included in final ads.
   - Every final output must be checked against a declared distribution profile such as TikTok/Reels/Shorts/Facebook/Shopee/Lazada/Website/custom. A generic render is not assumed valid for every destination.
   - Creative memory and feedback loops may store only tenant-safe, redacted metadata. Failed, misleading, unsafe, or unapproved outputs must not become positive examples for future automation.

15. **Disclosure, CTA correctness, calibration, and post-publish lifecycle are controlled.**
   - AI-generated or materially synthetic visuals/audio/people/voices must carry disclosure, provenance, platform flags, or metadata when policy requires them.
   - CTA text, product URL, affiliate URL, landing page, shop identity, availability, and offer wording must match current approved evidence; broken, unsafe, private, or mismatched links must block finalization.
   - Automated QA confidence must be calibrated with fixtures, drift checks, and human spot-check sampling for high-risk or low-confidence outputs.
   - Final Library assets must carry reuse/expiry/takedown governance so stale claims, revoked rights, expired offers, or product removal can block reuse or trigger re-review.

16. **High-volume automation must be campaign-safe, brand-safe, and reviewable.**
   - Single-run automation and batch/variation automation must share the same gateway, credit, policy, QA, and timeline controls.
   - The runtime must prevent duplicate, spam-like, or budget-abusive creative generation from the same product, seller, tenant, or campaign.
   - Brand/seller voice may guide style, vocabulary, and CTA tone, but it must never override product truth, ad policy, rights, privacy, disclosure, or evidence rules.
   - High-risk or high-volume batches must enter a scoped human review queue with clear SLA, approver role, approval scope, and timeout behavior before additional spend or publication.

17. **Final output must include a publishable asset package, not only an MP4.**
   - Final video outputs should carry platform-ready title/caption/description, hashtags, thumbnail/cover, transcript, subtitle sidecars or burn-in status, and a metadata manifest when the selected distribution profile requires them.
   - Publish metadata, hashtags, thumbnail text, and cover frames are ad content and must pass the same evidence, Thai/international ad, privacy, rights, CTA, disclosure, and brand-policy checks as the video itself.
   - Thumbnail/cover selection must preserve product identity and must not create misleading clickbait, unsupported before/after implication, fake discount, fake rating, fake certification, or face/product drift.
   - Transcript and subtitles must be derived from approved spoken script/audio alignment, not visual prompts, hidden policy notes, or raw agent planning text.

18. **Input changes during a long run must invalidate only the affected work.**
   - Product fields, selected variant, product images, price snapshots, evidence retention, rights, brand policy, distribution profile, CTA links, warning/disclosure policy, or human review decisions can change while automation is running.
   - The runtime must detect these changes, compute downstream impact, preserve unaffected safe artifacts, and recheck/repair/replan/regenerate only the affected stages.
   - Old approvals, credit estimates, QA verdicts, publish metadata, thumbnails, and finalization decisions must not remain valid when their evidence or policy snapshot has changed.
   - The UI timeline must show what changed, what was preserved, what must be redone, and whether the run is waiting for user/admin action.

19. **Every generated frame/clip must pass gateway-routed vision QA before downstream use.**
   - Storyboard grid cells, per-shot start frames, per-shot stop frames, video keyframes, thumbnails, and final render samples must be checked by structured vision QA when they affect product identity, character continuity, visual quality, or story continuity.
   - If one start/stop/storyboard frame fails product fidelity, character identity, visual quality, prompt alignment, or continuity QA, the runtime must repair/regenerate only that frame and dependent downstream work.
   - Passed frames, clips, audio, captions, and package artifacts must be preserved unless they depend on the failed frame or stale upstream contract.
   - Vision QA LLM calls must go through the SmartSpecPro LLM gateway, consume `llm_visual_qa` credits, and record QA evidence and repair decisions.

20. **Failed or unverified media must stay quarantined until accepted.**
   - Newly generated frames, clips, audio, thumbnails, subtitles, and package artifacts start as candidates, not accepted outputs.
   - Candidate artifacts cannot enter Storyboard Review, Video Edit, Library, publishable packages, positive creative memory, or future references until required QA passes.
   - Failed artifacts may be retained only as internal audit/repair evidence or negative learning signals according to retention policy.
   - Repaired artifacts must supersede failed artifacts explicitly so stale failed refs cannot be reused by background resume, UI projection, or manual review actions.

21. **Product reference assets must be prepared before provider spend.**
   - Marketplace product images are not interchangeable prompt attachments. The runtime must create a `ProductReferenceAssetPack` before any image, video, thumbnail, or visual-repair provider call uses the product as a reference.
   - The pack must choose primary/supporting references, reject unsafe or low-confidence images, record crop/mask/fingerprint refs when available, and bind the result to product evidence, selected variant, asset rights, and freshness state.
   - Provider payloads and repair payloads may reference only pack-approved product refs. Low-resolution, collage, mismatched-variant, remote-unhosted, private, rights-blocked, or misleading marketplace images must block, downgrade to a generic non-visual plan, or ask for better images before credits are spent.
   - Any LLM vision used to classify or validate the reference pack must go through the SmartSpecPro LLM gateway and be recorded as `llm_visual_qa` usage.

22. **Advertising policy rules must be versioned, testable, and source-attributed.**
   - Thailand, global, and platform advertising rules must not live only as prompt text or informal comments. They must be encoded in an approved `AdvertisingPolicyRulePack`.
   - Each rule pack must carry rule IDs, jurisdiction/profile, category triggers, source anchors, severity, allowed repair behavior, warning-template refs, fixture refs, effective dates, and approval status.
   - Runs, approvals, warning overlays, QA verdicts, and final Library assets must reference the exact rule-pack version used.
   - Policy pack changes must trigger fixture replay, spot-check, or review before broad promotion, especially for Thailand FDA/อย., OCPB/สคบ., platform ad policies, endorsement disclosure, and regulated categories.

23. **Stage completion must be evidence-gated.**
   - A stage cannot become `completed`, `completed_with_warnings`, `skipped`, or a run-terminal success only because code reached the end of a handler, a provider returned a URL, or an agent returned text.
   - Every stage transition must persist `MarketplaceAutoReviewStageCompletionEvidence` that lists required evidence, present refs, missing refs, warnings, blockers, policy snapshot refs, credit refs, QA refs, lineage refs, and idempotency key.
   - Manual advancement, background workers, operator recovery, and migration/backfill helpers must use the same completion evidence gate.
   - Timeout, retry budget exhaustion, or stop policy may block/fail/cancel a stage, but must never mark it complete without route-required evidence.

24. **SDK capabilities must be manifest-locked per stage attempt.**
   - Node must build a `ProductionAgentsSdkCapabilityManifest` before each Agents-backed attempt and pass only approved agents, tools, handoffs, session policy, trace policy, output schemas, and credit/tool limits to Python.
   - Python must register only manifest-listed capabilities. It must fail closed on unknown tools, hosted SDK tools, handoffs that widen scope, direct persistence, raw trace export, raw session persistence, or missing manifest hash.
   - SDK tool outputs remain untrusted until Node verifies returned refs against platform state, permissions, credits, policy, and artifact lineage.
   - Resume, cancel, retry, and repair attempts must use the original manifest hash or a new manifest tied to input-change impact and stage completion evidence.

25. **Every automation run must have a production creative brief snapshot.**
   - Before concept generation, Node must persist a `ProductionCreativeBriefSnapshot` that captures the run objective, audience/use context, target platform, tone/register, CTA intent, creative latitude, quality/speed mode, budget posture, user hints, avoid list, and auto-decision policy.
   - Agents may elaborate the brief into creative options, but they must not treat user hints or seller notes as product facts unless those claims map to approved evidence or scoped approval.
   - If the brief is too ambiguous for safe auto-selection, the run must use conservative evidence-safe defaults, request human review, or block before provider spend.
   - Any brief change during a long run must create input-change impact and invalidate only the downstream concept, storyboard, script, metadata, media payload, QA, approval, and credit refs that depended on the old brief.

26. **Marketplace evidence must pass an instruction firewall before Agents see it.**
   - Marketplace DOM, OCR, reviews, seller descriptions, image alt text, filenames, comments, prior AI output, and uploaded evidence are data only. They must never become system/developer instructions, tool routing, budget policy, approval state, provider choice, or output routing.
   - Node must create a `MarketplaceEvidenceInstructionFirewall` after privacy redaction and before creative brief/concept planning when any untrusted evidence could enter an LLM or Agents context.
   - Instruction-like strings such as "ignore previous instructions", fake tool calls, fake schema fragments, policy bypass requests, hidden CSS/HTML text, prompt templates, credential requests, or provider-routing suggestions must be quarantined, escaped, or reduced to structured evidence refs before LLM spend.
   - The firewall must fail closed before additional LLM/provider spend if it cannot separate product facts from adversarial instructions with enough confidence.

27. **Recurring people and voices need a character identity asset pack before provider spend.**
   - If a presenter, actor, hand model, synthetic character, or recurring voice appears across shots, Node must create `CharacterIdentityAssetPack` before storyboard media payloads, visual provider calls, video provider calls, TTS/voice calls, or continuity QA can use that identity.
   - The pack must separate approved real-person references, synthetic/generic character references, hands-only references, voice profile refs, consent/rights refs, and blocked refs.
   - The system must prefer product-only, hands-only, single-shot, or generic-person formats when consent, reference quality, face visibility, or voice consistency is not strong enough for safe recurring identity.
   - Character/voice consistency QA must compare against this pack, not only prompt text or a vague phrase such as "same person".

---

## 4. Goals

1. Add an Agents SDK based automation runtime that replaces the current deterministic/skill-based planner/verifier behavior for eligible Marketplace Auto Review and Production Director flows.
2. Let users create a storyboard or video directly from a selected Marketplace Capture product.
3. Let the runtime generate multiple fresh creative concepts from the same product while staying evidence-safe.
4. Auto-select or recommend the best concept based on platform, audience, evidence strength, product image quality, novelty, and completion probability.
5. Generate an automation plan with production bible, storyboard, ordered shots, media payload contracts, budgets, QA gates, and handoff targets.
6. Configure each shot-level image/video/audio/TTS payload automatically using existing Image, Video, Audio, TTS, Storyboard Review, Video Edit, and render capabilities without node canvas.
7. Run generation and render steps through existing platform provider and media job paths with correct credit accounting.
8. Add layered QA for product truth, product visual fidelity, character/face continuity, story continuity, shot continuity, audio continuity, subtitle/voiceover timing, and final render readiness.
9. Automatically repair failed stages where safe, without redoing passed work or spending duplicate credits.
10. Persist traces, audit, checkpoints, action attempts, outputs, and QA verdicts so support and users can understand the completed run.
11. Support repeated variation/campaign generation from the same product with duplicate prevention, spend anomaly control, brand/seller voice policy, and review queue governance.
12. Produce a publishable asset package containing final media, thumbnail/cover, subtitle/transcript artifacts, platform metadata, and manifest refs when required by the distribution profile.
13. Detect input/evidence/policy changes during long-running jobs and invalidate only the affected downstream work without losing safe artifacts or duplicating credit spend.
14. Run per-frame/per-clip vision QA and targeted repair so failed start/stop/storyboard frames or video keyframes are regenerated without rerunning unrelated shots.
15. Quarantine unverified/failed media units and route only accepted or explicitly warning-accepted artifacts to user-visible output surfaces.
16. Prepare and validate product reference asset packs before visual generation so product identity locks have concrete, high-quality, rights-safe image anchors.
17. Version advertising policy rule packs so Thai/global/platform compliance decisions are source-attributed, replayable, and test-covered.
18. Gate every stage transition with persisted completion evidence so durable status, timeline, resume, and recovery cannot claim success without required refs.
19. Lock SDK tools, handoffs, sessions, traces, hosted capabilities, and output schemas to a Node-approved capability manifest per stage attempt.
20. Persist a production creative brief snapshot before concept generation so agent decisions remain goal-first, user-preference-aware, auditable, and safely invalidated when intent changes.
21. Treat captured marketplace text and prior model output as untrusted data behind an instruction firewall so creative automation can use product evidence without letting page content steer Agents, tools, credit, policy, or provider routing.
22. Prepare character identity asset packs before recurring people, hands, presenters, or voices are generated so face/voice continuity uses approved references, consent, and fallback rules rather than loose prompt wording.

---

## 5. Non-Goals

- Replacing the media provider routers, provider adapters, media generation service, FFmpeg render workers, or Media Library.
- Running any LLM outside the SmartSpecPro LLM gateway.
- Letting the SDK adapter own tenant billing, provider policy, model allowlists, or credit deduction.
- Building a generic automation engine for non-media tasks.
- Creating fake product claims, fake reviews, fake ratings, fake certifications, or unverifiable before/after promises.
- Guaranteeing that every product can be auto-generated without user intervention.
- Removing Storyboard Review or Video Edit from the product.
- Creating, editing, repairing, or depending on node canvas, `ProductionSpace`, `flowNodes`, node graph layout, or node catalog expansion.
- Keeping a compatibility node path for Marketplace Auto Review when a direct shot-payload path can be implemented instead.
- Exposing internal runtime names such as OpenAI Agents SDK, handoffs, guardrails, or adapter internals to normal users.

---

## 6. Primary User Journeys

### 6.1 Marketplace Capture - Auto Create Storyboard

1. User captures or opens a Shopee or TikTok Shop product in Marketplace Capture.
2. User selects a product and approved product images.
3. User clicks `Create Storyboard`.
4. SmartSpecPro validates product identity, selected images, evidence-backed claims, and `MarketplaceStorytellingHandoff` readiness.
5. SmartSpecPro prepares a product reference asset pack from approved images before any visual provider work.
6. Agents runtime creates fresh concepts from the product evidence.
7. Runtime auto-selects the best concept unless user settings require concept choice.
8. Runtime creates a `marketplaceAutoReviewRun` with durable stage rows and links it to a Production Director Project.
9. Runtime generates storyboard shots, voiceover beats, captions, visual prompts, camera directions, and product claim mapping.
10. Runtime generates storyboard image frames when the selected output mode is `storyboard_images`.
11. Product Truth QA and Product Image Fidelity QA run before the storyboard is marked ready.
12. Storyboard opens in Storyboard Review with product evidence, journey stages, claim IDs, image fidelity warnings, and readiness badges.

Storyboard creation may reserve image-generation credits when the user selected `storyboard_images`. It must not reserve video, audio, or render credits unless the user selected a video output mode or later upgrades the run to video.

### 6.2 Marketplace Capture - Auto Create Video

1. User captures or opens a product.
2. User clicks `Create Video` or `Auto Create Review Video`.
3. Runtime validates required inputs:
   - confirmed product identity,
   - at least one approved hero product image,
   - allowed marketplace platform,
   - product truth/evidence map,
   - approved product reference asset pack,
   - target language/platform/duration,
   - budget policy.
4. Runtime creates or reuses a `marketplaceAutoReviewRun`, stage rows, and linked Production Director Project.
5. Runtime generates multiple creative concepts and chooses the best one for automation.
6. Runtime creates a full storyboard with shot count, duration, visual beats, camera language, voiceover, captions, and CTA.
7. Runtime configures shot-level image/video/audio/TTS payloads directly from the accepted shot contracts.
8. Runtime estimates LLM, provider, and render credits.
9. If the user's automation policy allows the estimate, platform credit ledger reserves credits.
10. Runtime generates assets shot by shot or in safe batches.
11. QA agents inspect each generated output:
    - product visual fidelity,
    - character and face continuity,
    - shot-to-shot story continuity,
    - product claim safety,
    - audio continuity,
    - subtitle and voiceover timing.
12. Failed outputs trigger targeted repair attempts within retry and budget limits.
13. Passed clips assemble into Storyboard Review and/or Video Edit.
14. Render worker creates final MP4 through existing media job path.
15. Final QA checks the rendered video for continuity, audio gaps, missing clips, wrong ordering, product truth, and export integrity.
16. Completed video is saved to Media Library with trace, evidence, storyboard, and credit summary.

### 6.3 Media Studio Production - Auto Complete Project

1. User creates or opens a Production Director Project.
2. User adds or confirms product/context assets.
3. User clicks `Auto Complete Storyboard` or `Auto Create Video`.
4. Runtime validates the existing production goal, story concept state, and evidence manifest.
5. If the project has no plan, runtime creates one.
6. If the project has an approved plan but missing shot payloads, runtime configures missing image/video/audio payloads.
7. If payloads exist but outputs are missing, runtime previews execution and reserves credits.
8. Runtime runs generation, QA, repair, handoff, render, and final QA until the requested output is complete or blocked.

### 6.4 Fresh Variations From Same Product

1. User selects a previously captured product or completed video.
2. User clicks `Create New Variation`.
3. Runtime receives prior concepts, used story dimensions, used camera grammar, used hook styles, and prior outputs.
4. Runtime must create a substantially different story angle while preserving product truth.
5. Duplicate angle detection rejects concepts that are too close to existing videos.
6. The new variation follows the same storyboard/video pipeline.

---

## 7. Automation Modes

### 7.1 Storyboard Only

Creates:

- Production Director Project
- Marketplace Auto Review run/stage checkpoints when started from Marketplace Capture
- production bible
- storyboard shots
- voiceover beats
- captions/on-screen text plan
- shot prompts and media payload contracts
- generated storyboard frame images when mode is `storyboard_images`
- QA verdicts
- Storyboard Review handoff

Creates image provider tasks only when the requested storyboard output includes generated frames, such as Marketplace Capture `storyboard_images`. It does not create video, audio, or render tasks unless the user later chooses video generation.

### 7.2 Video Auto

Creates everything in Storyboard Only, then advances the existing stage pipeline through image generation, Storyboard Review, video generation, audio generation, Video Edit projection, render, final QA, and Media Library output.

### 7.3 Auto With Review On Blockers

Default recommended mode. Automation runs without asking at every step, but pauses when:

- unsupported product claim appears,
- hero image fidelity risk is high,
- budget estimate exceeds policy,
- regulated category or policy-sensitive content is detected,
- product identity cannot be preserved after allowed repairs,
- audio/visual continuity fails repeatedly,
- provider failures exceed retry limits.

### 7.4 Fully Manual Review Mode

Optional tenant/user policy. Same runtime and checks, but requires user approval before provider generation and final render.

---

## 8. Target Architecture

### 8.1 Runtime Ownership

```text
Web UI / Extension
  -> Node API / tRPC / REST
  -> Marketplace Auto Review / Production Automation Service
  -> Credit and permission checks
  -> Python Agents SDK Adapter
  -> SmartSpecPro LLM Gateway
  -> structured runtime output
  -> Node-owned persistence, credit ledger, media generation, render jobs
```

Node remains authoritative for:

- tenant permissions,
- Marketplace Auto Review run/stage state,
- Production Project state,
- model/provider policy,
- gateway credentials,
- credit estimation/reservation/deduction/refund,
- media generation scheduling,
- render job scheduling,
- audit events,
- user-visible status.

Python Agents SDK adapter owns:

- agent definitions,
- specialist handoffs,
- tool registration,
- guardrails,
- session attachment,
- trace spans,
- structured output validation,
- run loop within one automation step.

The adapter must not own:

- billing ledger writes,
- provider API credentials,
- media provider submission,
- render workers,
- direct database mutation outside explicit platform tools,
- tenant policy decisions.

### 8.2 Single Adapter Boundary

Feature 117 uses the Feature 101 adapter boundary:

```text
python-backend/app/services/openai_agents_adapter.py
```

If feature-specific helpers are needed, they must sit behind that adapter, for example:

```text
python-backend/app/services/production_agents_runtime.py
python-backend/app/services/production_agents_tools.py
python-backend/app/services/production_agents_guardrails.py
```

Only the adapter or its internal helper modules may import `agents` from `openai-agents-python`.

### 8.3 LLM Gateway Contract

Every model call made by the SDK runtime must use the SmartSpecPro gateway as the model provider. Required metadata:

```ts
interface AgentsGatewayInvocationMetadata {
  tenantId: string;
  userId: string;
  surface: "media_production";
  originSurface:
    | "media_studio_production"
    | "media_studio_video_shot"
    | "marketplace_capture"
    | "storyboard_review"
    | "video_edit";
  productionProjectId?: string;
  productionRunId: string;
  agentRunId: string;
  agentName: string;
  agentRole: ProductionAgentRole;
  stepId: string;
  attemptId: string;
  modelPolicyId: string;
  selectedModelId: string;
  creditCategory:
    | "llm_planning"
    | "llm_verification"
    | "llm_visual_qa"
    | "llm_audio_qa"
    | "llm_repair";
  idempotencyKey: string;
}
```

The adapter must fail closed if:

- gateway base URL is missing,
- gateway authentication is missing,
- direct provider credential is supplied,
- required billing metadata is missing,
- tenant/model policy denies the selected model,
- gateway credit preflight fails,
- the stage attempt lacks a valid SDK capability manifest hash.

### 8.4 SDK Tool Boundary

Agents may call platform tools only through approved function tools. Each tool must have:

- typed input schema,
- typed output schema,
- permission envelope,
- credit behavior,
- idempotency key,
- timeout,
- retry policy,
- audit event,
- guardrail classification.

Allowed tool categories:

- read Marketplace Auto Review run/stage state,
- update Marketplace Auto Review checkpoint,
- read production project,
- read marketplace capture/handoff,
- read product evidence,
- save storyboard plan,
- save shot media payload contract,
- preview execution plan,
- request credit estimate,
- request credit reservation,
- schedule existing media generation execution,
- read media task status,
- attach output refs,
- run QA classifier/validator through gateway,
- create Storyboard Review handoff,
- create Video Edit project,
- schedule render through existing media job service,
- update automation checkpoint.

Not allowed:

- direct media provider API calls,
- direct OpenAI/provider LLM calls,
- hosted SDK tools that generate images, videos, audio, web results, code, or files outside SmartSpecPro gateway, credit, permission, and audit controls,
- arbitrary database writes,
- unrestricted shell/code execution,
- direct file system mutation outside approved media artifacts,
- changing tenant policy or credit balances.

### 8.5 SDK Capability Manifest, Handoff, Session, And Trace Firewall

Feature 117 must not rely on Python-side convention to keep SDK capabilities bounded. Node must create an explicit manifest for every Agents-backed stage attempt.

```ts
interface ProductionAgentsSdkCapabilityManifest {
  schemaVersion: "1.0";
  tenantId: string;
  userId: string;
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  attemptId: string;
  manifestHash: string;
  allowedAgents: ProductionAgentRole[];
  allowedHandoffs: Array<{
    fromAgent: ProductionAgentRole;
    toAgent: ProductionAgentRole;
    reasonCodes: string[];
    allowedToolNames: string[];
    canWidenReadScope: false;
    canWidenWriteScope: false;
    canChangeCreditPolicy: false;
  }>;
  allowedTools: Array<{
    name: string;
    category:
      | "read_state"
      | "write_checkpoint"
      | "credit_estimate"
      | "credit_reservation"
      | "schedule_media"
      | "attach_artifact_ref"
      | "qa_classifier"
      | "handoff_projection"
      | "render_schedule";
    mutating: boolean;
    nodeExecuted: boolean;
    requiresApprovalRef: boolean;
    creditCategory?: AgentsGatewayInvocationMetadata["creditCategory"];
    idempotencyKey: string;
    timeoutMs: number;
    maxCallsPerAttempt: number;
    outputTrust: "untrusted" | "node_verified_ref";
  }>;
  hostedSdkCapabilities: {
    webSearch: false;
    fileSearch: false;
    computerUse: false;
    codeInterpreter: false;
    imageGeneration: false;
    audioGeneration: false;
    videoGeneration: false;
    remoteMcp: false;
    shell: false;
  };
  outputSchemas: Array<{
    artifactKind: string;
    schemaVersion: string;
    required: boolean;
  }>;
  sessionPolicy: {
    persistRawSdkSession: false;
    checkpointRefsOnly: true;
    resumeCursorRef?: string;
    maxSessionEventBytes: number;
  };
  tracePolicy: {
    captureSensitiveInputOutput: false;
    externalSdkTraceExport: "disabled" | "development_only";
    redactionProfileId: string;
    maxTraceEventBytes: number;
    platformTraceEventRefs: string[];
  };
  streamPolicy: {
    normalizeEvents: true;
    stableEventIds: true;
    duplicateEventBehavior: "idempotent_noop";
  };
  approvedByNodeAt: string;
}
```

Capability manifest rules:

- Node is the only component allowed to create or widen the manifest.
- Python validates the manifest before constructing agents, tools, handoffs, sessions, or trace processors.
- Handoffs may narrow agent scope, but they must never add tools, write permissions, model policy, credit policy, connectors, hosted SDK capabilities, or persistence authority.
- Hosted SDK capabilities remain disabled unless a future spec explicitly routes them through SmartSpecPro gateway, credit, permission, storage, and audit controls.
- Python function tools may return structured intents or platform refs, but Node must perform or verify every mutating side effect before persisted state changes.
- SDK traces and sessions must store refs, event summaries, schema validation results, and redacted metadata only. Raw prompts, raw product private evidence, raw provider payloads, signed URLs, cookies, tokens, and customer/reviewer PII must not be captured.
- Stream events, resume cursors, cancellation, retry, and repair must include the manifest hash, stage attempt ID, idempotency key, and normalized event identity.
- A manifest mismatch, unknown tool call, unregistered handoff, over-call-limit tool use, raw trace/session capture request, or hosted capability request blocks the attempt before additional LLM or provider spend.

---

## 9. Agent Roles

```ts
type ProductionAgentRole =
  | "production_director"
  | "marketplace_product_truth_reviewer"
  | "creative_concept_director"
  | "storyboard_director"
  | "cinematographer"
  | "product_visual_fidelity_reviewer"
  | "character_continuity_reviewer"
  | "audio_continuity_director"
  | "media_payload_director"
  | "execution_producer"
  | "qa_supervisor"
  | "repair_director"
  | "render_preflight_director";
```

### 9.1 Production Director

Owns the run objective and makes high-level decisions:

- whether enough evidence exists,
- whether to create storyboard only or video,
- which concept should be selected,
- which shot payloads are required,
- when to pause,
- when to retry,
- when to stop terminally.

### 9.2 Marketplace Product Truth Reviewer

Checks:

- product identity,
- specs,
- selected claims,
- prohibited invented claims,
- marketplace evidence IDs,
- user-approved claims,
- platform CTA constraints.

It must block generation if unsupported claims are used in story, voiceover, captions, or visuals.

### 9.3 Creative Concept Director

Generates fresh concepts. It may be imaginative about:

- hook,
- emotional angle,
- mini-story,
- buyer hesitation,
- visual metaphor,
- pacing,
- camera grammar,
- platform-native style,
- voiceover style.

It must stay within product truth.

For repeated runs from the same product, it must use anti-duplication memory:

- previous concept dimensions,
- previous hooks,
- previous scene arcs,
- previous CTA styles,
- previous camera grammar,
- prior rejected patterns,
- performance feedback when available.

### 9.4 Storyboard Director

Converts the selected concept into:

- shot list,
- customer journey stages,
- visual beats,
- duration,
- scene transitions,
- voiceover and caption timing,
- product evidence references,
- media payload requirements,
- handoff requirements.

### 9.5 Cinematographer

Creates camera, lens, lighting, motion, and composition instructions while preserving product identity and continuity.

### 9.6 Product Visual Fidelity Reviewer

Compares planned and generated visuals against approved product images and product evidence. It blocks or repairs:

- wrong product shape,
- changed color,
- changed logo/label,
- invented packaging,
- missing key visible detail,
- impossible variant,
- over-stylized product mutation,
- product blended into background,
- generated product replacing original identity.

### 9.7 Character Continuity Reviewer

Detects character and face continuity failures:

- person turns around and face changes,
- different person appears across shots,
- inconsistent age/gender/wardrobe when continuity is required,
- face distortion,
- hands/body anomalies that harm trust,
- inconsistent presenter role.

### 9.8 Audio Continuity Director

Owns:

- voiceover script flow,
- speech budget,
- pause control,
- TTS voice consistency,
- music and SFX continuity,
- clip transitions,
- silence gap detection,
- loudness and clipping checks.

It must prevent long unintended silence, abrupt voice cuts, mismatched language, or discontinuous narration.

### 9.9 Media Payload Director

Writes shot-level media payload contracts for existing executable surfaces:

- image generation,
- image edit,
- image upscale/enhance,
- image-to-video,
- video generation,
- video-to-video when supported,
- text-to-speech,
- subtitles/captions,
- timeline assembly,
- render preflight.

It must respect the adapter capability registry and never configure unsupported or deferred capabilities as executable.

For Marketplace Auto Review, this role must produce compact, stage-friendly payloads that can be scheduled by the Auto Review service without node canvas.

### 9.10 Execution Producer

Schedules generation using existing platform tools. It manages batching, dependencies, progress, retry windows, and partial completion.

### 9.11 QA Supervisor

Aggregates QA verdicts and decides:

- pass,
- warn,
- repair,
- pause for user,
- terminal failure.

### 9.12 Repair Director

Creates targeted repair plans without changing approved facts or replacing passed outputs unnecessarily.

### 9.13 Render Preflight Director

Verifies before final render:

- all clips exist,
- order is correct,
- durations sum correctly,
- audio track is continuous,
- subtitles fit,
- product claims match evidence,
- render settings match platform,
- output path and library metadata are ready.

---

## 10. Core Data Contracts

### 10.1 Automation Request

```ts
interface ProductionAutomationRequest {
  schemaVersion: "1.0";
  requestId: string;
  tenantId: string;
  userId: string;
  originSurface:
    | "marketplace_capture"
    | "media_studio_production"
    | "media_studio_video_shot"
    | "storyboard_review";
  action:
    | "create_storyboard"
    | "create_video"
    | "auto_create_review_video"
    | "auto_complete_project"
    | "create_new_variation";
  automationMode:
    | "storyboard_only"
    | "video_auto"
    | "auto_with_review_on_blockers"
    | "manual_review";
  productionProjectId?: string;
  marketplaceCaptureId?: string;
  marketplaceProductId?: string;
  selectedVariantSnapshot?: ProductVariantSnapshot;
  accessSnapshot?: MarketplaceAutomationAccessSnapshot;
  evidenceFreshnessSnapshot?: ProductEvidenceFreshnessSnapshot;
  productReferenceAssetPack?: ProductReferenceAssetPack;
  characterIdentityAssetPack?: CharacterIdentityAssetPack;
  assetRightsEnvelope?: AssetRightsEnvelope;
  evidenceInstructionFirewall?: MarketplaceEvidenceInstructionFirewall;
  creativeBriefSnapshot?: ProductionCreativeBriefSnapshot;
  productLibraryId?: string;
  sourceVideoIdForVariation?: string;
  selectedProductImageIds: string[];
  selectedAssetIds: string[];
  targetPlatform: "tiktok" | "reels" | "shorts" | "shopee" | "tiktok_shop" | "generic";
  language: string;
  durationSec: number;
  aspectRatio: "9:16" | "1:1" | "16:9" | "4:5";
  desiredShotCount?: 6 | 7 | 8 | 9 | 10 | 12 | 15;
  budgetPolicy: ProductionBudgetPolicy;
  userCreativeHints?: string[];
  userAvoidList?: string[];
  requireUserConceptChoice?: boolean;
  idempotencyKey: string;
}
```

### 10.2 Budget Policy

```ts
interface ProductionBudgetPolicy {
  maxLlmCredits: number;
  maxProviderCredits: number;
  maxRenderCredits: number;
  maxTotalCredits: number;
  allowAutoReserveProviderCredits: boolean;
  allowAutoRepairSpend: boolean;
  maxRepairAttemptsPerStage: number;
  maxTotalRepairAttempts: number;
  stopIfEstimateExceedsBudget: boolean;
}
```

### 10.2.1 Production Creative Brief Snapshot

The creative brief snapshot is the goal-first decision contract for each run. It prevents Agents from guessing core creative intent from product data alone and makes auto-selection, repair, and later invalidation explainable.

```ts
interface ProductionCreativeBriefSnapshot {
  schemaVersion: "1.0";
  runId: string;
  source:
    | "marketplace_default"
    | "production_project_goal"
    | "user_prompt"
    | "tenant_default"
    | "campaign_brief"
    | "prior_library_variation";
  action:
    | "create_storyboard"
    | "create_video"
    | "auto_create_review_video"
    | "auto_complete_project"
    | "create_new_variation";
  objective:
    | "product_review"
    | "buyer_checklist"
    | "unboxing"
    | "use_case_demo"
    | "comparison_safe"
    | "brand_story"
    | "ugc_style"
    | "tutorial"
    | "offer_explainer"
    | "creative_exploration";
  targetAudience: {
    label: string;
    buyerStage: "awareness" | "consideration" | "decision" | "post_purchase" | "unspecified";
    useContext?: string;
    locale: "th" | "en" | "mixed" | "auto";
  };
  viewerPromise: {
    safeSummary: string;
    claimEvidenceRefs: string[];
    volatileClaimRefs: string[];
    requiresApprovalRefs: string[];
  };
  creativeLatitude: "conservative" | "balanced" | "exploratory";
  qualityMode: "fast_draft" | "balanced" | "high_confidence";
  autoDecisionPolicy: {
    allowAutoConceptSelection: boolean;
    allowAutoRepair: boolean;
    requireHumanReviewIfAmbiguous: boolean;
    maxConceptOptions: number;
    maxAcceptedRisk: "low" | "medium" | "review_required";
  };
  stylePreferences: {
    tone: Array<"friendly" | "expert" | "premium" | "playful" | "calm" | "creator_review" | "direct_response">;
    languageRegister: "thai_polite" | "thai_casual" | "thai_creator" | "english" | "mixed";
    pacing: "slow_clear" | "balanced" | "fast_social";
    cameraLanguage?: string[];
    avoidStyles: string[];
  };
  ctaIntent: "none" | "soft_check" | "learn_more" | "shop_now" | "compare_options" | "custom";
  userHints: Array<{
    text: string;
    provenance: "user" | "tenant_default" | "campaign" | "prior_asset";
    trustLevel: "style_only" | "claim_requires_evidence" | "approved_claim";
    evidenceRefs: string[];
  }>;
  avoidList: string[];
  decisionRefs: {
    budgetPolicyRef?: string;
    distributionProfileRef?: string;
    brandPolicyRef?: string;
    campaignGovernanceRef?: string;
    policyRulePackRef?: string;
  };
  ambiguityStatus: "clear" | "safe_defaults_applied" | "needs_review" | "blocked";
  snapshotHash: string;
  createdAt: string;
}
```

Creative brief rules:

- Marketplace one-click automation may create a default brief, but the default must be persisted and visible in sanitized timeline/detail projection.
- User hints are style or intent guidance by default, not product evidence.
- Seller copy, marketplace OCR, reviews, filenames, and prior AI output cannot become brief instructions unless they pass the evidence instruction firewall and are reduced to safe style, fact, or claim refs.
- A hint that implies a claim, comparison, performance result, discount, urgency, rating, certification, health/beauty/body effect, or official status must map to evidence/approval refs before concept generation can use it.
- Auto-selection must cite the brief fields it optimized for: objective, target audience, platform, quality mode, creative latitude, and allowed risk.
- `high_confidence` mode must prefer more QA, stricter auto-selection, and fewer risky creative leaps; `fast_draft` may reduce optional variants but cannot bypass product truth, policy, credit, or media QA.
- `exploratory` creative latitude may diversify hooks and story shapes, but cannot loosen product truth, ad policy, product reference, or rights constraints.
- Brief changes are input changes. They must create `RunInputChangeImpactEnvelope` before downstream refs are reused.

### 10.3 Runtime State

```ts
type ProductionAutomationStatus =
  | "created"
  | "intake_validating"
  | "concept_generating"
  | "concept_selected"
  | "storyboard_planning"
  | "storyboard_qa"
  | "media_payload_configuring"
  | "credit_estimating"
  | "awaiting_credit_authorization"
  | "provider_generating"
  | "asset_qa"
  | "repairing"
  | "handoff_ready"
  | "render_preflight"
  | "rendering"
  | "final_qa"
  | "completed"
  | "completed_with_warnings"
  | "blocked_needs_user"
  | "failed_terminal"
  | "cancelled";
```

Marketplace Capture Auto Review already exposes the simpler durable statuses `queued`, `running`, `waiting_provider`, `completed`, `failed`, and `cancelled`. Feature 117 may add richer internal agent/checkpoint status, but the user-visible Marketplace run must continue to map cleanly to those statuses unless the database contract is explicitly migrated.

For the current Marketplace Auto Review implementation, the stage keys are the canonical coarse-grained checkpoints:

```ts
type MarketplaceAutoReviewStageKey =
  | "product_preflight"
  | "production_project"
  | "concept_story"
  | "prompt_plan"
  | "image_generation"
  | "storyboard_review"
  | "video_generation"
  | "audio_generation"
  | "video_edit"
  | "render"
  | "library_finalize";
```

Agent-specific substeps, QA verdicts, and repair decisions must be persisted under these stages or under a versioned successor table. They must not live only in transient SDK trace data.

#### 10.3.1 Stage Completion Evidence

The backend must derive status changes from a stage completion evidence envelope. This envelope is the transition guard for automatic advancement, manual advancement, recovery, and migration/backfill.

```ts
interface MarketplaceAutoReviewStageCompletionEvidence {
  schemaVersion: "1.0";
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  attemptId: string;
  requestedTransition:
    | "complete"
    | "complete_with_warnings"
    | "skip"
    | "repair_required"
    | "fail_retriable"
    | "block_needs_user"
    | "fail_terminal"
    | "cancel";
  transitionAllowed: boolean;
  requiredEvidence: Array<{
    kind:
      | "product_evidence"
      | "agent_artifact"
      | "provider_task"
      | "generated_media_acceptance"
      | "product_reference_pack"
      | "character_identity_pack"
      | "qa_verdict"
      | "shot_frame_vision_qa"
      | "targeted_repair"
      | "credit_event"
      | "approval_decision"
      | "policy_snapshot"
      | "policy_rule_pack"
      | "creative_brief"
      | "access_snapshot"
      | "freshness_snapshot"
      | "asset_rights"
      | "privacy_redaction"
      | "evidence_instruction_firewall"
      | "audio_rights_mix"
      | "distribution_profile"
      | "synthetic_disclosure"
      | "cta_landing_integrity"
      | "quality_calibration"
      | "post_publish_governance"
      | "campaign_governance"
      | "brand_voice_policy"
      | "human_review_queue"
      | "input_change_impact"
      | "provider_event"
      | "payload_budget"
      | "storage_quota"
      | "retry_dlq"
      | "artifact_lineage"
      | "storage_or_rehost"
      | "render_job"
      | "publishable_package";
    required: boolean;
    present: boolean;
    refs: string[];
    missingReason?: string;
  }>;
  blockingReasonCodes: string[];
  warningReasonCodes: string[];
  nextAction?: MarketplaceAutoReviewTimelineItem["blocker"]["nextAction"];
  evaluatedBy: "system" | "background_worker" | "operator" | "migration";
  evaluatedAt: string;
  idempotencyKey: string;
}
```

Completion evidence rules:

- `complete` requires all required evidence kinds to be present and non-blocking for the stage and output mode.
- `complete_with_warnings` requires explicit policy allowance or approval refs for every warning that affects user-visible output.
- `skip` requires a policy reason and proof that the skipped stage is not required for the selected output mode.
- `repair_required` requires exact failed-unit refs, QA verdict refs, targeted repair plan refs, retry budget state, and credit reservation/release state when spend may be reused.
- `fail_retriable` requires provider event refs, retry/DLQ policy refs, next retry window, and idempotency key.
- `block_needs_user`, `fail_terminal`, and `cancel` require durable reason codes, safe next action, and credit reconciliation state when spend was reserved.
- The required-evidence matrix must be explicit for each `stageKey + outputMode + requestedTransition` combination. It must not rely on a generic "artifact exists" check.
- Timeline projection must be built from stage status plus completion evidence, not raw status strings alone.
- Operator recovery cannot create completion evidence manually unless it attaches verified artifact, QA, credit, policy, and lineage refs.

#### 10.3.2 Timeline Status Projection

The product UI must not infer progress from raw stage keys alone. The backend must return or construct a stable timeline projection from canonical run/stage state so the user can clearly see:

- what has already completed,
- what is running now,
- what is waiting for provider/credit/user action,
- what failed or needs repair,
- what remains before Storyboard Review or final video output.

```ts
type MarketplaceAutoReviewTimelineItemStatus =
  | "pending"
  | "active"
  | "waiting_provider"
  | "qa_running"
  | "repairing"
  | "awaiting_user"
  | "completed"
  | "completed_with_warnings"
  | "completion_evidence_blocked"
  | "failed"
  | "cancelled"
  | "skipped";

interface MarketplaceAutoReviewTimelineItem {
  stageKey: MarketplaceAutoReviewStageKey;
  order: number;
  labelTh: string;
  summaryTh: string;
  status: MarketplaceAutoReviewTimelineItemStatus;
  startedAt?: string;
  completedAt?: string;
  progressPercent?: number;
  activeAgentRoleLabelTh?: string;
  qaSummary?: {
    gate: string;
    status: "not_started" | "running" | "pass" | "pass_with_warnings" | "needs_repair" | "blocked";
    reasonCodes: string[];
  };
  creditSummary?: {
    estimate?: number;
    reserved?: number;
    spent?: number;
    refunded?: number;
    status: "not_required" | "estimating" | "reserved" | "awaiting_authorization" | "spent" | "released" | "failed";
  };
  blocker?: {
    reasonCode: string;
    messageTh: string;
    nextAction:
      | "approve_credit"
      | "approve_or_remove_claim"
      | "select_better_product_image"
      | "upload_product_reference"
      | "approve_limited_visual_use"
      | "approve_warning_text"
      | "retry_failed_stage"
      | "open_manual_review"
      | "cancel";
  };
  repairSummary?: {
    attemptCount: number;
    maxAttempts: number;
    target: "claim" | "storyboard" | "frame" | "clip" | "audio" | "warning_overlay" | "render" | "final_output";
  };
  outputRefs?: Array<{
    kind: "storyboard_review" | "video_editor_project" | "library_item" | "media_task" | "render_job";
    id: string;
    url?: string;
  }>;
  substeps?: Array<{
    key: string;
    labelTh: string;
    status: MarketplaceAutoReviewTimelineItemStatus;
  }>;
}

interface MarketplaceAutoReviewTimelineProjection {
  schemaVersion: "1.0";
  runId: string;
  outputMode: "storyboard_images" | "full_video";
  currentStageKey: MarketplaceAutoReviewStageKey;
  currentStepLabelTh: string;
  completedStageCount: number;
  totalStageCount: number;
  percentComplete: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
  items: MarketplaceAutoReviewTimelineItem[];
  nextAction?: MarketplaceAutoReviewTimelineItem["blocker"]["nextAction"];
  canCancel: boolean;
  canManualAdvance: boolean;
  lastUpdatedAt: string;
}
```

Timeline rules:

- `items` must always be sorted by stage order.
- Storyboard mode must show exactly the storyboard-stage path through `storyboard_review`.
- Full video mode must show the full path through `library_finalize`.
- Completed stages must stay visible after completion, including warnings and output links.
- The current active item must be visually distinct from pending and completed items.
- Provider-wait, credit-wait, QA-running, repairing, blocked, failed, and skipped states must be explicit.
- Timeline labels should be Thai user-facing labels, not raw internal framework names.
- The projection may include compact substeps for Agents, QA, credit, provider, repair, and render work, but substeps must not replace the canonical stage list.
- The projection must be regenerated from persisted run/stage/artifact state so resume and refresh remain correct.

#### 10.3.3 API Projection And Compatibility

The current Marketplace Capture router exposes `startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, and `cancelAutoReviewRun`. Feature 117 should keep these APIs compatible or replace them with an explicit versioned successor. The default implementation should prefer additive response fields so existing clients can keep reading `status`, `currentStage`, `stageIndex`, `stageCount`, `stages`, `metadataJson`, `resultJson`, and `links`.

```ts
interface MarketplaceAutoReviewApiProjection {
  schemaVersion: "2.0";
  run: MarketplaceAutoReviewRunSummary;
  timeline: MarketplaceAutoReviewTimelineProjection;
  approvalsSummary: {
    pendingCount: number;
    requiredDecisionTypes: MarketplaceAutoReviewApprovalDecision["decisionType"][];
  };
  policySnapshotRefs: string[];
  artifactLineageRefs: string[];
  redaction: {
    rawPromptsHidden: boolean;
    signedUrlsHidden: boolean;
    providerPayloadsHidden: boolean;
  };
}

interface MarketplaceAutoReviewRunSummary {
  id: string;
  productId: string;
  selectedVariantHash?: string;
  outputMode: "storyboard_images" | "full_video";
  frameStrategy: string;
  audioStrategy?: string;
  status: "queued" | "running" | "waiting_provider" | "completed" | "failed" | "cancelled";
  statusDetail?: ProductionAutomationStatus;
  currentStage: MarketplaceAutoReviewStageKey;
  stageIndex: number;
  stageCount: number;
  links: {
    productionProject?: string | null;
    storyboardReview?: string | null;
    videoEditor?: string | null;
    libraryItem?: string | null;
  };
  updatedAt: string;
}
```

API rules:

- `getAutoReviewRun` should return the full projection, including timeline, approvals summary, policy snapshot refs, artifact lineage refs, and sanitized output links.
- `listAutoReviewRuns` should return a lightweight summary projection plus a compact timeline summary, not full raw trace, provider payloads, QA crops, long prompts, or signed URLs.
- old clients must not crash if Feature 117 fields are absent; new clients must not infer missing timeline state from raw strings when the projection exists.
- versioning must be explicit in `schemaVersion` or equivalent metadata so rollout can support old Feature 118 rows and new Feature 117 rows together.
- UI-facing responses must redact signed URLs, provider credentials, raw provider payloads, raw prompts where policy requires, OCR crops containing private data, and internal stack traces.

### 10.4 Creative Concept Output

```ts
interface CreativeConceptSet {
  schemaVersion: "1.0";
  concepts: Array<{
    conceptId: string;
    dimension:
      | "problem_solution"
      | "objection_trust"
      | "quick_demo"
      | "use_case_moment"
      | "cinematic_review"
      | "comparison_without_false_claims"
      | "post_purchase_experience"
      | "trend_safe_social_short";
    title: string;
    hook: string;
    hookType:
      | "curiosity_gap"
      | "problem_moment"
      | "unexpected_use_case"
      | "proof_first"
      | "myth_correction"
      | "before_buy_check"
      | "soft_challenge"
      | "creator_observation";
    hookTruthRisk: "low" | "medium" | "high";
    hookComplianceNotes: string[];
    storyPremise: string;
    emotionalArc: string;
    cameraGrammar: string;
    voiceoverStyle: string;
    naturalSpeechProfile: {
      language: string;
      tone: "creator_review" | "calm_expert" | "friendly_demo" | "premium_editorial" | "problem_solver";
      targetWordsPerMinute: number;
      bannedPhrases: string[];
      mustSoundLike: string[];
    };
    proofPlan: Array<{
      shotOrder: number;
      claimText: string;
      evidenceIds: string[];
      proofType: "visible_product_detail" | "spec" | "usage_context" | "comparison_boundary" | "expectation_guard" | "user_approved";
    }>;
    adComplianceProfile: AdvertisingComplianceProfile;
    productClaimsUsed: string[];
    evidenceIds: string[];
    noveltyFingerprint: {
      hookPattern: string;
      sceneArc: string;
      cameraGrammar: string;
      voiceoverRhythm: string;
      ctaStyle: string;
    };
    noveltyScore: number;
    evidenceSafetyScore: number;
    creativeQualityScore: number;
    adComplianceScore: number;
    completionProbabilityScore: number;
    estimatedCostTier: "low" | "medium" | "high";
    risks: ProductionRisk[];
  }>;
  recommendedConceptId: string;
  recommendationReason: string;
  rejectedConceptIds: string[];
}
```

### 10.5 Creative Quality And Compliance Contracts

```ts
interface AdvertisingComplianceProfile {
  schemaVersion: "1.0";
  regionProfile: "global_default" | "us_ftc" | "eu_consumer" | "thailand" | "platform_specific";
  platformProfile: "generic" | "tiktok" | "shopee" | "reels" | "shorts";
  rulePackRef: {
    rulePackId: string;
    version: string;
    evaluatedRuleIds: string[];
  };
  netImpressionSummary: string;
  claims: Array<{
    claimId: string;
    text: string;
    location: "hook" | "voiceover" | "caption" | "onscreen_text" | "scene_premise" | "cta" | "metadata";
    evidenceIds: string[];
    substantiationLevel: "visible" | "marketplace_field" | "spec" | "user_approved" | "missing";
    risk:
      | "none"
      | "unsupported_claim"
      | "material_omission"
      | "exaggerated_superlative"
      | "fake_urgency"
      | "fake_social_proof"
      | "endorsement_or_testimonial"
      | "regulated_category"
      | "synthetic_media_disclosure"
      | "thailand_ocpb_false_or_exaggerated"
      | "thailand_fda_health_product_claim"
      | "thailand_fda_ad_permission_required"
      | "thai_label_or_license_mismatch"
      | "platform_policy_sensitive";
    allowed: boolean;
    triggeredRuleIds: string[];
    requiredDisclosure?: string;
  }>;
  blockedPhrases: string[];
  requiredDisclosures: string[];
  requiredVisualWarnings: AdvertisingVisualWarningPlan[];
  reviewerNotes: string[];
}

interface AdvertisingVisualWarningPlan {
  schemaVersion: "1.0";
  warningId: string;
  regionProfile: "global_default" | "thailand" | "platform_specific";
  trigger:
    | "regulated_product"
    | "health_product"
    | "food_or_supplement"
    | "cosmetic"
    | "medical_device"
    | "affiliate_or_sponsored"
    | "synthetic_media"
    | "material_limitation"
    | "user_approved";
  approvedText: string;
  language: string;
  sourceEvidenceIds: string[];
  placement: {
    surface: "storyboard_frame" | "video_overlay" | "caption" | "end_card" | "product_card";
    preferredRegion: "top" | "bottom" | "lower_third" | "end_card_center" | "safe_area";
    avoidCoveringProduct: true;
    avoidCoveringFace: true;
    safeAreaRequired: true;
  };
  typography: {
    minFontPx1080x1920: number;
    contrastRatioMin: number;
    maxLines: number;
    backgroundTreatment: "none" | "solid_scrim" | "translucent_scrim" | "outline";
  };
  timing: {
    startSeconds: number;
    endSeconds: number;
    minVisibleSeconds: number;
    persistentForFullAd: boolean;
  };
  renderMode: "deterministic_overlay_only";
  qa: {
    requireOcrVerification: true;
    requireExactTextMatch: true;
    requireReadabilityPass: true;
  };
}

interface AdvertisingPolicyRulePack {
  schemaVersion: "1.0";
  rulePackId: string;
  version: string;
  status: "draft" | "approved" | "deprecated" | "blocked";
  appliesTo: {
    regionProfiles: Array<"global_default" | "thailand" | "platform_specific">;
    platforms: Array<"tiktok" | "reels" | "shorts" | "shopee" | "tiktok_shop" | "generic">;
    productCategoryTriggers: string[];
    languageTags: string[];
  };
  sourceAnchors: Array<{
    sourceType: "official_guidance" | "platform_policy" | "tenant_policy" | "legal_review" | "internal_policy";
    label: string;
    url?: string;
    retrievedAt?: string;
    sourceVersion?: string;
  }>;
  rules: Array<{
    ruleId: string;
    category:
      | "truthfulness"
      | "substantiation"
      | "net_impression"
      | "endorsement_or_affiliate_disclosure"
      | "regulated_product"
      | "thai_fda_or_ocpb"
      | "platform_policy"
      | "visual_warning"
      | "thumbnail_or_metadata"
      | "privacy_or_rights";
    severity: "allow" | "warn" | "requires_approval" | "block";
    triggerSignals: string[];
    blockedPatterns: string[];
    requiredEvidenceKinds: string[];
    requiredWarningTemplateIds: string[];
    allowedRepairActions: Array<"rewrite_claim" | "remove_claim" | "add_disclosure" | "add_warning_overlay" | "request_review" | "block">;
    fixtureRefs: string[];
  }>;
  approval: {
    approvedBy: "system_policy" | "admin" | "legal_review" | "tenant_policy";
    approvedAt?: string;
    expiresAt?: string;
  };
  effectiveFrom: string;
  effectiveTo?: string;
}

interface ProductVariantSnapshot {
  schemaVersion: "1.0";
  snapshotId: string;
  productId: string;
  captureId?: string;
  selectedVariantHash: string;
  selectedOptions: Array<{
    name: string;
    value: string;
    evidenceIds: string[];
  }>;
  sellerSku?: string;
  variantImageIds: string[];
  priceSnapshotId?: string;
  priceText?: string;
  stockText?: string;
  volatileSignalPolicy: "do_not_claim" | "claim_only_if_approved_for_run";
  capturedAt?: string;
  confidence: number;
}

interface MarketplaceAutomationAccessSnapshot {
  schemaVersion: "1.0";
  productId: string;
  actorUserId: string;
  actorTenantId?: string;
  productOwnerUserId: string;
  accessType: "owner" | "group";
  groupShare?: {
    groupId: number;
    sharedByUserId: string;
    permission: "read" | "read_update";
  };
  allowedActions: Array<
    | "read_product"
    | "use_as_reference"
    | "create_private_output"
    | "update_product_evidence"
    | "share_output_to_product_group"
  >;
  creditPayer: {
    scope: "actor_user" | "actor_tenant" | "product_owner_tenant";
    userId?: string;
    tenantId?: string;
  };
  backgroundAdvanceActor: "actor_delegated" | "system_recheck_required";
  resolvedAt: string;
}

interface ProductEvidenceFreshnessSnapshot {
  schemaVersion: "1.0";
  productId: string;
  latestCaptureId?: string;
  latestPriceSnapshotId?: string;
  productUpdatedAt?: string;
  latestMetricCapturedAt?: string;
  latestImageVerifiedAt?: string;
  rawEvidenceState: "available" | "partially_purged" | "purged" | "unknown";
  sourcePageState: "not_checked" | "reachable" | "changed" | "unreachable" | "requires_recapture";
  imageReadiness: Array<{
    imageId: string;
    source: "platform_storage" | "marketplace_remote" | "user_upload" | "library";
    usableForGeneration: boolean;
    needsRehostBeforeSpend: boolean;
    reason?: string;
  }>;
  freshnessClass: "fresh" | "usable_with_limits" | "stale_needs_review" | "blocked";
  blockedVolatileClaimTypes: Array<"price" | "discount" | "stock" | "rating" | "sold_count" | "review_count" | "commission" | "campaign">;
}

interface ProductReferenceAssetPack {
  schemaVersion: "1.0";
  packId: string;
  runId: string;
  productId: string;
  selectedVariantHash?: string;
  primaryReference: ProductReferenceAsset;
  supportReferences: ProductReferenceAsset[];
  rejectedReferences: Array<{
    imageId: string;
    source: "platform_storage" | "marketplace_remote" | "user_upload" | "library";
    reason:
      | "low_resolution"
      | "product_not_visible"
      | "collage_or_multi_product"
      | "wrong_variant"
      | "rights_blocked"
      | "remote_not_rehosted"
      | "private_or_pii_risk"
      | "watermark_or_platform_ui_dominant"
      | "misleading_claim_text"
      | "unsupported_logo_badge_or_certification";
    evidenceRefs: string[];
  }>;
  identityAnchors: {
    productVisualIdentityLockRef: string;
    protectedAttributeRefs: string[];
    visualFingerprintRefs: string[];
    cropRefs: string[];
    maskRefs: string[];
    labelOcrRefs: string[];
  };
  providerUsePolicy: "approved_for_visual_generation" | "storyboard_only" | "needs_better_image" | "blocked";
  requiredUserAction?: "select_better_image" | "upload_product_reference" | "approve_limited_visual_use" | "cancel_visual_generation";
  qaRefs: string[];
  preparedAt: string;
}

interface ProductReferenceAsset {
  imageId: string;
  assetRef: string;
  evidenceId: string;
  role: "primary_hero" | "variant_reference" | "detail_reference" | "packaging_reference" | "scale_reference";
  source: "platform_storage" | "marketplace_remote_rehosted" | "user_upload" | "library";
  width: number;
  height: number;
  quality: "high" | "usable" | "usable_with_limits" | "low" | "blocked";
  productRegion?: { x: number; y: number; width: number; height: number };
  perceptualHashRef?: string;
  sourceImageHash: string;
  visibleTextPolicy: "preserve_as_product_identity" | "ignore_as_untrusted_claim" | "block_if_used_as_claim";
  allowedTransformations: Array<"crop_resize" | "background_context" | "lighting_match" | "deterministic_overlay_only">;
}

interface AssetRightsEnvelope {
  schemaVersion: "1.0";
  runId: string;
  assets: Array<{
    assetId: string;
    assetKind: "product_image" | "marketplace_screenshot" | "seller_logo" | "brand_logo" | "review_image" | "user_upload" | "library_asset";
    rightsSource: "user_provided" | "marketplace_sourced" | "brand_provided" | "platform_generated" | "unknown";
    allowedUse:
      | "exact_product_reference_only"
      | "commercial_generation_allowed"
      | "internal_evidence_only"
      | "blocked";
    restrictions: string[];
    approvalId?: string;
  }>;
  standaloneBrandUseAllowed: boolean;
  marketplaceBadgeUseAllowed: false;
  resolvedAt: string;
}

interface MarketplaceAutoReviewProviderEventEnvelope {
  schemaVersion: "1.0";
  tenantId: string;
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  mediaTaskId?: string;
  providerName: string;
  providerTaskId: string;
  eventId: string;
  eventFingerprint: string;
  eventSource: "webhook_callback" | "provider_poll" | "operator_reconcile";
  eventType:
    | "submitted"
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "expired"
    | "refused"
    | "unknown";
  receivedAt: string;
  providerEventCreatedAt?: string;
  providerSequence?: string;
  signature: {
    mode: "verified" | "not_supported" | "poll_result" | "operator_verified" | "failed";
    keyId?: string;
    rawBodyHash?: string;
    timestampSkewMs?: number;
  };
  idempotencyKey: string;
  stateTransition: {
    beforeStatus: string;
    afterStatus?: string;
    terminal: boolean;
    accepted: boolean;
    ignoredReason?:
      | "duplicate_event"
      | "stale_event"
      | "out_of_order_terminal"
      | "task_mismatch"
      | "tenant_run_mismatch"
      | "signature_failed"
      | "payload_over_budget";
  };
  redactedPayloadRef?: string;
  rawPayloadRetentionPolicyId?: string;
}

interface MarketplaceAutoReviewPayloadBudget {
  schemaVersion: "1.0";
  runId: string;
  maxProductEvidenceItems: number;
  maxProductImageRefs: number;
  maxPromptCharsPerAgentCall: number;
  maxStageOutputBytes: number;
  maxTraceBytesRetained: number;
  maxListProjectionBytes: number;
  maxProviderPayloadBytes: number;
  overflowBehavior: "summarize_and_link" | "redact_and_link" | "block_before_spend";
  redactedBlobPolicyId?: string;
  evaluatedAt: string;
}

interface MarketplaceAutoReviewStorageQuotaPlan {
  schemaVersion: "1.0";
  tenantId: string;
  userId: string;
  runId: string;
  estimatedIntermediateBytes: number;
  estimatedFinalBytes: number;
  maxIntermediateBytes: number;
  maxFinalBytes: number;
  storageQuotaState: "ok" | "near_limit" | "blocked";
  cleanupCandidateRefs: string[];
  requiredRehostRefs: string[];
  transcodeProfile: {
    container: "mp4";
    videoCodec: "h264" | "copy_if_browser_compatible";
    audioCodec: "aac" | "none";
    maxDurationSeconds: number;
    maxWidth: number;
    maxHeight: number;
    maxOutputBytes: number;
  };
  evaluatedAt: string;
}

interface MarketplaceAutoReviewRetryDlqPolicy {
  schemaVersion: "1.0";
  stageKey: MarketplaceAutoReviewStageKey;
  failureClass:
    | "transient_provider"
    | "provider_refusal"
    | "gateway_unavailable"
    | "quota_blocked"
    | "payload_over_budget"
    | "storage_rehost_failed"
    | "render_failed"
    | "qa_failed"
    | "policy_blocked";
  retryable: boolean;
  maxAttempts: number;
  backoffStrategy: "none" | "fixed" | "exponential";
  retryBudgetCreditLimit?: number;
  deadLetterAfterAttempts?: number;
  staleLeaseMs: number;
  alertAfterMs: number;
  replayAllowed: boolean;
}

interface MarketplaceEvidencePrivacyEnvelope {
  schemaVersion: "1.0";
  runId: string;
  sourceRefs: string[];
  redactionStatus: "passed" | "redacted" | "blocked";
  piiFindings: Array<{
    ref: string;
    kind:
      | "account_header"
      | "order_or_payment"
      | "cart_or_checkout"
      | "chat_or_message"
      | "phone"
      | "email"
      | "address"
      | "customer_username"
      | "customer_profile_photo"
      | "reviewer_identity"
      | "unrelated_person"
      | "private_seller_data";
    action: "removed" | "masked" | "internal_only" | "blocked";
  }>;
  allowedForAgentContextRefs: string[];
  blockedForGenerationRefs: string[];
  finalMediaPrivacyRisk: "low" | "medium" | "high" | "blocked";
  evaluatedAt: string;
}

interface MarketplaceEvidenceInstructionFirewall {
  schemaVersion: "1.0";
  runId: string;
  sourceRefs: string[];
  privacyEnvelopeRef: string;
  rulePackRef: string;
  firewallStatus: "passed" | "passed_with_quarantine" | "blocked";
  evidenceContextPolicy: "structured_refs_only" | "quoted_escaped_blocks" | "blocked";
  detectedInstructionFindings: Array<{
    ref: string;
    sourceKind:
      | "marketplace_dom"
      | "marketplace_ocr"
      | "seller_description"
      | "review_text"
      | "rating_summary"
      | "image_alt_text"
      | "filename"
      | "comment"
      | "uploaded_evidence"
      | "prior_ai_output";
    pattern:
      | "ignore_or_override_instruction"
      | "fake_tool_call"
      | "fake_schema_or_json_contract"
      | "policy_bypass_request"
      | "credit_or_budget_instruction"
      | "provider_or_model_routing_instruction"
      | "hidden_text_or_css"
      | "credential_or_secret_request"
      | "output_routing_instruction"
      | "prompt_template_fragment";
    action: "quarantined" | "escaped_as_data" | "reduced_to_fact_ref" | "blocked";
    safeFactRefs: string[];
  }>;
  allowedForAgentContextRefs: string[];
  quarantinedRefs: string[];
  blockedRefs: string[];
  blockedReasonCodes: string[];
  confidence: "high" | "medium" | "low";
  createdBeforeGatewaySpend: boolean;
  evaluatedAt: string;
}

interface AudioRightsAndMixEnvelope {
  schemaVersion: "1.0";
  runId: string;
  audioRefs: Array<{
    refId: string;
    role: "tts_voiceover" | "native_video_audio" | "music_bed" | "sound_effect" | "uploaded_reference" | "silence";
    source: "provider_generated" | "platform_stock" | "user_uploaded" | "library_asset" | "none";
    commercialUseAllowed: boolean;
    attributionRequired: boolean;
    attributionText?: string;
    voiceConsentApprovalId?: string;
    licensePolicyId?: string;
    restrictions: string[];
  }>;
  mixTargets: {
    loudnessLufs?: number;
    voicePeakDb?: number;
    musicUnderVoiceDb?: number;
    maxSilenceMs?: number;
  };
  status: "passed" | "needs_approval" | "blocked";
}

interface MarketplaceAutoReviewDistributionProfile {
  schemaVersion: "1.0";
  runId: string;
  targetPlatform: "tiktok" | "instagram_reels" | "youtube_shorts" | "facebook" | "shopee" | "lazada" | "website" | "custom";
  placement?: "organic_post" | "paid_ad" | "product_page" | "story" | "reel" | "shorts" | "custom";
  aspectRatio: "9:16" | "1:1" | "4:5" | "16:9" | "custom";
  width: number;
  height: number;
  frameRate: number;
  durationRangeSeconds: { min: number; max: number };
  safeAreas: Array<{
    name: "caption" | "warning" | "cta" | "platform_ui" | "product_protection";
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  captionPolicy: {
    enabled: boolean;
    language: "th" | "en" | "mixed" | "auto";
    maxLines: number;
    maxCharsPerLine: number;
    minReadableSeconds: number;
  };
  warningOverlayPolicyRef?: string;
  loudnessTargetRef?: string;
  exportVariantRefs: string[];
}

interface CreativeFeedbackMemoryPolicy {
  schemaVersion: "1.0";
  tenantId: string;
  productId?: string;
  runId: string;
  allowedMemoryKinds: Array<"approved_concept_fingerprint" | "rejected_concept_fingerprint" | "qa_reason_code" | "user_feedback_score" | "platform_profile_result">;
  forbiddenMemoryKinds: Array<"raw_prompt" | "raw_provider_payload" | "product_private_evidence" | "customer_pii" | "unredacted_image" | "failed_output_as_positive_example">;
  isolation: "tenant_only" | "product_only" | "disabled";
  canImproveNoveltyForFutureRuns: boolean;
  canTrainExternalModel: false;
  retentionPolicyId: string;
  evaluatedAt: string;
}

interface SyntheticMediaDisclosureEnvelope {
  schemaVersion: "1.0";
  runId: string;
  generatedRefs: Array<{
    refId: string;
    mediaKind: "image" | "video" | "audio" | "voice" | "subtitle" | "overlay" | "metadata";
    aiGenerated: boolean;
    materiallySynthetic: boolean;
    usesSyntheticHuman: boolean;
    usesSyntheticVoice: boolean;
    disclosureRequired: boolean;
    disclosureText?: string;
    platformFlagRequired: boolean;
    provenanceMetadataRefs: string[];
    watermarkPolicy: "none" | "metadata_only" | "visible_disclosure" | "platform_flag" | "c2pa_if_available";
  }>;
  status: "passed" | "needs_disclosure" | "blocked";
  policySnapshotId: string;
  evaluatedAt: string;
}

interface CtaLandingIntegrityEnvelope {
  schemaVersion: "1.0";
  runId: string;
  ctaText?: string;
  sourceUrl?: string;
  affiliateUrl?: string;
  landingRefs: Array<{
    url: string;
    urlType: "source" | "affiliate" | "shop" | "campaign" | "custom";
    reachable: boolean;
    redirectSafe: boolean;
    matchesProductIdentity: boolean;
    matchesSelectedVariant: boolean | "not_applicable";
    offerClaimEvidenceIds: string[];
    volatileClaimsApproved: boolean;
    trackingPolicy: "allowed" | "strip_sensitive_params" | "blocked";
    checkedAt: string;
  }>;
  status: "passed" | "needs_refresh" | "needs_approval" | "blocked";
}

interface AutomationQualityCalibrationPolicy {
  schemaVersion: "1.0";
  runId: string;
  providerModelSnapshotId: string;
  qaPolicySnapshotId: string;
  fixtureSetId?: string;
  qaConfidenceThresholds: Record<string, number>;
  humanSpotCheck: {
    required: boolean;
    reasonCodes: string[];
    sampleRatePercent: number;
  };
  driftSignals: Array<
    | "model_version_changed"
    | "provider_capability_changed"
    | "qa_disagreement"
    | "fixture_regression"
    | "user_rejection_spike"
    | "policy_snapshot_changed"
  >;
  promotionGate: "allow" | "allow_internal_only" | "require_spot_check" | "block";
  evaluatedAt: string;
}

interface PostPublishGovernanceEnvelope {
  schemaVersion: "1.0";
  runId: string;
  libraryItemId?: string;
  exportVariantRefs: string[];
  allowedReuse: Array<"internal_review" | "download" | "manual_publish" | "auto_publish" | "template_reuse">;
  reviewBy?: string;
  expiresAt?: string;
  invalidationTriggers: Array<
    | "product_deleted"
    | "source_unreachable"
    | "offer_expired"
    | "rights_revoked"
    | "policy_changed"
    | "claim_disputed"
    | "privacy_complaint"
    | "provider_takedown"
    | "user_deleted_evidence"
  >;
  actionOnInvalidation: "warn" | "block_reuse" | "require_recheck" | "tombstone" | "unpublish_if_supported";
  externalPostRefs?: string[];
  auditRefs: string[];
}

interface CampaignGenerationGovernanceEnvelope {
  schemaVersion: "1.0";
  tenantId: string;
  userId: string;
  productId: string;
  runId: string;
  campaignId?: string;
  generationMode: "single" | "variation_set" | "campaign_batch";
  batchIntent?: "creative_exploration" | "platform_variants" | "localized_variants" | "refresh_existing_asset" | "manual_single_run";
  maxActiveRunsForProduct: number;
  maxVariantsPerProductPerDay: number;
  maxSimilarityScoreToRecentApprovedConcepts: number;
  spendCapCredits: number;
  rateLimitKeys: string[];
  duplicateDetectionRefs: string[];
  anomalySignals: Array<
    | "duplicate_concept_pattern"
    | "too_many_variants"
    | "abnormal_repair_spend"
    | "provider_refusal_spike"
    | "policy_risk_spike"
    | "tenant_budget_spike"
    | "same_product_campaign_flood"
  >;
  approvalRequiredForBatch: boolean;
  status: "passed" | "queued" | "needs_approval" | "blocked";
  evaluatedAt: string;
}

interface BrandVoiceAndSellerPolicyEnvelope {
  schemaVersion: "1.0";
  tenantId: string;
  productId: string;
  runId: string;
  sellerName?: string;
  brandName?: string;
  toneProfile: Array<"friendly" | "expert" | "premium" | "playful" | "calm" | "creator_review" | "direct_response">;
  languageRegister: "thai_polite" | "thai_casual" | "thai_creator" | "english" | "mixed";
  allowedPhrases: string[];
  requiredPhrases: string[];
  blockedPhrases: string[];
  competitorMentionPolicy: "forbidden" | "generic_only" | "allowed_with_evidence_and_approval";
  claimStylePolicy: "evidence_first" | "soft_recommendation" | "comparison_requires_approval" | "strict_neutral";
  ctaStylePolicy: "soft_shop_cta" | "direct_buy_cta" | "learn_more" | "no_cta";
  pronunciationHints: Array<{ term: string; pronunciation: string; language: string }>;
  evidenceRefs: string[];
  approvalId?: string;
  status: "passed" | "needs_approval" | "blocked";
}

interface HumanReviewQueuePolicy {
  schemaVersion: "1.0";
  runId: string;
  required: boolean;
  reasons: Array<
    | "regulated_category"
    | "high_volume_batch"
    | "budget_above_auto_policy"
    | "brand_policy_exception"
    | "competitor_or_comparison_claim"
    | "low_confidence_qa"
    | "synthetic_disclosure_required"
    | "rights_or_privacy_exception"
    | "post_publish_reuse_risk"
  >;
  approverRoles: Array<"owner" | "tenant_admin" | "brand_reviewer" | "legal_reviewer" | "policy_reviewer" | "operator">;
  scope: "single_run" | "batch" | "export_variant" | "post_publish_reuse";
  slaMinutes: number;
  timeoutAction: "block" | "continue_if_low_risk" | "fail_terminal";
  decisionRefs: string[];
  status: "not_required" | "queued" | "approved" | "rejected" | "repair_requested" | "expired";
}

interface PublishableAssetPackageEnvelope {
  schemaVersion: "1.0";
  runId: string;
  libraryItemId?: string;
  distributionProfileId: string;
  finalVideoRef: string;
  thumbnailRefs: Array<{
    refId: string;
    source: "render_frame" | "approved_generated_image" | "user_selected_frame";
    timestampSeconds?: number;
    overlayText?: string;
    productIdentityQaStatus: "passed" | "needs_repair" | "blocked";
    misleadingRiskStatus: "passed" | "needs_review" | "blocked";
  }>;
  subtitleRefs: Array<{
    refId: string;
    format: "burned_in" | "srt" | "vtt" | "ass" | "none";
    language: string;
    source: "approved_script" | "tts_alignment" | "asr_verified" | "manual_edit";
    timingStatus: "passed" | "needs_repair" | "blocked";
  }>;
  transcriptRef?: string;
  platformMetadata: Array<{
    platform: "tiktok" | "reels" | "shorts" | "facebook" | "shopee" | "lazada" | "website" | "custom";
    title?: string;
    captionOrDescription?: string;
    hashtags: string[];
    altText?: string;
    ctaText?: string;
    characterLimitStatus: "passed" | "needs_repair" | "not_applicable";
    evidenceRefs: string[];
    complianceStatus: "passed" | "needs_review" | "blocked";
  }>;
  metadataManifestRef: string;
  checksumRefs: string[];
  status: "passed" | "needs_repair" | "needs_review" | "blocked";
  evaluatedAt: string;
}

interface RunInputChangeImpactEnvelope {
  schemaVersion: "1.0";
  runId: string;
  previousSnapshotRefs: string[];
  currentSnapshotRefs: string[];
  detectedChanges: Array<{
    changeKind:
      | "product_field_changed"
      | "selected_variant_changed"
      | "product_image_added"
      | "product_image_removed"
      | "product_image_reordered"
      | "price_or_offer_snapshot_changed"
      | "source_url_or_landing_changed"
      | "evidence_retention_or_purge_changed"
      | "asset_rights_changed"
      | "privacy_redaction_changed"
      | "brand_policy_changed"
      | "distribution_profile_changed"
      | "warning_or_disclosure_policy_changed"
      | "human_review_decision_changed"
      | "storyboard_or_script_user_edit";
    refId: string;
    severity: "info" | "requires_recheck" | "invalidates_downstream" | "blocks_run";
  }>;
  impactedStages: Array<
    | "product_preflight"
    | "concept_story"
    | "prompt_plan"
    | "image_generation"
    | "storyboard_review"
    | "video_generation"
    | "audio_generation"
    | "video_edit"
    | "render"
    | "library_finalize"
  >;
  artifactActions: Array<{
    artifactRef: string;
    action: "preserve" | "recheck" | "repair" | "replan" | "regenerate" | "block_reuse" | "discard_if_unpublished";
    reasonCode: string;
  }>;
  invalidatedApprovalRefs: string[];
  invalidatedCreditEstimateRefs: string[];
  invalidatedQaRefs: string[];
  status: "no_change" | "recheck_required" | "repair_required" | "replan_required" | "blocked";
  evaluatedAt: string;
}

interface ShotFrameVisionQaEnvelope {
  schemaVersion: "1.0";
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  shotId: string;
  frameRole: "storyboard_grid_cell" | "storyboard_frame" | "start_frame" | "stop_frame" | "video_keyframe" | "thumbnail_cover" | "final_render_sample";
  frameRef: string;
  sourcePayloadRef: string;
  referenceProductImageRefs: string[];
  selectedVariantHash?: string;
  characterContinuityLockRef?: string;
  audioOrVoiceContextRef?: string;
  qaModelCallRef: string;
  gatewayUsageRef: string;
  checks: {
    productIdentity: "passed" | "needs_repair" | "blocked";
    selectedVariant: "passed" | "not_applicable" | "needs_repair" | "blocked";
    characterIdentity: "passed" | "not_applicable" | "needs_repair" | "blocked";
    visualQuality: "passed" | "needs_repair" | "blocked";
    storyAndPromptAlignment: "passed" | "needs_repair" | "blocked";
    textArtifactSafety: "passed" | "needs_repair" | "blocked";
    continuityEndpoint: "passed" | "not_applicable" | "needs_repair" | "blocked";
  };
  findings: Array<{
    code:
      | "product_mismatch"
      | "wrong_variant"
      | "product_distorted"
      | "missing_product"
      | "invented_product_detail"
      | "character_face_drift"
      | "speaking_identity_drift"
      | "bad_lipsync_or_voice_identity_cue"
      | "low_visual_quality"
      | "prompt_misalignment"
      | "unwanted_text_or_glyph"
      | "story_continuity_break"
      | "endpoint_mismatch";
    severity: "warning" | "blocking" | "terminal";
    evidenceRefs: string[];
  }>;
  status: "passed" | "needs_targeted_repair" | "blocked";
  evaluatedAt: string;
}

interface TargetedMediaUnitRepairPlan {
  schemaVersion: "1.0";
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  shotId: string;
  mediaUnit:
    | "storyboard_grid_cell"
    | "storyboard_frame"
    | "start_frame"
    | "stop_frame"
    | "video_keyframe"
    | "video_clip"
    | "audio_segment"
    | "subtitle_segment"
    | "thumbnail_cover";
  failedQaRef: string;
  repairAction: "regenerate_same_payload" | "regenerate_with_tighter_refs" | "switch_to_product_only" | "reuse_approved_reference" | "manual_review_required" | "block";
  preserveRefs: string[];
  invalidateRefs: string[];
  downstreamStagesToRecheck: MarketplaceAutoReviewStageKey[];
  maxAttempts: number;
  nextAttemptNumber: number;
  creditEstimateRef?: string;
  idempotencyKey: string;
  status: "planned" | "running" | "succeeded" | "failed" | "blocked";
}

interface GeneratedMediaAcceptanceEnvelope {
  schemaVersion: "1.0";
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  artifactRef: string;
  shotId?: string;
  mediaUnit:
    | "storyboard_grid_cell"
    | "storyboard_frame"
    | "start_frame"
    | "stop_frame"
    | "video_keyframe"
    | "video_clip"
    | "audio_segment"
    | "subtitle_segment"
    | "thumbnail_cover"
    | "final_render"
    | "metadata_manifest";
  sourceTaskRef?: string;
  sourceAttemptId: string;
  qaRefs: string[];
  repairPlanRefs: string[];
  acceptanceState:
    | "candidate"
    | "qa_pending"
    | "accepted"
    | "accepted_with_warnings"
    | "quarantined_failed_qa"
    | "quarantined_policy_blocked"
    | "superseded_by_repair"
    | "discarded";
  userVisible: boolean;
  allowedSurfaces: Array<
    | "internal_trace"
    | "repair_context"
    | "storyboard_review"
    | "video_editor"
    | "media_library"
    | "publishable_package"
    | "negative_feedback_memory_only"
  >;
  blockedSurfaces: Array<
    | "storyboard_review"
    | "video_editor"
    | "media_library"
    | "publishable_package"
    | "future_reference"
    | "positive_creative_memory"
  >;
  supersededByArtifactRef?: string;
  reasonCodes: string[];
  retentionPolicyId: string;
  evaluatedAt: string;
}

interface ProductVisualIdentityLock {
  schemaVersion: "1.0";
  productId: string;
  selectedVariantSnapshot?: ProductVariantSnapshot;
  referenceImageIds: string[];
  protectedAttributes: {
    category: string;
    shape: string[];
    proportions: string[];
    colorPalette: string[];
    materials: string[];
    logoAndLabel: string[];
    packaging: string[];
    visibleComponents: string[];
    scaleCues: string[];
  };
  forbiddenMutations: string[];
  allowedTransformations: Array<"crop" | "resize" | "background_context" | "lighting_match" | "minor_perspective" | "hands_interaction">;
  qaThresholds: {
    productPresenceMin: number;
    identitySimilarityMin: number;
    logoLabelAccuracyMin: number;
    colorDriftMax: number;
    shapeDriftMax: number;
  };
}

interface CharacterContinuityLock {
  schemaVersion: "1.0";
  continuityRequired: boolean;
  characterId: string;
  identityAssetPackRef?: string;
  role: "presenter" | "user" | "hand_model" | "background_actor" | "none";
  referenceImageIds: string[];
  referenceVoiceProfileId?: string;
  protectedAttributes: {
    faceVisibility: "required" | "allowed" | "avoid_face";
    ageRange?: string;
    skinTone?: string;
    hair?: string;
    wardrobe?: string;
    bodyType?: string;
    speakingVoice?: string;
  };
  riskyShotPatterns: Array<"turn_around_reveal" | "face_reentry" | "profile_to_front" | "occlusion_then_reveal" | "multi_person_scene">;
  allowedShotScopes: Array<"no_person" | "hands_only" | "single_shot" | "recurring_visible_face" | "recurring_voice_only">;
  mustNeverRevealFace: boolean;
  fallbackIfRisky: "product_only" | "hands_only" | "single_presenter_shot" | "generic_person" | "separate_tts" | "block_user";
}

interface CharacterIdentityAssetPack {
  schemaVersion: "1.0";
  runId: string;
  characterId: string;
  role: "presenter" | "user" | "hand_model" | "background_actor" | "voice_only" | "none";
  sourceKind:
    | "no_person"
    | "hands_only"
    | "synthetic_generic"
    | "approved_reference"
    | "library_persona_asset"
    | "user_uploaded_reference"
    | "provider_generated_seed";
  consentStatus: "not_required" | "approved" | "missing" | "revoked" | "blocked";
  consentApprovalRefs: string[];
  referenceImageRefs: string[];
  referenceVideoRefs: string[];
  voiceProfileRefs: string[];
  blockedReferenceRefs: Array<{
    ref: string;
    reason:
      | "no_consent"
      | "celebrity_or_public_figure_risk"
      | "customer_or_reviewer_identity"
      | "minor_or_age_sensitive"
      | "low_quality"
      | "face_not_visible"
      | "conflicting_identity"
      | "rights_blocked"
      | "privacy_blocked";
  }>;
  continuityDescriptors: {
    faceVisibilityPolicy: "no_face" | "face_allowed" | "face_required" | "single_shot_only";
    visibleFaceAnchors: string[];
    hairWardrobeBodyAnchors: string[];
    handsOrBodyAnchors: string[];
    voiceAnchors: string[];
    forbiddenDrift: string[];
  };
  providerUsePolicy: {
    allowFaceReference: boolean;
    allowVoiceReference: boolean;
    allowRecurringVisibleFace: boolean;
    allowLipSync: boolean;
    allowNativeVideoAudio: boolean;
    requireProductOnlyFallbackOnDrift: boolean;
  };
  qaThresholds: {
    faceContinuityMin?: number;
    wardrobeContinuityMin?: number;
    voiceContinuityMin?: number;
    lipSyncRiskMax?: number;
  };
  fallbackPlan: "product_only" | "hands_only" | "single_presenter_shot" | "generic_person" | "separate_tts" | "block_user";
  packStatus: "approved" | "approved_limited" | "needs_better_reference" | "requires_consent" | "blocked";
  createdAt: string;
}

interface NaturalSpeechContract {
  schemaVersion: "1.0";
  language: string;
  fullScript: string;
  shotScripts: Array<{
    shotId: string;
    text: string;
    durationSeconds: number;
    targetWordsPerMinute: number;
    pausePlan: string;
    mustSoundNaturalBecause: string[];
    forbiddenSpeechPatterns: string[];
  }>;
  globalRules: {
    avoidKeywordStuffing: true;
    avoidRoboticRepetition: true;
    avoidUnsupportedClaims: true;
    avoidAbruptCTA: true;
    preserveCreatorTone: true;
  };
}
```

Product variant/SKU rules:

- if selected variant data exists in Marketplace Capture raw payload, confirmed product metadata, selected image metadata, or price snapshot metadata, `product_preflight` must preserve it as `ProductVariantSnapshot`;
- variant-specific values such as price, stock, option labels, color, size, package count, or bundle contents are volatile or scoped facts and cannot appear in voiceover, captions, overlays, or scene premises unless the snapshot and approval policy allow them;
- if a product appears to have multiple visible variants but no selected snapshot, the run must either stay generic and avoid variant-specific claims or pause with `variant_selection_required`;
- active-run idempotency and dedupe must account for selected variant hash when the system allows parallel videos for different variants. If the first implementation keeps one active run per product, the UI must make that limitation explicit and prevent launching multiple active variant runs;
- `create_new_variation` must create a new run with a new variant/concept snapshot, not mutate a completed run's product truth.

### 10.5 Access, Freshness, And Asset Rights Contracts

Feature 117 must snapshot the authority to use the product and evidence at run start, then re-check it before each paid provider step.

Rules:

- owner and group-shared products must resolve through server-side Marketplace Capture product access checks;
- `read` group access may allow product reference use only when tenant policy allows it and outputs are private to the actor or routed through allowed sharing policy;
- `read_update` or owner access is required to mutate product evidence, attach product images, update product health, or publish outputs back to the shared product context;
- credit payer must be explicit. Shared product runs must not silently charge the product owner, group owner, or tenant when the actor should pay;
- background advancement must re-check product access, active group membership, tenant policy, and credit authority before new paid work;
- if access is revoked after a run starts, completed artifacts remain auditable but new provider spend must pause or block with a timeline-visible reason;
- product freshness must classify volatile values, raw evidence availability, source page reachability, and product-image readiness before concept/prompt planning;
- stale products may still produce generic evidence-safe videos, but price, discount, stock, rating, sold count, review count, commission, and campaign claims must be blocked unless freshly approved;
- marketplace remote images must be re-hosted/proxied or proven accessible according to media policy before paid generation depends on them;
- if raw evidence has been purged, the run may continue only with retained field provenance and platform-hosted product images sufficient for the requested automation;
- asset rights must distinguish exact product/package depiction from standalone brand/logo/marketplace badge use;
- the system must not invent, stylize, extract, or reuse standalone brand marks, certification badges, marketplace badges, seller shop logos, platform UI, or review images unless an explicit rights/approval record allows that use;
- visible logos or labels physically printed on the product/package may be preserved only as incidental product identity details.

### 10.6 QA Verdict

```ts
type ProductionQAVerdict = "pass" | "warn" | "repair" | "block_user" | "fail_terminal";

interface ProductionQAResult {
  schemaVersion: "1.0";
  qaId: string;
  stage:
    | "intake"
    | "concept"
    | "storyboard"
    | "media_payload"
    | "generated_image"
    | "generated_video_clip"
    | "audio"
    | "timeline"
    | "final_render";
  targetRef: string;
  verdict: ProductionQAVerdict;
  score: number;
  reasonCodes: string[];
  findings: Array<{
    severity: "info" | "warning" | "blocking" | "terminal";
    code: string;
    message: string;
    evidenceRefs: string[];
    suggestedRepair?: string;
  }>;
  requiresUserDecision: boolean;
  safeToAutoRepair: boolean;
}
```

---

## 11. Marketplace Capture Integration

### 11.1 Entry Points

Marketplace Capture and product preview surfaces must expose:

- `Create Storyboard`
- `Create Video`
- `Auto Create Review Video`
- `Create New Variation` when prior videos exist

The current product detail page already exposes Marketplace Auto Review controls with `storyboard_images`, `full_video`, frame strategy, and audio strategy choices. Feature 117 must improve this existing path instead of adding a separate parallel button or hidden automation route.

The action creates or upgrades a `marketplaceAutoReviewRun`, records stage rows, and passes the selected product, images, capture evidence, and `MarketplaceStorytellingHandoff` into the runtime. A `ProductionAutomationRequest` may be used as the internal cross-surface contract, but Marketplace Capture should continue to expose the existing run APIs or a compatible versioned successor:

- `startAutoReview`
- `getAutoReviewRun`
- `listAutoReviewRuns`
- `advanceAutoReviewRun`
- `cancelAutoReviewRun`

The Marketplace Capture surface must be a request origin only. It may package selected product/evidence data and show progress, but it must not run the Feature 117 LLM planner, concept generator, verifier, QA reviewer, or repair loop locally. All new LLM work for storyboard/video automation starts on the backend through the SmartSpecPro LLM gateway.

### 11.2 Readiness Mapping

Existing `MarketplaceStorytellingHandoff.readiness` maps to automation:

| Readiness | Storyboard Only | Video Auto |
| --- | --- | --- |
| `ready_for_storytelling` | allowed | allowed if budget policy allows |
| `ready_with_warnings` | allowed with warnings | allowed only if warnings are policy-safe or user/tenant pre-approved |
| `needs_user_review` | blocked to claim/image review | blocked |
| `insufficient_evidence` | basic storyboard allowed only for evidence-safe generic product demo | blocked until evidence improves |

### 11.3 Product Truth Source Priority

The runtime must use product truth in this order:

1. explicitly confirmed product fields,
2. evidence-backed claims,
3. selected product images and visible facts,
4. approved Feature 115 insight records,
5. marketplace page metadata,
6. user hints.

User hints cannot override product evidence without creating a warning or review requirement.

Before creative planning or visual provider dispatch, the runtime must also build a `ProductReferenceAssetPack` from approved product images. This pack is the only valid source of product image references for storyboard frames, start/stop frames, video keyframes, thumbnails, and visual repair attempts. It must reject images that are too small, remote-unhosted, wrong-variant, collage-like, dominated by marketplace UI/watermarks, privacy-risky, rights-blocked, or visually ambiguous. If no pack can reach `approved_for_visual_generation`, the run may continue only as a non-visual/generic storyboard when policy allows, or it must pause for `select_better_product_image` / `upload_product_reference` before provider credits are reserved.

### 11.4 Auto Creativity Rules

LLM creativity should be used to create new review ideas, not new product facts.

Allowed creative variation:

- story framing,
- buyer situation,
- emotion,
- pacing,
- visual metaphor,
- camera language,
- hook style,
- voiceover personality,
- demo sequence,
- non-claim lifestyle context.

Disallowed creative invention:

- new product feature,
- new certification,
- new review/rating,
- fake user testimonial,
- fake discount,
- fake warranty,
- medical/health result,
- before/after outcome not supported by evidence,
- altered product design,
- altered packaging,
- changed logo or label.

### 11.5 Creative Quality Rules

The system should be imaginative enough to generate new, useful video ideas from the same product repeatedly. Creativity must be scored, not treated as free-form prompt text.

Good creative output should include:

- a hook that creates curiosity without deception,
- a clear buyer problem or decision moment,
- a proof sequence that shows what can be seen or substantiated,
- a product-focused payoff,
- expectation management before CTA,
- visual rhythm that changes shot size, camera movement, and scene energy without changing product identity,
- a voiceover that sounds like a human creator, not a keyword list,
- enough novelty that repeated runs from the same product do not feel like the same video with different adjectives.

Hook patterns that are allowed:

- `curiosity_gap`: "ก่อนซื้อสิ่งนี้ จุดที่ควรดูคือ..."
- `problem_moment`: show a real buyer frustration before introducing the product.
- `unexpected_use_case`: show an evidence-safe use context the product naturally supports.
- `proof_first`: open on a visible product detail or usage proof.
- `myth_correction`: correct a buyer assumption without attacking competitors or inventing facts.
- `before_buy_check`: frame the video as an honest checklist.
- `soft_challenge`: invite the viewer to compare the product to their own need.

Hook patterns that are blocked:

- fake "shocking" or fear-based claims,
- fake scarcity or fake urgency,
- fake discount/rating/sales proof,
- fake personal testimonial,
- "best", "number one", "guaranteed", "cure", "instant result", or similar absolute claims without evidence,
- body, health, finance, safety, or legal outcome claims without explicit approved substantiation,
- clickbait that creates a different net impression than the product evidence supports.

### 11.6 Advertising Compliance Baseline

Feature 117 must apply a platform policy profile before generation and again before final render. The global default should enforce these universal advertising principles:

- advertising claims must be truthful, not misleading, and substantiated before use,
- the overall net impression of the video must match evidence, not just individual sentences,
- material limitations must not be hidden when the story creates a strong expectation,
- endorsements, testimonials, reviews, ratings, and creator relationships must not be fabricated,
- any material connection, paid promotion, affiliate relationship, or synthetic-media disclosure required by tenant/platform policy must be represented in the output plan,
- comparative claims must avoid naming or implying unsupported competitor inferiority,
- before/after, health, body, finance, safety, medical, child-directed, and regulated-category claims require stricter policy review,
- price, discount, stock, rating, sold count, commission, and campaign claims are volatile and must be blocked unless approved for the exact run.

Advertising compliance must produce a structured `AdvertisingComplianceProfile` with claim-level verdicts. If the profile has a blocking claim, provider generation must not start.

The policy profile should be versioned and source-attributed. At minimum, the platform should be able to map internal rules to official policy sources such as general truth-in-advertising, endorsement/disclosure, international advertising code, and target platform ad policies.

Policy rules must be loaded from an approved `AdvertisingPolicyRulePack`, not from freeform LLM prompt text. The rule pack must map category triggers, blocked patterns, required evidence kinds, warning templates, and allowed repair actions to rule IDs that QA verdicts and approvals can cite. Draft, deprecated, expired, or blocked rule packs cannot authorize provider generation, final render, publishable package promotion, or reuse of a Library asset.

### 11.7 Thailand Advertising Compliance Profile

When the product, seller, marketplace, user locale, target audience, caption language, or target platform indicates Thailand, the runtime must apply `regionProfile = "thailand"` in addition to the global default.

Thailand profile rules:

- Treat all product descriptions, seller copy, reviews, ratings, OCR text, and marketplace badges as untrusted evidence until mapped to approved product truth.
- Block false, exaggerated, unverifiable, or misleading net impressions in hook, voiceover, captions, visual premise, CTA, and metadata.
- Block claims that imply guaranteed results, instant effects, superiority, safety, cure, prevention, treatment, body change, beauty/skin outcome, health benefit, financial benefit, or legal/safety outcome unless the claim has explicit approved substantiation for Thai advertising use.
- For food, supplement, cosmetic, drug, medical device, herbal, health, beauty, weight-control, sexual wellness, child, pet health, or regulated products, require a stricter `thailand_fda_health_product_claim` review before provider generation.
- If Thai FDA/อย. advertising approval, license number, notification number, or required wording is necessary for the product category, the runtime must block or pause until the approved wording/evidence is present.
- Do not invent or visually add Thai FDA numbers, certification marks, warning labels, seals, awards, hospital/doctor endorsement, before/after proof, review stars, sales count, price discount badge, or official-looking text.
- Do not turn marketplace ratings, sold count, reviews, or affiliate commission into advertising claims unless the user explicitly approves current, sourced wording for that run.
- If the output includes paid promotion, affiliate, sponsored, review-for-commission, or material connection disclosure required by tenant/platform policy, the script/caption plan must include the required disclosure in a clear and natural way.
- Thai-language voiceover must avoid common exaggerated ad phrases unless evidence and category policy allow them, including absolute or medical-sounding phrasing such as "เห็นผลทันที", "ดีที่สุด", "ปลอดภัย 100%", "รักษา", "หายขาด", "ลดได้แน่นอน", "การันตีผล", "อันดับหนึ่ง", or equivalent claims.
- If a claim is useful but risky, rewrite it into an evidence-safe Thai phrasing that describes visible details, usage context, or buyer-check guidance instead of outcome promises.

Thailand-specific safe creative patterns:

- "ก่อนซื้อ ลองเช็กจุดนี้จากตัวสินค้า..."
- "จากภาพสินค้า สิ่งที่เห็นได้ชัดคือ..."
- "เหมาะกับคนที่กำลังมองหา [evidence-safe use context] แต่ควรเทียบกับพื้นที่/ความต้องการของตัวเองก่อน"
- "ช็อตนี้ไม่สรุปแทนผู้ชม แค่พาไล่ดูรายละเอียดที่เห็นจากสินค้า"
- "ถ้าจะใช้ในสถานการณ์นี้ จุดที่ควรดูคือ..."

Thailand-specific blockers:

- health/beauty/body/medical result claim without approved substantiation,
- unapproved FDA/อย. or certification mention,
- fake review/testimonial/rating framing,
- exaggerated guarantee or absolute safety claim,
- misleading before/after implication,
- price/discount/sold-count urgency without approved current evidence,
- visual addition of official-looking Thai labels, badges, or license numbers.

### 11.8 Visual Warning And Disclosure Text In Ads

Some ad outputs must include warning, disclosure, limitation, sponsored/affiliate, or regulated-product text visibly inside the ad creative. Feature 117 must support this, but it must not ask an image/video generation model to invent or draw that text directly into generated product imagery.

Rules:

- Warning/disclosure text must come from approved policy copy, tenant-approved wording, product evidence, or user-approved wording for the exact run.
- Warning/disclosure text must be represented as `AdvertisingVisualWarningPlan`.
- The render mode must be `deterministic_overlay_only`.
- The overlay must be added by Storyboard Review, Video Edit, render composition, or another deterministic platform renderer, not by generative image/video prompt text.
- The overlay must not alter product packaging, original product labels, FDA/อย. numbers, certification marks, or marketplace screenshots.
- The overlay must avoid covering the product, face, key usage action, CTA, and required platform UI safe areas.
- Thai warning text must be readable on mobile: sufficient size, contrast, line length, duration, and background treatment.
- If the required warning cannot fit without harming readability or covering the product, the runtime must switch to a warning end card, longer duration, or block for user review.
- For storyboard still images, warning text may be shown as a deterministic review overlay or final export overlay. It must not be baked into AI-generated source frames unless a deterministic compositor adds it after generation.
- For video, warning text must have a timing plan and minimum visible duration.
- Final QA must OCR the rendered output and verify exact text match for required warnings/disclosures.
- Failed OCR/readability check must trigger repair or block before final Library output is marked complete.

Examples of warning/disclosure overlay use cases:

- affiliate or sponsored disclosure required by tenant/platform policy,
- product limitation or expectation guard that materially affects the ad's net impression,
- Thai FDA/อย.-sensitive product category warning text approved for that product,
- synthetic media disclosure when required by policy,
- end-card warning for regulated or high-risk product categories.

Initial policy source anchors:

- FTC Advertising and Marketing Basics: `https://www.ftc.gov/business-guidance/advertising-marketing`
- FTC Endorsement Guides Q&A: `https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking`
- ICC Advertising and Marketing Communications Code: `https://iccwbo.org/business-solutions/the-icc-advertising-and-marketing-communications-code/`
- TikTok Advertising Policies: `https://ads.tiktok.com/help/article/tiktok-advertising-policies`
- Thailand Office of the Consumer Protection Board: `https://www.ocpb.go.th/`
- Thailand FDA advertising/health product guidance: `https://www.fda.moph.go.th/`

Rule-pack governance:

- official/platform URLs are source anchors, not a substitute for encoded and approved rules;
- policy changes must create a new rule-pack version instead of mutating old run decisions in place;
- each new or widened rule pack must run fixture replay for claims, warnings, thumbnails, metadata, CTA, and Thai regulated-category examples before broad rollout;
- if a rule pack expires, is deprecated, or is superseded by a stricter pack, active runs must compute impact through `RunInputChangeImpactEnvelope`;
- final Library assets must keep the rule-pack refs used at generation time and must be rechecked before reuse when policy invalidation triggers apply.

---

## 12. Storyboard Automation Requirements

### 12.1 Storyboard Structure

Every generated storyboard must include:

- selected concept,
- production bible,
- hook contract and hook truth-risk score,
- target platform,
- duration,
- aspect ratio,
- language,
- ordered shots,
- customer journey stage per shot,
- visual beat per shot,
- camera direction per shot,
- voiceover script per shot,
- caption/on-screen text per shot,
- product claims per shot with evidence IDs,
- proof plan per claim,
- advertising compliance profile,
- visual warning/disclosure overlay plan when required,
- product visual identity lock,
- character continuity lock when people appear,
- natural speech contract,
- product image/asset references,
- media payload requirements,
- QA gates per shot,
- handoff target.

### 12.2 Shot Count And Timing

Supported shot counts:

- 6, 7, 8, 9, 10, 12, 15

Each shot must have:

- `startSec`,
- `endSec`,
- `durationSec`,
- speech budget,
- visual action,
- transition intent,
- expected media outputs.

Voiceover must be continuous across the video unless intentional silence is explicitly marked and brief.

### 12.3 Story Continuity

Storyboard QA must detect:

- duplicated hooks,
- weak or misleading hook,
- abrupt scene jumps,
- missing proof after claim,
- CTA without setup,
- inconsistent buyer journey stage,
- inconsistent presenter/object position,
- missing product presence in required proof/demo shots,
- unsupported visual story implication,
- hidden regulated or sensitive claim,
- voiceover that does not fit timing or sounds unnatural.

### 12.4 Storyboard Review Handoff

Storyboard Review must receive:

- ordered shot metadata,
- product evidence per shot,
- claim map,
- image fidelity risks,
- audio/voiceover plan,
- QA verdicts,
- automation trace summary,
- credit estimate summary,
- repair history.

---

## 13. Video Automation Requirements

### 13.1 Generation Planning

The runtime must choose generation strategy based on capabilities:

- image-first storyboard with image-to-video,
- direct video generation where safe,
- TTS-first narration with video pacing aligned to voiceover,
- existing product image anchored shots,
- existing generated assets reused where approved,
- fallback to storyboard-only when video generation is blocked.

### 13.2 Product Image Fidelity

#### 13.2.0 Product Reference Asset Pack

Every visual generation or repair payload must reference a prepared `ProductReferenceAssetPack`.

Reference pack rules:

- create the pack during `product_preflight` after access, freshness, rights, privacy, and selected-variant checks;
- choose one primary hero reference and optional detail/packaging/variant references;
- persist rejected image refs and reasons so the system cannot later silently reuse them;
- include crop, product region, mask, visual fingerprint, perceptual hash, and OCR/label refs where available;
- bind the pack to `ProductVisualIdentityLock`, `ProductVariantSnapshot`, `AssetRightsEnvelope`, and `ProductEvidenceFreshnessSnapshot`;
- treat visible text on the product as identity evidence only when it is actually present, not as permission to invent new label/certification/claim text;
- require platform-hosted/proxy-approved refs before paid provider dispatch;
- block or request a better image when product visibility, resolution, variant certainty, rights, or privacy is not good enough for the requested output mode;
- if LLM vision is used to classify the pack, call it only through the SmartSpecPro LLM gateway with `llm_visual_qa` credit tracking.

Direct media execution, targeted repair, thumbnail selection, Storyboard Review, Video Edit, render, Library finalize, and future reference selection must consume only pack-approved product refs. A failed/generated artifact cannot become a new product reference unless a separate user-approved product reference ingestion flow exists outside this feature.

For product review videos, the hero product image should be used as an identity anchor. Shot media payloads must carry:

- source image ref,
- evidence ID,
- `ProductVisualIdentityLock`,
- allowed transformation level,
- protected visual attributes,
- forbidden mutations,
- fidelity QA threshold.

Allowed transformation levels:

- `none`: product must remain exactly as source except crop/resize/composite.
- `contextual_composite`: product may be placed in scene but visual identity must remain unchanged.
- `lighting_match`: minor lighting/color adaptation only.
- `stylized_context`: background/style can change but product identity must remain strict.

Default for Marketplace products is `contextual_composite`, not free generation.

Product fidelity QA must inspect generated storyboard frames, generated video keyframes, and final render samples against the reference lock. It must reject:

- product category drift,
- changed silhouette or proportions,
- changed color/material,
- missing or invented logo/label/packaging detail,
- extra drawers, panels, handles, shelves, ports, buttons, straps, accessories, or attachments,
- a generated substitute product replacing the reference product,
- product text or labels becoming random glyphs where the original has recognizable branding,
- product being hidden, cropped away, or blended into the background in proof shots.

When fidelity is uncertain, the safe default is repair or block. The runtime must not "explain away" a product mismatch as a creative variation.

### 13.2.1 Per-Frame Vision QA And Targeted Repair

Every generated visual unit that can become an anchor for later media must receive a `ShotFrameVisionQaEnvelope` before it is accepted:

- each 3x3 storyboard grid cell after extraction;
- each per-shot `start_frame`;
- each per-shot `stop_frame`;
- video keyframes sampled at start/middle/end and at scene/identity transitions;
- thumbnail/cover candidates;
- final render samples used for product, face, warning, subtitle, and CTA QA.

Vision QA rules:

- all vision-model QA calls must go through the SmartSpecPro LLM gateway and be recorded as `llm_visual_qa` credit usage;
- the QA prompt/context must include product reference images, selected variant hash, protected product attributes, character identity asset pack refs and character continuity lock when present, shot intent, and allowed transformations;
- the QA output must be structured, schema-validated, and persisted before advancing the stage;
- the stage cannot mark `image_generation`, `storyboard_review`, `video_generation`, `video_edit`, `render`, or `library_finalize` complete while a required frame/keyframe QA status is `needs_targeted_repair` or `blocked`.

Targeted repair rules:

- if one `start_frame`, `stop_frame`, storyboard cell, thumbnail, or video keyframe fails, create `TargetedMediaUnitRepairPlan` for that exact `shotId + frameRole/mediaUnit`;
- regenerate or repair only the failed unit and dependent downstream outputs;
- preserve passed frames, clips, audio, subtitles, package metadata, and approvals that do not depend on the failed unit;
- tighten repair payloads with explicit product refs, character identity pack refs, forbidden mutations, and negative findings from the failed QA;
- after repair, rerun `ShotFrameVisionQaEnvelope` before the unit can be consumed by video generation, Storyboard Review, thumbnail packaging, or final render;
- repeated failure after the configured attempt limit becomes `blocked_needs_user` or routes to manual review instead of regenerating the whole run.

### 13.2.2 Generated Media Acceptance And Quarantine

Generated media artifacts are not accepted just because a provider returned a URL. Each generated unit must move through a `GeneratedMediaAcceptanceEnvelope`.

Acceptance states:

- `candidate`: provider output exists but required QA is not complete;
- `qa_pending`: QA has been scheduled or is running;
- `accepted`: all required QA passed and the artifact can route to downstream surfaces;
- `accepted_with_warnings`: policy allows the artifact with scoped approval or warning metadata;
- `quarantined_failed_qa`: artifact failed QA and can be used only for internal audit/repair context;
- `quarantined_policy_blocked`: artifact is blocked by policy, rights, privacy, safety, or consent rules;
- `superseded_by_repair`: a repaired artifact has replaced this artifact;
- `discarded`: artifact is no longer retained except minimal audit metadata.

Routing rules:

- Storyboard Review, Video Editor, Media Library, publishable package, and future reference selection may consume only `accepted` or policy-approved `accepted_with_warnings` artifacts;
- failed or unverified artifacts must never appear as normal output links, thumbnails, user-downloadable assets, Video Editor clips, or positive creative-memory examples;
- failed artifacts may be retained in internal trace, repair context, or negative feedback memory only when retention policy allows it;
- a repaired artifact must explicitly supersede the failed artifact and update downstream lineage refs;
- background resume and operator recovery must verify acceptance state before reusing any generated artifact ref.

### 13.3 Character And Face Continuity

When a human presenter or character is used:

- the runtime must decide whether continuity is required,
- the runtime must create `CharacterIdentityAssetPack` before provider spend when the same person, hand model, character, or voice appears across multiple shots,
- if required, it must anchor character references,
- every generated shot must be checked against the anchor,
- face changes across turn/reveal shots are blocking issues,
- failed character continuity repairs must not alter the product to hide the issue.

The runtime should avoid using a recurring human presenter unless the story benefits from it, consent/rights are valid, and continuity can be verified. Product-only, hands-only, generic-person, voice-only, or one-shot presenter formats are preferred when they reduce face-change risk without weakening the review.

Character identity pack rules:

- real-person references require scoped consent/rights refs before face or voice continuity can be used;
- customer/reviewer faces, marketplace profile images, private seller faces, celebrity-like faces, minors, or unrelated people must block recurring identity unless an explicit approved policy exists;
- synthetic/generic presenters may be used, but the pack must still record visible identity anchors, allowed shot scopes, voice profile refs, and fallback rules;
- back-facing, cropped, masked, or hands-only shots must declare whether a face is allowed to appear later; if not, `mustNeverRevealFace` must block turn/reveal video payloads;
- provider payloads and repair payloads must reference the pack-approved character/voice refs, not raw marketplace screenshots, failed generated people, or vague prompt phrases;
- any LLM vision/audio used to create or validate the pack must go through the SmartSpecPro LLM gateway with `llm_visual_qa` or `llm_audio_qa` credit tracking.

Character continuity QA must sample at least the start, middle, and end of each generated clip where the person appears. It must block:

- a back-facing person turning around into a different face,
- a profile view becoming a different front-facing person,
- face re-entry after occlusion with changed identity,
- inconsistent age, skin tone, hair, wardrobe, body type, or presenter role,
- new unplanned people becoming the apparent reviewer,
- lip-sync or speaking identity inconsistent with the voiceover plan.

If native video audio or voice-driven generation causes character identity, facial expression, mouth movement, or speaking identity to drift, the failure belongs to the affected shot/clip. The runtime must repair the affected clip or switch that shot to a safer product-only, hands-only, or separate-TTS strategy rather than changing the approved product frames or regenerating unrelated shots.

### 13.4 Audio Continuity

Audio plan must include:

- full voiceover script,
- per-shot speech budget,
- natural speech contract,
- TTS voice ID or voice profile,
- music/SFX plan,
- silence policy,
- loudness target,
- transition points.

Audio QA must detect:

- unintended silence,
- clipped speech,
- voice changes,
- language mismatch,
- timing mismatch,
- music overpowering voice,
- abrupt cut between clips,
- missing last-word/CTA.

Voiceover generation must optimize for natural creator speech:

- one clear idea per sentence,
- short clauses that fit the shot,
- natural Thai or target-language particles and rhythm when appropriate,
- no repeated product name stuffing,
- no hard-sell urgency unless evidence and policy allow it,
- no claim that is stronger than the visual proof,
- CTA that follows the proof sequence rather than appearing abruptly.

### 13.5 Final Render

Final render continues to use existing media job/render worker infrastructure. Agents do not render directly.

Render preflight must verify:

- all required clip URLs are present,
- all audio refs are present,
- every clip duration matches timeline tolerance,
- audio and subtitles align,
- required warning/disclosure overlays are present in the timeline with correct timing,
- output path is valid,
- library metadata is prepared,
- credit authorization exists.

---

## 14. Credit And Billing Requirements

### 14.1 Credit Categories

Feature 117 must separate:

- `llm_planning`
- `llm_verification`
- `llm_visual_qa`
- `llm_audio_qa`
- `llm_repair`
- `provider_image_generation`
- `provider_video_generation`
- `provider_audio_generation`
- `render_mp4`

### 14.2 Planning Credits

LLM planning, concept generation, verifier, and QA calls consume LLM credits through the LLM gateway. The gateway must:

- preflight tenant/model access,
- estimate cost when possible,
- record actual usage,
- attach usage to the production run and agent run,
- return structured usage to Node.

### 14.3 Provider Credits

Provider credits are handled by existing media generation paths. Requirements:

- Provider credit estimate must be shown or policy-approved before reservation.
- Reservation must include run ID, stage key, shot IDs, media payload IDs, provider candidates, expected outputs, and idempotency keys.
- Generation must not start if reservation fails.
- Retry and repair attempts must reserve only incremental credits for the affected step.
- Failed provider jobs must reconcile credits according to existing refund/release rules.

### 14.4 Auto Spend Policy

Auto video creation may reserve credits without per-step user approval only when:

- user or tenant enabled auto spend,
- total estimate is under budget,
- input readiness is sufficient,
- no policy blocker exists,
- plan QA passed,
- execution plan is deterministic enough to estimate.

If not, status becomes `awaiting_credit_authorization`.

### 14.5 Idempotency

Every credit-affecting action must use a stable idempotency key:

```text
production:{productionRunId}:stage:{stageId}:attempt:{attemptNumber}:action:{action}
```

Duplicate events must not double-charge or duplicate provider jobs.

---

## 15. Completion, Checkpoints, And Recovery

### 15.1 Durable Checkpoints

Persist checkpoints after:

- intake validation,
- concept generation,
- concept selection,
- storyboard generation,
- storyboard QA,
- media payload config,
- credit estimate,
- credit reservation,
- each provider job scheduling,
- each provider job completion,
- each QA result,
- each repair decision,
- handoff creation,
- render preflight,
- render completion,
- final QA.

### 15.2 Resume Rules

On resume:

- do not rerun passed stages unless upstream inputs changed,
- do not regenerate passed media unless a blocking QA result targets that output,
- reconcile provider task status before scheduling new work,
- reconcile credit reservations before spending,
- continue from the latest valid checkpoint.

### 15.3 Retry Policy

Default:

- planner schema repair: 2 attempts,
- concept generation: 2 attempts,
- storyboard QA repair: 2 attempts,
- image/video/audio provider retry: existing provider policy,
- QA-triggered media repair: budget policy,
- final render retry: existing media job policy.

No infinite loops. If repeated repair fails, status becomes `blocked_needs_user` or `failed_terminal` with evidence.

### 15.4 Partial Output Handling

If full video fails after storyboard succeeds:

- keep storyboard,
- keep passed generated assets,
- show failed stages,
- preserve credit summary,
- offer continue/repair/manual edit.

---

## 16. QA Gates

### 16.1 Intake QA

Blocks:

- no confirmed product,
- no approved product image,
- high hero image mismatch,
- unsupported claims required by requested story,
- missing tenant permission,
- insufficient budget policy.

### 16.2 Concept QA

Checks:

- concept is distinct from prior concepts,
- hook is strong but not deceptive,
- net impression is evidence-safe,
- no unsupported product fact,
- evidence-safe claims,
- no fake urgency/scarcity/social proof,
- no unapproved regulated/sensitive claim,
- platform fit,
- feasibility with available tools,
- creative quality score,
- advertising compliance score,
- estimated completion probability.

### 16.3 Storyboard QA

Checks:

- every shot has journey stage,
- every claim has evidence,
- every hook has a truth-risk verdict,
- proof appears before or near the claim it supports,
- voiceover flows continuously,
- voiceover sounds natural for the target language and platform,
- captions are not too long,
- warning/disclosure overlay text fits readable mobile safe areas when required,
- product appears where needed,
- story has hook, proof, objection handling, CTA,
- expectation management exists before CTA when the product could be overinterpreted,
- shot order is coherent,
- advertising compliance profile has no blocking claim.

### 16.4 Media Payload QA

Checks:

- shot payload is complete,
- adapter enabled,
- provider constraints satisfied,
- source assets available,
- product identity protection set,
- product visual identity lock attached,
- character continuity lock attached when people appear,
- natural speech contract attached when voiceover/audio is expected,
- advertising compliance profile attached,
- visual warning/disclosure overlay plan attached when required,
- no unsupported provider payload keys exposed to normal UI,
- credit estimate possible.

### 16.5 Generated Visual QA

Checks:

- product fidelity,
- product identity similarity against `ProductVisualIdentityLock`,
- product presence,
- no wrong product,
- no invented packaging,
- no broken logo/label,
- no material/color/shape/proportion drift,
- no added accessories/components that are not in source evidence,
- no unsafe or irrelevant visual,
- face/character continuity,
- scene continuity,
- visual quality threshold.

### 16.6 Generated Video Clip QA

Checks:

- clip starts/ends cleanly,
- subject/product continuity,
- no sudden identity change,
- no face change across turn/reveal/re-entry moments,
- no impossible product transformation,
- motion consistent with shot plan,
- no missing critical product detail,
- no visual artifacts that damage trust,
- no unplanned text, price badge, discount badge, fake rating, watermark, or readable claim.

### 16.7 Audio QA

Checks:

- no unintended gaps,
- no abrupt stop,
- voice continuity,
- volume consistency,
- speech timing,
- natural speech rhythm,
- no robotic repetition or keyword stuffing,
- caption alignment,
- language correctness,
- no unsupported claim in spoken text,
- CTA is audible and complete.

### 16.8 Advertising Compliance QA

Checks:

- claim truthfulness and substantiation,
- net impression across hook, visuals, voiceover, captions, and CTA,
- material omissions,
- endorsement/testimonial/review/rating disclosure risk,
- fake urgency, fake scarcity, fake discount, fake social proof,
- unapproved superlatives or guarantees,
- regulated or sensitive category claims,
- platform-specific ad policy flags,
- Thailand OCPB/สคบ. false, exaggerated, or misleading advertising risk when region profile is Thailand,
- Thailand FDA/อย. health product claim or ad permission risk when the product category is regulated,
- Thai label, license, certification, or official badge mismatch,
- required warning/disclosure overlay presence, readability, placement, and duration,
- OCR exact-text match for deterministic warning/disclosure overlays,
- synthetic media or affiliate disclosure requirements when tenant/platform policy requires them.

Blocks:

- unsupported objective claims,
- fabricated testimonial or review framing,
- misleading before/after implication,
- price/rating/sold/discount/campaign claim without approved current evidence,
- health, finance, body, safety, or legal-outcome claim without approved substantiation,
- Thai health/beauty/body/medical result claim without approved Thai substantiation and required wording,
- invented or altered FDA/อย. number, certification mark, official badge, or warning label,
- missing, unreadable, mistimed, mistranscribed, or product-covering required warning/disclosure overlay,
- hook or CTA that creates a materially different expectation than the product evidence.

### 16.9 Final QA

Checks:

- timeline complete,
- clip order correct,
- story continuity,
- audio continuity,
- subtitle readability,
- product truth,
- advertising compliance,
- warning/disclosure overlay OCR and readability,
- product visual fidelity,
- character/face continuity,
- render file accessible,
- library metadata complete,
- credit reconciliation complete.

---

## 17. UI Requirements

### 17.1 Marketplace Capture Product Actions

Product cards and capture detail pages should show automation actions when allowed:

- `Create Storyboard`
- `Create Video`
- `Auto Create Review Video`

The UI must show:

- readiness,
- estimated credits,
- selected product images,
- evidence confidence,
- key blockers,
- automation status.

### 17.2 Production Director Automation Status

Production workspace must show:

- current stage,
- completed stages,
- remaining stages,
- active agent role label translated into user-friendly language,
- progress percentage where meaningful,
- credit estimate/reserved/spent,
- blockers,
- QA verdicts,
- repair attempts,
- generated outputs,
- final video link when done.

Do not show internal framework names in normal UI.

The status area must be rendered as a timeline, not only as a flat status label. Timeline requirements:

- show every canonical stage in order;
- mark completed stages with completed time, warnings, and output links when available;
- mark the active stage with current substep, active agent/QA role, provider wait, credit wait, or repair state;
- mark remaining stages as pending with short Thai descriptions;
- show blockers inline at the stage where they happened;
- show the next action exactly once in the timeline header and again on the blocked stage;
- show `storyboard_images` and `full_video` timelines with different total stage counts;
- preserve timeline state after refresh or resume from the backend projection;
- on mobile, render as a vertical timeline; on desktop, allow a compact horizontal summary plus vertical detail if useful.

### 17.3 Minimal User Burden

Default UX should avoid asking unnecessary questions. Ask only when:

- product/evidence is insufficient,
- credit estimate exceeds policy,
- policy-sensitive claim/content needs confirmation,
- auto repair cannot choose safely,
- user requested manual concept choice.

### 17.4 Review Surfaces

When blocked, the UI must show one clear next action:

- approve/remove claim,
- select better product image,
- adjust budget,
- approve warning,
- retry failed shot,
- open manual editor,
- cancel automation.

---

## 18. Security And Privacy

### 18.1 Data Minimization

Runtime inputs must exclude:

- cookies,
- auth tokens,
- full DOM HTML,
- private account data,
- payment/order/cart data,
- hidden inputs,
- unrelated marketplace user data.

### 18.2 Prompt Injection Resistance

Marketplace content, product descriptions, reviews, uploaded files, OCR, and prior generated outputs are untrusted evidence. They may not override:

- system policy,
- product truth rules,
- credit rules,
- gateway-only rule,
- user/tenant permissions,
- approved automation mode,
- locked product identity constraints.

Prompt-injection resistance must be implemented as a persisted evidence firewall, not only prompt wording:

- run preflight must create `MarketplaceEvidenceInstructionFirewall` after `MarketplaceEvidencePrivacyEnvelope` and before any marketplace evidence is passed to Agents, LLM gateway calls, prompt planning, vision QA prompts, repair prompts, or metadata generation;
- raw DOM/OCR/review/seller text may enter LLM context only as quoted, escaped, labelled untrusted evidence blocks or as structured evidence refs; system/developer instructions must never be constructed from marketplace text;
- instruction-like marketplace content must be quarantined or reduced to safe fact refs before planning, and quarantined refs cannot influence tools, handoffs, model/provider selection, approval state, credit spend, output destinations, or final user-visible copy;
- the SDK capability manifest, credit policy, advertising policy rule pack, creative brief, distribution profile, and output schema must be built from platform-trusted state, not from marketplace evidence content;
- if the firewall cannot separate safe product facts from injected instructions, the run must block with a timeline-visible `evidence_instruction_blocked` state before additional LLM/provider spend.

### 18.3 Trace Redaction

Traces must redact:

- gateway credentials,
- provider credentials,
- private URLs when policy requires,
- user PII,
- raw marketplace HTML,
- payment/order data,
- full prompt payloads containing sensitive evidence unless debug access allows.

### 18.4 Permission Envelope

Automation can operate only on:

- products the user can access,
- assets the user can access,
- projects the user can edit,
- models/providers allowed by tenant policy,
- credit budgets the user or tenant can spend.

### 18.5 Likeness, Consent, And Sensitive Person Policy

If product images, reference assets, prior videos, or generated concepts include identifiable people, the automation must distinguish:

- platform-generated generic people,
- user-uploaded or marketplace-sourced people,
- approved brand/model/influencer likeness references,
- minors or age-ambiguous people,
- public figures or celebrity-like likenesses.

Rules:

- do not clone, preserve, or reuse a real person's face/voice as a continuity anchor unless the asset has an approved consent/rights policy for this run;
- if consent is missing, prefer product-only, hands-only, partial-body-without-face, or generated generic-person alternatives;
- minors or age-ambiguous people must trigger stricter review and should not be used for commercial likeness continuity without explicit policy approval;
- face continuity QA must not become face identity cloning beyond the approved reference scope;
- voice cloning is out of scope unless a future explicit consent and voice-rights contract exists.

### 18.6 Asset Storage, URL, And Retention Hygiene

Provider outputs and generated intermediate assets must be stored safely:

- do not persist long-lived signed provider URLs as the canonical asset source;
- re-host or proxy completed assets through platform-controlled storage when existing media policy requires it;
- resolve access through tenant/user permission checks;
- redact signed URLs, cookies, tokens, and provider task secrets from traces and UI errors;
- attach retention/deletion policy metadata to intermediate frames, clips, audio, QA screenshots, OCR crops, and final renders;
- cancellation or failed-terminal runs must still reconcile which intermediate assets should be retained, expired, or deleted.

### 18.7 Provider/Model Entitlement, Availability, And No Silent Downgrade

Provider/model selection must be explicit and auditable:

- persist requested provider/model, selected provider/model, and fallback reason;
- respect user/tenant model preferences when allowed;
- if a requested provider/model is unavailable, over budget, denied, rate-limited, or unsupported for the needed feature, the run must choose only from allowed policy alternatives;
- do not silently downgrade from video/image generation to text-only planning;
- do not silently downgrade from native-audio video to silent video when the user selected native audio, unless policy explicitly allows a blocked/approval state;
- timeline must show provider unavailable, entitlement, rate-limit, or fallback decision states in user-safe language.

### 18.8 Concurrency, Backpressure, And Cancellation

Long-running automation must protect system capacity:

- enforce per-user and per-tenant active-run limits;
- enforce provider-specific concurrency and rate-limit caps;
- queue or block new runs with a timeline-visible reason when capacity is exceeded;
- background advancement must claim work idempotently so multiple timers/jobs cannot advance the same stage concurrently;
- cancellation must be idempotent, stop future scheduling, cancel provider/render jobs when supported, record non-cancellable jobs, and release/refund unused reservations according to billing policy;
- cancellation must preserve already completed outputs and timeline history unless retention policy deletes them.

### 18.9 Approval Decision Ledger And Immutable Policy Snapshots

Any user, admin, tenant-policy, or system approval that allows the run to continue despite risk must be durable and replayable.

Approval decisions must be recorded for:

- credit authorization above automatic budget,
- use of volatile signals such as price/discount/rating/sold/review count,
- use of a policy-sensitive claim,
- approval or edit of warning/disclosure text,
- provider/model fallback when policy requires approval,
- use of identifiable face/voice references,
- proceeding after `completed_with_warnings`,
- manual retry after repeated repair failure.

```ts
interface MarketplaceAutoReviewApprovalDecision {
  approvalId: string;
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  decisionType:
    | "credit_authorization"
    | "claim_approval"
    | "volatile_signal_use"
    | "warning_text_approval"
    | "provider_model_fallback"
    | "likeness_consent"
    | "completed_with_warnings_acceptance"
    | "manual_retry";
  actorType: "user" | "admin" | "tenant_policy" | "system_policy";
  actorUserId?: string;
  policyVersion: string;
  affectedRefs: string[];
  approvedText?: string;
  riskLevel: "low" | "medium" | "high" | "blocked";
  reasonCode: string;
  reasonText?: string;
  expiresAt?: string;
  createdAt: string;
  idempotencyKey: string;
}

interface MarketplaceAutoReviewPolicySnapshot {
  snapshotId: string;
  runId: string;
  modelPolicyVersion: string;
  providerCapabilityVersion: string;
  pricingVersion: string;
  creditPolicyVersion: string;
  advertisingPolicyVersion: string;
  advertisingPolicyRulePackId: string;
  advertisingPolicyRulePackVersion: string;
  thailandPolicyProfileVersion?: string;
  warningTemplateVersion?: string;
  consentPolicyVersion?: string;
  retentionPolicyVersion: string;
  resolvedAt: string;
}
```

Rules:

- approvals must be scoped to the exact run, stage, claim/output/ref, and policy snapshot;
- approval creation must be idempotent and must not create duplicate approvals on retry;
- approvals must not bypass hard policy blocks, tenant restrictions, missing consent, unsupported provider access, or budget denial;
- every started stage attempt must reference the policy/model/pricing/credit snapshot used for that attempt;
- replay tests must be able to compare old outputs against the original snapshot rather than today's policy.

### 18.10 Artifact Lineage And Canonical Output Refs

Every user-visible storyboard frame, video clip, audio file, editor projection, render job, and Library item must have a canonical lineage record. The lineage record is the audit map from product evidence and decisions to final media.

```ts
interface MarketplaceAutoReviewArtifactLineage {
  lineageId: string;
  runId: string;
  stageKey: MarketplaceAutoReviewStageKey;
  artifactRef: {
    kind:
      | "product_image"
      | "storyboard_contract"
      | "shot_payload"
      | "storyboard_frame"
      | "video_clip"
      | "audio_track"
      | "warning_overlay"
      | "storyboard_review"
      | "video_editor_project"
      | "render_job"
      | "library_item";
    id: string;
    url?: string;
  };
  parentRefs: string[];
  sourceEvidenceIds: string[];
  selectedVariantHash?: string;
  promptOrPayloadHash?: string;
  providerTaskId?: string;
  providerModel?: string;
  policySnapshotId?: string;
  approvalIds: string[];
  qaResultIds: string[];
  creditEventIds: string[];
  storageClass: "platform_hosted" | "provider_temporary" | "proxy_only" | "internal_trace";
  redactionState: "safe_for_ui" | "internal_only" | "requires_redaction";
  createdAt: string;
}
```

Lineage rules:

- final Storyboard Review, Video Editor, and Library refs must link back to product images, selected variant snapshot, storyboard contract, shot payload, provider task, QA verdicts, warning overlay decisions, approvals, and credit events;
- raw provider task IDs must never be shown as media URLs;
- user-visible URLs must be platform-hosted or approved proxy URLs according to media policy;
- provider-hosted temporary URLs may exist only in internal trace with retention and redaction policy;
- if a final artifact cannot explain its lineage, the run must not complete `storyboard_review`, `video_edit`, or `library_finalize`.

### 18.11 Media Safety Moderation And Provider Refusals

Advertising compliance does not replace general media safety. Before provider generation and after any provider refusal, Feature 117 must classify whether the requested concept, prompt, reference asset, or generated output triggers a safety or moderation block.

Safety categories include:

- sexual or adult content;
- minors or age-ambiguous people in commercial/sensitive contexts;
- graphic violence, self-harm, hate, harassment, or illegal activity;
- weapons, controlled goods, counterfeit goods, or unsafe instructions;
- deceptive synthetic endorsement, impersonation, or public-figure misuse;
- provider-specific content policy refusal;
- invalid prompt or invalid voice parameter that cannot be fixed by retrying the same payload.

Rules:

- non-retryable provider refusals such as content policy, moderation, prohibited/disallowed content, NSFW, sensitive content, or invalid prompt must map to `blocked_needs_user` or `failed_terminal` with sanitized reason codes;
- the system must not burn repair credits by retrying the same refused prompt repeatedly;
- safe repair may remove or rewrite the unsafe concept/shot only when it preserves product truth and ad compliance;
- when the product category itself is restricted or controlled, provider spend must wait for policy approval or block;
- moderation details must be sanitized for UI but preserved in internal audit without raw unsafe payload exposure;
- final QA must reject outputs that introduce unsafe visuals, unsafe text, or unsafe audio not present in the approved plan.

### 18.12 Provider Events, Payload Budgets, Storage Quota, And DLQ Safety

Feature 117 must not treat provider callbacks, large payloads, or storage writes as trusted implementation details. They are first-class run safety gates because this workflow is long-running and mostly automatic.

Provider event rules:

- provider webhook callbacks must verify signatures or provider-specific authentication when the provider supports it;
- providers without webhook signatures must be reconciled by trusted server-side polling before a callback-like event can advance a run;
- every event must bind to tenant ID, run ID, stage key, media task ID, provider name, provider task ID, and the original idempotency key before it can change state;
- duplicate callbacks must be idempotent no-ops;
- stale or out-of-order terminal events must not overwrite an already accepted terminal state;
- unknown provider task IDs, task/run mismatches, failed signatures, malformed payloads, and over-budget payloads must enter recovery/DLQ handling instead of advancing the run;
- raw provider payloads must be redacted or stored behind internal-only refs with retention policy, never returned in UI/API projections.

Payload budget rules:

- product evidence, reference image lists, prompts, tool traces, provider payloads, QA crops, and stage outputs must have explicit max sizes before implementation;
- `listAutoReviewRuns` must stay lightweight and must not embed full prompts, provider payloads, QA crops, or long artifact traces;
- `getAutoReviewRun` may include richer detail but still uses redacted refs for large/internal artifacts;
- if a stage would exceed the budget, the system must summarize/link internal artifacts or block before new spend according to `MarketplaceAutoReviewPayloadBudget`;
- oversize payloads are not a reason to retry the same LLM/provider call blindly.

Storage and transcode rules:

- before provider generation, re-hosting, render, or Library finalize, estimate intermediate and final bytes against tenant/user quota;
- near-limit or blocked quota states must be timeline-visible before spending more credits;
- final video must meet browser-compatible container/codec, duration, resolution, and max-byte constraints before `library_finalize`;
- partial uploads and failed transcodes must create cleanup refs and refund/release behavior where applicable;
- temporary provider URLs must be re-hosted/proxied before user-visible surfaces consume them.

Retry, DLQ, and launch SLO rules:

- retry policy must be declared by failure class, not by generic stage failure;
- provider refusals, policy blocks, payload budget failures, and quota blocks are non-retryable unless new user/admin input changes the input;
- background jobs must use leases or equivalent stage-claim protection so stale workers cannot keep spending;
- repeated transient failures must land in a dead-letter/recovery state with preserved artifacts and credit reconciliation;
- launch dashboards/alerts must cover stuck run age, queue wait, DLQ count, callback auth failures, duplicate/out-of-order event rate, storage quota failures, transcode failures, credit mismatch, provider refusal spike, and completion latency.

### 18.13 Privacy, Audio Rights, Distribution Profile, And Feedback Memory

Feature 117 creates ad-like media from marketplace evidence, so it must protect people, rights, and destination-specific constraints before the system can run unattended.

Marketplace privacy rules:

- run preflight must create `MarketplaceEvidencePrivacyEnvelope` before any LLM planning call receives marketplace DOM text, screenshot OCR, review text, comments, or uploaded evidence;
- run preflight must then create `MarketplaceEvidenceInstructionFirewall` before any gateway-routed LLM/vision/repair prompt receives marketplace evidence or prior AI output;
- account headers, order/cart/checkout/payment data, chats/messages, email, phone, address, customer usernames, profile photos, reviewer identities, unrelated people, and private seller/account data must be removed, masked, internal-only, or blocked;
- hidden or instruction-like marketplace text, fake prompt/schema/tool snippets, fake budget/provider instructions, or policy-bypass language must be quarantined, escaped, or converted to structured fact refs before Agents context is built;
- review text and rating summaries are untrusted evidence and cannot become named testimonials, simulated reviewer quotes, review screenshots, review stars, or social-proof visuals unless the run has explicit evidence, rights, and approval;
- final QA must inspect rendered visuals, captions, subtitles, warning overlays, and audio transcript for accidental PII or private marketplace data.

Audio rights and mix rules:

- every audio asset must have an `AudioRightsAndMixEnvelope` before final render;
- generated TTS, native video audio, music beds, sound effects, uploaded audio, and Library audio refs must record source, provider/model or asset ref, license policy, commercial-use status, attribution, and restrictions;
- unapproved voice cloning, celebrity-like voice imitation, copyrighted song imitation, unlicensed stock music, or user-uploaded reference audio without rights must block finalization;
- final audio QA must check voice intelligibility, loudness target, music-under-voice level, max silence, abrupt cuts, and required attribution/disclosure where policy requires it.

Distribution profile rules:

- every storyboard/video run must declare a `MarketplaceAutoReviewDistributionProfile` before media payload generation;
- platform profile controls aspect ratio, dimensions, frame rate, duration range, safe areas, subtitle/caption policy, warning/disclosure placement, CTA placement, and loudness/export expectations;
- deterministic subtitles/warnings must be checked against the selected profile safe areas, not generic frame positions;
- final render must fail or create a profile-specific repair when output duration, resolution, safe-area, caption, warning, loudness, or file profile does not match the target destination;
- when multiple export variants are required, each variant must have its own profile, lineage refs, QA result, storage quota check, and Library metadata.

Creative feedback memory rules:

- creative novelty memory may store approved concept fingerprints, rejected fingerprints, QA reason codes, user feedback scores, and platform-profile results only after redaction;
- tenant/product memory must not leak product private evidence, customer PII, raw prompts, raw provider payloads, images, or failed outputs into another tenant or product context;
- blocked, misleading, unsafe, visually wrong, or unapproved outputs must not be used as positive examples;
- feedback memory is an aid for future concept diversity and repair prioritization, not a substitute for product truth, ad compliance, QA, or user approval.

### 18.14 Synthetic Disclosure, CTA Integrity, QA Calibration, And Post-Publish Governance

Feature 117 must not stop at "file rendered." A generated review video may be downloaded, reused, or published later, so disclosure, links, quality confidence, and future invalidation must be preserved with the artifact.

Synthetic disclosure and provenance rules:

- create `SyntheticMediaDisclosureEnvelope` before final render whenever the output includes AI-generated visuals, generated people, synthetic voices, generated product contexts, or generated audio;
- apply visible disclosure, metadata-only disclosure, platform flag, or C2PA-style metadata when platform/tenant policy requires it;
- if a platform requires synthetic-media flags at upload time, the Library metadata must preserve the flag decision even when Feature 117 does not auto-post;
- final QA must verify required synthetic/affiliate/sponsored disclosures are present, readable, and not hidden behind product, CTA, captions, or platform UI safe areas.

CTA and landing integrity rules:

- create `CtaLandingIntegrityEnvelope` before final render when voiceover, caption, overlay, description metadata, or CTA asks the viewer to buy, click, visit, compare, or claim an offer;
- source URL, affiliate URL, shop link, custom landing page, redirect chain, and tracking parameters must be server-validated and redacted according to policy;
- CTA wording must match product identity, selected variant, current approved offer evidence, and target platform policy;
- broken links, private/internal URLs, unsafe redirects, product mismatch, wrong variant landing, expired offers, or unapproved volatile offer claims must block finalization or remove the CTA.

QA calibration and spot-check rules:

- create `AutomationQualityCalibrationPolicy` for each promoted run or release cohort;
- model/provider/QA policy changes must trigger fixture replay or spot-check before broad promotion;
- low-confidence visual/product/privacy/ad/audio/distribution QA or repeated user rejection must route to human spot-check instead of silently continuing as a normal pass;
- QA verdicts must include confidence/source enough to distinguish deterministic checks, model-based checks, provider metadata checks, and human review.

Post-publish governance rules:

- create `PostPublishGovernanceEnvelope` for final Library outputs and export variants;
- final assets must carry allowed reuse modes, review/expiry metadata, invalidation triggers, and action-on-invalidation policy;
- if product evidence is deleted, rights are revoked, offer/landing evidence expires, policy changes, or a privacy/takedown complaint is recorded, the system must block reuse or require re-check before another export/publish;
- external publish refs, when later supported, must be stored as refs only and never with plaintext platform credentials.

### 18.15 Campaign Governance, Brand Voice, And Human Review Queue

Feature 117 must support repeated creative generation from the same product without becoming duplicate ad spam, uncontrolled spend, or brand-inconsistent output.

Campaign and batch governance rules:

- create `CampaignGenerationGovernanceEnvelope` before any variation set or campaign batch starts;
- batch generation uses the same run/stage, gateway, credit, QA, policy, and timeline controls as a single run;
- enforce tenant/user/product/campaign active-run caps, daily variant caps, spend caps, rate-limit keys, and duplicate creative similarity thresholds before new provider reservations;
- abnormal repair spend, provider refusal spikes, policy-risk spikes, duplicate concept patterns, or same-product campaign floods must pause additional paid work and show a timeline-safe blocker;
- batch approval, when required, must authorize only the scoped campaign/run/artifact set and must not become blanket approval for future changed evidence or policy snapshots.

Brand and seller voice rules:

- create `BrandVoiceAndSellerPolicyEnvelope` when the selected product, seller, tenant, or campaign has tone, style, phrase, pronunciation, or CTA guidance;
- brand/seller voice can guide hook style, wording, Thai politeness/register, pronunciation, CTA tone, and pacing;
- brand/seller voice cannot override product evidence, Thai/international ad policy, asset rights, privacy redaction, synthetic disclosure, CTA integrity, or QA blockers;
- competitor names, comparison claims, official-sounding badges, superlatives, or brand-adjacent claims must be forbidden unless evidence and policy approval explicitly allow them;
- internal compliance notes, negative QA reasons, or private seller instructions must never leak into final voiceover, captions, overlays, metadata, or UI copy.

Human review queue rules:

- create `HumanReviewQueuePolicy` whenever high-volume batch generation, regulated categories, budget over policy, low-confidence QA, brand exceptions, rights/privacy exceptions, competitor/comparison claims, or post-publish reuse risk requires a human decision;
- review queue decisions must include approver role, affected refs, run/stage scope, policy snapshot, SLA, timeout action, and idempotency key;
- approval is scoped to the exact evidence, artifact, policy snapshot, output mode, export variant, and campaign batch being reviewed;
- rejection must create targeted repair, replan, or terminal blocker without discarding completed safe artifacts;
- expired or missing review decisions must pause or block according to policy instead of silently continuing to spend or publish.

### 18.16 Publishable Asset Package, Thumbnail, Transcript, And Metadata Manifest

Feature 117 should finish with a usable asset package, not only a raw video file. For distribution profiles that need post copy, thumbnails, subtitles, transcripts, or metadata, the final package must be generated and checked as part of the run.

Publishable package rules:

- create `PublishableAssetPackageEnvelope` before `library_finalize` when the distribution profile requires title/caption/description, hashtags, thumbnail/cover, transcript, subtitle sidecar, alt text, metadata manifest, or checksums;
- title, social caption, description, hashtags, alt text, thumbnail overlay text, and CTA metadata are ad content and must pass product truth, Thai/international ad compliance, CTA integrity, privacy, rights, disclosure, brand/seller policy, and distribution-profile checks;
- platform metadata must respect platform character limits, hashtag count limits, link policy, affiliate/material-connection disclosure, and safe wording for regulated categories;
- no publish metadata may include internal QA notes, raw prompt text, policy reasoning, private seller instructions, hidden marketplace evidence, or customer/reviewer identities.

Thumbnail and cover rules:

- thumbnail/cover may be extracted from an approved frame, selected by the user, or generated only from approved product-safe references;
- thumbnail must not mutate product identity, show a different variant, invent packaging/logos/badges, create fake before/after, fake discount, fake rating, fake certification, or misleading result claims;
- face/character continuity rules apply to thumbnails when a presenter or person appears;
- thumbnail overlay text, when present, must be deterministic text rendering or controlled composition and must pass OCR/readability, safe area, and ad compliance checks.

Transcript and subtitle rules:

- transcript and subtitle text must come from approved voiceover/script, TTS alignment, verified ASR, or manual edit; video/image prompts and internal planning text are forbidden subtitle sources;
- subtitle artifacts must declare burn-in versus sidecar mode, language, timing source, and QA status;
- transcript/subtitle timing must match the final rendered audio after repair and render, not only the planned storyboard timing;
- final metadata manifest must include refs for final media, thumbnails, subtitles/transcripts, checksums, duration/resolution/codec summary, distribution profile, QA, credit, lineage, disclosure, CTA, and governance envelopes.

### 18.17 Input Change Impact, Approval Invalidation, And Partial Reuse

Feature 117 runs can last long enough for product data, images, price snapshots, rights, policy, or user edits to change mid-run. The automation must not either restart everything blindly or continue with stale approvals. It must compute impact and preserve only safe artifacts.

Input change impact rules:

- create `RunInputChangeImpactEnvelope` whenever background advancement, manual refresh, repair, render, finalization, or reuse detects a newer product/evidence/policy snapshot than the one used by the current stage;
- compare product fields, selected variant hash, product image refs/order, price/offer snapshot, source/affiliate/landing URL, evidence retention/purge state, asset rights, privacy redaction, evidence instruction firewall, production creative brief, brand/seller policy, distribution profile, warning/disclosure policy, human review decisions, and user storyboard/script edits;
- if a change affects only metadata or publish packaging, preserve generated media and repair only metadata/package artifacts;
- if a change affects product identity, selected variant, product image reference, claim evidence, rights, or privacy, recheck or invalidate every downstream concept, prompt, media payload, generated asset, QA verdict, approval, and publishable package that depended on the stale ref;
- if an approved artifact remains visually/product-truth safe, preserve it with a new recheck verdict instead of regenerating paid media.

Approval, QA, and credit invalidation rules:

- approval decisions are valid only for their exact evidence, policy snapshot, artifact refs, output mode, and export variant;
- credit estimates and reservations must be recomputed when changed inputs alter provider, duration, output count, repair scope, render profile, package requirements, or distribution profile;
- QA verdicts must be re-run when their evidence refs, policy snapshot, model/provider snapshot, generated media refs, or final audio/render refs change;
- invalidated approvals/QA/credit refs must remain auditable but cannot authorize further spend, render, publication, or reuse.

Timeline and partial reuse rules:

- timeline must show the changed input, impacted stages, preserved artifacts, invalidated artifacts, next action, and whether the run is doing recheck, repair, replan, regenerate, or block;
- invalidation must be idempotent so repeated refresh/resume does not repeatedly discard artifacts or duplicate charges;
- user/admin edits to storyboard, script, CTA, distribution profile, brand policy, or warning text must trigger the same impact analysis before continuing;
- terminal blockers must preserve partial outputs and explain which changed input made continuation unsafe.

---

## 19. Observability And Audit

Persist:

- automation request,
- runtime version,
- SDK version,
- adapter version,
- gateway model metadata,
- production creative brief snapshot,
- evidence instruction firewall refs,
- character identity asset pack refs,
- concept set,
- selected concept,
- planner output,
- QA results,
- tool calls,
- credit estimates,
- reservations,
- deductions,
- refunds/releases,
- campaign governance decisions,
- brand/seller voice policy decisions,
- human review queue decisions,
- publishable asset package decisions,
- thumbnail/subtitle/transcript/metadata manifest refs,
- input change impact decisions,
- product reference asset pack decisions,
- advertising policy rule-pack refs and triggered rule IDs,
- stage completion evidence refs,
- SDK capability manifest refs,
- provider task IDs,
- render job IDs,
- repair attempts,
- approval decisions,
- policy/model/pricing/credit/compliance snapshots,
- artifact lineage records,
- final status,
- output artifact refs.
- privacy envelope refs,
- audio rights/mix envelope refs,
- distribution profile refs,
- creative feedback memory decisions.
- synthetic disclosure/provenance envelope refs,
- CTA/landing integrity refs,
- QA calibration decisions,
- post-publish governance refs.

Required metrics:

- storyboard completion rate,
- video completion rate,
- average time to storyboard,
- average time to final video,
- cost per completed video,
- creative quality score distribution,
- creative brief default/ambiguity/review-required rate,
- hook truth-risk block rate,
- advertising compliance block rate,
- QA repair rate by reason code,
- product fidelity failure rate,
- face continuity failure rate,
- character identity pack blocked/limited/fallback rate,
- voice identity drift repair rate,
- natural speech failure rate,
- audio continuity failure rate,
- unsupported claim block rate,
- provider retry rate,
- provider callback auth failure rate,
- duplicate/stale/out-of-order provider event rate,
- final render failure rate,
- user intervention rate.
- queue wait time by tenant/user,
- stage duration distribution,
- provider/model fallback rate,
- provider entitlement/rate-limit block rate,
- cancellation rate and cancellation refund latency,
- signed URL redaction/re-host failure rate,
- consent/likeness blocker rate.
- payload-budget block rate,
- storage quota block rate,
- transcode/playability failure rate,
- DLQ count by failure class,
- stuck run age and stage lease timeout count.
- privacy redaction/block rate,
- audio rights/licensing block rate,
- distribution profile QA failure rate,
- subtitle/caption safe-area failure rate,
- creative feedback memory rejection rate.
- synthetic disclosure required/missing rate,
- CTA/landing integrity failure rate,
- QA calibration spot-check rate,
- post-publish invalidation/recheck rate,
- publishable package completion/block rate,
- thumbnail QA failure rate,
- subtitle/transcript timing failure rate,
- platform metadata compliance failure rate,
- metadata manifest/checksum failure rate,
- input-change recheck rate,
- downstream invalidation rate,
- preserved-artifact reuse rate after input change,
- stale-approval invalidation rate,
- product reference pack blocked/needs-better-image rate,
- policy rule-pack fixture replay failure rate,
- stage completion evidence block rate.
- SDK capability manifest denial rate by reason code.
- creative brief change invalidation rate.
- evidence instruction firewall block/quarantine rate.
- attempted evidence policy/provider/credit override rate.

---

## 20. Migration From Current Auto Review

Node canvas is moved to a separate future feature/spec and is not part of Feature 117. The current codebase has moved toward a stage-based Marketplace Auto Review pipeline, so Feature 117 must migrate that pipeline directly.

Implementation must replace these current behaviors:

- `buildAutoReviewPlan` deterministic 9-shot template becomes Agents Creative Concept Director + Storyboard Director output.
- String-only product detail/prompt locks become structured product truth, volatile signal policy, claim/evidence map, visual identity lock, and shot contract.
- `marketplace-auto-review-director` and `marketplace-auto-review-verifier` labels become real gateway-routed Agents runtime steps with persisted outputs.
- Current `concept_story` and `prompt_plan` stage outputs become structured Agents artifacts, not only deterministic strings.
- Current image/video/audio/render stages remain Node-owned execution stages and are enhanced with QA and repair decisions.
- Current `ProductionSpace` and `flowNodes` coupling in Marketplace Auto Review must be removed or bypassed. Feature 117 must schedule media generation from validated shot payloads and run/stage checkpoints directly.

Feature 117 replaces orchestration behavior for eligible automated actions:

- Marketplace `startAutoReview` uses Agents SDK runtime for concept/story/prompt/QA planning.
- Media Studio `Create Plan` or auto-complete actions use the same contracts where applicable.
- Production verifier becomes Agents SDK QA Supervisor output.
- Marketplace concept synthesis becomes Creative Concept Director output.
- Shot media payload suggestion becomes Media Payload Director output.
- Handoff preview remains deterministic platform derivation, but its readiness input comes from Agents SDK QA.
- Provider execution should reuse existing provider/media generation capabilities, but any canvas-only service boundary must be extended or bypassed for direct shot payload execution.
- Render still uses existing media job/render worker.

No shadow mode is required or allowed for this feature. Implementation may use feature flags to control availability, but once enabled for an action the old and new runtime must not both process the same request.

---

## 21. Rollout And Kill Switches

Allowed operational controls:

- disable Marketplace `Create Video`,
- disable Marketplace `Create Storyboard`,
- disable Media Studio auto video,
- disable auto provider credit reservation,
- disable auto repair spend,
- force manual credit authorization,
- block specific agent role,
- block specific model/provider through existing policy.

Disallowed controls:

- hidden dual-run comparison,
- silent fallback to direct provider LLM calls,
- bypassing gateway due to adapter failure,
- bypassing credit reservation due to automation mode.

If the runtime is disabled, UI should route users to manual Production Director/Storyboard Review/Video Edit flows.

### 21.1 Operator Recovery Runbook

Before broad rollout, implementation must include an operator-facing recovery runbook or admin-safe procedures for long-running jobs. These procedures must repair durable state without inventing success, hiding credit errors, or bypassing hard policy blocks.

Recovery scenarios to cover:

- run stuck in active status with no stage update beyond stale threshold;
- provider task submitted but DB update failed before task ref was persisted;
- DB task exists without provider task ID;
- provider callback/polling result references an unknown or duplicated provider task ID;
- provider callback has failed signature/authentication, stale sequence, out-of-order terminal status, or tenant/run mismatch;
- provider result URL expired before re-hosting;
- re-hosting succeeded but final DB update failed;
- payload/trace/provider response exceeds retention or API projection budget;
- storage quota, output byte limit, codec, or transcode preflight blocks finalization;
- render job completed but Library finalize failed;
- refund/release failed after provider/render failure;
- credit ledger mismatch after repeated retries or cancellation;
- policy snapshot missing or incompatible with replay;
- timeline projection cannot be built from stored run/stage metadata;
- queue/backpressure backlog exceeds tenant/provider threshold;
- gateway outage during Agents planning/QA;
- retention cleanup failed for intermediate media or QA crops.

Allowed recovery actions:

- pause new spending for the affected tenant/provider/model;
- rebuild timeline projection from durable run/stage/artifact state;
- requeue polling or resume from the latest safe checkpoint;
- force-cancel or mark terminal failure with preserved partial artifacts and credit reconciliation;
- attach a missing provider task ref only when verified by provider-side evidence and idempotency key;
- retry re-hosting from a still-valid provider URL or mark blocked when no longer recoverable;
- reprocess a DLQ event only after its signature/trust binding, task mapping, and idempotency key are verified;
- summarize or redact an oversized trace into internal storage and rebuild the safe API projection;
- run quota cleanup for eligible intermediate artifacts before retrying storage/finalize work;
- run credit reconciliation and create idempotent refund/release events;
- require user/admin review for soft warnings or stale approvals.

Disallowed recovery actions:

- marking a stage completed without the required artifact, QA verdict, and lineage refs;
- editing credits directly outside the credit ledger/reconciliation path;
- bypassing gateway/credit/provider policy because a run is stuck;
- accepting an unauthenticated provider callback or mismatched provider task because it appears to contain a successful URL;
- storing raw over-budget provider/LLM payloads directly in UI-facing run metadata;
- approving hard-blocked claims, missing consent, unsupported provider access, tenant restrictions, or budget denial;
- replacing product/variant truth to make a failed output appear valid.

The runbook must define ownership, dashboards/log queries, escalation thresholds, and the exact user-visible timeline status for each recovery outcome.

---

## 22. Testing Requirements

### 22.1 Contract Tests

- SDK adapter cannot be imported outside Python adapter boundary.
- SDK model client uses SmartSpecPro LLM gateway only.
- Missing gateway metadata fails closed.
- Direct provider credentials fail closed.
- SDK capability manifests validate allowed agents, tools, handoffs, output schemas, session policy, trace policy, hosted capability denials, and manifest hash.
- Runtime output validates against schemas.
- Tool calls require permission, idempotency, and audit metadata.
- Unknown tool calls, handoffs that widen scope, raw trace/session capture, hosted SDK capabilities, and over-call-limit tool use fail before additional spend.
- Production creative brief snapshots validate objective, audience/use context, viewer promise, creative latitude, quality mode, auto-decision policy, style preferences, CTA intent, user hint trust levels, ambiguity state, and snapshot hash.
- Product variant snapshots validate selected options, evidence refs, price snapshot refs, volatility policy, and variant hash.
- Access snapshots validate owner/group permission, allowed actions, credit payer, and background recheck policy.
- Evidence freshness snapshots validate stale product handling, raw evidence purge state, source page state, image readiness, and blocked volatile claim types.
- Product reference asset packs validate primary/supporting/rejected references, crop/mask/fingerprint refs, selected variant binding, provider use policy, and required user action before visual provider spend.
- Advertising policy rule packs validate source anchors, jurisdiction/profile, category triggers, rule IDs, blocked patterns, required evidence kinds, warning template refs, allowed repair actions, fixture refs, approval status, and effective dates.
- Stage completion evidence envelopes validate requested transition, required evidence kinds, present/missing refs, warning/blocking reason codes, evaluator, and idempotency key.
- Asset rights envelopes validate exact-product-use-only assets, standalone brand/logo restrictions, marketplace badge blocks, and approval refs.
- API projections validate old Feature 118 rows, new Feature 117 rows, detail projection, list summary projection, and redaction rules.
- Artifact lineage validates parent refs, selected variant hash, QA refs, approval refs, credit refs, and storage/redaction state.
- Provider event envelopes validate signature/trust mode, tenant/run/stage/task binding, idempotency, duplicate/stale/out-of-order handling, and redacted payload refs.
- Payload budgets validate prompt, provider payload, stage output, trace, detail projection, and list projection limits.
- Storage quota plans validate estimated intermediate/final bytes, quota state, required re-host refs, cleanup refs, and transcode profile limits.
- Retry/DLQ policies validate retryability by failure class, stale lease timeout, retry budget, alert threshold, and replay permission.
- Privacy envelopes validate PII finding classes, redaction actions, allowed agent context refs, blocked generation refs, and final media privacy risk.
- Evidence instruction firewalls validate source refs, privacy envelope ref, detected instruction patterns, quarantined/blocked refs, allowed agent-context refs, confidence, and pre-gateway-spend enforcement.
- Audio rights/mix envelopes validate commercial-use rights, attribution, voice consent, license policy, restrictions, loudness targets, and blocked audio sources.
- Distribution profiles validate target platform, placement, aspect ratio, dimensions, safe areas, caption policy, duration range, warning overlay policy, and export variants.
- Creative feedback memory policies validate tenant isolation, allowed/forbidden memory kinds, retention, external-training prohibition, and failed-output exclusion.
- Synthetic disclosure envelopes validate AI-generated refs, materially synthetic status, synthetic human/voice flags, disclosure requirements, platform flags, provenance metadata, and watermark policy.
- CTA/landing integrity envelopes validate URL reachability, redirect safety, product/variant match, volatile offer approval, tracking policy, and CTA text evidence.
- Automation quality calibration policies validate fixture set refs, QA confidence thresholds, drift signals, spot-check policy, and promotion gate.
- Post-publish governance envelopes validate allowed reuse, expiry/review metadata, invalidation triggers, action-on-invalidation, external post refs, and audit refs.
- Campaign governance envelopes validate generation mode, product/campaign caps, spend cap, duplicate similarity refs, anomaly signals, approval requirements, and rate-limit keys.
- Brand voice and seller policy envelopes validate tone/register, allowed/required/blocked phrases, competitor policy, claim/CTA style policy, pronunciation hints, evidence refs, and approval refs.
- Human review queue policies validate required reasons, approver roles, scope, SLA, timeout action, decision refs, and exact artifact/policy snapshot scoping.
- Publishable asset package envelopes validate final video refs, thumbnail refs, subtitle/transcript refs, platform metadata, evidence refs, metadata manifest refs, checksum refs, and package QA status.
- Run input change impact envelopes validate previous/current snapshot refs, detected change kinds, impacted stages, artifact actions, invalidated approval/credit/QA refs, and partial-reuse status.
- Shot frame vision QA envelopes validate frame role, product refs, variant refs, character refs, gateway usage refs, per-check verdicts, findings, and targeted repair status.
- Targeted media unit repair plans validate failed QA refs, exact shot/media unit, preserve/invalidate refs, downstream recheck stages, attempts, credit estimate refs, and idempotency keys.
- Generated media acceptance envelopes validate artifact state, QA refs, repair refs, allowed/blocked surfaces, superseded refs, retention policy, and user-visibility flags.

### 22.2 Credit Tests

- Planning LLM calls record LLM credits.
- Provider generation cannot run before reservation.
- Duplicate idempotency key does not double charge.
- Repair charges only incremental affected work.
- Failed provider job releases/refunds according to existing rules.
- Auto spend stops when budget policy is exceeded.
- Batch/campaign spend anomaly pauses additional paid work before new provider reservations and preserves credit audit state.

### 22.3 Marketplace Tests

- `startAutoReview` creates exactly one active run per product/user when dedupe policy applies.
- Variant-aware runs include selected variant snapshot in preflight and idempotency policy; if parallel variant runs are not enabled, UI blocks the second active variant run with clear status.
- Shared product runs preserve access type and credit payer; read-only group access cannot mutate product evidence or publish outputs to the shared product context.
- Access revocation after run start blocks new paid work while preserving completed artifacts and audit.
- Stale product evidence blocks volatile claims or asks for recapture before media spend.
- Remote marketplace product images are re-hosted/proxied or blocked before paid generation depends on them.
- Campaign batch generation enforces product/tenant active-run caps, daily variant caps, duplicate creative thresholds, and batch approval rules.
- Active Auto Review runs advance through durable stages and resume after process restart or background interval tick.
- Storyboard-only mode completes at `storyboard_review` without scheduling video/render stages.
- Full-video mode completes through `library_finalize` and stores render/library IDs.
- Ready product can create storyboard.
- Ready product can create video when budget policy allows.
- `ready_with_warnings` requires policy-safe warning or approval.
- `needs_user_review` blocks video.
- `insufficient_evidence` blocks video and limits storyboard.
- Unsupported claim in voiceover blocks generation.
- High hero image fidelity risk blocks direct video.

### 22.4 Creative Variation Tests

- Same product generates distinct concepts across repeated variation runs.
- Runtime does not invent new product facts while varying story.
- Runtime does not invent SKU/variant-specific color, size, package count, price, stock, or bundle details outside the selected variant snapshot.
- Prior rejected concept pattern is not reused.
- Duplicate hook/camera/story arc is flagged.
- Duplicate campaign variants above similarity threshold are blocked or sent to replan before spend.
- Weak or generic hooks are scored lower than product-specific hooks.
- Deceptive curiosity hooks are blocked even when creative quality is high.
- Proof-first and before-buy-check concepts pass when every claim has evidence.

### 22.5 Storyboard Tests

- Every shot has journey stage.
- Every claim has evidence IDs.
- Every hook has a truth-risk verdict.
- Every claim has nearby proof or expectation guard.
- Voiceover timings cover full duration without long unintended silence.
- Voiceover scripts pass natural speech checks for target language.
- Captions fit duration and platform constraints.
- Shot order forms coherent story.
- CTA follows setup/proof and does not appear abruptly.
- Storyboard handoff includes QA and evidence metadata.

### 22.6 Visual QA Tests

- Wrong product image is blocked.
- Product color/logo/packaging mutation is blocked.
- Product shape/proportion/material drift is blocked.
- Invented product accessories/components are blocked.
- Person turning around with changed face is blocked.
- Profile-to-front and occlusion-then-reveal face changes are blocked.
- Inconsistent presenter across shots is blocked when continuity required.
- Product missing from proof/demo shot triggers repair.

### 22.7 Audio QA Tests

- Long silence is detected.
- Abrupt voice cut is detected.
- TTS voice mismatch is detected.
- Music overpowering voice is detected.
- Subtitle timing mismatch is detected.
- Robotic repetition and product-name stuffing are detected.
- Spoken unsupported claims are detected.

### 22.8 Advertising Compliance Tests

- Unsupported objective claim blocks before provider credits.
- Fake urgency, fake scarcity, fake discount, fake rating, and fake sold-count claims block.
- Fabricated testimonial/review framing blocks.
- Unapproved superlative or guarantee blocks.
- Misleading before/after implication blocks.
- Health, body, finance, safety, or legal-outcome claim requires approved substantiation.
- Thailand profile blocks false, exaggerated, unverifiable, or misleading Thai ad phrasing before provider credits.
- Thailand profile blocks unapproved health/beauty/body/medical claims for FDA/อย.-sensitive product categories.
- Thailand profile blocks invented FDA/อย. numbers, certification marks, official badges, and license/label text.
- Thai-language risky phrases are rewritten to evidence-safe buyer-check wording when safe, otherwise blocked.
- Required warning/disclosure overlay is rendered by deterministic compositor, not image/video generation prompt text.
- Required warning/disclosure overlay passes OCR exact-text match.
- Required warning/disclosure overlay fails when it covers the product, face, CTA, or unsafe mobile area.
- Required Thai warning text fails when font size, contrast, line count, or visible duration is below policy threshold.
- Affiliate/material connection disclosure is represented when tenant/platform policy requires it.
- Final render net-impression QA can block even if individual sentence checks passed.
- Customer/reviewer usernames, profile photos, order/cart/account data, phone, email, address, chat snippets, or private seller/account data are redacted or blocked before planning and final output.
- Named review/testimonial/social-proof visuals require evidence, rights, and approval; otherwise they are blocked or rewritten generically.
- Target-platform distribution profile enforces safe areas for warning text, captions, CTA, and platform UI before finalization.
- Brand/seller voice cannot force prohibited phrases, unsupported claims, competitor mentions, or internal compliance notes into public ad copy.
- Human review queue is required for regulated, high-volume, high-budget, low-confidence, rights/privacy exception, or competitor/comparison claim scenarios.
- Publish metadata, hashtags, thumbnail text, alt text, and descriptions are checked as ad content and cannot include unsupported claims, private evidence, fake proof, or internal planning notes.

### 22.8.1 Media Safety And Rights Tests

- Provider moderation/content-policy refusal maps to sanitized `blocked_needs_user` or `failed_terminal`, not repeated paid retries.
- Sexual, minor-sensitive, graphic violence, hate, self-harm, illegal, weapon, controlled goods, counterfeit, or unsafe-instruction content blocks or requires approved policy before provider spend.
- Public-figure, celebrity-like, or deceptive endorsement concepts block unless approved by policy and evidence.
- Review images, seller logos, marketplace badges, platform UI, certification marks, and standalone brand marks are not reused as decorative/generated assets without explicit rights approval.
- Logos physically printed on product/package are preserved only as incidental product identity details.
- Final QA blocks generated unsafe visuals/text/audio that were not in the approved plan.

### 22.9 End-To-End Tests

Canonical E2E scenarios:

1. Marketplace product -> `startAutoReview(storyboard_images)` -> stages complete through `storyboard_review` -> Storyboard Review ready.
2. Marketplace product -> `startAutoReview(full_video)` -> stages complete through `library_finalize` -> final MP4 in Media Library.
3. Production Project -> Auto Complete Storyboard -> approved storyboard.
4. Production Project -> Auto Create Video -> final MP4.
5. Product with unsupported claim -> blocked before provider credits.
6. Product with high image mismatch -> blocked before provider credits.
7. Provider clip failure -> targeted repair -> final video completes.
8. Audio gap detected -> audio repair -> final video completes.
9. Repeated repair failures -> durable `blocked_needs_user` with partial outputs.
10. Duplicate request idempotency -> no duplicate charge or duplicate jobs.
11. Creative but misleading hook -> blocked before provider credits.
12. Product identity drift after image/video generation -> targeted repair or block.
13. Presenter face changes across clips -> targeted repair or product-only fallback.
14. Required Thai warning overlay -> deterministic render -> OCR/readability pass -> final video completes.
15. Required warning overlay missing/unreadable -> repair or `blocked_needs_user`.
16. Product detail timeline shows completed, active, blocked, and remaining stages after refresh/resume.
17. Shared product with read-only group access -> private output only or blocked according to tenant policy, no product evidence mutation.
18. Stale product with old price/sold-count snapshot -> generic product video allowed only if volatile claims are removed or freshly approved.
19. Provider safety refusal -> no repeated paid retry, sanitized blocker shown, audit preserves safe reason.
20. Marketplace one-click run with no custom user prompt -> persisted default creative brief -> concept selection cites objective/audience/quality mode.
21. User changes target audience or CTA after concept selection -> only dependent concept/story/script/metadata refs invalidate, accepted unrelated media remains preserved after recheck.

### 22.10 Operational Hardening Tests

- Requested provider/model unavailable -> timeline-visible provider/model blocker or approved fallback, no silent downgrade.
- Provider rate limit/backpressure -> run queues or blocks with durable reason and does not duplicate jobs.
- Background job double-advance race -> only one stage claim succeeds and no duplicate provider/credit events occur.
- Stuck run recovery -> operator procedure can pause/resume/fail terminally from durable checkpoints without duplicate provider jobs or credit events.
- Orphan provider task reconciliation -> verified provider task ref can be attached once, or run is blocked with refund/release path.
- Missing/corrupt timeline projection -> backend rebuilds from durable run/stage/artifact lineage or blocks with diagnostic reason.
- User cancellation during provider wait -> future scheduling stops, cancellable jobs are cancelled where supported, non-cancellable jobs are recorded, and unused credits are released/refunded.
- Provider output URL is signed/temporary -> final asset is re-hosted or proxied according to media policy before Library finalize.
- Provider callback signature/auth failure -> event is rejected or DLQ'd without advancing the run.
- Duplicate, stale, or out-of-order provider callback -> idempotent no-op with audit, no credit or artifact duplication.
- Oversized prompt/provider response/stage trace -> summarized/redacted or blocked before new spend according to payload budget.
- Storage quota exceeded or final output over byte/codec/duration/resolution limits -> timeline-visible blocker, cleanup/retry only when policy allows.
- Repeated transient worker/provider failures -> DLQ/recovery state after retry budget, no runaway retry spend.
- Feature 118-era rows without new projection/lineage fields -> migration/backfill dry-run reports compatibility and does not rewrite history destructively.
- Trace and UI errors redact signed URLs, cookies, tokens, provider credentials, and raw private payloads.
- Identifiable human reference without consent -> person/face continuity is blocked or converted to safe product-only/hands-only/generic-person alternative.
- Voice cloning request without explicit approved voice-rights contract -> blocked.
- Music, SFX, uploaded audio, or native generated audio without commercial-use/attribution policy -> blocked before final render.
- Distribution profile mismatch in aspect ratio, duration, safe area, subtitle/caption placement, loudness, or export variant -> repair or block.
- Failed/blocked/misleading output is not stored as a positive creative-memory example.
- Missing required synthetic-media disclosure/provenance/platform flag -> repair or block.
- CTA link broken, unsafe, private, wrong-product, wrong-variant, or expired-offer -> remove CTA, refresh evidence, or block.
- Model/provider/QA drift or low-confidence QA cohort -> human spot-check or internal-only promotion gate.
- Product evidence deletion, rights revocation, offer expiry, policy change, privacy complaint, or takedown request -> block reuse or require re-check of existing Library output.
- Retention policy applies to intermediate frames, clips, audio, QA crops, OCR crops, and final render metadata.
- Background advancement re-checks group membership, product access, tenant policy, and credit authority before each new paid stage.
- Same product campaign flood, duplicate variation pattern, abnormal repair spend, provider refusal spike, or policy-risk spike -> pause new spend with timeline-visible blocker.
- Human review decision expiry or timeout follows the configured policy and never silently approves future changed evidence.
- Missing or non-compliant thumbnail, subtitle/transcript, platform metadata, checksum, or metadata manifest blocks Library finalization or publishable-package promotion.
- Mid-run product/evidence/policy/profile/user edits trigger impact analysis, invalidate only affected downstream refs, and preserve safe artifacts with recheck evidence.
- Low-confidence, low-resolution, wrong-variant, remote-unhosted, or rights-blocked product references create a product reference pack blocker before visual provider credits are reserved.
- Draft, deprecated, expired, or fixture-failing advertising policy rule pack -> concept planning, provider generation, render, package promotion, or reuse blocks until an approved pack is selected.
- Stage handler reaches terminal success without required evidence refs -> transition is denied, timeline shows evidence blocker, and no downstream stage starts.
- Failed start/stop/storyboard frame vision QA creates targeted repair for that exact frame and cannot advance video generation or finalization until the repaired unit passes.
- Native-audio or voice-driven character drift creates targeted shot/clip repair or safer strategy switch without regenerating unrelated product frames.
- Unverified, failed, superseded, or policy-blocked media artifacts are quarantined from Storyboard Review, Video Editor, Library, publishable packages, future references, and positive creative memory.
- Unknown SDK tool/handoff/hosted-capability request -> attempt blocks before LLM/provider spend, timeline shows manifest blocker, and no Python-side persistence or trace leak occurs.
- Ambiguous creative brief with auto-selection enabled -> safe defaults, human review, or blocker is chosen before provider spend; user hints that imply claims require evidence/approval refs.

---

## 23. Acceptance Criteria

Feature 117 is accepted only when:

1. Marketplace Capture can start storyboard creation from a selected product.
2. Marketplace Capture can start auto video creation from a selected product.
3. Marketplace Capture storyboard/video automation is driven by durable Auto Review run/stage state, not by creating, updating, or requiring canvas interaction.
4. Media Studio Production can auto-complete a storyboard or video from a Production Project.
5. Agents SDK is the active replacement runtime for eligible concept/storyboard/prompt/QA automation actions.
6. No eligible action runs old and new planner/verifier in parallel.
7. All SDK LLM calls go through SmartSpecPro LLM gateway.
8. SDK runtime cannot call direct provider LLM APIs.
9. Planning/verifier/QA LLM credit usage is recorded through gateway and credit ledger.
10. Provider generation credits are reserved before provider jobs start.
11. Unsupported product claims block or require review before generation.
12. Volatile marketplace signals are not used in narration/captions/visual claims unless approved for the run.
13. Creative hooks are scored for quality and blocked when they create misleading net impression.
14. Advertising compliance QA blocks unsupported, deceptive, or policy-sensitive claims before provider generation.
15. Required warning/disclosure text overlays are deterministic, readable, OCR-verified, and do not mutate product imagery.
16. Thailand-required warning/disclosure overlays are represented when policy/category requires them.
17. Product image fidelity errors block or repair before final output.
18. Product identity is checked against protected reference attributes, not only prompt text.
19. Character/face continuity failures are detected for continuity-required videos.
20. Person turn/reveal/re-entry face changes are repaired, converted to safer shot format, or blocked.
21. Voiceover sounds natural for the target language and fits shot timing.
22. Audio gaps/cuts are detected and repaired or blocked.
23. Long-running jobs resume from checkpoints and finish or stop with a durable reason.
24. Final MP4 output is saved to Media Library through existing render pipeline.
25. Storyboard Review receives ordered shot metadata, evidence, QA, and trace summary.
26. Audit and observability can explain every agent decision, tool call, credit event, repair, and final output.
27. Feature 117 implementation does not modify node canvas UI, persistence, layout, node graph, or node catalog code.
28. Marketplace Capture and Media Studio status views use a backend-derived timeline projection that clearly shows completed work, current stage/substep, blockers, credit/provider waits, outputs, and remaining stages.
29. Variant/SKU context is preserved or explicitly blocked so generated media does not show or claim the wrong product option.
30. API projections are versioned, backward-compatible with Feature 118 rows, and redacted for list/detail UI consumption.
31. Final Storyboard Review, Video Editor, render, and Library outputs have canonical artifact lineage back to product evidence, shot payloads, QA, approvals, and credit events.
32. Operator recovery procedures cover stuck runs, orphan provider tasks, re-host failures, refund mismatches, gateway/provider outage, and timeline rebuild without bypassing hard policy or credit controls.
33. Shared-product permission, credit payer, and background recheck behavior are explicit and auditable.
34. Evidence freshness and asset readiness prevent stale or unreachable marketplace evidence from becoming unsupported claims or failed provider jobs.
35. Asset-use rights and brand/logo restrictions prevent unauthorized standalone logos, marketplace badges, review images, or platform UI from being generated into ads.
36. Provider moderation and general media safety refusals stop safely without repeated paid retries.
37. Provider callbacks/poll results are authenticated or trusted through provider-owned polling, deduped, replay-safe, and bound to the expected run/stage/task before state changes.
38. Payload and trace budgets prevent raw prompts, provider payloads, QA crops, and oversized metadata from leaking into list/detail APIs or breaking run projections.
39. Storage quota, re-hosting, transcode, codec, duration, resolution, and max-byte checks block before finalization can produce an unusable Library asset.
40. Retry, dead-letter, stale lease, and alert policies prevent long-running jobs from looping silently or spending indefinitely.
41. Launch observability includes SLO/alert coverage for completion latency, queue wait, stuck runs, DLQ, callback auth failures, storage/transcode failures, provider refusals, and credit mismatches.
42. Migration/backfill tooling proves old Feature 118 rows remain readable and new projections can be rebuilt without destructive history rewriting.
43. Marketplace PII, customer/reviewer identity, account/order/cart/payment/chat data, and private seller/account data cannot enter generated ads, UI projections, traces, or final media without explicit redaction/approval policy.
44. Audio assets, music, SFX, native generated audio, TTS voices, and uploaded references carry commercial-use rights, attribution, consent, and mix metadata before final render.
45. Every final storyboard/video output is validated against a target distribution profile for platform, aspect ratio, duration, safe areas, subtitles/captions, warning text, CTA placement, loudness, and export variants.
46. Creative feedback memory remains tenant-safe, redacted, and policy-bounded; failed or non-compliant outputs are not reused as positive examples.
47. Synthetic-media disclosure, provenance metadata, platform flags, and visible/metadata disclosure decisions are preserved and verified when policy requires them.
48. CTA text, source URL, affiliate URL, landing page, redirect chain, selected variant, current offer evidence, and tracking policy are validated before finalization.
49. QA calibration, fixture replay, drift signals, and human spot-check sampling gate low-confidence or changed provider/model/policy cohorts before broad promotion.
50. Final Library outputs carry post-publish governance so stale claims, deleted evidence, revoked rights, expired offers, policy changes, privacy complaints, or takedown requests block reuse or require re-check.
51. Campaign/batch generation enforces active-run caps, daily variation caps, duplicate similarity thresholds, spend caps, anomaly blockers, and scoped batch approvals before additional paid work.
52. Brand/seller voice policy improves tone, register, CTA wording, and pronunciation without overriding product truth, Thai/international ad policy, privacy, rights, disclosure, or evidence constraints.
53. Human review queues have explicit reasons, approver roles, artifact/policy snapshot scope, SLA, timeout behavior, and rejection/repair outcomes for high-risk or high-volume automation.
54. Publishable asset packages include compliant thumbnail/cover, title/caption/description, hashtags, transcript/subtitle artifacts, metadata manifest, checksums, and evidence/QA refs when required by the distribution profile.
55. Input/evidence/policy changes during a run create an impact envelope that invalidates stale approvals, QA verdicts, credit estimates, and downstream artifacts only where affected while preserving safe work.
56. Start frames, stop frames, storyboard cells, video keyframes, thumbnails, and final render samples pass gateway-routed vision QA before downstream use.
57. Failed visual/audio-continuity units create targeted repair for the exact shot/frame/clip/audio unit, preserving unrelated passed artifacts and charging only the affected work.
58. Generated media artifacts have explicit acceptance/quarantine state, and only accepted or approved-warning artifacts can route to user-visible or reusable surfaces.
59. Visual provider payloads, targeted repairs, thumbnails, and future reference selection use only approved `ProductReferenceAssetPack` refs; low-confidence, wrong-variant, rights-blocked, private, or unhosted product images cannot trigger paid visual generation.
60. Advertising compliance decisions cite an approved `AdvertisingPolicyRulePack` version and triggered rule IDs; policy changes are replayable and cannot silently alter old approvals or final asset audit history.
61. Every stage completion, warning completion, skip, repair-required transition, retriable failure, block, terminal failure, and cancellation is backed by `MarketplaceAutoReviewStageCompletionEvidence`; downstream stages cannot start from status-only success.
62. Every Agents-backed stage attempt uses a Node-created `ProductionAgentsSdkCapabilityManifest`; Python cannot add tools, handoffs, hosted SDK capabilities, raw session capture, raw trace export, persistence authority, or credit authority outside the manifest.
63. Every run persists `ProductionCreativeBriefSnapshot` before concept generation; auto-selected concepts, scripts, metadata, and repairs cite the brief and cannot treat user hints as product claims without evidence or scoped approval.
64. Every run that uses marketplace DOM/OCR/reviews/seller text/prior AI output creates `MarketplaceEvidenceInstructionFirewall` before gateway LLM spend; quarantined or blocked evidence cannot steer instructions, tools, provider/model routing, credits, approvals, output destinations, or final public copy.
65. Every run that uses a recurring presenter, actor, hand model, character, or voice creates `CharacterIdentityAssetPack`; visual/audio provider payloads, continuity QA, repair, thumbnail selection, render, and Library finalization cannot rely on vague identity prompts or unapproved face/voice refs.

---

## 24. Implementation Notes

Recommended implementation order:

1. Version the current Marketplace Auto Review contracts and decide whether to extend existing tables or add successor tables.
2. Add `media_production` or equivalent media automation surface support to the existing Python Agents runtime contract and gateway metadata.
3. Add `ProductionAgentsSdkCapabilityManifest` before implementing any stage-specific agent runner so tools, handoffs, sessions, traces, hosted SDK capabilities, output schemas, and retry/resume events are manifest-gated.
4. Add `ProductionCreativeBriefSnapshot` before concept generation so objective, audience, user hints, avoid list, quality/speed mode, CTA intent, and auto-decision policy are explicit before Agents plan.
5. Add `MarketplaceEvidencePrivacyEnvelope` and `MarketplaceEvidenceInstructionFirewall` before any Agents planning, gateway-routed vision QA, repair prompt, metadata generation, or provider prompt can consume marketplace evidence.
6. Replace `buildAutoReviewPlan` with an Agents-backed concept/storyboard/prompt planner behind the Node service boundary.
7. Persist Agents outputs into the existing `concept_story` and `prompt_plan` stages with schema validation and idempotency.
8. Add product truth, volatile-signal, visual identity, and claim/evidence guardrails before provider generation.
9. Add `AdvertisingComplianceProfile`, creative hook scoring, and net-impression QA before provider generation.
10. Add `AdvertisingVisualWarningPlan` and deterministic warning/disclosure overlay rendering with OCR/readability QA.
11. Add `MarketplaceAutoReviewDistributionProfile` before shot payload generation.
12. Add `ProductVisualIdentityLock`, `CharacterContinuityLock`, `NaturalSpeechContract`, and `AudioRightsAndMixEnvelope` to shot/audio payloads and QA outputs.
13. Remove or bypass Marketplace Auto Review dependency on `ProductionSpace`, `flowNodes`, and node-canvas-shaped execution.
14. Implement direct shot media payload generation, validation, scheduling, and reconciliation.
15. Bind provider callbacks/polling results to authenticated provider event envelopes, idempotency keys, and DLQ/recovery handling.
16. Implement credit estimate/reservation integration before every LLM and provider step.
17. Enforce payload/trace budgets before API projection, provider submission, and durable stage output persistence.
18. Enforce storage quota, re-host, transcode, codec, duration, resolution, and output byte limits before render/library finalization.
19. Add `CreativeFeedbackMemoryPolicy` for tenant-safe concept novelty and feedback memory.
20. Add `SyntheticMediaDisclosureEnvelope`, `CtaLandingIntegrityEnvelope`, `AutomationQualityCalibrationPolicy`, and `PostPublishGovernanceEnvelope`.
21. Add `CampaignGenerationGovernanceEnvelope`, `BrandVoiceAndSellerPolicyEnvelope`, and `HumanReviewQueuePolicy` before enabling batch/variation automation.
22. Add `PublishableAssetPackageEnvelope` before treating final Library output as publish-ready.
23. Add `RunInputChangeImpactEnvelope` before allowing background resume, repair, render, or finalization to continue after product/evidence/policy/profile edits.
24. Add `ShotFrameVisionQaEnvelope` and `TargetedMediaUnitRepairPlan` before accepting generated frames, keyframes, thumbnails, or final render samples for downstream use.
25. Add `GeneratedMediaAcceptanceEnvelope` so candidate, accepted, quarantined, superseded, and discarded media refs are routed safely.
26. Add `ProductReferenceAssetPack` before paid visual provider work so every product image reference is selected, hosted, rights-safe, variant-bound, fingerprinted, and rejected/blocked when unreliable.
27. Add `AdvertisingPolicyRulePack` before using Thai/global/platform ad compliance gates so rules, source anchors, warning templates, and fixture refs are versioned and replayable.
28. Add `CharacterIdentityAssetPack` before recurring presenter/actor/hand-model/voice generation so face, body, hands, wardrobe, and voice continuity use approved refs, consent, and fallback rules.
29. Add `MarketplaceAutoReviewStageCompletionEvidence` before broad stage rewiring so no handler, worker, recovery action, or migration helper can mark a stage complete, repair-required, retriable-failed, blocked, cancelled, or terminal-failed without required artifacts, QA, credits, policy, repair/retry, governance, and lineage refs.
30. Reuse current image/video/audio/render/library stages and add QA/repair loops around them.
31. Implement Storyboard Review/Video Edit/final render handoff with trace/evidence/credit summaries.
32. Update Marketplace Capture progress UI to show a backend-derived timeline with completed/current/remaining stages, QA/blocker state, credit/provider waits, repair attempts, and output links.
33. Add E2E tests, browser evidence, migration/backfill dry-run, privacy/audio-rights/distribution-profile/disclosure/CTA/calibration/post-publish/campaign-governance/brand-policy/human-review/publishable-package/input-change-impact/shot-frame-vision-qa/media-acceptance/product-reference-pack/character-identity-pack/policy-rule-pack/stage-completion-evidence/capability-manifest/creative-brief tests, DLQ/recovery tests, and launch SLO dashboard/alert evidence.

The first shippable vertical slice should be:

```text
Marketplace product
  -> Create Storyboard
  -> marketplaceAutoReviewRun
  -> Agents concept/storyboard/prompt_plan
  -> Product Truth QA
  -> Storyboard Review handoff
```

The second vertical slice should be:

```text
Marketplace product
  -> Auto Create Review Video
  -> marketplaceAutoReviewRun
  -> Agents storyboard and shot payload contracts
  -> credit reservation
  -> provider generation
  -> QA repair
  -> render
  -> Media Library
```

Both slices must use replacement runtime behavior, not shadow execution.
