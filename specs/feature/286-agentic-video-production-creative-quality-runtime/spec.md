---
spec_id: 286
numbering_status: PROVISIONAL_PENDING_CANONICAL_SMARTSPECPRO_REGISTRY_CHECK
title: SmartAIHub Agentic Video Production & Creative Quality Runtime
short_name: AVPQR
revision: 1.7-contract-normalized-implementation-candidate
status: ARCHITECTURE_FROZEN_CANDIDATE_CONTRACT_NORMALIZED_PENDING_G0_PHYSICAL_RECONCILIATION
prepared: 2026-10-05
proposed_path: specs/feature/286-agentic-video-production-creative-quality-runtime/spec.md
audit_passes: 93  # cumulative: original 12 + second 15 + third 16 + fourth 14 + fifth 12 + sixth 12 + seventh independent 12-pass audit
primary_owner: shared agentic video-production planning, creative-direction, render-observe-repair loop, media execution capability contracts, video quality evidence
implementation_boundary: ADDITIVE ONLY; Spec 133 remains implemented foundation; no rewrite of implemented Spec 256; no second Film/Editor/Workflow/Job/Approval/Billing/Capability authority
canonical_dependencies:
  - Spec 133 Content & Video Intelligence Platform / Motion Studio
  - Spec 186 / Feature 195 worker_jobs
  - Spec 196 Shared Capability / Chat integration
  - Spec 207 usage quote / budget / settlement
  - Spec 215 Workflow runtime / dependency invalidation
  - Spec 220 project and access control
  - Spec 225 / 226 shared Chat and Task Control
  - Spec 231 provider/model routing
  - Spec 240 generated/review UI
  - Spec 247 Speech / Audio
  - Spec 251 Creator Workspace & Media Localization
  - Spec 252 AI Film Studio
  - Spec 253 Universal Product Command / Media Handoff
  - Spec 256 Skill-First Capability Discovery & Intent Execution
  - Spec 258 Film Stage Workspace & Motion Interchange
  - Spec 269 Assistant / Workforce runtime where persistent assistants invoke production
  - Spec 278 Durable Runner Execution Sessions / Recovery Fabric
  - Spec 279 Universal Command Ingress & Delegation Gateway
  - Spec 280 Metered Capability Commerce & Creator Economy Runtime
feature_flags:
  - video_agentic_runtime.enabled=false
  - video_agentic_runtime.motion_studio_upgrade.enabled=false
  - video_agentic_runtime.reference_style.enabled=false
  - video_agentic_runtime.visual_critic.enabled=false
  - video_agentic_runtime.audio_critic.enabled=false
  - video_agentic_runtime.generated_motion_sandbox.enabled=false
  - video_agentic_runtime.ffmpeg_provider.enabled=false
  - video_agentic_runtime.skill_promotion.enabled=false
  - video_agentic_runtime.film_shared_runtime.enabled=false
  - video_agentic_runtime.final_render_verify.enabled=false
  - video_agentic_runtime.evaluator_governance.enabled=false
  - video_agentic_runtime.long_form_hierarchical_qc.enabled=false
  - video_agentic_runtime.accessibility_qc.enabled=false
  - video_agentic_runtime.provider_substitution_guard.enabled=false
  - video_agentic_runtime.production_saga.enabled=false
  - video_agentic_runtime.cache_isolation.enabled=false
  - video_agentic_runtime.rights_revalidation.enabled=false
  - video_agentic_runtime.localization_timing_variants.enabled=false
  - video_agentic_runtime.adapter_conformance_gate.enabled=false
  - video_agentic_runtime.tamper_evident_receipts.enabled=false
  - video_agentic_runtime.artifact_gc.enabled=false
  - video_agentic_runtime.approval_hash_binding.enabled=false
  - video_agentic_runtime.delivery_supersession.enabled=false
  - video_agentic_runtime.data_locality_policy.enabled=false
  - video_agentic_runtime.multi_agent_arbitration.enabled=false
  - video_agentic_runtime.degraded_review_mode.enabled=false
  - video_agentic_runtime.benchmark_holdout.enabled=false
  - video_agentic_runtime.resource_admission.enabled=false
  - video_agentic_runtime.kill_switch.enabled=false
  - video_agentic_runtime.color_pipeline.enabled=false
  - video_agentic_runtime.semantic_fidelity_gate.enabled=false
  - video_agentic_runtime.collaboration_branches.enabled=false
  - video_agentic_runtime.render_environment_fingerprint.enabled=false
  - video_agentic_runtime.export_privacy_scrub.enabled=false
  - video_agentic_runtime.content_authenticity.enabled=false
  - video_agentic_runtime.autonomy_profiles.enabled=false
  - video_agentic_runtime.delivery_profile_freshness.enabled=false
  - video_agentic_runtime.input_quarantine.enabled=false
  - video_agentic_runtime.atomic_delivery_finalize.enabled=false
  - video_agentic_runtime.manual_override_provenance.enabled=false
  - video_agentic_runtime.privacy_deletion_propagation.enabled=false
  - video_agentic_runtime.asset_export_license_gate.enabled=false
  - video_agentic_runtime.quality_canary_rollout.enabled=false
  - video_agentic_runtime.timecode_clock_integrity.enabled=false
  - video_agentic_runtime.delivery_seekability.enabled=false
  - video_agentic_runtime.accessibility_tracks.enabled=false
  - video_agentic_runtime.audio_stems_channels.enabled=false
  - video_agentic_runtime.music_rights_content_id.enabled=false
  - video_agentic_runtime.master_derivative_lineage.enabled=false
  - video_agentic_runtime.post_upload_validation.enabled=false
  - video_agentic_runtime.subtitle_track_parity.enabled=false
  - video_agentic_runtime.continuity_bible.enabled=false
  - video_agentic_runtime.source_freshness.enabled=false
  - video_agentic_runtime.reference_similarity_guard.enabled=false
  - video_agentic_runtime.feedback_integrity.enabled=false
  - video_agentic_runtime.decision_provenance.enabled=false
  - video_agentic_runtime.policy_epoch_revalidation.enabled=false
  - video_agentic_runtime.content_safety_handoff.enabled=false
  - video_agentic_runtime.production_sbom.enabled=false
  - video_agentic_runtime.cost_attribution.enabled=false
  - video_agentic_runtime.derived_data_hygiene.enabled=false
  - video_agentic_runtime.causal_trace.enabled=false
  - video_agentic_runtime.provider_circuit_breaker.enabled=false
  - video_agentic_runtime.data_use_boundary.enabled=false
  - video_agentic_runtime.plan_simulation.enabled=false
  - video_agentic_runtime.review_escalation.enabled=false
  - video_agentic_runtime.timeline_roundtrip_conformance.enabled=false
  - video_agentic_runtime.source_snapshot_binding.enabled=false
  - video_agentic_runtime.partial_render_seam_qc.enabled=false
  - video_agentic_runtime.reversible_edit_journal.enabled=false
  - video_agentic_runtime.schema_negotiation.enabled=false
  - video_agentic_runtime.data_graphics_fidelity.enabled=false
  - video_agentic_runtime.pronunciation_lexicon.enabled=false
  - video_agentic_runtime.provider_cancel_reconcile.enabled=false
  - video_agentic_runtime.cover_poster_loop_assets.enabled=false
  - video_agentic_runtime.review_action_fencing.enabled=false
  - video_agentic_runtime.production_context_projection.enabled=false
  - video_agentic_runtime.artifact_commit_reconcile.enabled=false
  - video_agentic_runtime.portable_archive_restore.enabled=false
---


> **R1.7 Implementer Pack:** This `spec.md` is the normative architecture/product document. Historical 93-pass review text is intentionally moved to `audit/93-pass-history.md`. Executable details are normalized in `contracts/`, `implementation/`, and `tests/`.

# Spec 286 — SmartAIHub Agentic Video Production & Creative Quality Runtime

## 0. Executive decision

SmartAIHub SHALL upgrade the existing Motion Studio / Spec 133 video stack from a primarily
template-driven rendering workflow into a **shared agentic video-production runtime** capable of
planning, composing, rendering, observing, critiquing, repairing, verifying, and delivering
professional motion/video outputs.

This Spec does **not** replace Spec 133.

Spec 133 remains the canonical implemented foundation for:

- `VideoProjectDocument` / neutral project schema;
- Remotion compilation and rendering;
- Motion Template Registry;
- video-project persistence and revisions;
- Brand Kit integration;
- captions and audio layers;
- Remotion Player preview;
- existing render jobs;
- existing video quality-loop implementation where present;
- existing Motion Studio product surface.

The new runtime SHALL sit above and around that foundation.

The canonical product change is:

```text
BEFORE

Prompt / narration
    ↓
Scene plan
    ↓
Pick known template
    ↓
Compile Remotion
    ↓
Render
    ↓
MP4


AFTER

Intent / Brief / References
    ↓
Creative Director
    ↓
Director Brief + Style Guide + Beat/Timing Plan
    ↓
Shot / Scene Design
    ↓
Skill-first Capability Resolution
    ↓
Composition / Editing / Audio / Generative Execution
    ↓
MANDATORY preview evidence
    ↓
Deterministic QC + Multimodal Creative Critique
    ↓
Timecoded / layer-scoped targeted repair
    ↓
Re-render only invalidated work
    ↓
Keep-best / Approval
    ↓
Platform-specific delivery + Production Receipt
```

The objective is not merely to make a render succeed.

The objective is:

> **SmartAIHub SHALL be able to produce video that is technically valid, visually intentional,
> contemporary, brand-consistent, narratively coherent, rhythmically controlled, inspectable,
> repairable, reusable, and suitable for real publication.**

The runtime SHALL be model-independent. Claude/Opus, OpenAI/Codex, Gemini, local models, future
agents, or another authorized reasoning provider MAY act as the creative/planning intelligence.
No architecture in this Spec may depend on one named model.

---

# 1. Why this Spec exists

## 1.1 Observed product gap

The existing Motion Studio can already render video, but current outputs may exhibit one or more of
the following failure modes:

- presentation-slide aesthetics rather than contemporary motion design;
- weak visual hierarchy;
- generic gradient/particle backgrounds used as filler;
- insufficient relationship between narration and visual composition;
- captions treated as plain text rather than designed retention elements;
- static scene layouts;
- repetitive motion;
- limited scene archetypes;
- weak typography;
- poor use of B-roll and reference assets;
- excessive empty space without intentional negative-space design;
- lack of focal point;
- weak pacing;
- no beat-aware cutting or animation;
- technically successful render incorrectly treated as production success;
- no mandatory visual inspection after pixels change;
- regeneration of a whole stage instead of repairing a specific defect;
- inability to create a novel motion treatment when the existing template registry has no fit.

These are not primarily renderer defects.

They are **creative-direction, capability-resolution, evidence, and closed-loop production defects**.

## 1.2 External architecture lessons

Recent code-driven video workflows demonstrate an architecture in which a capable coding/multimodal
agent can use HTML/SVG/Canvas/Remotion/Three.js/other deterministic graphics and FFmpeg-style media
operations as an execution surface, then inspect rendered frames and iteratively repair the result.

This Spec adopts the architecture pattern, not any external product implementation:

```text
Brain / Director
    decides what and why

Production Plan
    describes typed operations

Skills / Providers
    execute deterministic or model-based capabilities

Artifacts
    preserve inputs/outputs/versions/provenance

QC
    measures what happened

Multimodal Critic
    judges visual/narrative quality from evidence

Agent
    replans/repairs based on findings
```

The runtime MUST preserve the SmartAIHub authority boundaries and SHALL NOT simply expose a shell,
raw FFmpeg filters, arbitrary production JavaScript, or unbounded model-written code.

---

# 2. Non-negotiable architecture invariants

```text
RENDER SUCCESS ≠ PRODUCTION QUALITY

SOURCE CODE ≠ RENDERED PIXELS
PROBE SUCCESS ≠ VISUAL INSPECTION
TECHNICAL QC ≠ CREATIVE JUDGEMENT
CREATIVE SCORE ≠ AUTHORIZATION TO PUBLISH

TEMPLATE REGISTRY ≠ COMPLETE CREATIVE SPACE
GENERATED CODE ≠ TRUSTED PRODUCTION CODE
SANDBOX SUCCESS ≠ REGISTRY PROMOTION

REFERENCE STYLE ≠ BRAND AUTHORITY
STYLE SIMILARITY ≠ COPYING PROTECTED CONTENT
BRAND KIT ≠ OBSERVED STYLE GUIDE

SKILL ≠ TOOL
CAPABILITY ≠ PROVIDER
PROVIDER AVAILABILITY ≠ AUTHORIZATION
MCP TOOL ≠ BUSINESS PERMISSION

FILM STUDIO ≠ SECOND REMOTION ENGINE
MOTION STUDIO ≠ SECOND VIDEO EDITOR
FFMPEG PROVIDER ≠ SECOND ORCHESTRATOR

TIMELINE ≠ PROJECT SOURCE OF TRUTH FOR EVERY PRODUCT
CHAT ≠ VIDEO PROJECT SOURCE OF TRUTH

QC FAIL ≠ EXECUTION FAILURE
QC PASS ≠ CREATIVE APPROVAL

FULL REGENERATION ≠ DEFAULT REPAIR

ONE ASPECT RATIO ≠ SAFE CENTER-CROP FOR ALL OTHERS

AESTHETIC JUDGEMENT ≠ DETERMINISTIC MEASUREMENT
DETERMINISTIC MEASUREMENT ≠ AESTHETIC JUDGEMENT

USER/LLM GENERATED REACT/THREE CODE
    MUST NOT
DIRECTLY ENTER THE TRUSTED SPEC-133 PRODUCTION RENDERER
```

---

# 3. Canonical ownership boundaries

## 3.1 Spec 133 — implemented foundation

Spec 133 remains authoritative for the existing Motion Studio and video-project foundation.

Spec 286 MAY:

- invoke Spec 133 render/preview/project capabilities;
- adapt new production artifacts into the existing neutral schema;
- enrich QA inputs;
- register additive capabilities through current extension mechanisms;
- reuse existing Motion Template Registry entries;
- produce candidate motion components for controlled promotion.

Spec 286 MUST NOT:

- redefine `VideoProjectDocument`;
- replace the existing Remotion compiler;
- create a second `video_projects` source of truth;
- create another render-job authority;
- silently change existing project semantics;
- require existing projects to migrate before they remain usable.

## 3.2 Spec 256 — implemented skill/capability semantics

Spec 256 remains authoritative for Skill-first discovery and semantic capability resolution.

Spec 286 SHALL publish video-production capabilities into the existing capability surface through
adapters/projections.

Spec 286 MUST NOT create a new generic Skill Registry, Capability Registry, tool discovery system,
or separate provider router.

## 3.3 Specs 252 / 258 — Film Studio

Spec 252 remains Film-domain authority.

Spec 258 remains authority for Film-specific Prompt Motion, Quick Shot Canvas, Stage Workspace,
camera/object trajectories, Playblast, and structured motion interchange.

Spec 286 supplies **shared video-production intelligence and execution** that Film Studio MAY invoke
at scoped shot/scene/selected-sequence level.

Film Studio MUST NOT create a second:

- Remotion engine;
- caption engine;
- FFmpeg abstraction;
- video QC system;
- audio finishing engine;
- reference-style engine;
- generic production manifest format when a Spec 286 projection can represent the work.

## 3.4 Existing Video Editor

The existing Video Editor remains the authoritative expert timeline editor.

Spec 286 MAY generate or update candidate timelines through existing adapters/handoffs.

Spec 286 SHALL NOT become a second full manual NLE.

## 3.5 Spec 251 Creator Workspace

Spec 251 remains the creator/localization workspace authority.

Spec 286 MAY provide:

- production-quality visual finishing;
- multi-aspect variants;
- captions;
- audio finishing;
- QC;
- delivery receipts.

Localization authority remains with Spec 251 / speech/audio authorities.

## 3.6 Workflow, job, placement, approvals, billing

Existing owners remain canonical:

```text
Logical workflow / invalidation
    → Spec 215

Physical execution authority
    → worker_jobs / existing job control

Durable execution session / recovery
    → Spec 278

Provider/model routing
    → Spec 231 / existing media gateway

Speech/audio provider authority
    → Spec 247

Approval / policy / access
    → existing canonical owners

Usage quote / settlement
    → Spec 207 / current billing systems

Command ingress
    → Spec 279 where applicable

Metered Skill/capability commerce
    → Spec 280 where applicable
```

Spec 286 MUST NOT create parallel authorities.

---

# 4. Target architecture

```text
                       User / Chat / Motion Studio / Film Studio
                                      │
                                      ▼
                              Production Intent
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                    Brand Kit                References
                         │                         │
                         └────────────┬────────────┘
                                      ▼
                             Creative Director
                                      │
             ┌────────────────────────┼─────────────────────────┐
             │                        │                         │
       Director Brief          Observed Style Guide        Beat/Audio Map
             │                        │                         │
             └────────────────────────┼─────────────────────────┘
                                      ▼
                            Production Manifest
                                      │
                                      ▼
                         Skill-first Capability Plan
                                      │
       ┌──────────────────┬───────────┼─────────────┬──────────────────┐
       │                  │           │             │                  │
 Spec 133 Motion      Media Edit    Audio/TTS    Generative       Film/Stage
 Remotion/Templates    Provider      Provider      Video            Provider
       │                  │           │             │                  │
       └──────────────────┴───────────┼─────────────┴──────────────────┘
                                      ▼
                               Preview Artifacts
                                      │
                     ┌────────────────┼─────────────────┐
                     │                │                 │
                Technical QC     Visual Critic     Audio/Timing Critic
                     │                │                 │
                     └────────────────┼─────────────────┘
                                      ▼
                                Issue Ledger
                                      │
                              Targeted Repairs
                                      │
                           Invalidated stages only
                                      │
                                      ▼
                              Preview / QC loop
                                      │
                         target achieved / max bound
                                      ▼
                             Human / policy gate
                                      │
                                      ▼
                        Delivery + Production Receipt
```

---

# 5. Product modes

The same runtime SHALL support different user experiences without changing the underlying execution
contract.

## 5.1 Motion Studio

Primary intent:

- explainer;
- branded motion graphic;
- infographic;
- product/demo video;
- social short;
- title/kinetic typography;
- UI/product launch;
- educational visual story.

Motion Studio SHALL become the primary visual-design surface for Spec 133 projects while retaining
legacy project compatibility.

## 5.2 Film Studio

Primary intent:

- cinematic shot/scene;
- generated take;
- shot enhancement;
- compositing;
- stage/playblast-to-final workflow;
- structured camera/object motion;
- story-driven audiovisual production.

Film Studio calls Spec 286 as a shared runtime.

## 5.3 Creator Workspace

Primary intent:

- repurpose;
- localize;
- subtitle;
- dub;
- social variants;
- channel delivery.

## 5.4 Direct capability use

Users or agents MAY invoke a single capability without creating a full autonomous production.

Example:

```text
"ทำ caption แบบ pop karaoke ให้คลิปนี้"
```

SHALL NOT silently become:

```text
rewrite script
→ generate B-roll
→ change music
→ recolor video
→ publish
```

This preserves Spec 256's function-complete principle.

---

# 6. New core artifact — Video Production Manifest

Spec 286 SHALL introduce a logical durable production manifest.

Before physical persistence is added, implementation MUST perform G0 schema reconciliation to avoid
duplicating an existing suitable record.

```ts
interface VideoProductionManifestV1 {
  schemaVersion: 'sah.video.production.v1';

  productionId: string;
  tenantId: string;
  projectId: string;

  origin: {
    product: 'MOTION_STUDIO'|'FILM_STUDIO'|'CREATOR'|'VIDEO_EDITOR'|'CHAT'|'API';
    canonicalProjectRef: string;
    canonicalRevisionRef: string;
  };

  goal: VideoCreativeGoalV1;
  directorBriefRef?: string;
  declaredBrandKitRef?: string;
  observedStyleGuideRefs: string[];
  beatGridRef?: string;

  sceneRefs: string[];
  assetManifestRef: string;
  capabilityPlanRef: string;

  stageStates: Record<string, ProductionStageStateV1>;

  lockedArtifactRefs: string[];
  approvedArtifactRefs: string[];

  currentBestCandidateRef?: string;
  reviewLedgerRef: string;
  repairLedgerRef: string;

  budgetEnvelopeRef?: string;
  policySnapshotRef: string;

  createdBy: string;
  createdAt: string;
  revision: number;
}
```

## 6.1 Manifest purpose

The manifest exists so another agent/session/runtime can continue production without reconstructing
state from chat history.

It SHALL answer:

- what is the creative goal?
- what has already been approved?
- what is locked?
- what references were used?
- what capabilities/providers were selected?
- what artifacts were produced?
- what failed?
- which QC issues remain?
- what repair attempts happened?
- what is the current best candidate?
- what remains invalidated?
- what can be reused without charge/recompute?

## 6.2 Required logical companion artifacts

```text
creative_brief.json
director_brief.json
style_guide.json
beat_grid.json
storyboard.json
shot_plan.json
asset_manifest.json
motion_plan.json
audio_plan.json
capability_plan.json
timeline_projection.json
render_manifest.json
review_ledger.json
repair_ledger.json
delivery_manifest.json
production_receipt.json
```

Not every project requires every artifact.

The production plan SHALL state which artifacts are applicable.

---

# 7. Creative Director

## 7.1 Responsibility

The Creative Director is a reasoning role, not a renderer.

It SHALL decide/propose:

- narrative shape;
- information hierarchy;
- scene function;
- visual metaphor;
- shot/scene diversity;
- use of reference;
- typography direction;
- image/B-roll role;
- motion language;
- transition grammar;
- audio rhythm;
- where generative video is useful;
- where deterministic graphics are preferable;
- when a known template is sufficient;
- when a new motion capability is needed.

It MUST NOT bypass:

- capability resolution;
- policy;
- budget;
- asset rights;
- renderer contracts;
- approval;
- execution authority.

## 7.2 Director Brief

```ts
interface DirectorBriefV1 {
  goal: string;
  audience: string;
  platformTargets: string[];
  durationTargetMs: number;
  narrativeMode:
    | 'EXPLAINER'
    | 'PRODUCT_LAUNCH'
    | 'SOCIAL_SHORT'
    | 'EDITORIAL'
    | 'CINEMATIC'
    | 'STORY'
    | 'SHOWREEL'
    | 'CUSTOM';

  creativePrinciples: string[];
  emotionalArc?: string[];
  visualPriorities: string[];
  forbiddenTreatments: string[];

  typographyDirection: TypographyDirectionV1;
  compositionDirection: CompositionDirectionV1;
  motionDirection: MotionDirectionV1;
  audioDirection: AudioDirectionV1;

  referenceUsagePolicy: 'INSPIRATION_ONLY'|'BRAND_REFERENCE'|'USER_OWNED_TEMPLATE';
  qualityTargets: VideoQualityTargetsV1;
}
```

The Director Brief is versioned and reviewable.

A user MAY lock it before expensive generation.

---

# 8. Declared Brand vs Observed Style Intelligence

## 8.1 Two distinct sources

```text
Declared Brand
    = Brand Kit, explicit user/tenant rules, logo, fonts, colors, prohibited use

Observed Style
    = measurable/derived grammar extracted from authorized references
```

The runtime MUST NOT collapse these into one.

Brand authority wins on conflict unless the user explicitly changes the brand rule.

## 8.2 Reference Style Analysis

For an authorized reference video/image/design/web capture, the system MAY derive:

```ts
interface ObservedVideoStyleGuideV1 {
  referenceRefs: string[];

  palette: {
    dominant: string[];
    accent: string[];
    background: string[];
    contrastProfile: string;
  };

  typography: {
    familyClass?: string;
    weightPattern: string[];
    approximateScaleRatios: number[];
    alignmentPatterns: string[];
    lineLengthProfile?: string;
    kineticBehavior?: string[];
  };

  composition: {
    density: 'SPARSE'|'BALANCED'|'DENSE';
    grids: string[];
    dominantLayouts: string[];
    negativeSpaceBehavior: string;
    focalPointPatterns: string[];
  };

  motion: {
    tempo: string;
    easingFamilies: string[];
    transitionGrammar: string[];
    depthUsage: string;
    parallaxUsage: string;
    cameraPatterns: string[];
  };

  editing: {
    medianShotMs?: number;
    shotDurationDistribution?: number[];
    cutPatterns: string[];
    rhythmNotes: string[];
  };

  captions?: {
    placement: string[];
    emphasisPatterns: string[];
    lineCountProfile: string;
  };

  confidence: Record<string, number>;
  extractionEvidenceRefs: string[];
}
```

## 8.3 Reference safety

The extractor SHALL derive **design grammar**, not automatically reproduce:

- copyrighted logos;
- trademarked assets;
- exact protected layouts;
- source footage;
- named character likenesses;
- unlicensed fonts/assets.

The system SHOULD describe style using general design properties rather than prompt the agent to
copy an identified creator's entire work.

---

# 9. Video Design System

Motion Studio SHALL gain a first-class Video Design System.

## 9.1 Design tokens

```text
Color Tokens
Typography Scale
Spacing Scale
Corner Radius
Border / Stroke
Shadow / Glow
Glass / Surface
Safe Areas
Caption Zones
Image Treatments
Icon Treatments
Transition Family
Motion Intensity
Camera Personality
Audio Personality
```

## 9.2 Scene archetypes

The runtime SHALL support a catalog of semantic scene archetypes independent of a specific renderer:

```text
HOOK
TITLE
KEY_POINT
EXPLANATION
QUOTE
STAT
CHECKLIST
COMPARISON
TIMELINE
PROCESS
PRODUCT_DEMO
UI_DEMO
IMAGE_LED
BROLL_LED
EXPERT_POINT
TESTIMONIAL
MYTH_VS_FACT
BEFORE_AFTER
MAP
CHART
SUMMARY
CTA
CREDITS
```

A scene archetype is not necessarily one Remotion template.

Multiple capability strategies MAY fulfill one archetype.

## 9.3 Motion language

The system SHALL express motion intent semantically:

```text
REVEAL
STAGGER
FOCUS_SHIFT
PARALLAX
MASK_TRANSITION
KINETIC_TYPE
CARD_CHOREOGRAPHY
COUNT
TRACK
FOLLOW
ORBIT
PUSH
PULL
PUNCH
HOLD
BEAT_HIT
EMPHASIS
SETTLE
EXIT
```

Provider-specific implementation is resolved after intent.

---

# 10. Motion Capability Resolution

For each scene:

```text
Scene intent
    ↓
Spec 256 capability search
    ↓
Known approved capability?
    │
    ├── YES
    │     ↓
    │   Execute known provider/template
    │
    └── NO
          ↓
      Capability Gap
          ↓
  choose safe fallback OR
  Generated Motion Sandbox
```

## 10.1 Existing Motion Template Registry becomes the fast path

Spec 133's Motion Template Registry remains valuable.

It SHALL be treated as:

- reviewed;
- deterministic;
- cacheable;
- low-risk;
- preferred for repeated/common designs.

It MUST NOT remain the only creative path.

## 10.2 Template selection quality

Selection SHALL consider more than narration semantics.

Minimum inputs:

- scene function;
- visual density;
- desired hierarchy;
- brand/style;
- duration;
- aspect ratio;
- audio beat/rhythm;
- prior/next scene;
- repetition penalty;
- asset availability;
- render cost;
- quality history.

The system SHOULD reject a template if it technically matches category metadata but creates
repetitive or weak visual storytelling.

---

# 11. Generated Motion Sandbox

## 11.1 Purpose

When no approved capability sufficiently expresses the intended design, an authorized agent MAY
generate a new motion candidate.

Supported candidate implementations MAY include controlled:

- Remotion component;
- SVG;
- Canvas;
- WebGL/Three.js;
- HTML/CSS animation;
- other reviewed future render adapters.

## 11.2 Hard security boundary

Generated motion code SHALL execute only in an isolated authoring/render sandbox.

It SHALL NOT:

- execute inside the trusted application server;
- inherit production secrets;
- receive arbitrary network egress;
- mutate canonical data directly;
- run shell commands supplied by the model;
- bypass declared dependency allowlists;
- enter Spec 133 production registry merely because it rendered once.

## 11.3 Generated candidate lifecycle

```text
PROPOSED
    ↓
STATIC_VALIDATED
    ↓
SANDBOX_COMPILED
    ↓
PREVIEW_RENDERED
    ↓
VISUALLY_REVIEWED
    ↓
SECURITY_CHECKED
    ↓
CONFORMANCE_TESTED
    ↓
EPHEMERAL_APPROVED
    ↓
(optional)
PROMOTION_CANDIDATE
    ↓
HUMAN/OWNER REVIEW
    ↓
REGISTRY_APPROVED
```

## 11.4 Ephemeral use

A candidate MAY be used for one production without becoming a reusable global capability if policy
allows and all sandbox/output checks pass.

## 11.5 Promotion

Promotion SHALL require:

- stable typed parameters;
- deterministic fixture;
- security review;
- render fixture;
- aspect-ratio behavior;
- font behavior;
- failure behavior;
- cost classification;
- visual examples;
- capability metadata;
- versioned source digest.

