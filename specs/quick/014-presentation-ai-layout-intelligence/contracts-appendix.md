## Contracts Appendix

This appendix locks the initial v1 contract shapes so implementation teams do not invent incompatible payloads during Section 01-06.

## 1. Persisted Slide Metadata Draft

Store v1 routing metadata under `slideContent.aiDesign`.

Suggested additive shape:

```ts
type PresentationAILayoutMode =
  | "structured_block"
  | "long_form_block"
  | "llm_layout_dsl"
  | "full_slide_media";

type PresentationAILayoutCompactionLevel =
  | "none"
  | "balanced"
  | "compact"
  | "aggressive";

interface SlideAIDesignV14 {
  schemaVersion: "presentation_ai_layout_v1";
  mode?: PresentationAILayoutMode;
  candidateModes?: Array<{
    mode: PresentationAILayoutMode;
    score: number;
    fitStatus?: "fits" | "cramped" | "unsafe";
    reason?: string;
    blockedBy?: "feature_flag" | "provider_capability" | "cost" | "safety" | "lock_conflict";
  }>;
  modeLocked?: boolean;
  userOverrideMode?: PresentationAILayoutMode | null;
  fitScore?: {
    overall: number;
    density: number;
    readability: number;
    overflowRisk: number;
    deckConsistency?: number;
    status: "fits" | "cramped" | "unsafe";
  };
  compactionLevel?: PresentationAILayoutCompactionLevel;
  sourceTrace?: Array<{
    sourceId: string;
    sourceType: "heading" | "subheading" | "paragraph" | "bullet" | "section";
    sourceExcerpt?: string;
    disposition: "used" | "shortened" | "omitted" | "deferred" | "split";
    targetSlotId?: string;
    targetSlideId?: string;
    notes?: string;
  }>;
  fallbackHistory?: Array<{
    step:
      | "retry_compaction"
      | "switch_recipe"
      | "switch_mode"
      | "split_slide"
      | "blocked_locked_mode"
      | "blocked_safety_policy"
      | "blocked_provider_policy";
    from?: string;
    to?: string;
    reason: string;
    timestamp: string;
  }>;
  mediaModeMetadata?: {
    provider?: string;
    modelId?: string;
    promptVersion?: string;
    visualIntent?: "cover" | "poster" | "infographic" | "summary_visual";
    thaiTextRisk?: "low" | "medium" | "high";
    reviewRequired?: boolean;
    editableSourceRetained: boolean;
  };
}
```

Compatibility rule:
- if `schemaVersion` is missing, treat the slide as pre-014
- all 014 fields are additive and optional in v1
- older clients may ignore these fields, but the persisted slide content must still normalize into a safe renderable slide

Default persistence rule:
- persist only validated routing metadata and validated structured outputs
- never persist raw LLM replies

## 1.1 Persisted Field Semantics

- `mode`
  - the active mode that actually produced the current slide payload
- `candidateModes`
  - ranked options considered by the router for explanation UI and telemetry
- `modeLocked`
  - hard user lock that prevents silent automatic mode changes
- `userOverrideMode`
  - explicit user-selected mode, even if lock is later removed
- `fitScore`
  - final deterministic acceptance score for the current output
- `compactionLevel`
  - the strongest compaction level actually used before acceptance or fallback
- `sourceTrace`
  - paragraph/section level source mapping for explainability, split-slide, and deferred content
- `fallbackHistory`
  - ordered record of retries, route changes, and blocked actions
- `mediaModeMetadata`
  - provenance and trust metadata for `full_slide_media`

## 2. Recipe-Aware Compaction Prompt Contract

### Input

```json
{
  "mode": "structured_block",
  "recipeId": "sectioned-explainer",
  "language": "th",
  "compactionLevel": "balanced",
  "contentProfile": {
    "headingCount": 3,
    "paragraphCount": 5,
    "bulletCount": 4,
    "avgParagraphChars": 142,
    "maxParagraphChars": 281
  },
  "slotBudgets": [
    { "slotId": "title", "role": "headline", "maxChars": 60, "targetLines": 2 },
    { "slotId": "summary", "role": "summary", "maxChars": 180, "targetLines": 4 },
    { "slotId": "section1-body", "role": "body", "maxChars": 220, "targetLines": 5 }
  ],
  "qualityThresholds": {
    "minFitScore": 0.78,
    "warnOverflowRisk": 0.45,
    "unsafeOverflowRisk": 0.70
  },
  "textPolicy": {
    "language": "th",
    "preserveFacts": true,
    "avoidInventingNewClaims": true,
    "allowAggressiveRewrite": false
  },
  "sourceNarrative": {
    "title": "....",
    "body": ["...."],
    "sections": [{ "id": "sec-1", "heading": "....", "details": ["...."] }]
  }
}
```

### Output

```json
{
  "status": "ok",
  "slotContent": [
    { "slotId": "title", "type": "text", "text": "..." },
    { "slotId": "summary", "type": "text", "text": "..." },
    { "slotId": "section1-body", "type": "text", "text": "..." }
  ],
  "sourceTrace": [
    { "sourceId": "p-1", "disposition": "used", "targetSlotId": "summary" },
    { "sourceId": "p-5", "disposition": "omitted", "notes": "redundant detail" },
    { "sourceId": "p-6", "disposition": "deferred", "targetSlideId": "slide-9" }
  ],
  "overflowRisk": 0.22,
  "fitConfidence": 0.84,
  "fallbackSuggestion": null
}
```

