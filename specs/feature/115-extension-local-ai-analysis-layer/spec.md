# Feature 115 - Extension Local AI Analysis Layer

Version: 1.0.0
Date: 2026-05-21
Status: Proposed
Document ID: SSP-EXT-PROMPT-API-SPEC
Depends-on:
- Feature 113 Marketplace Capture Extension
- Feature 114 Gemini Omni Suite Media Assets for downstream storytelling handoff consumption
- `apps/extension` MV3 extension package
- `apps/web/shared/marketplaceCapture.ts`
- `/api/marketplace-captures` REST routes
- `marketplaceCapture` tRPC router
- SmartSpecPro server LLM gateway fallback
Audience: Product, Chrome Extension, Web API, LLM, Security, QA, AI Video Studio

---

## 1. Executive Summary

Add an optional local AI analysis layer to the existing SmartSpecPro marketplace capture extension. The extension should continue to capture Shopee and TikTok Shop pages exactly as it does today, then optionally use Chrome Prompt API / Gemini Nano to summarize and structure selected capture data on device before syncing structured insights to SmartSpecPro.

The feature changes the product motion from:

```txt
Capture marketplace data -> upload selected evidence -> server analyze -> web preview
```

to:

```txt
Capture marketplace data
  -> optional local insight
  -> selected structured insight sync
  -> server fallback / preview / AI Video Studio bridge
```

Prompt API is a runtime capability, not a dependency. When `LanguageModel` is unavailable, downloadable, blocked, or fails, all existing capture and server-side analysis flows must continue working.

---

## 2. Codebase Fit

### 2.1 Current Extension Reality

The repository already has a working extension at `apps/extension`:

- `public/manifest.json` uses Manifest V3 and side panel.
- `src/content/index.ts` handles page detection, live snapshots, category scans, product scans, and message rejection for unknown types.
- `src/shared/types.ts` defines `MarketplacePlatform = "shopee" | "tiktok_shop"`.
- `src/panel/App.tsx` owns connection, live detection, local review/edit/select, draft creation, asset upload, and server analysis.
- Existing REST calls use `/api/marketplace-captures/*`.

This spec must not copy the proposed generic `extension/src/...` layout from the source brief as-is. It should evolve the current `apps/extension/src` structure.

### 2.2 Current Backend Reality

The web app already exposes:

- REST mount: `/api/marketplace-captures`
- tRPC router: `marketplaceCapture`
- connect route: `/marketplace-capture/connect`
- preview route: `/marketplace-capture/captures/:captureId/preview`
- product routes: `/marketplace-capture/products/*`
- candidate route: `/marketplace-capture/candidates/:batchId`

Existing shared contracts live in `apps/web/shared/marketplaceCapture.ts`.

### 2.3 Source Brief Adjustments

| Source brief item | Repository-aligned decision |
| --- | --- |
| `platform: "tiktok"` | Use existing `"tiktok_shop"` for current capture contracts. Local insight schema may use display label `tiktok` only in UI copy. |
| `/api/extension/insights` | Prefer extending `/api/marketplace-captures` or adding insight endpoints under that mount. |
| Popup-first UI | Current app is side-panel-first. Add side panel controls; popup is optional future polish. |
| Standalone `captureTypes.ts` | Reuse and extend `apps/extension/src/shared/types.ts` plus `apps/web/shared/marketplaceCapture.ts`. |
| Prompt API hard permission | Runtime-detect `globalThis.LanguageModel`; do not hard-fail if absent. |
| Raw Shopee/TikTok payload schemas | Map from existing `ProductCapturePayload` and candidate contracts; do not fork a second source of truth. |

---

## 3. Goals

1. Detect Chrome Prompt API capability in the extension side panel without breaking unsupported browsers.
2. Let users create local Product Brief, Review Insight, TikTok Shop Trend Brief, Combined Opportunity, and Video Brief records from existing capture payloads.
3. Validate every local AI result before display, storage, or sync.
4. Keep raw DOM, full HTML, reviews, comments, and screenshots local unless the user explicitly uploads selected evidence through the existing flow.
5. Sync structured insights through authenticated SmartSpecPro marketplace capture surfaces.
6. Let AI Video Studio create a draft from a `VideoBrief` without triggering render automatically.
7. Preserve server-side deterministic/LLM fallback behavior for all unsupported local AI states.
8. Produce a marketplace storytelling handoff that Feature 114 Gemini Omni / Storyboard Review can consume without reinterpreting free-form local insight text.

---

## 4. Non-Goals

- Do not replace existing capture, upload, server analyze, preview, or confirm flows.
- Do not require Prompt API for extension operation.
- Do not perform video rendering in the extension.
- Do not add a standalone local worker application.
- Do not send arbitrary full page HTML to Prompt API or SmartSpecPro.
- Do not execute remote prompt strings.
- Do not guarantee Thai output quality from Gemini Nano; Thai is best effort.
- Do not store long-lived tokens in content scripts.
- Do not add broad host permissions.

---

## 5. Target Architecture

```txt
Shopee / TikTok Shop page
  -> existing content capture adapter
  -> existing ProductCapturePayload / CategoryProductCandidate
  -> sanitizer and evidence selector
  -> optional local AI orchestrator
       provider priority:
         1. chrome_prompt_api
         2. server_ai
         3. noop/raw_capture
  -> validated insight record
  -> side panel review
  -> /api/marketplace-captures insight sync
  -> Web preview / Product Library / AI Video Studio draft
```

Local analysis should run from the extension UI context that Chrome supports for Prompt API. The implementation must test `LanguageModel` exposure in:

- side panel
- service worker
- offscreen document, if introduced
- content script

Prefer side panel execution for v1 because user activation and progress UI are already there.

---

## 6. Prompt API Support Matrix

Chrome Prompt API support must be treated as a runtime matrix, not a single browser-version check.

Official Chrome documentation currently states that Prompt API uses `LanguageModel`, is available for Chrome Extensions from Chrome 138 stable, downloads Gemini Nano separately on first use, requires `LanguageModel.availability()` before session creation, and must start model download/session creation from a meaningful user interaction when a model download is required. Extension developers should not add the expired `aiLanguageModelOriginTrial` permission.