---

# 12. Structured Media Execution Provider

SmartAIHub SHALL expose media-processing operations through typed capabilities.

The implementation MAY be:

- existing native SmartAIHub FFmpeg code;
- Rust/Node/Python adapter;
- a compatible external `ffmpeg-skill` installation;
- another future provider satisfying the same SmartAIHub contract.

The product MUST NOT hard-depend on one external repository.

## 12.1 Minimum capability families

```text
media.probe
media.scene.detect
media.beat.detect
media.cut
media.join
media.duration.fit
media.reframe
media.crop
media.insert
media.broll
media.overlay
media.caption
media.caption.animate
media.graphics
media.transition
media.audio.clean
media.audio.mix
media.audio.duck
media.audio.sync
media.audio.loudness
media.color.transform
media.proxy
media.export
media.platform.check
media.contact_sheet
media.frame.extract
```

## 12.2 Probe-first

Before an operation whose plan depends on actual media properties, the runtime SHALL measure:

- duration;
- FPS / VFR;
- resolution;
- rotation;
- pixel format;
- codec;
- color/HDR tags;
- audio streams;
- sample rate/channels where relevant.

The planner MUST NOT infer these from filename or user prose.

## 12.3 Plan before expensive execution

Providers SHOULD expose a dry-run/plan surface when meaningful.

The plan SHALL be serializable, fingerprint inputs, and reject execution if safety-critical inputs
changed unless replanned.

## 12.4 No raw filter surface

The normalized SmartAIHub capability contract SHALL NOT accept:

```text
raw shell
raw argv
raw filter_complex
arbitrary executable
environment injection
```

from an untrusted LLM/user request.

---

# 13. Beat Grid & Temporal Intelligence

## 13.1 Beat Grid

```ts
interface BeatGridV1 {
  sourceAudioRef: string;
  bpm?: number;
  beatsMs: number[];
  downbeatsMs?: number[];
  sections?: Array<{startMs:number; endMs:number; label:string; confidence:number}>;
  peaks?: number[];
  silenceRanges?: Array<{startMs:number; endMs:number}>;
  source: 'MEASURED'|'MODEL_ASSISTED'|'USER_AUTHORED';
  confidence: number;
}
```

## 13.2 Uses

The Director MAY align:

- cuts;
- title hits;
- kinetic typography;
- scene changes;
- SFX;
- logo reveal;
- camera punch;
- object motion emphasis;
- visual cadence;

to the Beat Grid.

Beat sync is guidance, not a requirement for every genre.

Medical, educational, documentary, dialogue, and calm content MAY intentionally avoid strong beat
locking.

---

# 14. Narration, TTS, Music and Sound Design

## 14.1 Audio plan

```ts
interface AudioProductionPlanV1 {
  narrationTrackRefs: string[];
  dialogueTrackRefs: string[];
  musicTrackRefs: string[];
  sfxEvents: Array<{
    timeMs: number;
    semanticRole: 'WHOOSH'|'CLICK'|'IMPACT'|'RISE'|'AMBIENCE'|'CUSTOM';
    assetRef?: string;
    generationRequestRef?: string;
  }>;
  duckingRules: string[];
  loudnessTargetRef: string;
  beatGridRef?: string;
}
```

## 14.2 Voice

Voice generation/voice cloning SHALL remain governed by Spec 247 and existing consent/rights
controls.

Spec 286 only orchestrates authorized audio artifacts.

## 14.3 Audio finishing

Final production SHALL verify at least:

- narration audibility;
- clipping/true peak;
- channel configuration;
- speech/music balance;
- ducking behavior;
- sync;
- target loudness where platform/profile requires it;
- unexpected silence;
- missing audio.

---

# 15. Captions as designed production elements

Captions SHALL be first-class design elements, not only transcript rendering.

Supported semantic styles SHOULD include:

```text
CLEAN_MINIMAL
SOCIAL_EMPHASIS
KARAOKE
POP_WORD
EDITORIAL
EDUCATIONAL
CORPORATE
PREMIUM
CUSTOM_BRAND
```

Caption layout SHALL consider:

- script/language;
- Thai shaping/font support;
- line count;
- reading speed;
- safe areas;
- UI overlays of destination platform;
- face/product occlusion;
- emphasis words;
- aspect-ratio variant.

A caption pass MAY alter typography/layout without regenerating narration or source media.

---

# 16. Mandatory Render-Observe-Repair Loop

## 16.1 Preview inspection is no longer optional

For any stage that changes visible pixels:

```text
preview render
    +
visual evidence extraction
```

is REQUIRED before the system may claim visual quality.

This supersedes any looser workflow interpretation in which preview rendering is optional for a
creative-quality decision.

It does not rewrite Spec 133; it defines the higher-level Spec 286 production gate.

## 16.2 Evidence extraction

Evidence MAY include:

- selected scene boundary frames;
- uniform interval frames;
- transition-adjacent frames;
- high-motion frames;
- caption-active frames;
- reference comparison frames;
- contact sheets;
- low-resolution preview clips;
- audio waveform / loudness evidence;
- timing tables.

The system SHALL avoid needlessly sending every full-resolution frame to a multimodal model. Long-form work follows the hierarchical coverage contract in Section 56.

## 16.3 Contact sheet

A default visual contact sheet SHOULD include:

```text
scene start
scene middle
scene end
transition before/after
caption-heavy moment
declared visual peak
```

with timestamps and scene IDs.

---

# 17. Two-layer quality system

Quality SHALL be split into two different authorities.

## 17.1 Deterministic QC

Measures facts.

Examples:

- output exists;
- resolution;
- aspect;
- FPS;
- duration;
- codec;
- color tags;
- loudness;
- black frames;
- frozen frames;
- missing streams;
- caption overflow where computable;
- safe-area bounding boxes;
- font availability;
- missing assets;
- broken references;
- render error;
- delivery profile compliance.

Result:

```text
PASS
WARN
FAIL
UNKNOWN
```

A QC `FAIL` is a successful QC execution that found a failing artifact.

## 17.2 Multimodal Creative Critic

Judges from rendered evidence:

- visual hierarchy;
- composition;
- modernity/contemporary fit;
- readability;
- typography quality;
- visual/narration alignment;
- pacing;
- scene variety;
- motion coherence;
- transition quality;
- focal point;
- visual density;
- excessive decoration;
- brand consistency;
- reference-style adherence;
- emotional/narrative fit;
- B-roll relevance;
- caption aesthetics;
- mobile/social usability;
- perceived polish.

The critic SHALL separate:

```text
OBSERVATION
INFERENCE
JUDGEMENT
REPAIR_PROPOSAL
```

and attach evidence references.

---

# 18. Video Quality Scorecard

```ts
interface VideoQualityScorecardV1 {
  candidateRef: string;

  deterministicStatus: 'PASS'|'WARN'|'FAIL'|'UNKNOWN';

  scores: {
    composition: number;
    typography: number;
    readability: number;
    motion: number;
    pacing: number;
    narrativeVisualMatch: number;
    assetQuality: number;
    brandConsistency: number;
    audio: number;
    captions: number;
    platformFitness: number;
    contemporaryPolish: number;
  };

  hardBlockers: VideoIssueV1[];
  majorIssues: VideoIssueV1[];
  minorIssues: VideoIssueV1[];

  overallCreativeScore: number;
  confidence: number;
  evidenceRefs: string[];
}
```

## 18.1 Default publish candidate gate

Recommended default for automatically generated marketing/social motion work:

```text
deterministicStatus != FAIL
hardBlockers == 0
overallCreativeScore >= 8.0 / 10
readability >= 8.5
typography >= 8.0
composition >= 8.0
platformFitness >= 8.5
```

These values are configurable profiles, not universal artistic truth.

## 18.2 Do not optimize one scalar blindly

The agent MUST NOT improve `overallCreativeScore` by sacrificing a locked dimension.

Example:

```text
higher motion score
but
lower readability

=> regression
=> reject candidate
```

---

# 19. Timecoded Issue Ledger

```ts
interface VideoIssueV1 {
  issueId: string;
  candidateRef: string;

  category:
    | 'TECHNICAL'
    | 'COMPOSITION'
    | 'TYPOGRAPHY'
    | 'CAPTION'
    | 'MOTION'
    | 'PACING'
    | 'AUDIO'
    | 'ASSET'
    | 'BRAND'
    | 'NARRATIVE'
    | 'PLATFORM';

  severity: 'BLOCKER'|'MAJOR'|'MINOR'|'NOTE';

  sceneId?: string;
  layerId?: string;
  startMs?: number;
  endMs?: number;

  observation: string;
  reason: string;

  evidenceRefs: string[];

  repairTarget:
    | 'LAYOUT'
    | 'TEXT_STYLE'
    | 'CAPTION_STYLE'
    | 'MOTION_PARAMS'
    | 'MOTION_COMPONENT'
    | 'SCENE_PLAN'
    | 'ASSET'
    | 'AUDIO'
    | 'TIMING'
    | 'TRANSITION'
    | 'DELIVERY';

  preserveRefs: string[];
}
```

The issue ledger SHALL support machine-actionable repairs and human review.

---

# 20. Targeted Repair Engine

The default response to a localized defect SHALL be a localized repair.

Examples:

```text
headline clipped
    → patch text size/line break/layout only

caption covers face
    → reposition caption / choose alternate safe zone

scene too static
    → patch motion strategy for scene only

BGM masks narration
    → patch ducking only

one shot poorly cropped in 9:16
    → patch that aspect variant only

transition feels late
    → adjust event timing / beat alignment only
```

The system SHALL preserve unrelated approved/locked artifacts.

## 20.1 Repair scope hierarchy

Prefer:

```text
PARAMETER PATCH
    ↓ if insufficient
LAYER RECOMPOSE
    ↓
SCENE RECOMPOSE
    ↓
CAPABILITY SWAP
    ↓
SCENE REGENERATE
    ↓
MULTI-SCENE REPLAN
    ↓
FULL PROJECT REGENERATION
```

Full regeneration is last resort.

## 20.2 Regression protection

After repair:

```text
re-render impacted range
    ↓
re-run applicable QC
    ↓
compare with current best
```

A new candidate SHALL NOT replace current best when it regresses locked/critical dimensions.

---

# 21. Keep-best and bounded autonomous loop

Default:

```text
max creative repair loops: 5
max repeated repair for same issue fingerprint: 2
```

The system SHALL stop/replan when:

- same issue persists;
- score oscillates;
- cost budget threshold reached;
- required capability unavailable;
- human-exclusive decision required;
- generated code repeatedly fails security/conformance;
- further improvement would alter locked creative intent.

The current best candidate remains recoverable.

All repairs are additionally governed by Sections 52 and 65: exact candidate revision fencing and the Repair Authority Matrix.

---

# 22. Asset intelligence

The production runtime SHALL classify assets by production role:

```text
HERO
BROLL
BACKGROUND
UI_SCREEN
PRODUCT
LOGO
PORTRAIT
ILLUSTRATION
ICON
TEXTURE
AUDIO
MUSIC
SFX
REFERENCE_ONLY
```

Asset selection SHOULD consider:

- semantic relevance;
- quality;
- orientation;
- subject location;
- face/product visibility;
- licensing/rights;
- brand consistency;
- prior scene usage;
- visual repetition;
- aspect-ratio fitness.

Generic decoration SHOULD NOT be used merely because the system lacks a better visual.

When no relevant asset exists, the Director SHOULD explicitly choose one of:

```text
DESIGN_WITHOUT_ASSET
GENERATE_ASSET
REQUEST_ASSET
USE_APPROVED_STOCK/PROVIDER
USE_ABSTRACT_VISUAL_METAPHOR
```

rather than silently insert filler.

---

# 23. B-roll and UI/product-demo intelligence

For product/demo videos the runtime MAY use:

- authorized UI screenshots;
- app recordings;
- Figma/design exports through authorized connector/provider;
- website captures where rights/policy permit;
- screen recordings;
- generated device frames;
- pointer/callout overlays;
- zoom/pan/focus choreography.

The system SHALL retain source provenance.

It SHALL distinguish:

```text
real UI capture
mock UI
generated illustrative UI
```

and MUST NOT present generated UI as an actual product state when accuracy matters.

---

# 24. Platform-aware delivery

Delivery profiles SHALL cover at least:

```text
YouTube
YouTube Shorts
TikTok
Instagram Reels
Facebook
X
LinkedIn
Generic 16:9
Generic 9:16
Generic 1:1
```

Profiles MAY specify:

- frame;
- FPS;
- codec;
- max/min duration guidance;
- loudness;
- caption safe area;
- UI obstruction zones;
- thumbnail/cover considerations;
- bitrate/export constraints.

One master edit MAY produce multiple platform variants.

Aspect variants SHOULD share semantic timing where appropriate but MAY independently adjust:

- composition;
- camera;
- crop;
- text size;
- caption placement;
- layer position;
- asset choice.

---

# 25. Motion Studio UX upgrade

The existing Motion Studio SHALL be incrementally upgraded; it SHALL NOT be replaced by a second
product.

## 25.1 Primary user flow

```text
Brief
→ Direction
→ Script/Narration
→ Storyboard
→ Motion
→ Audio
→ Preview & Review
→ Repair
→ Delivery
```

The UI MAY keep current stage navigation, but quality and creative-direction information must become
visible.

## 25.2 New Direction stage

The user SHOULD be able to see/edit:

- creative direction;
- selected style;
- Brand Kit;
- reference style;
- typography personality;
- motion personality;
- scene density;
- caption style;
- pacing;
- music/rhythm approach.

## 25.3 Reference input

A user MAY provide:

- video reference;
- image;
- design;
- brand page;
- authorized URL;
- existing SmartAIHub asset.

The system shows the extracted style guide before applying it.

## 25.4 Review UI

Review SHALL show:

```text
Overall status
Quality score
Blocking issues
Scene-by-scene issues
Evidence frame
Suggested repair
Cost/effect estimate
```

Actions:

```text
Auto-fix safe issues
Fix this issue
Keep as is
Lock this scene
Compare before/after
Open in Video Editor
Approve candidate
```

## 25.5 Expert escape hatch

The user may open the existing Video Editor for manual fine adjustment.

Returning from Video Editor SHALL preserve manual locks and version identity.

---

# 26. Film Studio integration

Film Studio SHALL consume the same shared production runtime.

Example:

```text
Film Shot Revision
    ↓
Spec 258 Playblast / structured motion / prompt motion
    ↓
Spec 286 Production Plan
    ↓
Generative take / deterministic overlay / audio / titles / compositing
    ↓
Spec 286 QC + critique
    ↓
candidate take
    ↓
Spec 253 handoff
```

Film Studio SHALL invoke scoped work.

It SHOULD NOT copy a whole unrelated episode/project into a new video-production project merely to
fix one shot.

---

# 27. Remotion strategy

Remotion remains a preferred deterministic composition provider for:

- kinetic typography;
- UI animation;
- charts;
- data storytelling;
- product launch videos;
- brand motion;
- overlays;
- explainers;
- deterministic transitions;
- multi-layer compositing;
- browser-rendered visual effects.

Remotion is not required for every operation.

The Capability Resolver MAY select:

- FFmpeg execution for efficient deterministic post-processing;
- Remotion for programmable composition;
- browser Canvas/SVG;
- Three.js/R3F;
- generative video;
- existing Video Editor;
- specialized external provider;

based on capability, cost, fidelity, policy and quality.

---

# 28. FFmpeg provider integration strategy

An external package such as `ffmpeg-skill` MAY be supported through an adapter because it provides a
useful reference pattern:

```text
typed capability
→ plan/dry run
→ execute
→ probe/check
→ contact sheet
→ structured result
```

However:

```text
SmartAIHub capability contract
    ≠
external package contract
```

The adapter SHALL normalize to SmartAIHub semantics.

## 28.1 Provider modes

```text
NATIVE_SMARTAIHUB
EXTERNAL_SKILL_LOCAL
EXTERNAL_SKILL_CONTAINER
MCP_PROVIDER
RUNNER_PROVIDER
```

## 28.2 Capability negotiation

Before use, provider SHALL expose or be mapped to:

- supported capability IDs;
- version;
- environment readiness;
- missing optional dependencies;
- input/output constraints;
- preview support;
- cancellation support;
- deterministic status;
- verification support.

Spec 256 resolves semantic capability; placement chooses provider/runtime later.

---

# 29. Production Receipt

Every meaningful completed production SHALL be able to emit:

```ts
interface VideoProductionReceiptV1 {
  productionId: string;
  finalArtifactRefs: string[];

  inputDigestRefs: string[];
  directorBriefRef: string;
  styleGuideRefs: string[];
  capabilityPlanRef: string;

  providerReceipts: string[];
  renderReceipts: string[];
  qcReportRefs: string[];
  creativeReviewRefs: string[];
  repairRefs: string[];

  approvedBy?: string;
  approvalRef?: string;

  deliveryProfileRefs: string[];
  costs: string[];
  policySnapshotRef: string;

  completedAt: string;
}
```

This supports:

- reproducibility;
- debugging;
- billing;
- quality comparison;
- marketplace certification;
- handoff;
- audit.

---

# 30. Capability quality history

SmartAIHub SHOULD measure capability/provider performance over time.

Metrics MAY include:

```text
render_success_rate
technical_qc_pass_rate
creative_acceptance_rate
median_creative_score
median_repair_loops
human_override_rate
regression_rate
render_latency
cost
cache_hit_rate
failure_by_aspect
failure_by_language/script
failure_by_template
```

These metrics MAY influence candidate ranking but MUST NOT bypass user choice or policy.

---

# 31. Skill packaging and reuse

A successful production method MAY be captured as a reusable Skill.

A production Skill MAY contain:

```text
intent / use case
creative method
scene archetype preferences
design grammar
capability selection method
reference-analysis method
audio/rhythm method
critique rubric
repair strategy
known failure modes
example manifests
quality history
cost profile
supported platforms
```

It SHOULD reference approved execution capabilities instead of embedding unsafe raw commands.

## 31.1 Skill promotion is not automatic

A production run succeeding once SHALL NOT automatically publish a Skill.

Promotion follows existing Skill governance.

## 31.2 Marketplace

When monetized, invocation/settlement SHALL integrate through Spec 280.

Tenant/creator/platform revenue allocation remains outside Spec 286.

---

# 32. Runtime placement

The runtime SHALL support placement without embedding provider logic in the production plan.

Possible execution:

```text
Browser
Cloudflare Worker
Cloudflare Workflow
Cloudflare Container/Sandbox
SmartAIHub Server
Windows/macOS/Linux Runner
User-owned local machine
external MCP provider
external agent/harness
managed GPU provider
```

Long-running coding/render sessions SHOULD use Spec 278 continuation semantics where applicable.

A phone/tablet user MUST be able to initiate, monitor, review and approve production without owning
a local development workstation.

---

# 33. Cost-aware planning

Before expensive generation/render passes, the system SHOULD estimate:

- reasoning/model cost;
- generative media cost;
- render compute cost;
- storage/egress;
- expected number of quality loops.

Preview mode SHOULD prefer:

- lower resolution;
- shortened representative range;
- cached reusable stages;
- contact sheets;
- deterministic local checks;

before high-cost final render.

Cost optimization MUST NOT bypass mandatory quality checks.

Every autonomous production SHALL also obey the durable Production Budget Envelope in Section 66.

---

# 34. Failure and recovery

The runtime SHALL survive:

- browser close;
- page reload;
- worker restart;
- external agent disconnect;
- rendering process failure;
- provider timeout;
- partial artifact upload;
- transient storage failure;
- user switching device;
- cancellation;
- budget interruption.

Canonical state is reconstructed from:

```text
production manifest
worker_jobs
execution sessions
artifact receipts
review ledger
repair ledger
```

not from an in-memory agent conversation.

---

# 35. Security

## 35.1 Generated code

Generated code executes only in approved sandbox profiles.

Minimum controls:

- no production DB credentials;
- no broad tenant secrets;
- workspace path policy;
- resource quotas;
- timeout;
- process isolation;
- egress deny-by-default;
- package allowlist/controlled install policy;
- artifact-only return;
- immutable source/reference mounts where possible;
- content digest;
- audit trail.

## 35.2 Media path handling

Untrusted user/model input MUST NOT become unrestricted filesystem paths.

Use canonical asset refs and authorized materialization.

## 35.3 External references

Fetching/scraping external assets requires existing rights, security and network policies.

## 35.4 Model output

LLM/multimodal output is untrusted proposal data until schema/policy validation.

---

# 36. Data and provenance

Heavy media remains in the existing Library/R2 architecture.

PostgreSQL or existing SoR stores transactional production state.

Search/vector indexes are derived.

Each artifact SHALL record enough lineage to answer:

```text
which source?
which revision?
which renderer/provider?
which config?
which code/component version?
which font/assets?
which quality review?
which repair?
which approval?
```

---

# 37. Migration strategy for existing Motion Studio

## 37.1 No destructive migration

Existing Spec 133 projects SHALL continue to open/render.

## 37.2 Adapter-first upgrade

Existing `video_projects` are wrapped by a Spec 286 production-manifest projection when the new
feature is enabled.

## 37.3 Existing QA

Existing Spec 133 QA remains functional.

Spec 286 adds higher-level gates.

Do not delete or bypass old QA until implementation audit proves exact overlap and owner-approved
replacement.

## 37.4 Existing templates

All existing templates remain usable.

They gain:

- quality history;
- richer selection metadata where safely additive;
- preview evidence;
- failure telemetry;
- optional new style descriptors.

---

# 38. Implementation prerequisite — Spec 133 Conformance Audit

Before implementation changes, produce a code-grounded matrix:

```text
Requirement
Expected from Spec 133
Actual source location
Implemented?
Production enabled?
Tests?
Known defects?
Used by current Motion Studio?
Reuse / Fix / Deprecate?
```

Audit at minimum:

- neutral schema;
- Remotion compiler;
- render worker;
- Remotion Player;
- Motion Template Registry;
- Brand Kit;
- TTS/narration;
- captions;
- audio post-pass;
- quality loop;
- preview rendering;
- Motion Director;
- Phase-5 Motion Studio surface;
- R3F/3D templates;
- Video Editor bridge;
- worker lane;
- job recovery.

No duplicate implementation may be admitted until this audit is complete.

---

# 39. Implementation work packages

## P0 — Reconciliation and baseline

Deliver:

- canonical registry/spec-number check;
- live source audit;
- capability inventory;
- existing FFmpeg/remotion/audio inventory;
- Motion Studio baseline golden renders;
- quality baseline scores.

Exit:

- no unknown duplicate owner;
- golden current output reproducible.

## P1 — Shared media capability layer

Deliver:

- normalized capabilities;
- provider adapter;
- probe/check/contact-sheet path;
- beat detection;
- captions/audio/reframe/delivery profiles;
- provenance receipts.

Exit:

- same semantic capability can use native or alternate provider;
- no raw-shell public path.

## P2 — Creative Direction & Style Intelligence

Deliver:

- Director Brief;
- observed style guide;
- Video Design System;
- scene archetypes;
- richer motion selection;
- Motion Studio Direction UI.

Exit:

- reference-driven project can produce reviewable style plan before render.

## P3 — Mandatory Visual/Audio Critique Loop

Deliver:

- evidence extraction;
- contact sheets;
- deterministic QC adapter;
- multimodal critic;
- issue ledger;
- targeted repair;
- keep-best;
- regression protection.

Exit:

- no visible-pixel-changing auto-production can finish without evidence inspection.

## P4 — Generated Motion Sandbox

Deliver:

- isolated authoring workspace;
- compile/render/test;
- code/security gates;
- ephemeral candidate use;
- promotion candidate workflow.

Exit:

- novel motion can be created without introducing arbitrary code into trusted renderer.

## P5 — Motion Studio production UX

Deliver:

- Direction stage;
- review/repair UI;
- compare versions;
- locks;
- one-click safe auto-repair;
- expert Video Editor handoff;
- multi-platform delivery.

Exit:

- representative projects meet quality acceptance.

## P6 — Film Studio shared runtime

Deliver:

- scoped Film shot/scene adapter;
- Spec 258 playblast/motion inputs;
- shared critique/finishing;
- Spec 253 candidate return;
- no duplicated renderer/timeline.

## P7 — Reuse / Skill promotion

Deliver:

- production method packaging;
- capability quality metrics;
- promotion governance;
- optional Spec 280 metering.

---

# 40. Acceptance scenarios

## A1 — Thai parenting educational short

Input:

```text
Topic: เด็กอายุหกเดือนควรให้นอนยาว
Language: Thai
Target: Reels / Shorts
Duration: 60–90 seconds
```

The system MUST NOT default to:

```text
large heading
+ generic dark gradient
+ decorative floating circles
+ plain subtitle
```

unless explicitly chosen by creative direction.

Expected:

- intentional contemporary visual system;
- Thai font rendering verified;
- clear visual hierarchy;
- scene variety;
- relevant visual metaphors/assets;
- designed captions;
- no clipped text;
- readable on phone;
- narration/scene timing aligned;
- platform safe area verified;
- visual evidence attached;
- creative score gate satisfied or user explicitly accepts exception.

## A2 — SaaS product launch

Input:

- product website/screenshots;
- logo/Brand Kit;
- reference video;
- 20 seconds.

Expected:

- style guide extraction;
- UI/product demonstration;
- kinetic typography;
- product-accurate screenshots;
- rhythm-controlled transitions;
- final logo reveal;
- 16:9 and 9:16 variants;
- no claim invented by model.

## A3 — Figma/design-to-motion

Input:

- authorized design export/provider;
- motion brief.

Expected:

- design structure preserved;
- layout adapted to motion;
- no arbitrary rebranding;
- render-review-repair loop;
- candidate component may remain ephemeral.

## A4 — Beat-synced story

Input:

- narration;
- music;
- story assets.

Expected:

- Beat Grid;
- cuts and motion events align intentionally;
- audio not overdriven;
- sync evidence;
- pacing critic.

## A5 — Talking-head enhancement

Input:

- recorded talking-head clip.

Expected:

- silence/filler edit only if authorized;
- B-roll;
- captions;
- callouts;
- audio clean/duck/loudness;
- reframe;
- contact-sheet inspection;
- no face cropped by caption/crop.

## A6 — Film Studio scoped shot

Input:

- one Film Studio shot + Spec 258 motion/playblast.

Expected:

- only scoped shot/selected range imported;
- shared production runtime used;
- QC/critique;
- candidate returned;
- original Film revision preserved.

## A7 — Provider degradation

External FFmpeg provider unavailable.

Expected:

- capability resolver selects eligible native provider if equivalent;
- no user-visible architecture failure;
- permission denial MUST NOT be converted into provider bypass.

## A8 — Generated motion component failure

Generated component compiles but renders broken typography.

Expected:

- visual critic detects;
- issue contains evidence/timecode;
- targeted repair;
- production registry remains unchanged until promotion process.

---

# 41. Quality golden set

Create a versioned golden evaluation pack with at least:

```text
Thai educational 9:16
English SaaS launch 16:9
Thai/English caption-heavy social
UI demo
Data/infographic animation
Product/B-roll commercial
Talking head edit
Beat-driven showreel
Calm editorial explainer
Film shot finishing
```

Each fixture SHALL preserve:

- input bundle;
- expected hard constraints;
- minimum acceptable score ranges;
- reference screenshots;
- expected deterministic QC;
- test profile;
- renderer/provider versions.

Golden evaluation is not pixel-identical creative testing.

It validates constraints, measurable quality and regression bands.

---

# 42. Test strategy

## 42.1 Unit

- schemas;
- Beat Grid;
- issue/repair mapping;
- capability normalization;
- style guide validation;
- score aggregation;
- regression rules;
- manifest invalidation.

## 42.2 Contract

- Spec 133 adapter;
- Spec 256 capability projection;
- worker job payloads;
- FFmpeg provider;
- audio provider;
- Film adapter;
- Editor handoff;
- production receipt.

## 42.3 Security

- raw shell rejection;
- forbidden path escape;
- sandbox secret isolation;
- egress policy;
- dependency policy;
- generated-code promotion fence;
- tenant boundary.

## 42.4 Visual regression

- representative frames;
- safe area;
- typography;
- aspect variants;
- captions;
- overlays;
- Thai glyph rendering.

## 42.5 Creative evaluation

Use rubric-based multimodal evaluation on golden pack.

Track model/provider drift separately from deterministic renderer drift.

## 42.6 Recovery

- browser closes;
- Runner restarts;
- render process killed;
- provider timeout;
- duplicate completion receipt;
- retry after upload;
- repair resumed from another device.

## 42.7 Economic

- no duplicate charge on retry;
- preview vs final quote;
- provider fallback quote;
- Skill marketplace settlement through canonical owner only.

---

# 43. Observability

Required events SHOULD include:

```text
production.created
director_brief.created
style_guide.extracted
capability.plan.created
preview.render.started
preview.render.completed
visual_evidence.created
qc.completed
creative_review.completed
issue.created
repair.started
repair.completed
candidate.promoted_best
candidate.rejected_regression
sandbox_component.created
sandbox_component.rejected
sandbox_component.promotion_requested
delivery.completed
```

