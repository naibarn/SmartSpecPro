# Section 15: Product Image Storyboard Evidence Bridge

## Goal

Make product images first-class storyboard evidence, not generic visual references.

When a user brings product images from Shopee, TikTok Shop, marketplace capture, library assets, upload, or Feature 115 `MarketplaceStorytellingHandoff`, Production Director must preserve product identity, image role, claim evidence, fidelity risk, and per-shot usage from planning through generation, QA, Storyboard Review, and Video Edit.

## Core Principles

- Product images are visual truth inputs. They must not be mixed with mood/style references without explicit role labels.
- Product identity, SKU/variant, packaging, label, color, and visible claims must remain traceable.
- Every product claim used in script, caption, CTA, on-screen text, storyboard scene, or video prompt must map to evidence or explicit user approval.
- High product-image fidelity risk blocks direct generation until reviewed.
- Planning and verification do not reserve generation credits.
- Generated product images can become references only when linked back to source evidence and clearly labeled as generated derivatives.

## Sources

Supported product image sources:

- Feature 115 `MarketplaceStorytellingHandoff.selectedProductImages`,
- Shopee marketplace capture images,
- TikTok Shop marketplace capture images,
- product library images,
- uploaded product images,
- generated product packshots derived from approved source images,
- existing media library outputs explicitly approved as product references.

## Feature 115 Import Mapping

Feature 115 is the source of truth for marketplace storytelling handoff fields. Production Director must import it deterministically.

Mapping from `MarketplaceStorytellingHandoff`:

| Feature 115 field | Production field |
| --- | --- |
| `source.platform` | `ProductStoryboardAsset.platform` |
| `source.captureId` | `ProductStoryboardAsset.captureId` |
| `source.marketplaceProductId` | `ProductStoryboardAsset.marketplaceProductId` |
| `source.url` | `ProductStoryboardAsset.provenance.sourceUrl` as sanitized provenance |
| `selectedProductImages[].imageUrl` | `ProductStoryboardAsset.image.publicUrl` |
| `selectedProductImages[].assetId` | `ProductStoryboardAsset.image.assetId` |
| `selectedProductImages[].evidenceId` | `ProductStoryboardAsset.image.evidenceId` and `evidenceIds[]` |
| `selectedProductImages[].role` | `ProductStoryboardAsset.role` using the fixed role mapping table below |
| `selectedProductImages[].fidelityRisk` | `ProductStoryboardAsset.fidelityRisk` |
| `evidenceBackedClaims[].id` | `ProductClaimEvidence.id`, `linkedClaimIds[]`, and `ProductionShotProductUse.claimIds[]` |
| `evidenceBackedClaims[].claimText` | `ProductClaimEvidence.claimText` |
| `evidenceBackedClaims[].claimType` | `ProductClaimEvidence.claimType` |
| `evidenceBackedClaims[].evidenceIds` | `ProductStoryboardAsset.evidenceIds[]` when related to the image/shot |
| `evidenceBackedClaims[].approvedByUser` | `ProductClaimEvidence.approvedByUser` |
| `evidenceBackedClaims[].risk` | `ProductClaimEvidence.risk` and claim validation gates |
| `insightRefs` | `ProductStoryboardAsset.provenance.insightRefs` and evidence manifests |
| `unsupportedClaims[]` | `ProductionShotProductUse.unsupportedClaimTexts[]` and blocking warnings |
| `customerJourney[]` / `scenes[].customerJourneyStage` | `ProductionShotProductUse.customerJourneyStage` |
| `readiness` | import readiness gate and default approval status |
| `allowedNextActions` | allowed Production actions and handoff buttons |

Fixed role mapping:

| Feature 115 image role | Production role |
| --- | --- |
| `hero` | `hero` |
| `detail` | `detail` |
| `use_case` | `use_case` |
| `review` | `review` |
| `comparison` | `comparison` |
| `background` | `background` |

Default import rules:

- `source` is `feature_115_handoff`.
- `title` uses product name from the handoff/product brief when available, otherwise the image role plus evidence ID.
- `productIdentity` is populated from the confirmed product record, marketplace product record, or ProductBrief summary. Missing identity marks the asset `needs_review`.
- `approvalStatus` is:
  - `approved` when handoff readiness is `ready_for_storytelling` and `fidelityRisk` is `low`;
  - `needs_review` when readiness is `ready_with_warnings`, `fidelityRisk` is `medium` or `unknown`, or user confirmation is required;
  - `blocked` when readiness is `needs_user_review` or `insufficient_evidence`, `fidelityRisk` is `high`, or unsupported/policy-sensitive/image-mismatch claims affect the image/shot.
