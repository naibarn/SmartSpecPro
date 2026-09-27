---
spec_id: 252
numbering_status: PROVISIONAL_PENDING_CANONICAL_REGISTRY_CHECK
title: SmartAIHub AI Film Studio — Chat-First Director Graph, 3D Previsualization & Character Performance
revision: 1.2-proposed-second-20pass-audited
status: DOCUMENT_AUDITED_R1_2_IMPLEMENTATION_UNVERIFIED
prepared: 2026-09-27
original_baseline_revision: 1.0-proposed
audit_passes: 40  # cumulative: previous 20 + a second, distinct set of 20
owner_review_status: PENDING_CANONICAL_REPOSITORY_RECONCILIATION
source_design: SmartAIHub AI Film Studio Blueprint v1.4 (2026-09-27)
proposed_path: specs/feature/252-ai-film-studio/spec.md
implementation_boundary: Specs 1-214 immutable; Spec 224 active unchanged; existing editor/drama/creator retain canonical product data
feature_flag: film_studio.enabled=false
related_specs: [196,195,200,207,208,214,215,216,220,224,225,226,229,231,233,234,237,239,240,241,242,243,244,247,248,251,253,254]
---

# Spec 252 — SmartAIHub AI Film Studio

## 0. Scope, owner and product invariant

Build a **separate first-party Film Studio product**, controlled by existing Universal Chat/Task Control (Feature 196 + Specs 225/226) and optionally by its own specialized visual workspace. It owns film-domain truth: film/scene/shot, staging, cast-role mapping, 3D scene revisions, performance tracks, camera plans, generative takes, film-local decisions, and review status. It does **not** own the global conversation, Task Control, canonical job/credit/approval ledger, unrelated creator/series/timeline data, speech gateway, inference routing, universal capability registry, or external agent lifecycle. Film Studio works when third-party model providers, speculative UI generation or advanced 3D features are disabled; in degraded mode it still saves scenes and produces simple local/browser Previs.

An existing Vertical Drama episode, Video Editor timeline or Spec 251 creator workspace remains usable without Film Studio. Film Studio accepts authorized handoff assets or optional import from them and returns versioned candidates, never silently writes another product's canonical state. Spec 253 defines this cross-product handoff boundary.

Non-goals for P0: replacing Blender, fully procedural rigging, every world-model input, automatic no-review global publishing, guaranteed provider-specific pose fidelity, local 16 GB VRAM inference for every video model, any second rendering queue, and a second full timeline editor.

## 1. Entry points and chat-first user journey

1. From full Chat, compact launcher, Task Control, or scoped Film Studio UI, user asks for a film, series sequence, shot or modification. Reuse the exact authenticated conversation/task IDs and action API of Feature 196 / Spec 226. A dialog open in a page may receive current page context; a fresh phone session without a page resolves explicit product/project/shot references from authorized data, not guessed screen context.
2. Resolve project scope via Spec 241/233 and Spec 220 grants. An inferred match may enable read-only suggestion but does not authorize paid render or an edit. The user's confirmed project selection is visible and changeable. One conversation may work across products/projects with per-message-range associations.
3. Generate a versioned **Director Proposal** with treatment, scenes, cast, shot list, budget envelope and unavailable capabilities. Preview is non-mutating. Apply is a typed authenticated edit against a revision fence; consequential external egress, paid model execution, use of someone's likeness or publishing requires existing policy/approval gates.
4. Create a low-cost storyboard and optional 3D Previs; let user review an artifact card, version A/B comparison, motion map or video review inside common Chat/Task Control. Users can ask "ฉากสามให้เดินช้าลง", "ใช้ภาพแนวตั้ง", "คงใบหน้าเดิม" or "เปิด Stage Editor ตรงท่อนนี้". Preserve all unrelated approved shots and the explicitly locked attributes.
5. Open specialized 3D Stage, Rig/Motion, Camera, Audio or full Timeline **only when requested/needed**. Product-specific editor operations return the same typed domain edit intents as Chat; no model-generated free text is trusted as a direct DB patch.
6. Background work must survive browser close, phone suspension, Runner disconnection and switching between compact/full Chat. Task Control holds authorized status and result review as projections of canonical jobs. On every device change, old action tokens are discarded and current rights/revisions rechecked.

## 2. Product and data ownership

