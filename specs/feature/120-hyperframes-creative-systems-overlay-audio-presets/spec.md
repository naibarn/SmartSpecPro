# Feature 120: HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets

Version: 1.0.0
Date: 2026-06-12
Status: Proposed
Depends-on:
- Feature 113 Marketplace Capture Extension
- Feature 117 Production Director Agents SDK Auto Storyboard And Video
- Feature 118 Marketplace Auto Review Create Storyboard And Video Review Auto
- Feature 119 HyperFrames Marketplace Auto Review Render Adapter
- Existing Storyboard Review, Video Editor, Media Library, media job, storage, tenant access, and Marketplace product evidence systems
External references:
- HyperFrames README: https://github.com/heygen-com/hyperframes/blob/main/README.md
- HyperFrames Prompt Guide: https://github.com/heygen-com/hyperframes/blob/main/docs/guides/prompting.mdx
- HyperFrames Data Attributes: https://github.com/heygen-com/hyperframes/blob/main/docs/concepts/data-attributes.mdx
- HyperFrames Variables: https://github.com/heygen-com/hyperframes/blob/main/docs/concepts/variables.mdx
- HyperFrames GSAP Animation: https://github.com/heygen-com/hyperframes/blob/main/docs/guides/gsap-animation.mdx
- HyperFrames Pipeline: https://github.com/heygen-com/hyperframes/blob/main/docs/guides/pipeline.mdx
- Local research: HyperFrames Text Overlay Preset Library, 2026-06-12
- Local research: HyperFrames Audio + SFX Preset Library, 2026-06-12
Audience: Marketplace Capture, Marketplace Auto Review, Storyboard Review, Media Studio, Video Editor, Render Workers, Security, QA, Product, Design

---

## 1. Executive Summary

Feature 119 introduced HyperFrames as a deterministic render adapter. Feature 120 turns that adapter into a reusable creative system for commercial product videos.

The goal is to support rich, inspectable, and editable:

- motion typography overlays
- subtitle styles
- Thai-compatible fonts
- CSS/GSAP-driven animation
- audio beds
- sound effects
- audio event maps
- user review before final render
- editable full HyperFrames render prompts generated from product truth,
  storyboard structure, overlay copy, subtitle/audio policy, and render timing
- deterministic preview and final MP4 output

The system must not treat HyperFrames as a prompt-only renderer. HyperFrames is strongest when an agent or template author uses complete prompts to create deterministic HTML/CSS/GSAP compositions, and the render engine then renders those structured compositions. Therefore SmartSpecPro should store prompt intent, preset identity, variables, generated composition input, staged assets, QA results, and output artifacts separately. User-facing render prompts must be complete product-video instructions, not short style briefs: they include product context, headline/subheadline, feature callouts, price/trust text when available, storytelling beats, animation timing, subtitle/audio policy, and export requirements.

Target workflow:

```text
Captured marketplace product
  -> product truth, approved storyboard, generated clips, subtitles, audio intent
  -> creative preset selection and auto plan
  -> editable overlay/subtitle/audio variables and full HyperFrames render prompt
  -> browser preview / snapshot preview
  -> HyperFrames render through producer or approved fallback
  -> playable MP4, download link, media history entry, provenance manifest
```

This feature upgrades HyperFrames from a render button into a controlled production layer that can evolve as HyperFrames adds new components, catalog blocks, player features, Studio editing, producer APIs, and audio tooling.

---

## 2. Problem Statement

Recent Storyboard Review iterations showed these product gaps:

- overlay text may be missing from final MP4 when UI preview and render payload diverge;
- top text may clip, overflow, or appear as a plain subtitle instead of meaningful product/spec copy;
- subtitle styling needs independent presets from overlay styling;
- audio may disappear or be mixed incorrectly if final composition does not preserve native clip audio or separate audio tracks;
- users need to inspect and edit text before paid or long-running final render;
- users need to inspect and edit the exact full HyperFrames prompt before final render, and the JSON payload preview must embed the same prompt string;
- deterministic hook/spec extraction may be insufficient for premium ecommerce storytelling, so the system needs a dedicated `hyperframes-render-prompt` skill for LLM-assisted prompt authoring when a product requires deeper analysis;
- SFX and music need timing rules rather than random attachment;
- current fallback FFmpeg ASS rendering can handle basic text, but cannot represent the full CSS/GSAP capabilities that users expect from HyperFrames;
- preset options should be governed and versioned instead of scattered across UI dropdowns, worker conditionals, schema enums, and CSS snippets.

The system needs a single source of truth for creative presets and render variables. Fallbacks should be explicit adapter choices, not hidden data-guessing paths that mask wrong IDs or wrong product provenance.

---

## 3. HyperFrames Interpretation

As of the HyperFrames repo reviewed on 2026-06-12:

- HyperFrames renders deterministic videos from HTML, CSS, media, and seekable animation.
- Compositions use `data-composition-id`, dimensions, timed `class="clip"` elements, `data-start`, `data-duration`, and `data-track-index`.
- Media supports `data-media-start`, `data-volume`, and audio/video metadata.
- GSAP timelines must be paused and registered on `window.__timelines` with the composition id.
- Variables can parameterize text, colors, media URLs, duration values, booleans, and enums.
- Prompting is an authoring workflow. English prompts guide agents to create or modify composition files. The final renderer still consumes validated HTML/composition artifacts.
- Audio should be represented as `<audio>` elements with deterministic timing and volume, not JavaScript `play()` calls.

SmartSpecPro interpretation:

- English prompt text is stored in preset metadata and render manifests for traceability.
- Preset id plus version plus variables are the source of truth for app behavior.
- Generated composition HTML is an artifact derived from those inputs.
- The render worker must never rely on a vague prompt at render time without validated composition output.

---

## 4. Goals

### 4.1 Primary Goals

1. Create a versioned creative preset registry for overlay, subtitle, music, SFX, transition, and audio pack presets.
2. Let users inspect and edit all render-facing text before final render.
3. Support English HyperFrames prompt packs as first-class preset metadata.
4. Support full HTML/CSS/GSAP preview for selected presets before final render.
5. Support Thai fonts and mobile-safe layout for all text presets.
6. Support audio event maps with music, VO, transition SFX, UI SFX, accent SFX, and ambience tracks.
7. Keep final render deterministic and reproducible through composition hashes and manifests.
8. Preserve native audio or approved voiceover/audio tracks during final composite unless the user explicitly disables them.
9. Save final output to Media Library / media history with playable video, download link, manifest, and provenance.
10. Provide a long-term adapter design that can adopt new HyperFrames catalog components and producer APIs without rewriting Storyboard Review.

### 4.2 Secondary Goals

1. Add product-category-aware default presets.
2. Add electronics/spec-focused overlays for phones, tablets, cameras, notebooks, and gadgets.
3. Add ecommerce price/deal overlays for affiliate and marketplace content.
4. Add social proof/review overlays.
5. Add global subtitle presets such as classic box, karaoke word highlight, highlight sweep, creator pop, and cinematic wide.
6. Add audio packs for ecommerce, tutorial, AI/tech, premium product, mother & baby, and sales proof videos.
7. Add QA checks for text overflow, safe area, audio presence, audio clipping, missing assets, and exact duration.

### 4.3 Non-Goals

This feature must not:

- make arbitrary tenant-authored HTML executable in production;
- use server-side marketplace crawling to enrich product data;
- bypass Marketplace Capture product provenance;
- let LLM-generated text make unsupported product claims;
- make FFmpeg ASS fallback the permanent source for high-fidelity HyperFrames visuals;
- require users to configure advanced presets for the normal happy path.

---

## 5. Creative System Model

Feature 120 defines a creative system with four layers:

```text
Layer 1: Main media
  generated clips, uploaded clips, product images, background media

Layer 2: Motion typography overlays
  hook, product name, spec stack, feature cards, price badges, CTA, social proof

Layer 3: Captions and subtitles
  voiceover subtitles, karaoke word highlights, lower-third captions, accessibility captions

Layer 4: Audio design
  voiceover, music bed, transitions, UI sounds, accent sounds, ambience
```

Each layer must be independently configurable but previewed together.

---

## 6. Preset Registry

### 6.1 Registry Ownership

Create a shared registry that can be imported by client UI, server schema validation, composition builder, worker, tests, and documentation.

Recommended location:

```text
apps/web/shared/hyperframes/creativePresets.ts
```

The registry should not live only in `StoryboardReviewPage.tsx` or only in the worker.

### 6.2 Preset Identity

Preset ids should follow the HyperFrames-compatible naming convention:

```text
hf_text_[category]_[style]_[usecase]_v1
hf_subtitle_[style]_[usecase]_v1
hf_audio_music_[mood]_[usecase]_v1
hf_audio_sfx_[type]_[usecase]_v1
hf_audio_pack_[mood]_[usecase]_v1
```

Backward-compatible aliases may map current UI ids to new ids:

```text
kinetic_bold_hook -> hf_text_hook_kinetic_slam_ecommerce_v1
price_impact -> hf_text_price_badge_pop_ecommerce_v1
clean_subtitle -> hf_text_none_subtitle_only_v1
```

Aliases must be explicit and tested. Avoid data fallback that guesses product/run/project identity.

### 6.3 Registry Shape

```ts
type HyperframesCreativePreset = {
  id: string;
  version: number;
  category:
    | "overlay"
    | "subtitle"
    | "music"
    | "sfx"
    | "audio_pack"
    | "transition";
  labelTh: string;
  labelEn: string;
  descriptionTh: string;
  useCases: string[];
  productCategories: string[];
  defaultFor?: string[];
  hyperframesPromptEn: string;
  requiredHyperframesComponents?: string[];
  variables: HyperframesPresetVariable[];
  timing: HyperframesPresetTimingPolicy;
  safeArea: HyperframesPresetSafeAreaPolicy;
  previewAdapter: "html_gsap" | "css_static" | "audio_event_map";
  renderAdapter: "hyperframes_producer" | "ffmpeg_ass_fallback" | "audio_mix_fallback";
  fallbackQuality: "full" | "partial" | "not_supported";
  qaChecklist: string[];
  status: "draft" | "candidate" | "active" | "disabled" | "archived";
};
```

### 6.4 Preset Lifecycle

Preset lifecycle:

- `draft`: maintainer-only, visible in docs but not normal UI
- `candidate`: available for internal QA and snapshots
- `active`: selectable by users
- `disabled`: hidden from new renders but historical outputs remain playable
- `archived`: retained for provenance only

Every visual or audio output-changing edit must bump the preset version.

---

## 7. Overlay Preset Library

### 7.1 Starter Active Overlay Presets

Initial overlay registry should include:

| Preset ID | Purpose | Best For |
| --- | --- | --- |
| `hf_text_hook_kinetic_slam_ecommerce_v1` | large hook text with staggered kinetic entrance | ecommerce hooks, social ads |
| `hf_text_title_gradient_product_pop_v1` | gradient benefit title with elastic entrance | product benefit moments |
| `hf_text_spec_electronics_stack_v1` | stacked spec cards | phone, tablet, camera, notebook |
| `hf_text_price_badge_pop_ecommerce_v1` | price/deal badge | marketplace price, promo |
| `hf_text_price_particle_burst_deal_v1` | deal moment with burst | flash sale |
| `hf_text_social_review_card_v1` | review/social proof card | UGC, rating proof |
| `hf_text_lower_third_creator_v1` | creator name/category strip | presenter/review clips |
| `hf_text_marker_highlight_sweep_v1` | marker highlight on key phrase | explainer/product proof |
| `hf_text_title_texture_mask_premium_v1` | large material/texture title | premium product |
| `hf_text_title_parallax_behind_product_v1` | depth text behind product | product hero |
| `hf_text_title_blend_difference_auto_contrast_v1` | auto-contrast title | moving background |
| `hf_text_title_morph_word_chain_v1` | problem-to-solution word morph | transformation story |
| `hf_text_caption_emoji_pop_family_v1` | friendly emoji accents | mother & baby |
| `hf_text_process_website_scan_label_v1` | small process label | SaaS/AI workflow |
| `hf_text_cta_terminal_command_v1` | terminal CTA | developer tools |
| `hf_text_hook_comic_hype_word_v1` | sticker/comic hype word | viral moment |