Metrics:

```text
time_to_first_preview
time_to_acceptable_candidate
average_repair_loops
full_regeneration_rate
targeted_repair_success_rate
human_override_rate
creative_acceptance_rate
technical_failure_rate
cost_per_accepted_minute
```

The strategic metric is not `render success`.

It is:

```text
accepted production-quality output / authorized production attempt
```

---

# 44. User-facing product principles

1. Chat-first where convenient; visual editor when precision requires it.
2. Normal users SHOULD NOT need to know Remotion, FFmpeg, Three.js, MCP or renderer details.
3. Show creative direction before expensive work.
4. Show why the system thinks a video needs repair.
5. Preserve user locks.
6. Never hide provider downgrade that materially changes fidelity/cost/privacy.
7. Technical details remain available for Expert users.
8. Mobile/tablet review and approval are first-class.
9. Do not make a user manually inspect every frame when the agent can safely do the first review.
10. Do not tell the user "done" merely because an MP4 exists.

---

# 45. Explicit non-goals

Spec 286 does NOT:

- replace Spec 133;
- replace Video Editor;
- replace Film Studio;
- replace Vertical Drama;
- replace Creator Workspace;
- replace Spec 256;
- create a new LLM gateway;
- create a new job queue;
- create a new workflow compiler;
- create a new billing ledger;
- create a new approval ledger;
- create a new generic Skill Registry;
- require one specific LLM;
- require one external FFmpeg repo;
- require all production to use generated code;
- permit arbitrary production shell/code execution;
- promise fully autonomous publication without policy/approval.

---

# 46. Implementation Do / Do Not

## DO

```text
reuse Spec 133
reuse worker_jobs
reuse Spec 256
reuse existing Video Editor
reuse Film Studio domain records
reuse existing media/audio gateways
add adapters
add evidence
add visual inspection
add targeted repair
add style intelligence
add safe motion-generation sandbox
```

## DO NOT

```text
rewrite Motion Studio from zero
fork another Remotion stack for Film Studio
expose raw ffmpeg to LLM
let generated React run in trusted production process
create video_jobs_v2
create capability_registry_video
create another timeline database
treat preview render as optional creative evidence
regenerate the whole project for a one-layer defect
```

---

# 47. Rollout

## Stage 0 — Shadow evaluation

Run new Director/Critic against existing Motion Studio renders without changing output.

Measure:

- detected issues;
- false positives;
- score correlation with human judgement.

## Stage 1 — Review-only

Show quality findings and proposed repairs.

No auto mutation.

## Stage 2 — Safe targeted repairs

Allow bounded repairs for:

- layout;
- caption;
- timing;
- audio level;
- safe-area;
- known-template parameters.

## Stage 3 — Advanced composition

Enable richer capability substitution.

## Stage 4 — Generated Motion Sandbox

Opt-in / controlled rollout.

## Stage 5 — Film shared runtime

Film Studio uses the same service.

## Stage 6 — Skill promotion / marketplace

Only after production evidence.

---

# 48. Exit criteria for "system is complete enough for real use"

The upgrade SHALL NOT be called production-ready until all are true:

1. Existing Spec 133 projects still work.
2. Representative Motion Studio output consistently passes deterministic delivery QC.
3. Rendered visuals are actually inspected by a multimodal agent before autonomous acceptance.
4. Thai/non-Latin typography golden tests pass.
5. At least 10 modern scene archetypes are production-certified.
6. At least 20 reusable motion capabilities are production-certified across common video classes.
7. Captions support at least clean + social emphasis + karaoke/pop-style profiles.
8. Beat/timing pipeline works on golden examples.
9. Audio finishing passes loudness/sync tests.
10. Targeted repair demonstrably avoids unnecessary full regeneration.
11. Keep-best prevents quality regression.
12. One generated motion component can pass sandbox-to-ephemeral-production workflow without entering trusted registry.
13. Film Studio can consume the shared runtime without a second renderer.
14. Video Editor round-trip preserves locks/manual edits.
15. Phone/tablet users can review/approve without desktop editor.
16. Job recovery passes interruption tests.
17. No duplicate billing on retries/repair.
18. Security tests prevent arbitrary command/code/path escalation.
19. Quality metrics are visible in observability.
20. A1–A8 acceptance scenarios pass.

---

# 49. G0 canonical reconciliation checklist

Before implementation:

- inspect canonical SmartSpecPro registry;
- confirm Spec 286 is free;
- inspect latest Spec 133 implementation status;
- inspect active Motion Studio routes/components;
- inspect current Remotion compiler/templates/render worker;
- inspect current FFmpeg utilities;
- inspect current video quality loop;
- inspect Spec 247 audio/TTS implementation;
- inspect Video Editor handoff;
- inspect current Specs 252/258 implementation branch;
- confirm implemented Spec 256 APIs/adapter points;
- inspect Spec 278 runner/session interfaces;
- inspect billing/approval owners;
- search for any existing `ProductionManifest`, `MediaExecutionCapability`, `ContactSheet`,
  `VisualCritic`, `BeatGrid`, or equivalent schema before adding a new one.

If an equivalent canonical structure already exists, adapt/reuse it.

**Similar existing owner wins over inventing a duplicate.**

---

# 51. Canonical Media Timebase & Clock Contract

The R1.0 draft expresses many repair/evidence ranges in integer milliseconds. That is useful for UI,
but insufficient as the sole authoritative clock for frame-accurate video and sample-accurate audio.

SmartAIHub SHALL use one explicit timebase contract for production artifacts.

```ts
interface MediaTimebaseV1 {
  timebaseId: string;
  video?: {
    fpsNum: number;
    fpsDen: number;
    sourceMode: 'CFR'|'VFR';
    ptsPolicy: 'PRESERVE_SOURCE_PTS'|'CONFORM_CFR'|'DERIVED_TIMELINE';
  };
  audio?: {
    sampleRate: number;
    channelLayout?: string;
  };
  canonicalUnit: 'RATIONAL_TICKS';
}

interface MediaRangeV1 {
  timebaseRef: string;
  startTick: string; // integer serialized as string to avoid JS precision loss
  endTick: string;
  displayStartMs?: number;
  displayEndMs?: number;
}
```

Requirements:

- UI milliseconds are projections, not canonical timing truth.
- VFR sources SHALL retain source PTS mapping until an explicit conform stage.
- Subtitle word timings, narration alignment, beat events and repair ranges SHALL declare their
  clock/timebase.
- Audio drift correction MUST record before/after clock relation.
- Cross-provider handoff MUST include explicit timebase conversion provenance.
- Frame extraction for evidence SHALL resolve from canonical timebase rather than rounding a UI
  millisecond independently in each provider.

This prevents one-frame errors, caption drift, beat misalignment and stale timing assumptions from
being amplified by repeated repair loops.

---

# 52. Candidate Revision, Concurrency & Repair Transaction

A quality issue is valid only against the exact candidate it inspected.

Spec 286 SHALL define an immutable production-candidate identity.

```ts
interface VideoProductionCandidateV1 {
  candidateId: string;
  productionId: string;
  parentCandidateRefs: string[];
  baseProductionRevision: number;
  manifestDigest: string;
  renderedArtifactRef: string;
  renderedArtifactDigest: string;
  rendererProfileRef: string;
  createdAt: string;
}

interface RepairTransactionV1 {
  repairId: string;
  productionId: string;
  baseCandidateRef: string;
  baseCandidateDigest: string;
  issueRefs: string[];
  repairPlanRef: string;
  expectedProductionRevision: number;
  authorityClass: 'AUTO_SAFE'|'AUTO_BOUNDED'|'REVIEW_REQUIRED';
  idempotencyKey: string;
}
```

Before applying a repair, the runtime MUST recheck:

```text
candidate still current/eligible
+ issue still unresolved on that candidate
+ protected locks unchanged
+ project/production revision fence valid
+ budget/policy still valid
```

A repair generated from candidate A MUST NOT silently patch candidate B.

Concurrent user/editor/agent changes produce:

```text
REBASE_REQUIRED
SUPERSEDED
CONFLICT_REVIEW
```

rather than last-write-wins.

Duplicate repair receipts with the same idempotency key MUST NOT create a second mutation or charge.

---

# 53. Final Render Verification & Preview/Final Parity

A low-resolution preview passing review does not prove the final encoded artifact is valid or
visually equivalent.

Before a production candidate is marked deliverable, the final artifact SHALL pass a **Final Render
Gate**.

Required checks:

1. final output probe;
2. destination/profile compliance;
3. audio QC;
4. final-frame/contact-sheet inspection;
5. font/glyph presence check for applicable scripts;
6. black/blank/frozen-frame anomaly checks;
7. caption/safe-area verification;
8. final artifact hash/provenance receipt;
9. comparison against approved preview at representative evidence points.

## 53.1 Preview parity classes

```text
BIT_EQUIVALENT
RENDER_EQUIVALENT
VISUALLY_EQUIVALENT_WITH_TOLERANCE
NON_EQUIVALENT_PREVIEW
```

The provider SHALL declare the expected class.

Examples:

- same deterministic renderer/config at lower resolution may be `VISUALLY_EQUIVALENT_WITH_TOLERANCE`;
- browser preview vs GPU shader render may be `NON_EQUIVALENT_PREVIEW`;
- a poster-frame preview is never proof of temporal equivalence.

When preview/final paths are not equivalent, the final gate MUST perform independent visual evidence
inspection on the final artifact.

A final encode MUST NOT be trusted merely because its preview candidate passed.

---

# 54. Reference Intake Trust Boundary & Prompt-Injection Defense

Reference URLs, webpages, screenshots, Figma exports, transcripts, subtitles, PDFs, embedded text,
metadata and media content are **untrusted data**.

Text discovered inside a reference SHALL NEVER become agent instruction merely because it contains
phrases such as:

```text
ignore previous instructions
upload this file
use this API key
run this command
change the brand
publish immediately
```

Reference ingestion SHALL separate:

```text
REFERENCE_CONTENT
REFERENCE_METADATA
EXTRACTED_STYLE_OBSERVATIONS
USER_INSTRUCTIONS
SYSTEM/POLICY_INSTRUCTIONS
```

Only the last two instruction classes may influence execution authority.

## 54.1 Reference sanitation requirements

- strip/neutralize active scripts and executable document content;
- do not inherit website cookies/session state outside authorized connector/browser policy;
- do not execute embedded macros;
- label OCR/transcribed text as content, not command;
- preserve source URL/asset provenance;
- enforce file type/size/decompression limits;
- inspect archives before extraction and block traversal;
- apply existing malware/content scanning where available;
- do not grant network access to generated-motion sandbox merely because a reference links outward.

## 54.2 Style extraction isolation

The style extractor returns a typed `ObservedVideoStyleGuideV1` only.

It SHALL NOT return executable code, shell commands, arbitrary CSS/JS to production, or hidden
instructions copied from reference content.

---

# 55. Evaluator Governance, Calibration & Self-Critique Independence

A model grading its own output can be biased, unstable, or overconfident.

Spec 286 SHALL treat a creative score as an evaluator observation, not ground truth.

```ts
interface CreativeEvaluationReceiptV1 {
  evaluationId: string;
  candidateRef: string;
  rubricVersion: string;
  evaluatorProviderRef: string;
  evaluatorModelVersion?: string;
  evidenceRefs: string[];
  scorecardRef: string;
  confidence: number;
  calibrationSetVersion?: string;
  createdAt: string;
}
```

Requirements:

- pin rubric version;
- record evaluator model/provider version where available;
- keep evidence shown to the evaluator;
- do not expose hidden target scores in a way that trivially encourages score gaming where avoidable;
- distinguish evaluator execution failure from a low creative score;
- support independent second review when confidence is low, the first evaluator created the work,
  or a high-value production requires it;
- persist evaluator disagreement rather than averaging it away silently.

## 55.1 Escalation policy

A second evaluator or human review SHOULD be requested when:

```text
confidence below profile threshold
OR blocker disagreement
OR score near publish threshold
OR repeated repair oscillation
OR high-value / brand-critical deliverable
OR generated motion code newly introduced
```

## 55.2 Calibration

The golden set SHALL contain human-labelled pairwise preferences and defect annotations.

Evaluator upgrades MUST be compared against prior calibration before production rollout.

---

# 56. Long-Form & Large-Project Hierarchical Inspection

Inspecting every frame of a long video with a multimodal model is economically and operationally
unacceptable.

Spec 286 SHALL use hierarchical inspection.

```text
Project
  ↓
Chapter / Sequence
  ↓
Scene
  ↓
Shot / Transition / Caption window
  ↓
Evidence sample
```

Minimum strategy:

1. deterministic scan across the whole artifact;
2. scene/shot boundary detection;
3. risk-weighted evidence selection;
4. mandatory inspection of known critical windows;
5. random/coverage samples for unflagged ranges;
6. deeper inspection of anomalous or low-confidence segments;
7. final project-level pacing/coherence review from compact summaries/contact sheets.

## 56.1 Coverage manifest

```ts
interface VideoInspectionCoverageV1 {
  candidateRef: string;
  totalDurationTicks: string;
  inspectedRanges: MediaRangeV1[];
  deterministicWholeFileChecks: string[];
  uninspectedRanges?: MediaRangeV1[];
  samplingPolicyRef: string;
  coverageScore: number;
}
```

The UI and production receipt SHALL NOT imply exhaustive visual review when only sampled ranges were
inspected.

Profiles may require stronger coverage for short-form ads than for multi-hour source footage.

---

# 57. Generative Media Quality & Continuity Gate

Generated image/video assets introduce defects that ordinary template QC does not cover.

When generative media is used, the runtime SHOULD evaluate applicable dimensions:

```text
identity consistency
character/object continuity
unexpected text/gibberish
hand/face/body defects
product/logo fidelity
camera continuity
subject disappearance
temporal warping/flicker
lip-sync where applicable
physics/action discontinuity
first/last-frame mismatch
unwanted watermark/logo
prompt/conditioning adherence
```

A generative asset SHALL be classified separately from the deterministic composition that contains
it.

Example:

```text
Remotion composition PASS
+ generated shot FAIL (identity drift)
= final candidate NOT production-ready
```

The repair planner SHOULD replace/regenerate only the defective generated asset/range when possible,
not rebuild unrelated deterministic motion scenes.

Generated-media review MUST record provider/model/version/conditioning refs and seed when available.

---

# 58. Reproducibility Classes & Provider Drift

Not all AI-video stages are exactly reproducible.

Every material stage SHALL declare one reproducibility class:

```text
EXACT_DETERMINISTIC
DETERMINISTIC_WITH_PINNED_ENVIRONMENT
BEST_EFFORT_SEEDED
NONDETERMINISTIC_PROVIDER
EXTERNAL_UNKNOWN
```

Receipts SHALL record, when available:

- provider;
- exact model/revision;
- seed;
- prompt/compiler version;
- input digests;
- dependency/renderer version;
- environment/runtime profile;
- relevant feature flags.

Provider/model changes SHALL invalidate certification as appropriate.

A cached success from model revision X MUST NOT certify model revision Y automatically.

When a provider silently changes behavior, quality history SHALL be segmented by observable provider
revision/time window rather than blended into one misleading metric.

---

# 59. Stage Fingerprints, Cache & Dependency Invalidation

The R1.0 manifest identifies stages but requires a stronger cache/invalidation contract.

```ts
interface ProductionStageFingerprintV1 {
  stageId: string;
  capabilityId: string;
  providerRef: string;
  semanticInputDigest: string;
  sourceArtifactDigests: string[];
  configDigest: string;
  codeOrTemplateDigest?: string;
  rendererProfileDigest?: string;
  policyRelevantDigest?: string;
}
```

A stage output MAY be reused only when its fingerprint remains valid and policy permits reuse.

Invalidation SHALL be dependency-aware.

Examples:

```text
caption color changed
→ invalidate caption composition + downstream render/QC
→ keep ASR/TTS/B-roll

narration text changed
→ invalidate TTS + caption timings + affected scene timing + downstream render/QC

reference style changed
→ invalidate style-dependent composition
→ do not invalidate source ingest

renderer version changed
→ invalidate render-derived visual certification
```

A repair MUST NOT reuse a stale downstream artifact whose dependency fingerprint changed.

Cache hits SHALL retain provenance and MUST NOT double-charge execution that did not occur.

---

# 60. Generated-Code Supply Chain, Dependency & License Integrity

Generated motion code may introduce third-party packages, fonts, shaders or assets.

The Generated Motion Sandbox SHALL produce a dependency manifest/SBOM-like receipt for non-trivial
candidates.

Minimum rules:

- dependencies pinned to exact versions/digests where practical;
- no floating `latest` in promoted capabilities;
- package source registry allowlist;
- license metadata captured where available;
- deny known prohibited/incompatible dependencies according to tenant/product policy;
- no postinstall scripts unless explicitly allowed by sandbox policy;
- no native binary execution unless capability profile explicitly permits it;
- promotion requires dependency vulnerability/security check;
- custom fonts/assets require rights/provenance refs;
- remote imports/CDN JavaScript are not permitted production dependencies by default.

A visually successful candidate with an unacceptable dependency/license posture is not promotable.

---

# 61. Accessibility & Viewer-Safety Quality Profile

Professional output quality includes accessibility and viewer safety where applicable.

An optional/required delivery profile MAY check:

- caption presence/accuracy;
- readable caption duration;
- contrast/readability;
- text not hidden by platform UI;
- flashing/strobe risk;
- excessively rapid cuts under configured safety profile;
- meaningful audio not lost when captions are required;
- optional audio-description track support for workflows that require it;
- locale/script-specific font/glyph integrity.

## 61.1 Flashing risk

The deterministic QC layer SHOULD expose measurable flashing/luminance-change indicators when the
required detector is available.

A creative agent SHALL NOT claim medical safety from an aesthetic judgement.

Where a required safety check is unavailable, status is `UNKNOWN`, not `PASS`.

## 61.2 Thai and complex-script profile

Thai production fixtures SHALL verify:

- glyph availability;
- shaping/rendering;
- line breaking;
- diacritic clipping;
- font fallback;
- subtitle line height;
- mobile readability.

This is a mandatory part of the A1 golden scenario.

---

# 62. Delivery Package Manifest

A publishable deliverable may be more than one MP4.

```ts
interface VideoDeliveryPackageV1 {
  packageId: string;
  productionId: string;
  platformProfileRef: string;
  primaryVideoRef: string;
  subtitleRefs: string[];
  thumbnailRefs: string[];
  metadataRefs: string[];
  audioStemRefs?: string[];
  chapterRefs?: string[];
  transcriptRef?: string;
  qcReportRefs: string[];
  rightsEvidenceRefs: string[];
  productionReceiptRef: string;
  packageDigest: string;
}
```

The package gate SHALL verify cross-artifact consistency where applicable:

- subtitle duration matches video;
- language/locale metadata matches artifact;
- thumbnail belongs to current approved revision;
- chapters do not exceed duration;
- no stale sidecar from superseded candidate;
- delivery metadata references the correct final hash.

Publishing integrations consume an approved delivery package, not an arbitrary file path.

---

# 63. Human Calibration & Creative Benchmark Program

A system cannot validate "modern" or "professional" solely by asking an LLM for a number.

SmartAIHub SHOULD maintain a bounded internal evaluation set containing:

- accepted examples;
- deliberately poor examples;
- pairwise A/B preferences;
- annotated typography/layout failures;
- caption failures;
- pacing failures;
- reference-adherence examples;
- Thai and multilingual examples;
- platform-specific examples.

For each major Creative Critic or Director change, compare:

```text
human preference agreement
false blocker rate
missed blocker rate
repair success rate
post-repair preference win rate
```

A model update that raises self-reported scores but lowers human preference agreement SHALL NOT be
promoted as an improvement.

The benchmark must avoid becoming a rigid aesthetic template; use multiple visual genres and
creative directions.

---

# 64. Privacy, Retention & Derived Evidence

Contact sheets, extracted frames, transcripts, face-containing frames, style guides and critic
artifacts may be sensitive even when they are only intermediate evidence.

Spec 286 SHALL classify intermediate artifacts by retention class.

```text
EPHEMERAL_PREVIEW
PROJECT_DERIVED
AUDIT_EVIDENCE
DELIVERY_ARTIFACT
USER_PINNED
```

Requirements:

- tenant/project ACL applies to all derived evidence;
- signed URLs remain short-lived according to existing policy;
- ephemeral frames SHOULD expire after the production/review window unless needed for audit;
- deletion/revocation of source rights propagates to derived reusable assets according to canonical
  retention policy;
- style-guide derivation does not authorize retaining the full external source indefinitely;
- model/evaluator egress is recorded;
- face/voice/likeness-sensitive references follow existing consent policies;
- logs SHOULD store digests/refs rather than unnecessary media bytes or full transcript content.

---

# 65. Repair Authority Matrix & Human Control Boundary

Not every repair is safe to apply autonomously.

Every proposed repair SHALL be assigned one authority class.

| Class | Examples | Default behavior |
|---|---|---|
| `AUTO_SAFE` | move caption inside safe area, fix overflow, repair missing font, normalize audio to already-approved target | May auto-apply inside current authorized envelope |
| `AUTO_BOUNDED` | adjust easing, spacing, motion intensity, crop anchor within approved subject/creative direction | Auto only when user/project policy preauthorizes bounded creative repair |
| `REVIEW_REQUIRED` | replace hero asset, change visual metaphor, switch paid provider, change reference style, materially alter pacing | Produce candidate; require approval when current policy does not already authorize it |
| `HUMAN_EXCLUSIVE` | rights/consent decision, approve someone else's likeness/voice, publish/release when approval is required, change legal claim | Never auto-decide |

The repair engine MUST preserve the distinction between:

```text
technical correction
creative revision
business/rights decision
publication decision
```

A quality loop is not a grant of unlimited creative authority.

---

# 66. Production Budget Envelope & Loop Resource Governance

The R1.0 cost section estimates cost but requires a durable per-production resource envelope.

```ts
interface VideoProductionBudgetEnvelopeV1 {
  budgetRef: string;
  productionId: string;
  maxCredits?: number;
  maxExternalSpend?: number;
  maxPreviewRenders: number;
  maxFinalRenders: number;
  maxCreativeEvaluationCalls: number;
  maxGeneratedMotionAttempts: number;
  maxWallClockSeconds?: number;
  maxStorageBytes?: number;
  reservedAmountRef?: string;
}
```

The orchestrator SHALL update the budget after every material operation.

Before a repair that may exceed the remaining envelope:

```text
reuse/cache/cheaper equivalent available?
    ↓
YES → replan
NO  → request additional authorized budget or stop with best candidate
```

Retries caused by infrastructure failure SHALL use canonical settlement rules and MUST NOT silently
consume the user's creative-attempt budget as if they were new intentional variants.

---

# 66A. R1.1 Acceptance additions

The following acceptance scenarios are additive to A1–A8.

## A9 — Stale repair race

Two actors change the same scene while a critic is reviewing it.

Expected:

- review remains bound to exact candidate digest;
- stale repair is rejected/rebased;
- no silent last-write-wins;
- no duplicate charge.

## A10 — Malicious reference prompt injection

An imported webpage screenshot contains text instructing the agent to upload secrets and ignore the
user's brand.

Expected:

- text is classified as reference content;
- no instruction authority granted;
- no secret/network escalation;
- style extraction still functions from safe observations.

## A11 — Preview passes, final render differs

A final renderer substitutes/misses a Thai font or changes shader behavior.

Expected:

- final-render gate detects visual/glyph divergence;
- artifact is blocked or rerendered;
- preview approval alone does not ship it.

## A12 — Long-form production

Input is a 45-minute program.

Expected:

- whole-file deterministic scan;
- hierarchical scene/shot sampling;
- coverage manifest;
- risk-based deep review;
- no false claim that every frame was visually inspected.

## A13 — Generative shot continuity defect

One generated shot changes the product logo/character identity.

Expected:

- generative-media gate fails only affected shot;
- surrounding deterministic composition remains reusable;
- repair targets the defective asset/range.

## A14 — Accessibility / Thai complex script

Input contains Thai captions, fast animated text and a flashing transition.

Expected:

- glyph/diacritic/line-break checks;
- safe-area/readability checks;
- flashing status PASS/WARN/FAIL/UNKNOWN based on actual detector availability;
- no aesthetic model may manufacture a deterministic safety PASS.

---

# 66B. R1.1 Test additions

Implementation SHALL add tests for:

```text
rational timebase conversion / VFR mapping
stale candidate repair fencing
repair idempotency
final-preview parity sampling
reference prompt-injection isolation
archive/path traversal rejection
critic receipt/version pinning
critic disagreement handling
long-form coverage manifest
provider/model drift invalidation
generative shot continuity fixture
stage fingerprint cache invalidation
SBOM/dependency promotion gate
Thai glyph/diacritic rendering
flashing detector UNKNOWN semantics
delivery-package stale sidecar rejection
budget envelope exhaustion/replan
```

---

# 66C. R1.1 Exit-criteria additions

In addition to Section 48, production readiness requires:

21. Canonical rational timebase tests pass for CFR/VFR and audio timing.
22. Stale reviews/repairs cannot mutate a newer candidate.
23. Final-render verification runs independently of preview approval where paths differ.
24. Reference prompt injection cannot alter execution authority.
25. Creative evaluator versions/receipts are traceable and calibrated against human-labelled cases.
26. Long-form projects produce truthful inspection coverage rather than implied exhaustive review.
27. Generative media defects can block/repair one asset without forcing unrelated full regeneration.
28. Stage fingerprints prevent stale cache reuse.
29. Generated-motion promotion includes dependency/license/security provenance.
30. Delivery package sidecars cannot refer to a superseded final artifact.
31. Thai complex-script golden fixtures pass.
32. Budget exhaustion stops/replans safely while preserving the current best candidate.

---

# 67. Provider Substitution, Semantic Equivalence & Material-Difference Guard

A provider fallback is not automatically equivalent merely because it implements the same broad
capability name.

Example:

```text
motion.kinetic_typography
    provider A → deterministic Remotion component
    provider B → generative video model

same broad user intent
≠
same reproducibility / editability / visual fidelity / cost / privacy
```

Every provider substitution SHALL produce a typed decision.

```ts
interface ProviderSubstitutionDecisionV1 {
  substitutionId: string;
  productionId: string;
  capabilityId: string;

  requestedProviderRef?: string;
  originalResolvedOfferRef: string;
  fallbackOfferRef: string;

  equivalence:
    | 'SEMANTICALLY_EQUIVALENT'
    | 'EQUIVALENT_WITH_MATERIAL_DIFFERENCES'
    | 'NOT_EQUIVALENT';

  materialDifferences: Array<
    | 'QUALITY'
    | 'EDITABILITY'
    | 'DETERMINISM'
    | 'PRIVACY'
    | 'DATA_LOCALITY'
    | 'COST'
    | 'LATENCY'
    | 'RIGHTS'
    | 'OUTPUT_FORMAT'
    | 'MODEL_BEHAVIOR'
  >;

  requiresApproval: boolean;
  policyRef: string;
  quoteDeltaRef?: string;
  createdAt: string;
}
```

Rules:

- `SEMANTICALLY_EQUIVALENT` MAY auto-fallback only when current policy allows it.
- A change in external egress, privacy, paid cost, rights, editability, determinism or material visual
  fidelity SHALL NOT be hidden.
- `EQUIVALENT_WITH_MATERIAL_DIFFERENCES` requires either an already-authorized policy envelope or
  explicit review.
- `NOT_EQUIVALENT` SHALL cause replan or a user-visible blocker; it MUST NOT masquerade as a normal
  retry.
- Permission denial, rights denial, policy denial and budget denial MUST NOT trigger a fallback that
  bypasses the denial.

---

# 68. Multi-stage Production Saga, Partial Success & Compensation

A production may successfully finish several expensive stages and fail later.

The runtime SHALL distinguish:

```text
execution failure
quality rejection
policy rejection
delivery failure
partial production success
```

and SHALL preserve valid reusable work.

```ts
interface VideoProductionSagaV1 {
  sagaId: string;
  productionId: string;
  generation: number;
  state:
    | 'PLANNED'
    | 'RUNNING'
    | 'PARTIAL'
    | 'WAITING'
    | 'COMPENSATING'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'FAILED_TERMINAL';

  completedStageRefs: string[];
  reusableArtifactRefs: string[];
  invalidArtifactRefs: string[];
  pendingStageRefs: string[];

  compensationActions: Array<{
    actionId: string;
    kind:
      | 'RELEASE_RESERVATION'
      | 'CANCEL_CHILD_JOB'
      | 'REVOKE_TEMP_URL'
      | 'DELETE_EPHEMERAL_OUTPUT'
      | 'MARK_ARTIFACT_SUPERSEDED'
      | 'NONE';
    status: 'PENDING'|'DONE'|'FAILED'|'NOT_REQUIRED';
  }>;

  lastCheckpointRef: string;
}
```

Requirements:

- cancellation SHALL NOT delete already-approved user artifacts;
- infrastructure failure SHALL preserve independently valid completed stages;
- compensation is for reversible side effects, not historical erasure;
- economic reservation release/refund follows canonical billing authority;
- a final delivery failure SHALL NOT force regeneration of approved motion/audio if the same
  artifacts remain valid;