| Artifact / fact | Canonical owner | Film Studio behavior |
|---|---|---|
| Conversation, intent, Page Context | Feature 196, Specs 225/226 | Read bounded authorized context, emit domain proposals |
| Project/ACL/memory | Specs 220/233/241 | Resolve and reference; no private project lookup bypass |
| Scene/shot/performance/camera/take revisions | **Spec 252** | Authoritative only for Film Studio-owned films |
| Original media bytes, signed access, retention | Existing Library/R2 and Spec 220 | Store immutable AssetRefs, provenance and content digest |
| Logical workflow/DAG/compilation | Spec 215 and frozen Spec 214 node taxonomy | Supply typed film recipes and stage dependency fingerprints |
| Physical execution | Feature 195 `worker_jobs`, Runner | Submit admitted work, store receipts, never launch competing queue |
| LLM/video/audio provider capability and routing | Spec 231 / current media gateway / Spec 247 | Require independently certified feature tuples; no invented provider support |
| Rendering environment | Spec 242, Runner, certified GPU backend | Select via shared placement policy; containers do not imply GPU |
| Timeline editing, auto rough cut, final render | Existing Video Editor and media render contracts | Import/export via Spec 253; not a second timeline engine |
| Episodic story/shot/audio canon | Existing Vertical Drama | Optional shot enhancement, candidate take return only |
| Localization and multilingual export | Spec 251 / 247 | Submit consented immutable handoff bundle |
| UI visualization and review widgets | Spec 240 | Typed surfaces only, no direct privileged browser code |

## 3. Canonical film-domain records — logical contract

Before any DDL, map each logical record below to actual deployed Project/Library/media tables. Keep new records **film-owned only**. All persisted film records include tenant ID, project ID, owner/created-by, policy epoch, schema version, immutable revision lineage and audit receipts. PostgreSQL remains transactional SoR; R2 stores heavy media; Vectorize is only a permission-scoped derived index.

```ts
interface FilmProjectRefV1 {
  schemaVersion: 'film.project.v1'; filmId: string; tenantId: string;
  projectId: string; currentFilmRevisionId: string;
  storyBibleAssetRef?: string; castRefs: string[]; sceneRefs: string[];
  defaultFps: { num: number; den: number }; timeUnit: 'rational_frames';
  rightsPolicyRef: string; createdBy: string;
}
interface FilmSceneRevisionV1 {
  schemaVersion: 'film.scene.v1'; sceneId: string; revisionId: string;
  parentRevisionIds: string[]; filmId: string; coordinateSystem: 'RH_Y_UP_METERS';
  gltfAssetRef?: string; usdAssetRef?: string; worldAssetRefs: string[];
  objectRefs: string[]; actorPlacementRefs: string[]; shotRefs: string[];
  contentDigest: string; createdAt: string;
}
interface CharacterPerformanceV1 {
  schemaVersion: 'film.performance.v1'; performanceId: string; revisionId: string;
  actorId: string; skeletonProfileRef?: string; sourceMotionRef?: string;
  rigMapRef?: string; rootTrackRef?: string; boneCurvesRef?: string;
  handContactEventRefs: string[]; faceTrackRef?: string; speechCueRefs: string[];
  editablePoseAssetRefs: string[]; coverage: 'blockout'|'body'|'body_face_hands';
  clipTimebase: {num: number; den: number}; licenseEvidenceRefs: string[];
}
interface FilmShotRevisionV1 {
  schemaVersion: 'film.shot.v1'; shotId: string; revisionId: string;
  sceneRevisionId: string; actionTrackRefs: string[]; performanceRefs: string[];
  cameraVariantRefs: string[]; dialogueCueRefs: string[];
  durationFrames: number; fps: {num: number; den: number};
  lockedFields: string[]; linkedSourceRefs: string[];
  approvalState: 'DRAFT'|'REVIEW_REQUIRED'|'APPROVED'|'SUPERSEDED';
}
interface FilmCameraVariantV1 {
  variantId: string; shotRevisionId: string; framing: '16:9'|'9:16'|'1:1'|'custom';
  resolution: {w: number; h: number}; lensMm?: number; sensorMm?: number;
  rigType: 'follow'|'orbit'|'dolly'|'custom'; cameraTrackRef: string;
  safeAreaProfileRef?: string; compositionIntentRef: string;
}
interface FilmGeneratedTakeV1 {
  takeId: string; shotRevisionId: string; cameraVariantId: string;
  providerProfileRef: string; conditioningManifestRef: string; promptCompilerVersion: string;
  generationJobRef: string; outputAssetRefs: string[]; qaEvidenceRefs: string[];
  costReceiptRefs: string[]; exactInputDigest: string; generationStatus: string;
}
```

Film records use stable semantic actor/object IDs. Color-coded clay proxies are only a display feature. Coordinate conversion is explicit, unit is meter, default right-handed Y-up, and FPS/PTS are rational (support VFR source timestamps). Asset digests must include source revision, transform and codec settings as appropriate. Film revision and generated UI surface revision are different; UI changes never imply an irreversible scene edit.

