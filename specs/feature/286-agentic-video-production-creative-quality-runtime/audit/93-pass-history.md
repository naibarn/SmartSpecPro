# Spec 286 — 93-pass Audit History (Non-normative)

This file preserves historical gap-review rationale. It does not override the R1.7 normative spec/contracts.

# 50. Twelve-pass design audit

This revision has been desk-audited through twelve distinct failure lenses.

## Pass 1 — Duplicate architecture
**Gap:** risk of creating Remotion/FFmpeg stack parallel to Spec 133.  
**Patch:** Spec 133 explicitly canonical; adapters only.

## Pass 2 — Template ceiling
**Gap:** fixed registry limits creativity.  
**Patch:** Registry fast path + generated-motion sandbox.

## Pass 3 — Unsafe AI code
**Gap:** dynamic code could violate Spec 133 safety posture.  
**Patch:** isolated sandbox + no automatic registry promotion.

## Pass 4 — Render-success fallacy
**Gap:** compile/render success mistaken for quality.  
**Patch:** mandatory rendered evidence for visible changes.

## Pass 5 — QC/creative confusion
**Gap:** deterministic measurements could be treated as aesthetic judgement.  
**Patch:** separate QC and multimodal Creative Critic authorities.

## Pass 6 — Regeneration damage/cost
**Gap:** whole-stage regeneration can destroy approved work and waste cost.  
**Patch:** issue ledger + targeted repair hierarchy + locks + invalidation.

## Pass 7 — Film duplication
**Gap:** Film Studio could implement its own finishing engine.  
**Patch:** Spec 286 is shared runtime; Specs 252/258 retain Film authority.

## Pass 8 — Provider lock-in
**Gap:** implementation might depend on Opus or external ffmpeg-skill.  
**Patch:** semantic capability contract + multiple providers.

## Pass 9 — Audio under-specification
**Gap:** good visual work can still sound amateur.  
**Patch:** Beat Grid, mix, ducking, loudness, sync, SFX and audio critic.

## Pass 10 — Mobile/user-operability
**Gap:** an agentic backend could require expert desktop tooling.  
**Patch:** review/approval remains Chat/Task Control/mobile capable; editor optional.

## Pass 11 — Runtime interruption
**Gap:** long iterative production can be lost on disconnect/restart.  
**Patch:** durable manifest + worker_jobs + Spec 278 continuity.

## Pass 12 — Quality claim without evidence
**Gap:** "modern/professional" could remain subjective marketing language.  
**Patch:** golden set, scorecards, hard blockers, acceptance scenarios, observability and
production exit criteria.

---


# 66D. Second Independent 15-Pass Audit — R1.1

This audit is distinct from the original twelve passes.

## Pass 13 — Timebase precision
**Gap found:** millisecond-only repair/evidence ranges can drift by frames/samples and mishandle VFR.  
**Patch:** Section 51 canonical rational timebase and PTS mapping.

## Pass 14 — Stale repair / concurrent mutation
**Gap found:** a critic can produce a correct repair for a candidate that is no longer current.  
**Patch:** Section 52 immutable candidate digest, revision fencing and repair idempotency.

## Pass 15 — Preview/final divergence
**Gap found:** preview approval could incorrectly certify a materially different final render.  
**Patch:** Section 53 Final Render Gate and parity classes.

## Pass 16 — Reference prompt injection
**Gap found:** text inside webpages/images/documents could be treated as production instruction.  
**Patch:** Section 54 reference content/instruction separation and sanitation.

## Pass 17 — Self-critique bias / evaluator drift
**Gap found:** one model can over-score its own work and evaluator upgrades can silently move thresholds.  
**Patch:** Section 55 versioned evaluation receipts, calibration and disagreement escalation.

## Pass 18 — Long-form scalability
**Gap found:** full multimodal inspection does not scale to long-form video.  
**Patch:** Section 56 hierarchical risk-weighted inspection with truthful coverage manifest.

## Pass 19 — Generative-media defects
**Gap found:** deterministic composition QC does not detect identity/logo/temporal defects inside generated shots.  
**Patch:** Section 57 generative-media continuity gate.

## Pass 20 — Reproducibility ambiguity
**Gap found:** deterministic Remotion output and nondeterministic model output were represented too similarly.  
**Patch:** Section 58 explicit reproducibility classes and provider drift handling.