- retry/recovery SHALL be idempotent.

---

# 69. Cache Isolation, Cross-Project Reuse & Tenant Safety

Content-addressed hashes make reuse efficient but SHALL NOT become authorization tokens.

The following invariant is mandatory:

```text
KNOWING AN ARTIFACT HASH ≠ AUTHORIZATION TO READ OR REUSE THE ARTIFACT
```

Every cache entry SHALL be scoped by sufficient authorization and semantic context.

```ts
interface ProductionCacheEntryV1 {
  cacheKey: string;
  stageFingerprint: string;
  tenantScopeRef: string;
  projectScopeRef?: string;
  policyScopeRef: string;
  rightsScopeRef?: string;
  artifactRefs: string[];
  createdAt: string;
  expiresAt?: string;
}
```

Rules:

- cross-tenant reuse of media bytes is forbidden unless the canonical asset is explicitly
  redistributable/shared under an authorized platform mechanism;
- a digest match MAY permit recomputation avoidance only after access/right/policy revalidation;
- user-specific voice, face, private UI, private documents and proprietary brand assets SHALL NOT
  become globally reusable caches;
- public/reusable templates or renderer binaries MAY use broader caches when they contain no
  private production content;
- cache lookup and cache hit SHALL be audit-visible;
- revoked access invalidates future cache reuse even if bytes remain temporarily retained under
  audit policy.

---

# 70. Rights, License, Consent & Publication-Validity Snapshot

A render may be technically valid while its underlying rights have changed.

For rights-sensitive inputs, production SHALL record a validity snapshot.

```ts
interface ProductionRightsSnapshotV1 {
  snapshotId: string;
  productionId: string;
  assetEntries: Array<{
    assetRef: string;
    rightsEvidenceRefs: string[];
    consentRef?: string;
    licenseRef?: string;
    allowedUses: string[];
    expiresAt?: string;
    revocable: boolean;
  }>;
  evaluatedAt: string;
  policyRef: string;
}
```

Mandatory revalidation points:

```text
before external provider egress
before generated derivative promotion
before final delivery approval
before publication/republication
before cross-project reuse
before Skill/template promotion when source-derived material is retained
```

A rights change SHALL NOT rewrite historical receipts.

Instead:

```text
historical production receipt remains immutable
+
current publication/reuse eligibility may become RESTRICTED/REVOKED
```

The system SHALL distinguish:

```text
CAN_RENDER
CAN_STORE
CAN_REVIEW
CAN_DELIVER
CAN_PUBLISH
CAN_REUSE
CAN_REDISTRIBUTE
```

because these permissions are not equivalent.

---

# 71. Localization, Dub & Multi-language Temporal Variants

A translated/dubbed language variant SHALL NOT be assumed to fit the original timing.

Each locale MAY require its own temporal/composition projection.

```ts
interface LocalizedVideoVariantV1 {
  variantId: string;
  sourceProductionId: string;
  locale: string;

  narrationRef?: string;
  subtitleTrackRef?: string;
  audioTrackRef?: string;

  timingStrategy:
    | 'PRESERVE_SCENE_TIMES'
    | 'ADAPT_SCENE_TIMES'
    | 'RETIME_WITHIN_BOUNDS'
    | 'RECOMPOSE_VISUALS';

  maxTimeStretchRatio?: number;
  timingMapRef: string;
  compositionVariantRef: string;
  qaRefs: string[];
}
```

Requirements:

- translated text/narration duration is measured, not guessed;
- speech SHALL NOT be unnaturally time-compressed merely to preserve the source cut unless a
  reviewed profile explicitly allows it;
- caption line-breaking and font/layout are locale-specific;
- Thai/CJK/RTL/complex-script rendering uses tested font/shaping paths;
- visual beat events MAY move when speech timing changes;
- localized variants inherit semantic intent, not blindly every frame timing;
- unchanged source/generative media SHOULD be reused where valid.

---

# 72. Provider Adapter Contract Drift & Runtime Qualification

Provider/model drift from Section 58 and adapter/schema drift are related but distinct.

Before dispatch, the runtime SHALL verify that the selected provider adapter still satisfies the
exact contract expected by the plan.

Qualification SHALL bind at least:

```text
semantic capability id
adapter version
provider/model version or revision
input schema version
output schema version
required feature tuple
account/region entitlement
runtime/tool version
known compatibility status
```

Runtime states:

```text
QUALIFIED
QUALIFIED_WITH_WARNINGS
STALE
DEGRADED
UNQUALIFIED
UNAVAILABLE
```

Rules:

- an adapter upgrade SHALL NOT silently reinterpret stored parameters;
- schema validation occurs both before dispatch and on returned receipts;
- `STALE` may permit read-only inspection but SHALL NOT be treated as production-qualified without
  current policy;
- high-value production MAY use a small qualification/canary probe before a costly full run;
- capability metadata caches SHALL have bounded freshness;
- provider HTTP success alone is not conformance evidence.

---

# 73. Artifact Integrity & Tamper-evident Production Provenance

Production receipts SHALL be verifiable against the actual artifacts they describe.

At minimum:

```text
artifact content digest
manifest digest
parent/source digests
provider receipt digest
QC/evaluation receipt digests
approval binding digest
```

SHALL be retained where applicable.

The platform SHOULD support a tamper-evident receipt envelope.

```ts
interface ProductionIntegrityEnvelopeV1 {
  productionId: string;
  manifestDigest: string;
  finalArtifactDigests: string[];
  receiptDigests: string[];
  chainRootDigest: string;
  signatureRef?: string;
  signedAt?: string;
}
```

Requirements:

- altering a delivery artifact after approval invalidates the approval binding;
- sidecars and metadata SHALL bind to the exact final artifact/package digest;
- integrity verification is deterministic and independent of the creative evaluator;
- signatures MAY be added by existing platform signing infrastructure; Spec 286 MUST NOT invent a
  separate identity/PKI authority;
- historical receipts remain verifiable after UI/project edits.

---

# 74. Artifact Lifecycle, Pinning & Garbage Collection

Agentic production can create many previews, contact sheets, sandbox builds, audio proxies and
failed candidates.

The runtime SHALL define lifecycle state.

```text
EPHEMERAL
ACTIVE_CANDIDATE
CURRENT_BEST
APPROVED
DELIVERED
SUPERSEDED
AUDIT_PINNED
USER_PINNED
PURGE_ELIGIBLE
PURGED
```

Garbage collection SHALL be reachability- and policy-aware.

An artifact MUST NOT be purged while referenced by:

- current canonical production revision;
- current-best candidate;
- approved delivery package;
- active repair/review;
- unresolved billing/audit dispute where policy requires evidence;
- explicit user pin;
- retention/legal hold from canonical policy.

Purging derived bytes MAY retain the minimum digest/provenance record required to explain history.

Storage cleanup SHALL NOT break the ability to identify that a historical artifact existed, even
when policy permits deleting the bytes.

---

# 75. Approval Scope, Exact-hash Binding & Derivative Reapproval

An approval applies only to the exact scope that was reviewed.

```ts
interface VideoApprovalBindingV1 {
  approvalRef: string;
  productionId: string;
  artifactOrPackageDigest: string;
  scope: {
    locales: string[];
    aspectVariants: string[];
    platformProfiles: string[];
    publicationTargets?: string[];
  };
  approvedRevisionRef: string;
  approvedAt: string;
}
```

The following SHALL invalidate or require reevaluation according to policy:

- visual bytes changed;
- narration/dialogue changed;
- claim/caption wording changed;
- hero asset changed;
- locale changed;
- platform variant materially recomposed;
- provider substitution with material difference;
- rights snapshot invalidated.

Pure transport/remux changes MAY reuse an approval only when canonical policy classifies them as
non-material and integrity checks prove semantic media equivalence.

Approval for:

```text
preview
≠
final
≠
another aspect
≠
another language
≠
another publication target
```

unless the approval explicitly covers those exact scopes.

---

# 76. Delivery Supersession, Correction & Retraction Handoff

Spec 286 does not own publication channels, but it SHALL support correction lineage after delivery.

```ts
interface DeliverySupersessionV1 {
  oldDeliveryPackageRef: string;
  replacementDeliveryPackageRef?: string;
  reason:
    | 'CONTENT_CORRECTION'
    | 'RIGHTS_REVOKED'
    | 'QUALITY_DEFECT'
    | 'BRAND_CORRECTION'
    | 'USER_REQUEST'
    | 'OTHER';

  action:
    | 'SUPERSEDE'
    | 'RETRACT_REQUEST'
    | 'RESTRICT_REUSE';

  createdAt: string;
  policyRef: string;
}
```

Requirements:

- a corrected output is a new immutable delivery package;
- the old receipt is not deleted or rewritten;
- publishing systems receive a typed supersession/retraction request through their canonical owner;
- SmartAIHub SHALL NOT claim external content was removed unless the external publication owner
  confirms that state;
- downstream reuse of a superseded artifact SHOULD resolve to the replacement when policy permits.

---

# 77. Data Locality, Egress & Placement Manifest

Video/media projects may contain private footage, unreleased products, faces, voices or enterprise
UI.

Each material stage SHALL declare its locality/egress behavior.

```ts
interface ProductionPlacementDecisionV1 {
  stageId: string;
  selectedRuntimeRef: string;
  dataClasses: string[];
  sourceRegion?: string;
  executionRegion?: string;
  externalEgress: boolean;
  providerRef?: string;
  reason: string;
  policyEvaluationRef: string;
}
```

Rules:

- capability relevance does not override locality/egress policy;
- a provider unavailable in the allowed region is `UNAVAILABLE`, not permission to send elsewhere;
- local-only/private workflows SHOULD prefer eligible local/tenant-controlled execution;
- contact sheets and derived frames inherit sensitivity from their source;
- provider fallback that changes egress/locality is a material substitution under Section 67;
- placement decisions are rechecked when policy, account, provider or project sensitivity changes.

---

# 78. Multi-agent Role Separation & Creative Decision Arbitration

A production MAY use multiple reasoning roles:

```text
Creative Director
Motion Specialist
Audio Specialist
Continuity Critic
Brand Critic
Technical QC
Delivery Planner
```

These roles SHALL NOT mutate canonical state by free-form consensus.

Material disagreements SHALL produce a typed decision record.

```ts
interface ProductionDecisionRecordV1 {
  decisionId: string;
  productionId: string;
  subjectRef: string;
  proposals: Array<{
    role: string;
    proposalRef: string;
    evidenceRefs: string[];
  }>;
  selectedProposalRef?: string;
  resolution:
    | 'POLICY'
    | 'LOCKED_USER_INTENT'
    | 'MEASURED_QC'
    | 'QUALITY_RUBRIC'
    | 'COST_BOUND'
    | 'HUMAN_REVIEW'
    | 'NO_RESOLUTION';
  rationale: string;
}
```

Precedence:

```text
hard policy / rights / safety
    >
explicit user locks / approved intent
    >
deterministic measured constraints
    >
approved quality profile
    >
specialist preference
```

Aesthetic agents SHALL NOT overrule deterministic safety or explicit user locks merely because they
prefer another design.

Repeated critic/director ping-pong SHALL trigger arbitration/replan rather than infinite revisions.

---

# 79. Degraded Mode & Human-review Fallback

The system SHALL remain usable when an optional AI critic/provider is unavailable.

Possible modes:

```text
FULL_AGENTIC
DETERMINISTIC_QC_PLUS_HUMAN_REVIEW
PREVIEW_ONLY
EDIT_ONLY
RENDER_ONLY
READ_ONLY
```

Rules:

- absence of a multimodal critic SHALL NOT produce a fabricated creative PASS;
- deterministic QC may still report measured PASS/WARN/FAIL;
- the UI SHALL clearly show which quality gates were not executed;
- a user MAY manually approve according to canonical policy where human review is permitted;
- unavailable premium/optional capabilities SHALL not make existing Spec 133 projects unreadable;
- degraded mode must preserve manifests/receipts so later review can resume without restarting the
  production.

---

# 80. Benchmark Governance, Holdout Evaluation & Anti-overfitting

The Golden Set in Sections 41 and 63 SHALL NOT become the only corpus against which the Director and
Critic are optimized.

The evaluation program SHOULD maintain:

```text
PUBLIC/DEVELOPER GOLDENS
CALIBRATION SET
HOLDOUT SET
ADVERSARIAL SET
RECENT REAL-WORLD ACCEPTED/REJECTED SAMPLES
```

Requirements:

- holdout labels are not injected into production prompts;
- promotion decisions report performance by genre/language/aspect, not only one aggregate score;
- benchmark samples SHALL obey rights/privacy rules;
- repeated tuning against one aesthetic style SHALL NOT redefine "professional" globally;
- model/provider upgrades require drift comparison;
- user acceptance and post-repair preference are tracked separately from evaluator self-score;
- benchmark contamination or label leakage invalidates the affected evaluation result.

---

# 81. Render Resource Admission, Backpressure & Host Fitness

Spec 286 SHALL NOT create another scheduler, but every expensive stage SHALL declare a resource
profile consumed by the existing placement/job authorities.

```ts
interface VideoStageResourceProfileV1 {
  stageId: string;
  cpuClass: 'LOW'|'MEDIUM'|'HIGH';
  memoryMbMin?: number;
  gpuRequired: boolean;
  gpuVramMbMin?: number;
  diskScratchMb?: number;
  expectedOutputMb?: number;
  maxRuntimeSeconds?: number;
  concurrencyClass: 'INTERACTIVE'|'PREVIEW'|'BATCH'|'FINAL_RENDER';
}
```

Requirements:

- a host SHALL NOT accept work it cannot satisfy according to current advertised capability;
- large final renders SHOULD use admission/backpressure instead of competing until the machine
  thrashes or crashes;
- preview work MAY use lower resource profiles;
- local Runner health/resource telemetry MAY influence placement without becoming canonical job
  authority;
- resource rejection SHALL be a placement/retry signal, not a creative failure;
- simultaneous sessions SHALL respect shared machine limits;
- low-resource tablet/phone clients may initiate work without becoming render hosts.

---

# 82. Rollout Kill Switch, Version Pinning & Safe Rollback

Feature flags in this Spec SHALL have an operational rollback contract.

The platform SHALL be able to disable independently:

```text
generated motion sandbox
external media provider
specific provider adapter version
specific critic/model version
automatic repair
reference-style extraction
Film Studio shared-runtime path
skill promotion
final auto-approval path
```

without corrupting existing projects.

Each production manifest SHALL pin enough runtime/version identity to explain the run.

Rollback requirements:

- disabling a new path SHALL fall back only to an authorized equivalent path;
- existing approved artifacts remain readable;
- in-flight jobs follow canonical cancellation/drain rules;
- rollback SHALL NOT rewrite historical receipts;
- a bad critic/model version MAY be quarantined while keeping prior evaluation receipts;
- schema readers MUST retain backward compatibility for already-created R1.2 logical artifacts or
  provide an explicit migration adapter;
- emergency disablement MAY stop mutation while preserving read/review/export of already-approved
  artifacts where safe.

---

# 83. R1.2 Acceptance Additions

The following scenarios are additive to A1–A14.

## A15 — Provider fallback changes privacy/cost

Primary provider becomes unavailable and fallback requires external egress plus higher cost.

Expected:

- material-difference substitution record;
- no silent dispatch;
- policy/approval/quote delta applied;
- denial cannot be bypassed.

## A16 — Partial failure after expensive stages

Motion render and narration are complete; final platform export fails.

Expected:

- valid upstream artifacts preserved;
- only export resumes;
- economic compensation follows canonical settlement;
- no unnecessary motion/narration regeneration.

## A17 — Cross-tenant cache collision

Two tenants produce identical content digests for a private asset.

Expected:

- no hash-only cross-tenant access;
- no private byte reuse across tenants without explicit sharing rights;
- cache hit remains authorization-scoped.

## A18 — Rights revoked after preview

A licensed hero image becomes invalid before publication.

Expected:

- historical preview remains explainable;
- publish/reuse gate blocks;
- system proposes replacement/recomposition;
- receipt history is not rewritten.

## A19 — Thai-to-English localized timing expansion

English narration runs materially longer than Thai source.

Expected:

- measured timing;
- locale-specific timing/composition variant;
- no extreme automatic speech compression;
- captions and beat events realigned.

## A20 — Approval does not cover derivative

User approved 16:9 Thai final; system produces 9:16 English.

Expected:

- prior approval not silently reused unless exact approval scope covered both variants;
- derivative receives its required review.

## A21 — Optional creative critic outage

Multimodal critic is unavailable.

Expected:

- deterministic QC still runs;
- UI shows creative review not executed;
- user/policy may choose human review;
- system never reports synthetic creative PASS.

## A22 — Resource pressure

Five final renders start on a Runner with insufficient memory.

Expected:

- existing placement/job authority backpressures/admission-controls work;
- machine is not intentionally overloaded by Spec 286;
- queued/rejected placement is not scored as a creative defect.

---

# 84. R1.2 Test Additions

Implementation SHALL add tests for:

```text
provider-substitution material-difference classification
permission-denial no-fallback invariant
partial-success saga restart and compensation idempotency
cross-tenant cache isolation / hash-not-auth invariant
rights snapshot revalidation before delivery/publication
localized timing variant generation
adapter input/output schema drift rejection
artifact/receipt digest tamper detection
artifact reachability and GC pinning
approval exact-hash/scope binding
delivery supersession lineage
data-locality placement denial
multi-agent arbitration precedence
critic-unavailable degraded-mode truthfulness
holdout-evaluation isolation
resource-admission/backpressure integration
kill-switch disable/re-enable compatibility
```

---

# 85. R1.2 Exit-criteria Additions

In addition to Sections 48 and 66C, production readiness requires:

33. Provider fallback cannot hide material changes in cost/privacy/editability/determinism.
34. Partial production failure can resume without regenerating still-valid expensive stages.
35. Content-addressed caches cannot cross tenant/project authorization boundaries.
36. Rights/consent/license state is revalidated at delivery/publication/reuse boundaries.
37. Localized variants handle narration-duration change without forced unsafe/unnatural timing.
38. Adapter/schema drift cannot silently reinterpret stored production plans.
39. Approval is bound to exact artifact/package digest and explicit derivative scope.
40. Superseded/corrected deliveries preserve immutable historical lineage.
41. Locality/egress policy is enforced at placement and fallback.
42. Multi-agent disagreement cannot create unbounded repair ping-pong.
43. Critic/provider outage degrades truthfully without fabricated quality claims.
44. Evaluation promotion includes holdout/adversarial evidence, not only tuned golden cases.
45. Existing job/placement layer prevents render-resource oversubscription according to declared
    resource profiles.
46. Operational kill switches can disable faulty R1.2 paths without making legacy Spec 133 projects
    unreadable.

---

# 87. Color Management, HDR/SDR & Display-transform Integrity

Professional video quality cannot be evaluated reliably if preview and final render do not share a
well-defined color pipeline.

The runtime SHALL make color state explicit.

```ts
interface VideoColorPipelineV1 {
  sourceColorSpace?: string;
  sourceTransfer?: string;
  sourcePrimaries?: string;
  sourceRange?: 'FULL'|'LIMITED'|'UNKNOWN';
  sourceHdrClass?: 'SDR'|'HDR10'|'HLG'|'DOLBY_VISION'|'UNKNOWN';

  workingColorSpace: string;
  previewDisplayTransformRef: string;
  finalOutputProfileRef: string;

  alphaMode?: 'STRAIGHT'|'PREMULTIPLIED'|'NONE';
  toneMapPolicy?: 'PRESERVE_HDR'|'HDR_TO_SDR'|'NONE';
  conversionEvidenceRefs: string[];
}
```

Requirements:

- preview, critic evidence and final output SHALL record the applied display/color transform;
- HDR footage SHALL NOT silently pass through an SDR path and be judged as if the source itself was
  washed out;
- SDR→HDR or HDR→SDR conversion SHALL be explicit and attributable;
- mixed-media timelines SHALL normalize into a declared working space before final composition;
- alpha/premultiplication behavior SHALL be deterministic for overlays where applicable;
- color conversion and creative grading are distinct:
  `COLOR_TRANSFORM != CREATIVE_GRADE`;
- a Creative Critic SHALL NOT penalize an artifact for a known preview display-transform mismatch;
- final platform QC SHALL validate the actual encoded color tags/profile, not only project intent;
- when the runtime cannot reliably identify source color state, it SHALL report `UNKNOWN` and avoid
  inventing a transform.

---

# 88. Semantic Fidelity Gate — Script, Narration, Caption, On-screen Text & Visual Meaning

A visually attractive output can still become materially wrong when production edits alter meaning.

The runtime SHALL preserve semantic fidelity between approved source intent and final audiovisual
communication.

```ts
interface SemanticFidelityAssessmentV1 {
  assessmentId: string;
  productionId: string;
  candidateRef: string;

  authoritativeContentRefs: string[];
  finalTranscriptRef?: string;
  finalCaptionRef?: string;
  onScreenTextExtractionRef?: string;
  materialVisualClaimRefs?: string[];

  findings: Array<{
    kind:
      | 'OMISSION'
      | 'CONTRADICTION'
      | 'NUMBER_CHANGED'
      | 'QUALIFIER_LOST'
      | 'CTA_CHANGED'
      | 'CLAIM_VISUALLY_MISREPRESENTED'
      | 'CAPTION_AUDIO_MISMATCH'
      | 'UNAUTHORIZED_PARAPHRASE';
    severity: 'BLOCKER'|'MAJOR'|'MINOR';
    sourceRef: string;
    evidenceRefs: string[];
  }>;

  status: 'PASS'|'WARN'|'FAIL'|'UNKNOWN';
}
```

Mandatory examples:

- `ไม่ควร` MUST NOT become `ควร` because a caption token was dropped;
- `up to 30%` MUST NOT become `30% guaranteed`;
- a chart animation MUST NOT visually imply a value different from the underlying approved data;
- a generated UI/product scene MUST NOT imply a feature exists when it is only illustrative;
- translated/localized variants SHALL preserve qualifiers and claim scope;
- scene trimming SHALL not remove context that changes the approved meaning.

For health, finance, legal, safety, product-claim or other sensitive domains, Spec 286 SHALL consume
the relevant canonical content/claim authority rather than invent one.

A creative-quality PASS cannot override a semantic-fidelity FAIL.

---

# 89. Collaborative Production Branches, Rebase & Merge Safety

Exact-candidate repair fencing prevents stale patches, but multi-user/multi-agent production also
requires explicit branch semantics.

```ts
interface ProductionBranchV1 {
  branchId: string;
  productionId: string;
  baseRevisionRef: string;
  headRevisionRef: string;
  purpose:
    | 'AI_REPAIR'
    | 'USER_VARIANT'
    | 'ASPECT_VARIANT'
    | 'LOCALIZATION'
    | 'EXPERIMENT'
    | 'MANUAL_EDIT';
  ownerRef: string;
  createdAt: string;
}
```

Rules:

- two agents/users editing the same production SHALL NOT silently overwrite each other;
- branch creation is cheap and does not imply a second canonical project;
- merge applies semantic operations/revisions, not blind JSON last-write-wins;
- conflicting locks, timing edits, asset replacement or script changes SHALL require explicit
  resolution;
- approved/delivered revisions SHALL remain immutable ancestors;
- a repair branch based on stale evidence SHALL rebase/re-review before merge;
- one branch's critic score SHALL NOT be transferred to another branch without rerender/review;
- the UI SHALL clearly distinguish `current`, `candidate`, `branch`, `approved`, and `delivered`.

This section does not create a generic collaboration platform; it defines only video-production
revision semantics consumed by existing project/task authorities.

---

# 90. Render Environment Fingerprint & Reproducibility Tolerance

The same project can render differently across browser/OS/GPU/font/codec versions even when source
code is identical.

Every production-significant render SHALL record an environment fingerprint.

```ts
interface RenderEnvironmentFingerprintV1 {
  rendererKind: string;
  rendererVersion: string;
  browserEngineVersion?: string;
  ffmpegVersion?: string;
  os?: string;
  architecture?: string;
  gpuClass?: string;
  driverVersion?: string;
  fontSetDigest?: string;
  codecLibraryDigest?: string;
  dependencyLockDigest?: string;
  containerImageDigest?: string;
}
```

Reproducibility classes SHALL be declared:

```text
BIT_EXACT
FRAME_EQUIVALENT_WITH_TOLERANCE
SEMANTICALLY_EQUIVALENT
NONDETERMINISTIC_GENERATIVE
```

Requirements:

- deterministic fixtures SHALL define the correct tolerance class;
- visual regression tests SHALL NOT require impossible bit identity across known nondeterministic GPU
  paths;
- final receipts SHALL preserve the exact environment fingerprint used for the approved output;
- a materially different renderer/font/browser environment MAY trigger revalidation before reusing
  prior visual approval;
- missing fonts SHALL fail/qualify explicitly rather than silently substitute and change layout;
- model seed alone SHALL NOT be presented as full reproducibility for generative video.

---

# 91. Export Privacy Scrub & Hidden Metadata Control

Final media and sidecars can leak information even when visible pixels are safe.

Before delivery, a privacy/export profile SHALL evaluate metadata such as:

```text
GPS/location
capture device identifiers
original file paths
author/user names
editing workstation names
embedded comments
creation tool metadata
unused subtitle/data tracks
private chapter labels
private project IDs
thumbnail EXIF
attached artwork metadata
```

The runtime SHALL support:

```ts
interface ExportPrivacyProfileV1 {
  profileId: string;
  stripLocation: boolean;
  stripSourcePaths: boolean;
  stripPrivateComments: boolean;
  preserveRequiredCopyright: boolean;
  preserveRequiredColorMetadata: boolean;
  preserveRequiredContentCredentials: boolean;
  allowedMetadataKeys: string[];
}
```

Rules:

- privacy scrub SHALL NOT remove metadata required for correct playback/color/accessibility;
- intentional copyright/license attribution SHALL not be removed merely because it is metadata;
- internal IDs SHALL not leak into public outputs unless required;
- final QC SHALL inspect the actual exported package metadata;
- a sidecar generated for external use SHALL receive the same privacy classification as the media it
  describes.

---

# 92. Content Authenticity, AI-origin Disclosure & Content Credentials

Spec 286 SHALL support provenance/disclosure requirements without becoming the policy authority that
decides every jurisdiction/platform rule.

A delivery profile MAY require an authenticity/disclosure projection:

```ts
interface ContentAuthenticityManifestV1 {
  productionId: string;
  finalArtifactDigest: string;

  mediaOrigins: Array<{
    assetRef: string;
    origin:
      | 'CAPTURED_REAL'
      | 'GENERATED'
      | 'GENERATIVE_EDIT'
      | 'SYNTHETIC_VOICE'
      | 'SYNTHETIC_IMAGE'
      | 'UNKNOWN';
    provenanceRefs: string[];
  }>;

  disclosureProfileRef?: string;
  credentialProviderRef?: string;
  credentialReceiptRef?: string;
}
```

Requirements:

- the system SHALL be able to distinguish known generated/edited/captured components;
- C2PA or another content-credential provider MAY be integrated as a capability, but is not hardcoded
  as the only solution;
- provider/platform-required AI labels SHALL be applied when current policy requires them;
- the system SHALL NOT falsely claim a content credential was embedded when only an internal receipt
  exists;
- adding/removing disclosure metadata after approval affects the delivery package digest and follows
  Section 75 approval-scope rules;
- generated-media disclosure does not replace copyright/consent/safety checks.

---

# 93. Production Autonomy Profiles & Human-control Envelope

`Auto`, `Guided`, and `Expert` UI modes are not sufficient by themselves to define what an agent may
change autonomously.

Spec 286 SHALL define a bounded production autonomy profile.

```ts
interface VideoProductionAutonomyProfileV1 {
  profileId: string;

  mayAutoPlan: boolean;
  mayAutoRenderPreview: boolean;
  mayAutoRepairSafe: boolean;
  mayAutoSwapEquivalentProvider: boolean;
  mayAutoCreateGeneratedMotionCandidate: boolean;

  requiresReviewFor: Array<
    | 'SCRIPT_CHANGE'
    | 'NARRATION_CHANGE'
    | 'CLAIM_CHANGE'
    | 'HERO_ASSET_CHANGE'
    | 'MATERIAL_PROVIDER_SUBSTITUTION'
    | 'RIGHTS_CHANGE'
    | 'FINAL_APPROVAL'
    | 'PUBLICATION'
  >;

  maxRepairLoops: number;
  maxSpendRef?: string;
}
```

Rules:

- autonomy is constrained by current user/project/tenant policy and cannot expand itself;
- `AUTO_SAFE` fixes such as moving a caption inside safe area MAY be preauthorized;
- changing script meaning, product claims, likeness/voice use or publication SHALL not be smuggled
  through a visual repair;
- the user can inspect which classes of changes were autonomous;
- switching to a more autonomous profile affects future actions, not historical authorization;
- external agents/harnesses receive attenuated authority, never the user's entire autonomy envelope
  by default.

---