## 4. Character Performance and 3D Previs

P0 minimum: simple Three.js scene graph, primitive geometry, built-in Humanoid VRM/glTF import, pose preview, four tested motion clips (walk, run, stop, reach), camera preset follow/orbit/dolly/custom, spline routes, interpolation/keyframes, low-cost storyboard/Playblast export. The browser preview does not control authoritative job progress or final timing; deterministic frame-based renderer evaluates all animations at `t = frame * fps.den / fps.num` and writes checked MP4/frames via approved execution backend.

P1: IK hand/foot constraints, contact events, motion blending and retargeting with measurable leg/arm-length correction; phone-video motion estimation with editable errors; face/hands/audio timing tracks; multi-actor motion QC; interchangeable asset and motion licenses.

P2: optional OpenUSD interop, reconstructed worlds, depth-camera scene capture, neural/4D scene adapters and native camera/skeleton provider interfaces. **Do not make USD, physics simulation, dense geometry, or full facial rigs mandatory for 2D or simple mobile workflows.** A 2D skeletal branch retains native 2D editability rather than forcing every cartoon into 3D humanoid data.

## 5. Universal Conditioning Pipeline and model independence

Conditioning profiles derive from the **same approved scene/shot/performance/camera revision**: RGB clay Playblast, 2D pose keypoint video, depth (unit/near/far definition), segmentation/object IDs, edge maps, first/last frames, motion vectors where supported, original/source video, audio dialog reference and optional future direct 3D/skeleton tensors. For each export record camera, FPS, coordinate transform, masking, shot length, reference role and source revision. Preserve both raw editable motion and generated intermediates.

Adapters MUST advertise `DOCUMENTED`, `ACCOUNT_PROBED`, `SANDBOX_VERIFIED`, `CERTIFIED`, `DEGRADED` or `UNAVAILABLE` **per model/revision/account/region/combined input tuple**. Never infer native skeleton or clay control from generic image/video support. For H3 community ControlNet/LoRA/quantized packs, pin checkpoint hash, ComfyUI/runner version, relevant node commits, runtime, quantization, input shapes, tested GPU and license; tool availability does not establish production fitness. Seedance, Wan, LTX, Veo, future world models and any discovered external model use separate adapters without restructuring the Director Graph. Where only video reference is supported, mark conditioning quality downgrade and require the user's authorized choice when it changes intended action fidelity or cost.

### 5.1 Reference compilation contract

```ts
interface FilmConditioningManifestV1 {
  manifestId: string; sourceShotRevisionId: string; cameraVariantId: string;
  outputKind: 'CLAY_VIDEO'|'POSE_VIDEO'|'DEPTH_VIDEO'|'MASK_VIDEO'|'KEYFRAMES'|'SOURCE_VIDEO'|'AUDIO_REF'|'NATIVE_3D';
  artifactRefs: string[]; exactDigest: string; timebaseRef: string; coordinateTransformRef?: string;
  providerInputRole: string; privacyPolicyRef: string; rightsEvidenceRefs: string[];
  compilerRevision: string;
}
```

P0: Clay Playblast + first/last frames + pose video. P1: depth and segmentation. Native 3D/video diffusion novel control belongs behind optional future Conditioning Adapter schema; use a capability version handshake, not an open-ended JSON blob as product truth.

## 6. Film command API, AI planning and non-destructive edits

Film-specific actions are published into **existing** Spec 226 semantic action manifest with typed schemas, version, eligibility and permission; Feature 196 chooses among them from Chat based on context. Required P0 actions: `film.project.create`, `film.scene.plan`, `film.scene.preview`, `film.scene.commit`, `film.shot.set_camera_variant`, `film.shot.adjust_action`, `film.shot.regenerate`, `film.take.compare`, `film.take.approve`, `film.handoff.prepare`, `film.artifact.review`.

`film.edit.propose` is pure preview: base film/scene/shot revision, source evidence, target IDs, typed changes, protected-field snapshot, affected dependent assets, cost quote, placement preview and approval requirements. `film.edit.apply` validates policy, grants, locks, authorizations, current revision/consent/budget and domain invariants inside a transaction, emits immutable new revision and schedules *only impacted derived stages*. If the base revision has moved, return conflict/rebase; NEVER silent last-write-wins. Idempotency binds principal/project/action/target/base revision/request digest. Manual edits and locks always override AI-generated changes unless user explicitly unlocks them.

Default intent modes: `SUGGEST` (read-only), `DRAFT` (parallel version), `APPLY` (explicitly accepted or preauthorized low-risk bounded revision). External agent output, free-text prompt, tool result, screenshot, MCP UI and other untrusted data cannot directly become an Apply command.

