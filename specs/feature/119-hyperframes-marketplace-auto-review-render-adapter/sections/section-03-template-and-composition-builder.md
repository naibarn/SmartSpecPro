# Section 03: Template Registry and Composition Builder

## Goal

Create the template registry and deterministic composition builder that convert approved Marketplace Auto Review state into sanitized HyperFrames composition input.

This section prepares the render adapter without installing or executing HyperFrames yet.

## In Scope

- Built-in template registry.
- Platform profile descriptors.
- Composition input builder.
- Explicit composition modes for storyboard preview, product card explainer, captioned final composite, and template QA snapshots.
- Input hashing and provenance envelope.
- Sanitization of product/user text and media refs.
- Template compatibility tests.
- Template governance, approval, rollback, and emergency disable behavior.

## Files To Create

- `apps/web/server/services/hyperframesTemplateRegistry.ts`
- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/services/hyperframesCompositionSanitizer.ts`
- `apps/web/server/services/__tests__/hyperframesTemplateRegistry.test.ts`
- `apps/web/server/services/__tests__/hyperframesCompositionService.test.ts`
- `apps/web/server/services/__tests__/hyperframesCompositionSanitizer.test.ts`

## Existing Files To Review

- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/server/services/productReferenceStoryboardSkillRunner.ts`
- `apps/web/shared/marketplaceAutoReview/`
- `apps/web/shared/storyboardPromptAudio.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/templates.ts`

## Test First

Add failing tests for:

- default template selection per Auto mode and platform profile;
- disabled/unapproved template rejection;
- built-in template IDs and scene requirements are registered exactly;
- template lifecycle transitions enforce draft/active/disabled/archived states;
- material output changes require a template version bump;
- emergency disable blocks new renders but preserves historical Library item metadata;
- deterministic composition input from the same fixture run state;
- composition hash changes when product truth, selected assets, storyboard frames, generated clips, audio/subtitle plan, compliance plan, template version, or platform profile changes;
- `product_card_explainer` rejects non-evidence-backed claims, missing CTA/disclosure policy, and unsupported category copy before final output;
- `captioned_final_composite` rejects missing generated clip refs, transcript/subtitle refs, audio sync refs, final QA, or provenance before Library save;
- `template_qa_snapshot` creates deterministic snapshot inputs without queueing Library save or user-visible final media;
- product title, claims, captions, CTA, and seller text are escaped;
- raw marketplace HTML is rendered as text data, never executable markup;
- unsupported asset types and missing required storyboard shots produce typed blockers;
- composition includes provenance for product, run, stage, template, platform, input hash, and builder version.

## Template Registry Shape

Each built-in template descriptor should include:

- stable `templateId`;
- human-readable name and category;
- `templateVersion`;
- supported launch modes;
- supported composition modes;
- supported render intents: `preview`, `draft`, `final`, `variant`, `snapshot`;
- supported output modes;
- supported platform profiles;
- required asset slots;
- required copy slots;
- duration/fps/resolution limits;
- disclosure/safe-area requirements;
- compatibility schema version;
- enabled/disabled state;
- rollback reason if disabled.
- lifecycle state: `draft`, `active`, `disabled`, or `archived`;
- approval metadata and snapshot fixture refs.

V1 templates should live as descriptors and composition blueprints. Do not add user-editable template authoring in this feature.

## Initial Built-In Templates

| Template ID | Purpose | Required scenes/rules |
|---|---|---|
| `marketplace_storyboard_motion_9x9_v1` | animate 7-9 storyboard frames with product truth captions | product hero, pain point, solution, proof/detail, usage/result, expectation guard, CTA; preserve 9-shot order when available and avoid fake filler for 7-shot inputs |
| `marketplace_product_card_explainer_9_16_v1` | deterministic product promo from product images and evidence-backed copy | hook/title, gallery motion, evidence-backed benefits, spec/price/rating card with volatility labels, detail/usage, disclosure/warning, CTA |
| `marketplace_captioned_final_composite_9_16_v1` | compose generated clips with captions, overlays, intro/outro, disclosures, CTA, and audio | generated clips as video layers, approved transcript captions, safe-area overlays, required synthetic/affiliate/material-connection disclosures |
| `marketplace_social_variant_square_v1` | square variant for feed posts or Library reuse | reframe without cropping identity-critical regions, larger captions, fewer text badges |

## Template Governance

Every active template must define:

- template key and semantic version;
- supported composition modes and platform profiles;
- required props schema and asset count limits;
- text length limits and supported fonts;
- safe-area behavior and expected duration range;
- snapshot test fixture;
- QA checklist;
- approval metadata.

Lifecycle rules:

- `draft`: visible only to tests/operator tooling, never user-selectable.
- `active`: available to auto plan when feature access permits it.
- `disabled`: blocks new renders and replay, but historical Library metadata remains valid.
- `archived`: unavailable for new work and retained only for provenance.

Activation requires schema tests, fixture render, golden snapshot approval, security review, and rollback metadata. Material output changes must bump the template version.