- `usagePolicy.requiresUserApprovalBeforeGeneration` is true for `medium`, `high`, or `unknown` fidelity risk unless a user explicitly approves the asset.
- Missing `imageUrl` is allowed only if `assetId` or a resolvable storage/library ref exists; otherwise the image is blocked until relinked.

Feature 116 must not parse raw Feature 115 local AI text. It consumes the typed handoff, selected evidence, and approved user edits only.

Allowed action mapping:

| Feature 115 `allowedNextActions` value | Production behavior |
| --- | --- |
| `send_to_gemini_omni_storytelling` | Enable Gemini Omni-compatible Video/Shot planning only after Product Truth, Image Truth, Claim Truth, and Customer Journey gates pass. |
| `send_to_storyboard_review` | Enable Storyboard Review handoff after ordered shots and product evidence manifests validate. |
| `ask_user_to_confirm_claims` | Create claim review tasks; disable generation and handoff until affected claims are approved, edited, removed, or marked unsupported. |
| `select_more_product_images` | Create product image selection/relink tasks; block product-related generation until required images are selected. |
| `run_server_ai_review` | Create server AI review node/task; keep generation blocked until the review result is imported and gates pass. |
| `capture_more_evidence` | Route back to marketplace capture/evidence collection; block product-related generation until evidence is added or user confirms a reduced-confidence path. |

Readiness gate mapping:

| Feature 115 readiness | Production default |
| --- | --- |
| `ready_for_storytelling` | Can approve and generate after normal verifier checks pass. |
| `ready_with_warnings` | Can plan, but generation/handoff requires authorized user acceptance of warnings and verifier pass. |
| `needs_user_review` | Can draft a plan, but direct generation and downstream handoff stay disabled until claim/image/product review resolves blockers. |
| `insufficient_evidence` | Blocks product-related generation and handoff; planner should create evidence request/review nodes instead of generation nodes. |

## Product Storyboard Asset Contract

Production Director should normalize every selected product image into a `ProductStoryboardAsset`.

```ts
interface ProductStoryboardAsset {
  id: string;
  productId?: string;
  marketplaceProductId?: string;
  captureId?: string;
  platform?: "shopee" | "tiktok_shop" | "library" | "manual";
  source:
    | "feature_115_handoff"
    | "marketplace_capture"
    | "product_library"
    | "upload"
    | "generated_derivative";
  title: string;
  productIdentity: {
    name?: string;
    brand?: string;
    sku?: string;
    variant?: string;
    color?: string;
    packageSize?: string;
    seller?: string;
  };
  image: {
    assetId?: string;
    evidenceId?: string;
    publicUrl?: string;
    storageKey?: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  };
  provenance: {
    sourceUrl?: string;
    insightRefs?: {
      productBriefId?: string;
      reviewInsightId?: string;
      tiktokShopTrendBriefId?: string;
      videoBriefId?: string;
    };
    handoffSchemaVersion?: string;
  };
  role:
    | "hero"
    | "detail"
    | "use_case"
    | "review"
    | "comparison"
    | "background"
    | "packshot"
    | "label_closeup"
    | "texture_detail"
    | "before_after_reference"
    | "cta_end_card";
  evidenceIds: string[];
  linkedClaimIds: string[];
  fidelityRisk: "low" | "medium" | "high" | "unknown";
  approvalStatus: "unreviewed" | "approved" | "needs_review" | "blocked";
  usagePolicy: {
    canUseAsImageReference: boolean;
    canUseAsStartFrame: boolean;
    canUseAsStopFrame: boolean;
    canUseAsPackshot: boolean;
    canUseForLogoLabel: boolean;
    requiresUserApprovalBeforeGeneration: boolean;
  };
  warnings: string[];
}
```

## Product Claim Evidence Contract

Production Director must preserve the Feature 115 claim safety metadata in a typed map. `claimIds` alone are not enough because the verifier needs to know whether a claim was supported, user-approved, policy-sensitive, or mismatched with imagery.

```ts
interface ProductClaimEvidence {
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
  source: "feature_115" | "manual_user_approval" | "production_review";
}

type ProductClaimEvidenceMap = Record<string, ProductClaimEvidence>;
```

Claim validation rules:

- `ProductionShotProductUse.claimIds[]` may contain only keys from `ProductClaimEvidenceMap`.
- `supported` claims require at least one evidence ID.
- `needs_user_confirmation` claims block generation until `approvedByUser` is true.
- `unsupported`, `image_mismatch`, and `policy_sensitive` claims block generation and downstream handoff unless a dedicated review path resolves or removes them.
- Evidence IDs and claim IDs are never interchangeable. A router input must use separate `claimId` and `evidenceId` fields or a discriminated union.
- Unsupported free-form text remains in `unsupportedClaimTexts[]` and can be rewritten into an approved claim only through explicit user review.

## Shot Product Usage Contract

Each Video Shot that uses product imagery must store explicit usage:

```ts
interface ProductionShotProductUse {
  shotId: string;
  productStoryboardAssetIds: string[];
  presence:
    | "not_present"
    | "shown"
    | "demoed"
    | "reviewed"
    | "proof"
    | "comparison"
    | "packshot"
    | "cta";
  customerJourneyStage?:
    | "awareness"
    | "problem_recognition"
    | "consideration"
    | "proof_review_demo"
    | "objection_handling"
    | "trust_building"
    | "conversion_cta"
    | "retention_brand_recall";
  claimIds: string[];
  unsupportedClaimTexts: string[];
  requiredVisualAccuracy:
    | "loose_style_reference"
    | "product_likeness"
    | "packaging_exact"
    | "label_logo_exact";
  frameStrategy:
    | "image_reference"
    | "start_frame"
    | "stop_frame"
    | "start_and_stop_frame"
    | "packshot_insert"
    | "not_required";
  mustShow: string[];
  mustAvoid: string[];
  qaRequirements: Array<
    | "product_identity"
    | "variant_consistency"
    | "label_logo_fidelity"
    | "claim_evidence"
    | "before_after_safety"
    | "cta_truth"
  >;
}
```

`claimIds` must contain `EvidenceBackedClaim.id` values from Feature 115 or claim records created by explicit user approval. Free-form claim text belongs only in `unsupportedClaimTexts` or draft script text and must not be treated as evidence-backed.

## Production UI Requirements

The Product / Claims drop zone should show a Product Evidence Tray:

- product card summary,
- selected product images grouped by role,
- source platform and capture/product refs,
- image fidelity risk badge,
- claim/evidence badges,
- approval state,
- variant/SKU label,
- warnings for missing public URL, missing evidence, high fidelity risk, or mismatched product identity.

Users must be able to:

- choose product image role,
- approve or block a product image,
- select which product images apply to each shot,
- link claims and evidence to product images through separate controls,
- mark a product image as hero/detail/use-case/packshot/CTA,
- request more evidence or return to marketplace capture review when blocked.

Source of truth:

- Product Evidence Tray owns project-level product assets, product identity, image roles, fidelity risk, approval state, claim links, and evidence refs.
- Video Shot Product Usage panel owns shot-level product usage, selected product assets for that shot, frame strategy, visual accuracy, must-show/must-avoid notes, and QA requirements.
- Editing project-level image role or approval state revalidates every shot using that asset.
- Editing shot-level usage must not mutate project-level asset identity or evidence refs unless the user explicitly chooses an `Apply to product evidence` action.
- Conflicts are shown when the same product image is changed in Production and Video Shot tabs concurrently; user can reload latest or save as a new version.

## UI/UX Contract: Product Evidence Tray

### Target User / JTBD

- Role: creator/operator using product images and marketplace evidence safely in a storyboard.
- Goal: see which product facts, images, claims, and evidence are safe to use; fix blockers before generation or handoff.
- Entry point: Production Workspace asset board, Feature 115 handoff import, Product Evidence Tray, Video Shot Product Usage panel.
- Success outcome: user can identify the right product image/claim, approve or block usage, link evidence, and understand why a product shot cannot yet generate.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Product Evidence Tray | `ProductEvidenceTray.tsx` | Project-level product assets, identity, role, fidelity risk, claim/evidence badges, approval, warnings, and actions. |
| Product image role picker | Product Evidence Tray | Role change with preview of downstream shot effects. |
| Claim/evidence linker | Product Evidence Tray | Separate claim and evidence controls, no interchangeable IDs. |
| Product Usage panel | `VideoShotProductUsagePanel.tsx` | Shot-level product usage and frame strategy. |
| Blocker/recovery panel | Product Evidence Tray and Video Shot | Relink, request more evidence, approve warning, continue reduced-confidence where allowed. |

### Component Map

