# Section 12: Test Implementation Gates

## Purpose

Collect and enforce the testing, verification, and launch evidence needed before Feature 117 can be considered complete.

## Depends On

- sections 01 through 11.

## Blocks

- launch readiness.

## Files Owned By This Section

- focused tests created by prior sections.
- E2E/browser evidence files if the repo stores them.
- CI/check documentation if needed.

## Tests First

This section is itself the test gate. It should not add new feature behavior except small test-only helpers when necessary.

## Required Test Groups

Contracts:

- runtime contract validation;
- metadata schema validation;
- stage output validation;
- old metadata compatibility.
- product variant/SKU snapshot validation;
- shared-product access snapshot, credit payer, and background recheck validation;
- evidence freshness and asset readiness validation;
- asset rights envelope validation;
- provider event envelope validation;
- payload budget validation;
- storage quota/transcode plan validation;
- retry/DLQ policy validation;
- marketplace privacy envelope validation;
- audio rights/mix envelope validation;
- distribution profile validation;
- creative feedback memory policy validation;
- synthetic disclosure/provenance envelope validation;
- CTA/landing integrity envelope validation;
- automation quality calibration policy validation;
- post-publish governance envelope validation;
- API projection compatibility for old rows, new detail projection, new list summary projection, and redaction flags;
- canonical artifact lineage validation.

Gateway and SDK:

- `media_production` accepted;
- gateway required;
- direct provider key/base URL rejected;
- SDK import boundary enforced.

Planning:

- deterministic planner no longer owns Feature 117 runs;
- concepts validate;
- novelty check works;
- unsupported claims block.
- SKU/variant-specific claims require selected variant snapshot evidence and approval policy.
- concept/storyboard planning respects target distribution profile constraints.
- creative memory uses only tenant-safe redacted fingerprints and never treats failed/blocked outputs as positive examples.

Execution:

- direct media scheduling bypasses `ProductionSpace` and `flowNodes`;
- provider tasks persist and reconcile;
- provider callbacks/polling events validate trust, task binding, idempotency, and replay safety before state changes;
- oversized provider payloads are redacted/linked or blocked before further spend;
- retries are scoped.

Timeline:

- storyboard-only timeline shows the correct 6-stage path;
- full-video timeline shows the correct 11-stage path;
- completed/current/waiting/blocked/failed/skipped/pending states render from backend projection;
- refresh/resume preserves timeline state;
- output links attach to the correct timeline item.
- detail API projection and list summary projection both render without frontend-only inference.

QA:

- product fidelity;
- character/face continuity;
- story continuity;
- audio continuity;
- audio rights, attribution, voice consent, and loudness/mix targets;
- marketplace privacy and PII redaction;
- distribution profile safe areas, captions, warnings, CTA, and export variants;
- synthetic disclosure/provenance;
- CTA/landing integrity;
- QA calibration and human spot-check gating;
- ad compliance;
- Thai warnings/disclosures;
- final render QA.

Credits:

- preflight/reservation required;
- no double charge;
- refund/release on failure/cancel;
- repair incremental cost only.

Operational hardening:

- provider/model unavailable and fallback behavior;
- no silent media-to-text or native-audio-to-silent downgrade;
- queue/backpressure and concurrency caps;
- cancellation during every paid stage;
- signed URL redaction and re-host/proxy behavior;
- retention/deletion metadata on intermediate and final assets;
- likeness/consent blockers for identifiable face/voice references;
- replay/golden fixtures for Agents output and QA drift.
- approval decision idempotency for credit, claim, warning text, provider/model fallback, likeness consent, completed-with-warnings acceptance, and manual retry;
- immutable policy/model/pricing/compliance snapshot replay.
- operator recovery for stuck runs, orphan provider tasks, expired URLs, re-host failure, render/library finalize failure, refund mismatch, gateway outage, timeline rebuild, and retention cleanup failure;
- recovery action cannot mark success without artifact, QA, lineage, and credit evidence.
- background advancement access/credit recheck before paid stages;
- provider moderation refusal taxonomy and non-retryable safety blockers.
- provider callback auth failure, duplicate/stale/out-of-order event handling, and DLQ/recovery behavior;
- payload/trace/list/detail projection budget enforcement;
- storage quota, output byte-size, codec, duration, resolution, transcode, cleanup, and playability gates;
- stage lease/heartbeat or equivalent claim protection for stale background workers;
- migration/backfill dry-run, rollback plan, and old-row projection compatibility;
- launch SLO/alert evidence for completion latency, queue wait, stuck runs, callback auth failures, DLQ, storage/transcode failure, provider refusal spike, and credit mismatch.
- privacy redaction and final-media PII blockers;
- audio/music/SFX/TTS/uploaded-reference rights blockers;
- distribution profile mismatch handling;
- creative feedback memory tenant isolation and failed-output exclusion.
- synthetic disclosure/platform flag/provenance handling;
- CTA/landing link validation and volatile offer approval;
- model/provider/QA drift fixture replay and spot-check sampling;
- post-publish invalidation, reuse blocking, and dry-run governance reports.

