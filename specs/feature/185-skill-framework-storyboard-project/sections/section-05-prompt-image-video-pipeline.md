# Section 05 — Prompt, image, and video-prompt pipeline

## Goal

Run an exact-N storyboard pipeline with canonical skill prompts and durable per-shot artifacts.

## Pipeline

Plan all shots before provider work using setup/problem/reaction/detail/attempt/turning-point/solution/result/ending, truncating or extending deterministically for 2–12. For each shot call the selected skill adapter in `prompt_only`, validate and persist the response, then hand the complete `generation_request` to the existing `ImageGenerationCore`/media generation boundary. `generation_request.prompt` and `generation_prompt` are never rebuilt or silently replaced.

Persist managed image assets and provenance, then build a video prompt from the image asset, shot context, dialogue mode, and selected video model dialect. v1 creates video prompts and does not submit actual video provider jobs. Default concurrency is one, shot ordering is stable, independent shots continue after failure, and cancellation preserves completed work.

## References and models

Pass logical managed asset IDs until the media boundary resolves provider URLs. Enforce skill/model reference limits and quality capabilities. Store original/effective request snapshots with redaction and provider idempotency keys.

## Tests

Cover exact N, all story types, continuity, canonical prompt preservation, whole-request handoff, reference resolution boundary, image failure/partial result, video prompt metadata, bounded concurrency, cancel, retry, and no-provider preview/estimate.

## UI/UX Contract

### Target User / JTBD
Creator sees each shot's prompt/image/video-prompt progress and knows what needs retry.

### Surface Inventory
Shot cards, prompt details, previews, video metadata, attempts/errors, and retry controls.

### Component Map
Pipeline persists canonical artifacts; review cards render them without recomputation.

### State Matrix
Each shot supports pending, prompting, image-running, image-ready, video-ready, failed, retrying.

### Responsive Matrix
Shot status and recovery action remain visible on small screens.

### Accessibility Acceptance
Progress uses `aria-live`, status text, and keyboard retry controls.

### Copy Contract
Stage names are localized and errors never expose provider secrets.

### Browser Evidence Required
Show 2/9/12 ordered shots and partial failure with one-shot retry.
