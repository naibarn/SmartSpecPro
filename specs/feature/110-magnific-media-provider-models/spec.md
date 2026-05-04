# Feature 110: Magnific Media Provider And Model Catalog Expansion

Version: 1.0
Date: 2026-05-04
Status: Proposed
Depends-on:
- 054-fal-ai-ltx-lux-models
- 063-MediaStudioContentComposer
- 098-auto-team-real-execution-and-media-completion
Audience: Media Studio, Media Providers, Model Registry, Python Gateway, Billing, QA

Reference:
- https://docs.magnific.com/introduction
- https://docs.magnific.com/llms.txt
- https://docs.magnific.com/llms-full.txt
- https://docs.magnific.com/api-reference/mystic/mystic
- https://docs.magnific.com/api-reference/text-to-image/post-seedream-v5-lite
- https://docs.magnific.com/api-reference/text-to-image/post-seedream-v5-lite-edit
- https://docs.magnific.com/api-reference/text-to-image/nano-banana-pro-flash/overview
- https://docs.magnific.com/api-reference/image-to-video/overview
- https://docs.magnific.com/api-reference/video/kling-v3/overview
- https://docs.magnific.com/api-reference/video/kling-v3-omni/overview
- https://docs.magnific.com/api-reference/text-to-video/veo-3-1/overview
- https://docs.magnific.com/api-reference/image-to-video/veo-3-1/overview
- https://docs.magnific.com/api-reference/reference-to-video/veo-3-1/overview
- https://docs.magnific.com/api-reference/text-to-video/wan-2-7/overview
- https://docs.magnific.com/api-reference/image-to-video/wan-2-7/overview
- https://docs.magnific.com/api-reference/reference-to-video/wan-2-7/overview
- https://docs.magnific.com/api-reference/video/video-upscaler-precision/overview

---

## 1. Executive Summary

Add Magnific as a first-class Media Provider in SmartSpecPro and seed the requested Magnific media models across image generation, image editing/enhancement, video generation, and video upscaling.

Magnific's public API uses:

- base URL `https://api.magnific.com`
- API-key auth through the `x-magnific-api-key` header
- mostly async task submission: POST creates a task, GET polls by task id, optional webhook URL receives completion updates

The integration must follow the existing media-provider architecture: provider template and seed data in the web app, model seed data in `media_models`, per-request Python provider clients, gateway routing by provider/model, Celery polling for async tasks, R2/S3 re-hosting for final assets, credit reservation/refund, and security validation for all user-supplied media URLs.

---

## 2. Problem Statement

SmartSpecPro already supports multiple media providers, but Magnific is not available as a provider option. Users cannot select Magnific-only workflows such as Mystic, Magnific upscaling, relight, style transfer, new Kling/Wan/Veo video models, or precision video upscaling from Media Studio.

The requested expansion needs more than a static model list because Magnific spans several endpoint families and response shapes:

1. text-to-image and image-edit tasks returning generated image URLs
2. image enhancement/editing tasks returning improved image URLs
3. text-to-video, image-to-video, reference-to-video, and motion-control tasks returning video URLs
4. video upscaler tasks returning enhanced video URLs
5. synchronous utility endpoints such as Remove Background returning immediate result URLs

Without a provider-level integration, these models would either be unreachable or would be routed through the wrong provider fallback path.

---

## 3. Product Goals

1. Add a `magnific` Media Provider with encrypted API-key storage and admin connection testing.
2. Seed all requested Magnific image, image-editing, video, and video-upscaler models.
3. Expose model-specific input fields in Media Studio without requiring users to hand-write JSON.
4. Submit Magnific tasks through the Python backend with normalized async responses.
5. Poll Magnific task status and persist final assets through the existing media task pipeline.
6. Preserve existing provider governance: tenant policy, provider enablement, billing, audit logging, and model allowlists.
7. Keep this integration additive and isolated from fal.ai, Kie.ai, BytePlus, WaveSpeed, ElevenLabs, and UVoice paths.

---

## 4. Non-Goals

This feature does not aim to:

- replace existing provider implementations
- add Magnific stock content, icons, classifier, image-to-prompt, improve-prompt, lip-sync, audio, Apps API, MCP, or x402 payments
- implement Magnific webhooks in the first release; polling is required, webhook forwarding can follow later
- change the generic media task table schema unless strictly required for provider task metadata
- implement model fine-tuning, LoRA training UI, or LoRA create/update/delete management; read-only Mystic LoRA discovery is in scope
- expose direct Magnific API keys to the browser

---

## 5. Provider Requirements

### 5.1 Provider Identity

| Field | Value |
| --- | --- |
| Provider name | `magnific` |
| Display name | Magnific |
| Base URL | `https://api.magnific.com` |
| Auth header | `x-magnific-api-key` |
| Supported media types | `image`, `video` |
| Dispatch mode | async task submission + polling |

Provider aliases accepted by backend normalization:

- `magnific`
- `magnific_api`
- `magnific-ai`
- `magnific_ai`

### 5.2 Provider Template And Seed Data

Add Magnific to:

- `apps/web/server/routers/mediaProviders.ts` provider templates
- `apps/web/scripts/seed-media-providers.ts` default providers
- provider readiness/admin tests
- admin help docs if provider help pages list provider-specific examples

The provider template must store:

- encrypted API key
- base URL override for non-production tests
- enabled/disabled state
- supported model ids
- test endpoint metadata

### 5.3 Connection Test

The admin connection test must validate the API key with an authenticated request. It must not use unauthenticated CORS preflight behavior as a success signal.

Acceptable probes:

- `GET /v1/ai/mystic`
- `GET /v1/ai/image-upscaler-precision`
- another documented list endpoint that requires the API key

Failures must return sanitized messages:

- invalid key
- rate limited
- provider unavailable
- network timeout
- unexpected provider response

---

## 6. Model Catalog

Credit costs are provisional until pricing is confirmed from the Magnific pricing page or admin override. Seed values must be explicitly marked `pricingStatus: "estimated"` and support admin edits.

### 6.1 Image Generation Models