### 7.2 Electronics Spec Overlay Requirements

For electronics products, the overlay system should extract and present product details such as:

- display size/type/refresh rate/brightness
- RAM/ROM/storage
- chipset/CPU/GPU
- battery capacity and charging
- camera resolution/sensor/zoom
- connectivity such as 5G, Wi-Fi, Bluetooth, SIM
- water/dust resistance
- price and installment/promo if evidence-backed

Rules:

- Do not invent specs.
- If evidence is weak, show only confirmed facts or omit the spec.
- Long Thai text must be converted into short spec chips.
- Spec overlays should use multiple text scales, not one subtitle-sized line.
- Price overlays should be the strongest visual moment only when price is present and current enough.

### 7.3 Overlay Prompt Handling

Each overlay preset stores an English prompt pack. Example:

```text
Using /hyperframes, create a kinetic ecommerce hook overlay.

Preset:
- Use large Thai-compatible headline text.
- Break the hook into 2-4 short beats.
- Animate words with scale-pop, slide-in, and staggered reveal.
- Keep text inside 9:16 safe margins.
- Use Prompt, Kanit, or Noto Sans Thai.
- Do not cover product, face, hands, price, or subtitles.
- Register GSAP timeline on window.__timelines.
```

The prompt is used for:

- agent-authored template generation;
- documentation and maintainers;
- future HyperFrames Studio/agent integration;
- render manifest traceability.

The prompt is not used as the only runtime render input.

---

## 8. Subtitle Preset Library

Subtitle presets are independent from overlay presets.

Initial active subtitle presets:

| Preset ID | Purpose | Notes |
| --- | --- | --- |
| `hf_subtitle_classic_box_v1` | stable readable box | default fallback |
| `hf_subtitle_minimal_shadow_v1` | clean shadow-only style | product-focused video |
| `hf_subtitle_creator_pop_v1` | bouncy social caption | creator/UGC |
| `hf_subtitle_karaoke_word_highlight_v1` | active word highlight | voiceover with timing |
| `hf_subtitle_tiktok_red_sweep_v1` | red sweep active word | TikTok/Reels style |
| `hf_subtitle_pill_karaoke_v1` | active word in pill | social short |
| `hf_subtitle_marker_highlight_sweep_v1` | highlight key phrase | explainer |
| `hf_subtitle_lower_third_v1` | lower third caption | presenter clips |
| `hf_subtitle_cinematic_wide_v1` | wide cinematic subtitle | premium/review |
| `hf_subtitle_neon_glow_v1` | tech/gaming glow subtitle | AI/tech |
| `hf_subtitle_review_bubble_v1` | bubble/comment caption | social proof |
| `hf_subtitle_none_v1` | no burned subtitle | native audio only |

Subtitle rules:

- one to two lines max;
- keep inside bottom safe area;
- avoid presenter mouth, product, price, and CTA;
- Thai-compatible font only;
- karaoke/word highlight requires word-level or phrase-level timing;
- if only phrase timing is available, degrade to phrase highlight, not fake word sync;
- burn-in subtitle is configurable independently from overlay.

---

## 9. Audio And SFX Preset Library

### 9.1 Audio Track Roles

Feature 120 standardizes these audio roles:

| Track Role | Purpose | Examples |
| --- | --- | --- |
| `voiceover` | narration or presenter audio | generated TTS, native clip audio |
| `music` | background bed | lofi, ecommerce pop, premium pad |
| `transition_sfx` | scene changes | whoosh, whip, swoosh |
| `ui_sfx` | interface interactions | click, tap, keyboard, enter |
| `accent_sfx` | proof/reveal/deal | cash register, chime, riser, impact |
| `ambience` | scene texture | room tone, cafe, beach, soft hum |

### 9.2 Music Presets

Initial music presets:

| Preset ID | Best For |
| --- | --- |
| `hf_audio_music_tense_cinematic_opener_v1` | product launch, AI reveal |
| `hf_audio_music_lofi_tutorial_bed_v1` | tutorial, SaaS, how-to |
| `hf_audio_music_upbeat_ecommerce_social_v1` | TikTok Shop, Shopee, Lazada, affiliate |
| `hf_audio_music_premium_luxury_minimal_v1` | skincare, home decor, fashion |
| `hf_audio_music_warm_mother_baby_v1` | baby/family products |
| `hf_audio_music_ai_tech_momentum_v1` | AI news, developer tool, SaaS launch |

### 9.3 SFX Presets

Initial SFX presets:

| Preset ID | Visual Trigger |
| --- | --- |
| `hf_audio_sfx_whoosh_scene_transition_v1` | major scene transition |
| `hf_audio_sfx_button_click_tap_v1` | button depress or CTA click |
| `hf_audio_sfx_notification_message_pop_v1` | card/message materializes |
| `hf_audio_sfx_cash_register_sales_moment_v1` | price/sales number locks |
| `hf_audio_sfx_riser_impact_reveal_v1` | main product/feature reveal |
| `hf_audio_sfx_extraction_ping_data_detect_v1` | detected/extracted element |
| `hf_audio_sfx_keyboard_typing_loop_v1` | terminal/prompt typing |
| `hf_audio_sfx_soft_shutter_capture_pulse_v1` | frame/product shot locks |
| `hf_audio_sfx_completion_chime_v1` | checkmark/final CTA |
| `hf_audio_sfx_error_warning_buzz_v1` | problem/warning moment |

### 9.4 Audio Packs

Audio packs combine music and SFX policies:

| Pack ID | Includes |
| --- | --- |
| `hf_audio_pack_ecommerce_fast_cut_v1` | upbeat music, whoosh, cash, notification, CTA click |
| `hf_audio_pack_tutorial_calm_v1` | lofi music, soft clicks, completion chime |
| `hf_audio_pack_ai_tech_launch_v1` | tech pulse, matrix blips, typing, riser, digital hit |
| `hf_audio_pack_premium_product_luxury_v1` | warm pad, soft whoosh, glass chime, shutter |
| `hf_audio_pack_mother_baby_friendly_v1` | gentle music, warm bell, soft pop |
| `hf_audio_pack_sales_revenue_proof_v1` | confident groove, count ticks, cash/register, proof chime |

### 9.5 Audio Event Map

Every final composite should be able to carry an audio event map:

```ts
type HyperframesAudioEvent = {
  id: string;
  role: "voiceover" | "music" | "transition_sfx" | "ui_sfx" | "accent_sfx" | "ambience";
  presetId?: string;
  visualTrigger:
    | "video_start"
    | "scene_cut"
    | "text_appears"
    | "card_materializes"
    | "button_depress"
    | "price_badge_pop"
    | "sales_number_lock"
    | "product_reveal"
    | "cta_lock"
    | "manual";
  startSec: number;
  durationSec?: number;
  mediaStartSec?: number;
  volume: number;
  assetRef: string;
  notes?: string;
};
```

Rules:

- every SFX must have a visual trigger;
- whoosh starts 100-180ms before a cut and peaks at the cut;
- click fires on depressed state;
- notification fires when card materializes;
- cash register fires when price/sales locks, not at sentence start;
- riser starts 0.5-1.2s before reveal and impact lands on reveal;
- music ducks under voiceover;
- avoid excessive repeated SFX;
- do not manually play/pause/seek audio with JavaScript.

### 9.6 Volume Defaults

Recommended `data-volume` defaults:

| Role | Default |
| --- | ---: |
| Voiceover | 0.90 |
| Music under VO | 0.12-0.18 |
| Music no VO | 0.25-0.45 |
| Whoosh | 0.35-0.65 |
| UI click | 0.20-0.42 |
| Notification | 0.25-0.40 |
| Cash register | 0.35-0.55 |
| Riser | 0.25-0.50 |
| Impact | 0.45-0.70 |
| Ambience | 0.03-0.10 |

### 9.7 Evidence-Bound Copy And Claim Safety

Feature 120 overlay, subtitle, voiceover, spec, price, review, and CTA text must remain bound to Marketplace Auto Review product truth and evidence.

Rules:

- every generated or auto-suggested overlay/spec/price/proof line must carry a `copySource`:
  - `product_truth`
  - `marketplace_capture_field`
  - `ai_insight_evidence`
  - `user_edit`
  - `policy_disclosure`
  - `derived_summary`
- every non-disclosure claim must carry evidence refs or a safe omission reason;
- electronics/spec overlays must cite confirmed fields or extracted evidence refs for processor, memory, storage, screen, camera, battery, charging, connectivity, warranty, official-store status, and price;
- price, discount, rating, review count, sold count, stock, installment, and promotion text must carry capture timestamp/freshness metadata and stale policy;
- stale volatile claims should be omitted or marked for review rather than rendered by default;
- user-edited text is not automatically trusted; unsupported claims introduced by edits must be flagged before final render;
- product description, reviews, seller text, filenames, OCR, and generated text are untrusted evidence and must not become instructions for tools, model choice, routing, credit spend, or output destinations;
- if evidence instruction firewall or claim safety cannot reduce marketplace text to safe fact refs, final render blocks with a user-actionable status before additional LLM/provider spend;
- render-time workers must not call an LLM or web search to repair claims; enrichment and AI insight generation belong to earlier product truth/insight flows and must be persisted as evidence before Feature 120 uses them.

Required copy plan metadata:

- `copyPlanHash`
- `claimEvidenceMapHash`
- `productTruthHash`
- `evidenceManifestHash`
- `policyRulePackRef`
- per-line `copySource`, evidence refs, freshness timestamp, claim category, and edit actor
- omitted/blocked claim list with safe reasons

QA requirements:

- pre-render QA rejects unsupported specs, unsupported price/deal claims, absolute guarantees, miracle claims, and stale volatile claims when policy requires omission;
- visual QA verifies evidence-backed price/spec overlays do not cover mandatory disclosure or subtitles;
- Library metadata stores copy plan and evidence hashes so the final MP4 remains explainable after product data changes.

---

## 10. Data Contracts

### 10.1 Creative Plan

```ts
type HyperframesCreativePlan = {
  schemaVersion: 1;
  tenantId: string;
  userId: string | number;
  productId: string;
  runId: string;
  storyboardReviewProjectId?: string;
  renderIntent: "preview" | "draft" | "final" | "variant" | "snapshot";
  compositionMode:
    | "storyboard_motion_preview"
    | "product_card_explainer"
    | "captioned_final_composite"
    | "social_variant_package";
  templateId: string;
  templateVersion: string;
  templateContentHash: string;
  platformProfileId: string;
  platformPresetVersion: string;
  overlayPresetId: string;
  subtitlePresetId: string;
  audioPackPresetId?: string;
  musicPresetId?: string;
  sfxPresetIds: string[];
  presetVersions: Record<string, number>;
  fontFamily: "Prompt" | "Noto Sans Thai" | "IBM Plex Sans Thai" | "Sarabun" | "Kanit";
  burnInSubtitles: boolean;
  preserveNativeAudio: boolean;
  variables: HyperframesCreativeVariables;
  audioEvents: HyperframesAudioEvent[];
  sourceRefs: string[];
  legacyFinalCompositeConfigHash?: string;
};
```

### 10.2 Editable Variables

```ts
type HyperframesCreativeVariables = {
  hookText?: string;
  supportingText?: string;
  productName?: string;
  priceText?: string;
  originalPriceText?: string;
  promotionText?: string;
  ctaText?: string;
  trustText?: string;
  specLines?: string[];
  benefitLines?: string[];
  reviewQuote?: string;
  subtitleCues?: Array<{
    startSec: number;
    endSec: number;
    text: string;
  }>;
  perShotText?: Array<{
    shotId: string;
    overlayPresetId?: string;
    animationPreset?: "smooth_reveal" | "slide_pop" | "bounce_price" | "floating_product" | "glow_feature" | "fade_clean";
    transition?: "fade" | "slide" | "zoom" | "whip" | "none";
    overlayText?: string;
    subtitleText?: string;
    voiceoverText?: string;
  }>;
  sfxTimelineDrafts?: Array<{
    id: string;
    presetId: string;
    target: "all" | "first" | "last" | string;
    visualTrigger: string;
    offsetSec: number;
    durationSec: number;
    volume: number;
    role: string;
  }>;
};
```

