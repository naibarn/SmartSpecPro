# Implementation Plan: Feature 117 Production Director Agents SDK Auto Storyboard And Video

## 1. Objective

Build a replacement automation runtime for Marketplace Auto Review and Production Director product-review media creation. The runtime must use OpenAI Agents SDK through the Python backend, route all LLM calls through SmartSpecPro's LLM gateway, preserve platform-owned credits, bypass node canvas entirely for this feature, and reliably finish storyboard/video workflows with careful QA and repair.

The first target is Marketplace Capture product detail because Feature 118 already ships a durable stage pipeline there. Media Studio Production automation should reuse the same contracts after the Marketplace vertical slice is stable.

## 2. Current Baseline To Preserve

Preserve these Feature 118 behaviors:

- product-detail entry point in `MarketplaceCaptureProductDetail.tsx`;
- `startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, `cancelAutoReviewRun`;
- durable `marketplace_auto_review_runs` and `marketplace_auto_review_stages`;
- output modes `storyboard_images` and `full_video`;
- frame strategies `auto`, `storyboard_3x3_split`, `video_shot_start_stop`;
- audio strategies `auto`, `native_video_audio`, `separate_tts_voiceover`, `silent`;
- Storyboard Review, Video Editor, render, and Media Library outputs;
- active-run dedupe and background/manual advancement.

Replace these behaviors:

- deterministic `buildAutoReviewPlan`;
- immediate completion of `concept_story` and `prompt_plan`;
- status-only stage completion without required evidence refs;
- string-only product facts lock;
- canvas-shaped provider scheduling through `ProductionSpace`/`flowNodes`;
- QA that exists only as prompt text or metadata;
- undifferentiated failure statuses.

## 3. Architecture

Target flow:

```text
Marketplace Product Detail / Media Studio
-> Node tRPC service
-> Marketplace Auto Review run/stage persistence
-> product evidence and policy preflight
-> Node agent runtime client
-> Python OpenAI Agents SDK adapter
-> SmartSpecPro LLM gateway only
-> structured artifacts returned to Node
-> Node-owned media scheduling, credit ledger, QA persistence, render, library finalize
```

Node owns:

- authentication, authorization, tenant policy;
- run/stage status;
- product evidence loading;
- evidence privacy redaction and instruction firewall decisions;
- credit reservation and deduction orchestration;
- provider/media job creation;
- render/library persistence;
- UI-facing status projection.

Python owns:

- SDK import boundary;
- agent construction;
- handoffs;
- function-tool wrappers;
- guardrails;
- structured output normalization;
- SDK trace normalization.

Python must not persist marketplace automation state directly, must not deduct credits, and must not register tools, handoffs, hosted SDK capabilities, sessions, traces, or output schemas outside the Node-created capability manifest for the stage attempt.

## 4. Runtime Contract Extension

Extend the existing runtime contracts to support `media_production`.

Primary files:

- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_import_boundary.py`
- new/updated Node runtime client under `apps/web/server/services/agentRuntime/` or the existing local convention if one already exists.

Contract changes:

- add runtime surface `media_production`;
- add origin surfaces:
  - `marketplace_capture`
  - `media_studio_production`
  - `storyboard_review`
  - `video_edit`
- add entry points:
  - `create_product_review_concepts`
  - `create_storyboard_plan`
  - `create_media_payload_plan`
  - `review_generated_visuals`
  - `review_generated_video`
  - `review_audio_continuity`
  - `repair_media_plan`

Minimal request shape:

```ts
interface MediaProductionAgentRequest {
  surface: "media_production";
  originSurface: "marketplace_capture" | "media_studio_production" | "storyboard_review" | "video_edit";
  tenantId: string;
  userId: string;
  productionRunId: string;
  marketplaceAutoReviewRunId?: string;
  stageKey: string;
  stepId: string;
  attemptId: string;
  objective: string;
  creativeBriefSnapshot: ProductionCreativeBriefSnapshot;
  evidenceInstructionFirewall: MarketplaceEvidenceInstructionFirewall;
  productEvidenceLock: ProductEvidenceLock;
  policyEnvelope: MediaProductionPolicyEnvelope;
  budgetEnvelope: CreditBudgetEnvelope;
  capabilityManifest: ProductionAgentsSdkCapabilityManifest;
  allowedTools: string[];
  modelConfig: RuntimeModelConfig;
  idempotencyKey: string;
}
```