| Model ID | Display Name | Category | Endpoint | Key Inputs |
| --- | --- | --- | --- | --- |
| `magnific/mystic` | Mystic | `text-to-image` | `POST /v1/ai/mystic` | `prompt`, `resolution`, `style_lora_id`, `character_lora_id`, `style_reference`, `structure_reference`, `webhook_url` |
| `magnific/seedream-v5-lite` | Seedream 5 Lite | `text-to-image` | `POST /v1/ai/text-to-image/seedream-v5-lite` | `prompt`, `aspect_ratio`, `seed`, `enable_safety_checker`, `webhook_url` |
| `magnific/seedream-v5-lite-edit` | Seedream 5 Lite Edit | `image-to-image` | `POST /v1/ai/text-to-image/seedream-v5-lite-edit` | `prompt`, `reference_images`, `aspect_ratio`, `seed`, `enable_safety_checker`, `webhook_url` |
| `magnific/nano-banana-pro` | Google Nano Banana Pro | `text-to-image` | `POST /v1/ai/text-to-image/nano-banana-pro` | `prompt`, `reference_images`, `aspect_ratio`, `resolution`, `use_google_search_tool`, `webhook_url` |
| `magnific/nano-banana-pro-flash` | Google Nano Banana Pro Flash | `text-to-image` | `POST /v1/ai/text-to-image/nano-banana-pro-flash` | `prompt`, `reference_images`, `aspect_ratio`, `resolution`, `use_google_search_tool`, `webhook_url` |
| `magnific/z-image-turbo` | Z-Image Turbo | `text-to-image` | `POST /v1/ai/text-to-image/z-image` | `prompt`, model-documented aspect/size controls, `webhook_url` |

Input constraints:

- Mystic supports 1K, 2K, and 4K output tiers.
- Seedream 5 Lite prompt max is 4096 characters and supports aspect-ratio presets such as `square_1_1`, `widescreen_16_9`, `social_story_9_16`, `portrait_2_3`, `traditional_3_4`, `standard_3_2`, `classic_4_3`, and `cinematic_21_9`.
- Seedream 5 Lite Edit requires 1-5 reference images and supports URL or base64 image input.
- Nano Banana Pro and Nano Banana Pro Flash support up to 3 reference images, aspect ratios including `1:1`, `16:9`, `9:16`, `21:9`, `2:3`, `3:2`, `4:3`, `3:4`, `5:4`, `4:5`, and resolutions `1K`, `2K`, `4K`.
- `use_google_search_tool` is allowed only on Nano Banana Pro models.

### 6.2 Image Upscaler And Enhancement Models

| Model ID | Display Name | Category | Endpoint | Key Inputs |
| --- | --- | --- | --- | --- |
| `magnific/upscaler-creative` | Upscaler - Magnific | `image-upscaler` | `POST /v1/ai/image-upscaler` | `image`, `prompt`, `scale`, creativity/detail controls, `webhook_url` |
| `magnific/relight` | Relight - Magnific | `image-relight` | `POST /v1/ai/image-relight` | `image`, lighting controls/prompt, `webhook_url` |
| `magnific/style-transfer` | Style Transfer - Magnific | `image-style-transfer` | `POST /v1/ai/image-style-transfer` | `image`, `style_image` or style prompt, `webhook_url` |
| `magnific/remove-background` | Remove Background | `remove-background` | `POST /v1/ai/beta/remove-background` | `image_url` |
| `magnific/image-expand` | Image Expand | `image-expand` | `POST /v1/ai/image-expand/seedream-v4-5` | `image`, `prompt`, `left`, `right`, `top`, `bottom`, `seed`, `webhook_url` |
| `magnific/skin-enhancer` | Skin Enhancer | `image-enhancement` | `POST /v1/ai/skin-enhancer/creative`, `POST /v1/ai/skin-enhancer/faithful`, `POST /v1/ai/skin-enhancer/flexible` | `image`, `mode`, `sharpen`, `smart_grain`, `skin_detail`, `optimized_for`, `webhook_url` |
| `magnific/change-camera` | Change Camera | `image-change-camera` | `POST /v1/ai/image-change-camera` | `image`, `horizontal_angle`, `vertical_angle`, `zoom`, `output_format`, `seed`, `webhook_url` |

Implementation notes:

- Remove Background is documented as a synchronous beta endpoint. It must bypass async polling and immediately re-host the returned temporary result URL.
- Remove Background accepts `image_url` and returns temporary URLs including `url`, `high_resolution`, and `preview`; result URLs expire quickly and must be downloaded immediately.
- Skin Enhancer has three standalone modes: Creative, Faithful, and Flexible. Model config may expose these as one model with a `mode` select or as three sub-model records, but the provider mapping must route to the correct endpoint.
- Change Camera accepts publicly accessible HTTPS images in JPG, PNG, and WebP, with `horizontal_angle` 0-360, `vertical_angle` -30 to 90, and `zoom` 0-10.

### 6.3 Video Generation Models