All user-editable fields must be persisted before render and included in idempotency/hash inputs. Global hook/supporting copy is only the first-shot/default copy layer; final composite editing must keep per-shot overlay/subtitle/style available so the rendered video can follow each shot's voiceover/storytelling instead of repeating the same two text strings.

### 10.3 Render Manifest

Every output must produce a manifest:

```ts
type HyperframesCreativeRenderManifest = {
  renderJobId: string;
  tenantId: string;
  userId: string | number;
  productId: string;
  runId: string;
  storyboardReviewProjectId?: string;
  renderIntent: "preview" | "draft" | "final" | "variant" | "snapshot";
  compositionMode: HyperframesCreativePlan["compositionMode"];
  templateId: string;
  templateVersion: string;
  templateContentHash: string;
  platformPresetId: string;
  platformPresetVersion: string;
  presetIds: string[];
  presetVersions: Record<string, number>;
  creativePlanHash: string;
  compositionInputHash: string;
  compositionHtmlHash: string;
  outputHash?: string;
  mediaInputHashes: Record<string, string>;
  audioEventMapHash?: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasNativeAudio: boolean;
  audioPolicy: {
    preserveNativeAudio: boolean;
    burnInSubtitles: boolean;
    musicEnabled: boolean;
    sfxEnabled: boolean;
  };
  outputStorageKey: string;
  outputUrl?: string;
  libraryItemId?: string | number | null;
  featureAccessSnapshotHash?: string;
  creditRefs?: {
    compositionEstimateRef?: string;
    compositionReservationRef?: string;
    compositionChargeRef?: string;
    compositionRefundRef?: string;
    noChargeReason?: string;
  };
  fallbackQuality: "full" | "partial" | "not_supported";
  qa: HyperframesCreativeQaResult;
};
```

### 10.4 Library Finalize Metadata

Feature 120 must extend the existing Feature 119 Library finalize contract rather than inventing a parallel media source.

Existing source:

```text
marketplace_auto_review_hyperframes_render
```

Required idempotency key:

```text
hyperframes-library:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{outputHash}
```

Creative metadata added to the existing Library metadata envelope:

```ts
type HyperframesCreativeLibraryMetadata = HyperframesLibraryFinalizeMetadata & {
  creativePlanHash: string;
  presetIds: string[];
  presetVersions: Record<string, number>;
  overlayPresetId: string;
  subtitlePresetId: string;
  audioPackPresetId?: string;
  musicPresetId?: string;
  sfxPresetIds: string[];
  audioEventMapHash?: string;
  hasAudio: boolean;
  hasNativeAudio: boolean;
  fallbackQuality: "full" | "partial" | "not_supported";
};
```

Rules:

- normal users see Library items as ordinary playable video assets;
- raw composition HTML, signed URLs, storage keys, and worker logs remain hidden;
- duplicate Library saves return the existing item when the idempotency key matches;
- output URL and output hash are required before a render can be marked ready for Library save;
- Media History filtering must use the existing HyperFrames source label and product/run metadata.

### 10.5 Runtime Status Projection

The final composite UI currently reads completed output from `HyperframesRenderStatusProjection.outputRefs`, not directly from the creative manifest. Feature 120 must keep that contract intact.

Required projection behavior:

- `status: "completed"` requires at least one `outputRefs` item with `kind: "final_video"`, a non-empty safe `url`, and `contentHash`;
- `progressPercent` must be `100` only after the playable media probe passes;
- normal-user projection must redact `storageRef`, raw signed URLs, local paths, raw composition HTML, and worker logs;
- open/download buttons should use the safe `outputRefs[].url`;
- Library save uses the paired internal `artifactRefs`/metadata after QA passes, but the normal UI must still have a playable URL;
- if only manifest/storage metadata exists and no playable URL is available, the status must remain blocked/failed/waiting rather than completed;
- `updatedAt` must reflect the most recent worker/projection update, so the UI can show the latest status accurately.

### 10.6 Provenance Binding

Product, run, and Storyboard Review identity must be hard constraints, not fallback hints.

Rules:

- `tenantId`, `productId`, `runId`, and `storyboardReviewProjectId` are carried from the original Marketplace Auto Review handoff through creative plan, render request, outbox payload, manifest, projection, and Library metadata;
- loading a Storyboard Review project must verify that the project belongs to the requested product/run before enabling HyperFrames final composite actions;
- final composite render creation rejects mismatched product/run/storyboard IDs instead of selecting the most recent or visually similar project;
- repaired or migrated legacy projects must either receive explicit verified IDs or be deleted/recreated; do not add fuzzy fallback chains to support corrupted projects;
- user-visible project lists should open by primary project id and verify product/run after load, not by title or timestamp.

### 10.7 Shot Media Assignment Persistence

Storyboard Review lets users choose, replace, import, or drag MP4 assets onto individual shots before final composite render. Those choices must become durable project data before render.

Required persisted data per selected shot:

```ts
type HyperframesShotMediaAssignment = {
  storyboardReviewProjectId: string | number;
  shotId: string;
  shotIndex: number;
  source:
    | "storyboard_generated_clip"
    | "media_library"
    | "history_gallery"
    | "manual_upload"
    | "video_editor_render";
  mediaKind: "video";
  mediaId?: string | number;
  artifactId?: string;
  libraryItemId?: string | number;
  sourceUrl?: string;
  storageRef?: string;
  contentHash?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  assignedByUserId: string | number;
  assignedAt: string;
};
```

Rules:

- drag/drop or replace-media actions must save the assignment through a server API before the UI treats the shot as ready;
- assignments must reload after browser refresh and after reopening the same Storyboard Review project;
- render creation uses persisted assignments or explicitly saved draft assignments, not transient React state alone;
- imported remote URLs must be staged and normalized to managed storage refs before final render;
- assignment identity must include content hash or artifact/library id when available so retries cannot pick a different file with the same URL;
- failed assignment persistence must show a visible error and must not silently render the previous clip;
- deleting a broken legacy project is allowed when provenance cannot be verified, because recreating the project is safer than carrying corrupted IDs forward.

### 10.8 Storyboard Review Storage And Concurrency

Current code stores Storyboard Review workspaces in `media_studio_storyboard_reviews.reviewData`, with explicit columns for user/status/count/thumbnail but not product/run/HyperFrames assignment fields. Feature 120 must account for that storage shape instead of assuming dedicated columns already exist.

Allowed implementation paths:

1. MVP JSON subdocument:
   - store Feature 120 state under `reviewData.hyperframesFinalComposite`;
   - include `schemaVersion`, `canonicalProductId`, `autoReviewRunId`, `storyboardReviewProjectId`, `revision`, `updatedAt`, `shotMediaAssignments`, `textVariables`, `creativePlanHash`, and latest render job refs;
   - run the existing canonical-link normalization before accepting updates;
   - verify the normalized Auto Review run product matches the requested product;
   - update only the scoped `hyperframesFinalComposite` subdocument when saving assignments or text edits.
2. Companion table:
   - add a dedicated table when assignment locking, filtering, audit history, or high-write concurrency becomes necessary;
   - required key shape: `(tenantId, userId, storyboardReviewProjectId, productId, runId)`;
   - assignment rows or JSON must include shot id/index, media refs, content hash, revision, assigned actor, and timestamps;
   - keep `reviewData` as the user-facing review document and the companion table as HyperFrames state.

Concurrency rules:

- saving shot assignments must not overwrite unrelated Storyboard Review edits;
- saving Storyboard Review edits must not drop existing HyperFrames assignments/render refs;
- server updates must use either row `updatedAt` comparison, scoped JSON merge, or explicit `revision` checks;
- stale writes return a conflict response with reload guidance instead of last-write-wins;
- project list and open-by-id routes may read product/run from normalized `reviewData`, but render creation must re-verify against `marketplace_auto_review_runs`;
- extension/project picker summaries should expose product/run badges when available so duplicate titles do not cause the user to open the wrong project.

### 10.8.1 Storage Promotion And Migration Discipline

Feature 120 may start with scoped JSON storage, but any move to a companion table or explicit columns must follow a migration plan rather than ad hoc reads from multiple possible paths.

Promotion triggers:

- shot media assignment writes become frequent enough that whole `reviewData` saves create conflicts;
- querying by `productId`, `autoReviewRunId`, `storyboardReviewProjectId`, `renderJobId`, or `creativePlanHash` becomes required for correctness or support;
- operator cleanup needs row-level locking, audit history, or dry-run counts for HyperFrames final composite state;
- JSON merge logic becomes too risky to prove with tests;
- corrupted legacy data cannot be reliably isolated with scoped JSON state.

If promoted, add a dedicated migration sub-plan:

1. schema proposal with tenant/user/product/run/storyboard foreign-key strategy and unique indexes;
2. dry-run SQL/report that classifies existing Storyboard Review rows as backfillable, repairable, delete-only, or unrelated;
3. backfill script that only writes rows when `normalizeStoryboardReviewCanonicalLinks` style validation can prove product/run/storyboard ownership;
4. dual-read phase where server projections prefer the companion table but compare against JSON and emit drift diagnostics;
5. dual-write phase where scoped state APIs write both locations with one revision/hash;
6. cutover flag that makes the companion table authoritative;
7. cleanup phase that removes or ignores JSON mirrors only after drift stays zero for the rollout window;
8. rollback SQL and rollback behavior that restores JSON authority without losing completed render refs.

Index and constraint requirements for a companion table:

- unique active state per `(userId, storyboardReviewProjectId, productId, autoReviewRunId)`;
- indexes for `(userId, updatedAt)`, `(autoReviewRunId)`, `(productId)`, `(renderJobId)`, and `(creativePlanHash)` where supported;
- nullable render refs during draft editing, non-null output refs only after completed projection;
- explicit `revision`, `updatedAt`, `createdAt`, and optional `deletedAt`;
- no lookup by project title, thumbnail, latest row, or visually similar media.

Migration safety rules:

- do not create fallback chains that search many legacy paths until something matches;
- do not auto-repair mismatched product/run/storyboard rows during normal render creation;
- repair and delete-only actions must run through the legacy audit/cleanup procedure;
- completed Library media remains authoritative and must not be deleted by review-state cleanup;
- every migration step must be tenant-scoped and permission-gated.

### 10.9 Feature Access, Credit, And Rollout Gates

Feature 120 must extend the existing Feature 119 access and credit model. Creative presets, audio packs, and producer-only render paths must not create a parallel permission or billing path.

Existing Feature 119 gates to reuse:

- tenant flags:
  - `marketplaceHyperframesEnabled`
  - `marketplaceHyperframesWorkerEnabled`
  - `marketplaceHyperframesLibrarySaveEnabled`
  - `marketplaceHyperframesOperatorEnabled`
- global safety env guards:
  - `MARKETPLACE_HYPERFRAMES_DISABLED`
  - `MARKETPLACE_HYPERFRAMES_ENABLED`
  - `MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED`
  - `MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE`
  - `MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED`
  - `MARKETPLACE_HYPERFRAMES_TEMPLATE_ALLOWLIST`
  - `MARKETPLACE_HYPERFRAMES_RUNTIME_READY`

Rules:

- Storyboard Review must consume the backend-derived HyperFrames feature access projection before enabling preview, final render, Library save, or operator actions;
- creative preset availability must be filtered by the same tenant/user flags, worker readiness, template allowlist, and Library-save permission used by Feature 119;
- global kill switches and tenant feature flags remain authoritative for all Feature 120 controls;
- official-runtime-required presets require worker CLI/producer readiness;
  diagnostic fallback may expose them only as disabled/limited with explicit
  warning and cannot complete final render;
- credit estimate and quota checks must happen before paid final render, variant export, snapshot QA batches, or producer render;
- use the existing HyperFrames credit idempotency shape from Feature 119:
  `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`;
- creative fields such as `creativePlanHash`, `presetManifestHash`, and `audioEventMapHash` are stored in credit metadata and should already affect `compositionInputHash` when they affect output;
- audio/music/SFX packs may increase the worker complexity multiplier but must not be charged through provider image/video generation categories;
- duplicate render/finalize requests with the same idempotency keys must not consume additional free preview quota or charge credits twice;
- UI must show safe no-charge, quota-blocked, credit-required, and duplicate statuses from the backend projection rather than guessing locally.