Capability manifest requirements:

- Node creates `ProductionAgentsSdkCapabilityManifest` for every Agents-backed stage attempt.
- Python validates manifest hash before agent construction.
- Unknown tools, handoffs that widen scope, hosted SDK capabilities, raw session persistence, raw trace export, and Python-owned mutating persistence fail closed before additional spend.
- Tool outputs are treated as untrusted intents/refs until Node verifies them.

Creative brief requirements:

- Node creates `ProductionCreativeBriefSnapshot` before `concept_story`.
- Marketplace one-click runs may use safe defaults, but those defaults must be persisted and visible in sanitized timeline/detail projection.
- User hints are style/intent guidance unless evidence/approval refs allow them as product claims.
- Concept selection, script, metadata, CTA, and repair decisions must cite the brief fields they optimize for.
- Brief changes trigger input-change impact and dependent-ref invalidation.

Evidence instruction firewall requirements:

- Node creates `MarketplaceEvidenceInstructionFirewall` after privacy redaction and before any marketplace DOM/OCR/review/seller text or prior AI output reaches Agents, vision QA, repair prompts, provider prompts, or metadata generation.
- Marketplace content is data only. It cannot alter system/developer instructions, tools, handoffs, model/provider routing, credit policy, approvals, output routing, ad policy, or public copy.
- Python accepts only firewall-approved structured refs or escaped untrusted evidence blocks and rejects raw marketplace instructions.

Minimal response shape:

```ts
interface MediaProductionAgentResponse {
  status: "completed" | "paused" | "failed";
  artifactType:
    | "creative_concept_set"
    | "storyboard_contract"
    | "media_payload_plan"
    | "qa_verdict"
    | "repair_decision";
  finalOutput: unknown;
  qaVerdict?: QAVerdict;
  creditUsageEstimate?: CreditEstimate;
  traceMetadata: Record<string, unknown>;
}
```

Validation rules:

- fail closed if gateway URL/token/model policy/credit preflight metadata is missing;
- reject direct provider base URLs and direct provider API keys for `media_production`;
- reject unknown tools, unknown origin surface, missing tenant/user/run/stage IDs, and missing idempotency key;
- redact signed URLs, tokens, cookies, provider keys, and raw private product data from traces.

## 5. Product Evidence And Policy Preflight

Replace the current string-only `ProductTruth` package with structured evidence.

Primary files:

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- possible new `apps/web/server/services/marketplaceAutoReviewEvidence.ts`
- possible shared TypeScript contracts under `apps/web/shared/marketplaceAutoReview/`

Build:

- `ProductEvidenceLock`
- `ClaimEvidenceMap`
- `VolatileSignalPolicy`
- `ProductVisualIdentityLock`
- `ProductReferenceAssetPack`
- `AdvertisingComplianceProfile`
- `AdvertisingVisualWarningPlan`
- `AdvertisingPolicyRulePack`
- `MarketplaceAutomationAccessSnapshot`
- `ProductEvidenceFreshnessSnapshot`
- `AssetRightsEnvelope`

Evidence source priority:

1. selected Marketplace product fields and product images;
2. user-attached product images;
3. existing Marketplace Capture / Feature 115 handoff insights when already present;
4. user-approved override text;
5. platform category/risk policy.

Volatile signals:

- price,
- discount,
- rating,
- review count,
- sold count,
- commission,
- campaign term,
- stock status.

Default: volatile signals are evidence metadata only and cannot appear in voiceover/captions/visual text unless explicitly approved for the run.

Preflight blocks:

- no usable product image for visual-product output;
- missing product name/category for ad copy;
- regulated category without policy approval;
- no approved/effective advertising policy rule pack for the selected region/platform/category;
- unsupported product claim required by user prompt;
- tenant policy disallows auto-spend;
- product source unavailable or permission mismatch.
- read-only shared product access where tenant policy does not allow private output generation;
- stale product/evidence where requested output needs volatile claims;
- marketplace remote image not platform-hosted/proxy-ready for generation;
- no approved product reference asset pack for product-dependent visual generation, thumbnail generation, or visual repair;
- standalone brand/logo/marketplace badge/review-image use without rights approval.

## 6. Agents And Handoffs

Use a manager-style Production Director agent with bounded specialist handoffs or agents-as-tools. Specialist outputs must be structured and schema-validated.

Agents:

- Production Director: stage coordinator and final decision owner.
- Product Truth Reviewer: evidence/claim/volatile signal gate.
- Creative Concept Director: concept diversity, hook, narrative angle, novelty fingerprint.
- Storyboard Director: shot sequence, story arc, natural Thai script, captions/warnings.
- Cinematographer: shot-level visual language and reference usage.
- Media Payload Director: provider-ready direct shot payloads.
- Product Visual Fidelity Reviewer: product reference preservation.
- Product Reference Asset Reviewer: hero/detail reference selection, crop/mask/fingerprint readiness, variant match, and better-image blocker.
- Character Continuity Reviewer: face/body/outfit identity consistency.
- Audio Continuity Director: voice/duration/gap/naturalness QA.
- Advertising Compliance Reviewer: international and Thai ad rules.
- Repair Director: scoped repair plan.
- Render Preflight Director: final render readiness.

Guardrail rule:

- agent-level guardrails are not enough;
- every mutating or externally expensive tool must also have tool-level guardrails;
- agent output must pass JSON/schema validation before Node persists it as a completed stage.

## 7. Creative Concept And Storyboard Planning

Replace `buildAutoReviewPlan` with gateway-routed Agents calls.

`concept_story` must produce a `CreativeConceptSet`:

- 3 to 5 concepts by default;
- hook type;
- audience;
- core tension;
- product role;
- visual metaphor;
- proof plan;
- novelty fingerprint;
- claim-risk score;
- ad-compliance score;
- creative-quality score;
- selection rationale.

Auto-select only when:

- product-truth risk is acceptable;
- ad compliance passes;
- novelty score is high enough against previous completed concepts for the same product;
- credit estimate fits auto-spend policy;
- no regulated-category blocker exists.

`prompt_plan` must produce:

- storyboard shots;
- shot timing and target duration;
- Thai voiceover lines;
- captions/on-screen text plan;
- visual warning/disclosure plan;
- shot prompts;
- reference image mapping;
- approved product reference asset pack refs;
- approved character identity asset pack refs when people, hands, lip-sync, native-audio character, or recurring voice appear;
- product visual lock per shot;
- character continuity lock per shot;
- audio contract;
- provider candidates and execution payload plan.

Natural speech requirements:

- Thai spoken lines must sound like a real review, not a legal disclaimer script;
- hook must be clear in the first 2 to 4 seconds;
- speech length must fit clip duration;
- no abrupt silence after a short line;
- no unsupported claims;
- no awkward overuse of product name.

## 8. Direct Shot-Payload Media Execution

Remove Feature 117 automation dependency on `ProductionSpace` and `flowNodes`.

Primary change:

- create a direct media execution adapter for Marketplace Auto Review shot payloads;
- preserve existing provider/media generation services underneath;
- do not synthesize compatibility flow nodes.

The adapter should accept:

```ts
interface DirectShotMediaExecutionPlan {
  runId: string;
  productionRunId: string;
  outputMode: "storyboard_images" | "full_video";
  frameStrategy: "auto" | "storyboard_3x3_split" | "video_shot_start_stop";
  audioStrategy: "auto" | "native_video_audio" | "separate_tts_voiceover" | "silent";
  shots: ShotMediaPayloadContract[];
  productReferenceAssetPackId: string;
  characterIdentityAssetPackIds: string[];
  references: ProductReferenceAsset[];
  creditReservationId: string;
  idempotencyKey: string;
}
```

