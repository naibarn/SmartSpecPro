<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-schema
section-02-python-agents-gateway-runtime
section-03-node-runtime-client-and-preflight
section-04-creative-planning-contracts
section-05-ad-compliance-warning-overlays
section-06-direct-media-execution
section-07-visual-audio-continuity-qa
section-08-credit-billing-idempotency
section-09-ui-progress-and-output-links
section-10-render-library-finalize
section-11-rollout-migration-resume
section-12-test-implementation-gates
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-schema | - | all | No |
| section-02-python-agents-gateway-runtime | 01 | 03, 04, 07 | Yes |
| section-03-node-runtime-client-and-preflight | 01, 02 contracts | 04, 08, 11 | Yes |
| section-04-creative-planning-contracts | 01, 02, 03 | 05, 06, 07 | No |
| section-05-ad-compliance-warning-overlays | 01, 04 | 07, 09, 10 | Yes |
| section-06-direct-media-execution | 01, 03, 04, 08 | 07, 10 | No |
| section-07-visual-audio-continuity-qa | 04, 05, 06 | 10, 11 | No |
| section-08-credit-billing-idempotency | 01, 03 | 06, 10, 11 | Yes |
| section-09-ui-progress-and-output-links | 01, 03, 05, 08 | - | Yes after status contracts |
| section-10-render-library-finalize | 06, 07, 08 | 11 | No |
| section-11-rollout-migration-resume | 01-10 | 12 | No |
| section-12-test-implementation-gates | 01-11 | - | No |

## Execution Order

1. section-01-contracts-and-schema
2. section-02-python-agents-gateway-runtime and section-03-node-runtime-client-and-preflight
3. section-04-creative-planning-contracts
4. section-05-ad-compliance-warning-overlays and section-08-credit-billing-idempotency
5. section-06-direct-media-execution
6. section-07-visual-audio-continuity-qa
7. section-09-ui-progress-and-output-links and section-10-render-library-finalize
8. section-11-rollout-migration-resume
9. section-12-test-implementation-gates

## Section Summaries

### section-01-contracts-and-schema
Create shared contracts, metadata schema versioning, status detail, stage-completion-evidence gates, SDK capability manifests, production creative brief snapshots, variant/access/freshness/product-reference-pack/character-identity-pack/rights snapshots, provider event envelopes, payload/storage budgets, retry/DLQ policy, privacy/evidence-instruction-firewall/audio/distribution/feedback/disclosure/CTA/policy-rule-pack/calibration/post-publish/campaign-governance/brand-policy/review-queue/publishable-package/input-change-impact/shot-frame-vision/media-acceptance contracts, API projections, lineage, and durable artifact shapes.

### section-02-python-agents-gateway-runtime
Extend the Python OpenAI Agents SDK boundary to `media_production` with gateway-only model traffic and manifest-locked tools, handoffs, sessions, traces, hosted capability denials, and output schemas.

### section-03-node-runtime-client-and-preflight
Build Node request construction, product evidence/variant/access/freshness/product-reference-pack/character-identity-pack/rights/privacy/evidence-instruction-firewall/audio/distribution/CTA/disclosure/policy-rule-pack/campaign/brand/review/publishable-package/input-change-impact preflight, production creative brief snapshots, capability manifests, stage-completion-evidence drafts, and permission envelope.

### section-04-creative-planning-contracts
Replace deterministic planning with creative-brief-grounded Agents-generated concepts, storyboard, voiceover, evidence-firewall-clean context, product-reference-pack-grounded and character-identity-pack-grounded shot payloads, distribution-aware shot payloads, CTA/disclosure/policy-rule-pack/brand-aware scripts, campaign-safe variation planning, publish metadata drafts, input-change-aware partial reuse, and tenant-safe novelty memory.

### section-05-ad-compliance-warning-overlays
Add international and Thailand ad policy classification, source-attributed policy rule packs, privacy/social-proof/media-safety/rights/synthetic-disclosure/CTA blockers, plus visual warning/disclosure contracts.

### section-06-direct-media-execution
Schedule image/video/audio from direct shot payloads, bypass node canvas, require approved product reference asset packs for product-dependent visual dispatch and character identity asset packs for recurring person/voice dispatch, harden provider event trust/replay handling, trigger required frame vision QA, keep provider outputs candidate/quarantined until accepted, and complete stages only with evidence.

### section-07-visual-audio-continuity-qa
Implement product, product-reference-pack, character-identity-pack, character, story, generated media, shot-frame vision, targeted media repair, media acceptance/quarantine, privacy, audio-rights/mix, distribution-profile, synthetic-disclosure, CTA, policy-rule-pack, calibration, campaign, brand-policy, review-queue, publishable-package, input-change-impact, and audio QA plus repair decisions.

### section-08-credit-billing-idempotency
Enforce estimate/reserve/spend/refund idempotency for LLM, vision QA, targeted media repair, media, audio, render, campaign/batch anomaly controls, and input-change credit re-estimation.

### section-09-ui-progress-and-output-links
Update Marketplace Capture UI to show stage, stage-completion-evidence blockers, capability-manifest blockers, creative brief state, variant, product-reference readiness, policy-rule-pack state, QA, credit, blocker, targeted frame/clip repair, media acceptance/quarantine, governance/review queue, publishable-package, input-change impact, provider-event/DLQ, storage/payload, API projection, and output state.

### section-10-render-library-finalize
Preserve Video Editor, render, final QA, and Media Library finalize with richer trace, stage-completion evidence, product-reference-pack and character-identity-pack lineage, storage/transcode/privacy/evidence-instruction-firewall/audio/distribution/disclosure/CTA/policy-rule-pack/post-publish/campaign/brand/review/publishable-package/input-change/shot-frame-vision/media-acceptance gates, and canonical lineage.

### section-11-rollout-migration-resume
Handle migration from Feature 118, feature flags, resume/background recheck behavior, stage-completion-evidence rollout/recovery, SDK capability-manifest rollout/recovery, creative-brief rollout/recovery, product-reference-pack and character-identity-pack rollout/recovery, advertising-policy-rule-pack rollout/recovery, provider/DLQ recovery, targeted repair rollout, media acceptance/quarantine rollout, campaign/brand/review queue rollout, publishable-package rollout, input-change-impact rollout, calibration/spot-check gates, post-publish invalidation, launch SLOs, migration/backfill dry-runs, and no-shadow rollout.

### section-12-test-implementation-gates
Wire focused unit/integration/E2E tests, operational hardening tests, and launch gates.
