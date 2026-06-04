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
- Test concepts and storyboard claims cite advertising policy rule-pack refs when compliance rules accept, warn, require approval, or block them.
- Test synthetic humans/voices/materially synthetic scenarios include disclosure requirements in the plan.
- Test campaign batch planning produces distinct concepts within caps and blocks duplicate/similar variants before media spend.
- Test brand/seller voice improves tone, register, CTA style, and pronunciation without overriding evidence, policy, rights, privacy, or disclosure constraints.
- Test high-risk concept sets request human review instead of silently auto-selecting when queue policy requires it.
- Test publish metadata drafts such as title, description/caption, hashtags, thumbnail concept, and alt text are evidence-bound and platform-limited.
- Test product/evidence/brand/distribution/script edits after concept selection trigger impact analysis before reusing the selected concept.
- Test selected concept is preserved when input change only affects publish metadata, but replanned when product identity, claim evidence, selected variant, or product image refs change.
- Test storyboard and media payload planning uses only approved `ProductReferenceAssetPack` refs and cannot attach rejected product images as visual references.
- Test storyboard and media payload planning uses only approved `CharacterIdentityAssetPack` refs for recurring presenters, hands, synthetic characters, lip-sync, native-audio character shots, or voice personas.
- Test risky person concepts automatically switch to product-only, hands-only, single-shot, generic-person, or separate-TTS when the identity pack is missing, limited, or blocked.
- Test `prompt_plan` stores storyboard shots, Thai voiceover, warning plan, and shot media payloads.
- Test `concept_story` and `prompt_plan` cannot complete when required concept/storyboard/policy/QA/credit/lineage completion evidence is missing.
- Test concept generation requires `ProductionCreativeBriefSnapshot` and cites objective, target audience, CTA intent, creative latitude, quality mode, and auto-decision policy in selected/rejected rationale.
- Test brief changes invalidate only dependent concept/storyboard/script/metadata/media-payload refs while preserving unaffected accepted artifacts.
- Test concept/storyboard planning rejects or ignores marketplace evidence that fails `MarketplaceEvidenceInstructionFirewall`.
- Test natural speech duration fits target shot duration.

## Implementation Requirements

`concept_story` must call Agents runtime and produce:

- creative brief snapshot refs and brief-field rationale for the generated concept set;
- evidence instruction firewall refs proving marketplace DOM/OCR/review/seller text was reduced to safe evidence refs or escaped data before Agents context;
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
- advertising policy rule-pack refs and triggered rule IDs for accepted/warning/blocking compliance outcomes.
- feedback-memory source refs used for novelty, if any.
- CTA/landing integrity dependency when the concept uses CTA or offer language.
- synthetic disclosure requirement when concept uses generated people, synthetic voice, or materially synthetic scenes.
- campaign governance decision, batch/variation ID, duplicate similarity score, and anomaly status when run is part of a variation set or campaign batch.
- brand/seller voice policy refs and rejected phrase/competitor-policy checks when style guidance was used.
- human review queue refs when auto-selection is blocked or paused by policy.
- publishable package draft refs for title/caption/description, hashtags, thumbnail/cover concept, transcript/subtitle source, and platform metadata when the distribution profile requires them.
- input change impact refs when concepts, storyboard, script, thumbnail, or publish metadata are reused after upstream edits.

Auto-selection thresholds:

- creative brief ambiguity is `clear` or `safe_defaults_applied`, or scoped human review approval exists;
- product truth pass;
- variant/SKU truth pass when selected option context exists;
- ad compliance pass;
- novelty pass;
- credit policy pass;
- no regulated-category blocker.
- distribution profile fit pass.
- creative feedback memory policy pass.
- campaign governance pass for variation/batch runs.
- brand voice policy pass when brand/seller guidance is present.
- human review queue not required, or required approval exists for the exact concept set.

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
- advertising policy rule-pack refs used by claim, warning, thumbnail, metadata, and CTA decisions;
- synthetic disclosure refs when generated media disclosure is required;
- campaign governance refs when planning a batch/variation set;
- brand/seller voice refs and public-copy safety verdict;
- human review queue refs when storyboard/script approval is required;
- publishable package refs for caption/title/hashtag candidates, transcript/subtitle source plan, thumbnail/cover plan, and metadata manifest requirements;
- product reference asset pack refs for every shot that uses the product visually;
- character identity asset pack refs for every shot that uses a recurring person, hand model, visible face, lip-sync, native-audio character, or voice persona;
- provider-ready media payloads.