## 7. Workflow orchestration and resource placement

Use Spec 215 compiled recipes with **existing Spec 214 Node Types** and Feature 195 physical jobs, not new `film_jobs` queue or direct untracked Cloudflare workflow. Stages include script/shot breakdown → optional scene/character import → motion/camera generation → conditioning export → provider capability/rights/cost gate → video/audio generation → QC → human review → artifact handoff. Store immutable stage input fingerprints, provider accepted/unknown state, billing reconciliation refs, retry/compensation and causal provenance. Failed or revoked source must fence downstream and invalidate only affected derivatives.

Placement uses shared runtime profile from Spec 242/243 and user Runner registry: browser for lightweight preview; Worker/API for short trusted control; Cloudflare Sandbox/Container for isolated CPU/process/FFmpeg work, subject to real runtime limits; user machine via explicit opt-in Runner/ComfyUI for private local GPU; independently provisioned/certified remote GPU for heavyweight video models; managed agent for reasoning/harness work where user authorizes data transfer. Do not assume Cloudflare Sandbox implies video-model GPU. Loss of a worker recovers from R2 checkpoints and canonical job evidence, not local ephemeral disk.

## 8. Multi-aspect cinematic output and editorial handoff

Represent a single shared performance/event graph with **separate camera composition variants** (9:16, 16:9, optional 1:1/custom). Do not treat center crop of landscape as universal portrait direction. Output variants have independent timebase, safe-area, camera track, shot approval, cost, QC and publication rights. Source shot and variant ancestry are immutable. High-value reframe can regenerate only affected camera/visual render; do not regenerate ASR/dub when audio did not change. Do not pretend that new camera angles can always be reconstructed from baked video.

Spec 253 handoff creates a versioned `MediaHandoffBundle`: Film Studio -> existing Video Editor candidate timeline; Film Studio -> existing Vertical Drama candidate take; Film/Editor/Drama -> Creator Workspace authorized localization source. The receiver validates authorization and **imports a candidate** with explicit review. Publishing is controlled by existing policy owner per exact output hash/locale/aspect. A failure in receiver leaves the origin's approved asset unchanged.

## 9. UI, human agency and non-degradation

The Chat composer is a shared Feature 196/Spec 226 component across full Chat, compact modal, Web/Desktop/PWA/mobile/tablet; Film Studio may render film artifact previews within Spec 240's safe allowlisted UI surfaces. The specialist 3D Stage stays available for precise work, not a mandatory onboarding funnel. All substantial generated UI has accessible non-rich fallback and expires privileged actions on policy changes. Show progress and budget in common Task Control, with clear draft/approved/output distinction; never mark partial output completed because a provider returned a file.

When feature flag OFF, existing Creator Workspace/Vertical Drama/Video Editor UI and APIs remain unchanged. No film installation requirement for old projects; legacy .sahvideo / episode packs open normally through their existing adapters. Film Studio does not silently switch video-editor `legacy_worker`/`web_beta`/`web_default` mode.

## 10. Security, quality and acceptance

Tenant/project ACL before source reads, field-level grants for personal likeness/voice, recheck before GPU/external egress, version pin and license restrictions on model packs. Use signed short-lived URLs only when provider needs media; no raw filesystem paths from Chat; sandbox new community code with limited egress, no secret inheritance and exact provenance. Publish media only after existing release policy review. No automatic unconsented performance-capture or voice cloning. Caches are tenant-scoped and revocation-aware.

P0 golden samples: (1) two-person dialogue with Thai original and English-localized derivative, (2) multi-actor chase with follow camera and 3D motion, (3) same source performance -> 16:9 + 9:16 independently directed variants, (4) phone-only creator using remote compute, (5) local user runner interrupted and job recovered, (6) legacy drama/editor projects unchanged when film feature disabled.

Acceptance conditions: deterministic same-input scene/playblast hashes at declared renderer version; no unapproved edits to locked shots; no wrong-project reads; no double-charged retries; no test claiming a model capability absent account/region probe; source/target product original assets untouched on handoff; product source version conflicting -> fail/review; full mobile result review/approval without opening 3D editor; no required production migration or dependencies on unfinished Spec 224.

## 11. Delivery sequence and owner gates