Projection extension rules:

- do not rename or remove current Feature 119 capability fields such as `canStartAuto`, `canPreview`, `canCancel`, `canSaveToLibrary`, `canInspectAsOperator`, or `canReplayAsOperator`;
- add Feature 120 capability details as additive nested fields, for example `creativeCapabilities`, `presetAvailability`, or `runtimeCapabilities`;
- if a future rollout needs per-preset tenant gates, add them through the shared tenant feature flag model and Admin Tenant Feature Flags UI in the same implementation section, with tests; do not add UI-only toggles or undocumented env-only preset switches;
- tenant feature flags remain the normal rollout control; env vars remain global safety/runtime guards and CI/test overrides;
- admin labels/descriptions for any new flags must be added to the existing `Media Production & HyperFrames` feature flag group.

### 10.10 Legacy Data Audit And Cleanup

Because some existing Storyboard Review rows may already contain mismatched product/run/project data, Feature 120 needs an explicit cleanup path.

Audit should detect:

- `autoReviewRunId` missing from Marketplace-created Storyboard Review projects;
- `reviewData.marketplaceContext.productId` mismatching the linked Auto Review run product;
- mixed Auto Review run IDs across tasks;
- Storyboard Review id not matching `marketplace_auto_review_runs.storyboardReviewId`;
- HyperFrames assignments whose media refs cannot be resolved or no longer belong to the same tenant/user;
- completed render projections without playable `outputRefs`;
- duplicated project titles where multiple rows point to different products/runs.

Cleanup rules:

- run audit in dry-run mode first and produce a sanitized report;
- repair only when the canonical product/run/storyboard linkage can be proven from existing run rows and output projections;
- if a row is corrupted and cannot be proven safe, mark it deleted/archived or delete it according to existing Storyboard Review deletion policy;
- never delete a finalized Library item or Library-owned artifact while deleting a broken review workspace;
- destructive cleanup must be tenant-scoped, permission-gated, and audited;
- normal render creation should fail fast for corrupted rows instead of invoking the cleanup implicitly.

### 10.11 Runtime API Surface

Feature 120 should extend the existing Feature 119 runtime APIs and add only the missing Storyboard Review state APIs. Do not create a parallel HyperFrames-only workspace API.

Existing procedures to reuse:

- `marketplaceCapture.createHyperframesFinalComposite`
- `marketplaceCapture.getHyperframesRenderJob`
- `marketplaceCapture.repairHyperframesRenderJob`
- `marketplaceCapture.cancelHyperframesRenderJob`
- `marketplaceCapture.saveHyperframesRenderToLibrary`
- `marketplaceCapture.listHyperframesTemplates`
- operator procedures from Feature 119 for inspect/replay/template controls

Required additions or schema extensions:

- `marketplaceCapture.listHyperframesCreativePresets`
  - returns overlay, subtitle, audio pack, music, SFX, font, adapter-support, lifecycle, feature-access, and alias metadata from the shared registry;
  - replaces UI-local preset arrays as the source of truth.
- `videoEditorProjects.updateStoryboardReviewHyperframesState`
  - scoped update for `reviewData.hyperframesFinalComposite` or companion-table state;
  - accepts `storyboardReviewProjectId`, `productId`, `runId`, `revision`, changed assignments/text/config only, and expected previous revision;
  - returns updated revision, normalized product/run badges, and conflict state when stale.
- `videoEditorProjects.getStoryboardReview` or equivalent project detail response
  - includes the normalized `hyperframesFinalComposite` subdocument when present;
  - must not require clients to parse arbitrary legacy JSON paths.
- `marketplaceCapture.createHyperframesFinalComposite`
  - must accept `storyboardReviewProjectId`, `expectedStoryboardReviewRevision`, `expectedCreativePlanHash`, and either legacy `config` or target `creativePlan`;
  - validates persisted shot media assignments before importing/staging source MP4s;
  - rejects stale assignments, mismatched product/run/storyboard IDs, unsupported presets, and missing credit/feature access;
  - returns the existing `CreateHyperframesFinalCompositeOutput` shape with safe projection, charge summary, polling, and invalidation keys.

API rules:

- Storyboard Review state mutations belong to the Storyboard Review owner surface; render creation belongs to `marketplaceCapture`;
- every new input/output must have a Zod schema in shared runtime contracts;
- new procedures must be additive and must not remove or weaken existing Feature 119 procedures;
- conflict responses should be typed and user-actionable, not raw `Error` strings;
- cache invalidation must include `videoEditorProjects.getStoryboardReview`, `marketplaceCapture.getHyperframesRenderJob`, Library search, and product/run media panels where applicable;
- E2E mocks and app-router shape tests must include new procedures so route drift is caught early.

### 10.12 Runtime Capability And Version Compatibility

Feature 120 presets must be capability-gated by the same dependency and rollout model created in Feature 119. A preset being present in the registry is not enough to make it selectable or renderable.

Each creative preset must declare runtime support:

- `diagnosticFallbackOnly`: whether the preset has a limited smoke/diagnostic
  representation that must not be treated as production-complete output;
- `hyperframesCli`: whether the preset is supported by the official
  HyperFrames CLI worker path;
- `hyperframesProducer`: whether the preset requires `@hyperframes/producer` or
  producer server;
- `minRuntimeProfile` and `testedRuntimeProfileHash`;
- `minHyperframesVersion` and `testedHyperframesVersion`;
- supported platform profiles and output dimensions;
- unsupported feature list, such as audio-reactive text, word-level karaoke, 3D transforms, or complex masking.

Compatibility rules:

- web/client code must not import `@hyperframes/*`; runtime packages remain worker-only or build-time tooling only;
- presets that require official runtime support remain hidden, disabled, or
  candidate-only when Feature 119 rollout gates report
  `official_runtime_blocked`;
- producer-only presets can become active only after dependency audit, doctor,
  production rollout gate, fixture snapshots, Thai font diagnostics, audio QA,
  canary, and rollback proof pass for the target worker image;
- registry metadata must record the tested Chrome/Playwright, FFmpeg/FFprobe, libass/fontconfig, Node, and HyperFrames package versions;
- upstream HyperFrames updates require re-running dependency audit, doctor, production rollout gate, fixture snapshots, and preset manifest hash approval before active promotion;
- capability projection returned to the UI must be authoritative and include the disabled reason, next action, and safe fallback mode when available;
- a render request using a preset unsupported by the current runtime capability must fail before credit reservation or worker queueing.
- diagnostic fallback output cannot satisfy final-composite completion, Library
  save, credit charging, or "rendered with HyperFrames" user claims.

### 10.13 Contract Versioning And Schema Compatibility

Feature 120 must preserve the existing Feature 119 shared contract version unless a deliberate cross-system migration is planned.

Current contract anchor:

- `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION`
- value: `hyperframes_marketplace_auto_review_v1`

Rules:

- do not change the shared contract version only to add creative presets, audio event maps, or UI controls;
- add Feature 120 schemas as additive fields, nested metadata, or separate creative-plan schemas that can be referenced by existing runtime API outputs;
- existing `HyperframesRenderStatusProjection`, `HyperframesLibraryFinalizeMetadata`, `HyperframesArtifactRef`, `HyperframesOutputRef`, feature access projection, charge summary, polling guidance, and repair action schemas must keep parsing current Feature 119 payloads;
- any new required field in a shared output schema must have a migration strategy or default so old render jobs, Library metadata, and Media History rows remain readable;
- if a contract version bump is unavoidable, implementation must add dual-parse tests, old-to-new projection adapters, migration notes, and rollback behavior before writing V2 rows;
- server and client shared contracts must remain importable without `@hyperframes/*` runtime dependencies.

---

## 11. User Experience

### 11.1 Storyboard Review Placement

The HyperFrames Final Composite panel should remain on Storyboard Review because it composes selected/generated shot videos from that page.

Default state:

- collapsed settings;
- compact status summary;
- visible primary CTA when ready;
- if no completed MP4/video shot exists, the Final Composite controls remain
  minimized by default and the visible status must explain that still images or
  storyboard frames are not valid final-render source video;
- blocked status must show the missing source type, detected completed image
  count, pending/incomplete video count when available, and the next action to
  create or import at least one MP4 shot before rendering;
- changing render-facing options updates local preview state but must mark the
  HyperFrames full render prompt stale instead of rewriting it immediately;
- users should adjust all options first, then explicitly run
  `hyperframes-render-prompt` once to generate a fresh prompt before final
  render;
- if `hyperframes-render-prompt` fails or returns no prompt, the UI must keep
  render blocked and show the skill error. It must not silently fall back to a
  deterministic prompt because that hides skill/config failures and can lower
  prompt quality;
- no large configuration block unless the user expands it.

### 11.2 Required Controls

Expanded settings should show:

- overlay preset
- subtitle preset
- audio pack preset
- music preset
- SFX mode: off / subtle / standard / energetic
- Thai font
- text layer mode
- burn-in subtitles toggle
- preserve native audio toggle
- editable hook/supporting text
- editable per-shot overlay/subtitle/voiceover text
- audio event map editor in advanced mode
- preview button
- render final button

### 11.3 Preview

Users must be able to inspect what will be rendered before final render.

Preview modes:

1. Text preview: shows resolved overlay/subtitle copy and truncation warnings.
2. CSS/GSAP preview: browser preview with actual animation approximation.
3. Audio event preview: timeline list with event triggers, timing, volume, and asset status.

Large secondary previews such as payload JSON, audio event maps, and CSS/GSAP
text preview should be collapsible. They must default to collapsed when the
feature is not render-ready so incomplete functionality does not interrupt the
main Storyboard Review workflow.
4. Snapshot preview: captures key frames before final MP4 when render worker supports it.

Preview must use the same preset ids and variables as final render.

### 11.4 Final Output

On completion, the page must show:

- open video button;
- download MP4 button;
- media history/library link;
- render job id;
- duration;
- has-audio status;
- manifest/QA summary;
- retry/render again option if failed.

Completed without output URL is not an acceptable successful state.

### 11.5 Refresh And Resume Behavior

Final composite work must survive navigation and refresh.

Required behavior:

- when render creation returns a `renderJobId`, the UI stores or routes with that id and invalidates/refetches the server projection;
- after refresh, Storyboard Review loads the render by `renderJobId` plus product/run verification and restores status, progress, output links, and Library-save availability;
- active jobs poll according to `HyperframesRenderStatusProjection.polling`;
- terminal jobs stop polling but still show open/download/Library actions when `outputRefs` are present;
- local mutation state may improve responsiveness, but cannot be the source of truth for completed output.

### 11.6 Copy, Accessibility, And Responsive Contract

Feature 120 UI must follow the Feature 119 centralized status/copy model instead of introducing raw enum labels or page-local divergent strings.

Copy rules:

- all new status, blocker, preset lifecycle, feature-access, credit, conflict, cleanup, output, and download messages must have Thai and English copy coverage;
- UI should render copy IDs or centralized copy projections, not raw values such as `official_producer_ready`, `official_runtime_blocked`, legacy `smoke_only`, `candidate`, or `fallback_quality`;
- preset labels can be registry-provided, but operational statuses and errors must use shared status copy helpers;
- output actions must use the same safe labels across Storyboard Review, Media History, Library, and Video Editor.

Accessibility and keyboard rules:

- preset selectors, subtitle preset selectors, audio controls, text editors, assignment save, preview, render, download, Library save, conflict reload, and collapse/expand controls must be reachable by keyboard;
- controls must have accessible names in Thai and English;
- render progress and completion should be announced with polite live regions when supported by existing UI patterns;
- animation previews must respect reduced-motion preferences and cannot be the only indication of status.

Responsive rules:

- expanded and collapsed Final Composite panel must be verified on 360x800, 390x844, 768x1024, 1024x768, and 1440x900 viewports;
- no horizontal overflow, hidden primary CTA, clipped dropdown, clipped output link, or unreachable text editor is allowed;
- preview cards must remain usable when overlay/subtitle/audio controls are collapsed;
- long Thai copy, long product names, and long subtitle lines must wrap or clamp predictably without changing fixed workflow controls.

