# Section 04: Creative Planning Contracts

## Purpose

Replace the current deterministic `buildAutoReviewPlan` behavior with Agents-generated creative concepts, storyboard, Thai voiceover, prompt contracts, and direct shot media payloads.

## Depends On

- section-01-contracts-and-schema.
- section-02-python-agents-gateway-runtime.
- section-03-node-runtime-client-and-preflight.

## Blocks

- ad compliance warning overlays.
- direct media execution.
- QA and repair.

## Files Owned By This Section

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- optional planner helper under `apps/web/server/services/marketplaceAutoReviewPlanning.ts`
- shared contracts from section 01 as needed.
- focused service tests.

## Tests First

- Test `concept_story` does not auto-complete from deterministic planner.
- Test `CreativeConceptSet` validates and persists.
- Test repeated runs for the same product require distinct novelty fingerprints.
- Test unsupported product claims block concept selection.
- Test unsupported variant/SKU-specific claims block concept selection.
- Test selected concept stores rationale and rejected alternatives.
- Test creative novelty memory uses only tenant-safe redacted fingerprints and never positive-learns from failed/blocked outputs.
- Test target distribution profile changes concept/shot constraints such as aspect ratio, safe areas, hook duration, caption density, and CTA placement.
- Test CTA copy is generated only from approved product/offer/link evidence and can be removed when landing integrity fails.
- Test synthetic humans/voices/materially synthetic scenarios include disclosure requirements in the plan.
- Test `prompt_plan` stores storyboard shots, Thai voiceover, warning plan, and shot media payloads.
- Test natural speech duration fits target shot duration.

## Implementation Requirements

`concept_story` must call Agents runtime and produce:

- 3 to 5 concept options;
- concept title;
- hook type;
- target audience;
- core tension;
- product role;
- visual metaphor;
- proof plan;
- novelty fingerprint;
- claim truth-risk score;
- variant/SKU truth-risk score when selected option evidence exists;
- ad-compliance score;
- creative-quality score;
- rejected/selected rationale.
- distribution-profile fit score.
- feedback-memory source refs used for novelty, if any.
- CTA/landing integrity dependency when the concept uses CTA or offer language.
- synthetic disclosure requirement when concept uses generated people, synthetic voice, or materially synthetic scenes.

Auto-selection thresholds:

- product truth pass;
- variant/SKU truth pass when selected option context exists;
- ad compliance pass;
- novelty pass;
- credit policy pass;
- no regulated-category blocker.
- distribution profile fit pass.
- creative feedback memory policy pass.

`prompt_plan` must call Agents runtime and produce:

- storyboard shot list;
- timing and duration;
- Thai voiceover per shot;
- caption/on-screen text plan;
- visual warning/disclosure plan;
- product visual locks;
- character continuity locks;
- audio contract;
- distribution profile refs;
- creative feedback memory decision;
- CTA/landing integrity refs when CTA/offer copy appears;
- synthetic disclosure refs when generated media disclosure is required;
- provider-ready media payloads.

The generated plan must preserve Feature 118 output mode, frame strategy, and audio strategy names.

Creative memory rules:

- use only redacted tenant/product-scoped fingerprints, rejected pattern IDs, QA reason codes, and approved user feedback;
- do not include raw prompts, raw provider payloads, private product evidence, customer PII, unredacted images, or failed outputs as positive examples;
- if memory is unavailable or blocked, generate concepts from current evidence and policy only.
- if CTA/landing integrity is not passed, the plan must use a generic non-click CTA or omit CTA until rechecked.
- if synthetic disclosure is required, script/captions/overlay/export metadata must reserve space for the disclosure before media generation.

## UI/UX Contract

### Target User / JTBD
N/A - backend planning/runtime section only. User-facing behavior is planned in section-09.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - generated planning states are persisted for UI consumption; rendering is covered in section-09.

### Responsive Matrix
N/A - no responsive UI work in this section.

### Accessibility Acceptance
N/A - no interactive UI created in this section.

### Copy Contract
N/A - generated narration/copy contracts are media artifacts, not UI labels.

### Browser Evidence Required
N/A - browser evidence belongs to section-09.

## Acceptance Criteria

- Existing 9-shot deterministic plan is no longer the source for Feature 117 eligible runs.
- Storyboard-only can proceed from structured Agents output.
- Full-video can derive all later media payloads without node canvas.
- Creative freshness improves while product truth stays evidence-bound.
- Creative variation cannot invent or swap product variants/SKUs.
- Creative variation respects distribution profile constraints and tenant-safe feedback memory boundaries.
- Creative variation respects CTA/landing integrity and synthetic disclosure constraints.