### 6.1 Runtime States

| Runtime state | Detection result | User-visible behavior | Analysis provider |
| --- | --- | --- | --- |
| API not exposed | `globalThis.LanguageModel` missing | Show Local AI unavailable; keep capture enabled | `server_ai` or `noop` |
| Unsupported options | `availability() === "unavailable"` | Show unsupported on this Chrome/device/options | `server_ai` or `noop` |
| Model downloadable | `availability() === "downloadable"` | Show download required; enable user-triggered download | `chrome_prompt_api` after successful create, otherwise fallback |
| Model downloading | `availability() === "downloading"` | Show download progress and cancel action | wait/cancel/fallback |
| Model available | `availability() === "available"` | Enable local analysis | `chrome_prompt_api` |
| Detection error | thrown error | Show recoverable local AI error | `server_ai` or `noop` |

### 6.2 Supported Device Path

For machines where Prompt API is exposed and the requested options are available:

1. Side panel detects capability after load.
2. User clicks a Local AI action.
3. Extension re-checks `availability()` with the same options it will use for `create()` and `prompt()`.
4. If `available`, create a session and run local structured generation.
5. If `downloadable`, show explicit model download copy, then call `LanguageModel.create()` only from the user action and report `downloadprogress`.
6. Validate output.
7. Show the structured brief locally.
8. Sync structured insight only after user confirmation.

### 6.3 Unsupported Device Path

For machines where Prompt API is not exposed, unavailable, blocked by option mismatch, blocked by policy, unsupported by OS/profile, or fails at runtime:

1. Extension still loads and detects page normally.
2. Existing Detect, Scan, Scan & Review, Upload selected, and server Analyze continue unchanged.
3. Local AI section shows the exact fallback reason.
4. If `serverAiFallbackEnabled` is true, offer SmartSpecPro AI analysis through the existing server flow.
5. If server fallback is disabled or auth is missing, keep raw capture/manual upload available and mark local insight as unavailable.
6. No model download prompt appears.
7. No local insight sync is attempted unless a valid structured insight exists.

### 6.4 Language And Modality Constraints

The v1 local provider is text-first. The detector and session options must request the same modalities and languages. Because current Prompt API language support may not include Thai as a guaranteed output language, Thai output must remain best effort:

- request concise Thai only when the source appears Thai
- validate JSON structure, confidence, evidence IDs, and bounded lengths
- offer server AI review/improve when Thai quality is insufficient
- never mark Thai local output as a hard requirement for capture success

Image and audio inputs are out of scope for v1 even if a Chrome profile exposes multimodal Prompt API capabilities.

### 6.5 Session Lifecycle And Cancellation

Implementation must:

- use `AbortController` for local analysis cancellation
- stop prompting when the user closes the panel, switches page, or cancels download/analysis
- destroy or discard sessions after each bounded analysis task unless profiling proves reuse is safe
- avoid hidden background model downloads
- keep prompt options, `availability()` options, and `create()` options consistent

---

## 7. Feature Flags And Defaults

Add extension-local and server-visible flags:

```ts
export interface ExtensionLocalAIFlags {
  promptApiEnabled: boolean;
  promptApiDefaultOn: boolean;
  serverAiFallbackEnabled: boolean;
  localInsightSyncEnabled: boolean;
  aiVideoStudioBridgeEnabled: boolean;
  saveDebugRawAiOutput: boolean;
}

export const defaultExtensionLocalAIFlags: ExtensionLocalAIFlags = {
  promptApiEnabled: true,
  promptApiDefaultOn: false,
  serverAiFallbackEnabled: true,
  localInsightSyncEnabled: true,
  aiVideoStudioBridgeEnabled: true,
  saveDebugRawAiOutput: false,
};
```

User defaults:

```ts
export const extensionLocalAIDefaults = {
  preferLocalAI: true,
  sendStructuredInsightsOnly: true,
  includeRawCaptureOnInsightSync: false,
  includeReviewsOnInsightSync: false,
  maxReviewsForLocalAI: 30,
  maxTikTokCommentsForLocalAI: 30,
  defaultVideoBriefDurationSec: 30,
  defaultAspectRatio: "9:16",
};
```

---

## 8. Data Contracts

### 8.1 Platform And Source

Use existing platform values:

```ts
export type MarketplacePlatform = "shopee" | "tiktok_shop";

export type LocalInsightType =
  | "product_brief"
  | "review_insight"
  | "tiktok_shop_trend"
  | "combined_opportunity"
  | "video_brief"
  | "marketplace_storytelling_handoff";
```

### 8.2 Evidence Item

Evidence IDs must be derived from sanitized fields, selected assets, or generated local evidence references. They must not require full DOM retention.

```ts
export interface LocalInsightEvidenceItem {
  id: string;
  type:
    | "title"
    | "description"
    | "price"
    | "rating"
    | "review"
    | "comment"
    | "hashtag"
    | "caption"
    | "metric"
    | "image_alt"
    | "seller_info"
    | "asset";
  text: string;
  sourceField?: string;
  sourceAssetId?: string;
  confidence?: number;
}
```

### 8.3 Sanitized Local Input

```ts
export interface SanitizedLocalAIInput {
  captureId?: string;
  platform: MarketplacePlatform;
  sourceUrl: string;
  pageTitle?: string;
  product?: {
    productName?: string | null;
    priceCurrentText?: string | null;
    priceOriginalText?: string | null;
    discountText?: string | null;
    ratingScoreText?: string | null;
    reviewCountText?: string | null;
    soldCountText?: string | null;
    shopName?: string | null;
    categoryText?: string | null;
    sellerLocationText?: string | null;
    descriptionText?: string | null;
    variantsText?: string | null;
    imageCount?: number;
  };
  tiktokShop?: {
    title?: string | null;
    priceText?: string | null;
    soldCountText?: string | null;
    ratingText?: string | null;
    badges?: string[];
  };
  evidence: LocalInsightEvidenceItem[];
  languagePreference: "auto" | "th" | "en" | "mixed";
}
```

### 8.4 Product Brief