Execution requirements:

- schedule images/videos/audio using existing media routers/services where possible;
- store media task IDs and provider task IDs on stages and metadata;
- reconcile provider status without requiring a canvas version;
- split 3x3 storyboard images as the current implementation does, but from direct task output;
- attach generated frames/clips to the run, Library, Storyboard Review, and Video Editor as today;
- use only approved product reference asset pack refs for product-dependent visual payloads;
- use only approved or approved-limited character identity asset pack refs for recurring person, hand, visible-face, lip-sync, native-audio character, or voice payloads;
- keep provider outputs candidate/QA-pending until generated media acceptance passes;
- complete media stages only after `MarketplaceAutoReviewStageCompletionEvidence` proves required provider, media acceptance, QA, credit, storage, and lineage refs;
- ensure provider retry only resubmits failed/targeted outputs.

## 9. QA And Repair

Add real QA gates before advancing stages:

- Intake QA: product access, image readiness, policy category, evidence completeness.
- Product reference QA: hero/detail reference readiness, variant match, rights, hosting, crop/mask/fingerprint availability, and better-image blockers.
- Character identity QA: consent/rights, allowed face/voice scope, reference quality, conflicting refs, no-face/hands-only policy, lip-sync/native-audio risk, and fallback plan.
- Concept QA: hook quality, novelty, claim safety, ad compliance.
- Storyboard QA: shot continuity, product role, supported claims, warning text plan.
- Media payload QA: provider parameters, references, credit estimate, no text conflicts.
- Generated visual QA: product geometry/material/color/label/part count, reference similarity, no extra product details.
- Generated video QA: product continuity, character face/voice continuity, endpoint continuity, no face identity drift, no voice identity drift, no story jump.
- Audio QA: continuous voice/audio, timing fit, no silent gaps, natural Thai delivery, no unsupported claims.
- Ad compliance QA: Thai and international policy, platform policy, required disclosures/warnings.
- Final QA: render integrity, complete timeline, readable warning text, trace/credit summary.
- Media acceptance QA: only accepted or approved-warning generated refs may route to Storyboard Review, Video Editor, Library, publishable packages, or future references.

Repair rules:

- repair the smallest failed unit: claim, shot, frame, clip, audio segment, caption, warning overlay, or render input;
- do not regenerate passed media unless upstream contracts changed;
- cap retry attempts by failure type;
- after retry exhaustion, set `blocked_needs_user` or `failed_terminal` with actionable reason.

## 10. Credit, Billing, And Idempotency

Credit work must be owned by Node/platform services.

Before any paid step:

- estimate credits;
- check tenant/user budget;
- reserve credits with stable idempotency;
- persist reservation ref;
- pass only the approved budget envelope to Agents/tools;
- dispatch provider/LLM step only after reservation succeeds.

Credit categories:

- `llm_planning`
- `llm_verification`
- `llm_visual_qa`
- `llm_audio_qa`
- `llm_repair`
- `media_image_generation`
- `media_video_generation`
- `media_audio_generation`
- `render`

Idempotency key pattern:

```text
production:{productionRunId}:run:{autoReviewRunId}:stage:{stageKey}:attempt:{attemptNumber}:action:{action}
```

Duplicate retries, duplicate background advancement, and provider callback races must not double-charge or duplicate provider jobs.

Provider event processing must validate a `MarketplaceAutoReviewProviderEventEnvelope` before state changes:

- webhook signatures or provider-specific auth are verified when supported;
- providers without signed callbacks are advanced only from trusted server-side polling;
- tenant, run, stage, media task, provider task, and idempotency key must match;
- duplicate, stale, out-of-order, mismatched, failed-signature, or over-budget events are no-op, blocked, or DLQ/recovery outcomes with audit.

## 11. Persistence And Status Projection

Prefer compatible schema evolution:

- keep existing run/stage tables;
- add metadata schema version;
- add optional status detail fields if practical;
- otherwise store structured detail in `metadataJson` and `outputJson` while preserving old status mapping.

Required persisted artifacts:

- product evidence lock;
- selected variant/SKU snapshot when present;
- selected concept;
- rejected concepts and reasons;
- storyboard contract;
- media payload plan;
- QA verdicts;
- repair decisions;
- credit estimates/reservations/deductions/refunds;
- provider task refs;
- provider event envelopes and DLQ/recovery refs;
- payload budget decisions and redacted large-artifact refs;
- storage quota/transcode plans, cleanup refs, and re-host refs;
- privacy envelopes, evidence instruction firewall refs, and redacted evidence refs;
- audio rights/mix envelopes;
- distribution profile and export variant refs;
- creative feedback memory decisions;
- synthetic disclosure/provenance refs;
- CTA/landing integrity refs;
- QA calibration and spot-check decisions;
- post-publish governance refs;
- render refs;
- final output refs.
- timeline projection inputs: stage order, stage labels, status detail, QA summary, credit summary, blocker, repair summary, output refs, and timestamps.
- API projection inputs: run summary, detail timeline, approval summary, policy snapshot refs, lineage refs, and redaction flags.
- artifact lineage records linking evidence, variant snapshot, shot payloads, provider tasks, QA verdicts, approvals, credit events, render jobs, and final outputs.

Status mapping:

- internal `awaiting_credit_authorization` can map to existing active/waiting status plus detail;
- internal `blocked_needs_user` should surface as a user-action blocker, not generic failure;
- internal `completed_with_warnings` can map to completed plus warning detail.

Timeline projection:

- create `MarketplaceAutoReviewTimelineProjection` from persisted run/stage state;
- include every canonical stage in order for `storyboard_images` or `full_video`;
- expose completed, active, waiting provider, awaiting credit/user action, repairing, blocked, failed, skipped, and remaining states;
- include Thai user-facing labels and short descriptions;
- include optional substeps for Agents, QA, credit, provider, repair, and render;
- include output links when available;
- keep timeline derivation backend-owned so refresh/resume does not drift from durable state.
- derive completed/skipped/blocked states from stage completion evidence, not from status strings alone.

API projection:

- keep existing `startAutoReview`, `getAutoReviewRun`, `listAutoReviewRuns`, `advanceAutoReviewRun`, and `cancelAutoReviewRun` compatible or version them explicitly;
- return full timeline, approval summary, policy refs, lineage refs, and sanitized links from detail reads;
- return lightweight summary/timeline state from list reads;
- redact raw prompts, provider payloads, signed URLs, QA crop URLs, stack traces, and internal policy debug data from UI-facing payloads;
- support Feature 118-era rows by falling back to coarse status without inventing detailed substeps.
- enforce list/detail payload budgets so raw prompts, provider payloads, QA crops, stack traces, and long internal traces stay redacted or internal-only.
- keep privacy/audio-rights/distribution/feedback-memory detail out of list APIs except for sanitized blocker/status summaries.
- keep synthetic disclosure, CTA validation, calibration, and post-publish governance detail out of list APIs except for sanitized blocker/status summaries.

Variant/SKU persistence:

- preserve selected option labels, selected image refs, seller SKU, price snapshot, stock text, captured time, confidence, and selected variant hash when available;
- require variant hash in idempotency/dedupe if parallel variant videos are allowed;
- otherwise block duplicate active variant attempts with clear UI status.

Operational hardening:

- declare retry/DLQ policy by failure class rather than generic stage failure;
- use stage lease/heartbeat or equivalent claim protection for background workers;
- require stage completion evidence for background advancement, manual advancement, operator recovery, and backfill transitions;
- require SDK capability manifest validation for background advancement, resume, retry, cancel, repair, and Python adapter execution;
- require production creative brief snapshot validation before concept generation and changed-brief impact analysis before reuse;
- run migration/backfill in dry-run mode first and produce an affected-row manifest;
- require launch SLO/alert evidence for completion latency, queue wait, stuck run age, DLQ, callback auth failures, storage/transcode failures, provider refusal spikes, and credit mismatches.
- create `MarketplaceEvidencePrivacyEnvelope`, `MarketplaceEvidenceInstructionFirewall`, `AudioRightsAndMixEnvelope`, `MarketplaceAutoReviewDistributionProfile`, and `CreativeFeedbackMemoryPolicy` before broad full-video rollout.
- create `SyntheticMediaDisclosureEnvelope`, `CtaLandingIntegrityEnvelope`, `AutomationQualityCalibrationPolicy`, and `PostPublishGovernanceEnvelope` before assets can be promoted beyond internal review.