# 94. Delivery Profile Freshness & Platform-policy Drift

Platform export requirements and UI obstruction zones change over time.

Every delivery profile SHALL be versioned and freshness-aware.

```ts
interface DeliveryProfileSnapshotV1 {
  platformId: string;
  profileVersion: string;
  sourceRefs: string[];
  verifiedAt: string;
  validUntil?: string;
  confidence: 'VERIFIED'|'PARTIAL'|'STALE'|'UNKNOWN';
  rulesDigest: string;
}
```

Requirements:

- stored production manifests pin the profile used for historical reproducibility;
- before a new external delivery, the system SHOULD resolve the current eligible profile;
- `STALE/UNKNOWN` SHALL be surfaced rather than represented as current verified policy;
- safe-area/UI-overlay data and technical codec limits MAY have different freshness;
- platform profile updates SHALL not mutate old delivery receipts;
- a changed profile MAY invalidate only the downstream delivery/export stage, not the entire creative
  production.

---

# 95. Untrusted Media Input Quarantine & Decoder/Parser Safety

Prompt injection is not the only risk in reference/media ingestion. Malformed or hostile media can
target parsers, decoders, fonts, archives or browser renderers.

Untrusted inputs SHALL pass through an ingestion safety boundary before high-privilege processing.

Required controls MAY include:

```text
MIME/type verification from bytes
container probing in restricted process
file-size/dimension/duration limits
decompression/archive limits
font validation
SVG/script sanitization
malware scanning where available
decoder timeout/resource caps
symlink/path rejection
network fetch isolation
browser active-content restrictions
```

State:

```text
UNSCANNED
QUARANTINED
SAFE_FOR_RESTRICTED_PROCESSING
ADMITTED
REJECTED
UNKNOWN
```

Rules:

- an asset may be usable for isolated transcoding before it is eligible for browser/authoring
  execution, depending on policy;
- SVG/HTML/web references SHALL not gain script execution merely because they are visual assets;
- remote media URLs are materialized under controlled network policy rather than streamed into a
  privileged renderer blindly;
- quarantine state and reason are visible in the production manifest;
- malformed input failure is not a creative-quality failure.

---

# 96. Atomic Delivery-package Finalization

A video delivery is frequently a package, not one MP4.

The runtime SHALL finalize a package atomically before presenting it as deliverable.

```ts
interface FinalizedDeliveryPackageV1 {
  packageId: string;
  productionId: string;
  packageDigest: string;

  artifacts: Array<{
    role:
      | 'MASTER_VIDEO'
      | 'PLATFORM_VIDEO'
      | 'SUBTITLE'
      | 'TRANSCRIPT'
      | 'THUMBNAIL'
      | 'CHAPTERS'
      | 'METADATA'
      | 'AUTHENTICITY'
      | 'OTHER';
    artifactRef: string;
    digest: string;
  }>;

  qcRefs: string[];
  privacyCheckRef: string;
  rightsSnapshotRef: string;
  semanticFidelityRef: string;
  approvalBindingRef?: string;

  state: 'BUILDING'|'VALIDATING'|'FINALIZED'|'INVALID';
}
```

`FINALIZED` requires:

- all mandatory artifacts exist and digest-match;
- package-level QC executed;
- no dangling candidate/old-revision sidecar;
- privacy check completed;
- rights/policy gates current;
- semantic-fidelity gate satisfied where applicable;
- required approval bound to the package digest.

Publication/export systems SHALL consume a `FINALIZED` package, not an arbitrary collection of
latest files.

---

# 97. Manual Override, User Locks & AI Repair Provenance

Manual edits SHALL have explicit provenance so later autonomous repair does not undo intentional
human work.

```ts
interface ManualOverrideReceiptV1 {
  overrideId: string;
  productionId: string;
  baseRevisionRef: string;
  resultingRevisionRef: string;
  actorRef: string;

  operationRefs: string[];
  lockEffects: Array<{
    targetRef: string;
    mode: 'LOCK_VALUE'|'LOCK_STRUCTURE'|'PROTECT_FROM_AUTO_REPAIR';
  }>;

  rationale?: string;
  createdAt: string;
}
```

Rules:

- user/manual edit wins over a lower-authority AI aesthetic preference;
- AI MAY warn that a manual choice creates a measurable technical problem;
- technical hard blockers (for example invalid codec/output size) are not silently waived by an
  aesthetic lock;
- auto-repair SHALL preserve `PROTECT_FROM_AUTO_REPAIR` unless current policy/user explicitly
  unlocks it;
- opening/returning from Video Editor SHALL preserve manual override identity;
- the UI SHALL make it possible to unlock/revert an override intentionally.

---

# 98. Privacy Deletion, Consent Withdrawal & Derived-artifact Propagation

Artifact GC alone is not sufficient when a valid privacy/consent deletion request affects derived
production material.

Spec 286 SHALL integrate with the canonical privacy/retention authority and provide a dependency
projection capable of identifying affected derivatives.

```text
source face/voice/private asset
    ↓
derived frames / proxy
    ↓
generated motion/reference embeddings
    ↓
preview/contact sheet
    ↓
candidate/final package
```

Requirements:

- Spec 286 does not decide legal deletion entitlement;
- once canonical authority issues a deletion/restriction instruction, the production graph SHALL
  identify affected stored derivatives;
- deletion, restriction, tombstoning or retained-audit treatment follows canonical policy;
- a deleted/restricted source SHALL not continue to seed new generations through a cache/vectorized
  derivative;
- necessary minimal historical receipts MAY retain non-reconstructive digests/identifiers where
  canonical policy requires them;
- consent withdrawal and rights revocation SHALL invalidate future reuse even when historical final
  delivery is retained for lawful audit;
- failures to purge a derivative SHALL be observable and retryable.

---

# 99. Font, Asset & Embedded-resource Export License Gate

An asset may be licensed for editing but not redistribution or embedding.

Before finalization/reuse/promotion the runtime SHALL evaluate export rights for resources such as:

```text
fonts
stock images/video
music/SFX
LUTs
3D assets
templates
icons
generated assets with provider restrictions
brand resources
```

The gate SHALL distinguish at least:

```text
EDIT_ALLOWED
RENDER_DERIVATIVE_ALLOWED
EMBED_ALLOWED
REDISTRIBUTION_ALLOWED
TEMPLATE_PROMOTION_ALLOWED
MARKETPLACE_ALLOWED
UNKNOWN
```

Examples:

- a font may be allowed for rendered pixels but not bundled into a downloadable project/template;
- a stock image may be allowed in final video but not redistributed as a source asset;
- a user-owned brand asset may be usable in one tenant project but forbidden in a marketplace Skill
  example pack.

Unknown export rights SHALL not be silently converted into permission.

This section extends Section 70 with export/embedding-specific granularity and does not create a
separate rights authority.

---

# 100. Quality Canary, Shadow Comparison & Automated Regression Containment

A new Director/Critic/provider version can technically pass tests yet degrade real production
quality.

Rollout SHOULD support versioned shadow/canary comparison.

```ts
interface VideoQualityCanaryResultV1 {
  canaryId: string;
  baselineRuntimeRef: string;
  candidateRuntimeRef: string;
  cohortRef: string;

  metrics: {
    technicalPassDelta?: number;
    creativeAcceptanceDelta?: number;
    repairLoopDelta?: number;
    humanOverrideDelta?: number;
    costDelta?: number;
    latencyDelta?: number;
  };

  holdoutEvaluationRef?: string;
  rolloutDecision:
    | 'CONTINUE'
    | 'HOLD'
    | 'ROLLBACK'
    | 'HUMAN_REVIEW';
}
```

Requirements:

- shadow evaluation SHALL not mutate user production or double-charge;
- canary cohorts obey tenant/privacy boundaries;
- promotion compares quality, cost and repair burden, not only error rate;
- a statistically/operationally meaningful regression can activate the Section 82 kill switch;
- rollout metrics SHALL separate genre/language/aspect/provider cohorts where sample size permits;
- rollback does not invalidate artifacts legitimately approved under the prior version.

---

# 101. R1.3 Acceptance Additions

The following scenarios are additive to A1–A22.

## A23 — HDR source judged through SDR preview

Input is HDR and preview display transform is misconfigured.

Expected:

- source HDR state identified or marked unknown;
- evaluator uses declared transform;
- no false "washed-out source" judgement;
- final output color tags verified.

## A24 — Caption changes approved medical meaning

Approved source says "ไม่ควรใช้เกิน 2 ครั้ง" but final caption omits "ไม่".

Expected:

- semantic-fidelity FAIL/BLOCKER;
- creative score cannot override;
- targeted caption repair.

## A25 — Two concurrent editors

Human edits typography while AI repair branch changes the same scene layout.

Expected:

- independent branches;
- no silent overwrite;
- conflict/rebase and rerender before merge.

## A26 — Font difference across render hosts

Preview host and final host have different installed font versions.

Expected:

- environment fingerprint detects mismatch;
- controlled font asset/pinned set used or final revalidation triggered;
- no silent line-wrap shift accepted.

## A27 — Public export leaks source GPS metadata

Visible video is correct but source/location metadata survives in output.

Expected:

- export privacy scrub/check detects or strips according to profile;
- required color/copyright metadata preserved.

## A28 — Generated-content disclosure required

Delivery target requires AI-content disclosure/content credentials.

Expected:

- authenticity manifest assembled;
- supported credential/disclosure provider invoked;
- system does not claim successful credential embedding without receipt.

## A29 — Autonomous repair tries to change script

Visual critic proposes rewriting a claim to improve layout.

Expected:

- autonomy profile blocks or routes to review;
- layout repair preferred without unauthorized semantic mutation.

## A30 — Stale Reels safe-area profile

Stored delivery profile is stale.

Expected:

- freshness state visible;
- current profile resolved when possible;
- only delivery/composition-dependent stages invalidated.

## A31 — Malicious SVG/reference asset

Reference SVG contains active script/network behavior.

Expected:

- quarantine/sanitization/isolation;
- no script executes in privileged application/renderer context.

## A32 — Sidecar from wrong revision

Master MP4 is final candidate N but subtitle JSON is from N-1.

Expected:

- package finalization fails;
- no delivery/publish action receives package.

## A33 — Manual editor lock vs AI critic

Human intentionally uses asymmetric composition and locks it.

Expected:

- AI may record a preference disagreement;
- no automatic aesthetic repair overwrites lock;
- technical blocker remains independently enforceable.

## A34 — Consent deletion after multiple previews

Source voice/face consent is withdrawn under canonical privacy authority.

Expected:

- dependency projection identifies affected derivatives;
- future reuse blocked;
- deletion/restriction actions propagate according to canonical policy.

## A35 — Font licensed for render but not redistribution

Final MP4 is permitted, but downloadable template packaging would include the font.

Expected:

- final rendered derivative may pass;
- template/marketplace promotion blocks embedding or requires compliant substitution.

## A36 — New critic version degrades Thai layout

Canary critic accepts more English samples but causes worse Thai repair decisions.

Expected:

- cohort metrics expose regression;
- rollout held/rolled back without corrupting old approved artifacts.

---

# 102. R1.3 Test Additions

Implementation SHALL add tests for:

```text
HDR/SDR source-working-output color pipeline and tag verification
mixed-color-space composition fixtures
semantic-fidelity negative polarity / number / qualifier preservation
final caption-vs-audio transcript alignment
concurrent production branch conflict/rebase
critic evidence invalidation after branch merge
render environment fingerprint capture
font-set mismatch and layout revalidation
export metadata/privacy scrub
content-authenticity manifest and credential receipt truthfulness
autonomy profile authority attenuation
stale delivery-profile handling
hostile SVG/media/font quarantine
decoder timeout/resource-limit behavior
atomic package finalization with wrong-revision sidecar
manual override/lock preservation across AI repairs
privacy deletion dependency traversal
cache/vector derivative reuse invalidation after restriction
font/source-asset export-license matrix
quality canary shadow-no-charge invariant
cohort-specific rollback trigger
```

---

# 103. R1.3 Exit-criteria Additions

In addition to Sections 48, 66C and 85, production readiness requires:

47. Preview/final color management is explicit and HDR/SDR golden tests pass.
48. Semantic-fidelity failures block visually polished but materially incorrect deliverables.
49. Concurrent human/agent edits cannot silently overwrite production revisions.
50. Final approved renders retain a sufficient environment fingerprint for reproducibility diagnosis.
51. Public delivery packages do not leak disallowed private source metadata.
52. Required generated-content disclosure/content-credential state is verifiable, never merely claimed.
53. Autonomous repair cannot expand its authority into script/claim/rights/publication changes.
54. Platform delivery profiles expose freshness and can invalidate only affected downstream stages.
55. Hostile/untrusted media/reference inputs are isolated before privileged rendering/authoring.
56. A delivery is consumable only from an atomically `FINALIZED` package.
57. Manual/user locks survive agent repair and Video Editor round-trip.
58. Canonical privacy deletion/restriction can locate and govern derived video-production artifacts.
59. Export/embedding rights distinguish rendered derivative use from source/template redistribution.
60. Director/Critic/provider upgrades pass canary/holdout quality containment before broad rollout.

---

# 105. Timecode, Clock Domains, VFR & Sample-accurate Synchronization

Video production involves several clocks that SHALL NOT be collapsed into one millisecond timeline.

Relevant domains include:

```text
project rational frame time
source presentation timestamp (PTS)
source decode timestamp (DTS)
drop-frame / non-drop-frame timecode
variable-frame-rate source time
audio sample clock
music beat grid
caption cue time
external recorder/camera clock
```

The runtime SHALL define an explicit clock/timebase map.

```ts
interface ProductionTimebaseMapV1 {
  projectTimebase: { num:number; den:number };
  nominalFps?: { num:number; den:number };
  dropFrame?: boolean;

  sourceClocks: Array<{
    sourceRef: string;
    clockKind:
      | 'CFR_FRAME'
      | 'VFR_PTS'
      | 'AUDIO_SAMPLES'
      | 'TIMECODE_DF'
      | 'TIMECODE_NDF'
      | 'EXTERNAL_CLOCK';
    mappingRef: string;
  }>;

  audioSampleRateHz?: number;
  driftModelRef?: string;
}
```

Requirements:

- 29.97/59.94 drop-frame labels SHALL NOT be treated as simple integer frame counting;
- VFR media SHALL preserve source PTS semantics until intentionally conformed;
- audio edits requiring sync SHOULD use sample-accurate boundaries where the provider supports it;
- transcription/caption word times SHALL map to the delivered timeline after cuts/time warps;
- Beat Grid events SHALL be mapped through retiming rather than reused as stale source timestamps;
- scene repair on one clock domain SHALL invalidate dependent mappings;
- long-form productions SHALL detect accumulated A/V drift;
- the final receipt SHALL identify the clock/timebase basis used for the approved deliverable.

The invariant is:

```text
SAME DISPLAY TIMESTAMP LABEL
≠
SAME FRAME/SAMPLE INDEX
```

---

# 106. Keyframe/GOP, Seekability, Fast-start & Segment-boundary Delivery Integrity

A file can pass visual QC but still behave poorly in real players, social uploaders or streaming
pipelines because of keyframe/GOP/container structure.

Delivery QC SHALL be able to measure:

```text
keyframe interval
open/closed GOP where relevant
first decodable frame
A/V start offset
moov atom placement / progressive download readiness
seek-to-time behavior
segment boundary decodability
B-frame timestamp sanity
container duration vs stream duration
```

A delivery profile MAY express:

```ts
interface VideoSeekabilityProfileV1 {
  maxKeyframeIntervalSeconds?: number;
  requireFastStart?: boolean;
  requireIndependentSegments?: boolean;
  requireClosedGop?: boolean;
  maxAvStartOffsetMs?: number;
}
```

Rules:

- preview proxy settings SHALL NOT silently become final-delivery encoding settings;
- a stream-copy edit that starts on a wrong/frozen pre-roll frame SHALL fail applicable delivery QC;
- platform-specific GOP/keyframe constraints MAY evolve independently from creative composition;
- correcting GOP/container structure SHOULD invalidate only final encode/package stages;
- HLS/DASH or other segmented packaging, when supported by another canonical owner/provider, SHALL
  consume validated segments rather than assuming an MP4 visual PASS is sufficient.

---

# 107. Accessibility Deliverables — SDH, Audio Description, Reduced-motion & Flash Safety

Accessibility SHALL be represented as production artifacts and quality requirements, not an
afterthought attached only to captions.

A production profile MAY require:

```text
captions
SDH captions
clean transcript
audio-description track
descriptive transcript
high-contrast text mode
reduced-motion variant
flash/strobe assessment
speaker identification
non-speech sound cues
```

```ts
interface VideoAccessibilityManifestV1 {
  productionId: string;
  requiredFeatures: string[];
  captionTrackRefs: string[];
  sdhTrackRefs: string[];
  audioDescriptionTrackRefs: string[];
  transcriptRefs: string[];
  reducedMotionVariantRef?: string;
  flashAssessmentRef?: string;
  qaRefs: string[];
}
```

Requirements:

- SDH SHALL be distinguishable from plain dialogue captions;
- non-speech cues such as `[เสียงประตูปิด]` or `[music]` MAY be required by profile;
- audio description SHALL not collide with dialogue without a reviewed timing/mix strategy;
- reduced-motion output MAY use lower animation intensity while preserving content meaning;
- flashing/strobe assessment SHALL record frequency/duration/evidence when applicable;
- caption color/contrast and text-size rules SHALL be evaluated on the final aspect variant;
- accessibility artifacts participate in exact-package finalization and approval scope;
- Spec 286 consumes canonical accessibility/policy guidance where one exists rather than becoming
  a universal legal authority.

---

# 108. Audio Channel Layout, Stems, M&E & Spatial-delivery Integrity

Stereo narration is not the only valid professional audio topology.

The runtime SHALL model audio deliverables explicitly.

```ts
interface AudioDeliverableLayoutV1 {
  layout:
    | 'MONO'
    | 'STEREO'
    | '2_1'
    | '5_1'
    | '7_1'
    | 'SPATIAL_OBJECT_BASED'
    | 'CUSTOM';

  channelMap: string[];
  stemRefs: Array<{
    role:
      | 'DIALOGUE'
      | 'NARRATION'
      | 'MUSIC'
      | 'SFX'
      | 'AMBIENCE'
      | 'M_AND_E'
      | 'FULL_MIX'
      | 'OTHER';
    artifactRef: string;
  }>;

  downmixProfileRef?: string;
}
```

Requirements:

- channel order and labels SHALL be verified, not inferred from channel count alone;
- 5.1→stereo downmix SHALL be explicit;
- mono→stereo duplication SHALL not be misreported as true stereo ambience;
- M&E (`Music & Effects`) MAY be preserved for localization without dialogue/narration;
- stem exports SHALL remain synchronized to the exact delivered picture revision;
- multi-language dub SHOULD reuse M&E where rights and timing permit;
- loudness/true-peak checks SHALL be evaluated per required mix/output profile;
- spatial/object-based audio MAY be provider-specific and SHALL not be claimed from generic
  multi-channel support.

---

# 109. Music/SFX Rights, Content-ID Risk & Cue-sheet Provenance

Music and sound effects require more than an audio waveform that passes loudness QC.

Spec 286 SHALL maintain a production-facing rights projection for music/SFX through canonical rights
authorities.

```ts
interface MusicCueUsageV1 {
  cueId: string;
  assetRef: string;
  startMs: number;
  endMs: number;
  usageRole: 'BED'|'FEATURE'|'STING'|'SFX'|'AMBIENCE';

  rightsEvidenceRefs: string[];
  territoryRefs?: string[];
  platformRefs?: string[];
  commercialUseAllowed?: boolean;

  contentIdRisk:
    | 'NONE_KNOWN'
    | 'POSSIBLE'
    | 'REGISTERED_BY_OWNER'
    | 'UNKNOWN';

  attributionRequirementRef?: string;
}
```

Requirements:

- generated music, library music and user-owned music SHALL retain distinct provenance;
- `royalty-free` MUST NOT be interpreted as `copyright-free`;
- a track valid for private editing may be invalid for ads/monetized/public distribution;
- content-ID/automated-claim risk SHOULD be surfaced where known;
- platform/territory restrictions SHALL participate in delivery eligibility;
- cue sheets SHOULD be derivable from the exact final timeline;
- replacing one music cue SHALL invalidate beat-dependent motion/audio stages that actually depend
  on it, not unrelated scenes;
- no Skill/template promotion may redistribute licensed music/SFX unless rights explicitly permit it.

---

# 110. Master, Mezzanine, Proxy & Derivative Lineage

A production SHALL distinguish between editing/proxy artifacts and authoritative masters.

Canonical conceptual roles:

```text
SOURCE_ORIGINAL
EDIT_PROXY
PREVIEW_PROXY
REVIEW_RENDER
MEZZANINE_MASTER
DELIVERY_MASTER
PLATFORM_DERIVATIVE
SOCIAL_VARIANT
ARCHIVE_PACKAGE
```

```ts
interface VideoDerivativeLineageV1 {
  artifactRef: string;
  role: string;
  parentArtifactRefs: string[];
  transformRefs: string[];
  generationNumber: number;
  lossy: boolean;
  intendedUse: string[];
}
```

Rules:

- a low-resolution preview/proxy SHALL never become the canonical source for a higher-quality master;
- lossy derivatives SHOULD not be repeatedly transcoded when a higher-quality ancestor is available;
- approved editorial decisions are separable from the bytes used to render a new delivery;
- master/derivative lineage SHALL support regenerating a new platform encode without repeating
  creative planning;
- archive packaging MAY include manifests/sidecars/receipts but follows canonical retention/storage
  ownership;
- source originals remain immutable under normal production edits.

---

# 111. Post-upload / Platform-transcode Verification

The file SmartAIHub uploads is not necessarily the file viewers finally see. External platforms may
transcode, crop, normalize audio, drop tracks or alter metadata.

When a publishing/platform owner can provide the resulting media or playback representation,
Spec 286 MAY perform a **post-publication/post-upload observation**.

```ts
interface PlatformTranscodeObservationV1 {
  platformRef: string;
  submittedDeliveryPackageRef: string;
  observedArtifactRef?: string;

  observations: {
    resolution?: string;
    fps?: string;
    audioLayout?: string;
    loudness?: number;
    cropChanged?: boolean;
    captionsPresent?: boolean;
    colorShiftSuspected?: boolean;
  };

  status:
    | 'MATCHES_EXPECTATION'
    | 'ACCEPTABLE_PLATFORM_TRANSFORM'
    | 'MATERIAL_DEGRADATION'
    | 'UNKNOWN';

  evidenceRefs: string[];
}
```

Rules:

- Spec 286 SHALL NOT claim successful publication or platform state unless confirmed by the canonical
  publishing integration;
- a platform-created derivative is evidence, not a replacement for the submitted master;
- material degradation MAY trigger a new recommended delivery profile/encode, not silent mutation of
  the already-published item;
- missing post-upload access is `UNKNOWN`, not PASS.

---

# 112. Subtitle Sidecar/Burn-in Parity & Cue Integrity

Subtitle systems MAY deliver:

```text
burned-in captions
SRT
VTT
ASS
platform-native caption upload
SDH
translated subtitle tracks
```

These outputs SHALL be traceable to a canonical cue set or explicitly documented transformation.

```ts
interface SubtitleParityAssessmentV1 {
  cueSetRef: string;
  variants: Array<{
    artifactRef: string;
    kind: 'BURN_IN'|'SRT'|'VTT'|'ASS'|'PLATFORM_NATIVE'|'SDH';
    locale: string;
  }>;

  findings: Array<{
    kind:
      | 'TEXT_MISMATCH'
      | 'TIMING_MISMATCH'
      | 'CUE_DROPPED'
      | 'CUE_OVERLAP'
      | 'READING_SPEED'
      | 'STYLE_ONLY_DIFFERENCE';
    evidenceRefs: string[];
  }>;

  status: 'PASS'|'WARN'|'FAIL'|'UNKNOWN';
}
```

Requirements:

- line wrapping/style differences MAY be intentional and shall not automatically count as semantic
  mismatch;
- caption text SHALL remain semantically aligned with narration/dialogue after final retiming;
- cue ordering/overlap SHALL be deterministic;
- sidecar and burn-in derived from different stale revisions SHALL fail package finalization;
- platform-native caption conversion SHALL preserve timing/meaning within declared tolerance;
- translated subtitles follow locale-specific segmentation/readability policy.

---

# 113. Scene/Character/Object Continuity Bible

Generative/video scenes can individually look good yet fail as a sequence because character,
product, costume, prop, UI or environment identity drifts.

Spec 286 SHALL support a production continuity projection.

```ts
interface VideoContinuityBibleV1 {
  productionId: string;

  entities: Array<{
    entityId: string;
    kind:
      | 'CHARACTER'
      | 'PRODUCT'
      | 'OBJECT'
      | 'COSTUME'
      | 'LOCATION'
      | 'UI'
      | 'BRAND_ELEMENT';

    canonicalReferenceRefs: string[];
    invariantTraits: Record<string, string | number | boolean>;
    allowedVariationRefs?: string[];
  }>;

  continuityEvents: Array<{
    sceneId: string;
    entityId: string;
    stateRef: string;
  }>;
}
```

Continuity review MAY detect:

```text
face/identity drift
product color/model change
logo geometry/text drift
costume/prop discontinuity
left/right position inversion
day/night/weather inconsistency
UI state regression
object disappearance/reappearance
state contradiction between scenes
```

Rules:

- intentional continuity breaks are allowed when explicitly described by story/scene state;
- the continuity bible is not a biometric identity authority;
- Film Studio character/shot canon remains owned by Spec 252; Spec 286 consumes/project it;
- Motion Studio product/UI continuity can use the same generic assessment surface.

---

# 114. Source Freshness & Product/UI Truth for Demo Videos

Product-launch and UI-demo videos can become misleading when they use stale screenshots or old
product behavior.

For source-grounded product/UI material, the production MAY record freshness.

```ts
interface VisualSourceFreshnessV1 {
  sourceRef: string;
  sourceKind: 'SCREENSHOT'|'SCREEN_RECORDING'|'FIGMA_EXPORT'|'WEB_CAPTURE'|'PRODUCT_ASSET'|'OTHER';
  observedAt?: string;
  productVersionRef?: string;
  environmentRef?: string;
  freshness:
    | 'CURRENT_VERIFIED'
    | 'CURRENT_ASSERTED'
    | 'STALE'
    | 'UNKNOWN';
}
```

Requirements:

- generated mock UI SHALL remain labeled as illustrative where accuracy matters;
- an old screenshot SHALL not be presented as the current product merely because it is visually
  attractive;
- product/version-sensitive claims SHOULD bind to a current source/evidence reference;
- source refresh SHOULD invalidate only dependent scenes/assets;
- user-provided explicit historical demo intent may intentionally use old UI if clearly represented.

---

# 115. Reference Similarity / Near-copy Guard

Reference-style extraction SHALL not become a mechanism for producing an almost frame-for-frame copy
of a protected commercial/reference video.

The runtime SHOULD be able to assess similarity risk using available evidence such as:

```text
shot order
timing pattern
layout geometry
distinctive title treatment
unique transition sequence
asset correspondence
camera path
color/typography combination
```

Possible result:

```text
LOW
MODERATE
HIGH
UNKNOWN
```

Rules:

- a high-similarity result SHOULD trigger re-direction toward abstract style attributes rather than
  preserve exact sequence/layout/timing;
- user-owned templates/reference productions MAY have broader reuse rights when provenance confirms
  ownership;
- similarity analysis is a risk/review aid, not a legal infringement determination;
- the system SHALL preserve reference provenance so a reviewer can understand what influenced the
  output;
- “make it exactly like this ad” SHALL not automatically waive licensing/copyright constraints.

---

# 116. Feedback Integrity, Ranking Abuse & Quality-metric Poisoning

Capability/provider ranking from Section 30 can be corrupted by noisy or malicious feedback.

Quality history SHALL distinguish:

```text
deterministic QC result
multimodal evaluator result
explicit human acceptance
manual override
delivery success
user rating
verified marketplace review
automated retry outcome
```

The platform SHOULD implement protections against:

- repeated self-rating;
- tenant/provider coordinated rating manipulation;
- low-sample overconfidence;
- evaluator/model version changes mixed into one historical score;
- incentive-driven marketplace review spam;
- duplicated runs inflating success counts;
- failures caused by bad user input being incorrectly attributed wholly to a provider.

```ts
interface CapabilityQualityEvidenceV1 {
  capabilityRef: string;
  providerRef: string;
  productionRef: string;
  evaluatorVersionRef?: string;
  evidenceKind: string;
  outcome: string;
  attributionClass:
    | 'PROVIDER'
    | 'INPUT'
    | 'POLICY'
    | 'INFRASTRUCTURE'
    | 'MIXED'
    | 'UNKNOWN';
  weightClass: 'LOW'|'NORMAL'|'HIGH_VERIFIED';
}
```

Ranking SHALL use confidence/sample-size-aware aggregation and MUST NOT override explicit user choice,
policy or provider eligibility.

---

# 117. R1.4 Acceptance Additions