| Work package | Deliverable | Mandatory exit |
|---|---|---|
| F0 | Registry, schema, runtime, video-editor/series and Product API read-only audit | Confirm Spec 252 ID and real interfaces; owner signoff; no production DDL |
| F1 | FilmProject/Scene/Shot/Performance/Camera revision schema-fit | Migration reviewed separately; per-project ACL, optimistic version tests |
| F2 | Thin Chat film commands and storyboard artifact | Same conversation small/full/mobile; proposal-only before approval |
| F3 | Lightweight Three.js scene/VRM/camera/action and deterministic Playblast | One editable motion yields pose/clay previews under pinned renderer |
| F4 | Capability-selected video adapters + costs/rights gates | At least one certified provider, second isolated compatibility test |
| F5 | Non-destructive takes, QC and independent 9:16/16:9 variants | A/B, targeted retry, safe-area, locked-shot invariants |
| F6 | Spec 253 handoff to timeline/drama/251 | Consumer opt-in and reversible import/return; legacy regression |
| F7 | Phone-first end-to-end, adaptive placement, canary | Recovery, consented egress, spend and no cross-tenant leakage |
| F8 | Optional IK/mocap/depth/segmentation/model packs | Independently certified; not blocking P0 |

All stage test evidence must record exact commit, source spec revision, fixture hash, runner/provider version, hardware and result. Design review is not implementation evidence. Never perform one-shot migration in Production under unfinished Cloudflare or DB gates.


---

## SPEC-254-INTEGRATION-DELTA — External execution conformance (2026-09-27; PROPOSED, additive)

**Dependency:** proposed Spec 254, provisional number; current live repository owner/version confirmation required. This appendix is not evidence of deployed functionality.

**252-E254-01.** Film Studio SHALL emit the typed `FilmExecutionRequestV1` of proposed Spec 254 for external CPU, GPU, hosted-agent and ComfyUI operations. Film Scene/Shot/Performance/Camera/Take revisions remain the sole Film truth under Spec 252; task/offer/result payloads are derived execution envelopes only.

**252-E254-02.** Maintain basic scene/pose/clay preview with `film.external_execution.enabled=false`. Exact qualification and placement are owned by current platform capability/Runner/Cloudflare/hosted-agent authorities consumed through Spec 254; Film must not create a second scheduler or GPU registry.

**252-E254-03.** A remote output returns as an immutable candidate Take *only after* current Film revision fence, asset hash, rights epoch and independent QC pass; user approves active Take and optional Spec 253 cross-product handoff separately.

**Unexecuted acceptance gates:**

- [ ] Film feature OFF preserves standalone Previs
- [ ] Invalid or superseded external result cannot update current Film revision


---

# AUDIT-R1.1 / 20-PASS IMPLEMENTATION HARDENING — SPEC 252 (2026-09-27)

**Normative precedence and status.** This section is an additive complete-document R1.1 proposal. For a conflict within this file, the explicit requirements here supersede only the conflicting v1.0 proposal text; no live repository or deployed capability is certified. All original text above remains part of this implementation candidate. Spec numbers 252–254 require canonical registry verification. Treat Specs 1–214 as historical design baseline only; reconcile each implementation dependency against the live repository in E0. Spec 251 is referenced by creator integrations but its document was not found in this checkout, so it is not evidence for baseline preservation, approved ownership or implementation. Do not edit in-progress Spec 224 or migrate production databases from this document.

## A1. Director Graph: revision granularity, ownership and migration

The Film-owned domain consists of FilmProject, FilmRevision, SceneRevision, Actor/Prop identity, PerformanceRevision, ShotRevision, CameraVariant, ConditioningManifest, GeneratedTake and Approval/Review references. Only *immutable* AssetRefs live outside the Film-domain relational records; existing Project, ACL, Library, credit and job owners remain authoritative. A single `filmRevisionId` contains ordered refs to scene/shot revisions, not mutable inlined copies of every foreign asset. Deleting or revoking a source does not erase history; tombstone/fence derived use according to existing retention and rights policy.

Each Film mutation SHALL carry `tenantId`, `projectId`, `filmId`, `baseFilmRevisionId`, `baseEntityRevisionId` where relevant, `expectedPolicyEpoch`, `intentDigest` and a domain-scoped idempotency key. The server stamps trusted actor identity. *Preview* returns a signed digest and affected dependency set but does not mutate; *Apply* validates the exact digest, current grants/locks/epoch, conditional ownership and active quota before committing one immutable Film revision. Commit and outbox intent must be atomic under the approved existing PG transaction convention. The existing scheduler consumes the outbox after commit; direct provider calls in the transaction are prohibited.

Stable semantic actor/prop IDs and separate visual proxy IDs avoid color-based identity. One actor may have many wardrobe/rig variants with explicitly pinned shot-specific appearance references. Scene imports from glTF/VRM/USD capture importer version, axis and unit transform, texture/mesh rights and source content hashes. A renderer-specific file is not authoritative graph structure. Reverse-export only where certified; a missing USD or glTF exporter does not block native scene draft creation.