## 12. UI/UX Contract

### Target User / JTBD

- Role: affiliate seller, content operator, or media producer.
- Goal: select a product and automatically get a storyboard or finished product-review video.
- Entry point: Marketplace Capture product detail, later Media Studio Production.
- Success outcome: generated Storyboard Review or Library video with clear progress, credit, QA, and blocker state.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Marketplace product detail | `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | Show Agents automation status, QA/blockers, credit authorization, output links. |
| tRPC marketplace router | `apps/web/server/routers/marketplaceCapture.ts` | Version input/output if needed; return status detail. |
| Storyboard Review | existing Storyboard Review route/components | Show QA/evidence/warning trace where already supported or add summary metadata. |
| Video Editor / Library | existing surfaces | Preserve output links and trace metadata. |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Auto Review Action Panel | `MarketplaceCaptureProductDetail.tsx` | mode/strategy selection and start action | product, active run, credit policy |
| Run Progress Timeline | existing/new child component | completed/current/remaining stage timeline, substeps, QA, credit, blockers, outputs | backend timeline projection from `getAutoReviewRun` output |
| Credit Authorization Notice | existing/new child component | budget warnings and approval CTA | credit estimate/status detail |
| Output Links | existing product detail section | Storyboard Review, Video Editor, Library links | run result refs |
| Variant Summary | existing/new child component | selected option/SKU summary or variant-required blocker | `ProductVariantSnapshot` summary |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | stable skeleton/spinner without layout jump | component test/screenshot |
| empty | product has no run; start controls enabled when ready | component test |
| running | timeline shows completed stages, active stage/substep, and remaining stages | mocked run test |
| waiting_provider | timeline marks provider-wait stage and keeps duplicate-start disabled | mocked run test |
| awaiting_credit_authorization | timeline marks credit-wait stage and shows one approval action | mocked run test |
| blocked_needs_user | timeline marks blocked stage, reason, and next action | mocked run test |
| variant_selection_required | product/automation panel asks for variant confirmation before spend | mocked run test |
| failed_terminal | show sanitized error and retry guidance if allowed | mocked run test |
| completed | show output links and summary | mocked run test |
| disabled/focus/hover | controls remain keyboard accessible and visually clear | browser evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | action cards stack; stage timeline scrolls vertically | screenshot |
| tablet 768x1024 | two-column controls allowed, no overlap | screenshot |
| desktop 1440x900 | product info, media panel, and automation panel remain scannable | screenshot |
| small-mobile 360x800 | no clipped buttons or long Thai labels | screenshot if UI touched |
| laptop 1024x768 | dense but readable state summary | screenshot if UI touched |
| wide-desktop 1280x800 | no over-wide lines or hidden actions | screenshot if UI touched |

### Accessibility Acceptance

- Keyboard path: all actions reachable in logical order.
- Focus visibility: native or design-system focus rings visible.
- Labels/semantics: buttons, toggles, and links have clear accessible names.
- Contrast: warning/error/success states pass contrast expectations.
- Reduced motion: progress indicators do not require motion to convey status.

### Copy Contract

- Tone: concise operational Thai; avoid marketing fluff.
- Primary language: Thai UI with English technical IDs hidden or secondary.
- Required labels: stage, QA status, credit estimate, blocker, output.
- Validation/error copy: user-actionable, no raw provider secrets.
- Empty/loading/success copy: short and practical.
- Localization fallback: English stage keys may appear only in developer/debug context.

### Browser Evidence Required

- Follow `skills/orchestra/references/ui-browser-verification.md` when UI is implemented.

## 13. Rollout

Use vertical slices, not shadow execution:

1. Contracts and adapter readiness, no traffic.
2. Storyboard-only Agents planning and QA with no node canvas.
3. Storyboard-only media generation with direct shot payloads.
4. Full-video media execution and audio QA.
5. Render/library finalize with final QA.
6. Media Studio Production reuse.

Rollback:

- feature flag can disable new automation entry points or pause new runs;
- existing manual surfaces remain available;
- do not silently run legacy planner as a hidden fallback during a Feature 117 run.

## 14. Operational Hardening

Add these safeguards before enabling provider-credit-spending automation broadly:

- provider/model decision policy: persist requested provider/model, selected provider/model, fallback reason, entitlement result, and rate-limit/availability blockers;
- no silent downgrade: never degrade video/image generation to text-only planning, or native-audio video to silent video, without an explicit policy/approval state;
- concurrency and backpressure: enforce per-user, per-tenant, and provider-specific active-run caps; queue or block with timeline-visible reasons;
- cancellation: make cancellation idempotent, stop future scheduling, cancel provider/render jobs when supported, record non-cancellable jobs, release/refund unused reservations, and preserve completed outputs according to retention policy;
- asset hygiene: re-host or proxy provider outputs when required, avoid persisting long-lived signed URLs, redact secrets from traces/UI errors, and attach retention metadata to intermediate and final assets;
- access/freshness/rights: persist shared-product access, credit payer, evidence freshness, image readiness, and asset-use rights before spend; re-check them in background jobs;
- privacy: redact or block marketplace/account/order/cart/payment/chat/customer/reviewer/private-seller data before Agents planning and final media;
- evidence instruction firewall: quarantine hidden prompt injection, fake tool/schema fragments, policy-bypass text, provider/credit routing instructions, and output-routing attempts before any LLM/provider prompt consumes marketplace evidence;
- character identity asset pack: approve, limit, or block recurring presenter/hand/voice refs before provider spend; fallback to product-only, hands-only, generic-person, single-shot, or separate-TTS when continuity/consent is unsafe;
- audio rights/mix: prove commercial-use rights, attribution, voice consent, and mix targets for music, SFX, TTS, native, and uploaded audio refs;
- distribution profile: bind shot planning, subtitles, warnings, CTA, audio loudness, render, and export variants to the selected destination profile;
- creative memory: store only tenant-safe redacted concept fingerprints, QA reasons, and approved feedback; never positive-learn from failed or non-compliant outputs;
- synthetic disclosure/provenance: preserve generated-media disclosure decisions, platform flags, and provenance metadata when required;
- CTA/landing integrity: validate source/affiliate/custom URLs, redirect chain, selected variant, offer evidence, and tracking policy before final render;
- calibration: replay fixtures and require spot-checks when model/provider/QA policy drift or low-confidence verdicts appear;
- post-publish governance: carry allowed reuse, expiry, invalidation triggers, and re-check/tombstone behavior on Library outputs;
- campaign/batch governance: enforce active-run caps, daily variant caps, duplicate similarity thresholds, spend caps, rate-limit keys, anomaly blockers, and scoped batch approvals before high-volume generation;
- brand/seller voice policy: use tone/register/CTA/pronunciation guidance only as evidence-bound style input, never as a bypass for product truth, Thai/international ad rules, privacy, rights, or disclosure;
- human review queue: persist reason, approver role, artifact/policy snapshot scope, SLA, timeout action, and rejection/repair outcomes for high-risk or high-volume automation;
- publishable package: generate and validate thumbnail/cover, title/caption/description, hashtags, transcript/subtitles, alt text, metadata manifest, and checksums when required by the distribution profile;
- input change impact: compare previous/current product/evidence/policy/profile/user-edit snapshots, invalidate stale approvals/QA/credit/package refs, and preserve only safe artifacts;
- shot-frame vision QA and targeted repair: inspect each storyboard cell, start frame, stop frame, video keyframe, thumbnail, and final render sample through gateway-routed vision QA; regenerate only failed media units;
- likeness and consent: do not preserve or clone identifiable faces/voices without an approved rights/consent policy; use product-only, hands-only, generic-person, single-shot, or separate-TTS alternatives when consent or continuity is missing;
- media safety refusals: treat provider moderation/content-policy refusals as non-retryable for the same payload and surface sanitized blockers;
- approval ledger: persist scoped, idempotent approval records for credit authorization, claim approval, volatile signal use, warning text, provider/model fallback, likeness consent, completed-with-warnings acceptance, and manual retry;
- immutable snapshots: persist model policy, provider capability, pricing, credit policy, advertising policy, Thailand profile, warning template, consent policy, and retention policy versions for each started attempt;
- operator recovery runbook: support stuck-run resume/fail/cancel, orphan provider task reconciliation, expired provider URL handling, re-host failure, render/library finalize recovery, refund mismatch reconciliation, gateway outage handling, timeline rebuild, and retention cleanup failure without bypassing policy/credit controls;
- replay fixtures: maintain golden fixtures for agent planning, timeline projection, ad compliance, warning overlays, product fidelity QA, and credit/provider races so prompt/runtime changes do not silently weaken behavior.

## 15. Implementation File Map

Likely files to change:

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/marketplaceAutoReviewJob.ts`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle/`
- new shared contracts under `apps/web/shared/marketplaceAutoReview/`
- new direct execution service under `apps/web/server/services/`
- new agent runtime client or extension under `apps/web/server/services/agentRuntime/`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_gateway_model.py`
- new Python media production agent helper modules if needed.