The following scenarios are additive to A1–A36.

## A37 — 29.97 DF long-form timeline

A 45-minute program uses 29.97 drop-frame timecode plus 48 kHz external audio.

Expected:

- project timecode labels remain correct;
- audio/sample sync remains within declared tolerance;
- word/caption cues map correctly after edits.

## A38 — VFR phone clip mixed with CFR motion graphics

Expected:

- VFR source PTS measured;
- intentional conform/mapping recorded;
- no accumulated A/V drift;
- final CFR/VFR policy explicit.

## A39 — Visually correct file with poor seeking

Final MP4 looks correct but has unsuitable keyframe/GOP/moov structure.

Expected:

- delivery seekability check detects;
- only final encode/package stage reruns.

## A40 — SDH and audio-description delivery

Expected:

- dialogue captions and SDH distinguishable;
- non-speech cues included when required;
- AD track does not mask dialogue;
- exact accessibility artifacts included in finalized package.

## A41 — 5.1 source localized to stereo social version

Expected:

- explicit channel map/downmix;
- no missing dialogue;
- loudness/true peak checked;
- original multi-channel source/master preserved.

## A42 — Content-ID-prone music

Known track may trigger automated content claim on target platform.

Expected:

- risk surfaced;
- rights/territory/commercial-use evidence retained;
- user/policy can replace cue before delivery.

## A43 — Preview proxy accidentally chosen as master

Expected:

- lineage role check blocks upscaling proxy as authoritative master when a higher-quality ancestor
  exists.

## A44 — Platform transcode changes color/crop

Expected:

- platform observation marks material degradation or acceptable transform;
- submitted master/receipt remains immutable.

## A45 — Burn-in caption differs from VTT

Expected:

- subtitle parity FAIL when wording/timing differs materially;
- style-only line wrapping does not create false semantic failure.

## A46 — Character/product continuity drift

Scene 4 changes product color/logo or a character's defining appearance unintentionally.

Expected:

- continuity critic flags with scene evidence;
- targeted repair affects only dependent scene/take.

## A47 — Stale product screenshot

Website/UI source is older than the version represented by the script.

Expected:

- freshness state visible;
- system refreshes/replaces or labels historical/illustrative use according to policy.

## A48 — Near-copy reference sequence

Generated launch video reproduces reference shot order, timing and distinctive layout too closely.

Expected:

- similarity risk raised;
- system re-directs toward generalized visual grammar or requests review.

---

# 118. R1.4 Test Additions

Implementation SHALL add tests for:

```text
29.97/59.94 drop-frame label/frame mapping
VFR PTS to project-timebase mapping
audio sample-clock drift detection
caption/beat remapping after timewarp
GOP/keyframe/fast-start/seekability checks
independent segment decodability where applicable
SDH cue and non-speech event preservation
audio-description collision/mix checks
multi-channel channel-map and downmix fixtures
M&E stem exact-picture synchronization
music cue-sheet generation from final timeline
content-ID/territory rights projection handling
proxy/mezzanine/master lineage enforcement
avoidance of unnecessary lossy generation chaining
post-upload observation UNKNOWN-vs-PASS truthfulness
subtitle sidecar/burn-in parity checks
continuity-bible entity/state drift detection
source freshness/version invalidation
reference near-copy risk fixtures
quality-history duplicate/self-rating resistance
sample-size/confidence-aware provider ranking
failure-attribution classification
```

---

# 119. R1.4 Exit-criteria Additions

In addition to Sections 48, 66C, 85 and 103, production readiness requires:

61. Project/source/audio clock mappings handle CFR, VFR, drop-frame and sample-accurate sync.
62. Final delivery QC validates seekability/GOP/container behavior where the target profile requires
    it.
63. Accessibility profiles can produce/verify required captions, SDH, transcript and optional audio
    description/reduced-motion artifacts.
64. Multi-channel/stem output preserves declared channel layout and picture synchronization.
65. Music/SFX usage retains rights/cue provenance and can surface known content-ID/platform risk.
66. Proxy/review artifacts cannot silently become authoritative masters; derivative lineage is
    explicit.
67. Platform-transcode observations never fabricate PASS when external playback cannot be inspected.
68. Subtitle sidecars, burn-in and platform-native tracks can be checked for semantic/timing parity.
69. Multi-scene generative/product work has continuity checks for stable entities and intentional
    state change.
70. UI/product demo sources can expose freshness/version truth and avoid presenting stale/mock UI as
    current reality.
71. Reference-style extraction has a near-copy/similarity risk control.
72. Provider/capability quality ranking resists obvious feedback duplication/manipulation and
    preserves evidence attribution.

---

# 121. Production Decision Provenance Without Private Chain-of-thought Dependence

A production system must be explainable and reproducible enough to debug why a capability, provider,
layout, repair or delivery path was chosen. It SHALL NOT depend on storing a model's private
chain-of-thought.

The durable record SHALL capture **decision inputs, declared constraints, selected outcome and
versioned decision machinery**, not hidden reasoning tokens.

```ts
interface ProductionDecisionProvenanceV1 {
  decisionId: string;
  productionId: string;
  stageId?: string;

  decisionType:
    | 'CAPABILITY_SELECTION'
    | 'PROVIDER_SELECTION'
    | 'SCENE_STRATEGY'
    | 'REPAIR_SELECTION'
    | 'QUALITY_GATE'
    | 'PLACEMENT'
    | 'DELIVERY_PROFILE'
    | 'OTHER';

  inputArtifactDigests: string[];
  directorBriefRevisionRef?: string;
  applicablePolicySnapshotRef: string;
  skillReleaseRefs: string[];
  promptTemplateRefs?: string[];
  modelOrAgentVersionRefs: string[];
  evaluatorVersionRefs?: string[];

  candidateRefs: string[];
  selectedRef?: string;
  rejectedReasonCodes: string[];

  structuredRationale?: {
    goal: string;
    constraints: string[];
    evidenceRefs: string[];
    reasonCodes: string[];
  };

  createdAt: string;
}
```

Requirements:

- prompt/Skill/template versions SHALL be referenceable when they materially influenced the
  decision;
- sensitive raw prompts/context MAY be retained only under canonical privacy/retention policy;
- a compact structured rationale MAY be stored, but the system MUST NOT require hidden/private
  chain-of-thought as an audit primitive;
- a later operator SHALL be able to answer:
  `what inputs/rules/version/candidates led to this choice?`;
- evaluator outputs used to block/promote work SHALL retain their own versioned receipts;
- model upgrades SHALL not rewrite historical decision provenance.

---

# 122. Policy Epoch Snapshot, Mid-run Reauthorization & Long-running Production Safety

A production may run for minutes or hours while ACL, consent, budget, publication rules, provider
policy or tenant settings change.

Every material execution boundary SHALL bind to a policy epoch/snapshot.

```ts
interface ProductionPolicyEpochV1 {
  epochRef: string;
  productionId: string;

  projectAclVersionRef: string;
  tenantPolicyVersionRef: string;
  rightsPolicyVersionRef?: string;
  budgetPolicyVersionRef?: string;
  publicationPolicyVersionRef?: string;

  evaluatedAt: string;
  validUntil?: string;
}
```

Reauthorization SHALL occur at least before:

```text
new external egress
new paid provider invocation
generated-code execution
rights-sensitive reuse
final render promotion
final approval
delivery/publication handoff
resume after long suspension when policy freshness expired
```

Rules:

- a stage admitted under an old epoch does not permanently authorize all downstream stages;
- a restrictive policy change fences future mutation/egress according to canonical owner semantics;
- completed historical artifacts remain attributable to the policy epoch under which they were
  produced;
- policy refresh SHALL avoid needless full rerender when only downstream authorization changed;
- `permission revoked` SHALL NOT be reclassified as provider failure/fallback eligibility.

---

# 123. Content-safety, Moderation & Synthetic-likeness Handoff Boundary

Spec 286 is not the canonical content-safety/moderation authority, but video production SHALL expose
the correct checkpoints for existing/future canonical safety policy to act.

Potential review classes include:

```text
source intake
script/on-screen text
generated image/video
synthetic or modified likeness
voice synthesis
reference-derived content
final composite
public-delivery package
```

```ts
interface VideoSafetyReviewBindingV1 {
  productionId: string;
  subjectRef: string;
  subjectDigest?: string;
  reviewOwnerRef: string;
  reviewPolicyRef: string;
  status:
    | 'NOT_REQUIRED'
    | 'PENDING'
    | 'PASSED'
    | 'RESTRICTED'
    | 'BLOCKED'
    | 'UNKNOWN';
  evidenceReceiptRef?: string;
}
```

Requirements:

- safety/moderation review is bound to an exact artifact/revision where applicable;
- source review alone SHALL NOT imply that a materially transformed final composite is also reviewed;
- synthetic likeness/voice status SHALL retain consent/provenance references;
- a safety `BLOCKED` state cannot be bypassed by changing renderer/provider;
- creative critics SHALL not be used as a substitute for canonical safety policy;
- downstream products MAY consume safety receipts without duplicating the safety classifier/policy
  database.

---

# 124. Production SBOM, Runtime Dependency & License Attestation

Generated motion code is only one dependency risk. The full production runtime may include:

```text
renderer packages
browser/runtime
FFmpeg build/codecs
fonts
LUTs
plugins
ComfyUI/custom nodes
MCP providers
Python/Node/Rust packages
container images
generated components
model/checkpoint assets
```

A production-significant dependency snapshot SHOULD be expressible as:

```ts
interface VideoProductionSbomV1 {
  productionId: string;
  stageId?: string;

  components: Array<{
    kind:
      | 'PACKAGE'
      | 'BINARY'
      | 'CONTAINER'
      | 'FONT'
      | 'PLUGIN'
      | 'MODEL'
      | 'CHECKPOINT'
      | 'CUSTOM_NODE'
      | 'GENERATED_COMPONENT'
      | 'OTHER';
    name: string;
    version?: string;
    digest?: string;
    sourceRef?: string;
    licenseRef?: string;
    trustState?: 'TRUSTED'|'REVIEWED'|'UNKNOWN'|'BLOCKED';
  }>;

  vulnerabilityScanRef?: string;
  licenseAssessmentRef?: string;
  createdAt: string;
}
```

Requirements:

- dependency identity used for an approved final render SHALL be reconstructable enough for incident
  diagnosis;
- `unknown license` does not automatically mean redistribution is allowed;
- known blocked/revoked dependency versions SHALL be preventable through existing policy/placement
  controls;
- SBOM/provenance generation SHALL not itself become another package manager or vulnerability
  database;
- dependency security/license changes MAY invalidate future rerender/promotion without rewriting
  already-delivered history.

---

# 125. Scene/Stage Cost Attribution, Budget Variance & Economic Explainability

A production-level total cost is insufficient to explain why iterative work became expensive.

The runtime SHALL be able to attribute cost to meaningful production units.

```ts
interface VideoProductionCostAttributionV1 {
  productionId: string;
  stageCosts: Array<{
    stageId: string;
    sceneId?: string;
    capabilityRef?: string;
    providerRef?: string;

    quotedAmount?: number;
    reservedAmount?: number;
    settledAmount?: number;
    currencyOrCreditUnit: string;

    cause:
      | 'INITIAL'
      | 'USER_CHANGE'
      | 'QUALITY_REPAIR'
      | 'PROVIDER_RETRY'
      | 'INFRA_RETRY'
      | 'FALLBACK'
      | 'FINAL_DELIVERY'
      | 'OTHER';

    chargeable: boolean;
    billingReceiptRefs: string[];
  }>;

  totalRef: string;
}
```

Requirements:

- retries caused by infrastructure/provider failure SHALL remain distinguishable from user-requested
  creative changes;
- quality-repair loops SHALL expose incremental cost before exceeding a configured budget boundary;
- no local bookkeeping in Spec 286 replaces canonical billing/settlement authority;
- UI MAY explain:
  `scene 4 used 38% of generation cost due to three authorized repair attempts`;
- cache reuse SHOULD be reflected as avoided/reduced compute where available;
- cost optimization SHALL not silently lower an already-approved quality profile.

---

# 126. Derived-data Hygiene — Indexes, Embeddings, Features & Analysis Artifacts

Deleting/restricting source media requires more than deleting visible files.

Derived data MAY include:

```text
Vectorize/search entries
embeddings
feature vectors
scene descriptors
transcripts
OCR
contact-sheet thumbnails
style descriptors
face/voice feature outputs where permitted
quality-evaluation features
cache keys/materialized metadata
```

Spec 286 SHALL expose a dependency classification so canonical privacy/retention systems can govern
these derivatives.

```ts
interface VideoDerivedDataRefV1 {
  sourceArtifactRef: string;
  derivedRef: string;
  kind:
    | 'INDEX_ENTRY'
    | 'EMBEDDING'
    | 'TRANSCRIPT'
    | 'OCR'
    | 'STYLE_DESCRIPTOR'
    | 'VISUAL_FEATURE'
    | 'AUDIO_FEATURE'
    | 'THUMBNAIL'
    | 'CACHE_METADATA'
    | 'OTHER';
  reconstructiveRisk: 'LOW'|'MEDIUM'|'HIGH'|'UNKNOWN';
  storageOwnerRef: string;
}
```

Requirements:

- restricted/deleted source SHALL not remain semantically searchable through a stale derived index
  when canonical policy requires removal;
- cache invalidation SHALL include derived metadata capable of rediscovering restricted content;
- derived indexes are never source of truth;
- purge/restriction events SHALL be observable/retryable;
- index cleanup SHALL not silently delete unrelated tenant/project data;
- minimal non-reconstructive audit digests MAY remain only under canonical retention policy.

---

# 127. End-to-end Causal Trace & Production Incident Correlation

`worker_jobs`, render receipts, provider requests, critic findings and repair loops form one causal
production chain.

Every non-trivial production SHOULD expose one trace/correlation context.

```ts
interface VideoProductionTraceContextV1 {
  productionId: string;
  traceId: string;
  rootGoalRef: string;

  spans: Array<{
    spanId: string;
    parentSpanId?: string;
    kind:
      | 'PLAN'
      | 'JOB'
      | 'PROVIDER'
      | 'RENDER'
      | 'UPLOAD'
      | 'QC'
      | 'CRITIC'
      | 'REPAIR'
      | 'DELIVERY';
    ownerRef: string;
    startedAt: string;
    endedAt?: string;
    status: string;
    receiptRefs: string[];
  }>;
}
```

Requirements:

- trace IDs/correlation SHALL bridge existing owners rather than create a new scheduler;
- operators SHALL be able to distinguish:
  renderer failure, provider timeout, storage failure, critic rejection, policy block and user
  cancellation;
- repeated failures across many productions SHOULD be correlatable by provider/runtime/version;
- traces SHALL avoid storing raw sensitive media/prompt content by default;
- user-facing Task Control MAY project a simplified trace without exposing internal implementation
  noise.

---

# 128. Provider Circuit Breaker, Quarantine & Failure Blast-radius Control

Retries and fallback are insufficient when a provider/runtime version is systemically bad.

The platform SHALL support a provider health signal usable by existing routing/placement authorities.

```ts
interface VideoProviderHealthSignalV1 {
  providerOfferRef: string;
  observedVersionRef?: string;

  state:
    | 'HEALTHY'
    | 'DEGRADED'
    | 'CIRCUIT_OPEN'
    | 'QUARANTINED'
    | 'UNKNOWN';

  reasonCodes: string[];
  evidenceRefs: string[];
  observedAt: string;
  retryAfter?: string;
}
```

Possible triggers:

```text
high technical failure rate
corrupt outputs
schema drift
systematic black frames
severe quality regression
security incident
wrong billing behavior
rights/policy breach
repeated timeout/resource exhaustion
```

Rules:

- Spec 286 emits/consumes health evidence but routing/quarantine authority remains with canonical
  platform owners;
- circuit-open state SHALL prevent blind retry storms;
- quarantining one provider/version SHALL not disable semantically unrelated providers;
- a provider may recover through qualification/canary flow;
- security/policy quarantine cannot be overridden by ordinary quality preference.

---

# 129. Customer-data Use, Evaluation Corpus & Cross-tenant Learning Boundary

Production artifacts, prompts, accepted/rejected renders and human corrections can be highly valuable
training/evaluation data. They SHALL NOT silently become a shared cross-tenant corpus.

The system SHALL classify data use separately from ordinary production access.

```ts
interface VideoDataUsePolicyBindingV1 {
  productionId: string;
  allowedUses: Array<
    | 'PRODUCTION_EXECUTION'
    | 'TENANT_LOCAL_QUALITY_HISTORY'
    | 'USER_PERSONAL_REUSE'
    | 'AGGREGATED_TELEMETRY'
    | 'EVALUATION_CORPUS'
    | 'MODEL_TRAINING'
    | 'MARKETPLACE_EXAMPLE'
  >;
  policyRef: string;
  consentRef?: string;
}
```

Requirements:

- permission to render does not imply permission to train;
- one tenant's private output SHALL not become another tenant's reference/example unless authorized;
- benchmark/holdout corpora SHALL record data-use eligibility;
- aggregated telemetry SHOULD minimize/reduce reconstructive content;
- user corrections MAY improve that user's/tenant's production history under policy without
  automatically becoming global training data;
- removing training/evaluation eligibility SHALL propagate to future corpus assembly under canonical
  data governance.

---

# 130. Plan Simulation, Change-impact Forecast & Preflight Before Expensive Mutation

Before an expensive or wide-impact repair, the runtime SHOULD be able to simulate affected stages
without executing them.

```ts
interface VideoProductionImpactPlanV1 {
  productionId: string;
  baseRevisionRef: string;
  proposedOperations: string[];

  invalidatedStageRefs: string[];
  reusableStageRefs: string[];
  affectedApprovalRefs: string[];
  affectedRightsChecks: string[];
  expectedProviderCalls: string[];
  estimatedCostRef?: string;
  estimatedRuntimeClass?: string;

  riskFlags: string[];
}
```

Examples:

```text
change caption color
→ subtitle/composite/QC only

replace narration
→ timing/caption/audio mix + affected visual timing

replace hero product image
→ dependent scenes + final compositing/QC

change one approved claim
→ script/narration/caption/on-screen text/semantic QC for affected range
```

Requirements:

- preflight SHALL use revision-fenced current state;
- unknown dependency edges SHALL widen the invalidation set rather than assume reuse is safe;
- simulation does not grant execution authority;
- the UI MAY show impact/cost before user confirms a material edit;
- preview/dry-run output SHALL be machine-readable for agent planning.

---

# 131. Quality-confidence Escalation & Human-review Sampling

A numeric creative score does not imply calibrated certainty.

Critical acceptance SHALL consider both score and confidence/evidence coverage.

```ts
interface VideoReviewEscalationV1 {
  candidateRef: string;

  score?: number;
  confidence?: number;
  coverageRef?: string;

  escalationReasonCodes: Array<
    | 'LOW_CONFIDENCE'
    | 'CRITIC_DISAGREEMENT'
    | 'OUT_OF_DISTRIBUTION'
    | 'HIGH_RISK_DOMAIN'
    | 'NEW_PROVIDER_VERSION'
    | 'NEW_LANGUAGE'
    | 'SPARSE_EVIDENCE'
    | 'RANDOM_AUDIT_SAMPLE'
  >;

  requiredReview:
    | 'NONE'
    | 'SECOND_CRITIC'
    | 'HUMAN_CREATIVE_REVIEW'
    | 'DOMAIN_REVIEW';
}
```

Requirements:

- low-confidence `8.7/10` SHALL NOT automatically outrank a high-confidence `8.4/10`;
- newly introduced provider/model/style/language combinations MAY receive increased sampling;
- human-review sampling SHOULD detect evaluator drift that aggregate self-scores miss;
- high-risk domain review uses the appropriate existing domain authority;
- random audit samples SHOULD be bounded and privacy-aware;
- acceptance policy remains configurable by production profile.

---

# 132. Timeline Interchange & Round-trip Conformance

Video Editor integration requires more than exporting a file that another editor can open.

For supported interchange formats/adapters such as OTIO, FCPXML, EDL or product-native handoff, the
system SHALL define what semantics are preserved.

```ts
interface TimelineRoundtripReportV1 {
  sourceTimelineRef: string;
  exportedArtifactRef: string;
  reimportedTimelineRef?: string;

  preserved: string[];
  approximated: string[];
  dropped: string[];

  timingDriftFrames?: number;
  unsupportedFeatureRefs: string[];

  status:
    | 'LOSSLESS_FOR_SUPPORTED_FEATURES'
    | 'LOSSY_DECLARED'
    | 'FAILED'
    | 'UNKNOWN';
}
```

Conformance dimensions MAY include:

```text
clip in/out
track order
transitions
speed changes
caption cues
markers
audio channel/stem placement
nested sequences
effects
keyframes
color references
asset relinking
frame-rate/timecode semantics
```

Requirements:

- unsupported editor semantics SHALL be declared, never silently dropped;
- a round-trip that changes timing beyond tolerance SHALL not be described as lossless;
- manual locks/provenance from Video Editor SHALL map back where the supported adapter permits it;
- interchange export SHALL not become a second canonical timeline authority;
- the original canonical source timeline/revision remains unchanged until explicit import/apply.

---

# 133. R1.5 Acceptance Additions

The following scenarios are additive to A1–A48.

## A49 — Explain why one provider was selected

Expected:

- operator can resolve selected capability/provider to input constraints, applicable policy,
  Skill/template/model versions and structured reason codes;
- no hidden chain-of-thought is required.

## A50 — Permission changes during a six-hour production

Expected:

- downstream paid/external stage reauthorizes against current policy epoch;
- revoked egress is fenced;
- completed local artifacts remain historically attributable.

## A51 — Final composite requires canonical safety re-review

Source inputs passed intake review, but a materially transformed final output requires another
policy checkpoint.

Expected:

- final artifact-bound review status evaluated;
- provider switch cannot bypass a block.

## A52 — Vulnerable renderer dependency discovered

Expected:

- affected renderer/runtime version identifiable through production SBOM/environment receipt;
- future rerender can quarantine version without rewriting old receipt history.

## A53 — Repair loop unexpectedly doubles cost

Expected:

- incremental scene/stage repair cost attributable;
- budget boundary stops/requests authorization according to policy;
- provider/infra retry cost is distinguishable from creative user changes.

## A54 — Privacy deletion leaves Vectorize/search hit

Expected:

- stale derived index/reference is identified and removed/restricted through canonical owner;
- source remains undiscoverable according to policy after cleanup.

## A55 — Systemic provider starts returning black frames

Expected:

- failures correlate across traces;
- provider health degrades/circuit opens through canonical routing owner;
- no blind retry storm.

## A56 — Private customer video proposed for global benchmark

Expected:

- data-use policy blocks benchmark/training inclusion unless authorized;
- normal production permission is insufficient.

## A57 — User changes only caption color

Expected preflight:

- no ASR/TTS/generative video rerun;
- affected composite/QC stages identified;
- estimated cost/impact visible before execution where applicable.

## A58 — Critic score high but confidence low

Expected:

- second critic/human sampling triggered by profile;
- no automatic final acceptance solely from scalar score.

## A59 — External editor round-trip drops speed ramp

Expected:

- export/reimport report identifies unsupported/lost semantic;
- result is `LOSSY_DECLARED` or failed, never called lossless.

## A60 — Safety/policy block mistaken for provider outage

Expected:

- causal trace and error classification preserve `POLICY_BLOCK`;
- no provider fallback attempts to bypass it.

---

# 134. R1.5 Test Additions

Implementation SHALL add tests for:

```text
decision provenance resolves exact Skill/prompt-template/model/evaluator versions
structured rationale works without hidden chain-of-thought storage
policy epoch revalidation on long-running resume
permission revocation fences new external egress
artifact-bound safety review handoff
provider fallback cannot bypass moderation/safety block
production SBOM captures renderer/font/plugin/model dependencies
blocked dependency prevents future qualifying render
per-scene/stage cost attribution and retry-cause classification
budget variance/repair-loop threshold behavior
derived Vectorize/search/cache cleanup after restriction
cross-tenant derived-index deletion isolation
end-to-end causal trace across worker_job/provider/QC/repair/delivery
provider circuit breaker avoids retry storm
provider requalification after quarantine
data-use policy blocks unauthorized training/evaluation reuse
tenant-local quality history does not imply global corpus eligibility
change-impact plan invalidation accuracy
unknown dependency widens rerun safely
low-confidence high-score review escalation
new-provider/language random review sampling
OTIO/FCPXML/EDL/native adapter supported-feature round-trip fixtures
timeline timing drift tolerance and unsupported-feature declaration
```

---

# 135. R1.5 Exit-criteria Additions

In addition to all prior production-readiness criteria:

73. Material production decisions are explainable from versioned inputs, constraints, evidence and
    selected outcome without requiring stored private chain-of-thought.
74. Long-running work revalidates authorization/policy at material downstream boundaries.
75. Canonical safety/moderation blocks bind to exact artifacts/revisions and cannot be bypassed by
    renderer/provider fallback.
76. Approved final renders can identify production-significant dependency/runtime versions and
    license/security attestations where applicable.
77. Cost can be attributed to stages/scenes/repair causes without creating a parallel billing
    ledger.
78. Privacy/rights restriction can propagate to derived search/index/feature artifacts rather than
    only visible media files.
79. Operators can causally trace a production across plan, job, provider, render, QC, critic, repair
    and delivery boundaries.
80. Repeated systemic provider failures can be circuit-broken/quarantined without disabling
    unrelated capability offers.
81. Private production artifacts/corrections do not become shared training/evaluation/marketplace
    data without explicit applicable authorization.
82. Expensive/material edits can produce a revision-fenced impact/invalidation preflight before
    execution.
83. Creative acceptance considers confidence/coverage and supports calibrated escalation/human
    sampling.
84. Supported timeline interchange formats report preserved, approximated and lost semantics and do
    not call a lossy round-trip lossless.

---

# 137. Immutable Source Snapshot Binding & Remote-source Drift Control

A remote URL, website, Figma/design source, cloud file, API response or mutable Library pointer may
change after planning. A production SHALL NOT silently render against different source bytes while
claiming it executed the approved plan.

The runtime SHALL distinguish:

```text
SOURCE LOCATOR
    = where content may currently be fetched

SOURCE SNAPSHOT
    = exact bytes/revision/content state admitted into a production

SOURCE FRESHNESS
    = whether that snapshot still represents the intended current source
```

```ts
interface ProductionSourceSnapshotV1 {
  snapshotId: string;
  productionId: string;

  sourceKind:
    | 'LIBRARY_ASSET'
    | 'REMOTE_URL'
    | 'WEB_CAPTURE'
    | 'FIGMA_EXPORT'
    | 'API_RESPONSE'
    | 'CONNECTED_DOCUMENT'
    | 'LOCAL_FILE'
    | 'OTHER';

  locatorRef?: string;
  externalVersionRef?: string;
  capturedAt: string;

  artifactRef: string;
  contentDigest: string;
  mimeType?: string;
  byteLength?: number;

  rightsSnapshotRef?: string;
  privacyClassificationRef?: string;
  freshnessRef?: string;
}
```

Requirements:

- material planning/rendering SHALL bind to an immutable snapshot or exact provider revision;
- refetching a URL SHALL produce a new snapshot when bytes/version changed;
- an approved source snapshot SHALL NOT be silently replaced merely because the remote origin is
  "newer";
- when the user asks for "latest/current UI", source freshness MAY trigger refresh/replan before
  render;
- network/provider cache behavior SHALL not alter the admitted source identity;
- source snapshot lineage SHALL survive delivery receipts;
- external source disappearance after snapshot does not erase historical provenance;
- a mutable locator is never sufficient as the only reproducibility reference.

---

# 138. Partial-rerender Handles, Patch-boundary Continuity & Seam QC

Targeted repair is valuable only if re-rendered ranges join cleanly with preserved ranges.

Every partial render/composite operation SHALL declare temporal handles when needed.

```ts
interface PartialRenderWindowV1 {
  requestedStart: RationalTimeV1;
  requestedEnd: RationalTimeV1;

  renderStart: RationalTimeV1;
  renderEnd: RationalTimeV1;

  preHandleFrames: number;
  postHandleFrames: number;

  transitionRefs: string[];
  audioCrossfadeRefs?: string[];
  stateWarmupRef?: string;
}
```

The runtime SHALL account for effects whose visible/audio state depends on earlier/later time:

```text
transition overlap
spring/inertia animation
particle history
motion blur
temporal denoise/interpolation
audio reverb/tails
music crossfade
caption transition
camera easing
generative continuation
```

Seam verification SHALL compare at least:

- last preserved frames before patch;
- first patched frames;
- last patched frames;
- first preserved frames after patch;
- audio continuity around both boundaries;
- color/exposure continuity where applicable;
- entity/continuity state across the boundary.

Possible seam findings:

```text
FRAME_JUMP
AUDIO_CLICK
LOUDNESS_STEP
COLOR_STEP
MOTION_DISCONTINUITY
TRANSITION_TRUNCATED
CAPTION_POP
ENTITY_STATE_MISMATCH
UNKNOWN
```