```ts
export interface ProductBrief {
  schemaVersion: "1.0";
  source: {
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    url: string;
  };
  productName: string;
  category?: string;
  shortSummary: string;
  keySellingPoints: string[];
  targetAudiences: string[];
  buyerPainPoints: string[];
  buyerObjections: string[];
  trustSignals: string[];
  contentAngles: string[];
  suggestedHooks: string[];
  suggestedCTAs: string[];
  confidence: number;
  evidenceIds: string[];
}
```

### 8.5 Review Insight

```ts
export interface ReviewInsight {
  schemaVersion: "1.0";
  source: {
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    url: string;
  };
  positiveThemes: string[];
  negativeThemes: string[];
  repeatedPhrases: string[];
  commonBuyerQuestions: string[];
  objectionsToAddress: string[];
  recommendedFAQ: Array<{
    question: string;
    answerDraft: string;
  }>;
  contentRecommendations: string[];
  confidence: number;
  evidenceIds: string[];
}
```

### 8.6 TikTok Shop Trend Brief

```ts
export interface TikTokShopTrendBrief {
  schemaVersion: "1.0";
  source: {
    platform: "tiktok_shop";
    captureId?: string;
    url: string;
  };
  contentType:
    | "product_review"
    | "demo"
    | "before_after"
    | "storytelling"
    | "trend"
    | "educational"
    | "unknown";
  hookPattern: string;
  structure: string[];
  hashtags: string[];
  audience: string[];
  engagementDrivers: string[];
  replicableIdeas: string[];
  risks: string[];
  confidence: number;
  evidenceIds: string[];
}
```

### 8.7 Video Brief

```ts
export interface VideoBrief {
  schemaVersion: "1.0";
  sourceCaptureIds: string[];
  targetFormat: "tiktok_short" | "reels_short" | "shopee_video" | "generic_social";
  durationSec: 15 | 30 | 45 | 60;
  aspectRatio: "9:16" | "1:1" | "16:9";
  language: "th" | "en" | "mixed";
  title: string;
  hook: string;
  scenes: VideoBriefScene[];
  captions: string[];
  cta: string;
  assetsNeeded: string[];
  hyperframesHint?: {
    visualStyle: string;
    transitionStyle: string;
    textOverlayStyle: string;
    pacing: "slow" | "medium" | "fast";
  };
  confidence: number;
}

export interface VideoBriefScene {
  order: number;
  startSec: number;
  endSec: number;
  customerJourneyStage?: CustomerJourneyStage;
  sceneGoal: string;
  visualSuggestion: string;
  onScreenText: string;
  voiceover?: string;
  assetRole?: "product_image" | "demo_video" | "screenshot" | "ugc_clip" | "text_only";
}
```

### 8.8 Customer Journey And Storytelling Handoff

Feature 115 must create a handoff that Feature 114 can use directly for Marketplace Product Storytelling, Gemini Omni Director, Product Truth QA, and Storyboard Review.

```ts
export type CustomerJourneyStage =
  | "awareness"
  | "problem_recognition"
  | "consideration"
  | "proof_review_demo"
  | "objection_handling"
  | "trust_building"
  | "conversion_cta"
  | "retention_brand_recall";

export type ProductStoryFormat =
  | "product_review"
  | "sales_demo"
  | "brand_awareness_story"
  | "before_after_or_use_case"
  | "customer_journey_video"
  | "tiktok_shop_trend_short"
  | "shopee_product_support_video"
  | "ugc_style_review_script"
  | "cinematic_brand_product_story";

export interface EvidenceBackedClaim {
  id: string;
  claimText: string;
  claimType:
    | "selling_point"
    | "pain_point"
    | "review_theme"
    | "objection"
    | "trust_signal"
    | "cta"
    | "caption"
    | "on_screen_text";
  evidenceIds: string[];
  approvedByUser: boolean;
  risk:
    | "supported"
    | "needs_user_confirmation"
    | "unsupported"
    | "image_mismatch"
    | "policy_sensitive";
}

export interface StorytellingSceneIntent {
  order: number;
  customerJourneyStage: CustomerJourneyStage;
  sceneGoal: string;
  productTruthFocus: string[];
  evidenceBackedClaimIds: string[];
  suggestedVisual: string;
  suggestedVoiceover?: string;
  suggestedOnScreenText?: string;
  selectedImageEvidenceIds: string[];
  qaHints: string[];
}

export interface MarketplaceStorytellingHandoff {
  schemaVersion: "1.0";
  source: {
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    marketplaceProductId?: string;
    url: string;
  };
  readiness:
    | "ready_for_storytelling"
    | "ready_with_warnings"
    | "needs_user_review"
    | "insufficient_evidence";
  confidence: number;
  storyFormat: ProductStoryFormat;
  targetBuyer: string;
  buyerHesitation: string[];
  narrativeArc: {
    hook: string;
    promise: string;
    proof: string;
    objectionTurn: string;
    cta: string;
  };
  customerJourney: CustomerJourneyStage[];
  scenes: StorytellingSceneIntent[];
  evidenceBackedClaims: EvidenceBackedClaim[];
  selectedProductImages: Array<{
    evidenceId: string;
    imageUrl?: string;
    assetId?: string;
    role: "hero" | "detail" | "use_case" | "review" | "comparison" | "background";
    fidelityRisk: "low" | "medium" | "high" | "unknown";
  }>;
  insightRefs: {
    productBriefId?: string;
    reviewInsightId?: string;
    tiktokShopTrendBriefId?: string;
    videoBriefId?: string;
  };
  productTruthWarnings: string[];
  unsupportedClaims: string[];
  allowedNextActions: Array<
    | "send_to_gemini_omni_storytelling"
    | "send_to_storyboard_review"
    | "ask_user_to_confirm_claims"
    | "select_more_product_images"
    | "run_server_ai_review"
    | "capture_more_evidence"
  >;
}
```

Storytelling handoff rules:

- Every claim used in a scene, caption, voiceover, CTA, or on-screen text must point to evidence IDs or explicit user approval.
- Unsupported before/after, certification, discount, medical, warranty, rating, sold-count, or review claims must be blocked or marked `needs_user_review`.
- Product image mismatch must lower readiness and block direct Gemini Omni submission until the user resolves it.
- Missing Feature 115 insights must not block basic product video creation if a confirmed product record and selected product images exist.
- Advanced storytelling formats should require either synced insights or explicit user confirmation.