## A2. Exact temporal and spatial semantics

For all new Film timing contracts use rational `{num: signed_integer, den: positive_integer}` and normalized lowest terms for storage, with explicit source PTS mapping; no floating-point seconds as canonical persistence. Every Shot SHALL specify a source-time interval `[start,end)`, render frame-rate rational, duration frame count and intentional edit-time offsets. VFR imports preserve PTS and reorder/codec metadata; converting a source clip to CFR requires an immutable map from each generated frame back to source PTS. Changing fps or retiming never silently changes actor velocity, dialogue alignment or camera cut positions.

Every imported spatial asset carries a checked `sourceCoordinateSystem`, `sourceUnitScale`, transform matrix, target `RH_Y_UP_METERS`, skeleton bind pose and explicit handedness/reflection flags; compose transforms in a documented order. Reject non-finite transforms, a missing skeleton root or inverse-bind matrices with ambiguous convention. Time/space conversion manifests are versioned assets that all conditioning passes reference.

## A3. Human performance, rigging and multi-actor interaction

The P0 humanoid acceptance rig defines a named joint mapping with hips/root/head/shoulders/elbows/wrists/knees/ankles and stable actor ID. It records unit scale, root motion, bind pose, joint local rotation representation, sampling/interpolation rule, limits and source license. 2D pose, 3D bones and motion-capture estimates are different sources with distinct confidence and occlusion flags; do not invent missing depth or hand contact from a 2D tracker.

Retargeting must identify source/destination rig profiles, scale compensation, leg-length ratio, floor calibration and explicit error threshold. Contact constraints carry `(actorId, propId, jointId, startFrame, endFrame, contactKind)` and depend on the same shot timebase. Multiple actors and interacting props form an event graph with causality, not a single actor animation list. Missing/invalid contact or collider means a visible quality warning and user correction path, never fabricated certainty. P1 IK/phone mocap remains optional and cannot be required by P0's four stock motions.

## A4. Typed conditioning and per-provider fidelity negotiation

Conditioning manifests are immutable derived assets and must bind **exact** shot, performance and camera variant revisions, clip/frame timebase, source→target coordinate transform, output aspect, per-pass frame count and renderer/compiler hashes. Pose/Depth/Mask/Clay/Keyframe passes SHALL register per-frame coverage and missing-frame policy. Do not imply each model directly accepts all passes or that video-derived pose is a native 3D control interface. Spec 254 evaluates a full certified feature *combination*, not individual marketing feature flags; if a route drops a locked requirement (pose fidelity, camera, face, voice, privacy) it requires a separate quoted human decision. No downgrade by a prompt rewrite alone.

Minimum P0 required outputs are a low-cost storyboard, simple clay video, 2D pose video and first/last keyframes; depth and segmentation are additive. A provider outage does not make a Film scene uneditable. When a future native-scene/skeleton model appears, add a versioned Conditioning Adapter and qualification; Film's semantic IDs and source records remain unchanged.

## A5. Audio ownership and cross-shot continuity

A Film performance's speech cue references must specify actor ID, text revision, spoken language, cue interval, source audio/consent proof and whether speech was intended as native model audio or separately synthesized. Preserve original native baked audio as an immutable master. A generated MP4 with audio does **not** imply editable dialogue/music stems. Localization from Spec 251 and speech via Spec 247 create independent derivatives and do not alter original Film speech/Voice or the Vertical Drama Series Sound Bible. Film QC must detect expected speech count, unexpected speaker, sync and silent/duplicate sound boundaries; unsupported Thai native audio follows an approved separate speech pipeline rather than false success.

## A6. Aspect, shot continuity and responsive review

A shared performance can back separately directed 16:9 and 9:16 camera compositions, each with its own camera-track revision, lens, action-safe region, subtitle-safe zones, take approvals, render costs, exact output digest and certification. If editorial duration differs between variants, create an explicit monotonic retime map from shared performance to each output variant; no silent stretching. Validate character/prop placement, axis-of-action/180° cues, eye lines and preceding/following shot continuity using versioned evidence. Editing an aspect composition invalidates affected derived visuals/exports only; reuse unaffected performance/audio/translated text.

Mobile users must be able to review pose/clay/video, compare changes, approve within authorized budget and request corrections without a local GPU or full 3D UI; all essential information remains readable without generated rich UI. A desktop manual edit to a locked joint, camera or timeline region is authoritative over an AI proposal until explicit unlock and revision rebase.

## A7. Work admission, result acceptance and exact costs