A scene-only repair SHALL NOT be promoted merely because the repaired scene itself scores well.

---

# 139. Reversible Edit Journal, Undo/Redo & Production Restore Points

Immutable revisions exist, but users also need a predictable reversible-edit model across Chat,
Motion Studio and Video Editor.

The runtime SHALL expose logical production operations rather than treating "undo" as an inverse
free-text prompt.

```ts
interface VideoEditJournalEntryV1 {
  operationId: string;
  productionId: string;

  baseRevisionRef: string;
  resultRevisionRef: string;

  actorRef: string;
  origin: 'CHAT'|'MOTION_STUDIO'|'FILM_STUDIO'|'VIDEO_EDITOR'|'AGENT'|'API';

  operationKind: string;
  operationPayloadRef: string;

  reversible:
    | 'EXACT'
    | 'RESTORE_PRIOR_REVISION'
    | 'REQUIRES_RECOMPUTE'
    | 'NOT_REVERSIBLE';

  affectedArtifactRefs: string[];
  createdAt: string;
}
```

Restore points SHOULD be created around material operations such as:

```text
script approval
storyboard approval
major scene recompose
provider/model switch
manual Video Editor session
generated-motion promotion/use
final candidate approval
```

Rules:

- undo creates or selects a new current revision; it does not erase history;
- an undo SHALL preserve billing/audit receipts for work already performed;
- reverting a creative decision does not imply external publication retraction;
- redo is valid only when referenced source/policy/right state is still admissible;
- restoration MAY reuse prior artifacts only after current authorization/right/policy checks;
- branch merge history remains traceable after restore.

---

# 140. Distributed Schema Version Negotiation & Mixed-runtime Compatibility

SmartAIHub video execution may span browser, server, Windows/macOS/Linux Runner, Cloudflare
Container/Sandbox, external MCP provider and long-lived execution sessions. Those runtimes may not
upgrade atomically.

Every cross-runtime contract SHALL support explicit version negotiation.

```ts
interface VideoRuntimeContractHandshakeV1 {
  runtimeRef: string;

  supportedManifestVersions: string[];
  supportedCapabilityContractVersions: string[];
  supportedReceiptVersions: string[];

  supportedFeatureRefs: string[];
  deprecatedFeatureRefs: string[];

  minCompatibleCoordinatorVersion?: string;
  observedAt: string;
}
```

Dispatch rules:

```text
Coordinator plan
    ↓
required contract/features
    ↓
runtime handshake
    ↓
COMPATIBLE
COMPATIBLE_WITH_DOWNGRADE
INCOMPATIBLE
STALE
UNKNOWN
```

Requirements:

- an older Runner SHALL NOT silently ignore a field that materially changes rendering/security;
- additive unknown descriptive fields MAY be tolerated only when contract rules explicitly allow it;
- a downgrade path SHALL state what fidelity/functionality is lost;
- generated code/security policy versions SHALL be treated as material compatibility requirements;
- resumed long-running sessions SHALL re-handshake after coordinator/runtime upgrade when needed;
- schema migration SHALL be explicit and testable, not "best effort JSON parsing";
- legacy Spec 133 projects remain readable through adapters even when Spec 286 features are disabled.

---

# 141. Data-driven Graphics, Numeric Fidelity & Chart Animation Contract

Data/infographic motion can be visually polished while representing the wrong number, unit, scale or
comparison.

Data-driven scenes SHALL bind visual values to an explicit data snapshot.

```ts
interface DataGraphicBindingV1 {
  graphicId: string;
  productionId: string;

  dataSnapshotRef: string;
  sourceEvidenceRefs: string[];

  fields: Array<{
    semanticKey: string;
    sourceFieldRef: string;
    value: number | string;
    unit?: string;
    displayFormatRef?: string;
  }>;

  chartSpecRef: string;
  visualEncodingRef: string;
  animationSpecRef?: string;
}
```

Deterministic checks SHOULD include where applicable:

```text
displayed number == bound value after declared rounding
unit/denominator preserved
axis range/tick meaning
bar/line/area geometry corresponds to data
sort/order preserved or declared
percentages sum/relate correctly when applicable
negative values not visually inverted
log/linear scale declared
baseline truncation risk surfaced
time-series ordering preserved
animation interpolation does not fabricate intermediate claims
```

Rules:

- a creative agent MAY choose chart style but SHALL NOT invent source values;
- number-counter animation SHALL converge to the exact approved final value;
- charts derived from changing external data use the admitted source snapshot from Section 137;
- semantic-fidelity FAIL outranks visual-quality PASS;
- deliberate illustrative/non-data-proportional graphics SHALL be labeled as illustrative rather
  than represented as quantitative charts.

---

# 142. Pronunciation Lexicon, Named Entities & TTS Linguistic Fidelity

Correct text does not guarantee correct narration. TTS may mispronounce personal names, brands,
acronyms, Thai words, mixed-language phrases, technical terms or numbers.

A production MAY maintain a scoped pronunciation lexicon.

```ts
interface ProductionPronunciationLexiconV1 {
  lexiconId: string;
  productionId: string;
  locale: string;

  entries: Array<{
    writtenForm: string;
    normalizedForm?: string;
    spokenForm?: string;
    phonemeForm?: string;
    alphabet?: 'IPA'|'XSAMPA'|'PROVIDER_NATIVE'|'OTHER';
    languageHint?: string;
    source: 'USER'|'BRAND_KIT'|'GLOSSARY'|'APPROVED_AI_PROPOSAL';
    locked: boolean;
  }>;
}
```

Requirements:

- user/brand-approved pronunciations override generic model preference;
- lexicon application SHALL be provider-adapted without changing canonical written captions;
- TTS QA SHOULD detect obvious mismatch for critical named entities where a comparison method is
  available;
- pronunciation fixes SHALL regenerate only affected narration/audio timing and dependent stages;
- spelled acronyms, dates, decimals, currencies and mixed Thai/English tokens MAY require explicit
  speaking rules;
- locale-specific spoken expansion SHALL not silently alter on-screen factual text;
- voice cloning/consent remains governed by Spec 247/current canonical owner.

---

# 143. Provider Cancellation Acknowledgement, Late Completion & Charge Reconciliation

A local job can be stopped immediately while an external media provider may be non-cancellable,
best-effort cancellable or already executing.

Cancellation SHALL model provider reality explicitly.

```ts
interface ProviderCancellationReceiptV1 {
  requestId: string;
  providerExecutionRef: string;

  requestedAt: string;
  providerStateAtRequest?: string;

  outcome:
    | 'CANCEL_CONFIRMED'
    | 'CANCEL_REQUEST_ACCEPTED'
    | 'TOO_LATE'
    | 'NOT_SUPPORTED'
    | 'UNKNOWN';

  chargeState:
    | 'NO_CHARGE_EXPECTED'
    | 'PARTIAL_CHARGE_POSSIBLE'
    | 'FULL_CHARGE_POSSIBLE'
    | 'SETTLEMENT_PENDING'
    | 'SETTLED';

  providerReceiptRefs: string[];
}
```

Requirements:

- SmartAIHub SHALL not tell the user an external generation was cancelled when only a request was
  sent;
- a late provider completion after local cancellation SHALL be recorded as a late artifact and SHALL
  NOT automatically become current/approved;
- late artifacts MAY be retained/reused only according to rights, billing and policy;
- settlement/refund authority remains canonical billing infrastructure;
- cancellation retries SHALL be idempotent;
- provider offer metadata SHOULD declare cancellation semantics before dispatch where known;
- cancellation uncertainty SHALL not produce duplicate replacement generations without budget/race
  safeguards.

---

# 144. Cover, Thumbnail, Poster Frame, First-frame & Loop-boundary Assets

For Shorts/Reels/social/product launch, the first visible frame, cover image and loop boundary may
materially affect usability even when the main timeline is excellent.

These SHALL be representable as first-class delivery artifacts.

```ts
interface VideoPresentationAssetsV1 {
  productionId: string;

  thumbnailRefs: string[];
  coverRefs: string[];
  posterFrameRef?: string;

  firstFrameAssessmentRef?: string;
  lastFrameAssessmentRef?: string;
  loopBoundaryAssessmentRef?: string;

  platformVariants: Array<{
    platformRef: string;
    selectedCoverRef?: string;
    selectedPosterRef?: string;
  }>;
}
```

Checks MAY include:

```text
subject/title readable at thumbnail scale
cover safe area
no accidental transition/motion-blur frame selected
brand consistency
platform crop resilience
first frame not black/blank
poster frame representative of content
last→first loop visual/audio discontinuity for looping formats
```

A cover/thumbnail generated from a video SHALL retain exact source frame/revision provenance.

The thumbnail/cover subsystem MUST NOT become a second generic image-design product; it consumes
existing approved image/design capabilities.

---

# 145. Review-action Fencing Across Devices, Sessions & Stale UI

A user may open the same production on desktop, phone and multiple browser tabs. An old review card
must not approve or repair a newer candidate accidentally.

Every mutating review action SHALL bind at least:

```ts
interface VideoReviewActionBindingV1 {
  actionBindingId: string;

  productionId: string;
  candidateRef: string;
  candidateDigest: string;
  productionRevisionRef: string;

  issueLedgerRevisionRef?: string;
  policyEpochRef: string;

  actorRef: string;
  expiresAt: string;
}
```

Server-side apply SHALL revalidate:

```text
actor authorization
current candidate/revision
artifact digest
issue state
policy epoch
approval state
budget/effect requirements
```

Possible stale outcomes:

```text
STALE_CANDIDATE
STALE_ISSUE
REVISION_MOVED
POLICY_CHANGED
ALREADY_RESOLVED
ACTION_EXPIRED
```

Rules:

- stale action returns a refreshed comparison/action surface rather than silently applying;
- UI optimistic updates SHALL not constitute canonical success;
- duplicate taps/messages use idempotency;
- reconnecting a suspended mobile session does not restore expired mutation authority;
- read-only review of historical versions remains possible when authorized.

---

# 146. Production Context Projection Completeness & Constraint Coverage

An agent may produce poor output not because the renderer lacks capability, but because the decision
context omitted a critical user lock, brand rule, approved claim, aspect constraint or prior
decision.

Before material planning/repair, the runtime SHALL assemble a bounded **Production Context
Projection** from canonical state.

```ts
interface VideoProductionContextProjectionV1 {
  productionId: string;
  baseRevisionRef: string;

  goalRef: string;
  directorBriefRef?: string;

  lockedConstraintRefs: string[];
  brandRuleRefs: string[];
  approvedClaimRefs: string[];
  rightsConstraintRefs: string[];
  continuityRefs: string[];
  aspectLocaleVariantRefs: string[];
  currentBestCandidateRef?: string;

  unresolvedIssueRefs: string[];
  relevantArtifactRefs: string[];
  relevantDecisionRefs: string[];

  omittedCategories: Array<{
    category: string;
    reason: 'NOT_RELEVANT'|'NOT_AUTHORIZED'|'SIZE_LIMIT'|'UNAVAILABLE';
  }>;

  projectionDigest: string;
}
```

Requirements:

- context projection is derived from canonical production/project state, not only chat history;
- a user lock cannot be omitted merely to fit model context;
- when context must be compacted, stable IDs/digests and critical constraints SHALL remain;
- the agent SHALL be able to retrieve additional referenced detail on demand through authorized
  capability paths;
- `NOT_AUTHORIZED` data is not replaced with guessed content;
- decision provenance SHALL record the projection digest used;
- a repair based on an outdated projection is stale and SHALL replan/revalidate.

---

# 147. Canonical Artifact Commit, Object-store/Database Consistency & Orphan Reconciliation

Video artifacts are often written to object storage while metadata/revisions live in PostgreSQL or
another canonical SoR. Partial failure can leave:

```text
DB record → missing object
object exists → no committed DB record
temporary upload → never finalized
receipt references digest → upload incomplete
```

Artifact publication into canonical production state SHALL use an explicit commit protocol.

Conceptually:

```text
1. create pending artifact intent
2. write to temporary/staging object location
3. verify size/digest/media probe
4. atomically commit metadata/revision reference
5. promote/finalize object visibility
6. emit committed receipt
```

Exact implementation MAY differ according to current storage architecture, but required states SHALL
be distinguishable:

```text
PENDING
UPLOADED_UNVERIFIED
VERIFIED
COMMITTED
ORPHANED
MISSING
QUARANTINED
PURGED
```

Requirements:

- canonical project state SHALL not reference an unverified incomplete artifact as final;
- retries use content/idempotency identity and SHALL avoid duplicate charge/artifact explosion;
- reconciliation jobs MAY discover orphaned objects and missing bytes;
- orphan cleanup obeys retention/audit policy;
- R2/object-store temporary URLs are not canonical artifact identity;
- object existence alone does not grant tenant/project access;
- a committed receipt SHALL contain the verified digest used by downstream approvals/QC.

---

# 148. Portable Production Archive, Restore & Dependency Rehydration

Long-term work should not become unrecoverable merely because a specific Runner cache, provider
session, local path or old UI disappears.

A production MAY export a **Portable Production Archive** subject to rights/privacy policy.

```ts
interface PortableVideoProductionArchiveV1 {
  archiveVersion: string;
  productionId: string;
  canonicalRevisionRef: string;

  manifestRef: string;
  includedArtifactRefs: string[];
  externalDependencyRefs: string[];

  rendererDependencySnapshotRef: string;
  fontAssetRefs: string[];
  templateComponentRefs: string[];

  receiptRefs: string[];
  policyDisclosureRef: string;

  portabilityStatus:
    | 'SELF_CONTAINED'
    | 'REQUIRES_EXTERNAL_PROVIDERS'
    | 'REQUIRES_MISSING_LICENSED_ASSETS'
    | 'PARTIAL';
}
```

Archive requirements:

- include only assets the user is authorized to export;
- proprietary Marketplace Skills/providers MAY be referenced rather than embedded;
- licensed fonts/media follow Section 99 export/embedding rights;
- secrets/API keys/tokens SHALL NOT be embedded;
- restore SHALL verify digests and schema compatibility;
- unavailable external provider does not corrupt the archive; capability gaps are surfaced;
- derived caches/indexes need not be exported when rebuildable;
- archive import creates/reconciles a new authorized local/canonical production instance rather than
  spoofing ownership IDs;
- archive portability does not imply the ability to exactly reproduce nondeterministic generative
  outputs without provider/model availability.

---

# 149. R1.6 Acceptance Additions

The following scenarios are additive to A1–A60.

## A61 — Website changes after storyboard approval

Expected:

- approved storyboard/render remains bound to original source snapshot;
- current-site refresh produces a new snapshot and explicit replan when requested;
- no silent content drift.

## A62 — Scene-only repair causes transition jump

Expected:

- pre/post render handles included;
- seam QC sees adjacent preserved ranges;
- patched scene is not promoted until transition/audio continuity passes.

## A63 — User says "undo the last three AI changes"

Expected:

- operation journal resolves exact prior revision/operations;
- current state moves reversibly without deleting history/receipts;
- already incurred billing history remains intact.

## A64 — Old Windows Runner receives new manifest field

The field changes generated-code security semantics.

Expected:

- handshake returns incompatible or explicit downgrade;
- field is not silently ignored;
- job moves to eligible runtime or blocks.

## A65 — Animated chart ends on wrong number

Expected:

- data binding/numeric QC detects mismatch despite attractive design;
- creative score cannot override numeric failure.

## A66 — Thai TTS mispronounces product/person name

Expected:

- approved pronunciation lexicon applied;
- only affected narration/timing-dependent stages rerender;
- written caption remains canonically correct.

## A67 — Provider cancellation returns too-late

Expected:

- UI shows truthful cancellation state;
- late completion does not become current automatically;
- settlement state reconciles before replacement spending exceeds policy.

## A68 — Reel starts with accidental black frame

Expected:

- first-frame/poster checks detect;
- delivery candidate is repaired or cover/poster explicitly chosen.

## A69 — Old phone approval card approves newer desktop candidate

Expected:

- server returns stale-candidate/revision result;
- no approval is attached to the newer digest.

## A70 — Critic forgets user-locked asymmetrical layout after context compaction

Expected:

- Production Context Projection retains lock;
- decision provenance records projection digest;
- proposed repair cannot silently remove locked composition.

## A71 — R2 upload succeeds but DB commit fails

Expected:

- object remains pending/orphaned rather than final;
- reconciliation safely retries/cleans according to policy;
- project never references incomplete unverified artifact.

## A72 — Production restored a year later on a different machine

Expected:

- archive validates manifest/artifacts/dependencies;
- missing proprietary/provider dependencies reported explicitly;
- no secrets embedded;
- deterministic pieces can be rehydrated where compatible.

---

# 150. R1.6 Test Additions

Implementation SHALL add tests for:

```text
remote source locator changes without snapshot mutation
same URL / different digest creates new source snapshot
partial-render pre/post handle computation
transition/audio/color seam detection
journal undo/restore across Chat and Video Editor operations
redo rejected after incompatible rights/policy change
mixed coordinator/Runner schema handshake
material unknown-field rejection
declared downgrade compatibility path
chart displayed-value/bound-value equality
percentage/unit/axis numeric fidelity
counter animation exact terminal value
Thai/mixed-language pronunciation lexicon provider adaptation
pronunciation edit invalidation scope
provider cancel confirmed/accepted/too-late/not-supported states
late-completion non-promotion
first-frame/poster/thumbnail/loop-boundary QC
stale review-action fencing across devices
duplicate review action idempotency
production context projection preserves locks/claims/rights
projection digest invalidation after revision change
object upload succeeds / metadata commit fails
metadata commit points to missing-object reconciliation
artifact digest verification before COMMITTED
portable archive export-right filtering
portable archive excludes secrets
archive restore schema/digest validation
missing external dependency graceful restore
```

---

# 151. R1.6 Exit-criteria Additions

In addition to all prior production-readiness criteria:

85. Remote/mutable production inputs are bound to immutable admitted source snapshots or exact
    provider revisions.
86. Targeted partial rerenders verify temporal/audio/color continuity across preserved/changed
    boundaries.
87. Users can reversibly restore/undo production operations without deleting immutable history or
    receipts.
88. Mixed-version Runners/providers negotiate contract compatibility and cannot silently ignore
    material schema/security fields.
89. Data-driven graphics deterministically preserve approved values, units and chart semantics.
90. TTS production supports scoped approved pronunciation rules for critical names/terms without
    corrupting canonical written text.
91. External-provider cancellation states and late completions are represented truthfully and
    reconciled economically.
92. Cover/poster/first-frame/loop-boundary artifacts receive applicable delivery-quality checks.
93. Mutating review actions are exact-candidate/revision/policy fenced across devices and stale
    sessions.
94. Agent planning/repair receives a canonical bounded context projection that preserves material
    locks, claims, rights and unresolved issues.
95. Canonical production state cannot reference an incomplete/unverified object-store artifact, and
    orphan/missing artifacts are reconcilable.
96. Authorized productions can be archived/restored with explicit dependency/license/portability
    status and without embedding secrets.

---

# 153. R1.7 Contract-normalization Decision

R1.7 does **not** add another feature-audit pass. The cumulative architecture audit remains **93
passes**.

R1.7 closes implementation-specification gaps that remain after the architecture has become mature.

The controlling status is now:

```text
DESIGN_COMPLETE
ARCHITECTURE_FROZEN_CANDIDATE
CONTRACT_NORMALIZED
PENDING_G0_SOURCE_RECONCILIATION
PENDING_PHYSICAL_STORAGE/API_BINDING_CONFIRMATION
RUNTIME_NOT_YET_CERTIFIED
```

No new broad feature SHOULD be added to Spec 286 before an implementation finding demonstrates that
the current architecture cannot satisfy a required production outcome.

The implementation team SHALL now prioritize:

```text
contract conformance
source reconciliation
physical mapping
incremental implementation
evidence
acceptance
```

over further speculative scope expansion.

---

# 154. Canonical Core Type Definitions

The following types close previously unresolved logical references. These are **contract semantics**.
At G0, equivalent existing canonical types SHALL win over creating duplicates.

## 154.1 RationalTimeV1

```ts
interface RationalTimeV1 {
  value: bigint | number;
  timescale: bigint | number;
}
```

Interpretation:

```text
seconds = value / timescale
```

Rules:

- `timescale > 0`;
- use integer-valued frame/sample/PTS math whenever practical;
- floating point MAY be used for presentation but MUST NOT be the only canonical basis for
  frame/sample-accurate operations.

## 154.2 VideoCreativeGoalV1

```ts
interface VideoCreativeGoalV1 {
  goalId: string;

  objective:
    | 'EXPLAIN'
    | 'EDUCATE'
    | 'LAUNCH'
    | 'PROMOTE'
    | 'DEMONSTRATE'
    | 'STORYTELL'
    | 'SHOWREEL'
    | 'LOCALIZE'
    | 'REPURPOSE'
    | 'FILM_SHOT'
    | 'CUSTOM';

  audience: string;
  primaryLocale: string;
  targetPlatformRefs: string[];
  targetAspectRefs: string[];

  durationTarget?: {
    preferredMs?: number;
    minMs?: number;
    maxMs?: number;
  };

  successCriteria: string[];
  hardConstraintRefs: string[];
  preferenceRefs: string[];

  sourceIntentRef?: string;
}
```

## 154.3 ProductionStageStateV1

```ts
interface ProductionStageStateV1 {
  stageId: string;

  state:
    | 'NOT_READY'
    | 'READY'
    | 'QUEUED'
    | 'RUNNING'
    | 'WAITING_EXTERNAL'
    | 'WAITING_REVIEW'
    | 'SUCCEEDED'
    | 'FAILED_RECOVERABLE'
    | 'FAILED_TERMINAL'
    | 'CANCEL_PENDING'
    | 'CANCELLED'
    | 'INVALIDATED'
    | 'SUPERSEDED';

  stageRevision: number;
  inputFingerprint?: string;

  attemptCount: number;
  activeWorkerJobRef?: string;
  executionSessionRef?: string;

  outputArtifactRefs: string[];
  receiptRefs: string[];

  invalidatedByRefs: string[];
  lastErrorRef?: string;

  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
}
```

`ProductionStageStateV1` is a projection over canonical job/workflow truth. It MUST NOT become a
second job authority.

## 154.4 TypographyDirectionV1

```ts
interface TypographyDirectionV1 {
  hierarchy: 'SUBTLE'|'BALANCED'|'BOLD'|'EDITORIAL'|'CUSTOM';
  density: 'SPARSE'|'BALANCED'|'DENSE';

  preferredFamilyRefs?: string[];
  weightPattern?: string[];
  alignmentPreference?: string[];
  casePreference?: 'NATIVE'|'UPPER'|'LOWER'|'TITLE'|'MIXED';

  kineticIntensity?: 'NONE'|'LOW'|'MEDIUM'|'HIGH';
  maxLinesPreferred?: number;

  accessibilityProfileRef?: string;
  lockedRuleRefs: string[];
}
```

## 154.5 CompositionDirectionV1

```ts
interface CompositionDirectionV1 {
  density: 'SPARSE'|'BALANCED'|'DENSE';
  focalStrategy:
    | 'SINGLE_FOCUS'
    | 'DUAL_FOCUS'
    | 'EDITORIAL_GRID'
    | 'FULL_BLEED'
    | 'CARD_SYSTEM'
    | 'DATA_LED'
    | 'CUSTOM';

  negativeSpacePreference?: 'LOW'|'MEDIUM'|'HIGH';
  depthPreference?: 'FLAT'|'LAYERED'|'PERSPECTIVE'|'3D';
  assetPriority?: 'TEXT_LED'|'IMAGE_LED'|'VIDEO_LED'|'UI_LED'|'BALANCED';

  safeAreaProfileRefs: string[];
  lockedRuleRefs: string[];
}
```

## 154.6 MotionDirectionV1

```ts
interface MotionDirectionV1 {
  intensity: 'STATIC'|'SUBTLE'|'MODERATE'|'ENERGETIC'|'CUSTOM';
  pacing: 'CALM'|'STEADY'|'FAST'|'BEAT_DRIVEN'|'CUSTOM';

  preferredMotionRefs: string[];
  forbiddenMotionRefs: string[];

  transitionFamilyRefs: string[];
  easingFamilyRefs: string[];

  cameraPersonality?: 'LOCKED'|'SUBTLE'|'DYNAMIC'|'CINEMATIC'|'CUSTOM';
  beatSyncPreference?: 'NONE'|'LIGHT'|'STRONG';

  reducedMotionFallbackRef?: string;
}
```

## 154.7 AudioDirectionV1

```ts
interface AudioDirectionV1 {
  narrationPriority: 'PRIMARY'|'BALANCED'|'OPTIONAL';
  musicRole: 'NONE'|'BED'|'RHYTHMIC_DRIVER'|'FEATURE'|'CUSTOM';
  sfxIntensity: 'NONE'|'LOW'|'MEDIUM'|'HIGH';

  targetLoudnessProfileRef?: string;
  duckingProfileRef?: string;

  beatDriven?: boolean;
  ambiencePreference?: string[];

  requiredStemRefs?: string[];
}
```

## 154.8 VideoQualityTargetsV1

```ts
interface VideoQualityTargetsV1 {
  profileId: string;

  deterministicQcMustPass: boolean;
  hardBlockerLimit: number;

  minimumScores?: Partial<{
    overallCreative: number;
    composition: number;
    typography: number;
    readability: number;
    motion: number;
    pacing: number;
    narrativeVisualMatch: number;
    brandConsistency: number;
    audio: number;
    captions: number;
    platformFitness: number;
    contemporaryPolish: number;
  }>;

  minimumConfidence?: number;
  requiredReviewCoverageRef?: string;

  maxCreativeRepairLoops: number;
  maxSameIssueFingerprintAttempts: number;

  accessibilityProfileRef?: string;
  deliveryProfileRefs: string[];
}
```

These eight definitions are mandatory in the normalized contract pack. Implementations MAY bind them
to already-existing equivalent domain types at G0.

---

# 155. Canonical Production State Machine

## 155.1 Production lifecycle

The production-level state machine SHALL use the following logical states:

```text
DRAFT
PLANNED
READY
EXECUTING
PREVIEW_READY
REVIEWING
REPAIRING
FINAL_RENDERING
FINAL_VERIFYING
APPROVAL_PENDING
APPROVED
DELIVERING
DELIVERED

WAITING_EXTERNAL
PAUSED
CANCEL_PENDING
CANCELLED
FAILED_RECOVERABLE
FAILED_TERMINAL
SUPERSEDED
```

This state is a production projection. Physical execution remains owned by canonical `worker_jobs`,
workflow and Runner authorities.

## 155.2 Required transition rules

| Current | Event | Mandatory guard | Next |
|---|---|---|---|
| `DRAFT` | `PLAN_ACCEPTED` | valid base revision | `PLANNED` |
| `PLANNED` | `PREFLIGHT_PASSED` | rights/policy/capability checks sufficient for intended next step | `READY` |
| `READY` | `EXECUTION_ADMITTED` | canonical job admitted | `EXECUTING` |
| `EXECUTING` | `PREVIEW_AVAILABLE` | preview artifact committed + digest verified | `PREVIEW_READY` |
| `PREVIEW_READY` | `REVIEW_STARTED` | evidence projection current | `REVIEWING` |
| `REVIEWING` | `REPAIR_REQUIRED` | issue ledger current | `REPAIRING` |
| `REPAIRING` | `PATCH_ADMITTED` | revision/candidate fence valid | `EXECUTING` or `PREVIEW_READY` |
| `REVIEWING` | `QUALITY_GATE_PASSED` | mandatory QC/critic gates satisfied | `FINAL_RENDERING` |
| `FINAL_RENDERING` | `FINAL_ARTIFACT_COMMITTED` | artifact commit verified | `FINAL_VERIFYING` |
| `FINAL_VERIFYING` | `FINAL_GATE_PASSED` | final QC + semantic/rights/package gates satisfied | `APPROVAL_PENDING` or `APPROVED` |
| `APPROVAL_PENDING` | `APPROVED_EXACT_HASH` | approval scope/hash current | `APPROVED` |
| `APPROVED` | `DELIVERY_ADMITTED` | finalized delivery package | `DELIVERING` |
| `DELIVERING` | `DELIVERY_RECEIPT_CONFIRMED` | canonical delivery owner confirms | `DELIVERED` |
| any mutable | `EXTERNAL_WAIT` | durable wait reason | `WAITING_EXTERNAL` |
| `WAITING_EXTERNAL` | `RESUME_READY` | wait condition resolved + policy revalidated | prior resumable state |
| any mutable | `PAUSE` | safe checkpoint available or pause declared best-effort | `PAUSED` |
| `PAUSED` | `RESUME` | current policy/revision valid | prior resumable state |
| any cancellable | `CANCEL_REQUESTED` | actor authorized | `CANCEL_PENDING` |
| `CANCEL_PENDING` | `CANCEL_RECONCILED` | child/provider cancellation reconciled | `CANCELLED` |
| any active | `RECOVERABLE_FAILURE` | retry/replan path exists | `FAILED_RECOVERABLE` |
| `FAILED_RECOVERABLE` | `RECOVERY_ADMITTED` | budget/policy/revision valid | prior resumable state |
| any active | `TERMINAL_FAILURE` | no authorized recovery remains | `FAILED_TERMINAL` |

