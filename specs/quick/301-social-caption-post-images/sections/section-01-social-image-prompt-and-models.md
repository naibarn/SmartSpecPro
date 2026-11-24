# Section 01 — social image prompt and model eligibility

## Ownership and targets

- Owner: main Codex.
- Files: `apps/web/skills/social-commerce-post-image-prompt/SKILL.md`,
  `apps/web/skills/social-commerce-post-image-prompt/skill.md`,
  `apps/web/server/services/marketplaceAutoReviewSocialImagePromptSkillRunner.ts`,
  and model-eligibility logic in
  `apps/web/server/services/marketplaceAutoReviewSocialPostImagesService.ts`.
- Keep the app runtime skill under `apps/web/skills`; do not add it to the
  unrelated root Codex skill mirrors. Keep paired case-variant skill files
  identical, matching the current app skill layout.

## Prerequisites

- Canonical preflight is `BASELINE_READY` at
  `373d937ab125f29437d9eedfe86d3bfa3c0de45b`.
- No prerequisite from the existing quick plan 300 or its unfinished live
  proof. Use the integrated worker-job contract already present on `main`.

## Implementation

- Create an LLM-only skill with a strict JSON prompt contract. It receives one
  reference image plus Thai/English caption, product facts, and a variant role.
  It preserves the character/product/shot facts from the supplied reference,
  writes a visually distinct social ad prompt, avoids invented claims, and
  keeps caption text out of the generated image.
- Use the existing vision JSON-call path and skill execution policy. Require
  actual token usage, charge it with a stable key for each of the three
  variants, and do not fall back to text-only or another provider model.
- Use `mediaModels.list({ type: "image" })` in the client for the existing
  enabled and tenant-filtered catalog. Filter to models with at least one
  reference slot and support for the selected portrait ratio. The mutation revalidates the
  chosen enabled model, configured provider, reference capacity, and ratio
  before enqueueing. Prefer 4:5, then another declared portrait ratio.
- The image model is only an input to the social-image worker operation. Do
  not mutate or default from start-frame model selection.

## TDD and acceptance

- First add runner tests for the skill contract, one-reference variant payload,
  actual-usage charging, invalid output, and idempotency; run RED, then
  implement and run GREEN.
- First add model-eligibility tests for reference capacity, portrait-ratio
  selection, and rejection of a disabled or unconfigured provider.
- Acceptance: prompt runner returns a validated prompt/negative prompt and
  actual credits; the model picker and worker accept only reference-capable
  portrait models.

## Slice contract

- Required checks: focused runner and model-eligibility Vitest files; no real
  provider calls. Also verify the paired skill files match.
- Merge readiness: section 01 can integrate independently; the new skill is
  not invoked by user requests until section 02 adds the worker operation.
- Exposure/fallback: no UI exposure yet. Missing skill, provider, reference
  support, or portrait support fails closed before any image reservation.
- Rollback: remove the new skill and runner; no stored
  data or migrations are affected.

## UI/UX Contract

N/A for this section; it adds a data endpoint but no rendered UI. UI work is
owned by section 03.
