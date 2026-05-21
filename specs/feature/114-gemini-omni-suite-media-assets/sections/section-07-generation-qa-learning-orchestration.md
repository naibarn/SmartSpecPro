# Section 07: Generation, QA, and Learning Orchestration

## Goal

Connect the Gemini Omni suite UX, skills, credit validation, provider generation, QA, retry, and learning loops.

## What This Section Must Change

- Run Gemini Omni Video Director before generation when Auto Prompt is active.
- Run Prompt QA before credit reservation.
- Validate selected references and provider assets server-side.
- Run production quality gate scripts/reviewer roles before credit reservation.
- Reserve credits only after validation and accepted prompt QA.
- Generate one task per clip in storyboard mode.
- Run Video Quality QA after generated result is available.
- Store learning signals.
- Create pending `media-studio-auto-learning` recommendations for recurring issues.
- Track durable per-clip state for storyboard runs.
- Write Gemini Omni storyboard projections into Storyboard Review after prompt QA and update them after clip completion.
- Void/refund credit reservations when provider submission fails before durable task/asset creation.
- Re-host provider result URLs into platform storage before final durable completion where existing media policy expects platform-hosted media.
- Emit sanitized audit/log events for lifecycle transitions.
- Enforce per-user/per-tenant rate limits, concurrency caps, and budget checks before provider submission.
- Track skill/QA credit costs separately from provider generation credits unless tenant policy marks them included.
- Block character/voice asset creation when required policy/consent acknowledgment is missing.
- Add reconciliation states for provider submitted but DB update failed, DB task exists without provider ID, unknown callback provider ID, re-host success but final update failed, and refund/ledger update failed.
- Snapshot selected provider asset metadata at generation submission time.
- Add explicit learning aggregation thresholds, windows, severity weighting, skill/contract version grouping, and issue-category dedupe.
- Add explicit cancellation handling for queued, submitted, processing, completed, and partial storyboard states.
- Persist additive, versioned Gemini Omni metadata envelopes on media tasks without breaking older task records.
- Validate provider result content type, extension, and max size during re-hosting and clean temporary files on all paths.
- Track story-level orchestration for Cinematic Storyboard runs, including story bible, narrative arc, cast/voice/audio maps, scene timeline, continuity graph, clip plans, QA summary, and review state.
- Track marketplace product campaign orchestration for Shopee/TikTok Shop products, including product evidence snapshot, Feature 115 insight references, customer journey map, claims map, product image roles, and marketplace QA state.
- Import Feature 115 `MarketplaceStorytellingHandoff`, `MarketplaceInsightRecord`, and `MarketplaceClaimResolution` through typed adapters and queryable insight records.
- Write production/storyboard output projections to Video Edit when the user chooses `Open in Video Edit`, without creating new provider jobs or credit reservations.

## Files Likely Touched

- `apps/web/client/src/pages/MediaStudio.tsx`
- media generation router/service
- skill execution/orchestration services
- skill upgrade/recommendation services
- media task metadata handling
- tests around generation and learning

## Flow

1. Build prompt package.
2. Script validators check schema, quota, asset references, pricing branch, and provider contract.
3. Reviewer roles inspect story, provider constraints, cinematic quality, character identity, voice/audio, cost risk, and policy.
4. Prompt QA aggregates the quality gate.
5. If revisable, Director revises and the loop repeats within limits.
6. Validation computes reference units and asset validity.
7. Pricing computes source-video branch.
8. Credits are reserved.
9. Provider task is created.
10. Video QA reviews result.
11. User feedback and QA result are stored.
12. Output projections can be sent to Storyboard Review and/or Video Edit.
13. Learning recommendations are aggregated.

Durable states should cover:

- prompt QA pending/pass/fail/revised
- production quality gate pending/pass/warning/revise/human_review/block
- credit reserved/refunded/voided
- provider submission pending/created/failed
- per-clip storyboard success/failure
- video QA pending/pass/fail
- human review required
- result re-hosting pending/succeeded/failed
- callback/polling terminal deduplicated
- rate limited/deferred
- budget blocked
- consent/policy blocked
- reconciliation pending/failed/resolved
- invalid transition rejected
- cancelled

## Tests