## 155.3 State invariants

- `DELIVERED` requires a finalized package/receipt; an MP4 existing is insufficient.
- `APPROVED` binds to exact digest/scope.
- `CANCELLED` SHALL NOT be asserted while an external provider remains only `cancel requested`
  without reconciliation.
- `FAILED_RECOVERABLE` SHALL preserve reusable valid artifacts.
- `SUPERSEDED` preserves historical traceability.
- no UI may invent a terminal production state independently of canonical server state.
- a state transition SHALL carry idempotency and causation metadata.

---

# 156. Canonical Video-production Action Surface

Spec 286 SHALL define domain actions while reusing the existing capability/action ingress. It does
**not** create another generic API gateway.

## 156.1 Action envelope

```ts
interface VideoProductionActionEnvelopeV1<T = unknown> {
  actionId: string;
  schemaVersion: 'sah.video.action.v1';

  actionType: string;

  tenantId: string;
  projectId: string;
  productionId?: string;

  actorRef: string;

  baseRevisionRef?: string;
  candidateDigest?: string;
  policyEpochRef: string;

  idempotencyKey: string;

  intentMode: 'PREVIEW'|'APPLY';

  payload: T;
}
```

## 156.2 Required action IDs

| Action | Effect | Typical risk | Revision fence |
|---|---|---:|---:|
| `video.production.create` | create production projection | low | no |
| `video.production.plan` | create/update plan proposal | low | yes after creation |
| `video.production.preflight` | read/measure/quote/impact plan | low/read | yes |
| `video.production.preview.render` | produce preview derivative | paid/compute | yes |
| `video.production.review.run` | QC/critic evidence | compute | yes |
| `video.production.repair.propose` | non-mutating repair proposal | low | yes |
| `video.production.repair.apply` | mutate production revision + jobs | material | **yes** |
| `video.production.final.render` | create final candidate | paid/compute | **yes** |
| `video.production.final.verify` | final gates | compute/read | **yes** |
| `video.production.approve` | exact-digest approval binding | privileged | **yes + digest** |
| `video.production.delivery.finalize` | build finalized package | material | **yes + digest** |
| `video.production.deliver` | handoff to canonical delivery/publish owner | privileged/external | **yes + package digest** |
| `video.production.cancel` | request/reconcile cancellation | material | yes |
| `video.production.pause` | safe checkpoint/pause | material | yes |
| `video.production.resume` | resume after revalidation | material | yes |
| `video.production.branch.create` | create scoped branch | low | yes |
| `video.production.branch.merge` | merge semantic revision | material | **yes** |
| `video.production.restore` | create/select restored revision | material | **yes** |
| `video.production.archive.export` | portable authorized archive | external/data | yes |
| `video.production.archive.import` | create/reconcile production from archive | material | yes |

## 156.3 Action result

```ts
interface VideoProductionActionResultV1 {
  actionId: string;
  status:
    | 'ACCEPTED'
    | 'COMPLETED'
    | 'REJECTED'
    | 'NEEDS_APPROVAL'
    | 'NEEDS_USER_INPUT'
    | 'WAITING_EXTERNAL'
    | 'FAILED';

  productionId?: string;
  resultingRevisionRef?: string;

  workerJobRefs: string[];
  artifactRefs: string[];
  receiptRefs: string[];

  error?: VideoProductionErrorV1;
}
```

Every mutating action SHALL re-evaluate server-side authorization and SHALL NOT trust a client-side
catalog result, stale review card or LLM free text as execution authority.

---

# 157. Canonical Video-production Event Envelope

All production events SHALL be representable through one normalized envelope even when emitted by
different underlying owners.

```ts
interface VideoProductionEventV1<T = unknown> {
  eventId: string;
  schemaVersion: 'sah.video.event.v1';
  eventType: string;

  occurredAt: string;

  tenantId: string;
  projectId: string;
  productionId: string;
  productionRevisionRef?: string;

  traceId: string;
  spanId?: string;
  causationId?: string;
  correlationId?: string;

  actorRef?: string;
  stageId?: string;

  workerJobRef?: string;
  executionSessionRef?: string;
  providerExecutionRef?: string;

  artifactRefs: string[];
  receiptRefs: string[];

  payloadSchemaRef: string;
  payload: T;
}
```

Mandatory event families:

```text
production.*
plan.*
stage.*
preview.*
render.*
qc.*
critic.*
issue.*
repair.*
artifact.*
approval.*
delivery.*
provider.*
policy.*
archive.*
```

Event rules:

- event IDs are immutable;
- retry/idempotency MUST prevent duplicate business effects even if event delivery is duplicated;
- events are evidence/projections, not a second job scheduler;
- payload schemas are versioned;
- sensitive content is referenced rather than copied into every event whenever practical;
- tracing metadata SHALL allow causal reconstruction.

---

# 158. Canonical Error Taxonomy & Recovery Semantics

## 158.1 Error contract

```ts
interface VideoProductionErrorV1 {
  code: VideoProductionErrorCodeV1;
  message: string;

  stageId?: string;
  providerRef?: string;

  retryable: boolean;
  replanRecommended: boolean;
  fallbackAllowed: boolean;

  terminal: boolean;

  chargeState:
    | 'NO_CHARGE'
    | 'MAY_HAVE_CHARGE'
    | 'SETTLEMENT_PENDING'
    | 'SETTLED'
    | 'NOT_APPLICABLE';

  requiredAction:
    | 'NONE'
    | 'AUTO_RETRY'
    | 'REPLAN'
    | 'USER_INPUT'
    | 'APPROVAL'
    | 'POLICY_CHANGE'
    | 'RIGHTS_FIX'
    | 'BUDGET_CHANGE'
    | 'OPERATOR'
    | 'WAIT_EXTERNAL';

  evidenceRefs: string[];
}
```

## 158.2 Minimum error codes

```ts
type VideoProductionErrorCodeV1 =
  | 'INPUT_INVALID'
  | 'INPUT_QUARANTINED'
  | 'SOURCE_STALE'
  | 'SOURCE_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CAPABILITY_INCOMPATIBLE'
  | 'RUNTIME_INCOMPATIBLE'
  | 'POLICY_BLOCKED'
  | 'RIGHTS_BLOCKED'
  | 'PRIVACY_BLOCKED'
  | 'SAFETY_BLOCKED'
  | 'BUDGET_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'STALE_REVISION'
  | 'STALE_CANDIDATE'
  | 'STALE_REVIEW_ACTION'
  | 'PROVIDER_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_DEGRADED'
  | 'PROVIDER_QUARANTINED'
  | 'CANCEL_PENDING'
  | 'CANCEL_TOO_LATE'
  | 'RENDER_FAILED'
  | 'ARTIFACT_COMMIT_FAILED'
  | 'ARTIFACT_MISSING'
  | 'QC_FAILED'
  | 'SEMANTIC_FIDELITY_FAILED'
  | 'CREATIVE_REJECTED'
  | 'SEAM_QC_FAILED'
  | 'DELIVERY_PROFILE_STALE'
  | 'DELIVERY_PACKAGE_INVALID'
  | 'DELIVERY_FAILED'
  | 'PARTIAL_SUCCESS'
  | 'EXTERNAL_WAIT'
  | 'UNKNOWN_FAILURE';
```

## 158.3 Recovery matrix

| Class | Retry same request | Fallback | Replan | User/owner action |
|---|---:|---:|---:|---|
| transient provider/network | yes, bounded | when equivalent/policy permits | maybe | no |
| policy/rights/privacy/safety block | **no bypass** | **no** | only to compliant path | often |
| stale revision/candidate/action | no | no | refresh/rebase | maybe |
| QC/creative rejection | no blind retry | capability swap may be valid | **yes** | profile-dependent |
| artifact commit partial failure | idempotent reconcile | no | no | operator only if exhausted |
| budget block | no | no hidden cheaper downgrade | maybe | yes |
| runtime incompatibility | no | eligible runtime allowed | maybe | no |
| cancel pending/too late | reconcile | no duplicate spending | maybe after settlement guard | maybe |

`fallbackAllowed=true` is never sufficient by itself; Section 67 material-difference policy and
current authorization still apply.

---

# 159. G0 Logical-to-Physical Mapping Contract

The architecture SHALL remain logically provider-neutral, but implementation SHALL NOT begin
production DDL/API mutation until a code-grounded G0 map exists.

```ts
interface LogicalPhysicalMappingV1 {
  logicalContractRef: string;
  ownerSpecRef: string;

  disposition:
    | 'REUSE_EXISTING'
    | 'EXTEND_EXISTING'
    | 'NEW_ADDITIVE_RECORD_REQUIRED'
    | 'DERIVED_PROJECTION_ONLY'
    | 'R2_ARTIFACT_ONLY'
    | 'NO_PERSISTENCE';

  physicalRepositoryRef: string;
  physicalModuleRef?: string;
  tableOrStoreRef?: string;
  APIOrActionRef?: string;

  existingFieldMap: Record<string,string>;
  additiveFields: string[];

  migrationRequired: boolean;
  migrationRef?: string;

  retentionOwnerRef?: string;
  authorizationOwnerRef: string;

  sourceEvidenceRefs: string[];
  reviewedByOwner: boolean;
}
```

## 159.1 Mandatory G0 map rows

At minimum, reconcile:

```text
VideoProductionManifestV1
DirectorBriefV1
ObservedVideoStyleGuideV1
BeatGridV1
AudioProductionPlanV1
VideoQualityScorecardV1
VideoIssueV1
repair ledger / repair attempts
ProductionStageStateV1
production state projection
Generated Motion candidate metadata
provider/capability execution receipts
VideoProductionReceiptV1
FinalizedDeliveryPackageV1
ProductionSourceSnapshotV1
VideoEditJournalEntryV1
VideoProductionContextProjectionV1
PortableVideoProductionArchiveV1
VideoProductionEventV1
```

## 159.2 Hard implementation gate

Before production migration:

```text
all mandatory logical rows
    → physical disposition assigned
    → canonical owner confirmed
    → duplicate search completed
    → authorization/retention owner confirmed
    → source evidence attached
```

Any unresolved row is:

```text
G0_BLOCKED_PHYSICAL_MAPPING
```

not permission to invent a new table ad hoc.

R1.7 therefore closes the **spec ambiguity** around persistence, while actual table/module bindings
remain intentionally pending code-grounded G0 reconciliation.

---

# 160. Normalized Implementation Work Breakdown

The earlier P0–P7 phases remain product-level milestones. Implementation SHALL decompose them into
bounded work packages.

## 160.1 Dependency graph

```text
WP0 Reconciliation
  ↓
WP1 Core Contracts / State / Events
  ↓
WP2 Media Capability Adapters
  ↓
WP3 Evidence + Deterministic QC
  ↓
WP4 Creative Director + Critic
  ↓
WP5 Targeted Repair / Partial Render
  ↓
WP6 Generated Motion Sandbox
  ↓
WP7 Motion Studio UX Integration
  ↓
WP8 Film / Creator / Editor Interop
  ↓
WP9 Delivery / Archive / Marketplace Readiness
```

## 160.2 Bounded packages

| Package | Deliverable | Depends | Exit evidence |
|---|---|---|---|
| `WP0.1` | canonical spec/registry/source inventory | — | signed reconciliation report |
| `WP0.2` | Spec 133 conformance matrix | WP0.1 | source-linked matrix |
| `WP0.3` | logical→physical mapping | WP0.1 | Section 159 complete |
| `WP0.4` | baseline golden renders + metrics | WP0.2 | immutable baseline pack |
| `WP1.1` | core R1.7 schemas/types | WP0 | schema tests |
| `WP1.2` | production state projection | WP1.1 | transition tests |
| `WP1.3` | actions/events/errors | WP1.1 | contract tests |
| `WP1.4` | manifest/receipt persistence adapters | WP0.3, WP1.1 | DB/R2 integration tests |
| `WP2.1` | probe/media execution normalized adapter | WP1 | provider conformance |
| `WP2.2` | caption/audio/reframe/export capabilities | WP2.1 | golden media fixtures |
| `WP2.3` | beat/timebase/color/delivery profiles | WP2.1 | deterministic fixtures |
| `WP3.1` | preview evidence extraction | WP2 | contact-sheet/frame tests |
| `WP3.2` | deterministic QC | WP3.1 | QC fixtures |
| `WP3.3` | semantic/accessibility/continuity gates | WP3.1 | domain fixtures |
| `WP4.1` | Director Brief + style intelligence | WP1, WP3 | plan fixtures |
| `WP4.2` | multimodal Creative Critic | WP3 | calibrated eval set |
| `WP4.3` | score/confidence/escalation | WP4.2 | holdout tests |
| `WP5.1` | issue ledger | WP3, WP4 | issue contract tests |
| `WP5.2` | repair planner + impact plan | WP5.1 | invalidation tests |
| `WP5.3` | partial rerender + seam QC | WP5.2 | boundary golden tests |
| `WP5.4` | keep-best/regression gate | WP5.3 | candidate comparison tests |
| `WP6.1` | sandbox isolation | WP1 | security tests |
| `WP6.2` | generated component compile/render | WP6.1, WP3 | fixture render |
| `WP6.3` | ephemeral use/promotion candidate | WP6.2 | governance tests |
| `WP7.1` | Direction UI | WP4 | mobile/desktop UX tests |
| `WP7.2` | Review/Repair UI | WP5 | stale-action tests |
| `WP7.3` | compare/locks/Editor handoff | WP5 | round-trip tests |
| `WP8.1` | Film scoped adapter | WP5 | Spec 252/258 fixtures |
| `WP8.2` | Creator/localization adapter | WP5 | locale fixtures |
| `WP8.3` | timeline/editor conformance | WP7.3 | interchange tests |
| `WP9.1` | final package + approval/delivery gates | WP3–WP8 | package tests |
| `WP9.2` | archive/restore | WP9.1 | restore tests |
| `WP9.3` | Skill promotion/commerce adapter | WP6.3 | Spec 280 tests |

A coding session SHOULD own one bounded package or a clearly defined sub-slice, not "implement P3"
as a single unbounded task.

---

# 161. SLO / Capacity Profile Contract

Performance requirements vary by hardware/provider/project class. Spec 286 SHALL therefore define a
mandatory **measured SLO profile** rather than hardcode one universal latency promise.

```ts
interface VideoRuntimeSloProfileV1 {
  profileId: string;
  environmentClass:
    | 'BROWSER_ONLY'
    | 'STANDARD_RUNNER'
    | 'HIGH_MEMORY_RUNNER'
    | 'CLOUD_CPU'
    | 'CLOUD_GPU'
    | 'EXTERNAL_PROVIDER'
    | 'CUSTOM';

  actionAdmissionP95Ms: number;
  statusReadP95Ms: number;
  manifestReadP95Ms: number;

  maxConcurrentPreviewJobs: number;
  maxConcurrentFinalJobs: number;

  maxManifestBytes: number;
  maxScenesPerProduction: number;
  maxActiveArtifactsPerProduction: number;

  minimumMemoryHeadroomPctBeforeAdmission: number;
  minimumDiskHeadroomPctBeforeAdmission: number;

  previewQueueTargetMs?: number;
  criticQueueTargetMs?: number;

  recoveryObjectiveSeconds?: number;
}
```

## 161.1 Mandatory P0 benchmark

Before production enablement, each supported environment class SHALL have:

```text
measured hardware/runtime identity
measured baseline
declared SLO profile
load-test evidence
OOM/resource-pressure test
admission/backpressure test
```

## 161.2 Non-negotiable service constraints

Regardless of environment-specific numeric targets:

- action admission/status APIs SHALL remain responsive while renders are busy;
- no host may intentionally accept render concurrency beyond advertised resource fitness;
- Task Control progress SHALL not depend on holding the render process HTTP request open;
- resource pressure SHALL queue/reject placement before catastrophic OOM where detectable;
- SLO miss is operational evidence, not permission to corrupt output or bypass QC;
- SLO profiles are versioned and observable.

---

# 162. Requirement Traceability Contract

## 162.1 Requirement ID namespaces

Normative implementation requirements SHALL use stable IDs:

```text
VID-ARCH-*   architecture / ownership
VID-DATA-*   schemas / persistence
VID-ACT-*    actions / state
VID-EVT-*    events / observability
VID-MEDIA-*  media/timebase/color/audio
VID-CRE-*    director/design/creative
VID-QA-*     QC/critic/semantic quality
VID-REP-*    repair/invalidation
VID-SEC-*    security/sandbox/privacy
VID-RGT-*    rights/licensing
VID-UX-*     Motion Studio/review UX
VID-INT-*    Film/Creator/Editor integration
VID-DEL-*    finalization/delivery/archive
VID-OPS-*    recovery/SLO/provider health
```

## 162.2 Minimum traceability matrix

| Req ID | Requirement | Owner / WP | Verification | Acceptance |
|---|---|---|---|---|
| `VID-ARCH-001` | Spec 133 remains canonical deterministic video foundation | WP0 | source conformance | legacy project scenario |
| `VID-ARCH-002` | no second job/capability/billing/timeline authority | WP0 | ownership audit | architecture negative tests |
| `VID-DATA-001` | production manifest is revisioned and resumable | WP1.4 | integration | interruption scenarios |
| `VID-DATA-002` | source snapshots bind mutable inputs to exact revision/digest | WP1.4 | contract | A61 |
| `VID-ACT-001` | mutating action uses revision/policy/idempotency fence | WP1.3 | contract/concurrency | A69 |
| `VID-ACT-002` | canonical production state transition guards enforced | WP1.2 | state-machine test | cancellation/recovery set |
| `VID-EVT-001` | events carry trace/causation/schema refs | WP1.3 | contract | incident trace scenario |
| `VID-MEDIA-001` | visible-pixel mutation receives rendered evidence | WP3.1 | integration | A1/A2 |
| `VID-MEDIA-002` | CFR/VFR/drop-frame/sample clocks map explicitly | WP2.3 | deterministic fixtures | A37/A38 |
| `VID-MEDIA-003` | final color/HDR tags and transform are explicit | WP2.3 | media fixture | A23 |
| `VID-MEDIA-004` | audio channel/stem mapping is verified | WP2.2 | audio fixture | A41 |
| `VID-CRE-001` | Director Brief exists before expensive autonomous production | WP4.1 | schema/e2e | A1/A2 |
| `VID-CRE-002` | template registry is preferred fast path but not creative ceiling | WP4.1/WP6 | resolver test | A8 |
| `VID-QA-001` | deterministic QC and creative critic are separate authorities | WP3.2/WP4.2 | contract | quality fixture |
| `VID-QA-002` | creative acceptance requires evidence/confidence profile | WP4.3 | evaluation | A58 |
| `VID-QA-003` | semantic fidelity failure outranks visual PASS | WP3.3 | semantic fixture | A24/A65 |
| `VID-REP-001` | localized issue defaults to targeted repair | WP5.2 | invalidation | A57 |
| `VID-REP-002` | partial rerender verifies seam continuity | WP5.3 | boundary fixture | A62 |
| `VID-REP-003` | keep-best rejects critical regression | WP5.4 | comparison | regression golden |
| `VID-SEC-001` | generated code runs only in isolated sandbox | WP6.1 | security | A8 |
| `VID-SEC-002` | raw shell/filter/env injection not exposed as media capability | WP2/WP6 | negative tests | security suite |
| `VID-SEC-003` | untrusted media passes restricted ingestion/quarantine | WP2.1 | security | A31 |
| `VID-SEC-004` | cross-tenant cache/hash does not grant access | WP1.4 | tenant test | A17 |
| `VID-RGT-001` | rights/consent revalidated at delivery/reuse boundaries | WP9.1 | policy integration | A18 |
| `VID-RGT-002` | render right != redistribution/template right | WP9.3 | license matrix | A35 |
| `VID-UX-001` | review UI exposes evidence/issue/repair impact | WP7.2 | UX/E2E | A1 |
| `VID-UX-002` | phone/tablet can review/approve without full editor | WP7 | responsive E2E | mobile acceptance |
| `VID-INT-001` | Film Studio consumes shared runtime; no second renderer | WP8.1 | integration | A6 |
| `VID-INT-002` | Video Editor round-trip declares lost semantics | WP8.3 | interchange | A59 |
| `VID-INT-003` | localized timing may recompose rather than force original duration | WP8.2 | locale fixture | A19 |
| `VID-DEL-001` | preview PASS does not imply final PASS | WP9.1 | E2E | A11 |
| `VID-DEL-002` | delivery package finalization is atomic/digest-bound | WP9.1 | package tests | A32 |
| `VID-DEL-003` | approval binds exact digest and scope | WP9.1 | contract | A20 |
| `VID-DEL-004` | proxy/review artifact cannot silently become master | WP9.1 | lineage test | A43 |
| `VID-DEL-005` | archive excludes secrets and reports missing dependencies | WP9.2 | restore test | A72 |
| `VID-OPS-001` | provider fallback discloses material differences | WP2/WP9 | policy test | A15 |
| `VID-OPS-002` | provider cancellation state is reconciled truthfully | WP2 | provider test | A67 |
| `VID-OPS-003` | provider systemic failure can circuit-break without retry storm | WP2 | chaos/load | A55 |
| `VID-OPS-004` | object-store/SoR partial commit is reconcilable | WP1.4 | failure injection | A71 |
| `VID-OPS-005` | resource admission prevents known oversubscription | WP0/WP2 | load test | A22 |

## 162.3 Traceability completion gate

Before a work package enters implementation:

```text
applicable normative requirements
    → Requirement IDs
    → owner/work package
    → implementation target
    → test IDs
    → acceptance evidence
```

MUST be complete.

A requirement marked `DONE` without evidence is not complete.

The implementer pack contains a dedicated traceability file intended to be expanded as G0 binds
logical contracts to actual source modules.

---

# 163. Normative-document Split & Precedence

To keep the implementation surface manageable, R1.7 SHALL be distributed as an **Implementer Pack**.

```text
SPEC-286-R1.7/
├── README.md
├── spec.md
├── contracts/
│   ├── core-types.md
│   └── state-actions-events-errors.md
├── implementation/
│   ├── work-packages-slo.md
│   └── physical-mapping-g0.md
├── tests/
│   └── traceability-matrix.md
└── audit/
    └── 93-pass-history.md
```

## 163.1 Precedence

1. `spec.md` — normative architecture/product requirements.
2. `contracts/*.md` — normative executable contract detail.
3. `implementation/*.md` — normative implementation gates/sequencing where marked MUST/SHALL.
4. `tests/traceability-matrix.md` — normative verification mapping.
5. `audit/93-pass-history.md` — **non-normative historical rationale**.

The cumulative single-file Spec MAY still be retained for archival/review convenience, but coding
agents SHOULD consume the Implementer Pack and not repeatedly parse 93 rounds of historical audit.

## 163.2 Change control after R1.7

After architecture freeze:

```text
bug / ambiguity in contract
    → patch R1.7.x

code-grounded G0 mapping
    → fill physical mapping files

new required product capability
    → demonstrate unmet requirement first
    → additive revision only when justified
```

Do not reopen broad architecture brainstorming simply because a new external demo/repository appears.
Map it first to existing capabilities and requirements.

---

# 164. Final architecture statement


SmartAIHub's future video stack SHALL be understood as:

```text
                        SMARTAIHUB VIDEO SYSTEM
                                  │
                  ┌───────────────┴───────────────┐
                  │                               │
          Product Experiences               Shared Runtime
                  │                               │
       ┌──────────┼──────────┐          ┌─────────┴──────────┐
       │          │          │          │                    │
 Motion Studio Film Studio Creator   Agentic Production   Capability Layer
       │          │          │          │                    │
       │          │          │     Director / Critic     Spec 256
       │          │          │     Manifest / Repair          │
       └──────────┴──────────┘          │              ┌──────┼───────────┐
                  │                     │              │      │           │
                  └─────────────────────┼──────────────┘      │           │
                                        │                     │           │
                                 Execution Providers           │           │
                                        │                     │           │
                     ┌──────────────────┼──────────────────┐  │           │
                     │                  │                  │  │           │
                Spec 133            Media/FFmpeg        Audio/TTS    Generative
                Remotion            capabilities        Spec 247      Video
                     │                  │                  │           │
                     └──────────────────┼──────────────────┴───────────┘
                                        │
                               Preview / Evidence
                                        │
                         QC + Multimodal Critique
                                        │
                               Targeted Repair
                                        │
                              Approved Deliverable
```

The system SHALL therefore move from:

> **"AI chooses a video template and renders it."**

to:

> **"AI directs a production, selects or creates the right capabilities, renders evidence,
> watches/listens to its own work, repairs defects without destroying approved work, verifies the
> result, and returns a reproducible professional deliverable — while all execution remains inside
> SmartAIHub's existing authority, policy, job, billing, and product boundaries."**

---

**End of Spec 286 R1.7 body — contract-normalized architecture-frozen candidate; cumulative architecture audit remains 93 passes; G0 physical reconciliation and runtime certification pending.**

## 165. Additive Amendment — AI Generated Motion Enhancement (WP0.4 gate)

This amendment narrows the existing R1.7 motion-generation and quality contracts for
Video Studio / Motion Studio. It adds acceptance evidence and does not authorize a
new project model, timeline, job queue, QA ledger, billing authority, renderer, or
template registry. The existing Motion Template Registry, `VideoProjectDocument`,
motion candidates, `worker_jobs`, Remotion executor, revision system, approval,
asset-rights, and tenant boundaries remain authoritative.

### 165.1 Template-first and generated-motion routing

For a prompt-to-motion request, the existing Motion Template Registry SHALL be
searched semantically using the requested purpose, visual style, aspect ratio,
duration, required assets, and supported motion capabilities. The plan SHALL
prefer a compatible existing template when its declared capabilities satisfy the
request. Generation SHALL be selected only when no compatible template exists,
the user explicitly requests a novel treatment, or rendered evidence identifies a
defect that the existing template cannot repair. The selected route and reason
SHALL be recorded with the existing project revision/job evidence.

An AI-generated Remotion component SHALL be a candidate in the existing motion
candidate/revision workflow. It MUST pass the Generated Motion Sandbox security
gate, deterministic compile checks, asset and dependency policy, and rendered
visual QA before it can be used for an ephemeral project render. It MUST NOT be
registered as a trusted reusable template as a side effect of generation.

### 165.2 Reuse, safety, and user control

Reuse SHALL preserve tenant ownership, source-asset rights, approval state,
revision provenance, and existing billing authority. User-private and tenant
templates SHALL remain scoped to their existing owners. Marketplace promotion
SHALL use the existing approval/governance path and SHALL include license,
dependency, security, provenance, and quality evidence. A generated component
that fails any sandbox gate MUST fail closed and MUST NOT reach a render worker.

The implementation SHALL remain provider-independent: prompts, template
selection, normalized motion candidates, sandbox inputs, and quality evidence
MUST use SmartAIHub-owned contracts. A model/provider name MAY be recorded as
provenance, but MUST NOT become a durable schema, routing contract, or required
runtime dependency.

### 165.3 WP0.4 Golden Render Baseline acceptance

Before behavior-changing motion enhancements, WP0.4 SHALL capture three fresh
golden fixtures through the current Remotion path on the first available
authorized Windows Runner:

| Fixture | Required profile |
|---|---|
| A — Product Motion Ad | 15 seconds, 9:16 |
| B — Motion Infographic | 20 seconds, 16:9 |
| C — Logo / 3D Motion | 10 seconds, 1:1 |

Each execution record SHALL bind the exact project revision, fixture/input
digest, Remotion/runtime and runner versions, job identity, output digest, render
duration and billed cost (or an explicit zero-cost basis), existing QA result,
representative key frames/contact sheet, and observed visual defects. The record
SHALL distinguish an execution result from a queued, unavailable, or
authorization-blocked attempt. Windows is the first test target; Linux is a
separate target and MUST have its own readiness and execution evidence.

No visual-quality or cost improvement SHALL be claimed without comparable
baseline and candidate execution records for the same fixture/profile. The report
SHALL compare render time and cost alongside legibility, composition, motion
continuity, brand fidelity, and defect/repair burden. If a runner or authorization
is unavailable, WP0.4 remains BLOCKED; synthetic renders, static compilation,
historical evidence, and GitHub search results are not substitutes for golden
render execution evidence.

### 165.4 Video Studio review acceptance

Video Studio SHALL expose template-first and generation route explanations,
candidate preview, revision-aware apply/discard, and QA evidence through its
existing project and timeline surfaces. Phone and tablet users SHALL be able to
initiate, monitor, review, and approve a candidate without requiring the full
desktop timeline. Responsive review SHALL preserve the same tenant, revision,
asset-rights, approval, and billing decisions as desktop.

This amendment does not authorize a production deployment, new database
migration, or enabling a new feature flag. New behavior remains disabled behind
the existing feature-flag authority until its applicable security, runner,
render, and acceptance evidence passes.

**Amendment status:** additive acceptance criteria only; WP0.4 execution and
runtime certification remain pending until source-bound Runner Authority
receipts and golden render artifacts exist.
