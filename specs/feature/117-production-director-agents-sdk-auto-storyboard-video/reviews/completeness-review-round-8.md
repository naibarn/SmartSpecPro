# Completeness Review Round 8

Date: 2026-05-31
Scope: Publishability, privacy, rights, distribution-fit, and feedback-memory hardening.

## Review Focus

Round 7 made the plan stronger for production operations. Round 8 checked whether the generated storyboard/video can be safely published as an ad-like product review, especially when it reuses Marketplace Capture evidence and audio assets.

## Findings Fixed

1. Marketplace evidence privacy was present as a principle, but not a first-class contract.
   - Added `MarketplaceEvidencePrivacyEnvelope`.
   - Added redaction/blocking requirements for account headers, order/cart/checkout/payment data, chats, phone, email, address, customer usernames, profile photos, reviewer identity, unrelated people, and private seller/account data.
   - Added final-media QA for accidental PII in visuals, captions, overlays, and audio transcripts.

2. Audio rights and mix safety were under-specified.
   - Added `AudioRightsAndMixEnvelope`.
   - Required source, commercial-use status, attribution, voice consent, license policy, restrictions, loudness, music-under-voice, and silence/cut limits for TTS, native video audio, music, SFX, uploaded references, and Library audio.

3. Target platform/export fit was too implicit.
   - Added `MarketplaceAutoReviewDistributionProfile`.
   - Required platform/placement, aspect ratio, dimensions, frame rate, duration range, safe areas, caption policy, warning policy, loudness/export expectations, and export variant refs.
   - Added final QA gates for safe areas, captions, warning text, CTA placement, loudness, and export variants.

4. Creative feedback memory needed guardrails.
   - Added `CreativeFeedbackMemoryPolicy`.
   - Limited memory to tenant-safe redacted fingerprints, QA reason codes, approved feedback, and platform-profile results.
   - Blocked raw prompts, raw provider payloads, private evidence, customer PII, unredacted images, and failed outputs as positive examples.

## Files Updated

- `spec.md`
- `claude-research.md`
- `claude-interview.md`
- `claude-spec.md`
- `claude-plan.md`
- `claude-plan-tdd.md`
- `sections/index.md`
- `sections/section-01-contracts-and-schema.md`
- `sections/section-03-node-runtime-client-and-preflight.md`
- `sections/section-04-creative-planning-contracts.md`
- `sections/section-05-ad-compliance-warning-overlays.md`
- `sections/section-07-visual-audio-continuity-qa.md`
- `sections/section-09-ui-progress-and-output-links.md`
- `sections/section-10-render-library-finalize.md`
- `sections/section-12-test-implementation-gates.md`

## Remaining Risk

- Exact target-platform safe-area presets, loudness values, and duration defaults should be configured by product/platform policy during implementation.
- Exact audio license policy depends on provider terms and asset-library rules.
- Privacy detection will need conservative heuristics plus a user/admin blocker path for ambiguous screenshots or review content.

## Verdict

Pass after round 8 additions. The plan now covers creative quality, product truth, Thai/international ad compliance, provider/credit reliability, and publishability gates for privacy, audio rights, distribution profile, and safe creative memory.