| Component | Owns | Consumes | Must expose |
| --- | --- | --- | --- |
| `ProductEvidenceTray` | project-level product evidence and approval state | Feature 115 handoff, product assets, claim map, readiness | role labels, risk badges, claim/evidence separation, recovery actions. |
| `ProductEvidenceCard` | one product image summary | `ProductStoryboardAsset` | image alt text, role, SKU/variant, source, risk, approval state. |
| `ClaimEvidenceLinker` | claim/evidence relationship | `ProductClaimEvidenceMap`, evidence refs | validation that claim IDs and evidence IDs are distinct. |
| `ProductEvidenceBlockerPanel` | next recovery action | readiness gate result | user-facing explanation and allowed next action. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading | Stable tray skeleton with no stale product selected as active. | Screenshot. |
| empty | Add/import product evidence action and short explanation; no product-generation button. | UI test. |
| ready | Product cards show role, image, SKU/variant, evidence, claims, and approved state. | Fixture test. |
| warning | Warnings explain the risk and next action; generation/handoff disabled where required. | Feature 115 `ready_with_warnings` test. |
| blocked | High-risk/missing evidence state shows relink/request evidence/approve claim path. | Browser negative test. |
| conflict | Project-level vs shot-level concurrent edit shows reload/save-new path. | Conflict test. |
| permission denied | Read-only tray with request-access/copy-safe-ref path. | Security/UI test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Tray becomes a collapsible section with product cards stacked and sticky-free actions. | Mobile screenshot. |
| 768x1024 | Tray can dock below/alongside assets; cards remain readable. | Tablet screenshot. |
| 1280x800 | Tray fits as side rail or lower panel without hiding canvas blockers. | Laptop screenshot. |
| 1440x900 | Tray can show product list, selected image detail, and claim/evidence panel together. | Desktop screenshot. |

### Accessibility Acceptance

- Product images must have meaningful alt text based on product title, role, and source, not filename-only text.
- Risk/approval badges must have readable text, not color-only state.
- Claim/evidence linking controls must be keyboard reachable and label claim IDs separately from evidence IDs.
- Recovery actions must explain what happens next and whether generation/handoff remains blocked.
- Image preview dialogs trap focus, support Escape/close button, and return focus to the product card.
- Reduced-confidence continuation requires a confirmation dialog and an audit-safe reason.

### Browser Evidence Required

- Evidence must include Feature 115 import, empty tray, ready tray, warning tray, blocked tray, claim/evidence link validation, product-image role change, project/shot conflict, and product blocker handoff-disabled states.

## Video Shot Requirements

The Video Shot tab must include a Product Usage panel when the project has product assets.

For each shot, users can configure:

- product presence,
- selected product images,
- customer journey stage,
- claim IDs used in script/on-screen text/CTA,
- product visual accuracy requirement,
- image reference vs start/stop frame strategy,
- packshot/end-card strategy,
- product-specific must-show and must-avoid notes,
- per-shot product QA requirements.

User-facing labels should avoid raw enum names:

- `fidelityRisk` -> "ความเสี่ยงภาพสินค้าไม่ตรง" / "Product match risk".
- `frameStrategy` -> "วิธีใช้ภาพสินค้า" / "How this product image is used".
- `label_logo_exact` -> "ต้องเห็นฉลาก/โลโก้ตรงเป๊ะ" / "Exact label/logo needed".
- `packshot` -> "ภาพปิดท้ายสินค้า" / "Final product packshot".
- `evidence IDs` -> "หลักฐานสินค้า" / "Product evidence".

Warnings must explain the next user action, for example:

- "ภาพนี้เสี่ยงไม่ตรงกับสินค้าจริง กรุณาเลือกภาพใหม่หรือกดยืนยันก่อนสร้างวิดีโอ"
- "คำเคลมนี้ยังไม่มีหลักฐาน กรุณาเลือก claim ที่มีหลักฐานหรือแก้บทพูด"
- "ช็อตนี้ใช้สินค้า variant อื่น กรุณาเลือก SKU/variant ให้ตรงกัน"

The shot readiness gate should block when:

- a product shot has no product image or approved visual asset,
- a claim has no evidence or explicit approval,
- a selected `claimId` is not present in `ProductClaimEvidenceMap`,
- a selected claim has risk `needs_user_confirmation` and is not approved by the user,
- a selected claim has risk `unsupported`, `image_mismatch`, or `policy_sensitive`,
- selected image `fidelityRisk` is high and not approved,
- selected image product identity does not match the product/variant used by the shot,
- Feature 115 readiness is `needs_user_review`,
- Feature 115 readiness is `insufficient_evidence`,
- Feature 115 readiness is `ready_with_warnings` and the warning acceptance is missing or stale,
- required next action is `select_more_product_images`, `capture_more_evidence`, or `ask_user_to_confirm_claims`,
- `allowedNextActions` does not permit the selected handoff target,
- required packshot/label/logo exactness cannot be supported by the selected model/tool.

## Planner Requirements

Planner input must include:

- `product_storyboard_assets`,
- Feature 115 `MarketplaceStorytellingHandoff` when available,
- product truth summary,
- evidence-backed claims,
- full `ProductClaimEvidenceMap` with claim text, claim type, evidence IDs, approval state, and risk,
- unsupported claims,
- Feature 115 readiness and allowed next actions,
- selected product image roles,
- customer journey stages,
- product image fidelity risk and approval states,
- available image/video provider reference capabilities.

Planner output must include:

- `shot_product_usage`,
- per-shot product image roles,
- per-shot claim/evidence mapping,
- product visual accuracy requirement,
- frame strategy rationale,
- product QA requirements,
- product evidence manifest for downstream handoff.

Planner rules:

- Product review, sales demo, brand/product story, comparison, and CTA shots must map to a customer journey stage.
- Hook/proof/CTA scenes should prefer approved hero, use-case, review, comparison, or packshot images based on role.
- Start/stop frames are recommended only when exact composition, packshot, label, or CTA endpoint control is required.
- Image references are preferred when product likeness is enough and the provider can preserve product identity.
- High fidelity risk should create a review node, not a generation node.
- `insufficient_evidence` should create evidence review/request nodes and block generation nodes.
- `needs_user_review` should create claim/image/product review nodes and block generation nodes.
- `ready_with_warnings` should create explicit warning acceptance before generation or downstream handoff.
- If Feature 115 does not include `send_to_storyboard_review`, Storyboard Review handoff is disabled until the user resolves blockers or explicitly confirms a reduced-confidence path.

## Node Config Handoff

Product storyboard assets must flow into node config snapshots as structured refs, not only prompt text.

Image nodes receive:

- product image refs,
- image role,
- required visual accuracy,
- packshot/label constraints,
- linked evidence IDs,
- derivative/source lineage.

Video nodes receive:

- product image refs,
- reference mode: image reference, start frame, stop frame, start+stop, or packshot insert,
- product preservation instructions,
- claim IDs used in the shot,
- customer journey stage,
- product visual QA requirements.

Prompt, script, caption, and TTS nodes receive:

- evidence-backed claims only,
- claim risk and approval state,
- unsupported claim warnings,
- required disclaimers or avoid notes,
- CTA constraints from product/platform evidence.

`Save to Node` must preserve all product refs and claim refs in `configSnapshot.dynamicFormValues` or a typed product evidence sub-object.

The typed sub-object should use `productEvidenceRefs` with product storyboard asset IDs, evidence IDs, claim IDs, frame strategy, and required visual accuracy. Prompt text must be treated as a rendering instruction, not the source of truth for product evidence.

## QA Requirements

Before approval:

- `product_truth_qa` verifies claim evidence, product identity, selected image roles, customer journey fit, and image fidelity readiness.
- `visual_consistency_qa` verifies selected product image roles are suitable for the planned shot strategy.
- Verifier blocks direct execution when product image fidelity is high, unknown without review, or mismatched.

After generation:

- `video_qa` checks product packaging, label, color, logo, shape, visible variant, and product substitution risk.
- `product_truth_qa` checks generated narration/captions/on-screen text against evidence-backed claims.
- Failed product fidelity QA should recommend retry, alternate reference strategy, human edit, or additional product evidence.

## Storyboard Review and Video Edit Handoff

Storyboard Review receives a per-shot product evidence manifest:

- product identity,
- selected product images,
- image roles,
- customer journey stage,
- claim IDs and supported claim summaries,
- evidence IDs,
- fidelity risk,
- QA status,
- warnings and unresolved blockers.

The manifest must be typed and versioned:

```ts
interface ProductionProductEvidenceManifest {
  schemaVersion: "1.0";
  productionRunId: string;
  productionSpaceVersion: number;
  sourceHandoffRef?: {
    schemaVersion: string;
    platform: "shopee" | "tiktok_shop";
    captureId?: string;
    marketplaceProductId?: string;
    sourceUrl?: string;
    insightRefs?: Record<string, string | undefined>;
  };
  shotManifests: Array<{
    shotId: string;
    productStoryboardAssetIds: string[];
    claimIds: string[];
    evidenceIds: string[];
    customerJourneyStage?:
      | "awareness"
      | "problem_recognition"
      | "consideration"
      | "proof_review_demo"
      | "objection_handling"
      | "trust_building"
      | "conversion_cta"
      | "retention_brand_recall";
    frameStrategy: string;
    requiredVisualAccuracy: string;
    qaStatus: "not_checked" | "passed" | "warning" | "blocked";
    warnings: string[];
    unresolvedBlockers: string[];
  }>;
}
```

The manifest must contain safe refs and sanitized provenance only. It must not embed raw marketplace DOM, full OCR text, comments, reviews, provider keys, private signed URLs, or raw debug payloads.

Storyboard Review UI must let reviewers:

- filter shots by product warning, claim evidence status, and fidelity risk,
- inspect source product images and generated takes side by side,
- approve or reject product fidelity per shot/take,
- mark a product claim warning resolved only when evidence or explicit approval exists,
- send unresolved product issues back to Production as result records.

Video Edit receives:

- product packshot refs,
- CTA/end-card refs,
- trim/timecode notes for product reveal moments,
- overlay/caption claim refs,
- warnings for clips that need manual product fidelity review.

Video Edit UI must surface product evidence beside timeline clips so editors can see packshot refs, CTA claim refs, and warnings before final render/export.

Roundtrip sync:

- Storyboard Review and Video Edit changes to shot order, selected take, trim, captions, manual product fidelity approval, and product warning resolution must create a handoff result record.
- Production can import the result record and update timeline, selected output refs, QA status, and affected product warnings without overwriting locked shot/node configs.
- If downstream edits alter product claims, captions, CTA, or product timing, Production marks related verifier results stale and requires re-verification before batch execution or final render.
- Manual downstream approval never changes product evidence itself; it only records a review decision linked to the shot/take.

## Edge Cases

- Multiple products: each shot must declare which product(s) are present and avoid cross-product claim leakage.
- Multiple variants: shot product identity must match selected SKU/variant.
- Marketplace CDN URLs: store asset/library refs and storage keys so stale URLs can be repaired.
- Low-resolution images: warn and prefer reference use over exact packshot unless user approves.
- Generated derivative product images: retain source lineage and mark derivative risk.
- No Feature 115 insight: allow a reduced-confidence path only when product identity and selected images are manually confirmed.
- Comparison or before/after: require explicit evidence and policy-safe review.

Recovery actions:

- retry storage/library URL refresh,
- relink to another library or marketplace image,
- replace with a new upload,
- request more evidence from marketplace capture,
- continue reduced-confidence only after user confirmation,
- block generation when product identity, evidence, or policy risk remains unresolved.

Privacy and provenance:

- Structured Feature 115 insight and selected evidence are the default input.
- Raw marketplace DOM, full HTML, raw OCR, reviews, comments, screenshots, or debug local AI output must not be attached to the planning context unless the user's Feature 115 raw-capture/debug settings explicitly allow it.
- Audit and metrics events should store safe IDs, counts, readiness states, and warning codes, not raw marketplace text or raw prompts.
- Product evidence exports should include manifests and resolvable references, not private signed URLs or raw capture payloads.

## Acceptance

- Feature 115 `selectedProductImages` can be imported into Production as `ProductStoryboardAsset` records.
- Feature 115 source URL, insight refs, claim text, claim type, claim risk, and user approval state are preserved as safe structured contracts.
- Product images show role, fidelity risk, evidence, approval state, and warnings in Production.
- Each product-related shot stores explicit `ProductionShotProductUse`.
- Planner maps product images and claims to storyboard shots with customer journey stages.
- Image/Video/Script/Audio nodes receive structured product refs, not prompt-only text.
- Product shots block approval when image evidence, claim evidence, claim risk, Feature 115 readiness, or fidelity readiness is insufficient.
- Storyboard Review and Video Edit receive typed per-shot product evidence manifests.
- Tests cover Shopee and TikTok product image storyboard flows, including high-fidelity-risk blocking.
- Tests cover multi-product comparison and prevent product A claims from being used on product B shots.
- Tests cover Feature 115 `needs_user_review`, `insufficient_evidence`, `ready_with_warnings`, allowedNextActions blocking, claim risk/approval blocking, and reduced-confidence manual confirmation.