| Model ID | Display Name | Category | Endpoint Family | Key Inputs |
| --- | --- | --- | --- | --- |
| `magnific/kling-v3` | Kling 3 | `text-to-video` and `image-to-video` | `POST /v1/ai/video/kling-v3-pro`, `POST /v1/ai/video/kling-v3-std` | `prompt`, `negative_prompt`, `image_list`, `multi_shot`, `multi_prompt`, `element_list`, `aspect_ratio`, `duration`, `cfg_scale`, `webhook_url` |
| `magnific/kling-v3-omni` | Kling 3 Omni | `text-to-video`, `image-to-video`, `reference-to-video` | `POST /v1/ai/video/kling-v3-omni-pro`, `POST /v1/ai/video/kling-v3-omni-std`, `POST /v1/ai/reference-to-video/kling-v3-omni-pro`, `POST /v1/ai/reference-to-video/kling-v3-omni-std` | `prompt`, `image_url`, `end_image_url`, `image_urls`, `elements`, `video_url`, `multi_prompt`, `duration`, `webhook_url` |
| `magnific/kling-v3-motion-control` | Kling 3 Motion Control | `video-motion-control` | `POST /v1/ai/video/kling-v3-motion-control-std` and `POST /v1/ai/video/kling-v3-motion-control-pro` | `image_url`, `video_url`, `prompt`, `character_orientation`, `cfg_scale`, `webhook_url` |
| `magnific/kling-v2-6` | Kling 2.6 | `video-motion-control` | `POST /v1/ai/video/kling-v2-6-motion-control-std`, `POST /v1/ai/video/kling-v2-6-motion-control-pro` | `image_url`, `video_url`, `prompt`, `character_orientation`, `cfg_scale`, `webhook_url` |
| `magnific/wan-v2-7` | Wan 2.7 | `text-to-video`, `image-to-video`, `reference-to-video` | `POST /v1/ai/text-to-video/wan-2-7`, `POST /v1/ai/image-to-video/wan-2-7`, `POST /v1/ai/reference-to-video/wan-2-7` | `prompt`, `start_image_url`, `end_image_url`, `video_url`, `image_urls`, `video_urls`, `reference_voice`, `resolution`, `duration`, `aspect_ratio`, `webhook_url` |
| `magnific/veo-3-1-text-to-video` | Google Veo 3.1 Text to Video | `text-to-video` | `POST /v1/ai/text-to-video/veo-3-1`, `POST /v1/ai/text-to-video/veo-3-1-fast` | `prompt`, `negative_prompt`, `resolution`, `aspect_ratio`, `duration`, `generate_audio`, `seed`, `webhook_url` |
| `magnific/veo-3-1-image-to-video` | Google Veo 3.1 Image to Video | `image-to-video` | `POST /v1/ai/image-to-video/veo-3-1`, `POST /v1/ai/image-to-video/veo-3-1-fast` | `image`, `prompt`, `negative_prompt`, `resolution`, `aspect_ratio`, `duration`, `generate_audio`, `seed`, `webhook_url` |
| `magnific/veo-3-1-reference-to-video` | Google Veo 3.1 Reference to Video | `reference-to-video` | `POST /v1/ai/reference-to-video/veo-3-1` | `image_urls`, `prompt`, `negative_prompt`, `resolution`, `aspect_ratio`, `generate_audio`, `seed`, `webhook_url` |

Input constraints:

- Kling 3 supports T2V/I2V, Pro and Standard tiers, prompt max 2500 characters, `image_list` first/end frames, multi-shot up to 6 scenes, and total duration 3-15 seconds.
- Kling 3 Omni supports T2V/I2V/reference-to-video, Pro and Standard tiers, `elements` and reference images for consistency, and dedicated reference-to-video endpoints for `video_url` motion/style guidance.
- Kling 3 Motion Control requires `image_url` and `video_url`; reference video duration is 3-30 seconds, character image must be public and at least 300x300, and supported image formats include JPG/JPEG/PNG/WEBP.
- WAN 2.7 supports T2V and I2V at 720P/1080P with 2-15 second durations, plus reference-to-video with up to 5 combined image/video references and 2-10 second durations.
- Veo 3.1 supports text-to-video, image-to-video, and reference-to-video. T2V/I2V have Standard and Fast endpoints, 720p/1080p/4K, 4/6/8 second durations, optional generated audio, negative prompts, and seed.

### 6.4 Video Upscaler Models

| Model ID | Display Name | Category | Endpoint | Key Inputs |
| --- | --- | --- | --- | --- |
| `magnific/video-upscaler-precision` | Upscaler Precision | `video-upscaler` | `POST /v1/ai/video-upscaler-precision` | `video`, target output resolution (`720p`, `1k`, `2k`, `4k`), sharpening/grain/strength controls, optional FPS boost, `webhook_url` |

### 6.5 Seed Record Contract

Every Magnific `media_models` seed record must include enough metadata for routing, validation, pricing, and polling without hard-coded string guessing.

Required `configJson` fields:

| Field | Purpose |
| --- | --- |
| `providerModelId` | Provider-facing model or endpoint id used by `MagnificProvider` |
| `modelFamily` | Groups variants under the original requested model family |
| `endpoint.submit` | Exact POST path, for example `/v1/ai/text-to-video/veo-3-1-fast` |
| `endpoint.list` | Exact GET list path when available |
| `endpoint.status` | Status path template with `{taskId}` when async |
| `dispatchMode` | `async-polling` or `sync` |
| `resultType` | `image`, `video`, or `image-set` |
| `outputExtractors` | Ordered list of response paths to inspect for final URLs |
| `inputFields` | UI-visible fields and validation metadata |
| `validation` | Server-side limits for prompt length, counts, file formats, duration, resolution, size |
| `pricing` | Pricing matrix or flat provisional cost metadata |
| `readiness` | `verified`, `estimated-pricing`, or `disabled-contract-unverified` |
| `readinessReason` | Required when disabled or provisional |

Seed scripts must be idempotent by `modelId` and must update existing Magnific records without deleting admin-edited pricing, enabled state, or tenant policy overrides.

### 6.6 Required Variant Records

The seed script must create concrete records for the variants listed in Implementation Decision 15.5. Family alias rows such as `magnific/kling-v3` may exist for grouping or migration compatibility, but only concrete endpoint records should be selectable for generation.

Required default grouping:

- `modelFamily: "magnific/kling-v3"` for Kling 3 Pro and Standard
- `modelFamily: "magnific/kling-v3-omni"` for Omni generation and reference variants
- `modelFamily: "magnific/kling-v3-motion-control"` for Motion Control Pro and Standard
- `modelFamily: "magnific/kling-v2-6"` for Kling 2.6 Motion Control Pro and Standard
- `modelFamily: "magnific/veo-3-1"` for Veo T2V, T2V Fast, I2V, I2V Fast, and reference-to-video
- `modelFamily: "magnific/skin-enhancer"` for Creative, Faithful, and Flexible

### 6.7 Concrete Seed Matrix

The following records are required for phase one. Records marked `enabledDefault: true` may be enabled for regular users after the rollout gate passes. Records marked `enabledDefault: false` are admin-visible only until their readiness reason is resolved.

