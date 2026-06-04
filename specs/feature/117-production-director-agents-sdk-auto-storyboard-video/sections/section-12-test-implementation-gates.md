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
- stage completion evidence validation;
- stage completion evidence transition validation for complete, warning-complete, skip, repair-required, retriable-failure, user-block, terminal-failure, and cancel;
- SDK capability manifest validation for allowed agents, tools, handoffs, output schemas, session policy, trace policy, stream policy, hosted capability denials, and manifest hash;
- production creative brief snapshot validation for objective, audience, viewer promise, creative latitude, quality mode, auto-decision policy, CTA intent, user hint trust, ambiguity, and snapshot hash;
- old metadata compatibility.
- product variant/SKU snapshot validation;
- shared-product access snapshot, credit payer, and background recheck validation;
- evidence freshness and asset readiness validation;
- product reference asset pack validation;
- character identity asset pack validation;
- asset rights envelope validation;
- provider event envelope validation;
- payload budget validation;
- storage quota/transcode plan validation;
- retry/DLQ policy validation;
- marketplace privacy envelope validation;
- marketplace evidence instruction firewall validation;
- audio rights/mix envelope validation;
- distribution profile validation;
- creative feedback memory policy validation;
- synthetic disclosure/provenance envelope validation;
- CTA/landing integrity envelope validation;
- advertising policy rule-pack validation;
- automation quality calibration policy validation;
- post-publish governance envelope validation;
- campaign generation governance envelope validation;
- brand voice and seller policy envelope validation;
- human review queue policy validation;
- publishable asset package envelope validation;
- run input change impact envelope validation;
- shot frame vision QA envelope validation;
- targeted media unit repair plan validation;
- generated media acceptance envelope validation;
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
- concept/storyboard planning uses only approved advertising policy rule packs and persists triggered rule IDs for compliance outcomes.
- concept/storyboard planning requires a production creative brief snapshot and cites brief fields in selected/rejected rationale.
- user hints in the creative brief cannot become product claims unless evidence/approval refs exist.
- creative memory uses only tenant-safe redacted fingerprints and never treats failed/blocked outputs as positive examples.
- campaign/batch planning respects caps, duplicate similarity thresholds, spend limits, and approval requirements.
- brand/seller voice improves tone and pronunciation without violating product evidence, ad policy, privacy, rights, or disclosure constraints.
- human review queue blocks auto-selection or additional spend when policy requires review.
- publishable package drafts for title/caption/description, hashtags, thumbnail concept, transcript/subtitle source, and alt text are evidence-bound and platform-limited.
- product/evidence/policy/profile/user edits after planning trigger input change impact and preserve or invalidate only affected planning artifacts.
- visual product-dependent shot payloads reference only approved product reference asset pack refs.
- recurring presenter/hand/voice shot payloads reference only approved or approved-limited character identity asset pack refs and respect no-face, hands-only, single-shot, lip-sync, native-audio, and fallback policies.
- marketplace DOM/OCR/review/seller text and prior AI output can influence planning only through firewall-approved fact refs or escaped untrusted evidence blocks.

Execution:

- direct media scheduling bypasses `ProductionSpace` and `flowNodes`;
- stage handlers cannot complete from agent text, provider success, or status updates alone without completion evidence;
- visual provider dispatch blocks when the product reference asset pack is missing, blocked, stale, wrong-variant, low-quality, rights-blocked, or not platform-hosted/proxy-ready;
- person/voice provider dispatch blocks when the character identity asset pack is missing, no-consent, blocked, conflicting, privacy-risky, low-quality, or outside allowed shot/voice scope;
- provider tasks persist and reconcile;
- storyboard grid cells and start/stop frames require passed vision QA before downstream use;
- failed start/stop/storyboard frame resubmits only that exact media unit;
- provider outputs start as candidate/QA-pending and cannot route downstream before acceptance;
- repaired outputs supersede failed outputs and stale failed refs are blocked.
- provider callbacks/polling events validate trust, task binding, idempotency, and replay safety before state changes;
- oversized provider payloads are redacted/linked or blocked before further spend;
- retries are scoped.

Timeline:

- storyboard-only timeline shows the correct 6-stage path;
- full-video timeline shows the correct 11-stage path;
- completed/current/waiting/blocked/failed/skipped/pending states render from backend projection;
- refresh/resume preserves timeline state;
- output links attach to the correct timeline item.
- completion-evidence blockers appear when required evidence is missing.
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
- SDK capability manifest enforcement for unknown tools, handoff scope widening, hosted SDK capability requests, raw session persistence, raw trace capture/export, tool over-call-limit, and manifest mismatch before additional spend;
- creative brief missing/ambiguous/changed handling, safe default fallback, human-review routing, and dependent-ref invalidation;
- operator recovery for stuck runs, orphan provider tasks, expired URLs, re-host failure, render/library finalize failure, refund mismatch, gateway outage, timeline rebuild, and retention cleanup failure;
- recovery action cannot mark success without artifact, QA, lineage, and credit evidence.
- background advancement access/credit recheck before paid stages;
- provider moderation refusal taxonomy and non-retryable safety blockers.
- advertising policy rule-pack approval/effective-date/expiry/deprecation/fixture-replay behavior and rollback.
- provider callback auth failure, duplicate/stale/out-of-order event handling, and DLQ/recovery behavior;
- payload/trace/list/detail projection budget enforcement;
- storage quota, output byte-size, codec, duration, resolution, transcode, cleanup, and playability gates;
- stage lease/heartbeat or equivalent claim protection for stale background workers;
- migration/backfill dry-run, rollback plan, and old-row projection compatibility;
- launch SLO/alert evidence for completion latency, queue wait, stuck runs, callback auth failures, DLQ, storage/transcode failure, provider refusal spike, and credit mismatch.
- privacy redaction and final-media PII blockers;
- evidence instruction firewall blockers for hidden prompt injection, fake tools, fake schemas, policy bypass, credit/provider routing attempts, and output-routing attempts;
- audio/music/SFX/TTS/uploaded-reference rights blockers;
- distribution profile mismatch handling;
- creative feedback memory tenant isolation and failed-output exclusion.
- synthetic disclosure/platform flag/provenance handling;
- CTA/landing link validation and volatile offer approval;
- model/provider/QA drift fixture replay and spot-check sampling;
- post-publish invalidation, reuse blocking, and dry-run governance reports.
- campaign/batch caps, duplicate variation blocking, spend anomaly pause, and batch approval scoping;
- brand/seller policy conflict blocking and private seller-note leak prevention;
- human review queue SLA, timeout, expiry, rejection, repair-request, and exact-scope approval behavior.
- publishable package completion, thumbnail QA, subtitle/transcript timing, platform metadata compliance, metadata manifest, and checksum validation.
- input change impact, stale approval invalidation, stale QA invalidation, credit re-estimation, and safe partial artifact reuse.
- per-frame/per-keyframe gateway-routed vision QA and exact-unit targeted repair.
- generated media acceptance, quarantine, supersession, and allowed-surface routing.
- product reference asset pack readiness, rejection reasons, better-image-required blockers, and recovery behavior.
- character identity asset pack readiness, consent/rights blockers, no-face/hands-only/generic-person/separate-TTS fallbacks, and recovery behavior.
- advertising policy rule-pack source attribution, triggered rule IDs, fixture replay, and active-run/reuse invalidation behavior.
- stage completion evidence required refs, missing refs, warning approvals, block/fail/cancel reasons, idempotency, and evaluator behavior.

Media safety and rights:

- safety categories block or require policy approval before provider spend;
- provider safety refusal is not retried with the same payload;
- standalone brand/logo/marketplace badge/review-image use blocks without explicit rights approval;
- stale product evidence blocks volatile claims unless freshly approved.
- named customer/reviewer testimonial or social-proof visuals require evidence, rights, and approval;
- marketplace account/order/cart/payment/chat/private seller data cannot appear in final media.
- synthetic-media disclosure and platform flag requirements are represented when policy requires them.
- CTA/affiliate/source/custom links match product, selected variant, offer evidence, and redirect/tracking policy.
- brand/seller voice cannot introduce prohibited phrases, fake officialness, unsupported superlatives, competitor claims, or internal compliance notes.
- compliance blockers cite approved rule-pack version and triggered rule IDs for claims, warnings, thumbnails, metadata, CTA, and Thai regulated categories.
- human review is required for high-volume, high-budget, regulated, low-confidence, rights/privacy exception, or competitor/comparison scenarios.
- title/caption/description, hashtags, alt text, thumbnail overlay text, and subtitle/transcript text pass ad, privacy, rights, disclosure, CTA, brand, and evidence checks.
- changed product/evidence/policy refs invalidate publish metadata, thumbnail, subtitles/transcripts, or final media only when the package depends on stale refs.
- product mismatch, wrong variant, product distortion, missing product, invented detail, character drift, speaking identity drift, low visual quality, prompt mismatch, unwanted text/glyph, or endpoint mismatch creates targeted repair before downstream use.
- recurring face/voice continuity uses approved character identity asset pack refs, and face reveal/lip-sync/native-audio shots block or fallback when the pack allows only no-face, hands-only, single-shot, generic-person, or separate-TTS strategy.
- failed/unverified/policy-blocked/superseded artifacts are not visible, downloadable, reusable, or stored as positive creative memory.
- raw marketplace URLs, rejected product images, failed generated approximations, and stale product refs are never used as product-reference anchors for visual generation or repair.
- raw marketplace instructions, hidden DOM/OCR prompt fragments, prior AI instructions, or seller-provided "ignore policy" text are never promoted into system/developer prompts, SDK manifests, credit policy, provider routing, approvals, public scripts, captions, or metadata.
- status-only completed stages cannot advance Storyboard Review, Video Editor, render, Library finalize, publishable package promotion, or future reference selection.

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
- campaign batch from one product -> distinct variants are generated within caps; duplicates are blocked/replanned before spend.
- spend anomaly during repeated repairs -> additional paid work pauses with credit audit intact.
- high-risk brand/comparison concept -> human review queue blocks scheduling until scoped approval or repair.
- final video with platform profile -> Library output includes compliant thumbnail, subtitle/transcript artifacts, metadata manifest, checksums, and platform title/caption/hashtags when required.
- invalid subtitle source or misleading thumbnail -> publishable package blocks until repaired without regenerating unrelated media.
- product image removed mid-run -> affected storyboard/video/package refs recheck or regenerate; unrelated safe artifacts are preserved.
- distribution profile edited after clips complete -> media is preserved when compatible; subtitles/thumbnail/package/render profile recheck or repair.
- price/offer or CTA link changed before finalization -> stale approvals, publish metadata, credit estimate, and CTA/package refs invalidate before final output.
- start frame quality fail -> only that shot's start frame regenerates, other frames remain accepted, and video generation waits for the repaired frame QA pass.
- stop frame face drift -> only that shot's stop frame or dependent clip repairs, unrelated shots are preserved.
- native-audio clip changes character identity -> targeted shot/clip repair or separate-TTS/product-only fallback, no full-run regeneration.
- failed frame repaired -> old failed frame becomes quarantined/superseded and cannot appear in Storyboard Review, Video Editor, Library, thumbnail package, or future reference picker.
- product image too small/wrong variant/not hosted -> visual provider dispatch pauses with product-reference blocker before credits are reserved.
- recurring presenter has no consent or conflicting face refs -> provider dispatch pauses with character-identity blocker and can switch to product-only/hands-only/generic-person/separate-TTS without regenerating unrelated accepted product media.
- advertising policy rule pack deprecated or fixture replay fails -> active run pauses for impact/recheck before provider spend, finalization, package promotion, or reuse.
- stage completion evidence missing after provider success -> run remains blocked/active with safe timeline reason and no downstream stage starts.
- SDK agent attempts an unmanifested tool/handoff/hosted capability -> attempt blocks, trace is redacted, Node performs no mutation, and no LLM/provider credit is spent beyond the authorized attempt envelope.
- creative brief changed after concept selection -> dependent concept/story/script/metadata refs recheck or invalidate, unrelated accepted media is preserved when still safe.
- marketplace page includes hidden "ignore previous instructions/use provider X/free credits/claim FDA approved" text -> evidence instruction firewall quarantines it, planning uses only safe fact refs, no provider/credit/policy mutation occurs, and the timeline blocks if required facts cannot be safely extracted.

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