---

## 12. Composition Builder Requirements

The builder must create HyperFrames-compatible composition files with:

- root `data-composition-id`;
- fixed `data-width` and `data-height` from platform profile;
- video clips as timed media;
- overlay and subtitle elements as `class="clip"`;
- audio elements with deterministic timing;
- GSAP timeline with `paused: true`;
- `window.__timelines[compositionId] = tl`;
- no `Math.random()`;
- no async/fetch in timeline setup;
- escaped text;
- declared variables where Studio/player editing is supported.

Composition should be generated from templates, not arbitrary user HTML.

### 12.1 Fallback Renderer Boundary

The current FFmpeg final composite can remain as a fallback for:

- basic subtitles;
- simple overlay text;
- audio concat/mix when producer is unavailable.

Fallback must report `fallbackQuality: "partial"` for presets that require:

- kinetic typography;
- per-word animation;
- rich CSS;
- GSAP timelines;
- shader transitions;
- parallax;
- texture masks;
- advanced audio-reactive animation.

The UI should warn if the selected preset cannot be fully represented by the fallback.

### 12.2 Timeline And Cue Normalization

Feature 120 needs one canonical timeline shared by preview, composition HTML,
diagnostic fallback reports, official HyperFrames render, audio mix, QA, and
Library metadata.

Current legacy behavior:

- `HyperframesFinalCompositeConfig.shots[].startSec` and `subtitleCues[].startSec/endSec` are provided as final-composite absolute seconds;
- Storyboard Review currently builds those times from a running cursor;
- the FFmpeg/ASS fallback also computes a cursor from shot order and clamps subtitle cue times into each shot;
- this works only when UI-provided shot starts and worker-computed starts stay identical.

Target behavior:

- server normalizes shot order and durations into a `HyperframesCreativeTimeline` before preview or render;
- timeline entries contain `shotId`, `shotIndex`, `absoluteStartSec`, `absoluteEndSec`, `durationSec`, source media ref/hash, and optional source in/out offsets;
- legacy `shot.startSec` must match the normalized absolute start within a small tolerance or produce a stale/invalid timeline error;
- overlay events, subtitle cues, voiceover cues, music segments, SFX events, transitions, and QA sample points all reference the same absolute timeline;
- template-specific local times are derived from the canonical timeline, not entered independently by UI controls;
- every cue/event must be bounded by either its owning shot range or an explicit global range such as first-hook or end-card;
- final duration must equal the normalized timeline end, not a separate user-provided number, unless an explicit platform trim/extend policy is stored.

Timing rules:

- sort shots by `index`, then validate ids are unique and indices are contiguous;
- reject negative times, overlapping shots, zero/negative duration, cues outside final duration, and events whose end is before start;
- clamp only for display preview warnings; final render should reject invalid persisted timing rather than silently hiding cues;
- preserve source clip audio only for the portion actually used by the normalized shot segment;
- audio event map timing must be validated after transition durations are applied;
- subtitle presets that require word-level timing must declare whether they use manual word timings, transcript/TTS timings, or phrase-level fallback;
- if word timings are unavailable, karaoke presets degrade to phrase-level highlighting with a visible QA warning or block according to preset policy.

Required timeline artifacts:

- `timelineHash` included in creative plan, render manifest, idempotency inputs, QA report, and operator diagnostics;
- `timelineVersion` included in manifest so future timing logic changes do not replay old jobs ambiguously;
- QA report includes expected duration, actual duration, drift, audio duration, subtitle cue count, overlay event count, and dropped/blocked cue count.

---

## 13. Asset And Storage Requirements

### 13.1 Audio Assets

Recommended logical layout:

```text
audio/
  music/
  sfx/
  vo/
  ambience/
```

In production, assets must be staged through existing storage and tenant checks. Do not use arbitrary remote URLs directly in render workers.

Audio asset rules:

- each music/SFX/ambience asset must carry source, license, tenant ownership, duration, MIME type, checksum, and safe-serving metadata;
- bundled starter assets, if any, must be explicitly licensed for commercial use;
- generated or uploaded audio must be treated as staged media, not as arbitrary external URLs;
- missing or unlicensed audio assets must block final render or degrade to silent/no-SFX with a user-visible warning according to preset policy;
- generated voiceover, source clip audio, music bed, and SFX must be distinguishable in manifest and QA output.

### 13.2 Artifact And Output Kind Compatibility

Feature 120 must stay compatible with the existing Feature 119 artifact and output schemas unless a dedicated schema migration is approved.

Current artifact kinds to reuse:

- `hyperframes_input_json`
- `hyperframes_composition_html`
- `hyperframes_snapshot`
- `hyperframes_render_mp4`
- `hyperframes_render_webm`
- `hyperframes_subtitle_vtt`
- `hyperframes_manifest`
- `hyperframes_sanitized_log`

Current output kinds to reuse:

- `preview_video`
- `final_video`
- `snapshot`
- `library_item`

Feature 120 logical sidecars should map into existing artifact kinds first:

- creative plan JSON, preset manifest JSON, audio event map JSON, audio mix report JSON, and QA report JSON should be stored as `hyperframes_manifest` artifacts or embedded manifest sections until search/retention needs justify a new artifact kind;
- generated composition HTML remains `hyperframes_composition_html`;
- keyframe and visual QA images remain `hyperframes_snapshot`;
- final MP4 remains `hyperframes_render_mp4`;
- subtitles or caption exports remain `hyperframes_subtitle_vtt`;
- diagnostics remain `hyperframes_sanitized_log`.

Adding a new artifact kind requires:

- updating shared Zod schemas and TypeScript exports;
- updating retention defaults and purge tests;
- updating Library metadata and Media History discovery tests;
- updating operator diagnostics and redaction tests;
- updating fixture manifests and release gate evidence;
- proving backward compatibility for existing Feature 119 artifacts.

### 13.3 Idempotency

Render idempotency must include:

- tenant id
- user id or actor id
- product id
- run id
- storyboard review project id
- render intent
- composition mode
- selected shot ids and media refs
- template id/version
- template content hash
- platform profile id/version
- preset ids/versions
- variables hash
- copy plan hash, product truth hash, evidence manifest hash, and claim evidence map hash
- audio event map hash
- timeline hash and timeline version
- source media hashes
- runtime profile hash

During migration, if a legacy `HyperframesFinalCompositeConfig` is used, the bridge must include a `legacyFinalCompositeConfigHash` in the creative plan and composition hash inputs.

### 13.4 Outbox And Artifact Compatibility

Feature 120 must reuse the Feature 119 runtime ledger unless a later implementation explicitly promotes HyperFrames to dedicated tables.

Outbox payload must continue to carry:

- `compositionInputHash`
- `compositionHtmlHash`
- `templateId`
- `templateVersion`
- `templateContentHash`
- `platformPresetId`
- `platformPresetVersion`
- `renderIntent`
- `compositionMode`
- `runtimeProfileHash`

Feature 120 adds these optional creative fields:

- `creativePlanHash`
- `presetManifestHash`
- `audioEventMapHash`
- `fallbackQuality`

Artifact rows should use existing Feature 119 artifact kinds where possible. New creative artifacts may be represented as manifest JSON until new artifact kinds are justified by retention/search needs.

### 13.5 Thai Font Runtime Requirements

Thai font support must be verified in the render runtime, not only listed in frontend schema enums.

Rules:

- allowed font families remain `Prompt`, `Noto Sans Thai`, `IBM Plex Sans Thai`, `Sarabun`, and `Kanit`;
- worker diagnostics must report installed/available font families for FFmpeg/libass and producer/Chrome paths;
- missing requested fonts must either block producer-only presets or fall back through a documented Thai-capable font chain with a visible QA warning;
- fallback to a non-Thai font is not acceptable for Thai subtitles or overlays;
- render manifest and QA output must record requested font, resolved font, fallback count, and whether glyph coverage passed;
- CI/fixture renders should include Thai glyphs that catch clipping, missing marks, and line-height problems.

### 13.6 Observability, Retention, And Operator Compatibility

Feature 120 must extend Feature 119 observability and operator controls rather than creating a new diagnostic surface.

Every preview, snapshot, final composite, Library save, and repair action should carry these additional trace fields where available:

- `creativePlanHash`
- `presetManifestHash`
- `overlayPresetId` and version
- `subtitlePresetId` and version
- `audioPackPresetId` and version
- `audioEventMapHash`
- `runtimeCapabilityHash`
- requested and resolved Thai font
- fallback quality
- selected shot media assignment hash
- output URL/content hash when completed
- Library item id when finalized

Metrics should be broken down by tenant, runtime mode, render intent, platform profile, preset family, and fallback quality. Minimum counters/timers:

- render duration and queue wait by preset family;
- capability-blocked attempts;
- fallback renders by reason;
- text overflow, clipped Thai glyph, unsafe area, and subtitle overlap warnings;
- missing/unlicensed audio assets;
- native-audio preservation failures;
- output probe failures;
- Library finalize success/failure;
- operator replay/cancel/repair actions.

Retention rules:

- creative plan JSON, preset manifest JSON, audio event map JSON, snapshot PNG, composition HTML, QA report, and rendered MP4 should reuse Feature 119 retention classes unless a dedicated artifact kind is promoted later;
- raw composition HTML and raw signed URLs should not be retained beyond the preview/debug window; keep hashes and sanitized metadata for long-term provenance;
- uploaded or generated audio assets follow existing media Library ownership and deletion rules, not transient render cleanup;
- preview-only creative artifacts may be purged, but finalized Library outputs and their provenance manifests must be preserved according to Library policy;
- retention purge must support dry-run counts and must skip active, locked, retry-grace, Library-owned, and operator-held artifacts.

Operator rules:

- existing inspect/replay/cancel/template controls should show sanitized creative metadata;
- operator replay must require the same product/run/storyboard ids, creative plan hash, runtime capability hash, and feature access state;
- disabling a preset version should prevent new renders while preserving completed Library outputs;
- repair may regenerate missing safe projections or Library metadata only when output hash and provenance match;
- operator diagnostics must redact storage refs, signed URLs, local paths, raw HTML body, raw prompt variables containing private data, stack traces, and secrets.

---

## 14. QA And Validation

### 14.1 Visual QA

Required checks:

- all text inside safe area;
- no text overlap with product, face, hands, CTA, price, or subtitle zone when detectable;
- no clipped Thai glyphs;
- no single-line overflow;
- top overlays use product/spec copy, not accidental subtitle copy;
- selected overlay preset is visible in snapshot;
- selected subtitle preset is visible when burn-in is enabled;
- output duration matches expected duration within tolerance.

### 14.2 Audio QA

Required checks:

- final MP4 has audio when `preserveNativeAudio` or VO/music/SFX is enabled;
- music does not exceed configured volume under VO;
- no missing referenced audio files;
- SFX events have visual triggers;
- SFX count is within preset policy;
- whoosh/click/notification/cash/riser timing offsets are valid;
- no hard audio clipping according to FFmpeg loudness/peak probe when available;
- final output can play in browser media element.
- final audio stream duration matches video duration within tolerance when audio is enabled.

### 14.3 Schema Tests

Add tests for:

- preset registry ids are unique;
- aliases resolve explicitly;
- active presets have English prompt packs;
- Thai font list is enforced;
- runtime capability metadata is present for every preset and blocks
  official-runtime-required presets under `official_runtime_blocked`;
