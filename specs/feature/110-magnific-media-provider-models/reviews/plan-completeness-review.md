# Plan Completeness Review: Magnific Deep Plan

Date: 2026-05-06
Reviewer: Orchestra conductor

## Verdict

The plan is implementation-ready. Recommended additions from this review were integrated on 2026-05-06.

The current deep-plan covers the core delivery path: provider identity, admin provider setup, model seeding, static fallback, UI inputs, server validation, Python provider client, gateway routing, async polling, sync Remove Background, re-hosting, billing, observability, rollout, rollback, and regression verification.

The section split is valid and complete (`8/8`). No placeholder markers were found.

## Strengths

1. The generated plan resolves the original Veo family inconsistency by using `modelFamily: "magnific/veo-3-1"` across all Veo concrete records.
2. Mystic LoRA is mapped away from undocumented top-level fields and toward documented `styling.styles[]`, `styling.characters[]`, and prompt syntax.
3. The rollout stance is conservative: provider disabled by default, video/upscaler gated, estimated pricing marked explicitly, and provider URLs re-hosted before user-visible delivery.
4. The plan is additive and calls out regression coverage for Kie, fal.ai, BytePlus, WaveSpeed, ElevenLabs, UVoice, and KNPLabs.
5. Security-sensitive surfaces are present: SSRF validation, redirect validation, secret redaction, arbitrary webhook rejection, and refund on provider/re-host failures.

## Recommended Additions Before Implementation

### 1. Add a schema and persistence audit gate

Severity: recommended

The original spec says not to change the generic media task table schema unless strictly required. The plan assumes existing records can persist provider task id, endpoint metadata, reserved credits, pricing snapshots, and sanitized submission metadata, but it does not require an explicit audit before implementation.

Suggested addition:

- Before sections 05 and 06, inspect existing media task/result schemas and document whether existing JSON fields are sufficient.
- If a migration is required, add a dedicated migration section or subsection with rollback and data compatibility tests.
- If no migration is required, add tests proving existing persistence fields retain the Magnific metadata needed for worker restart recovery.

### 2. Add an exact concrete model inventory

Severity: recommended

Section 02 says to seed every phase-one model, but the section file does not list the exact required model id inventory or expected count. This creates room for a partial seed that still passes broad wording.

Suggested addition:

- Add a section-02 appendix with every concrete selectable `modelId`, endpoint path, dispatch mode, result type, enabled default, and readiness reason.
- Add a seed dry-run assertion that compares the generated ids to this fixed inventory.
- Include explicit records for Pro/Standard/Fast/reference variants where endpoint or pricing differs.

### 3. Add pricing provenance and conversion rules

Severity: recommended

The plan covers estimated pricing, admin override, reservation, and refund behavior. It does not explicitly carry the original spec's `pricingSource` and credit conversion rule into the implementation sections.

Suggested addition:

- Add `pricingSource` and `pricingLastReviewedAt` to the required seed/fallback contract.
- Add the provisional conversion rule used by seeds, including minimum credit behavior and duration/resolution matrix handling.
- Add tests that admin overrides supersede seeded provisional pricing and that dry-run output clearly marks estimated pricing.

### 4. Clarify Mystic LoRA discovery scope

Severity: recommended

The source spec excludes LoRA create/update/delete management but says read-only Mystic LoRA discovery is in scope. The generated plan covers LoRA payload mapping and UI controls, but does not define whether LoRA lists are static, fetched from Magnific, cached, or deferred.

Suggested addition:

- Decide whether phase one uses static/admin-entered LoRA identifiers or authenticated read-only discovery.
- If discovery is included, add endpoint, cache, failure behavior, admin-only visibility, and tests for sanitized errors.
- If discovery is deferred, update `claude-spec.md` out-of-scope text and UI requirements so implementation does not invent an unsupported selector.

### 5. Add job idempotency and duplicate-submit protection

Severity: recommended

The plan covers seed idempotency and polling recovery. It should also spell out behavior when a web request, Celery worker, or retry path replays after credit reservation or provider submit.

Suggested addition:

- Persist enough submission metadata to avoid duplicate provider submissions on worker retry.
- Add tests for retry after reservation, retry after provider task id exists, and crash/restart between submit and persistence.
- Ensure refunds are not duplicated when terminal failure handling is retried.

### 6. Clarify rollback cost containment for in-flight external jobs

Severity: optional but useful

The rollback plan says to mark in-flight tasks failed/refunded when immediate stop is required. It does not state whether Magnific supports cancellation or whether the system accepts provider-side sunk cost.

Suggested addition:

- Document provider cancellation capability as unsupported unless official docs prove otherwise.
- Add an operator note that disabling/refunding local tasks may not cancel already-submitted provider work.
- Add observability for rollback-stopped jobs so finance/support can reconcile external cost separately.

### 7. Make smoke-test prerequisites explicit

Severity: optional but useful

Section 08 has a good smoke order but does not specify required environment state.

Suggested addition:

- Add a smoke-test checklist for staging: Magnific key configured, provider enabled only for admin/test tenant, R2/S3 writable, credit test account funded, worker running, and quota/cost limit set.
- Add a required artifact path for skipped external smoke tests with reason, date, account, and residual risk.

## Completeness Score

| Dimension | Result |
| --- | --- |
| Spec coverage | Strong, with LoRA discovery clarification needed |
| Implementation order | Strong |
| Section split | Complete |
| TDD coverage | Strong, with idempotency and schema persistence additions recommended |
| Security | Strong |
| Billing | Good, with pricing provenance and duplicate-refund tests recommended |
| Rollout | Good, with smoke prerequisites and external cost caveat recommended |

## Recommended Next Step

Proceed to `deep-implement` from the hardened section files. The recommendations above have been incorporated into `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, and sections 02, 03, 05, 06, 07, and 08.