## Pass 21 — Stale cache / incomplete invalidation
**Gap found:** targeted repair without canonical stage fingerprints can reuse invalid downstream artifacts.  
**Patch:** Section 59 stage fingerprints and dependency-aware invalidation.

## Pass 22 — Generated-code supply chain
**Gap found:** sandbox isolation alone does not govern package/font/shader dependencies and licensing.  
**Patch:** Section 60 dependency pinning, SBOM-like receipt, license/security promotion gates.

## Pass 23 — Accessibility/viewer safety
**Gap found:** production quality did not explicitly include caption accessibility, flashing risk or complex-script integrity.  
**Patch:** Section 61 accessibility/safety profiles and Thai-specific fixtures.

## Pass 24 — Multi-artifact delivery integrity
**Gap found:** MP4-only finality can leave subtitles/thumbnails/metadata stale or mismatched.  
**Patch:** Section 62 Delivery Package Manifest and cross-artifact checks.

## Pass 25 — Subjective quality calibration
**Gap found:** "modern/professional" could still become an LLM self-referential score.  
**Patch:** Section 63 human-labelled pairwise benchmark and promotion metrics.

## Pass 26 — Derived-evidence privacy
**Gap found:** contact sheets/transcripts/style evidence could be retained beyond need or leak sensitive content.  
**Patch:** Section 64 retention classes, ACL and egress logging.

## Pass 27 — Autonomous repair authority and runaway resource use
**Gap found:** quality loops needed finer creative/rights authority classes and a durable attempt budget.  
**Patch:** Sections 65–66 Repair Authority Matrix and Production Budget Envelope.

No pass above authorizes rewriting Spec 133, Spec 256, Film Studio authority, Video Editor authority,
worker_jobs, billing, approvals, or capability registry ownership.

---


# 86. Third Independent 16-Pass Audit — R1.2

This audit is distinct from the original twelve passes and R1.1's fifteen passes.

## Pass 28 — Provider substitution equivalence
**Gap found:** capability fallback could silently change cost, privacy, editability, determinism or quality.  
**Patch:** Section 67 material-difference guard and typed substitution decision.

## Pass 29 — Partial success / compensation
**Gap found:** late-stage failure could trigger unnecessary full regeneration or lose valid work.  
**Patch:** Section 68 production saga, reusable artifacts and compensating actions.

## Pass 30 — Cross-tenant cache isolation
**Gap found:** content hashes/fingerprints could accidentally become access mechanisms.  
**Patch:** Section 69 authorization-scoped cache and hash-not-auth invariant.

## Pass 31 — Rights lifecycle
**Gap found:** rights valid during preview may expire/revoke before publication or reuse.  
**Patch:** Section 70 rights snapshot and boundary revalidation.

## Pass 32 — Localization temporal drift
**Gap found:** translated/dubbed audio may not fit source timing and can degrade speech or layout.  
**Patch:** Section 71 locale-specific temporal/composition variants.

## Pass 33 — Adapter/schema drift
**Gap found:** provider adapters can remain online while their actual contract has drifted.  
**Patch:** Section 72 dispatch-time qualification and schema/version conformance.

## Pass 34 — Artifact tamper integrity
**Gap found:** approval/provenance could point to bytes modified after review.  
**Patch:** Section 73 digest-bound integrity envelope.

## Pass 35 — Intermediate artifact sprawl
**Gap found:** agentic loops can accumulate large preview/evidence/sandbox storage indefinitely.  
**Patch:** Section 74 lifecycle, pinning and reachability-aware garbage collection.

## Pass 36 — Approval scope leakage
**Gap found:** approval for one output could be incorrectly reused for another locale/aspect/final.  
**Patch:** Section 75 exact-hash and explicit-scope approval binding.

## Pass 37 — Correction/retraction lineage
**Gap found:** delivered defects/rights changes need replacement without rewriting history.  
**Patch:** Section 76 immutable supersession/retraction handoff.

## Pass 38 — Data locality / egress
**Gap found:** capability relevance could accidentally outrank private/local-only execution policy.  
**Patch:** Section 77 stage-level placement and egress manifest.

## Pass 39 — Multi-agent conflict
**Gap found:** Director/Critic/specialists can disagree and create revision ping-pong.  
**Patch:** Section 78 typed arbitration and precedence rules.

## Pass 40 — Optional critic/provider outage
**Gap found:** system behavior was under-specified when creative AI review is unavailable.  
**Patch:** Section 79 degraded modes and truthful human-review fallback.