| Model ID | Family | Endpoint | Dispatch | Result | Enabled Default | Readiness |
| --- | --- | --- | --- | --- | --- | --- |
| `magnific/mystic` | `magnific/mystic` | `/v1/ai/mystic` | async-polling | image | true | estimated-pricing |
| `magnific/seedream-v5-lite` | `magnific/seedream-v5-lite` | `/v1/ai/text-to-image/seedream-v5-lite` | async-polling | image | true | estimated-pricing |
| `magnific/seedream-v5-lite-edit` | `magnific/seedream-v5-lite` | `/v1/ai/text-to-image/seedream-v5-lite-edit` | async-polling | image | true | estimated-pricing |
| `magnific/nano-banana-pro` | `magnific/nano-banana-pro` | `/v1/ai/text-to-image/nano-banana-pro` | async-polling | image | true | estimated-pricing |
| `magnific/nano-banana-pro-flash` | `magnific/nano-banana-pro` | `/v1/ai/text-to-image/nano-banana-pro-flash` | async-polling | image | true | estimated-pricing |
| `magnific/z-image-turbo` | `magnific/z-image-turbo` | `/v1/ai/text-to-image/z-image` | async-polling | image | true | estimated-pricing |
| `magnific/upscaler-creative` | `magnific/upscaler-creative` | `/v1/ai/image-upscaler` | async-polling | image | true | estimated-pricing |
| `magnific/relight` | `magnific/relight` | `/v1/ai/image-relight` | async-polling | image | true | estimated-pricing |
| `magnific/style-transfer` | `magnific/style-transfer` | `/v1/ai/image-style-transfer` | async-polling | image | true | estimated-pricing |
| `magnific/remove-background` | `magnific/remove-background` | `/v1/ai/beta/remove-background` | sync | image-set | true | estimated-pricing |
| `magnific/image-expand` | `magnific/image-expand` | `/v1/ai/image-expand/seedream-v4-5` | async-polling | image | true | estimated-pricing |
| `magnific/skin-enhancer-creative` | `magnific/skin-enhancer` | `/v1/ai/skin-enhancer/creative` | async-polling | image | true | estimated-pricing |
| `magnific/skin-enhancer-faithful` | `magnific/skin-enhancer` | `/v1/ai/skin-enhancer/faithful` | async-polling | image | true | estimated-pricing |
| `magnific/skin-enhancer-flexible` | `magnific/skin-enhancer` | `/v1/ai/skin-enhancer/flexible` | async-polling | image | true | estimated-pricing |
| `magnific/change-camera` | `magnific/change-camera` | `/v1/ai/image-change-camera` | async-polling | image | true | estimated-pricing |
| `magnific/kling-v3-pro` | `magnific/kling-v3` | `/v1/ai/video/kling-v3-pro` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-standard` | `magnific/kling-v3` | `/v1/ai/video/kling-v3-std` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-omni-pro` | `magnific/kling-v3-omni` | `/v1/ai/video/kling-v3-omni-pro` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-omni-standard` | `magnific/kling-v3-omni` | `/v1/ai/video/kling-v3-omni-std` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-omni-reference-pro` | `magnific/kling-v3-omni` | `/v1/ai/reference-to-video/kling-v3-omni-pro` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-omni-reference-standard` | `magnific/kling-v3-omni` | `/v1/ai/reference-to-video/kling-v3-omni-std` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-motion-control-pro` | `magnific/kling-v3-motion-control` | `/v1/ai/video/kling-v3-motion-control-pro` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v3-motion-control-standard` | `magnific/kling-v3-motion-control` | `/v1/ai/video/kling-v3-motion-control-std` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v2-6-motion-control-pro` | `magnific/kling-v2-6` | `/v1/ai/video/kling-v2-6-motion-control-pro` | async-polling | video | true | estimated-pricing |
| `magnific/kling-v2-6-motion-control-standard` | `magnific/kling-v2-6` | `/v1/ai/video/kling-v2-6-motion-control-std` | async-polling | video | true | estimated-pricing |
| `magnific/wan-v2-7-text-to-video` | `magnific/wan-v2-7` | `/v1/ai/text-to-video/wan-2-7` | async-polling | video | true | estimated-pricing |
| `magnific/wan-v2-7-image-to-video` | `magnific/wan-v2-7` | `/v1/ai/image-to-video/wan-2-7` | async-polling | video | true | estimated-pricing |
| `magnific/wan-v2-7-reference-to-video` | `magnific/wan-v2-7` | `/v1/ai/reference-to-video/wan-2-7` | async-polling | video | true | estimated-pricing |
| `magnific/veo-3-1-text-to-video` | `magnific/veo-3-1` | `/v1/ai/text-to-video/veo-3-1` | async-polling | video | true | estimated-pricing |
| `magnific/veo-3-1-text-to-video-fast` | `magnific/veo-3-1` | `/v1/ai/text-to-video/veo-3-1-fast` | async-polling | video | true | estimated-pricing |
| `magnific/veo-3-1-image-to-video` | `magnific/veo-3-1` | `/v1/ai/image-to-video/veo-3-1` | async-polling | video | true | estimated-pricing |
| `magnific/veo-3-1-image-to-video-fast` | `magnific/veo-3-1` | `/v1/ai/image-to-video/veo-3-1-fast` | async-polling | video | true | estimated-pricing |
| `magnific/veo-3-1-reference-to-video` | `magnific/veo-3-1` | `/v1/ai/reference-to-video/veo-3-1` | async-polling | video | true | estimated-pricing |
| `magnific/video-upscaler-precision` | `magnific/video-upscaler-precision` | `/v1/ai/video-upscaler-precision` | async-polling | video | true | estimated-pricing |

### 6.8 Output Extractor Defaults

Each model config must include output extractors. Use these defaults unless the endpoint page documents a stricter response shape:

| Result Type | Ordered Extractors |
| --- | --- |
| image | `data.generated[]`, `data.image_url`, `data.url`, `data.output_url`, `generated[]`, `image_url`, `url`, `output_url` |
| image-set | `data.url`, `data.high_resolution`, `data.preview`, `url`, `high_resolution`, `preview` |
| video | `data.video_url`, `data.output_url`, `data.generated[]`, `video_url`, `output_url`, `generated[]` |

If a completed response contains multiple valid URLs, the provider must:

1. choose the highest-quality primary URL for the main result
2. preserve secondary URLs in non-primary result metadata after re-hosting
3. never return provider-hosted URLs directly to users

### 6.9 Validation Matrix

Server validation must be generated from config but must enforce at least these provider-specific constraints:

| Family | Required Inputs | Important Limits |
| --- | --- | --- |
| Mystic | `prompt` | resolution `1K`, `2K`, `4K`; optional LoRA ids only from cache or explicit admin/user text input |
| Seedream 5 Lite | `prompt` | prompt max 4096; aspect ratios from Seedream preset list; seed 0-4294967295 |
| Seedream 5 Lite Edit | `prompt`, `reference_images` | 1-5 reference images; JPG/JPEG/PNG; max 10MB each |
| Nano Banana Pro/Flash | `prompt` | prompt 2-3000 chars; up to 3 references; resolution `1K`, `2K`, `4K`; Google Search toggle allowed |
| Remove Background | `image_url` | sync only; JPG/PNG; max 20MB; output temporary URLs must be downloaded immediately |
| Skin Enhancer | `image` | `sharpen`, `smart_grain`, `skin_detail` 0-100; `optimized_for` only on Flexible |
| Change Camera | `image` | horizontal angle 0-360; vertical angle -30 to 90; zoom 0-10 |
| Kling 3 / Omni | `prompt` or documented reference inputs | prompt max 2500; duration 3-15 seconds; multi-shot max 6 scenes |
| Kling Motion Control | `image_url`, `video_url` | image min 300x300 and max 10MB; video 3-30 seconds; `cfg_scale` 0-1 |
| WAN 2.7 | `prompt` or documented reference inputs | T2V/I2V duration 2-15 seconds; reference-to-video duration 2-10 seconds; 720P/1080P |
| Veo 3.1 | `prompt` plus image/reference fields by mode | prompt max 20000; duration 4/6/8; resolution 720p/1080p/4K; aspect ratio 16:9/9:16 |
| Video Upscaler Precision | `video` | resolution 720p/1k/2k/4k; sharpen/grain/strength controls 0-100; optional FPS boost |

### 6.10 Endpoint Metadata Rules

For standard Magnific async endpoints, derive metadata as:

- `endpoint.submit = "/v1/ai/<family>/<model>"`
- `endpoint.list = endpoint.submit`
- `endpoint.status = endpoint.submit + "/{taskId}"`

For sync endpoints:

- `endpoint.submit` is required
- `endpoint.list` is omitted
- `endpoint.status` is omitted
- `dispatchMode = "sync"`

For endpoints with separate family paths, use the concrete path from the seed matrix. The provider must not infer `text-to-video`, `image-to-video`, `reference-to-video`, `video`, or `beta` path segments from category names.

`webhook_url` may exist in provider docs and model config for future compatibility, but phase one UI must not expose arbitrary user-editable webhook URLs. If the platform already has a trusted internal callback URL, only the server may inject it.


---

## 7. API Contract

### 7.1 Submission

Create `python-backend/app/llm_proxy/providers/magnific_provider.py` with:

- `generate_image(model_id, payload)`
- `edit_image(model_id, payload)`
- `generate_video(model_id, payload)`
- `upscale_video(model_id, payload)`
- `remove_background(payload)` for synchronous background removal
- `get_task_status(model_id, task_id, media_type)`
- `aclose()`

Provider implementation must use an explicit endpoint registry built from model config or provider constants. It must not build endpoint paths by string concatenation from display names.

Every async submission returns a normalized response:

```json
{
  "provider": "magnific",
  "model": "magnific/mystic",
  "provider_task_id": "task-id-from-magnific",
  "status": "IN_PROGRESS",
  "data": []
}
```

Synchronous endpoints such as Remove Background return a normalized completed response and must immediately download/re-host any temporary provider URLs before returning to callers.

### 7.2 Polling

The Celery polling branch must:

1. identify Magnific tasks by normalized model id
2. call the correct Magnific GET endpoint for the submitted model
3. map provider states to internal states
4. extract final image/video URLs
5. download and re-host final assets to R2/S3 before user delivery
6. store raw provider metadata only after secret and prompt-sensitive data are removed

Synchronous Magnific tasks must not be inserted as long-running polling tasks unless the existing media pipeline requires a short-lived internal task record for audit consistency.

State normalization:

| Magnific Status | Internal Status |
| --- | --- |
| `CREATED` | `queued` |
| `IN_PROGRESS` | `processing` |
| `COMPLETED` | `completed` |
| `FAILED` | `failed` |
| `CANCELLED` / `CANCELED` | `failed` |

### 7.3 Result Extraction

Support documented output shapes:

- `data.generated[]` for image generation/editing
- Remove Background synchronous response fields `url`, `high_resolution`, and `preview`
- `data.video_url`, `data.output_url`, or equivalent documented video fields for video results
- preserve `task_id`, `status`, output dimensions, duration, and provider timing when available

Unknown completed result shapes must fail closed with a sanitized error and debug-only structured metadata.

### 7.4 Provider Task Metadata And Idempotency

For async submissions, store provider metadata in the internal media task record:

- `provider: "magnific"` when the schema supports it; otherwise infer provider from `model`
- `provider_task_id`
- `provider_model_id`
- `model_family`
- `submit_endpoint`
- `status_endpoint`
- `dispatch_mode`
- `submitted_at`
- `last_polled_at`
- `next_poll_at`
- `poll_attempts`
- sanitized provider status and terminal reason

Duplicate-submission protection must hash the normalized request shape before submission. The hash must include:

- tenant/user id
- normalized `modelId`
- prompt and negative prompt
- sanitized source asset identifiers, not raw signed URLs
- model-specific controls that change output

The duplicate hash must not include provider API keys, signed URL query strings, transient upload URLs, or webhook URLs.

### 7.5 Polling Policy

Magnific polling must follow a bounded backoff policy:

| Task Type | First Poll | Base Interval | Max Interval | Timeout |
| --- | --- | --- | --- | --- |
| image generation/edit/enhancement | 2s | 3s | 20s | 15m |
| video generation | 5s | 10s | 60s | 60m |
| video upscaler | 10s | 20s | 90s | 90m |

Polling must:

- honor provider `Retry-After` headers when present
- retry transient 429/5xx/network timeout responses with backoff
- mark terminal provider failures as failed without leaking raw provider bodies
- refund credits on terminal failure or timeout under existing media job policy
- stop polling immediately after successful re-hosting

### 7.6 Asset Normalization