### 8.9 Combined Opportunity

```ts
export interface CombinedOpportunityBrief {
  schemaVersion: "1.0";
  shopeeCaptureId?: string;
  tiktokShopCaptureId?: string;
  opportunitySummary: string;
  productTrendFitScore: number;
  recommendedContentFormat: string;
  suggestedPositioning: string;
  risks: string[];
  nextActions: Array<
    | "create_video_brief"
    | "send_to_ai_video_studio"
    | "save_to_product_library"
    | "create_ad_copy"
  >;
}
```

---

## 9. Prompt API Provider Contract

### 9.1 Capability Type

```ts
export type PromptAPIAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available"
  | "unknown";

export interface LocalAICapability {
  provider: "chrome_prompt_api";
  apiExposed: boolean;
  available: boolean;
  availability: PromptAPIAvailability;
  supportsText: boolean;
  supportsImageInput?: boolean;
  supportsAudioInput?: boolean;
  supportedLanguages?: string[];
  reason?: string;
}
```

### 9.2 Detection Requirements

Implementation must:

- detect `globalThis.LanguageModel` at runtime
- treat any thrown capability check as recoverable
- call `availability()` with the same expected input/output options used for session creation and prompting
- expose `downloadable` and `downloading` states to UI
- never block existing capture if the API is absent
- run model creation only from a user-triggered action when Chrome requires user activation for download
- avoid expired origin-trial permissions such as `aiLanguageModelOriginTrial`

Recommended detector:

```ts
export async function detectChromePromptAPI(): Promise<LocalAICapability> {
  const LanguageModel = (globalThis as any).LanguageModel;

  if (!LanguageModel) {
    return {
      provider: "chrome_prompt_api",
      apiExposed: false,
      available: false,
      availability: "unavailable",
      supportsText: false,
      reason: "LanguageModel API is not exposed in this Chrome runtime.",
    };
  }

  try {
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });

    return {
      provider: "chrome_prompt_api",
      apiExposed: true,
      available: availability === "available",
      availability,
      supportsText: availability !== "unavailable",
      supportedLanguages: ["en"],
      reason: availability === "available" ? undefined : `Prompt API status is ${availability}.`,
    };
  } catch (error) {
    return {
      provider: "chrome_prompt_api",
      apiExposed: true,
      available: false,
      availability: "unknown",
      supportsText: false,
      reason: error instanceof Error ? error.message : "Unknown Prompt API detection error.",
    };
  }
}
```

### 9.3 Provider Decision Function

```ts
export interface LocalAIProviderDecision {
  selectedProvider: "chrome_prompt_api" | "server_ai" | "noop";
  reason:
    | "prompt_api_available"
    | "prompt_api_downloadable"
    | "prompt_api_downloading"
    | "prompt_api_not_exposed"
    | "prompt_api_unavailable"
    | "prompt_api_error"
    | "server_fallback_enabled"
    | "server_fallback_disabled"
    | "auth_required";
  canAnalyzeNow: boolean;
  requiresUserAction: boolean;
  fallbackAvailable: boolean;
}
```

Rules:

- `available` selects `chrome_prompt_api`.
- `downloadable` may select `chrome_prompt_api` only after the user clicks a download/analyze action.
- `downloading` keeps the user in progress UI and may offer cancel/fallback.
- `unavailable`, `unknown`, missing API, or thrown errors select `server_ai` when enabled and authenticated.
- If server fallback is unavailable, select `noop` and preserve capture-only behavior.

### 9.4 Provider Interface

```ts
export interface LocalAIProvider {
  id: "chrome_prompt_api" | "server_ai" | "noop";
  detect(): Promise<LocalAICapability>;
  generateStructured<T>(input: StructuredGenerationInput<T>): Promise<StructuredGenerationResult<T>>;
}

export interface StructuredGenerationInput<T> {
  task: LocalInsightType;
  prompt: string;
  schema: object;
  sourcePayload: SanitizedLocalAIInput | unknown;
  timeoutMs?: number;
  languagePreference?: "auto" | "th" | "en" | "mixed";
}

export interface StructuredGenerationResult<T> {
  ok: boolean;
  provider: "chrome_prompt_api" | "server_ai" | "noop";
  data?: T;
  rawText?: string;
  error?: {
    code: ExtensionAIErrorCode;
    message: string;
    recoverable: boolean;
  };
}
```

---

## 10. Prompt Rules

All prompts must be local templates checked into the extension source. Remote config may toggle features or model policy, but must not provide full prompt strings.

Every prompt must include:

- task name
- target schema
- required output language
- sanitized capture evidence
- instruction to use only supplied data
- instruction not to invent claims
- instruction to include evidence IDs
- instruction to return JSON only

Thai language handling is best effort:

- If source text is Thai, request concise Thai output.
- Validate structure and evidence references, not linguistic perfection.
- Offer server AI review/improve when local output is poor and fallback is enabled.

---

## 11. Output Validation

Use Zod for extension TypeScript ergonomics unless implementation proves bundle size or runtime constraints require `valibot`.

Validation must enforce:

- valid JSON object
- exact top-level schema
- required fields present
- unknown top-level fields stripped or rejected consistently
- `confidence` between 0 and 1
- bounded string lengths
- bounded arrays
- `evidenceIds` exist in sanitized input when evidence is available
- scene times are ordered and within `durationSec`
- storytelling handoff scenes cover a complete customer journey without duplicate or contradictory scene roles
- every `EvidenceBackedClaim` used by scenes, captions, voiceover, CTA, or on-screen text has evidence or explicit user approval
- `readiness` blocks direct storytelling when unsupported claims, high product-image fidelity risk, or insufficient evidence exists

Failure behavior:

1. If JSON parse fails, attempt one local repair only if Prompt API is available and user-triggered context remains active.
2. If repair fails, fall back to server AI if enabled.
3. If fallback is disabled or fails, show "Analysis failed, capture still saved."
4. Store `rawText` only when `saveDebugRawAiOutput` is enabled.

---