## Pass 41 — Benchmark overfitting
**Gap found:** tuning only against the Golden Set can optimize the evaluator rather than real quality.  
**Patch:** Section 80 holdout/adversarial benchmark governance.

## Pass 42 — Resource oversubscription
**Gap found:** multiple video loops can exhaust host memory/GPU despite valid per-job plans.  
**Patch:** Section 81 declarative resource profile consumed by existing admission/placement authority.

## Pass 43 — Unsafe rollout/rollback
**Gap found:** broad feature flags alone do not guarantee safe disablement of a bad provider/critic/runtime path.  
**Patch:** Section 82 granular kill switches, version pinning and backward-compatible rollback.

No R1.2 pass above creates a second job scheduler, approval ledger, billing ledger, Skill Registry,
Capability Registry, Film database, Video Editor, Remotion foundation or publication authority.

---


# 104. Fourth Independent 14-Pass Audit — R1.3

This audit is distinct from the original 12, R1.1's 15 and R1.2's 16 passes.

## Pass 44 — Color pipeline integrity
**Gap found:** visually identical intent can be judged/rendered incorrectly across HDR/SDR/display transforms.  
**Patch:** Section 87 explicit source/working/output color contract and final tag verification.

## Pass 45 — Semantic production drift
**Gap found:** captions, edits, charts or localized visuals can become beautiful but materially wrong.  
**Patch:** Section 88 semantic-fidelity gate that outranks creative score.

## Pass 46 — Concurrent collaboration
**Gap found:** exact candidate fencing did not fully define parallel human/agent edit branches.  
**Patch:** Section 89 branch/rebase/merge semantics and no last-write-wins.

## Pass 47 — Environment-dependent render drift
**Gap found:** browser/GPU/font/codec differences can change layout/render while source is unchanged.  
**Patch:** Section 90 environment fingerprint and reproducibility classes.

## Pass 48 — Hidden metadata privacy
**Gap found:** final media may leak GPS, paths, author/device/internal identifiers.  
**Patch:** Section 91 export privacy scrub and metadata-aware final QC.

## Pass 49 — Authenticity/disclosure gap
**Gap found:** internal provenance alone does not satisfy external AI-origin/content-credential requirements.  
**Patch:** Section 92 origin manifest and optional credential/disclosure capability.

## Pass 50 — Autonomous authority ambiguity
**Gap found:** Auto/Guided UX modes did not precisely constrain what an agent may alter.  
**Patch:** Section 93 production autonomy profile and material-change review classes.

## Pass 51 — Delivery-policy freshness
**Gap found:** social/platform safe areas and export rules can become stale after a project is created.  
**Patch:** Section 94 versioned freshness-aware delivery snapshots.

## Pass 52 — Media parser/decoder attack surface
**Gap found:** prompt-injection defense did not cover malicious containers, fonts, SVG or decoder exhaustion.  
**Patch:** Section 95 quarantine and restricted ingestion boundary.

## Pass 53 — Non-atomic delivery package
**Gap found:** individually valid artifacts can still form an inconsistent package across revisions.  
**Patch:** Section 96 atomic package finalization bound to exact digests.

## Pass 54 — Manual creative intent erosion
**Gap found:** subsequent AI repair could undo intentional human/editor choices.  
**Patch:** Section 97 manual override receipt, locks and repair protection.

## Pass 55 — Privacy deletion propagation
**Gap found:** artifact GC/rights revocation did not fully express canonical privacy deletion across derivatives.  
**Patch:** Section 98 dependency-aware deletion/restriction propagation.

## Pass 56 — Export/embedding license granularity
**Gap found:** permission to render an asset does not imply permission to redistribute it in templates/marketplace.  
**Patch:** Section 99 resource export-license matrix.

## Pass 57 — Runtime quality regression rollout
**Gap found:** new Director/Critic/provider versions could degrade real quality despite unit/golden tests.  
**Patch:** Section 100 canary/shadow comparison and automated containment.

No R1.3 pass creates a second privacy authority, moderation authority, rights authority, job scheduler,
approval ledger, billing ledger, Capability Registry, Skill Registry, Video Editor, Film database,
Remotion foundation or publication service.

---


# 120. Fifth Independent 12-Pass Audit — R1.4