## Platform Profiles

Define these versioned platform presets from the spec:

| Preset ID | Size | MVP state | Required policy |
|---|---:|---|---|
| `generic_vertical_9_16` | 1080x1920 | enabled first | internal preview safe areas, optional thumbnail |
| `tiktok_reels_shorts_9_16` | 1080x1920 | allowlist after evidence | top/bottom UI avoidance, disclosure visible at least 3s when required, thumbnail required for publishable package |
| `instagram_feed_square_1_1` | 1080x1080 | defined but disabled in first rollout | bottom captions, max 2 lines, social thumbnail required when saved as variant |
| `youtube_landscape_16_9` | 1920x1080 | defined but disabled in first rollout | landscape caption line length, lower-third/end-card disclosures |

Every preset must include:

- `platformPresetVersion`;
- width, height, fps, duration, max duration;
- safe-area bounds;
- subtitle placement and avoid zones;
- disclosure placement and minimum visible seconds;
- thumbnail policy;
- `publishableCandidate`;
- final QA requirements for publishable-candidate outputs.

The plan service may choose one automatically. UI advanced overrides can display alternatives only after Auto plan is resolved.

## Composition Modes

Support these modes as first-class builder outputs:

| Mode | Input emphasis | Output behavior |
|---|---|---|
| `storyboard_motion_preview` | product truth, 7-9 shot storyboard, product images, storyboard frames, caption beats | preview or MP4 motion preview attached to Auto Review timeline and Storyboard Review |
| `product_card_explainer` | product images, evidence-backed claims, price/spec/rating signals, CTA, disclosure policy | 15-45s low-cost product explainer, final save only after QA/review policy allows |
| `captioned_final_composite` | generated clips, approved audio/TTS, transcript/subtitles, overlays, CTA, disclosures | final composited MP4 or platform variant with Library provenance |
| `template_qa_snapshot` | template, fixture product, platform profile | key-frame snapshots for CI/golden-frame QA, not durable Library media |

Product Card Explainer and Captioned Final Composite can remain disabled by rollout flags, but their contracts, template compatibility, fixture coverage, and Library metadata must be implemented so future rollout is not a schema rewrite.

## Composition Builder Responsibilities

Build `HyperframesCompositionInput` from:

- product truth;
- selected product media;
- storyboard frame plan;
- generated clips if available;
- caption/subtitle plan;
- audio sync strategy;
- CTA and disclosure rules;
- compliance warnings;
- template props;
- platform profile;
- provenance envelope.

The builder must not fetch remote URLs directly. It should use trusted asset refs that later go through asset staging.

## Sanitization Rules

- Escape all product/user text before template props are emitted.
- Strip or encode HTML tags.
- Remove script/style/event handler content.
- Normalize whitespace and length-limit fields used in captions and overlays.
- Reject unsupported URL schemes.
- Redact secrets and signed query strings from diagnostics.

## Acceptance Criteria

- Registry returns only enabled templates compatible with requested mode/profile.
- Platform presets match the spec IDs, carry versions, and enforce safe-area/subtitle/disclosure/thumbnail policy.
- Composition modes B/C/D are represented in builder tests and template compatibility, even if only Storyboard Motion Preview is initially enabled.
- Composition builder is deterministic and hashable.
- Sanitizer tests cover XSS and raw HTML cases.
- No HyperFrames runtime import is required.
- Later asset staging and render sections can consume the composition input without extra product lookup.

## Rollback Notes

Disable templates in the registry or disable global feature flags. No existing Marketplace Auto Review rendering should depend on this section.

## UI/UX Contract

### Target User / JTBD

Users should receive a backend-selected template/platform automatically, with optional advanced details only after the auto plan exists.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | displays selected template/platform summary and optional overrides |
| Storyboard Review | displays preview generated from composition input |
| MediaStudio | receives provenance and fallback metadata |
| Library | stores template/platform metadata for completed videos |

### Component Map

| Component | Contract dependency |
|---|---|
| Auto plan summary | selected template and platform profile |
| Advanced overrides | compatible template/profile list |
| Snapshot comparison | composition snapshot refs |
| Library source badge | template/platform metadata |

### State Matrix

| State | Expected UI behavior |
|---|---|
| template selected | show concise auto summary |
| template disabled | show blocker and Standard fallback |
| incompatible profile | show reset-to-auto or alternate auto plan |
| sanitized text | render as safe text only |
| stale composition | require regenerate/retry |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | template/platform labels remain short |
| tablet | advanced details collapse cleanly |
| desktop | template metadata can be inspected without cluttering primary CTA |

### Accessibility Acceptance

Template and platform summaries need accessible names and must not depend on color alone to show warnings or incompatibility.

### Copy Contract

Template labels, disabled reasons, and compatibility warnings come from registry/status copy, not hard-coded page text.

### Browser Evidence Required

Product Detail and Storyboard Review must show selected, disabled, incompatible, and stale-composition cases without layout breakage.