## 12. Extension UI

Add a Local AI section to the existing side panel, not a new primary app shell.

Recommended side panel controls:

```txt
Local AI
  Status: Available / Download Required / Downloading / Unavailable / Fallback Active
  Provider: Gemini Nano in Chrome / SmartSpecPro AI / Raw Capture
  Reason: <short capability or fallback reason>
  [Analyze with Local AI]
  [Use SmartSpecPro AI]
  [Create Product Brief]
  [Create Review Insight]
  [Create TikTok Shop Trend Brief]
  [Create Video Brief]
  [Cancel Analysis]
  [Send Structured Insight]
  [Send to AI Video Studio]
  [Send to Gemini Omni Storytelling]
  [Open Storyboard Review]

Privacy
  [x] Prefer local AI when available
  [x] Send structured insights only
  [ ] Include raw captured text when syncing
  [ ] Include reviews/comments when syncing
  [ ] Save debug AI outputs
```

Do not remove current actions such as Detect, Scan visible products, Scroll & scan, Scan & Review, Upload selected, or Analyze capture.

### 12.1 User-Facing State Model

The side panel and downstream web preview must expose a consistent state model:

| State | Meaning | Primary user action |
| --- | --- | --- |
| `capture_ready` | Page is supported and capture can run | Capture / Scan & Review |
| `local_ai_ready` | Prompt API can analyze locally | Create brief |
| `fallback_ready` | Local AI unavailable, server AI can analyze | Use SmartSpecPro AI |
| `raw_capture_only` | No local/server AI path available | Upload selected / save draft |
| `insight_ready` | Valid structured insight exists | Review / sync |
| `storytelling_ready` | Handoff passes readiness gates | Send to Gemini Omni Storytelling |
| `needs_claim_review` | Claims/images/journey need user action | Review claims / select more evidence |
| `storyboard_review_ready` | Storyboard metadata can be opened | Open Storyboard Review |

Each state must include a short reason and safe next action. Unsupported Prompt API states must not look like errors in the core capture flow.

---

## 13. Sync Contract

Prefer extending the existing REST namespace:

```http
POST /api/marketplace-captures/insights
Authorization: Bearer <extension_token>
Content-Type: application/json
```

Request:

```ts
export interface MarketplaceCaptureInsightSyncRequest {
  extensionVersion: string;
  idempotencyKey: string;
  schemaVersion: "1.0";
  insightCreatedAt: string;
  payloadHash: string;
  source: {
    platform: "shopee" | "tiktok_shop";
    url: string;
    capturedAt: string;
    captureId?: string;
    marketplaceProductId?: string;
  };
  insightType: LocalInsightType;
  provider: "chrome_prompt_api" | "server_ai" | "manual";
  parentInsightIds?: string[];
  payload:
    | ProductBrief
    | ReviewInsight
    | TikTokShopTrendBrief
    | VideoBrief
    | CombinedOpportunityBrief
    | MarketplaceStorytellingHandoff;
  rawCaptureIncluded: boolean;
  rawCapture?: unknown;
}
```

Response:

```ts
export interface MarketplaceCaptureInsightSyncResponse {
  ok: boolean;
  insightId?: string;
  captureId?: string;
  projectId?: string;
  openUrl?: string;
  error?: {
    code: string;
    message: string;
  };
}
```

The backend may store insights in a new table or attach them to `marketplace_capture_sessions` as versioned JSON if migration scope is intentionally deferred. The implementation plan must make that storage decision explicit.

### 13.1 Insight Lifecycle And Retrieval

Feature 114 and SmartSpecPro preview surfaces need a typed, queryable insight lifecycle. Do not leave synced local insights as opaque blobs that only the extension understands.

```ts
export type MarketplaceInsightStatus =
  | "local_created"
  | "validated"
  | "synced"
  | "linked_to_capture"
  | "linked_to_product"
  | "ready_for_storytelling"
  | "needs_user_review"
  | "imported_to_storytelling"
  | "archived"
  | "failed";

export interface MarketplaceInsightRecord {
  id: string;
  insightType: LocalInsightType;
  schemaVersion: "1.0";
  status: MarketplaceInsightStatus;
  provider: "chrome_prompt_api" | "server_ai" | "manual";
  source: {
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    marketplaceProductId?: string;
    url: string;
  };
  payloadHash: string;
  parentInsightIds: string[];
  resultSummary: string;
  storytellingReadiness?: MarketplaceStorytellingHandoff["readiness"];
  createdAt: string;
  syncedAt?: string;
  importedAt?: string;
}
```

Recommended read endpoints:

```http
GET /api/marketplace-captures/captures/:captureId/insights
GET /api/marketplace-captures/products/:productId/insights
GET /api/marketplace-captures/insights/:insightId
```

The tRPC `marketplaceCapture` router may expose equivalent queries for web UI. Feature 114 must be able to fetch a `MarketplaceStorytellingHandoff` by capture ID, product ID, or insight ID with user/tenant isolation.

### 13.2 Claim Review And Approval

Storytelling handoff must support user resolution before Gemini Omni generation.

```ts
export interface MarketplaceClaimResolution {
  claimId: string;
  decision: "approve" | "edit" | "remove" | "request_more_evidence";
  editedClaimText?: string;
  userNote?: string;
  decidedAt: string;
}
```

Rules:

- User approval can unlock `needs_user_confirmation` claims, but cannot override hard policy blocks.
- Edited claims must keep provenance and become new claim versions.
- Removing a claim must remove or revise all scenes that reference it.
- Requesting more evidence must route the user back to capture/review/select-image flow.
- Claim resolutions must be audited without storing raw page text or prompt content.

---

## 14. AI Video Studio Bridge

When a valid `VideoBrief` exists, offer:

```txt
[Send to AI Video Studio]
[Send to Gemini Omni Storytelling]
[Open Storyboard Review]
```

Import contract:

```ts
export interface AIVideoStudioImportPayload {
  source: "chrome_extension";
  importedAt: string;
  videoBrief: VideoBrief;
  storytellingHandoff?: MarketplaceStorytellingHandoff;
  relatedInsights?: {
    productBrief?: ProductBrief;
    reviewInsight?: ReviewInsight;
    trendBrief?: TikTokShopTrendBrief;
  };
}
```