`film.edit.propose` and `film.edit.apply` are distinct semantic actions. Accepted Film revisions may schedule via existing Spec 215/Feature 195 only. An external result from Spec 254 first enters immutable *quarantine candidate* state. Admission to a GeneratedTake requires matching `filmRevision`, `shotRevision`, `performanceRevision`, `cameraVariant`, `renderManifest`, job attempt/lease epoch, source/policy/consent epochs, verified content digests and QC evidence. If the creative base revision has advanced but output is otherwise legitimate, attach the take to the *historical* source revision for explicit rebase/review; never auto-set it as active. Unknown provider outcome means WAITING_RECONCILIATION, not a free duplicate rerun.

Each dependency fingerprint includes exact output-affecting source refs, timebase, renderer/compiler/profile versions, license/rights epoch, model pack digests and selected creative constraints; split **technical reuse key** from **authorization/release eligibility** so a valid cached render cannot bypass revoked rights. Budget and customer settlement remain with Spec 207; Film only displays estimates and receipts.

## A8. P0 delivery slice and independently runnable failure paths

P0 can ship in three strictly independent layers: F-P0a text/script/shot proposals and immutable Film graph, F-P0b native simple 3D scene/performance/pose/clay preview, F-P0c a separately certified video route and optional Spec 253 handoff. F-P0a/b must work with all external execution flags OFF; no mandatory H3, Seedance, GPU, ComfyUI, Cloudflare or hosted agent entitlement. Native direct Film editing works when Spec 253 cross-product interop OFF; existing Video Editor/Drama/Creator functionality works when all Film flags OFF.

**Acceptance gates A252-01–15 (design-only; require real receipts):** A252-01 schema/ACL/revision; 02 actor/prop ID stability; 03 imported axis/unit conversion; 04 rational FPS and VFR PTS; 05 replayable deterministic frame evaluation; 06 humanoid rig + root/IK optionality; 07 multi-actor contact event; 08 provider conditioning fidelity; 09 manual locks and non-destructive proposals; 10 independent vertical/landscape composition/retime; 11 Native Audio immutable preservation; 12 source-consent revocation; 13 stale external candidate quarantine; 14 mobile no-Runner preview/review; 15 legacy three-product flag-OFF regression. Each gate has an assigned source owner, exact fixture SHA, test name and observed receipt before production promotion.


---

# AUDIT-R1.2 — NEW 20-PASS DEEP CONFORMANCE HARDENING (passes 21–40 cumulative)

**Precedence:** This is a normative *proposed* amendment to the full R1.1 text above. It changes only film-domain rules; it does not certify deployed interfaces or modify historical Specs 1–214 / active Spec 224. Contract examples in `CONTRACTS/*.v1.2.schema.json` are independently versioned, and v1/v1.1 snapshots remain readable. Source-owner acceptance and registry reconciliation remain required before merge.

## D1. Positive, portable Film timebase and explicit audio clock (passes 21–22)

Film Shot creation MUST reject `fps.num <= 0`, `fps.den <= 0`, zero/negative duration, overflow/unsafe 53-bit JSON integers and noncanonical rational values; an FPS conversion is not an elapsed-time conversion. Persist source VFR PTS in a stable rational source clock and an explicit mapping for *every* output frame; for canonical fixed-FPS output use `frameTime = (frameIndex * fps.den) / fps.num` with exact integer rational arithmetic. If production needs integer values outside JavaScript safe range, encode signed 64-bit numerator/denominator as decimal strings under a *separate* approved schema version: do not silently round. `durationFrames * fps.den / fps.num` defines video duration only; source-time mapping can differ by retime.

Dialogue/score clock is a separate sample-index domain. `AudioSyncManifestV1_2` SHALL record `audioSampleRate`, source PTS anchor, source/synthetic track lineage, shot video-time ↔ audio-time piecewise monotonic rational map, drift measurement windows, trim/pad/stretch decision, voice identity+consent epoch, and cross-shot J/L-cut transition refs. Never derive word-level alignment by proportional interpolation of sentence timestamps; Spec 247 provides certified forced-alignment evidence or users correct manually. A 23.976 fps VFR source with 44.1 kHz audio, 48 kHz final mix and a vertical variant with different shot cuts is a mandatory fixture. Loss of alignment, overlapping voice consent or unreconciled speaker mismatch blocks approved master, not raw Film Scene editing.

**Acceptance D252-21/22:** Validators reject zero FPS and oversized JSON integers; exact source→video→audio tick round trip has bounded measured residual drift and preserves language-independent source track; wrong-clock fixture rejects export.

## D2. Contact, occlusion, lock ownership and multi-actor retiming (passes 23–24)