Media safety and rights:

- safety categories block or require policy approval before provider spend;
- provider safety refusal is not retried with the same payload;
- standalone brand/logo/marketplace badge/review-image use blocks without explicit rights approval;
- stale product evidence blocks volatile claims unless freshly approved.
- named customer/reviewer testimonial or social-proof visuals require evidence, rights, and approval;
- marketplace account/order/cart/payment/chat/private seller data cannot appear in final media.
- synthetic-media disclosure and platform flag requirements are represented when policy requires them.
- CTA/affiliate/source/custom links match product, selected variant, offer evidence, and redirect/tracking policy.

UI:

- all run states render;
- output links render;
- Thai copy fits;
- browser evidence at required viewports.

E2E:

- product -> storyboard -> Storyboard Review;
- product -> full video -> Library;
- unsupported claim blocks before provider spend;
- visual drift triggers repair;
- credit budget exceeded pauses for authorization;
- warning text appears and passes readability QA.
- selected variant product -> storyboard/video preserves selected variant option and does not show a different option.
- shared read-only product -> private output only or blocked according to policy, no product mutation or ambiguous billing.
- stale product -> output avoids volatile claims or requests recapture/approval before spend.
- provider moderation refusal -> sanitized blocker with no repeated paid retries.
- stuck provider/re-host scenario -> timeline shows resumable/blocked state and operator recovery path preserves credit correctness.
- callback auth/replay failure -> no run advancement, timeline-safe blocker/DLQ state, no duplicate credit/artifact.
- storage quota/transcode failure -> finalization blocks until cleanup or policy-approved retry.
- privacy/audio-rights/distribution-profile failure -> finalization blocks with targeted repair or approval path.
- failed or non-compliant output -> not stored as a positive creative-memory example.
- disclosure/CTA/calibration failure -> finalization or promotion blocks with targeted repair, refresh, or spot-check path.
- post-publish invalidation trigger -> existing Library output blocks reuse or requires re-check.

## Suggested Verification Commands

Use exact commands available at implementation time. Expected patterns:

```bash
npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReviewService.test.ts
npm --prefix apps/web run test -- shared/storyboardPromptAudio.test.ts
NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check
pytest python-backend/tests/unit/test_openai_agents_import_boundary.py
git diff --check
```

## UI/UX Contract

### Target User / JTBD
N/A - verification section only. It requires evidence for UI work but does not implement UI.

### Surface Inventory
N/A - no browser-visible surface is modified in this section.

### Component Map
N/A - no UI component ownership in this section.

### State Matrix
N/A - verifies state coverage created by section-09.

### Responsive Matrix
N/A - verifies browser evidence created by section-09.

### Accessibility Acceptance
N/A - verifies accessibility evidence created by section-09.

### Copy Contract
N/A - verifies copy coverage created by section-09.

### Browser Evidence Required
N/A - this section checks evidence exists; section-09 defines the evidence.

## Acceptance Criteria

- All critical tests pass.
- Browser evidence exists for changed UI.
- No generated spec/plan/code whitespace errors.
- Remaining launch risks are documented and explicitly accepted.