Rules:

- Import creates a draft project only.
- It must not trigger immediate render.
- User must attach/confirm assets before HyperFrames render.
- Marketplace product images already exposed to Media Studio should be reused where possible instead of duplicating assets.
- Gemini Omni Storytelling may accept the handoff only when `readiness` is `ready_for_storytelling` or when an authorized user accepts `ready_with_warnings`.
- `needs_user_review` and `insufficient_evidence` must open a review/claim-resolution surface instead of provider generation.

---

## 15. Customer Journey For Storytelling

Feature 115 must cover the complete user journey from marketplace page capture to Feature 114 storytelling readiness.

### 15.1 Journey A - Local AI Supported

1. User opens a Shopee or TikTok Shop page.
2. Extension live-detects platform/page and current product/candidate context.
3. User captures or reviews product data locally.
4. Local AI capability is `available` or becomes available after user-triggered download.
5. User creates ProductBrief, ReviewInsight/TikTokShopTrendBrief, and VideoBrief.
6. Extension generates a `MarketplaceStorytellingHandoff` with customer journey stages and evidence-backed claims.
7. User reviews Product Truth warnings, selected images, unsupported claims, and journey stage mapping.
8. User sends structured insight and storytelling handoff to SmartSpecPro.
9. Media Studio / Gemini Omni opens Marketplace Product Storytelling workspace with:
   - product card summary
   - selected marketplace images
   - ProductBrief / ReviewInsight / TikTokShopTrendBrief / VideoBrief badges
   - evidence-backed claim list
   - customer journey stage per scene/clip
   - product-image fidelity status
   - platform-specific CTA readiness
10. Feature 114 Product Truth QA and Customer Journey Reviewer run before credit reservation/provider submission.

### 15.2 Journey B - Prompt API Unsupported, Server Fallback Enabled

1. User captures product data with the existing extension flow.
2. Local AI section shows unavailable/fallback reason.
3. User chooses SmartSpecPro AI or existing server Analyze.
4. Server AI produces or improves structured insights.
5. SmartSpecPro creates the same `MarketplaceStorytellingHandoff` contract server-side.
6. User reviews and confirms warnings before opening Gemini Omni Storytelling.
7. Storytelling workspace receives the same journey/claim/evidence contract as the local path.

### 15.3 Journey C - Prompt API Unsupported, Fallback Disabled

1. User captures product data and selected images.
2. No local/server insight generation is available.
3. Extension can still sync raw capture draft and selected evidence through the existing flow.
4. Media Studio may create a basic product video from confirmed product fields and selected images.
5. Advanced storytelling modes show reduced confidence and require user confirmation or additional evidence before generation.

### 15.4 Storytelling Readiness Gates

Direct handoff to Feature 114 is allowed only when:

- at least one confirmed product identity exists
- at least one selected product image or approved visual asset exists
- every planned scene has a customer journey stage
- every product claim maps to evidence or explicit user approval
- unsupported claims are empty or accepted as warnings where policy allows
- product image fidelity risk is not high for the chosen hero image
- CTA matches platform and product evidence

Otherwise, the next action must be review, claim confirmation, image selection, server AI review, or additional capture.

### 15.5 End-To-End Customer Journey Checklist

The complete journey is considered ready only when a non-technical user can complete this path without developer/debug knowledge:

1. Open supported marketplace page.
2. Detect product context.
3. Review captured product fields and selected images.
4. Understand local AI availability or fallback reason.
5. Generate or request structured insight.
6. Inspect key claims, hooks, objections, and journey stages.
7. Resolve unsupported claims or image mismatch warnings.
8. Sync insight/handoff.
9. Open Media Studio / Gemini Omni Marketplace Product Storytelling.
10. See product evidence, journey stages, and readiness before credits are reserved.
11. Open Storyboard Review with product evidence and scene/clip journey mapping.
12. Return to extension/web preview if more capture evidence is required.

---

## 16. Privacy And Security

### 16.1 Data Minimization

Before local AI or sync, remove:

- cookies
- tokens
- hidden inputs
- full DOM HTML
- payment data
- cart, order, account, chat, and message data
- email/phone unless a future explicit contact-extraction feature exists

### 16.2 Prompt Safety

Allowed:

```ts
buildProductBriefPrompt(sanitizedInput)
```

Not allowed:

```ts
prompt = remoteConfig.promptString
```

### 16.3 Message Validation

Extend current message handling with typed, validated messages:

```ts
export type ExtensionLocalAIMessage =
  | { type: "DETECT_LOCAL_AI_CAPABILITY" }
  | { type: "ANALYZE_LOCAL_CAPTURE"; analysisType: LocalInsightType; captureId?: string }
  | { type: "SAVE_LOCAL_INSIGHT"; recordId: string }
  | { type: "SYNC_LOCAL_INSIGHT"; recordId: string }
  | { type: "SEND_VIDEO_BRIEF_TO_STUDIO"; recordId: string }
  | { type: "SEND_STORYTELLING_HANDOFF"; recordId: string };
```

Unknown messages must continue to be rejected.

### 16.4 Storage

Use `chrome.storage.local` for small local records only:

```ts
export interface LocalAnalysisRecord {
  id: string;
  captureId?: string;
  platform: "shopee" | "tiktok_shop";
  createdAt: string;
  analysisType: LocalInsightType;
  provider: "chrome_prompt_api" | "server_ai";
  resultSummary: string;
  result: unknown;
  rawTextStored: boolean;
}
```

Do not store page HTML, screenshots, bearer tokens, or raw prompt text in local analysis records.

---

## 17. Performance

Prompt input limits:

- product title: 300 chars
- description: 4,000 chars
- reviews: 30 reviews
- review text: 500 chars each
- TikTok Shop comments: 30 comments if comments are later captured
- comment text: 300 chars each
- evidence items: 80
- target prompt payload: under 25,000 chars

Timeouts:

- local analysis: 30 seconds
- model download: no fixed timeout, but show progress and cancel affordance

Cache key:

```txt
platform + url + normalizedPayloadHash + analysisType + schemaVersion
```