- invalid audio event timing is rejected;
- missing output URL cannot mark job completed;
- completed projection requires `outputRefs.final_video.url` and `contentHash`;
- mismatched product/run/storyboard provenance rejects render creation;
- shot media assignments persist and reload by project/shot id;
- persisted assignment failure blocks final render rather than using stale clip state;
- scoped Storyboard Review updates preserve existing HyperFrames assignments and reject stale revisions;
- companion-table promotion, if implemented, has dry-run classification, backfill, dual-read drift detection, dual-write, cutover, rollback, and cleanup tests;
- render creation never falls back by project title, latest project, thumbnail, or visually similar media when product/run/storyboard IDs are missing;
- requested Thai font resolves to an installed Thai-capable font or fails with a visible warning;
- feature access and credit/quota gates block unavailable or unpaid producer-only creative presets;
- duplicate render/finalize requests do not double-charge or consume extra free preview quota;
- Feature 120 access projection extends existing Feature 119 capability fields without renaming or removing them;
- tenant feature flags and env safety guards correctly enable, disable, or block creative presets, final render, Library save, and operator actions;
- Admin Tenant Feature Flags metadata includes any new Feature 120 flags in the existing Media Production & HyperFrames group;
- Feature 119 render projections, Library finalize metadata, artifact refs, output refs, charge summaries, polling guidance, and repair actions still parse after Feature 120 schemas are added;
- any contract version bump has explicit dual-parse, adapter, migration, and rollback tests before it can write new rows;
- legacy Storyboard Review audit identifies mismatched product/run/project rows and separates repairable from delete-only rows;
- runtime API schemas cover creative preset listing, scoped Storyboard Review HyperFrames state updates, and final composite render creation with storyboard revision/hash guards;
- final render manifest includes output and media history metadata;
- creative plan, preset manifest, audio event map, audio mix report, and QA report sidecars map to existing artifact kinds unless a schema migration adds new kinds with retention/operator/Library tests;
- Thai/English copy coverage exists for every new Feature 120 status, blocker, action, and preset lifecycle state;
- unsupported raw enum values do not leak into Storyboard Review, Media History, Library, or Video Editor UI snapshots;
- observability metadata includes creative plan, preset manifest, audio event map, runtime capability, font, fallback quality, and selected shot assignment hashes;
- normalized creative timeline validates shot order, shot starts/durations, overlay events, subtitle cues, audio events, transitions, and final duration;
- preview, diagnostic fallback reports, official HyperFrames render, QA, and Library metadata use the same `timelineHash`;
- copy plan validation rejects unsupported claims, stale volatile facts, and user edits that are not backed by evidence refs;
- marketplace evidence instruction firewall decisions are respected before any Feature 120 LLM-assisted copy, QA, repair, or render-facing metadata generation;
- retention dry-run classifies preview-only creative artifacts separately from Library-owned outputs;
- operator replay rejects stale creative plan hash, stale runtime capability hash, mismatched product/run/storyboard ids, and disabled preset versions.
- creative text, CSS/GSAP variables, subtitle text, and diagnostics pass through sanitizer tests and render as text, not executable HTML;
- audio/SFX/font/media refs are rejected unless they pass staged-manifest ownership, URL safety, MIME, duration/size, checksum, and license/source checks;
- pre-render and post-render QA issue codes map to safe Thai/English copy and block completed projection or Library save when blocking.

### 14.4 Visual Regression

Maintain fixture renders for:

- ecommerce toy product
- electronics/tablet product
- premium home product
- mother & baby product
- AI/SaaS product

Each fixture should include at least one snapshot with overlay, subtitle, and audio event map.

### 14.5 Browser Workflow Evidence

Add or extend Playwright coverage for:

- Storyboard Review Final Composite collapsed by default;
- expanded settings with overlay, subtitle, audio, and text controls;
- keyboard-only edit, preview, render, open/download, and Library-save path;
- runtime capability state where official-runtime-required presets are disabled
  under `official_runtime_blocked`;
- mobile and tablet layouts without horizontal overflow;
- reduced-motion preview state;
- completed render recovery after browser refresh or direct route reopen.

---

## 15. Security And Compliance

Security rules:

- built-in templates only for production V1;
- no arbitrary tenant HTML;
- all text escaped;
- all media assets staged and tenant-scoped;
- raw signed URLs are not exposed in normal UI;
- raw composition HTML with private URLs is not exposed;
- render logs are sanitized;
- audio assets must pass allowed MIME/size/duration checks;
- user-provided text must not become unsupported product claims;
- generated spec/price/rating overlays must reference evidence or be omitted;
- disclosure overlays remain governed by product truth/compliance policy.

Feature 120 must reuse and extend the Feature 119 safety services:

- text and diagnostics must pass through the existing HyperFrames sanitizer boundary before becoming HTML, logs, status copy, or operator diagnostics;
- media refs must be staged through the existing HyperFrames asset staging path before preview, snapshot, or final render;
- pre-render QA must validate composition hash, staged manifest, disclosure, subtitle safe area, and creative plan compatibility before worker execution;
- post-render QA must validate playable output, output hash, duration, resolution, blank frames, and required audio before completed status or Library save;
- new audio/SFX/font assets must be added to the staged manifest and QA result rather than bypassing staging as direct URLs.

Additional Feature 120 restrictions:

- CSS/GSAP presets must not introduce remote scripts, external stylesheets, remote fonts, iframe/embed tags, dynamic `fetch`, cookies/localStorage access, or SmartSpecPro API calls;
- runtime composition HTML must use staged local/managed asset refs only;
- preview HTML should run in the same sandbox/trusted-player boundary as Feature 119 preview evidence;
- generated or uploaded audio must be validated for MIME type, duration, size, checksum, license/source, tenant ownership, and safe-serving metadata;
- SFX packs must not reference bundled or third-party sounds unless license metadata is explicit and commercial-use compatible;
- font selection must resolve to approved Thai-capable fonts already available in the worker/preview runtime or block producer-only presets with a visible QA warning;
- all new QA issue codes must map to safe Thai/English user copy and operator-safe diagnostics.

---

## 16. Migration Plan

### Phase 0: Documentation And Registry Design

- Add this Feature 120 spec.
- Audit current overlay/subtitle/audio fields in Storyboard Review and runtime schemas.
- Audit existing Storyboard Review rows for missing/mismatched Marketplace Auto Review provenance before enabling final composite broadly.
- Audit current Feature 119 dependency, doctor, production rollout gate, status copy, and Playwright evidence commands that Feature 120 must extend.
- Audit current tenant flags, env guards, Admin Tenant Feature Flags metadata, and feature access projection fields before adding any Feature 120 rollout controls.
- Define shared creative preset registry.
- Map current preset aliases to new ids.

### Phase 1: Shared Contracts

- Add creative preset registry.
- Add schemas for creative plan, variables, audio event map, manifest, and QA result.
- Add evidence-bound copy plan schema fields for copy source, evidence refs, freshness, claim category, edit actor, omitted claims, and claim evidence hashes.
- Add tests for registry, schema, and alias behavior.
- Add capability projection so official-runtime-required presets are hidden or
  clearly marked when only diagnostic fallback is available.
- Add platform-profile resolution so width, height, fps, safe area, and subtitle limits come from Feature 119 platform presets by default.
- Add provenance binding validation for product/run/storyboard IDs before render creation.
- Add shot media assignment contract for persisted source video choices.
- Add Storyboard Review storage strategy for scoped JSON subdocument or companion table, including conflict handling.
- If a companion table is chosen, add the migration sub-plan, dry-run report, dual-read/write gates, rollback SQL, and drift tests before implementation code relies on it.
- Add creative feature-access projection and credit metadata extensions that reuse Feature 119 gates.
- Add runtime API schemas for creative preset listing, scoped HyperFrames state updates, conflict responses, and final composite revision/hash guards.
- Add runtime capability matrix and preset lifecycle projection that
  differentiate diagnostic fallback, `official_cli_ready`,
  `official_producer_ready`, canary, and rollback execution.
- Add Thai/English copy IDs for new statuses, blockers, actions, preset lifecycle states, and output states.
- Add feature-access schema tests that prove current Feature 119 capability fields remain backward compatible while Feature 120 creative details are additive.
- Add contract-version compatibility tests that prove `hyperframes_marketplace_auto_review_v1` projections and Library metadata remain readable with Feature 120 additive schemas.

### Phase 2: UI Review And Editing

- Replace scattered preset dropdown metadata with registry-derived options.
- Add independent subtitle preset selector.
- Add audio pack/music/SFX controls.
- Add editable per-shot overlay/subtitle/voiceover text.
- Persist selected/replaced/imported shot MP4 assignments before marking shots ready.
- Use scoped server updates so assignment saves do not overwrite other Storyboard Review changes.
- Add compact/collapsed defaults.
- Add output link and media history status projection.
- Ensure completed status banners render open/download actions only from safe `outputRefs` URLs.
- Restore render status and output actions after refresh from server projection.
- Surface backend credit/quota/no-charge/duplicate state next to preview/render CTAs.
- Use typed scoped-state APIs for assignment/text saves instead of piggybacking on full `saveStoryboardReview` document writes.
- Add keyboard, reduced-motion, and responsive states before enabling the expanded editor by default.

### Phase 3: Preview

- Add CSS/GSAP preview that uses selected preset ids and variables.
- Add audio event map preview.
- Add warning when fallback cannot fully represent selected preset.
- Add snapshot generation when render worker supports it.

### Phase 4: Composition Builder

- Generate HyperFrames-compatible HTML from template + creative plan.
- Normalize one canonical creative timeline before generating preview, HTML, ASS fallback, audio mix, or render payload.
- Use variables for editable text/media where possible.
- Add audio elements for VO/music/SFX/ambience.
- Register GSAP timelines.
- Persist manifest and composition hashes.
- Resolve subtitle/overlay cue times into one absolute timeline while retaining per-shot edit boundaries.
- Record requested/resolved Thai font metadata in composition and manifest.

### Phase 5: Producer Render Path

- Enable official HyperFrames CLI, `@hyperframes/producer`, or producer server
  render path in a dedicated worker after Feature 119 production gates.
- Keep HyperFrames runtime dependencies out of web/client bundles and verify this in dependency audit.
- Keep any FFmpeg/Playwright fallback explicit, diagnostic-only, and unable to
  satisfy completed production render gates.
- Preserve audio from source clips or approved voiceover/music tracks.
- Save playable MP4 with download link and media history item.
- Require output URL, output hash, and playable media probe before a render can be marked completed.
- Reuse Feature 119 outbox/artifact payload fields and add creative hashes as extensions, not replacements.
- Map Feature 120 logical sidecars into existing artifact/output kinds unless an explicit schema migration and retention/operator/Library test update is part of the same work package.

### Phase 6: QA And Rollout

- Add visual/audio QA probes.
- Add evidence-bound copy QA for unsupported specs, stale price/rating/sold count, user-edited unsupported claims, and prompt-injection-like marketplace evidence.
- Extend sanitizer, staging, pre-render QA, and post-render QA tests for Feature 120 audio/SFX/font/CSS/GSAP inputs.
- Add fixture snapshots.
- Run dependency audit, doctor, production rollout gate, fixture render, snapshot test, and Thai font diagnostics before activating producer-only presets.
- Capture Playwright evidence for 360x800, 390x844, 768x1024, 1024x768, and 1440x900 Storyboard Review states.
- Add Library finalize and Media History verification for creative metadata using the existing `marketplace_auto_review_hyperframes_render` source.
- Verify tenant flag rollout from Admin Tenant Feature Flags UI for disabled, worker-disabled, library-disabled, operator-disabled, and fully enabled states.
- Run storage migration dry-run and drift report before any companion-table cutover; delete-only corrupted rows must remain excluded from backfill.
- Add metrics dashboards or saved queries for capability blocks, fallback renders, output probe failures, text overflow, no-audio outputs, and Library finalize failures.
- Extend operator diagnostics, replay, cancel, repair, preset disable/enable, and retention dry-run with creative metadata.
- Document rollback steps for disabling Feature 120 presets while preserving Feature 119 base HyperFrames renders and completed Library media.
- Add dry-run legacy cleanup report and manual/operator cleanup procedure for corrupted Storyboard Review rows.
- Add canary tenants.
- Monitor failed renders, missing assets, no-audio outputs, and overflow warnings.
- Promote presets from candidate to active after evidence.

### 16.1 Implementation Work Packages

Implementation should be split into test-first work packages so Feature 120 can ship incrementally without destabilizing Feature 119.

1. Shared creative contracts and registry
   - preset registry, alias table, creative plan schemas, subtitle/audio schemas, capability metadata, copy IDs, and contract tests.
2. Storyboard Review persistence and provenance
   - scoped JSON state or companion-table migration, shot assignment persistence, canonical product/run/storyboard validation, stale revision conflicts, and cleanup audit.
