<!-- PROJECT_CONFIG
runtime: node-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-social-image-prompt-and-models
section-02-worker-billing-and-storage
section-03-caption-gallery-ui
END_MANIFEST -->

# Section Index

1. Add the image prompt skill/runner and portrait model eligibility logic.
2. Generate the three image variants through the canonical worker with per-item
   billing, idempotency, progress, and durable storage.
3. Add the separate model/reference controls, output gallery, lightbox, and
   downloads to the existing caption composer.