If unchanged, show cached result and a "Re-analyze" action.

---

## 18. Telemetry

Capture minimal event metadata only:

```ts
export interface ExtensionLocalAITelemetryEvent {
  event:
    | "prompt_api_detected"
    | "prompt_api_unavailable"
    | "local_ai_analysis_started"
    | "local_ai_analysis_completed"
    | "local_ai_analysis_failed"
    | "local_insight_synced"
    | "storytelling_handoff_created"
    | "storytelling_handoff_blocked"
    | "video_brief_sent_to_ai_video_studio";
  timestamp: string;
  extensionVersion: string;
  platform?: "shopee" | "tiktok_shop";
  analysisType?: LocalInsightType;
  provider?: "chrome_prompt_api" | "server_ai";
  durationMs?: number;
  errorCode?: ExtensionAIErrorCode;
}
```

Do not include page text, product names, reviews, comments, prompts, model output, or raw capture in telemetry.

---

## 19. Error Codes

```ts
export type ExtensionAIErrorCode =
  | "PROMPT_API_NOT_EXPOSED"
  | "PROMPT_API_UNAVAILABLE"
  | "PROMPT_API_DOWNLOAD_REQUIRED"
  | "PROMPT_API_DOWNLOAD_FAILED"
  | "PROMPT_API_TIMEOUT"
  | "PROMPT_API_ERROR"
  | "CAPTURE_FAILED"
  | "UNSUPPORTED_PAGE"
  | "SCHEMA_VALIDATION_FAILED"
  | "STORYTELLING_HANDOFF_INCOMPLETE"
  | "UNSUPPORTED_PRODUCT_CLAIM"
  | "PRODUCT_IMAGE_MISMATCH"
  | "CUSTOMER_JOURNEY_MISMATCH"
  | "SYNC_FAILED"
  | "AUTH_REQUIRED";
```

User-facing copy:

- `PROMPT_API_NOT_EXPOSED`: Local AI is not available in this Chrome environment. You can still capture and send data to SmartSpecPro.
- `PROMPT_API_DOWNLOAD_REQUIRED`: Chrome needs to download the local AI model before analysis can run.
- `SCHEMA_VALIDATION_FAILED`: Local AI returned an invalid result. The captured data is still saved.
- `STORYTELLING_HANDOFF_INCOMPLETE`: This product needs more evidence or user review before storytelling.
- `UNSUPPORTED_PRODUCT_CLAIM`: A story claim is not supported by captured evidence.
- `PRODUCT_IMAGE_MISMATCH`: A selected image may not match the captured product.
- `SYNC_FAILED`: Could not send this insight to SmartSpecPro. Please try again.

---

## 20. Testing Requirements

Unit tests:

- capability detector handles missing `LanguageModel`
- capability detector handles `available`, `downloadable`, `downloading`, `unavailable`
- capability detector passes identical expected input/output options to `availability()` and session creation
- provider decision selects `chrome_prompt_api`, `server_ai`, or `noop` correctly for every runtime state
- model download is never triggered by passive panel load
- cancellation aborts active local analysis
- sanitizer excludes full HTML and hidden/private fields
- prompt builders include task, schema, evidence, language, JSON-only instruction
- validators accept valid ProductBrief, ReviewInsight, TikTokShopTrendBrief, VideoBrief
- validators reject invalid confidence, unknown evidence IDs, and malformed scenes
- validators reject storytelling handoff claims without evidence or user approval
- validators reject direct Gemini Omni handoff when readiness is `needs_user_review` or `insufficient_evidence`
- customer journey stage mapping covers every storytelling scene
- provider selection falls back from Prompt API to server AI/noop

Extension integration tests:

- existing Shopee capture works with Prompt API disabled
- existing TikTok Shop capture works with Prompt API disabled
- Shopee product capture -> ProductBrief local analysis
- capture -> server analyze still works after local analysis module loads
- unsupported Prompt API -> SmartSpecPro AI fallback path
- unsupported Prompt API + fallback disabled -> raw capture only
- downloadable model -> user-triggered create/download only
- downloading model -> progress state and cancel action
- invalid local AI output does not block upload selected
- synced local insight appears in SmartSpecPro preview/product surfaces
- synced storytelling handoff appears in Feature 114 Marketplace Product Storytelling workspace
- Storyboard Review receives product evidence, customer journey stage, and claim QA metadata
- insight read endpoints return typed records by capture ID, product ID, and insight ID
- claim approval/edit/remove updates storytelling readiness without losing provenance

Manual QA:

- Chrome 138+
- Chrome below Prompt API support where install is still possible
- Prompt API available
- Prompt API unavailable
- `LanguageModel` exposed but requested options unavailable
- model downloadable
- model downloading progress
- model download cancelled
- server AI fallback enabled
- server AI fallback disabled
- Windows 11
- macOS 13+
- Linux desktop
- unsupported mobile/browser environment documented as not supported for extension local AI
- Shopee product page
- Shopee page with missing reviews
- TikTok Shop page
- Thai content
- English content
- mixed Thai/English content
- complete customer journey video handoff to Gemini Omni Storytelling
- incomplete evidence handoff opens review instead of generation
- user can approve/edit/remove a claim and see scenes update before storytelling

---

## 21. Rollout Plan

Phase 1 - Local Capability And UI

- Add capability detector.
- Add provider decision matrix.
- Add Local AI status section to side panel.
- Store privacy preferences in `chrome.storage.local`.
- No sync by default.

Phase 2 - Product Brief Beta

- Add sanitizer, schemas, prompt builder, validator.
- Generate ProductBrief for current product capture.
- Show result in side panel.
- Existing upload/analyze flow remains primary.

Phase 3 - Review And TikTok Shop Intelligence

- Add ReviewInsight where review evidence exists.
- Add TikTokShopTrendBrief from current TikTok Shop capture/candidate data.
- Add provider fallback.

Phase 4 - Structured Insight Sync

- Add `/api/marketplace-captures/insights` or equivalent tRPC-backed storage.
- Add typed insight lifecycle/read endpoints for capture, product, and insight detail.
- Show insights in capture preview/product detail.
- Add claim review/approval surface for storytelling readiness.
- Audit sync metadata only.