Before provider submission:

1. Local uploads and library assets must be converted to provider-accessible HTTPS URLs or documented base64 payloads.
2. Signed internal URLs must be short-lived and scoped only to the source asset.
3. Provider-facing URLs must pass outbound SSRF validation after redirect resolution.

After provider completion:

1. Download provider result URLs immediately.
2. Validate content type and size before storing.
3. Re-host results to platform storage.
4. Persist only platform URLs in user-visible result payloads.
5. Store provider URLs only in redacted/debug metadata when needed for diagnostics.

---

## 8. Media Studio UX Requirements

1. Magnific models appear only when provider is enabled and model is enabled.
2. Model-specific fields render from `configJson.inputFields`.
3. Reference images use existing library/file picker controls, not raw JSON.
4. Motion-control video models must render both image and video reference pickers.
5. Reference-to-video models must render multi-reference image/video pickers with provider caps.
6. Seed fields use numeric inputs with documented min/max.
7. Aspect ratio, resolution, duration, and quality tier fields use selects.
8. Boolean controls such as safety checker, Google Search grounding, generated audio, prompt expansion, and FPS boost use toggles.
9. Image expand exposes four directional number inputs: left, right, top, bottom.
10. Skin Enhancer exposes a mode select and only shows mode-specific controls for the selected mode.
11. Change Camera exposes sliders or numeric steppers for horizontal angle, vertical angle, and zoom.
12. Provider-specific advanced controls are hidden by default but available in an advanced section.
13. Disabled/provisional models show an admin-visible readiness reason but are hidden from regular users.

---

## 9. Billing Requirements

1. Seed provisional `creditCost` values for every model.
2. Add a pricing config object per model so admin overrides do not require code changes.
3. For duration/resolution video models, reserve credits from requested `duration` and `resolution`.
4. If Magnific returns actual duration/resolution, reconcile after completion and refund over-reservation.
5. Failed, cancelled, timed-out, or provider-rejected tasks must refund reserved credits according to current media job policy.
6. Do not trust client-declared cost fields.

### 9.1 Provisional Credit Defaults

Until official Magnific pricing is entered by an admin, seed these conservative defaults. Values are intentionally high enough to protect platform cost during beta rollout and must be editable from Admin Media Models.

| Model Group | Default Credits | Pricing Mode |
| --- | ---: | --- |
| text-to-image standard | 40 | flat per image |
| text-to-image premium or 4K-capable | 120 | resolution matrix |
| image edit/enhancement | 80 | flat per image |
| Remove Background | 20 | flat synchronous operation |
| image upscaler creative | 120 | scale/resolution matrix |
| video generation standard | 600 | duration/resolution matrix |
| video generation pro/premium | 1200 | duration/resolution matrix |
| video reference/motion-control | 1500 | duration/tier matrix |
| video upscaler precision | 2000 | resolution/frame-estimate matrix |

Default pricing matrix for duration/resolution video models:

| Resolution | Standard Credits/Sec | Pro/Premium Credits/Sec |
| --- | ---: | ---: |
| 720p | 80 | 140 |
| 1080p | 120 | 220 |
| 4K | 320 | 520 |

Default pricing matrix for video upscaler precision:

| Resolution | Credits/Sec Estimate | Notes |
| --- | ---: | --- |
| 720p | 80 | provisional frame-based estimate |
| 1k | 120 | provisional frame-based estimate |
| 2k | 200 | provisional frame-based estimate |
| 4k | 420 | provisional frame-based estimate |

For frame-based provider pricing, estimate initial reservation from `duration * fpsEstimate * perFrameCredit`. If input duration or FPS cannot be determined before submission, reserve the configured default `creditCost` and reconcile after metadata is known.

### 9.2 Credit Reconciliation Rules

1. Pre-reserve credits before provider submission.
2. Store `reservedCredits`, `pricingSnapshot`, and normalized request pricing inputs on the job.
3. On successful completion, recompute actual cost from provider output metadata when available.
4. Refund over-reservation automatically.
5. Do not auto-charge more than the reserved amount without an explicit second charge path and audit record.
6. On provider failure, validation failure after reservation, timeout, or re-hosting failure, refund under the existing media job refund policy.
7. Sync Remove Background must reserve, execute, re-host, and finalize/refund in one request lifecycle.

---

## 10. Security And Abuse Controls

1. Validate every user-supplied URL before sending it to Magnific.
2. Reject private, loopback, link-local, metadata-service, and internal hostnames.
3. Do not allow `host.docker.internal` or local development exceptions on outbound provider URL fields.
4. Enforce HTTPS for provider-facing media URLs unless a documented base64 path is used.
5. Enforce size and format constraints before submission when documented.
6. Strip or reject HTML/XML-like prompt content if existing provider policy requires prompt sanitization.
7. Sanitize provider errors; never surface raw provider response bodies that may include prompt text or signed URLs.
8. Never log API keys, auth headers, signed media URLs, base64 image data, or webhook secrets.
9. Add per-user concurrency limits for long-running Magnific video and upscaler tasks.
10. Re-host final Magnific CDN URLs to platform storage before presenting them to the user.
11. Validate redirect chains; every redirect target must remain public HTTPS.
12. Enforce content-type and magic-byte checks for downloaded provider results.
13. Reject or downscope user-supplied `webhook_url`; phase one should not forward arbitrary user webhook URLs to Magnific.
14. Apply per-tenant and per-user quotas for async Magnific tasks, including separate lower limits for video and video upscaler jobs.
15. Do not persist base64 media inputs beyond the existing request/job lifecycle.

---

## 11. Implementation Plan

### Phase 1: Provider Foundation

1. Add provider template and seed data for `magnific`.
2. Add admin connection test.
3. Add Python `MagnificProvider` with auth, base URL validation, timeouts, error handling, and `aclose()`.
4. Export provider from `python-backend/app/llm_proxy/providers/__init__.py`.
5. Add provider id normalization in gateway code.

### Phase 2: Model Registry

1. Create `apps/web/scripts/seed-media-models-magnific.ts`.
2. Seed all requested models with `enabled: false` for endpoint-provisional models and `enabled: true` for verified endpoints.
3. Add static fallback model registry entries if the app has a DB-unavailable model fallback.
4. Add configJson input fields for each model category.
5. Add endpoint/status/result extractor metadata to every model record.
6. Add tests for seed idempotency, admin override preservation, and model shape.