3. Runtime API and feature access projection
   - creative preset listing, scoped state mutation API, final composite revision/hash guards, additive feature-access fields, and router shape tests.
4. Preview and editable UX
   - collapsed-by-default panel, overlay/subtitle/audio controls, editable text, CSS/GSAP preview, audio event preview, keyboard/reduced-motion/responsive evidence.
5. Composition builder and fallback adapter
   - creative plan to deterministic HyperFrames HTML, GSAP timelines, Thai font metadata, audio elements, diagnostic fallback limits, manifest hashes, and fallback QA.
6. Render worker and output projection
   - final MP4 render path, audio preservation/mix, playable output URL, output hash, browser probe, completed projection, and refresh/resume.
7. Library, Media History, and Video Editor handoff
   - existing source reuse, creative metadata, idempotent Library save, playable Media History item, download/open actions, and duplicate-save behavior.
8. Observability, retention, and operator controls
   - metrics, sanitized diagnostics, replay/cancel/repair/preset disable, retention dry-run, legacy cleanup, and audit events.
9. Fixtures, E2E, and rollout
   - fixture matrix, snapshot/audio QA, tenant flag states, production rollout gate, canary rollout, rollback proof, and docs.

Each work package must include:

- failing tests or browser evidence before implementation;
- affected files and compatibility notes;
- rollback notes;
- exact gate commands or manual evidence;
- confirmation that Feature 119 behavior still works with Feature 120 flags disabled.

### 16.2 Release Gate Commands

Use the package manager and script names already present in `apps/web/package.json`.

Focused gates:

```bash
npm --prefix apps/web run test -- apps/web/shared/hyperframes
npm --prefix apps/web run test -- apps/web/server/services/__tests__/hyperframes
npm --prefix apps/web run test -- apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts
npm --prefix apps/web run check
npm --prefix apps/web run e2e:marketplace-hyperframes
npm --prefix apps/web run hyperframes:dependency-audit
npm --prefix apps/web run hyperframes:doctor
npm --prefix apps/web run hyperframes:fixture-render
npm --prefix apps/web run hyperframes:snapshot-test
npm --prefix apps/web run hyperframes:production-rollout-gate
```

Gate rules:

- `hyperframes:dependency-audit` must remain pass or acceptable partial before any producer-only preset is active;
- `hyperframes:doctor` must report FFmpeg/FFprobe, Chrome/Playwright, temp workspace, storage, and Thai font readiness before final render rollout;
- `hyperframes:fixture-render` and `hyperframes:snapshot-test` must include Feature 120 overlay/subtitle/audio fixture evidence, not only Feature 119 smoke fixtures;
- `hyperframes:production-rollout-gate` must block producer-only presets when package versions, licenses, runtime image, fonts, or worker isolation are not approved;
- `e2e:marketplace-hyperframes` must cover Storyboard Review Final Composite states, not only Product Detail launch states;
- if a focused command does not exist for a new package, add it in the same implementation section and update this spec.

---

## 17. Acceptance Criteria

Feature 120 is complete when:

1. Overlay, subtitle, music, SFX, and audio pack presets come from a shared registry.
2. Every active preset has id, version, Thai/English labels, English HyperFrames prompt, variables, QA policy, and adapter support metadata.
3. Users can edit hook, supporting text, per-shot overlay text, subtitle text, and voiceover/subtitle text before render.
4. Users can choose overlay preset and subtitle preset independently.
5. Users can choose an audio pack and inspect generated audio events before render.
6. Preview uses the same plan/variables as final render.
7. Render payload includes creative plan, preset ids, preset versions, variables, and audio event map.
8. Final MP4 preserves audio when configured and exposes open/download links on completion.
9. Media history shows playable output with provenance.
10. Invalid product/run/storyboard ids do not silently fall back to another product.
11. Fallback renderer limitations are explicit.
12. Schema and registry tests pass.
13. At least five fixture products have snapshot/audio QA coverage.
14. A final render cannot be marked completed unless output URL, output hash, duration, and playable-media probe are present.
15. Library metadata reuses `marketplace_auto_review_hyperframes_render` and adds creative preset/audio metadata without creating a parallel media source.
16. Dimensions, fps, safe area, subtitle limits, and disclosure placement resolve from a versioned platform profile unless an explicit override reason is stored.
17. Music, SFX, ambience, and generated voiceover assets validate source, license, MIME type, duration, checksum, and tenant ownership before final render.
18. UI and API capability projection prevent unsupported
official-runtime-required presets from being treated as fully renderable through
diagnostic fallback.
19. Feature 119 outbox/artifact/idempotency fields remain backward compatible, with creative hashes added as extensions.
20. Completed status projection includes a safe playable `final_video` output URL and content hash; manifest-only completion is rejected.
21. Product/run/storyboard IDs are verified end-to-end, and mismatched or corrupted projects fail fast instead of falling back to another project.
22. Dragged, replaced, imported, or manually selected shot MP4 assignments persist server-side and reload after refresh before final render.
23. Final render status and output actions are recoverable from server projection after browser refresh or route reopen.
24. Thai font resolution is runtime-verified for FFmpeg/libass and producer paths, with non-Thai fallback blocked for Thai text.
25. Storyboard Review persistence uses scoped updates or a companion table so assignment/text/render refs are not lost by whole-document `reviewData` saves.
26. Stale Storyboard Review assignment/text saves return a visible conflict state instead of silently applying last-write-wins.
27. Creative preset access, render CTAs, and Library save actions obey Feature 119 feature flags, tenant gates, worker readiness, template allowlist, credit/quota, and operator permissions.
28. Credit estimates, reservations, charges, refunds, and no-charge reasons are preserved in manifests/projections without double-charging duplicate renders or finalizes.
29. Legacy/corrupted Storyboard Review rows can be audited, repaired when provable, or deleted/archived safely without deleting finalized Library media.
30. Runtime APIs expose creative presets, scoped Storyboard Review HyperFrames state updates, conflict states, and final composite render creation without relying on UI-local arrays or full-document saves.
31. Runtime capability projection prevents official-runtime-required presets
from being selected, charged, queued, or saved when the current environment is
only diagnostic fallback or `official_runtime_blocked`.
32. All new UI copy has Thai/English coverage and no raw enum/status/lifecycle values leak into user-facing screens.
33. Storyboard Review Final Composite passes keyboard, reduced-motion, and responsive browser evidence for collapsed, expanded, running, completed, conflict, and blocked states.
34. Metrics, sanitized diagnostics, and operator inspect output include creative plan, preset, audio, font, runtime capability, fallback quality, output, and Library provenance without leaking private storage or raw HTML.
35. Retention dry-run and purge protect finalized Library outputs while allowing preview-only creative artifacts to expire under Feature 119 retention policy.
36. Operator replay, repair, cancel, and preset disable/enable paths are permission-gated, audited, and reject stale creative/runtime hashes or mismatched product/run/storyboard provenance.
37. Feature 120 rollout uses existing HyperFrames tenant flags and env safety guards, and any added creative flag is represented in shared feature flag schemas, Admin Tenant Feature Flags UI metadata, service tests, and disabled-state UI evidence.
38. Feature access projection remains backward compatible with Feature 119 capability field names while exposing creative preset/runtime availability as additive data.
39. If Feature 120 promotes storage beyond `reviewData.hyperframesFinalComposite`, migration includes dry-run classification, provable backfill, dual-read drift diagnostics, dual-write/cutover gates, rollback SQL, and tests that corrupted rows are repaired only when provable or excluded as delete-only.
40. Final composite render creation never resolves missing identity by title/latest/thumbnail/media similarity fallback; it requires verified product/run/storyboard IDs from normalized review data or companion-table state.
41. Implementation is split into test-first work packages with release gate evidence using the existing `apps/web` HyperFrames scripts, and Feature 119 behavior is verified with Feature 120 flags disabled.
42. Feature 120 creative text, CSS/GSAP variables, subtitles, diagnostics, audio/SFX/font refs, and media refs reuse Feature 119 sanitizer, asset staging, and QA gates; unsafe inputs fail before worker execution, completed projection, or Library save.
43. Feature 120 does not introduce new artifact/output enum values silently; creative plan, preset manifest, audio event map, audio mix report, and QA report sidecars reuse existing artifact kinds or ship with schema, retention, operator, Library, fixture, and backward-compatibility tests.
44. Feature 120 preserves `hyperframes_marketplace_auto_review_v1` compatibility unless a formal contract migration ships with dual-parse adapters, old-job readability tests, Library/Media History migration proof, and rollback behavior.
45. Preview, final render, subtitle burn-in, overlay animation, source audio preservation, SFX timing, QA duration checks, and Library metadata all derive from the same normalized timeline hash; invalid or drifted timings block final render instead of being silently clamped away.
46. Overlay/spec/price/review/CTA/subtitle/voiceover copy is evidence-bound: unsupported claims, stale volatile marketplace facts, user edits without evidence, and instruction-like marketplace text block final render or are omitted with recorded safe reasons.

---

## 18. Open Questions

1. Should SmartSpecPro bundle a small licensed SFX starter pack, or require tenant-uploaded/Library-selected audio assets first?
2. Should music generation be integrated through existing media providers, or remain asset-library based in V1?
3. Should word-level karaoke timing depend on transcript generation, TTS output, or manual cue editing?
4. When should the default official runtime promote from HyperFrames CLI worker
to `@hyperframes/producer` or producer server for all tenants after canary
metrics are stable?
5. Should HyperFrames Studio/player become the long-term preview surface instead of custom React preview?

---

## 19. Current Codebase Alignment Review

This section records how Feature 120 maps to the SmartSpecPro codebase at the time this spec was created.

### 19.1 Aligned With Current Code

Current implementation already has a partial foundation:

- `apps/web/shared/hyperframes/runtimeApiSchemas.ts` defines `HyperframesFinalCompositeConfigSchema` with `overlayPreset`, `subtitlePreset`, `fontFamily`, `textMode`, `hookText`, `supportingText`, `burnInSubtitles`, and per-shot `onScreenText` / `subtitleCues`.
- `apps/web/client/src/pages/StoryboardReviewPage.tsx` lets Storyboard Review build a final composite payload from selected clips and editable per-shot text.
- `apps/web/server/services/hyperframesCompositionService.ts` builds a captioned final composite composition input and includes `data-overlay-preset` and `data-subtitle-preset` in generated HTML.
- `apps/web/server/workers/hyperframesRenderWorker.ts` contains an FFmpeg final composite path that concatenates selected MP4 clips, preserves or replaces missing clip audio with silence, and burns ASS overlay/subtitle text.
- `apps/web/server/services/hyperframesCompositionSanitizer.ts`, `hyperframesAssetStagingService.ts`, and `hyperframesQaService.ts` already provide sanitizer, staged manifest, pre-render QA, and post-render QA boundaries that Feature 120 must extend for audio/SFX/font/CSS/GSAP inputs.
- Feature 119 already defines the broader render adapter, template registry, artifact, outbox, worker, and library-save direction that Feature 120 should extend rather than replace.
- `apps/web/package.json` already exposes HyperFrames gates for dependency audit, doctor, fixture render, snapshot test, production rollout gate, and Marketplace HyperFrames Playwright E2E; Feature 120 should extend these gates rather than inventing parallel scripts.

### 19.2 Main Gaps Against This Spec

The current code is useful but still below the Feature 120 target:

1. Presets are scattered.
   - Overlay and subtitle options currently live as UI arrays, schema enums, worker validation branches, CSS/ASS styles, and composition HTML behavior.
   - Feature 120 requires a shared registry with ids, aliases, versions, prompts, variables, adapter support, and QA policy.

2. Current config is flat.
   - The current API accepts `HyperframesFinalCompositeConfig`.
   - Feature 120 requires a `HyperframesCreativePlan` containing preset ids, preset versions, variables, audio events, source refs, manifest inputs, and render policy.

3. Prompt metadata is not represented.
   - Current `styleBrief` is a short free-text field.
   - Feature 120 needs versioned English prompt packs per preset, stored as metadata and included in manifests.