This audit is distinct from the original 12, R1.1's 15, R1.2's 16 and R1.3's 14 passes.

## Pass 58 — Clock/timecode correctness
**Gap found:** millisecond/rational timing did not fully specify drop-frame, VFR PTS and audio sample clocks.  
**Patch:** Section 105 explicit clock-domain/timebase mapping and drift semantics.

## Pass 59 — Delivery seekability/GOP integrity
**Gap found:** visually correct exports could still seek/start/segment poorly in real players.  
**Patch:** Section 106 keyframe/GOP/fast-start/segment delivery QC.

## Pass 60 — Accessibility deliverables
**Gap found:** earlier accessibility covered readability/flash risk but not SDH/audio description/reduced-motion packages.  
**Patch:** Section 107 first-class accessibility manifest and QA.

## Pass 61 — Professional audio topology
**Gap found:** audio design assumed mainly speech/stereo and under-specified stems/multi-channel/M&E.  
**Patch:** Section 108 channel-layout/stem/downmix contract.

## Pass 62 — Music rights and content-ID
**Gap found:** loudness/quality does not establish music/SFX publication eligibility.  
**Patch:** Section 109 cue usage, rights, platform/territory and content-ID risk projection.

## Pass 63 — Master/derivative lineage
**Gap found:** proxy/review renders could be accidentally reused as higher-quality production sources.  
**Patch:** Section 110 role-aware master/mezzanine/proxy lineage.

## Pass 64 — Platform-created derivative
**Gap found:** pre-upload QC cannot prove what an external platform finally presents.  
**Patch:** Section 111 optional post-upload/transcode observation with honest UNKNOWN state.

## Pass 65 — Subtitle parity
**Gap found:** burn-in and sidecar/platform tracks could drift despite individually valid files.  
**Patch:** Section 112 canonical cue-set parity assessment.

## Pass 66 — Cross-scene continuity
**Gap found:** per-scene generative QC did not fully preserve character/product/object state across sequence boundaries.  
**Patch:** Section 113 continuity bible and sequence-level critic.

## Pass 67 — Product/UI source freshness
**Gap found:** accurate-looking demos could silently use stale product/UI source.  
**Patch:** Section 114 visual source freshness/version projection.

## Pass 68 — Reference near-copy risk
**Gap found:** generalized style safety did not explicitly detect shot/layout/timing reproduction that is too close to a reference.  
**Patch:** Section 115 similarity-risk guard and re-direction.

## Pass 69 — Quality-history poisoning
**Gap found:** provider ranking could be distorted by duplicated, manipulated or poorly attributed feedback.  
**Patch:** Section 116 typed quality evidence, attribution and confidence-aware aggregation.

No R1.4 pass creates a second accessibility authority, rights authority, publication authority,
platform API, content-ID database, media store, job scheduler, Capability Registry, Video Editor,
Film database or Remotion foundation.

---


# 136. Sixth Independent 12-Pass Audit — R1.5

This audit is distinct from the previous 69 passes.

## Pass 70 — Decision provenance
**Gap found:** receipts showed outputs/providers but not a sufficiently normalized explanation of what versioned inputs and decision machinery selected them.  
**Patch:** Section 121 decision provenance without private chain-of-thought dependence.

## Pass 71 — Mid-run policy drift
**Gap found:** long-running productions could continue downstream after ACL/consent/budget/policy changed.  
**Patch:** Section 122 policy epoch snapshots and boundary reauthorization.

## Pass 72 — Safety/moderation handoff
**Gap found:** rights/quality controls did not explicitly define artifact-bound canonical safety review checkpoints.  
**Patch:** Section 123 non-duplicative safety/moderation binding.

## Pass 73 — Full production dependency SBOM
**Gap found:** generated-code SBOM was narrower than the entire renderer/plugin/font/model execution supply chain.  
**Patch:** Section 124 production SBOM/license/security attestation.

## Pass 74 — Economic attribution
**Gap found:** total budget/cost did not explain which scene/stage/retry/repair consumed resources.  
**Patch:** Section 125 stage/scene cost attribution and cause classification.

## Pass 75 — Derived-data privacy hygiene
**Gap found:** artifact deletion/restriction could leave embeddings/indexes/features searchable.  
**Patch:** Section 126 derived-data dependency and cleanup contract.

## Pass 76 — Causal observability
**Gap found:** independent receipts were not enough to reconstruct one cross-owner incident timeline.  
**Patch:** Section 127 end-to-end production trace context.