### Phase 3: Routing And Polling

1. Route Magnific image models in `generate_image`.
2. Route image-edit/enhancement tasks through the image generation path or a dedicated edit path, matching existing architecture.
3. Route video generation models in `generate_video`.
4. Route video upscaler through the video generation/media task path with category `video-upscaler`.
5. Add synchronous handling for Remove Background.
6. Add Magnific polling branch in `media_tasks.py`.
7. Add result re-hosting and normalized final response handling.

### Phase 4: UX And Validation

1. Verify Media Studio renders all new field types.
2. Add or reuse `image_urls`, `video_urls`, select, number, boolean, and structured array field support.
3. Add server-side payload validation per model category.
4. Add user-facing validation messages for missing references, invalid durations, invalid resolutions, invalid mode-specific fields, and too many reference images/videos.

### Phase 5: Hardening And Rollout

1. Add unit tests for provider submission, polling, status mapping, and error sanitization.
2. Add SSRF tests for image/video/reference URL fields.
3. Add billing reservation/refund tests.
4. Gate rollout behind provider/model enablement.
5. Document rollback: disable provider, disable models, stop polling new Magnific submissions.

### Phase 6: Observability And Operations

1. Add structured logs for submit, poll, completion, re-hosting, refunds, provider errors, and timeouts.
2. Add metrics for queue age, poll attempts, provider latency, success/failure rate, timeout count, and re-hosting failures.
3. Add admin-visible readiness diagnostics for missing API key, disabled provider, disabled model, unverified endpoint, pricing estimate, and last connection-test result.
4. Add a rollback runbook with SQL/admin steps to disable Magnific provider and models without deleting seeded records.

### Phase 7: Release Gates

1. Run seed dry-run and verify all model ids, endpoint paths, readiness values, and pricing defaults.
2. Run unit tests for provider auth, submission payloads, sync Remove Background, async polling, result extraction, and sanitized errors.
3. Run SSRF tests for image, video, audio, reference image, reference video, light map, style reference, structure reference, and webhook fields.
4. Run billing tests for reservation, refund, timeout refund, re-hosting failure refund, and admin pricing override.
5. Run a staging smoke test with at least one enabled image model, one sync model, one video model, and one video upscaler if API quota allows.
6. Confirm no provider-hosted URLs are visible in user-facing responses.

### Phase 8: Rollout And Rollback

Rollout sequence:

1. Merge code with Magnific provider disabled.
2. Run seed script in production; models are inserted but provider remains disabled.
3. Configure encrypted Magnific API key in Admin Media Providers.
4. Run authenticated provider connection test.
5. Enable one low-cost image model for admins only.
6. Verify submit, poll, re-host, billing, and history display.
7. Enable remaining image/edit models.
8. Enable video models with conservative concurrency caps.
9. Enable video upscaler precision last.

Rollback sequence:

1. Disable Magnific provider in Admin Media Providers.
2. Disable all `provider = 'magnific'` media models.
3. Stop scheduling new Magnific submissions.
4. Let already-submitted jobs continue polling unless provider credentials are revoked or costs must be stopped immediately.
5. If immediate stop is required, mark in-flight Magnific tasks as failed with refund and terminal reason `provider_disabled_rollback`.
6. Keep seeded records for audit and future re-enable; do not delete model rows.

---

## 12. Files Expected To Change

| Area | Files |
| --- | --- |
| Provider admin | `apps/web/server/routers/mediaProviders.ts`, `apps/web/scripts/seed-media-providers.ts`, provider tests |
| Model seeding | `apps/web/scripts/seed-media-models-magnific.ts`, seed tests |
| UI/model inputs | `apps/web/client/src/lib/mediaModelInputs.ts`, `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`, related tests if new field support is needed |
| Backend provider | `python-backend/app/llm_proxy/providers/magnific_provider.py`, `python-backend/app/llm_proxy/providers/__init__.py` |
| Gateway routing | `python-backend/app/llm_proxy/gateway_unified.py` |
| Async polling | `python-backend/app/tasks/media_tasks.py` |
| Validation/security | existing media URL validators and provider-specific validation tests |
| Billing | media model pricing helpers and backend credit reconciliation tests |
| Observability/ops | existing logging, metrics, virtual admin/media pipeline diagnostics, rollout docs |

---

## 13. Acceptance Criteria

1. Admin Media Providers includes Magnific with encrypted API-key storage.
2. Magnific connection test fails for invalid keys and succeeds only with an authenticated provider response.
3. All requested model records are seeded with stable model ids and provider `magnific`.
4. Verified endpoint models can be enabled from Admin Media Models.
5. Provisional endpoint models are disabled by default with a clear readiness note.
6. Media Studio renders correct inputs for image, image-edit, video, motion-control, and video-upscaler models.
7. Python backend submits Magnific tasks with `x-magnific-api-key`.
8. Submitted tasks store Magnific `task_id` in the internal media task record.
9. Polling maps Magnific statuses to internal statuses.
10. Completed image outputs are re-hosted and returned as platform URLs.
11. Completed video outputs are re-hosted and returned as platform URLs.
12. Remove Background returns synchronously, re-hosts temporary provider URLs immediately, and does not require polling.
13. Failed provider responses produce sanitized user-facing errors.
14. URL validation rejects internal/private destinations for all image/video/reference URL fields.
15. Credit reservation and refund behavior is covered by tests.
16. Distinct endpoint/pricing variants are seeded as distinct model records and grouped by `modelFamily`.
17. `magnific/image-expand` uses Seedream 4.5 Image Expand as the default backend.
18. Magnific webhook support is not required in phase one; polling is the production path.
19. Every enabled Magnific model has explicit submit/status endpoint metadata and output extractors.
20. Polling obeys bounded backoff, provider `Retry-After`, timeout, and refund behavior.
21. Seed scripts preserve admin-edited enabled state and pricing on re-run.
22. Provider result URLs are never returned directly to users after completion; platform-hosted URLs are returned.
23. Observability emits submit, poll, completion, failure, timeout, and re-hosting events without secrets.
24. Existing fal.ai, Kie.ai, BytePlus, WaveSpeed, ElevenLabs, and UVoice tests still pass.