- prompt QA fail prevents charge and provider call
- production quality gate blocks charge and provider call when reviewer verdicts are blocked or high-risk
- production quality gate revises through the Director until pass or max attempts
- conflicting high-risk reviewer verdicts route to human review before credit reservation
- helper script validator failures produce machine-readable stable reason codes
- prompt QA pass allows validation and charge
- storyboard mode creates per-clip tasks
- storyboard partial failure preserves completed clips and retries only failed clips
- provider failure after reservation voids/refunds according to existing credit ledger rules
- provider-hosted result URLs are not final user-visible durable URLs unless existing policy explicitly allows it
- repeated callback/polling terminal handlers do not double-refund or duplicate completion
- audit/log events redact provider tokens, signed URL queries, and private media payloads
- preflight blocks provider submission when total planned storyboard cost exceeds balance or tenant budget
- per-user/per-tenant concurrency limits prevent runaway multi-clip submissions
- skill/QA costs are reserved/accounted for or explicitly included by policy
- missing consent/policy acknowledgment blocks reusable character/voice asset creation
- split-brain provider/DB failure cases enter deterministic retry, DLQ, or support-visible states
- stable reason codes are emitted for all Gemini Omni failure classes
- later asset rename/delete/restore does not mutate historical generation metadata
- learning recommendations are created only after threshold/window rules pass
- cancellation before provider submit releases reservations; cancellation after provider submit is best-effort and audited
- older media task records without Gemini Omni envelopes still render/poll through existing paths
- Storyboard Review projections are downstream copies and cannot become the source of truth for provider submission, credit reservation, callback/polling reconciliation, or QA/learning state.
- Review-only placeholder tasks cannot launch provider jobs or reserve credits until the Gemini Omni run attaches a backend media task.
- Storyboard Review feedback creates review comments, approvals, or revision requests against the Gemini Omni run without mutating provider asset snapshots or historical generation metadata.
- Storyboard Review handoff persists identity mapping by `storyboardRunId + clipId` so saved review records can be reopened and updated idempotently.
- `generationExtraParams.geminiOmni` carries a typed contract-versioned metadata envelope for review projections.
- Storyboard Review direct regeneration for Gemini Omni tasks is either disabled or routed through Gemini Omni validation, pricing, credit, provider, QA, and learning orchestration.
- Review-layer replacement/import/reorder/render events create review/composition events and do not rewrite source provider submission payloads.
- Video Edit handoff persists identity mapping by production/storyboard run and edit project ID so the same output can reopen or update an existing edit project idempotently.
- Video Edit edits, exports, replacements, overlays, captions, and audio mixes create edit-layer artifacts and do not rewrite source provider submission payloads, credit state, provider asset snapshots, QA/learning evidence, or historical generation metadata.
- Sending the same output to Storyboard Review and Video Edit does not create duplicate provider jobs or reserve additional final provider credits.
- Cinematic Storyboard story-level state persists across Media Studio and Storyboard Review, including story bible, narrative arc, cast/voice/audio maps, scene timeline, continuity graph, clip plans, QA summary, and review state.
- Prompt QA blocks cinematic plans that exceed Gemini Omni quota, misuse character/audio assets, lose story continuity, or over-promise lipsync beyond confirmed provider contract support.
- Prompt QA aggregates Story Continuity, Provider Constraint, Cinematic Direction, Character & Identity, Voice & Audio, Cost & Risk, and Safety/Policy reviewer verdicts.
- Prompt QA aggregates Product Truth, Marketplace Image Fidelity, and Customer Journey reviewer verdicts for marketplace product campaigns.
- Product Truth QA blocks provider submission when a product claim, caption, voiceover line, CTA, review statement, feature/spec, or trust signal is not grounded in marketplace product evidence, Feature 115 insight evidence, or approved user input.
- Marketplace Image Fidelity QA blocks or requests revision when selected product images do not match the product record, variant, packaging, color, or platform source.
- Customer Journey QA blocks or requests revision when review/sales/brand/storytelling content drifts away from the selected product journey stage.
- Feature 115 readiness gates are enforced: `ready_for_storytelling` may proceed to quality gate, `ready_with_warnings` requires warning acceptance, `needs_user_review` opens claim/evidence resolution, and `insufficient_evidence` routes back to capture or manual confirmation.
- Claim resolution decisions are applied before Director planning and dependent scenes/captions/voiceover/CTA are rewritten or removed before provider submission.
- Hard policy blocks from Feature 115 cannot be bypassed by normal claim approval or human override.
- Video QA records cinematic/story categories: narrative continuity, character consistency, framing/camera motion, lighting/color, pacing, audio alignment, audio-guided performance/lipsync intent, transition continuity, and CTA/platform fit.
- Video QA records marketplace/product categories: product visual fidelity, claim accuracy, evidence alignment, customer journey fit, platform CTA fit, and review/trust proof quality.
- Revisions can target story bible, scene, clip, voice line, asset mismatch, quota issue, cinematic quality issue, or continuity issue without regenerating unaffected clips when possible.
- re-hosting rejects unsupported or oversized result media and cleans temporary directories
- video QA failure records learning signal
- recurring issue creates pending recommendation
- auto skill patching remains disabled by default

## Completion Criteria

- Gemini Omni generation behaves as a guided loop, not a one-shot raw API submission.
- Gemini Omni generation does not spend provider credits until deterministic validators and reviewer-role quality gates pass or an authorized human override accepts the risk.
- Failed clips and failed provider submissions have deterministic recovery paths.
- Expensive multi-clip runs cannot start unless cost, budget, and concurrency checks pass.
- External provider and local DB state can be reconciled without duplicate jobs, duplicate assets, or duplicate refunds.
- Learning loop can improve skills without noisy one-off recommendations or contract-version mixing.
- Cancel and re-host flows are deterministic, idempotent, and backward compatible with existing media task records.
- Gemini Omni storyboard runs can reuse Storyboard Review for human review while Gemini Omni keeps the authoritative generation, billing, provider, QA, and learning state.
- Gemini Omni and Production outputs can also open in Video Edit for manual editing while keeping original provider generation, billing, QA, and learning state authoritative.
- Cinematic Storyboard runs can move between Media Studio and Storyboard Review as one coherent story timeline with targeted revisions and cinematic QA.
- Marketplace product campaigns can move between Media Studio and Storyboard Review with evidence-backed product claims, verified images, customer journey continuity, and Feature 115 insight provenance intact.
- Feature 114 can consume Feature 115 handoffs by capture ID, product ID, or insight ID without parsing free-form local insight text.