## Pass 77 — Systemic provider blast radius
**Gap found:** retries/fallback alone could create retry storms against a broadly broken provider/version.  
**Patch:** Section 128 health signal, circuit-open and quarantine semantics.

## Pass 78 — Data-use/training boundary
**Gap found:** user corrections/accepted outputs could otherwise drift into global benchmarks/training without a distinct authorization concept.  
**Patch:** Section 129 explicit data-use policy binding.

## Pass 79 — Change-impact simulation
**Gap found:** targeted repair existed, but an explicit pre-execution impact/cost/invalidation forecast was missing.  
**Patch:** Section 130 revision-fenced production impact plan.

## Pass 80 — Confidence-aware review
**Gap found:** creative score/thresholding under-specified escalation when critic confidence/coverage is weak.  
**Patch:** Section 131 confidence/coverage-based escalation and sampling.

## Pass 81 — Timeline round-trip fidelity
**Gap found:** editor handoff did not fully define which timeline semantics survive external/native interchange and reimport.  
**Patch:** Section 132 round-trip conformance report.

No R1.5 pass creates a second safety policy authority, privacy authority, billing ledger, provider
router, scheduler, telemetry backend, training platform, project database, Capability Registry,
Skill Registry, Video Editor, Film database or Remotion foundation.

---


# 152. Seventh Independent 12-Pass Audit — R1.6

This audit is distinct from the previous 81 passes.

## Pass 82 — Mutable-source drift
**Gap found:** URL/provider locator freshness existed, but approved plans were not explicitly bound to immutable admitted bytes/revisions.  
**Patch:** Section 137 immutable source snapshot binding.

## Pass 83 — Partial-rerender seams
**Gap found:** targeted repair could score well locally while producing a visible/audible discontinuity at preserved boundaries.  
**Patch:** Section 138 render handles and seam QC.

## Pass 84 — Reversible editing semantics
**Gap found:** immutable revisions/branches did not provide a normalized cross-surface undo/restore operation journal.  
**Patch:** Section 139 reversible edit journal and restore points.

## Pass 85 — Mixed-runtime schema compatibility
**Gap found:** distributed/offline Runners could interpret a newer manifest incompletely after non-atomic upgrades.  
**Patch:** Section 140 explicit version/feature negotiation and downgrade rules.

## Pass 86 — Data-visualization truth
**Gap found:** semantic checks did not fully verify chart geometry/axis/unit/counter values against bound data.  
**Patch:** Section 141 data-graphic binding and numeric fidelity QC.

## Pass 87 — Pronunciation correctness
**Gap found:** correct script/caption text could still produce professionally unacceptable TTS pronunciation.  
**Patch:** Section 142 scoped pronunciation lexicon and dependent-stage repair.

## Pass 88 — Provider cancellation truth
**Gap found:** cancellation saga did not fully distinguish request acceptance, actual provider stop, late completion and settlement uncertainty.  
**Patch:** Section 143 provider cancellation receipt and reconciliation.

## Pass 89 — Cover/first-frame/loop quality
**Gap found:** thumbnail existed as package artifact, but cover/poster/first-frame/loop behavior was not a first-class quality surface.  
**Patch:** Section 144 presentation assets and boundary assessments.

## Pass 90 — Stale review actions
**Gap found:** candidate repair fencing did not fully specify approval/fix actions opened concurrently across devices/sessions.  
**Patch:** Section 145 exact review-action binding and server-side stale outcomes.

## Pass 91 — Agent context completeness
**Gap found:** canonical locks/claims/rights could be lost during model-context compaction despite existing persistence.  
**Patch:** Section 146 bounded Production Context Projection with digest/provenance.

## Pass 92 — Object-store/SoR commit consistency
**Gap found:** production receipts did not fully specify partial R2/object upload vs database-commit failure states.  
**Patch:** Section 147 staged artifact commit and orphan/missing reconciliation.

## Pass 93 — Long-term portability
**Gap found:** durable runtime/recovery did not define an authorized archive capable of restoring a production after environment/provider changes.  
**Patch:** Section 148 portable production archive and dependency rehydration.

No R1.6 pass creates a second object store, database, source-ingestion authority, rights authority,
billing ledger, Runner protocol authority, Video Editor, Capability Registry, Film database,
archive-storage service or Remotion foundation.

---