---

## 14. Verification Commands

Use the repository's current package manager/test conventions. Expected checks:

```bash
pnpm --dir apps/web test -- mediaProviders
pnpm --dir apps/web test -- mediaModelInputs
pnpm --dir apps/web tsx scripts/seed-media-models-magnific.ts --dry-run
pnpm --dir apps/web test -- seed-media-models-magnific
pytest python-backend/tests/unit/services/test_magnific_provider.py -v
pytest python-backend/tests/unit/services/test_magnific_ssrf.py -v
pytest python-backend/tests/tasks/test_media_tasks_magnific.py -v
pytest python-backend/tests/tasks/test_media_tasks_magnific_polling_policy.py -v
```

### 14.1 Test Matrix

| Area | Required Tests |
| --- | --- |
| Provider admin | template includes Magnific; encrypted API key saves; invalid key fails; authenticated list probe succeeds |
| Seed script | inserts all concrete records; dry-run prints changes; rerun is idempotent; admin `enabled` and pricing overrides survive |
| Model config | every enabled model has submit endpoint, status endpoint for async, output extractors, validation, pricing, readiness |
| UI inputs | references use pickers; mode/tier variants group by family; disabled/provisional models hidden from regular users |
| Submission | auth header set; endpoint path exact; unknown model rejected; arbitrary webhook URL stripped or ignored |
| Sync flow | Remove Background reserves credits, calls provider, downloads temporary URL, re-hosts, finalizes without polling |
| Async flow | task id stored; status maps correctly; Retry-After honored; timeout fails/refunds; completion re-hosts |
| Security | private IPs, loopback, metadata IP, host.docker.internal, redirect-to-private, oversized files, bad MIME, signed URL logging |
| Billing | flat, duration, resolution, and frame-estimate reservations; refund on failure; no unapproved overcharge |
| Observability | logs/metrics emitted with model id, provider task id, terminal reason, no secrets or raw signed URLs |
| Regression | existing fal.ai, Kie.ai, BytePlus, WaveSpeed, ElevenLabs, and UVoice provider tests still pass |

---

## 15. Implementation Decisions

These decisions are the default implementation path. Do not re-open them during implementation unless Magnific removes or changes the referenced endpoint.

### 15.1 Pricing

Use provisional credits in the seed script until official Magnific pricing is confirmed.

Default conversion:

- `creditCost = ceil(providerPriceUsdOrEur * 1000)`
- minimum cost is 1 credit
- duration/resolution models use a pricing matrix in `configJson.pricing`
- admin-edited pricing always overrides seeded provisional values

All seeded Magnific models must include:

- `pricingStatus: "estimated"`
- `pricingSource: "magnific-docs-or-admin"`
- `pricingLastReviewedAt`

### 15.2 Webhooks

Do not implement Magnific inbound webhooks in phase one.

Use polling for all async Magnific endpoints because SmartSpecPro already has a Celery media task polling path. The provider may still send `webhook_url` only when a later webhook bridge exists; phase one should omit it unless the existing platform has a stable internal callback URL.

### 15.3 Mystic LoRA UX

Expose Mystic LoRAs as a cached server-side selector in Media Studio.

Implementation default:

1. Add a backend/admin helper that calls `GET /v1/ai/loras`.
2. Cache LoRA metadata with a short TTL.
3. Render `style_lora_id` and `character_lora_id` as selects when cache data is available.
4. Fall back to optional text inputs for LoRA ids if the provider is unavailable.

Do not add LoRA training UI in this feature.

### 15.4 Image Expand Backend

Use Seedream 4.5 Image Expand as the default backend for `magnific/image-expand`.

Rationale:

- it supports directional expansion
- it supports optional prompt guidance
- it supports auto-prompt behavior when prompt is omitted
- it supports seed-based reproducibility

Mapping:

| SmartSpecPro Model ID | Default Endpoint |
| --- | --- |
| `magnific/image-expand` | `POST /v1/ai/image-expand/seedream-v4-5` |

Do not expose Flux Pro, Ideogram, or backend selection in regular user UI for phase one. Admins may add separate model records later if they want multiple expand backends.

### 15.5 Variant Modeling

Seed distinct model records for distinct provider endpoint/pricing variants, and group them with `modelFamily`.

Use this rule:

- separate model records when the endpoint differs and cost/latency/quality meaningfully differs
- one model record with a select field when the same endpoint changes behavior through a simple parameter and pricing remains effectively the same

Required distinct records:

| Model Family | Records |
| --- | --- |
| `magnific/kling-v3` | `magnific/kling-v3-pro`, `magnific/kling-v3-standard` |
| `magnific/kling-v3-omni` | `magnific/kling-v3-omni-pro`, `magnific/kling-v3-omni-standard`, `magnific/kling-v3-omni-reference-pro`, `magnific/kling-v3-omni-reference-standard` |
| `magnific/kling-v3-motion-control` | `magnific/kling-v3-motion-control-pro`, `magnific/kling-v3-motion-control-standard` |
| `magnific/kling-v2-6` | `magnific/kling-v2-6-motion-control-pro`, `magnific/kling-v2-6-motion-control-standard` |
| `magnific/veo-3-1-text-to-video` | `magnific/veo-3-1-text-to-video`, `magnific/veo-3-1-text-to-video-fast` |
| `magnific/veo-3-1-image-to-video` | `magnific/veo-3-1-image-to-video`, `magnific/veo-3-1-image-to-video-fast` |
| `magnific/skin-enhancer` | `magnific/skin-enhancer-creative`, `magnific/skin-enhancer-faithful`, `magnific/skin-enhancer-flexible` |

Keep the user-facing model selector grouped by the original requested family names so the catalog does not feel noisy.

### 15.6 Enabled Defaults

Enable by default only models whose endpoint path, required fields, and response shape are verified in current Magnific docs.

For models with verified endpoint paths but incomplete pricing:

- seed as enabled
- set `pricingStatus: "estimated"`

For models with unclear endpoint paths or incomplete response contracts:

- seed as disabled
- include `readinessReason`
- show only to admins