Phase 5 - AI Video Studio Bridge

- Generate VideoBrief.
- Generate MarketplaceStorytellingHandoff.
- Import draft to AI Video Studio.
- Open Gemini Omni Marketplace Product Storytelling when readiness allows.
- Open review/claim-resolution when readiness is blocked.
- Require user confirmation before project creation/render.

---

## 22. Acceptance Criteria

Existing capture safety:

- Shopee capture works when Prompt API is disabled.
- TikTok Shop capture works when Prompt API is disabled.
- Existing `/api/marketplace-captures` draft/upload/analyze calls remain compatible.
- Existing sync format is unchanged unless user uses local insight sync.

Prompt API optionality:

- Extension loads normally when `LanguageModel` is undefined.
- Extension loads normally when `LanguageModel.availability()` throws.
- User can still capture and send selected evidence without local AI.
- Server fallback can be used if enabled.
- Raw capture-only mode remains available if both local AI and server fallback are unavailable.
- Model download cannot start without an explicit user action.
- Downloading/analysis can be cancelled without corrupting capture state.

Structured output:

- ProductBrief validates against schema.
- ReviewInsight validates against schema.
- TikTokShopTrendBrief validates against schema.
- VideoBrief validates against schema.

Privacy:

- Full page HTML is not sent to Prompt API or server as part of local insight sync.
- Raw capture is not synced unless the user setting allows it.
- User can inspect structured brief before sending.

AI Video Studio:

- VideoBrief can be imported as a draft.
- Import does not trigger immediate render.
- User must confirm project creation/render action.

Storytelling:

- MarketplaceStorytellingHandoff includes customer journey stages, scene intents, evidence-backed claims, selected image roles, Product Truth warnings, and allowed next actions.
- Feature 114 can consume the handoff without parsing free-form prose.
- Feature 114 can retrieve the handoff by capture ID, product ID, or insight ID.
- User can approve, edit, remove, or request more evidence for claim warnings before generation.
- Direct Gemini Omni Storytelling is blocked when required product evidence, image fidelity, claim support, or journey mapping is missing.
- Missing local/server insights do not block basic product video creation from confirmed product fields and selected images.

---

## 23. Completeness Review Checklist

Before implementation starts, confirm:

- Support matrix covers API missing, unavailable, downloadable, downloading, available, and thrown errors.
- Side panel has copy for local AI, SmartSpecPro AI fallback, and raw capture-only mode.
- Chrome Prompt API use is behind runtime detection and user action.
- Expired origin-trial permissions are not added to manifest.
- Thai output is best effort, not a blocker.
- Tests include both supported and unsupported Prompt API states.
- Existing capture/upload/analyze/preview tests run with local AI disabled.
- Insight sync cannot send raw capture by default.
- Customer journey handoff includes enough structured fields for Feature 114 Storyboard Review.
- Product Truth and Customer Journey readiness gates are explicit before Gemini Omni generation.
- Insight lifecycle and claim review are typed enough for implementation without inventing ad hoc JSON states.

---

## 24. Operational Readiness

### 24.1 Data Retention, Delete, And Export

Implementation must define retention separately for local extension records and server insight records:

- local `chrome.storage.local` analysis records should be removable from the extension UI
- server insight records should follow Marketplace Capture tenant/user retention policy
- raw AI output must be retained only when debug mode is explicitly enabled
- synced structured insights must be exportable with their schema version, source IDs, and evidence IDs
- deleting a capture/product must either delete, archive, or detach linked insights according to existing Marketplace Capture retention rules
- claim approvals and edited claims must remain auditable while avoiding raw page text retention

Acceptance:

- User can clear local AI records without deleting confirmed products.
- Server deletion/retention behavior is deterministic for capture, product, insight, and storytelling handoff records.
- Export does not include raw prompt text, raw DOM, cookies, tokens, or screenshots unless separately selected through existing evidence export rules.

### 24.2 Web Store And Privacy Review

Before release, the extension package must pass Chrome Web Store and internal privacy review:

- no broad host permissions beyond existing Shopee/TikTok Shop/SmartSpecPro needs
- no expired Prompt API origin-trial permission
- no remote code or dynamic prompt execution
- clear disclosure that local AI may use Gemini Nano in Chrome when available
- clear disclosure that server AI fallback sends selected structured/sanitized data to SmartSpecPro
- privacy copy distinguishes local analysis, structured insight sync, raw capture upload, and selected evidence upload
- telemetry excludes product text, prompts, reviews, comments, page titles, and model outputs

### 24.3 I18n And Accessibility

All new side panel and web preview text must be localized in Thai and English:

- Prompt API status and fallback reasons
- model download/progress/cancel labels
- claim review actions
- storytelling readiness and blocked-generation reasons
- Product Truth warnings
- raw capture-only explanation

Accessibility requirements:

- Local AI and claim review controls are keyboard reachable.
- Status/progress updates use accessible labels or live regions where appropriate.
- Long claim text and warning labels do not overflow the side panel on small viewports.

### 24.4 Rollback And Kill Switches

Feature rollout must include independent kill switches:

- disable Prompt API local analysis
- disable server fallback for extension insights
- disable insight sync
- disable storytelling handoff sync
- disable Gemini Omni direct handoff while keeping capture/product video basics available

Rollback must not remove existing capture drafts, uploaded evidence, confirmed products, or existing server analyze behavior.

### 24.5 Implementation Planning Artifacts

This feature package includes canonical planning files so the implementation can continue through the same deep-plan/deep-implement flow as adjacent feature packages:

- `claude-spec.md`
- `claude-plan.md`
- `claude-plan-tdd.md`
- `deep_plan_config.json`
- `sections/index.md`
- `sections/section-*.md`

---

## 25. References

- Chrome Prompt API: `https://developer.chrome.com/docs/ai/prompt-api`
- Chrome built-in AI APIs: `https://developer.chrome.com/docs/ai/built-in-apis`
- Get started with built-in AI: `https://developer.chrome.com/docs/ai/get-started`
- Existing feature package: `specs/feature/113-marketplace-capture-extension/spec.md`
- Existing extension package: `apps/extension`