The actor/prop interaction graph SHALL attach event identity, actor+prop ownership, rig/joint coordinate frame, exact `[startFrame,endFrame)` interval, collision/contact confidence and source observation type (`KEYED`, `MOCAP_ESTIMATE`, `AI_ESTIMATE`). An inferred 2D pose is never factual 3D joint depth; low-confidence contacts enter `NEEDS_REVIEW`. Retargeting or retiming must preserve event causal order, foot-plant/no-slide windows and hand-object attachments, or emit a blocked constraint/visible override request. Multiple actors interacting with the same object must reject mutually exclusive grip/collision states unless an explicit transfer event connects them.

`lockedFields` is not a global boolean: each protected scene/shot/rig/timeline element SHALL have immutable owner domain, target IDs, base revision, lock provenance (manual/owner-approved/rights), scope (single variant vs all aspect variants) and permitted bypass decision. Reframing or shortening a Film take imported into Video Editor MUST NOT move its unrelated audio/subtitle/locked clips. A changed Drama shot duration does not implicitly modify the 9×10 preset; Drama alone owns a separately reviewed adjustment. Concurrent user/manual and AI proposals use three-way merge with conflict visibility; the model cannot unlock the field it is trying to change.

**Acceptance D252-23/24:** Two actors exchanging an object remain causally aligned after a 1.2× retime; a shot with conflicting hand contacts is flagged; applying a crop/motion change across locked timeline positions yields a reviewable candidate, not mutation.

## D3. Replayable Previs, semantic QA and safe cache invalidation (passes 25–26)

Previs correctness SHALL be assessed at two levels. **Exact structural reproducibility:** same scene revision, rational tick sequence, camera matrices, pose matrices and conditioning pass metadata (including missing/occluded frames) yield equal canonical frame-state digests in the approved deterministic evaluation backend. **Visual tolerance reproducibility:** differences in GPU rasterization, OS fonts, codec, HDR transforms or encoder build are compared under a versioned pixel/geometry/temporal tolerance; identical MP4 bytes MUST NOT be required across heterogeneous GPUs. Every run pins renderer build, runtime/container image hash, codec settings, imported font/assets, color space and comparison policy. Return non-numeric `UNKNOWN` where the active backend cannot prove a metric; no invented precision.

The dependency graph SHALL record every derived pass (pose, depth, segmentation, clay, audio reference, keyframe, aspect crop, encoded take, dub/subtitle/export) against exact source entity, transform, renderer/model/pack versions and approved constraints. Updating a camera variant invalidates that variant's visuals and downstream exports only; changing actor contact/action invalidates relevant performances/cameras, dependent visual outputs and event-synchronized audio. Rights/consent changes are **live authorization gates** even if a cached byte-identical artifact exists; revoke delivery/reuse/publishing and initiate retention policy without rewriting immutable historical provenance. If dependency evidence is incomplete, show a new quote for a conservative rerun.

**Acceptance D252-25/26:** Two-worker frame-state digest equality with documented render-tolerance thresholds; changing portrait crop does not retrigger landscape ASR/TTS; rights revocation blocks cache hit reuse even when digest matches.

## D4. Training/use lineage and content provenance (pass 27)

Every imported performer image, motion recording, reference sound, third-party scene and generated output SHALL preserve independently versioned use restrictions: `INPUT_GENERATION`, `OUTPUT_DISTRIBUTION`, `RETRAINING`, `DERIVATIVE_EDIT`, `EXTERNAL_EGRESS`, territory, expiration and revocation epoch. An output's valid creation receipt does NOT grant LoRA training rights or publication rights; model-specific bans on cross-model distillation remain binding even when output is later edited. Film-generated sources retain the exact licensed model/pack tuple for derivative eligibility checks. Publishing passes exact final transcoded output bytes, subtitles, dubbed audio and thumbnail through existing Spec 227; a previous master release cannot bless a new crop/dub. Optional authenticity manifests may be attached only to bytes actually signed/verified, never presumed by the UI.

**Acceptance D252-27:** A generated clip allowed for private draft but prohibited for training cannot enter dataset/LoRA export; a new translated dub or new crop triggers independent approval without deleting historical creator-owned film drafts.

## D5. R1.2 Film-owned wire contract requirements and cross-system limits

`film-shot-revision.v1.2` is required for new conforming shot writes; v1 snapshots remain readable by explicit adapter but MUST pass R1.2 semantic validation before mutation. `film-performance.v1` and `film-conditioning-manifest.v1` are still supported when validated under D2/D3; do not pretend unimplemented native 3D provider input exists. Film-only tables may be proposed solely after schema-fit with the real deployed schema. Canonical Chat/Task Control remain Feature 196 and Specs 225/226, and any film-specific job/control panel remains a projection, not a second task ledger.
