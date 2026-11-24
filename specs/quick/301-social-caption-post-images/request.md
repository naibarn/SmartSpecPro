# Request: three social post images from a generated caption

Add image generation to the Marketplace Auto Review social-caption area. After
a caption exists, let the user choose an image model independently of the
storyboard start-frame model and generate three portrait ad images using the
caption-source image, a selected character reference, and a selected product
reference. Show the images with the caption, with lightbox and download actions.
Charge prompt and image-generation credits accurately and avoid duplicate
charges when a worker retries.

## Repository assumptions

- The existing caption is generated and persisted before image generation; a
  separate button starts the image batch.
- Each output uses one reference source: saved caption source, selected
  character, or selected product. The caption and product facts accompany all
  three prompts.
- Use a portrait aspect ratio supported by the selected model, preferring 4:5
  for feed posts and then another declared portrait ratio. All three outputs
  in one batch use the same ratio.
- The image prompt uses the app's skill runtime. Image model selection applies
  only to the three social images and never updates the shot start-frame model.
- Existing user-owned reference images and run access checks remain the source
  of truth. Missing required references disable generation before any credits
  are reserved.

## Scope

- Add a prompt skill and a runner for social-commerce post images.
- Add a canonical worker operation that generates and persists three images,
  one at a time, with per-image progress, idempotency, and credit reconciliation.
- Add a separate image-model picker, reference selectors, image gallery,
  lightbox, and download controls to the existing caption card.
- Keep the work inside the existing Marketplace Auto Review worker and JSON
  metadata paths; do not add a new database table or workflow engine.

## Non-goals

- Publishing the post to Facebook or another social platform.
- Changing caption generation or storyboard/start-frame model selection.
- Adding overlay text, claims, prices, or a new image editor.
- Deploying the development site as part of this feature.