Validation rules:
- output must be JSON-only and schema-valid
- each `slotId` must map to an allowed slot in the chosen recipe
- omitted/deferred content must be explicitly listed if source coverage falls below threshold
- compaction output does not bypass deterministic fit validation

## 3. Constrained Layout DSL Draft

### Input

The router passes:
- content profile
- source narrative
- allowed primitives
- canvas size
- style tokens
- hard limits
- safety and budget constraints

Example request:

```json
{
  "mode": "llm_layout_dsl",
  "language": "th",
  "contentProfile": {
    "sectionCount": 4,
    "paragraphCount": 3,
    "visualFirstCandidate": false
  },
  "canvas": { "width": 720, "height": 1280 },
  "allowedPrimitives": ["text", "image", "video", "rect", "line", "svg", "group"],
  "styleTokens": {
    "themeId": "calm-editorial",
    "typographyPack": "thai-editorial-v1"
  },
  "hardLimits": {
    "maxElements": 18,
    "maxGroups": 4,
    "disallowArbitraryHtml": true
  }
}
```

### Output

```json
{
  "status": "ok",
  "layout": {
    "schemaVersion": "presentation_layout_dsl_v1",
    "canvas": { "width": 720, "height": 1280 },
    "background": { "type": "color", "value": "#F8F7F2" },
    "elements": [
      {
        "type": "text",
        "role": "title",
        "x": 64,
        "y": 80,
        "width": 592,
        "height": 140,
        "text": "..."
      }
    ]
  }
}
```

Hard limits in v1:
- max 18 elements
- no arbitrary nested groups
- only allow existing renderable primitives and safe grouping metadata
- disallow unsupported CSS/HTML or executable payloads
- reject outputs that exceed element budget instead of silently trimming them

Repair rules:
- at most one repair attempt in v1
- repair prompt may only fix schema or budget violations, not redesign the entire slide from scratch
- if repair fails, fallback to structured or long-form mode

## 4. Full-Slide Media Prompt Contract

### Input

```json
{
  "mode": "full_slide_media",
  "visualIntent": "infographic",
  "language": "th",
  "textInImagePolicy": "minimize",
  "safetyPolicy": {
    "allowDenseThaiBodyText": false,
    "requireEditableBackup": true,
    "blockIfThaiTextRiskHigh": true
  },
  "sourceNarrative": {
    "title": "...",
    "sections": [{ "heading": "...", "details": ["..."] }]
  },
  "contentProfile": {
    "paragraphCount": 2,
    "sectionCount": 4,
    "visualFirstCandidate": true
  }
}
```

### Output Metadata

```json
{
  "provider": "default-image-provider",
  "modelId": "default-image-model",
  "thaiTextRisk": "medium",
  "reviewRequired": true,
  "promptVersion": "presentation_full_slide_media_v1",
  "assetPolicy": "proxy_or_inline_before_preview",
  "editableSourceRetained": true
}
```

Trust rules in v1:
- `reviewRequired = true` for any generated slide with Thai text baked into the image unless it is short cover/poster text only
- `full_slide_media` may not be auto-selected for factual dense slides such as profile boards, educational explainers, or contact-heavy slides
- the system must retain source narrative so users can downgrade back to editable modes

## 5. Initial Compatibility Rules

- `structured_block` and `long_form_block` must remain renderable through existing component-first infrastructure
- `llm_layout_dsl` must normalize into supported slide content before persistence
- `full_slide_media` must persist both the produced media artifact and the source narrative metadata
- older clients may ignore 014 metadata, but must still render the resulting slide content safely

## 6. Failure Budget and Timeout Defaults

- compaction retry max: `2`
- compaction timeout per attempt: `20s`
- DSL repair retry max: `1`
- DSL timeout per attempt: `25s`
- full-slide-media generation retry max: `1`
- full-slide-media timeout before fallback decision: `45s`

Fallback order:
1. stronger compaction
2. alternate recipe in the same family
3. long-form mode
4. slide split
5. `full_slide_media` only if policy allows

## 7. Quality Gate Defaults

- auto-accept only when `fitScore.overall >= 0.78`
- warn/cramped band: `0.62 - 0.77`
- unsafe/reject band: `< 0.62`
- overflow is unsafe at `overflowRisk >= 0.70`
- body readability fails when target lines are exceeded by `2+`
- silent omission warning at `> 15%` of mapped source text
- deck consistency warning when `> 2` adjacent slides oscillate across incompatible families without explicit reason

## 8. Safety and Moderation Defaults

- DSL mode:
  - reject unsupported primitives, hidden overflow hacks, or element counts above budget
  - do not auto-repair more than once
- full-slide-media:
  - allowed by default only for cover/title/poster/infographic summary slides
  - blocked for dense Thai informational slides by default
  - keep editable source narrative and explicit provenance metadata
- compaction:
  - preserve factual meaning
  - do not fabricate claims, metrics, timelines, or credentials during rewrite