Avoid:

- node canvas UI;
- `ProductionSpace` schema changes for this feature;
- `flowNodes` compatibility generation;
- Node or frontend imports of OpenAI Agents SDK.

## 16. Done Definition

Feature 117 is done when:

- storyboard-only and full-video Marketplace Auto Review complete from product detail using the new runtime;
- current deterministic planning is replaced for eligible runs;
- direct media scheduling bypasses node canvas;
- all LLM calls prove gateway-only;
- credits are reserved/deducted/refunded idempotently;
- QA blocks or repairs product drift, face drift, story drift, audio gaps, unsupported claims, missing warning text, and Thai ad compliance issues;
- selected variant/SKU facts are preserved, blocked, or kept generic before media spend;
- shared product permission and credit payer are explicit and rechecked before background paid work;
- evidence freshness and asset-use rights are enforced before provider spend;
- privacy, audio-rights, distribution-profile, and feedback-memory policies are enforced before planning/finalization as applicable;
- evidence instruction firewall is enforced before planning, QA, repair, provider prompts, metadata generation, resume, or backfill can reuse marketplace evidence;
- character identity asset pack is enforced before recurring presenter/hand/voice planning, provider dispatch, QA, repair, thumbnailing, render, Library finalization, resume, or backfill;
- disclosure, CTA integrity, QA calibration, and post-publish governance policies are enforced before finalization/promotion as applicable;
- campaign/batch governance, brand/seller voice policy, spend anomaly detection, and human review queue rules are enforced before repeated generation, additional spend, finalization, or publication;
- publishable package requirements are enforced before marking final Library output ready for the selected platform;
- input/evidence/policy/profile changes trigger partial invalidation and credit re-estimation before resume, repair, render, or finalization;
- start/stop/storyboard frames and clip keyframes pass vision QA before downstream use, and failed units repair at exact shot/frame/clip scope;
- API projections are backward-compatible, versioned, and redacted for list/detail UI;
- final outputs have canonical lineage back to product evidence, shot payloads, QA, approvals, credits, render, and storage refs;
- provider/model fallback, cancellation, backpressure, signed URL hygiene, retention, and likeness/consent blockers are tested;
- operator recovery covers stuck runs, orphan provider tasks, re-host/render/library failures, refund mismatches, gateway outage, timeline rebuild, and retention cleanup failures;
- provider safety refusals do not cause repeated paid retries;
- approval decision idempotency and policy snapshot replay are tested;
- final outputs carry evidence, QA, and credit summaries;
- tests and browser evidence cover the critical flows.