4. Audio design is not represented.
   - Current final composite preserves source clip audio and fills missing audio with silence.
   - It does not yet support music beds, SFX events, ambience, ducking policy, audio event map validation, or audio asset staging.

5. HyperFrames fidelity is partial.
   - Current final output path is FFmpeg + ASS fallback, which is appropriate for simple burn-in text.
   - It cannot fully express CSS/GSAP kinetic overlays, parallax, texture masks, shader transitions, or audio-reactive effects.

6. Preview and render can drift.
   - The current UI preview and final render can diverge if local CSS preview logic and worker ASS logic do not share the same preset definition.
   - Feature 120 requires preview and render to derive from the same creative plan and registry metadata.

7. Unknown preset fallback is too permissive.
   - Current worker logic normalizes unknown overlay/subtitle presets back to safe defaults.
   - Feature 120 should replace this with explicit alias resolution plus validation errors for unsupported active ids, so bad data does not silently hide mismatches.

8. Manifest/provenance is not rich enough for creative systems.
   - Feature 119 stores render state and artifacts.
   - Feature 120 needs manifest fields for preset versions, variable hashes, source media hashes, audio event map hash, output URL, audio presence, QA status, and fallback quality.

9. Platform profile settings can drift from UI config.
   - Current Storyboard Review final composite payload can set width, height, and fps directly.
   - Feature 119 already has platform presets such as `generic_vertical_9_16` and `tiktok_reels_shorts_9_16` with versioned fps, safe area, subtitle policy, and thumbnail policy.
   - Feature 120 should resolve dimensions/fps/safe area from platform profile first, with explicit override metadata if any manual value differs.

10. Library/media handoff already exists and must be reused.
   - Current code uses `marketplace_auto_review_hyperframes_render` as the HyperFrames Library source.
   - Feature 120 must add creative metadata to that existing source rather than creating a new media source type.

11. Audio asset provenance is not modeled.
   - Current code can preserve MP4 audio, but music/SFX/ambience assets have no source/license/duration/checksum contract.
   - Feature 120 should require staged, tenant-scoped, license-aware audio assets before final render.

12. Capability flags are not yet tied to creative presets.
   - Feature 119 exposes HyperFrames and Library save capability gates.
   - Feature 120 should add preset availability/capability projection so UI does not show official-runtime-required presets as fully available when only diagnostic fallback is enabled.

13. Observability and operator metadata are not yet creative-aware.
   - Feature 119 can inspect, replay, cancel, retain, and finalize HyperFrames jobs.
   - Feature 120 needs those paths to understand creative plan hash, preset versions, audio event map hash, runtime capability hash, fallback quality, Thai font resolution, and selected shot assignment hash.
   - Without this, a completed job can be operationally visible but still impossible to diagnose at the creative preset layer.

14. Feature access projection must stay backward compatible.
   - Current shared contracts expose `flags.enabled`, `flags.tenantAllowed`, `flags.workerEnabled`, `flags.librarySaveEnabled`, `flags.operatorEnabled`, `flags.templateAllowlist`, and capability fields such as `canStartAuto`, `canPreview`, `canCancel`, `canSaveToLibrary`, `canInspectAsOperator`, and `canReplayAsOperator`.
   - Feature 120 should add creative/runtime availability as nested additive fields instead of renaming these fields.
   - Tenant rollout should continue through Admin Tenant Feature Flags and the existing HyperFrames flag group unless a new shared flag is explicitly added with tests.

15. Storyboard Review storage is JSON-first today.
   - `media_studio_storyboard_reviews` stores `reviewData` JSON with user/status/count/thumbnail columns and no dedicated product/run/HyperFrames assignment columns.
   - `videoEditorProjects` already normalizes canonical Marketplace links from `autoReviewRunId` and rejects mixed Auto Review run IDs.
   - Feature 120 should reuse that canonical-link validation and only promote to a companion table with a formal dual-read/backfill/cutover plan.

16. Security service boundaries already exist and should be extended.
   - `hyperframesCompositionSanitizer` strips executable HTML patterns, rejects unsafe/private asset refs, and redacts signed URLs, storage refs, local paths, tokens, and secrets.
   - `hyperframesAssetStagingService` produces tenant/run scoped staged manifests with asset hashes and cleanup policy.
   - `hyperframesQaService` has pre-render and post-render QA issue models for stale hashes, missing assets, subtitle safe area, playable output, duration/resolution mismatch, missing required audio, and output checksum.
   - Feature 120 should add new issue codes or manifest fields only where needed for audio/SFX/font/CSS/GSAP, not bypass these services.

17. Artifact and output kind enums are already constrained.
   - Current artifact kinds are `hyperframes_input_json`, `hyperframes_composition_html`, `hyperframes_snapshot`, `hyperframes_render_mp4`, `hyperframes_render_webm`, `hyperframes_subtitle_vtt`, `hyperframes_manifest`, and `hyperframes_sanitized_log`.
   - Current output kinds are `preview_video`, `final_video`, `snapshot`, and `library_item`.
   - Feature 120 should store creative sidecars under existing manifest/snapshot/render/subtitle/log kinds unless a schema migration updates shared contracts and all retention/operator/Library tests.

18. Contract version is a compatibility anchor.
   - Current shared schemas use `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION = "hyperframes_marketplace_auto_review_v1"`.
   - Render projections, runtime API outputs, Library finalize metadata, and router schemas use this literal.
   - Feature 120 should add creative schemas additively under this contract first; changing the literal is a migration, not a normal feature edit.

19. Current final composite timing is legacy absolute timing.
   - `HyperframesFinalCompositeConfig` accepts `shots[].startSec`, `durationSec`, and `subtitleCues[].startSec/endSec`.
   - Storyboard Review currently builds cue times from a running cursor, while the FFmpeg/ASS fallback computes its own cursor from shot order and clamps cues into each shot.
   - Feature 120 should introduce a server-normalized timeline so UI preview, HTML/GSAP, ASS fallback, audio mix, QA, and Library metadata cannot drift.

20. Product truth and ad policy already exist upstream.
   - Marketplace Auto Review already carries product truth, advertising rule packs, volatile-claim rules, privacy/evidence envelopes, and policy evidence refs.
   - Feature 120 should consume those persisted evidence refs for render-facing copy rather than reinterpreting raw marketplace text at render time.
   - User-edited overlay/subtitle/voiceover text still needs claim safety validation before final render or Library save.

### 19.3 Required Compatibility Bridge

Implementation should not break current final composite API immediately. Add a bridge:

```text
Current request:
  CreateHyperframesFinalCompositeInput.config
    overlayPreset
    subtitlePreset
    styleBrief
    hookText
    supportingText
    shots[]
      overlayPreset
      animationPreset
      transition
      onScreenText
      subtitleCues

Bridge:
  resolveHyperframesCreativePlanFromFinalCompositeConfig(config)

Target request:
  creativePlan
    overlayPresetId
    subtitlePresetId
    audioPackPresetId
    presetVersions
    variables
      perShotText[]
      sfxTimelineDrafts[]
    audioEvents
    sourceRefs
```

Bridge rules:

- current enum ids map through explicit alias table;
- new registry ids are stored in the target creative plan;
- unknown ids fail validation unless they are explicitly mapped aliases;
- platform profile settings win over ad hoc width/height/fps unless the request stores an explicit override reason;
- the bridge writes a deterministic `creativePlanHash`;
- final render idempotency includes both the legacy config hash and the creative plan hash during migration;
- per-shot overlay preset, animation preset, transition, overlay copy, and
  subtitle/voiceover copy must survive the bridge and be visible in prompt,
  payload preview, HTML composition, and Library metadata;
- SFX timeline drafts must resolve into deterministic `audioEvents` with target
  shot, trigger, offset, duration, volume, and role preserved before render;
- UI can keep showing the current compact panel while backend stores the richer plan.

### 19.4 Files Expected To Change During Implementation

Likely implementation files:

- `apps/web/shared/hyperframes/creativePresets.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/server/services/hyperframesCompositionService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/workers/hyperframesRenderWorker.ts`
- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesWorkerPolicy.test.ts`
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`

Likely new tests:

- creative preset registry uniqueness and lifecycle
- alias resolution from legacy preset ids
- creative plan schema validation
- audio event map timing validation
- audio asset license/source/checksum validation
- platform profile versus manual width/height/fps override validation
- render manifest output URL requirement
- completed render projection includes safe final video output ref
- product/run/storyboard provenance binding validation
- shot media assignment persistence and reload behavior
- scoped Storyboard Review storage merge and stale revision conflict behavior
- companion-table migration dry-run/backfill/dual-read/dual-write/cutover/rollback behavior when storage is promoted
- identity resolution rejects title/latest/thumbnail/media-similarity fallback paths
- route refresh/resume behavior for final composite render jobs
- Thai font runtime diagnostics and fallback behavior
- creative feature access/credit projection and duplicate no-charge behavior
- tenant flag/env guard matrix for creative presets, final render, Library save, and operator actions
- backward-compatible feature access projection with additive creative capability fields
- sanitizer/staging/QA tests for Feature 120 audio/SFX/font/CSS/GSAP inputs
- artifact/output kind compatibility tests for Feature 120 sidecar mapping and enum migration behavior
- contract-version compatibility tests for existing Feature 119 projections and Library metadata after Feature 120 schema additions
- normalized timeline tests for shot order, cue bounds, audio event bounds, duration drift, timeline hash stability, and no silent cue clamping in final render
- evidence-bound copy tests for supported specs, stale volatile claims, user edits, instruction-like marketplace text, omitted claims, and Library copy/evidence hash metadata
- legacy Storyboard Review audit, repair, and delete-only cleanup behavior
- runtime API schema and app-router shape tests for creative preset/state/final render procedures
- Library metadata includes creative preset and audio metadata without changing the existing HyperFrames source
- fallback quality warning behavior
- preset capability projection hides or warns for official-runtime-required presets when only diagnostic fallback is available
- operator diagnostics, replay, cancel, repair, and preset disable/enable honor creative plan/runtime hashes and permission gates
- retention dry-run and purge preserve Library outputs while expiring preview-only creative artifacts
- metrics/log projections include creative preset, runtime capability, fallback quality, Thai font, audio, output probe, and Library finalize dimensions
- fixture snapshot presence for selected overlay/subtitle presets
- final MP4 has audio when audio policy enables it

### 19.5 Codebase-Specific Design Decision

Do not replace Feature 119's template/render adapter. Feature 120 should be an additive creative contract layer above it:

```text
Feature 119:
  render adapter, worker, template registry, artifacts, runtime state

Feature 120:
  creative preset registry, text variables, subtitle style, audio event map,
  prompt packs, preview fidelity, and creative QA
```

This keeps the system aligned with the existing Marketplace Auto Review architecture and prevents HyperFrames creative choices from leaking into product capture, product truth, or provider video generation responsibilities.

---

## 20. Research Summary

Text overlay research recommends treating text as motion typography with four layers: main media, title/hook, captions, and proof/CTA. It recommends Thai-compatible fonts, mobile safe margins, GSAP timelines, preset naming conventions, and rich preset prompt packs such as kinetic slam hooks, gradient product pop, electronics spec stacks, review cards, marker highlights, texture masks, parallax text, and price badges.

Audio/SFX research recommends treating sound as a six-track audio design system: voiceover, music, transition SFX, UI SFX, accent SFX, and ambience. It recommends audio event maps, volume defaults, ducking, timing rules for whoosh/click/notification/cash/riser events, and mood-based audio packs.

Official HyperFrames docs support the architecture: prompt packs are for agent authoring, while runtime render should use deterministic HTML, data attributes, variables, GSAP timelines, and audio elements.

---

## 21. Long-Term Direction

The long-term target is:

```text
Creative preset registry
  -> agent/template authoring with English HyperFrames prompts
  -> versioned composition templates
  -> variables surfaced to Storyboard Review / Studio
  -> preview through HyperFrames player or equivalent
  -> render through producer worker
  -> QA and media history provenance
```

This keeps SmartSpecPro aligned with HyperFrames as it evolves. New HyperFrames catalog components should be integrated by adding registry entries, template versions, QA fixtures, and adapter metadata, not by repeatedly patching one-off UI and worker branches.