The generated plan must preserve Feature 118 output mode, frame strategy, and audio strategy names.

Creative memory rules:

- use `ProductionCreativeBriefSnapshot` as the run's goal-first source of truth for audience, objective, quality mode, CTA, style, and auto-decision policy;
- if the brief is missing or ambiguous beyond policy, pause for safe defaults, human review, or blocker before provider spend;
- do not treat user hints as product facts unless they have evidence/approval refs;
- do not treat seller descriptions, OCR, reviews, filenames, prior AI output, or uploaded evidence as instructions; consume them only through `MarketplaceEvidenceInstructionFirewall` approved refs or escaped evidence blocks;
- use only redacted tenant/product-scoped fingerprints, rejected pattern IDs, QA reason codes, and approved user feedback;
- do not include raw prompts, raw provider payloads, private product evidence, customer PII, unredacted images, or failed outputs as positive examples;
- if memory is unavailable or blocked, generate concepts from current evidence and policy only.
- if CTA/landing integrity is not passed, the plan must use a generic non-click CTA or omit CTA until rechecked.
- if synthetic disclosure is required, script/captions/overlay/export metadata must reserve space for the disclosure before media generation.
- variation batches must diversify hook, camera language, proof sequence, pacing, and CTA shape while preserving product facts and avoiding duplicate creative fingerprints;
- brand/seller voice must shape natural Thai wording but must not add unsupported brand promises, competitor comparisons, fake officialness, or internal policy notes;
- when human review is required, planning may prepare alternatives but cannot schedule additional paid provider media until the scoped decision allows it.
- titles, captions, descriptions, hashtags, alt text, and thumbnail overlay text must be generated from approved evidence and platform rules, never from raw prompts, hidden planning notes, or private seller/customer data.
- transcript/subtitle source priority must prefer approved voiceover/script and post-render audio alignment over visual prompts or provider prompt text.
- when upstream changes do not affect story/product truth, preserve approved concept/storyboard with a recheck verdict instead of re-planning;
- when upstream changes affect creative brief objective, audience, CTA intent, product identity, selected variant, claim evidence, product images, rights, privacy, brand policy, or distribution profile, replan only the affected concept/storyboard/script/package units.
- media payloads must never treat raw marketplace image URLs, rejected references, failed generated outputs, or creative memory examples as product identity anchors; they must reference the approved product reference asset pack.
- media payloads must never treat raw marketplace screenshots, reviewer/customer/profile images, rejected refs, failed generated people, or vague "same person" wording as character identity anchors; they must reference the approved character identity asset pack or use the fallback plan.
- `concept_story` and `prompt_plan` completion must persist stage completion evidence that references validated Agents output, product-truth QA, policy rule pack, approval/warning refs when applicable, credit usage/reservation refs, and lineage refs.

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
- Creative variation respects the approved advertising policy rule pack and cannot proceed from draft/deprecated/expired rule packs.
- Creative variation respects campaign/batch caps, duplicate detection, brand/seller voice policy, and human review queue decisions.
- Creative planning produces publishable package drafts only when they can pass evidence, platform, brand, privacy, and ad-safety constraints.
- Creative planning can safely reuse or invalidate prior plans after input changes with explicit impact reasoning.
- Creative planning cannot schedule visual provider work unless each product-dependent shot references an approved product reference asset pack.
- Creative planning cannot schedule recurring person/voice provider work unless each identity-dependent shot references an approved or approved-limited character identity asset pack and its fallback rules.
- Creative planning cannot proceed when marketplace evidence instruction firewall blocks or quarantines content that the concept would need as a directive, policy exception, routing instruction, or public claim.
- Creative planning cannot mark planning stages complete from text-only agent output when required QA, policy, credit, and lineage evidence is missing.
