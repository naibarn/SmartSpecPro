# Feature 137: Vertical Drama Identity-Stable Image-to-Video Pipeline — Video-Safe Start Frames, Face-Observability QC, and Motion Contracts

Version: 1.3.0
Date: 2026-08-01
Status: P1 implementation complete; final Gate A/B rerun and internal real-LLM/browser smoke pending
Author: Conductor session with CMD-1/2/3/4 exploration agents (facts verified in code 2026-07-23)
Priority: P1 (quality-critical for the drama-series product)
Depends-on:
- Feature 131 Vertical Drama Series Storyboard Video Flow (start-frame plan, motion prompt pack, assembly — the pipeline this feature hardens)
- Feature 132 Story Character Quality Engine (angle-grid picker, QC scaffolding, character quality machinery)
- Feature 134 Character Portrait Candidate Batch (portrait candidate generation + JSONB persistence precedent)
Related:
- Feature 135 Hermes Grok Media Worker (Super Grok / grok.com lane; reference caps)
- Feature 136 Marketplace Auto Review Sequential Shot Storyboard (vision-QA / targeted-repair reuse template — marketplace side, NOT modified here)
- Feature 118 Marketplace Auto Review (vision-QA engine idiom: multimodal LLM over image URLs, fail-open verdicts, attempt caps)
Audience: Frontend (CMD-1), Backend (CMD-2), Python (CMD-3, Phase 3 only), Database (CMD-4), QA (CMD-8)
Source reference: user brief + follow-up 2026-07-23 — see `request.md` in this folder. Discovery note: SocratiCode MCP was unavailable this session; ground truth below was gathered by three read-only exploration agents using shell search, per the CLAUDE.md fallback rule.

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-23 | Initial proposed spec: gap/ROI analysis of the 9-component user proposal, 3-phase design (motion contracts + observability riding existing calls → video-safe frames + angle packs + advisory routing → post-video identity QC), grounded in verified file:line facts. |
| 1.1.0 | 2026-07-23 | Render-capacity revision per user-confirmed primary model (kie.ai `gpt-image-2` image-to-image): new §9.5 — per-model prompt budget (`configJson.maxPromptLength`, absolute max 20,000) replacing the flat 3800 assumption, 16-reference capacity, resolution/aspect rules + 2K recommendation for video-safe frames; §3 row, §21 wording, §26.6 pricing question. |
| 1.2.0 | 2026-07-23 | Prompt-philosophy + provider-scoping revision (user direction): new core principle §5.9 "Lock, don't describe" — prompt = story synopsis + only the locked controls, emotional imagination delegated to the render model; §9.3 video-safe directive rides the sub-episode's ACTIVE prompt engine (synopsis engine on GPT-family incl. gpt-image-2) as a compact lock, §14 both-engines row; §9.5.4 capacity values scoped to the kie.ai `gpt-image-2` row ONLY — Magnific (REST) / Higgsfield (MCP) keep existing defaults. |
| 1.3.0 | 2026-08-01 | Current-worktree reconciliation: P1 is the approved implementation scope; P2/P3 remain deferred. Uses long-form tenant flag `verticalDramaMotionContracts`; limits structured `motionProfile` persistence to per-shot/subshot paths; keeps bulk-pack changes prose-only; moves runner-side `camera_motion` prose matching to P2; treats model budgets/reference caps as selected-model capabilities rather than a permanent primary-model assumption. |
| 1.4.0 | 2026-08-01 | Implementation and Section 14 evidence landed: flag-off parity fixtures, joint flag suite, mutation/workspace coverage, and an opt-in real-LLM evaluator. The feature remains default-off until the final baseline gates and internal smoke are attached. |

### Approved implementation scope (2026-08-01)

- Implement P1 only: categorical motion profile, deterministic risk floor,
  face-observability fields riding the existing `frame_analysis`, motion-contract
  authoring/judge rules, persistence on per-shot/subshot clips, and draft-time
  prevention guidance.
- The bulk motion-prompt pack receives conditional motion-safety prose only. It
  does not emit or persist `motionProfile`, because it has no attached start frame
  from which to infer a grounded start-facing value.
- Defer video-safe start frames, character angle packs, post-render observability,
  and post-video identity QC to measured P2/P3 follow-ups.
- Resolve prompt/reference capacity from the selected model's current registry/DB
  capabilities. The kie.ai `gpt-image-2` values below remain a verified provider
  example, not a permanent routing assumption; Seedream and later models keep
  their own limits.
- Use an explicit runner fact such as `motion_contracts: enabled` to activate every
  new conditional skill section. A skill file can change globally, but with the
  fact absent the new rules must remain dormant. Never key activation only on
  “images are attached”, because that would change flag-off tenants.
- The feature adds no extra P1 LLM calls, but it does add bounded input/output
  tokens to existing calls. Cost reporting and credit tests must describe this as
  “zero additional calls”, not “zero marginal cost”.
- Recapture the current focused-test baseline before TDD. The existing
  `verticalDramaShotVideoPromptGeneration` suite currently has one stale retry-count
  assertion (two expected executions versus the four-stage fallback path); resolve
  or explicitly baseline it before attributing any failure to this feature.

---

## 1. Executive summary

Vertical Drama today renders ONE approved start frame per shot and that single
image serves two conflicting jobs: (a) the emotional storyboard artifact the
user approves for story feel, and (b) the literal first frame the
image-to-video (I2V) model animates. When the emotionally strongest frame hides
facial information — profile, bowed head, occlusion by the other actor, small
face — and the video prompt then asks a character to turn or react, the I2V
model must invent facial regions it has never seen. That is the dominant cause
of mid-clip identity drift ("หน้าเปลี่ยน") observed in production.

Field-verified constraint (user, 2026-07-23, via the interim Super Grok manual
workflow): the Grok video family weighs the START FRAME heavily and its use of
additional reference images is currently below the quality bar. Therefore the
architecture principle of this feature is: **identity quality must be carried
by the start frame itself**; multi-reference video modes are provisioned
("เผื่อไว้") but never depended on.

This feature adds, in three flag-gated phases, all additive:

1. **Phase 1 — Motion profiles + motion contracts + observability, riding
   existing LLM calls (near-zero marginal cost).** The per-shot video-prompt
   skill's existing `frame_analysis` vision contract is extended from a
   left↔right position map to a face-observability report; a categorical
   `motion_profile` (facing start/end, turn magnitude, camera-motion class,
   identity risk) is added to the same skill output; the skill writes a
   **motion contract** into the prompt + `negative_motion_prompt` that clamps
   motion to what the start frame can support; the judge scores contract
   compliance. Draft-time skills gain continuity guidance so single-shot
   large reveals stop being written in the first place.
2. **Phase 2 — Video-safe start frames, character angle packs, advisory
   routing.** A per-shot optional `videoStartMediaAssetId` decouples "frame
   the audience sees in the storyboard" from "frame the video model starts
   from" (fallback: the approved frame, unchanged). A risk-gated regeneration
   path builds a video-safe variant from the emotional frame (composition
   ref) + character portraits (identity refs) using the existing
   cinematic-narrative multi-image machinery. Characters gain an optional
   3-angle reference pack (front / left ¾ / right ¾) stored as new
   `verticalDramaCharacterAssets` roles. A deterministic advisory chip
   recommends I2V vs multi-reference vs split — never auto-switching models.
3. **Phase 3 — Post-video identity QC.** A Python-side (Celery `media` queue)
   ffmpeg sampler extracts K frames per generated OR manually imported clip;
   a vision-LLM compares them against the character references + start frame;
   verdicts land on `clips[].identityQc` with a UI badge and a manual
   regenerate path. **No auto-regeneration** (credit protection) and **no
   local CV / face-embedding dependency** in v1 (host memory constraints;
   vision-LLM is the established house idiom).

Everything is additive JSONB / additive enum values — **zero schema
migrations**. With all three flags off, prompts, payloads, and behavior are
byte-identical to today (snapshot-tested, §20).

---

## 2. Problem statement

### 2.1 Mechanism

I2V models receive character identity from exactly one image. Any facial
region not visible in that image is synthesized from the model prior, not from
the character. The risk compounds when: the face is profile/rear/bowed, the
face is occluded (hair, the other actor's head), the face is small relative to
frame, and the motion instruction reveals hidden regions (turning toward
camera, orbiting camera, entering characters). This matches the observed
failure evidence (4 production sample frames analyzed 2026-07-23):

| Sample | Composition | I2V suitability today |
|---|---|---|
| Frame 1 — man nuzzling behind woman, both faces partially hidden/eyes closed | strongest emotion | highest drift risk: any turn/eye-contact instruction fabricates unseen facial regions |
| Frame 2 — both ¾ view, faces separated | good | safe for micro-motion (gaze, blink, small turn, push-in) |
| Frame 3 — woman near-profile, complex body overlap | medium | safe only for glance/chin/hand micro-motion; full turn unsafe. (Also exhibits a second failure class: action misinterpretation — apron ties rendered as literal rope — see §8.5) |
| Frame 4 — both ¾, separated, dialogue blocking | best dialogue anchor | safe for conversation beats |

The product conclusion (user brief): a single image must stop serving both the
"emotional approval artifact" and "video anchor" roles when those roles
conflict — and prompts alone cannot fix hidden-face synthesis.

### 2.2 What the current pipeline lacks (verified)

1. **No vision pass over any RENDERED start frame.** The only frame-time
   quality data is `promptAnalysis` — a prompt-text self-assessment authored
   at prompt time (`shared/verticalDramaSeries/contracts.ts:620`), not an
   image inspection. A `production-shot-image-quality-qa` skill folder exists
   but is wired to nothing (classic taught-not-wired hazard).
2. **No structured motion data.** The video-prompt input set
   (`verticalDramaVideoMotionPromptGeneration.ts:1442-1760`) carries
   description/camera/emotion/dialogue/canonical summary — but no head-turn
   magnitude, no facing start/end, no identity-risk field, and camera motion
   is free prose (per-shot skill rule 3).
3. **One asset per shot.** `frames[].approvedMediaAssetId` is both the
   storyboard display AND `referenceImageUrls[0]` of the video request
   (`routers/verticalDramaEpisodes.ts:11901-11912`).
4. **Single-angle character identity.** Exactly one `primary_portrait` asset
   per character/variant row (`verticalDramaCharacters.ts:320,1077`); no
   angle-matched reference exists when a shot needs a ¾ or profile identity
   anchor.
5. **No post-video identity check.** Clip QA of any kind does not exist in VD;
   thumbnails derive from the start-frame image, never from video frames
   (`verticalDramaThumbnails.ts:32`).

### 2.3 What already works and must not regress

Cross-frame identity at the STILL level is strong (all 4 samples show the same
faces/wardrobe) — the start-frame reference system (portrait vision inputs,
Image-N fail-closed mapping, render-time trim priority) is healthy. This
feature targets only the still→motion boundary.

---

## 3. Verified current state (as-is anchors, 2026-07-23)

All paths under `apps/web/` unless noted. These are the load-bearing facts the
design builds on; implementers should re-verify line numbers at build time.

| Capability | Where | Status |
|---|---|---|
| Frames live in `startFramePlan` JSONB on `vertical_drama_episodes` (`drizzle/schema.ts:20901`, jsonb cols `:20922-20927`); per-frame `promptMode` stamp (`contracts.ts:604`), `promptAnalysis` (`:620`), `angleGrid`/`angleGridAssetIds`, `approvedMediaAssetId` | shared contracts + schema | Shipped (131) |
| Two start-frame prompt engines `policy_safe_rewrite` \| `cinematic_narrative` (+auto), dispatch `selectShotStartFramePromptSystemPrompt` | `verticalDramaStartFrameGeneration.ts:1209-1219`; skills `vertical-drama-shot-synopsis-image-prompt`, `vertical-drama-cinematic-narrative-image-prompt` | Shipped |
| cinematic_narrative attaches vision refs: shot image → portraits (≤4, "Image N reference: name") → location → additional; cap 6 auto-attached | `verticalDramaStartFrameGeneration.ts:1847-1914` | Shipped |
| Image-N↔character mapping skill-authored; lenient validator; 1 corrective retry then throw; re-validated fail-closed at render before credits | `shared/verticalDramaSeries/characterIdentityMap.ts:317-360`; gen `:2185-2255`; render `routers/verticalDramaEpisodes.ts:10060-10072` | Shipped |
| Render ref order character → location → product, trimmed to model cap, identity-lock > environment > product | `routers/verticalDramaEpisodes.ts:10085-10133` | Shipped |
| Image render transports: `gateway` REST \| `mcp` \| `hermes`; fail-closed no-model guard for paid render | `resolveVdMediaTransportDecision` `:10165`; `resolveEpisodeImageModelId` `:10107,12802-12805` | Shipped |
| Angle-variation picker: 3×3 grid of 9 camera angles of the SAME moment, client split, manual tile pick, durable `angleGrid` state incl. `characterIdentitySafety` scoring concept | `generateStartFrameAngleVariations` router; `shared/verticalDramaSeries/angleGrid.ts`; `verticalDramaStartFrameGeneration.ts:294-345` | Shipped (132) |
| Per-shot extra reference images table (additive refs beyond approved frame) | `vertical_drama_shot_references` `schema.ts:21060` (doc `:21048-21058`) | Shipped |
| Video prompt: skill-first + model-family shaping (grok/veo/seedance/other) + `frame_analysis` VISION contract (people[] name + 5-way position + position_source), gated on `characterReferenceImages.length >= 2` | `verticalDramaVideoMotionPromptGeneration.ts:1283,1187-1203,2143`; skill `skills/vertical-drama-shot-video-prompt/skill.md:68-77` | Shipped |
| Judged loop: 2 parallel candidates + 1 judge + ≤1 repair (≤4 LLM calls); judge skill `vertical-drama-video-prompt-judge`; NO optimizer/paraphrase step (repair = full regeneration, locks re-applied) | `:2938-2949,3311,3214` | Shipped |
| Video request carries `referenceImageUrls[]` (start frame = index 0, budget = model cap − 1); "one image" is Grok model CONFIG (`maxReferenceImages: 1`), not transport code | `mediaGenerationService.ts:1048-1067`; router `:11796,11901-11912`; `modelRegistry.ts:867-947` | Shipped |
| Multi-reference-capable video models already registered: `gemini-omni-video` (7 refs, `modelRegistry.ts:1200-1244`), `happyhorse/reference-to-video` (1–9 refs, `verticalDramaReady: true`, `:804-832`), `happyhorse/video-edit` (vid2vid, `:834`) | model registry | Shipped (capability), unused as policy |
| Hermes lane (135): OAuth grok.com session (device-code), tenant flag `hermesMediaWorker` + kill switch, seeded caps image=3 / **video=1** reference | `mediaTransportResolver.ts:92-130`; `hermesConnectionService.ts`; `scripts/seed-media-models-hermes-grok.ts:78,97,118`; `shared/hermesMedia.ts:36,177-201` | Shipped, default off |
| Clips = `motionPromptPack.clips[]` JSONB (`clip.videoTask.videoUrl`); assembly = ffmpeg concat demuxer + re-encode via worker job | persist `routers/verticalDramaEpisodes.ts:14686-14743`; `verticalDramaEpisodeVideoAssembly.ts:401-414,896`; runner `verticalDramaFfmpegAssemblyRunner.ts` | Shipped |
| VD QC persistence: `verticalDramaQcReports` (stage, passed, score, issues, recommendedRepairs) + 131 §16 stage taxonomy incl. `start_frame_image`, `video_clip` | `schema.ts:21327`; writers `verticalDramaQc.ts` etc. | Shipped (store); face checks: none |
| Character identity assets: `verticalDramaCharacterAssets` (role varchar e.g. `primary_portrait`, `approved`, `qcStatus`, `containsHumanFace` declared flag) ; look variants = character rows (`variantType outfit|age_stage`, `sharesFaceWithCharacterId`) | `schema.ts:20693-20717,20661-20669` | Shipped |
| Vision-QA reuse template (multimodal LLM over image URLs, `gpt-4o-mini` default / `gpt-4o` tier, fail-open `!== false` verdict idiom, targeted repair caps, video QA consuming PRE-EXTRACTED sample frame refs) | `marketplaceAutoReviewService.ts:785,3330-3390,2520-2533,24097-24175` | Shipped (marketplace; template only) |
| Python media post-processing: ffmpeg subprocess single-frame extraction + R2 rehost on Celery `media` queue; `storageCopyToPath` staging primitive | `python-backend/app/services/media_pipeline.py:350-391`; `app/api/internal_library.py:1935-1949`; `app/tasks/media_tasks.py:244-269`; `server/storage.ts:452` | Shipped |
| python-backend CV deps: **none** (no numpy/opencv/onnxruntime/insightface/mediapipe); Pillow only | `python-backend/requirements*.txt`, `uv.lock` | Verified absent |
| External model facts: R2V = `grok-imagine-video` only (NOT `-1.5`); 1–7 refs / ≤10s on fal, ≤15s per xAI docs (host-dependent); I2V input documented as "starting point" (not a literal exact-first-frame guarantee); I2V+R2V not combinable | docs.x.ai video-generations guide; fal.ai model pages; x.ai/news/grok-imagine-1-5 | Verified 2026-07-23 |
| Provider-capability example verified for the 2026-07-23 primary: kie.ai `gpt-image-2` image-to-image — prompt ≤20,000 chars, `input_urls` ≤16, resolutions 1K/2K/4K with aspect rules (§9.5); seeded `scripts/seed-media-models-kie-ai.ts:1545+`; per-model prompt-cap machinery already shipped in the media layer (`routers/media.ts:656-691`). Current routing must resolve the selected model rather than assume this row remains primary. | kie.ai API doc + code | Provider limits verified 2026-07-23; routing priority requires current-worktree/runtime verification |

---

## 4. Gap analysis and per-component ROI verdicts

The user proposal has 9 components (`request.md`). Verdicts below weigh value
(drift reduction), cost (build + per-episode runtime credits), and risk to the
shipped 131/132 pipeline. "MODIFIED" = adopted with a design change and the
reason is stated.

| # | Proposal component | Already exists? | Value | Cost | Risk to existing | Verdict → Phase |
|---|---|---|---|---|---|---|
| 5 | Motion-contract video prompts | Partial: family shaping, negatives, judge exist; no motion clamping rules | **High** — attacks the exact failure (prompt frees the model to invent faces) | Low: skill.md rules + judge dimension; 0 new LLM calls | Low (additive prompt content; no optimizer to re-lock) | **ADOPT — P1** |
| 4 | Per-shot motion analysis (`shot_motion` with yaw degrees) | None (no structured motion fields) | **High** — the routing/contract substrate | Low: fields added to the existing per-shot skill call | Low (optional output fields; lenient parse) | **ADOPT-MODIFIED — P1.** Degrees replaced by categorical classes: an LLM cannot measure "12°"; pseudo-precision creates false confidence. Numeric thresholds return only if CV ever lands (§26). |
| 3 | Face Observability QC on start frames | None on rendered frames (`production-shot-image-quality-qa` folder exists, unwired) | **High** | Low at P1 (rides existing `frame_analysis` vision call = +0 calls); Low-Med at P2 (+1 cheap vision call per rendered frame) | Low if fail-open (badge + suggestion, never blocks) | **ADOPT-MODIFIED — P1 (ride-along) + P2 (post-render).** Vision-LLM categorical rubric instead of numeric px/%/degree gates; numbers from the proposal become judge-rubric guidance, not measured values. |
| 6 | Split high-turn scenes into multiple shots | Largely exists: sub-shot machinery (`vertical-drama-shot-video-prompt-subshots`, `VerticalDramaSubShotEditor`, split-shot persist path `:6798-6804`) | Medium-High | Low: draft-time skill guidance + advisory surfacing of existing tools | High if built as an auto-splitter (9-shot structure, dialogue mapping, durations) | **ADOPT-MODIFIED — P1.** Prevention at draft time (skills stop writing single-shot large reveals) + route users to existing sub-shot tools. NO automatic structural splitter. |
| 2 | Video-safe start frame from multi-image generation | Mechanics exist end-to-end (portrait vision refs, additionalImageUrls, Image-N validator, render trim) | **High** | Medium: regen path + dual-asset field + UI | Medium (touches video start-frame resolution; mitigated by strict fallback) | **ADOPT — P2** (risk-gated: generated only when observability/risk flags the shot — not always-dual, to control image credits) |
| 1 | Character identity reference pack (5 canonical angles) | None at character level (single `primary_portrait`); angle machinery exists at shot level only | Medium-High | Medium: generation UI + storage roles + selection logic + pack self-QC | Low (additive asset roles; fallback to portrait always) | **ADOPT-MODIFIED — P2.** 3 angles v1 (front, left ¾, right ¾) not 5 — expression/costume variants are already covered by look-variant rows and add pack-drift risk; generated via the Feature 134 candidate-batch machinery. |
| 7 | Reference-to-Video routing for large angle changes | Capability EXISTS (registry models with 7–9 ref caps; multi-image payload; per-model trim). Grok: capped 1; Hermes video: capped 1 | Medium (today), higher if Grok ref-conditioning improves | Low: advisory logic + registry data only | Low if advisory; High if auto-switching (violates user model-selection policy) | **PROVISION-ONLY — P2.** User field-verdict 2026-07-23: Grok ref processing "ยังไม่ถึงเกณฑ์ดี" — start frame dominates. So: advisory chip + capability plumbing kept warm ("เผื่อไว้"), identity NEVER delegated to refs, no auto-switch ever. |
| 8 | Post-video identity QC (frame sampling + ArcFace embeddings) | None; single-frame ffmpeg extraction + Celery media queue + rehost exist as substrate; marketplace video-QA-over-sample-refs is the template | Medium-High (catches drift before assembly/publish; also covers manually imported Super-Grok clips) | Medium: Python sampler task + vision QC skill + clip fields | Medium: credit burn if auto-regen (forbidden v1); infra risk if CV (rejected v1) | **ADOPT-MODIFIED — P3.** ffmpeg K-frame sampling + vision-LLM comparison. ArcFace/InsightFace REJECTED for v1: zero CV deps today (not even numpy), memory-constrained host (oomd incident history), per-project threshold calibration burden acknowledged by the source brief itself. Revisit criteria in §26. |
| 9 | Four per-shot skill outputs (emotional frame / video-safe frame / identity ref selection / motion contract) | — | — | — | — | **ADOPT as the union of the above** — §7–§11 define exactly these four artifacts; no separate work item. |

Cross-cutting adds not in the proposal:

- **Action-fidelity flag (optional, P2):** the same observability vision call
  reports `action_matches_intent` — catching Frame-3-class errors (apron ties
  rendered as literal rope) at frame time for one extra output field, zero
  extra calls (§8.5).
- **Draft-time prevention (P1):** the cheapest fix of all is for the
  storyboard/deep-draft skills to stop AUTHORING un-animatable beats (§11.3).

Aggregate ROI ordering (value per unit cost): P1 items ≫ observability P2 ≫
video-safe frames ≫ angle packs ≈ advisory routing ≫ post-video QC ≫ any CV
investment (deferred indefinitely).

---

## 5. Core principles

1. **Start-frame dominance (field-verified).** Identity information must be in
   the start frame. Reference images are supplementary and currently
   unreliable on the Grok family — provisioned, never load-bearing.
2. **Emotion without hiding faces.** The video-safe composition language
   (skill references) expresses restraint via distance, eyelines, hands,
   shoulder direction, rim light, DOF, micro-expressions — per the user's
   stated core principle. Video-safe ≠ flat frontal two-shot.
3. **Skill-first.** All creative judgment (observability rubric, motion
   classes, contract wording, composition rules) lives in skill bodies +
   references. TypeScript computes facts (categorical field → risk floor,
   capability math, resolution order) and machine-checkable validators only
   (repo policy, memory `feedback_skill_first_authoring`).
4. **Categorical over pseudo-numeric.** No degree/pixel/percent thresholds
   asserted by an LLM as measurements. Closed enums + lenient normalizers
   (weak-model JSON policy, memory `project_vd_weak_model_json_class`).
5. **Fail-open QC; fail-closed money and mapping.** Observability and identity
   QC warn, badge, and suggest — they never block a render or spend credits on
   their own. Existing fail-closed gates (Image-N mapping at render, no-model
   guard, credit reservation) are untouched.
6. **Advisory routing only.** The system recommends generation modes; it never
   switches a user-selected model (memory
   `feedback_respect_user_model_selection`).
7. **Additive-only persistence.** New data = optional JSONB fields on existing
   envelopes + new varchar role values. Zero migrations; old episodes parse
   unchanged.
8. **No silent capability activation.** Every new skill-output field is
   REQUESTED by the runner contract, covered by a real-file loader test and a
   real-LLM gate test (taught-not-wired failure class, memory
   `project_vd_skill_taught_not_wired`).
9. **Lock, don't describe (minimal-control prompting — user direction
   2026-07-23).** The image prompt stays the shot's story synopsis plus ONLY
   the elements this pipeline must control (identity, safety, observability
   constraints, scene locks). Emotional expression and visual imagination
   are deliberately DELEGATED to the render model — gpt-image-2 composes
   emotion from the story better than over-directed prose does, and the
   pipeline automatically inherits each generation's model improvements.
   Directive blocks are compact constraint lists, never scene description;
   the §9.5 budget headroom exists for locks, not for longer descriptions.

---

## 6. High-level architecture

```text
                       ┌──────────────────────────────────────────────┐
                       │ P1 additions ride EXISTING calls (no new LLM)│
                       └──────────────────────────────────────────────┘
Deep draft / storyboard ──► shot drafts
      │  + motion-continuity guidance (P1, skill.md)      [prevention]
      ▼
Start-frame prompt (2 engines, unchanged)
      ▼
Paid start-frame render (gateway | mcp | hermes, unchanged)
      │
      ├─► P2: async Face-Observability QC (1 vision call, fail-open)
      │        └─► frames[].videoSafety {verdict safe|conditional|risky, …}
      │              ├─ badge in storyboard panel
      │              └─ CTA "สร้างภาพ Video-Safe" (risk-gated regen)
      │                    └─► frames[].videoStartMediaAssetId (P2)
      ▼
Video prompt generation (judged loop, unchanged shape)
      │   frame_analysis (existing vision read of the start frame)
      │     + face-observability fields (P1)          [+0 LLM calls]
      │   + motion_profile categorical output (P1)    [+0 LLM calls]
      │   + MOTION CONTRACT written into prompt/negative (P1)
      │   + judge dimension: contract honors observability (P1)
      ▼
Video generation payload (unchanged formatter)
      │   start frame := videoStartMediaAssetId ?? approvedMediaAssetId (P2)
      │   refs: angle-pack aware ordering within model cap (P2, provision)
      │   advisory chip: i2v_ok | i2v_needs_video_safe | consider_multi_ref
      │                  | split_recommended  (P2, never auto-switch)
      ▼
Clip completes (generated OR manually imported from Super Grok)
      └─► P3: Python sampler (Celery media queue, ffmpeg K frames, rehost)
            └─► vision identity QC vs portraits/angle refs + start frame
                  └─► clips[].identityQc {per-character verdict} + badge
                        └─ manual regenerate / re-import (no auto-spend)
      ▼
Assembly (ffmpeg concat) — unchanged
```

Implementation surface:

```text
apps/web/skills/vertical-drama-shot-video-prompt/            — P1 contract + contract rules (+ subshots twin)
apps/web/skills/vertical-drama-video-prompt-judge/           — P1 judge dimension
apps/web/skills/vertical-drama-video-motion-prompt-pack/     — P1 conditional prose for bulk path; no output-schema change
apps/web/skills/vertical-drama-storyboard-shotgrid/ (+ deep-draft skills) — P1 continuity guidance
apps/web/skills/vertical-drama-start-frame-video-safety-qa/  — NEW (P2) observability QC skill
apps/web/skills/vertical-drama-cinematic-narrative-image-prompt/ — P2 video-safe directive block
apps/web/skills/vertical-drama-clip-identity-qa/             — NEW (P3)
apps/web/shared/verticalDramaSeries/contracts.ts             — optional fields (§15)
apps/web/shared/verticalDramaSeries/motionProfile.ts         — NEW pure module: enums, risk floor, advice
apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts — request/parse new fields; gate widening
apps/web/server/services/verticalDramaStartFrameGeneration.ts — video-safe regen params
apps/web/server/services/verticalDramaFrameObservabilityQc.ts — NEW (P2) runner
apps/web/server/services/verticalDramaClipIdentityQc.ts      — NEW (P3) runner
apps/web/server/routers/verticalDramaEpisodes.ts             — mutations (§16), resolution order, advisory data
apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx — badges, CTA, advisory chip
apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx — angle-pack UI
python-backend/app/tasks/media_tasks.py (+ internal API)     — P3 K-frame sampler task
```

---

## 7. Shot motion profile (P1)

### 7.1 Contract (skill-authored, categorical)

Added to the per-shot video-prompt skill OUTPUT (optional object; lenient
zod + normalizers alongside `frame_analysis`):

```jsonc
"motion_profile": {
  "characters": [{
    "name": "string",                       // must match characterIdentityMap names
    "start_facing":  "frontal|three_quarter|profile|back_of_head|not_visible",
    "end_facing":    "frontal|three_quarter|profile|back_of_head|not_visible",
    "turn_magnitude":"none|subtle|moderate|large",
    "reveals_hidden_side": false            // true when end pose exposes facial regions not visible in the start frame
  }],
  "camera_motion": "locked|push_in|pull_back|small_pan_tilt|small_lateral|orbit|large_reframe",
  "new_character_enters": false,
  "identity_risk": "low|medium|high",
  "risk_reasons": ["string"]
}
```

`start_facing` is grounded in the ATTACHED start frame (the skill already
reads it for `frame_analysis`); `end_facing` in the shot intent
(`canonicalShotSummary` + dialogue + camera prose).

### 7.2 Deterministic risk floor (TS facts, not judgment)

`shared/verticalDramaSeries/motionProfile.ts` — pure:

```text
deriveMotionRiskFloor(profile):
  high   if any reveals_hidden_side || turn_magnitude=large
         || camera_motion in {orbit, large_reframe} || new_character_enters
  medium if any turn_magnitude=moderate
         || (start_facing in {profile, back_of_head, not_visible} && turn_magnitude != none)
  else low
effectiveRisk = maxSeverity(skill.identity_risk, floor)
```

The mapping consumes ONLY closed-enum facts the skill asserted — same
division of labor as the shipped family-shaping resolver (`:1283`).

### 7.3 Storage

Persisted per clip alongside `frameAnalysis` in
`motionPromptPack.clips[].motionProfile` (+ `effectiveRisk` and
`motionContractStatus: "emitted"|"missing"|"invalid"`), stamped by the
existing persist path (`routers/verticalDramaEpisodes.ts:14686-14743`).
Old clips without the field parse unchanged.

Missing or malformed model output is never normalized to a low-risk profile and
never guessed from prose. While the flag is on, a candidate without a valid profile
is scored non-compliant by the existing judged loop. If every bounded candidate
omits or invalidates the field, preserve the selected legacy prompt, persist only
`motionContractStatus` (leave `motionProfile` and `effectiveRisk` absent), emit the
warning event from §23, and do not add another LLM retry. This is fail-open for
availability but measurable and cannot create false low-risk advice.

### 7.4 Routing rule (replaces the proposal's degree table)

| Proposal (degrees) | This spec (categorical) | Action |
|---|---|---|
| ≤15° turn | `turn_magnitude: none\|subtle` | I2V as-is (`i2v_ok`) |
| 15–30° | `moderate` + start ¾ visible + faces separated | I2V allowed; motion contract mandatory (`i2v_ok` w/ contract) |
| >30° | `large` OR observability `conditional` | recommend video-safe frame first (`i2v_needs_video_safe`) |
| profile/back → frontal | `reveals_hidden_side: true` | contract forbids in-shot reveal; recommend sub-shot split (`split_recommended`) and/or multi-ref model (advisory) |
| new person enters | `new_character_enters: true` | `split_recommended` (or multi-ref advisory) |

---

## 8. Face-observability QC on start frames

### 8.1 P1 — ride-along fields on the existing `frame_analysis`

The `frame_analysis` contract (skill.md:68-77; zod `:1187-1203`) gains
optional per-person fields (all lenient):

```jsonc
"people": [{
  "name": "…", "position": "left|…|right",           // existing
  "facing": "frontal|three_quarter|profile|back_of_head|not_visible",
  "eyes_visible": "both|one|none",
  "occlusion": "none|partial|heavy",                  // hair, object, or the other actor
  "face_size": "large|medium|small|tiny",
  "overlapped_by_other_face": false
}],
"position_source": "image|image_prompt_text",          // existing
"faces_separated": true
```

Zero new LLM calls — the vision call already reads the start frame.
**Gate widening (flag-gated):** today `frame_analysis` is requested only when
`characterReferenceImages.length >= 2` (`:2143`). With
`verticalDramaMotionContracts` on,
the request threshold becomes ≥1 attached character reference (an injector
gate must be as broad as its validator's trigger — memory
`project_marketplace_optimizer_strips_locks`). With the flag off the gate is
byte-identical to today.

### 8.2 P2 — post-render observability QC (standalone)

New skill `vertical-drama-start-frame-video-safety-qa` (vision; model via the
marketplace vision-QA idiom — cheap default, tier bump available). Runs
async after `generateStartFrameImage` completes and on demand; skipped when
the frame has no `requiredCharacterRefs`. Output:

```jsonc
{
  "characters": [ …same per-person fields as §8.1… ],
  "faces_separated": true,
  "face_touching_frame_edge": false,
  "action_matches_intent": true,
  "action_mismatch_note": null,
  "video_safe_verdict": "safe|conditional|risky",
  "reasons": ["…"]
}
```

Stamped to `frames[].videoSafety` (+ `analyzedAssetId`, `analyzedAt`,
`skillVersion`) and mirrored as a `verticalDramaQcReports` row with the
EXISTING stage value `start_frame_image` (131 §16 taxonomy — no new stage
enum). The proposal's numeric table (≥75% area, ≥120px @720p, ≤30° yaw…)
becomes the judge RUBRIC prose in `references/observability-rubric.md` —
calibration guidance for the vision judge, never asserted back as
measurements.

### 8.3 Enforcement posture — fail-open, always

`risky`/`conditional` verdicts: badge + CTA only. Never blocks approval,
render acceptance, or video generation. Rationale: stuck-generation history
(memory `project_vd_stuck_gen_and_lost_characters`) and the QC being
LLM-judged (occasionally wrong). A future strict mode is out of scope (§27).

### 8.4 Relationship to the unwired `production-shot-image-quality-qa` folder

The new skill supersedes that folder for VD start frames. Implementation must
either adopt-and-rename it or mark it deprecated in its skill.md — it must not
remain a third, silent variant (taught-not-wired hygiene).

### 8.5 Action-fidelity flag (optional field, same call)

`action_matches_intent=false` + note covers misinterpretation-class failures
(sample Frame 3: "จัดสายผ้ากันเปื้อน" rendered as literal rope binding). Surfaced
as a warning badge only; no dedicated pipeline in v1.

---

## 9. Video-safe start frame (P2)

### 9.1 Dual-role decoupling

```text
frames[].approvedMediaAssetId      — unchanged: storyboard display + default anchor  (emotional frame)
frames[].videoStartMediaAssetId?   — NEW optional: the I2V anchor when present       (video-safe frame)
frames[].videoStartSource?         — "video_safe_regen" | "angle_grid" | "manual_upload"
```

Video generation resolves `videoStartMediaAssetId ?? approvedMediaAssetId` at
the existing assembly site (`routers/verticalDramaEpisodes.ts:11901-11912`).
No value ⇒ behavior byte-identical to today. The storyboard continues to
display the emotional frame; the video-safe frame appears as a secondary
thumbnail on the shot card.

### 9.2 Risk-gated generation (credit control)

The "สร้างภาพ Video-Safe" CTA appears when `videoSafety.video_safe_verdict`
is `conditional|risky` OR `effectiveRisk ≥ medium`. It is a USER action (paid
render, normal credit flow) — the system never auto-spends. Expected volume:
20–40% of shots in dialogue-heavy episodes (§18).

### 9.3 Generation inputs (reuses shipped machinery end-to-end)

Through `generateStartFrameShotPrompt` on the sub-episode's ACTIVE prompt
engine — the synopsis engine (`policy_safe_rewrite`) on GPT-family models
including the primary `gpt-image-2`, `cinematic_narrative` otherwise — with a
flag-gated VIDEO-SAFE directive block appended by the runner contract as a
compact constraint lock (§5.9; render-time identity references attach
regardless of engine per §3):

- Vision refs (existing attach order `:1871-1914`): emotional frame (scene/
  blocking/emotion source) → character portraits or angle-pack refs matched to
  the shot's intended facing (§10.3) → location.
- Directive content (skill references, essence): keep the same moment,
  distance, wardrobe, light, and emotional blocking; open both faces to ¾
  observability; both eyes, nose, mouth, jaw, hairline readable; no head
  overlapping another face; express restraint via eyeline/hands/light — the
  user's worked example prompt in `request.md` is the seed text.
- Image-N mapping validator + render-time fail-closed check apply unchanged.
- Output asset approval: the user picks/approves it exactly like an angle-grid
  tile (`setApprovedStartFrameAsset` sibling mutation, §16); an angle-grid
  tile may also be designated directly as the video-safe frame
  (`videoStartSource: "angle_grid"`), reusing the shipped picker.

### 9.4 Regen carry-over

`projectStartFramePlan` carry-over list (`verticalDramaStartFrameGeneration.ts:430-437`)
gains `videoStartMediaAssetId`, `videoStartSource`, `videoSafety` — same
policy as `approvedMediaAssetId` (survives full plan regen; cleared when the
user clears the approved frame for that shot).

### 9.5 Per-model render capacity (kie.ai `gpt-image-2` provider example)

User-confirmed 2026-07-23: the de-facto primary VD image render model is
kie.ai **`gpt-image-2`** (image-to-image; seed
`scripts/seed-media-models-kie-ai.ts:1545+`; already the platform default in
e.g. `marketplaceIntelligenceService.ts:1021`). API capacity: **prompt ≤
20,000 chars; `input_urls` ≤ 16; aspect list incl. 9:16; resolutions
1K/2K/4K**.

1. **Per-model prompt budget (replaces the flat 3800 assumption).** The media
   layer already resolves per-model caps via `configJson.maxPromptLength`
   with hard enforcement (`resolveModelMaxPromptLength` /
   `assertMediaPromptWithinModelLimit`, `routers/media.ts:656-691`). The VD
   layer adopts the same source: effective image-prompt budget =
   `configJson.maxPromptLength ?? VD_IMAGE_PROMPT_MAX` (3800 stays the
   default for unconfigured models), clamped by a new
   `VD_IMAGE_PROMPT_ABSOLUTE_MAX = 20000`. Model-aware enforcement replaces
   the constant at: `verticalDramaStartFrameGeneration.ts:2040` (policy-safe
   throw), `verticalDramaPromptQc.ts:119`, router zod `:13469` (schema max
   becomes the absolute max; per-model check at runtime), and the UI
   character counter (`contracts.ts:1349` note). Seed-data change:
   `gpt-image-2` image-to-image row gains `maxPromptLength: 20000` and
   `maxReferenceImages: 16` (verify current seeded values at
   implementation). Effect: video-safe directive blocks, Image-N mapping
   prose, and Feature 138's scene lock fit WITHOUT compression on
   gpt-image-2; the LLM-compression path remains for small-budget models.
2. **Resolution/aspect rules (operational trap).** Requesting 2K/4K with
   `aspect_ratio` auto/unspecified FAILS the task — the payload MUST send an
   explicit `aspect_ratio: "9:16"` whenever resolution ≥ 2K (also: 5:4/4:5
   are 1K-only; 1:1 cannot be 4K). Video-safe start frames SHOULD render at
   **2K with explicit 9:16** — larger face pixels directly serve the
   observability goals — pending the §26.6 pricing check; 1K stays the
   default elsewhere.
3. **Reference capacity.** 16 `input_urls` comfortably carries start-frame
   composition refs + portraits/angle refs + location + Feature 138's scene
   neighbor; existing trim priorities (§3) remain the governing order for
   smaller-cap models.
4. **Provider scoping (user direction 2026-07-23).** These capacity values
   bind ONLY to the kie.ai `gpt-image-2` model row. Other image providers
   used by VD — e.g. Magnific (direct REST, credit-billed) and Higgsfield
   (MCP, subscription-billed) — have very different constraints and MUST
   keep the existing defaults (3800 budget, their own reference caps)
   unless their own registry rows are explicitly configured. Capacity is
   per (provider × model) registry data — never a family-wide or
   platform-wide assumption.

---

## 10. Character identity reference packs (P2)

### 10.1 Storage — additive roles on the existing assets table

`verticalDramaCharacterAssets.role` (varchar) gains values:
`angle_front`, `angle_left_three_quarter`, `angle_right_three_quarter`
(alongside `primary_portrait`). Per character/variant row, ≤1 approved asset
per angle role. `qcStatus`/`approved` columns govern usability as today. Look
variants keep owning wardrobe/age changes — angle packs are FACE/HAIR identity
anchors; wardrobe continuity remains prompt-governed (DNA excludes wardrobe —
memory `project_vd_dna_fingerprint_wardrobe_and_occupation_fallback`).

### 10.2 Generation

Character Stock Panel action "สร้างชุดมุมอ้างอิง (3 มุม)" → three renders via
the Feature 134 portrait-candidate machinery, each attaching the approved
`primary_portrait` as the identity vision ref plus an angle directive.
Candidates require user approval per angle (pack self-QC: the §8.2 skill runs
on each candidate with an extra `same_identity_as_reference` verdict —
fail-open badge, approval remains manual).

### 10.3 Selection

`resolveReferencePortraitUrl` (`verticalDramaCharacters.ts:413`) gains an
optional `desiredFacing` parameter → returns the approved matching angle asset
else falls back to `primary_portrait` (always non-breaking). Consumers:
video-safe regen (§9.3, facing from `motion_profile.characters[].start_facing`
or planned blocking) and the render-time reference list for multi-ref-capable
video models (§11.4) — within existing trim priority (`:10085-10133`).

### 10.4 Deliberate exclusions

No `expression` or `costume` canonical images in v1 (proposal asked for 5):
expressions are shot-local (belong in the frame prompt), costume canon is the
look-variant system. Each extra canonical image is itself a drift surface that
must be QC'd; 3 angles is the smallest set that covers ¾-dominant drama
blocking.

---

## 11. Motion contracts and generation-mode advisory

### 11.1 Motion contract in the video prompt (P1)

The per-shot and subshot skill rules are driven by §7/§8 data the same call
produced. The bulk pack has no grounded start-frame analysis, so it receives only
the explicit flag-activated, image-conditioned identity-preserving guidance and no
structured profile/output contract:

- When any character's observability is not `frontal|three_quarter` with
  `occlusion: none|partial` → the prompt must state the preserved facial
  angle ("keeps the same left three-quarter facial angle throughout"), limit
  motion to blink/breath/gaze/micro-expression/hand beats, and forbid
  revealing hidden facial regions.
- `negative_motion_prompt` must include (model-family-shaped wording): camera
  orbit, profile-to-frontal transformation, face occlusion/overlap, new
  facial interpretation, sudden expression change — merged with the existing
  artifact negatives (skill.md:275-276).
- Camera motion vocabulary in the prompt must match
  `motion_profile.camera_motion` (no "slow push-in" prose with `orbit`
  declared).
- Contract lines scale with risk: `low` adds nothing beyond today (prompt
  stays natural — over-restriction makes static clips).

### 11.2 Judge dimension (P1)

`vertical-drama-video-prompt-judge` gains one scored dimension: "motion
contract honors frame observability" (candidate that instructs unseen-region
reveals loses). Same ≤4-call loop; no new calls.

### 11.3 Draft-time prevention (P1)

Storyboard/deep-draft skills (`vertical-drama-storyboard-shotgrid`, deep-draft
sub-episode drafting) gain continuity guidance: a beat requiring
back/profile → frontal reveal, or a mid-shot character entrance, must be
authored as TWO shots (action beat + reaction cut — the user's Shot A/B/C
pattern) or flagged for the sub-shot editor. This is guidance to the authoring
LLM, not a validator — drafts remain free-form.

### 11.4 Generation-mode advisory (P2 — never auto-switch)

`shared/verticalDramaSeries/motionProfile.ts` exposes
`adviseGenerationMode(effectiveRisk, videoSafety, modelCaps)` →
`i2v_ok | i2v_needs_video_safe | consider_multi_reference_model |
split_recommended` per §7.4. Rendered as a chip on the shot card with Thai
copy + reason. Facts only from the model registry
(`maxReferenceImages`, `generateType`); the user's selected model is NEVER
changed by the system (fail-closed no-model guard untouched). Multi-ref
advice appears only when a `verticalDramaReady` multi-ref model exists for
the tenant AND explicitly carries the caveat that reference conditioning is
supplementary (start-frame dominance, §5.1). Hermes lane: video reference
cap is 1 today (`seed-media-models-hermes-grok.ts:118`) — the chip must not
recommend multi-ref on the Hermes transport until its bounds change.

---

## 12. Post-video identity QC (P3)

### 12.1 Sampling (Python, outside the web cgroup)

New Celery task on the existing `media` queue:
`extract_clip_qc_frames(source_url|storage_key, positions=[0.10,0.40,0.70,0.95], max_frames=6)`
— sequential single-frame `ffmpeg -ss <t> -frames:v 1` invocations (the
shipped `_generate_video_thumbnail` pattern, `media_pipeline.py:350-388`;
30s timeout each; bounded concurrency 1 per worker), rehosted via the shipped
R2 rehost path (`media_tasks.py:244-269`). Triggered by Node when
`clip.videoTask` completes AND for manually imported clips (the Super Grok
workflow — first-class citizen here). Failure ⇒ `identityQc.status:
"samples_unavailable"` warning; never blocks.

### 12.2 Vision identity QC

New skill `vertical-drama-clip-identity-qa`: inputs = sampled frames +
per-character references (angle pack or portrait) + the actual start frame.
Output per character: `verdict: "consistent|minor_drift|identity_break"`,
`drift_kind?: "face|hair|age|wardrobe|character_swap"`, `worst_frame_index?`,
`note`. One vision call per clip (all samples in one multi-image call — the
marketplace sample-refs QA pattern, `marketplaceAutoReviewService.ts:24097-24175`).

### 12.3 Persistence and UX

`motionPromptPack.clips[].identityQc` + a `verticalDramaQcReports` row with
existing stage `video_clip`. Clip card badge (เขียว/เหลือง/แดง) + issue notes +
one-click MANUAL regenerate (existing mutation) or re-import. **No automatic
regeneration** in v1 — video is the most expensive unit; auto-spend loops are
forbidden (credit-loss-guard house policy). An opt-in bounded auto-retry is
future work (§27).

### 12.4 CV/embedding approach — rejected for v1, with revisit criteria

Rejected because: python-backend has zero CV dependencies today (§3), the
host has an active memory-pressure regime (oomd + cgroup limits; ffmpeg
D-state history — memories `project_host_memory_purgatory_defense`,
`project_vd_assembly_cgroup_throttle`), and embedding thresholds require
per-project calibration the source brief itself flags. Revisit only if ALL
hold: (a) a labeled drift set shows vision-LLM QC misses ≥20% of true
identity breaks, (b) inference can run on a worker with ≥2 GB free headroom
or externally, (c) calibration data exists from Phase 3 verdict history.

---

## 13. Interim Super Grok workflow (supported, not replaced)

The manual lane (generate on Super Grok → import the file into the
storyboard) remains valid. This spec touches it in exactly two ways:
imported clips get P3 identity QC like generated ones (§12.1), and the P1/P2
prompt + video-safe-frame outputs are copy-ready for manual use (the shot
card already exposes the prompt; the video-safe frame becomes the image the
user uploads to Super Grok). The Hermes worker (135) automates this same
account lane later; nothing in this spec depends on it.

---

## 14. Skills touched — request-gated activation

| Skill | Change | Phase |
|---|---|---|
| `vertical-drama-shot-video-prompt` (+ `-subshots`) | output fields §7.1/§8.1; motion-contract rules §11.1; family-shaped negative vocabulary | P1 |
| `vertical-drama-video-prompt-judge` | contract-compliance dimension | P1 |
| `vertical-drama-video-motion-prompt-pack` | conditional motion-safety prose only; no `motion_profile` output or persisted field because the bulk path has no grounded start frame | P1 |
| `vertical-drama-storyboard-shotgrid` + deep-draft drafting skills | motion-continuity authoring guidance | P1 |
| `vertical-drama-cinematic-narrative-image-prompt` + `vertical-drama-shot-synopsis-image-prompt` | VIDEO-SAFE directive block (runner-injected, flag-gated, BOTH engines — §9.3) | P2 |
| `vertical-drama-start-frame-video-safety-qa` | NEW — §8.2 (+ `references/observability-rubric.md`) | P2 |
| `vertical-drama-clip-identity-qa` | NEW — §12.2 | P3 |

Rules for every row: lowercase `skill.md` is canonical with a byte-identical
`SKILL.md` twin (memory `project_vd_skill_dualcase_file_drift`); every new
output field is explicitly REQUESTED in the runner contract when the flag is
on; each ships with a real-file loader test and a real-LLM gate test (§21).

---

## 15. Data model (all additive, zero migrations)

```text
startFramePlan.frames[] (contracts.ts):
  videoSafety?          { characters[], faces_separated?, face_touching_frame_edge?,
                          action_matches_intent?, action_mismatch_note?,
                          video_safe_verdict, reasons[], analyzedAssetId,
                          analyzedAt, skillVersion }
  videoStartMediaAssetId?  string
  videoStartSource?        "video_safe_regen" | "angle_grid" | "manual_upload"

motionPromptPack.clips[] (contracts.ts):
  motionProfile?        §7.1 object
  effectiveRisk?        "low" | "medium" | "high"
  motionContractStatus? "emitted" | "missing" | "invalid"
  identityQc?           { status: "pass"|"warn"|"fail"|"samples_unavailable",
                          characters[]: {name, verdict, drift_kind?, worst_frame_index?, note},
                          sampleUrls[], analyzedAt, skillVersion }

verticalDramaCharacterAssets.role (varchar — new VALUES only):
  "angle_front" | "angle_left_three_quarter" | "angle_right_three_quarter"

verticalDramaQcReports: reuses existing stages "start_frame_image" / "video_clip".
frame_analysis (clip jsonb): per-person optional fields of §8.1.
```

Zod: every new field optional + lenient enum normalizers; old JSON parses
unchanged (backward compat is a tested acceptance criterion, §22).

---

## 16. API surface (tRPC, `verticalDramaEpisodes` router)

| Procedure | Kind | Notes |
|---|---|---|
| `runStartFrameVideoSafetyQc({episodeId, shotNumber})` | mutation | P2; async; LLM-credit metered like other skill calls; idempotent per assetId |
| `generateVideoSafeStartFrame({episodeId, shotNumber})` | mutation | P2; paid render; wraps the §9.3 path; same credit flow as `generateStartFrameImage` |
| `setVideoStartFrameAsset({episodeId, shotNumber, mediaAssetId\|null, source})` | mutation | P2; also reachable from the angle-grid picker; null clears back to approved-frame behavior |
| `generateCharacterAnglePack({characterId})` / `approveCharacterAngleAsset(...)` | mutations | P2; Character Stock Panel; F134 machinery |
| `runClipIdentityQc({episodeId, clipNumber})` | mutation | P3; also auto-enqueued on clip completion/import when flag on |
| `getEpisodeDetail` (existing) | query | returns the new optional fields verbatim; advisory chip computed client-side from returned facts via the shared pure module |

Zod inputs follow existing per-shot mutation patterns (tenant + ownership
guards identical to sibling procedures). No Express routes. Python: one
internal endpoint or Celery signature for `extract_clip_qc_frames` following
the `internal_library` frame-extraction precedent (`internal_library.py:1935`).

---

## 17. UI requirements (Storyboard Panel + Character Stock Panel)

1. Shot card (VerticalDramaStoryboardPanel): observability badge on the
   approved frame — เขียว "พร้อมทำวิดีโอ" / เหลือง "มีข้อจำกัดการขยับ" / แดง
   "เสี่ยงหน้าเพี้ยน" + reason tooltip; secondary thumbnail when
   `videoStartMediaAssetId` set, labeled "เฟรมสำหรับวิดีโอ", with swap/clear;
   CTA "สร้างภาพ Video-Safe" per §9.2; advisory chip per §11.4.
2. Clip card: identity-QC badge + per-character notes + "ตรวจอีกครั้ง" and the
   existing regenerate button (P3).
3. Character Stock Panel: angle-pack section (3 slots + generate button +
   per-slot approve), `needsSetup` untouched.
4. Discoverability rule: every new affordance mounts on the DEFAULT-visible
   card surface, not inside a collapsed section (memory
   `project_shipped_but_undiscoverable`).
5. All copy Thai-first matching the panel's existing tone; storage writes via
   the safeStorage guard pattern where client persistence is involved
   (memory `project_vd_localstorage_quota_blocks_model_select`).

---

## 18. Credits and cost model (per 9-shot sub-episode, defaults)

| Phase | New LLM calls | New image renders | New video spend | Net |
|---|---|---|---|---|
| P1 | +0 calls (fields ride existing frame_analysis/judged loop; bounded token increase) | 0 | 0 | small token/credit overhead; no new call or render |
| P2 observability | +≤9 cheap vision calls (post-render QC; skip no-character frames) | 0 | 0 | small, bounded |
| P2 video-safe | 0 beyond the render's own prompt call | +2–4 typical (risk-gated, user-initiated) | 0 | user-controlled |
| P2 angle packs | 0 | one-time +2–3 per main character per look | 0 | one-time |
| P3 | +≤9 vision calls (one per clip, batched samples) | 0 (ffmpeg only) | 0 (manual regen only) | small vs video cost |

Guardrails: no auto-spend anywhere; every paid render passes the existing
credit reservation + fail-closed model guard; QC calls are metered like other
skill calls and disabled with their flag.

---

## 19. Feature flags and rollout

| Flag (tenant, default OFF) | Gates |
|---|---|
| `verticalDramaMotionContracts` | P1: per-shot/subshot contract request lines, judge facts, frame_analysis field requests + gate widening (§8.1), bulk prose guidance, and draft-time guidance injection |
| `verticalDramaVideoSafeStartFrames` | P2: post-render QC, video-safe regen + dual-asset resolution, angle packs, advisory chip |
| `verticalDramaClipIdentityQc` | P3: sampler trigger + clip QC + badges |

Rollout: P1 on internal tenant → measure (§23 metrics) → P1 GA; P2 internal →
GA; P3 internal → GA. P1 does not depend on deferred P2/P3 QC. Before P1 GA,
evaluate at least 30 labeled start-frame/desired-motion fixtures: ≥90% of
medium/high-risk cases must preserve the visible facial angle, zero high-risk case
may instruct a large hidden-side reveal, and call counts must equal baseline. Track
manual clip regens across ≥3 internal episodes as a product outcome, but do not make
a noisy 30% reduction statistically binding until P1+P2 both run. P2's calibration
gate remains <10% false-`risky` against a 30-frame labeled set.

---

## 20. Impact on existing behavior — isolation guarantees

1. **All flags off ⇒ byte-identical runtime behavior**: runner-built user/judge
   prompts, frame_analysis request text and its ≥2 gate, image prompts, provider
   payloads, DB reads, persisted shapes, and credit estimates are snapshot-tested
   (§21). Skill system-prompt files may gain compact conditional sections, but their
   activation fact is absent and real-file/behavior tests prove those sections are
   dormant; the skill file bytes themselves are not expected to match merge-base.
2. `videoStartMediaAssetId` absent ⇒ video request assembly identical
   (`:11901-11912` fallback).
3. Per-shot/subshot skill OUTPUT schema additions are optional fields — existing
   persisted clips/frames and the lenient parsers are unaffected. The bulk pack
   schema is unchanged; its P1 behavior is prose-only.
4. Existing fail-closed layers untouched: Image-N mapping (prompt + render),
   `resolveEpisodeImageModelId`, provider-routing `VD_VIDEO_MODEL_NOT_FOUND`,
   credit reservation, Hermes bounds.
5. Marketplace: zero shared code changed (VD start-frame lineage is separate
   from the marketplace frame-strategy card — verified).
6. Hermes/135: no cap or contract changes; advisory logic only READS bounds.
7. `projectStartFramePlan` carry-over list is EXTENDED (§9.4) — a deliberate,
   tested behavior change visible only when the new fields exist.
8. Known-red baseline: `generateShotVideoPrompt`/split suites carry a
   pre-existing red set — P1 test verification MUST use fail-set identity
   diff, not raw pass counts (memory
   `project_vd_video_prompt_suites_red_baseline`).

---

## 21. Validation rules and hard failures

Hard failures (throw, before credits — all pre-existing, re-asserted):
Image-N mapping contradiction after 1 corrective retry; no image/video model
selected for a paid generation; tenant/ownership guard failures.

Warnings (fail-open, persisted): `video_safe_verdict != safe`;
`action_matches_intent=false`; `identityQc.status != pass`;
`samples_unavailable`; missing/invalid P1 motion profile (status is not coerced to
`low`). P1 does not attempt deterministic prose matching between
the generated Thai/English prompt and `camera_motion`; the judge scores contract
compliance. A language-aware runner check, if evidence shows it is needed, is a
separate P2 item with its own tests.

Never: mechanical truncation of prompts (budget flows unchanged in shape —
the image budget is per-model per §9.5, `VD_VIDEO_PROMPT_MAX` untouched);
auto model switching; auto paid regeneration.

---

## 22. Testing plan

1. **Unit (pure):** `motionProfile.ts` risk floor + advice matrix; resolution
   order `videoStart ?? approved`; carry-over extension; lenient enum
   normalizers for every new field (off-enum + missing + junk inputs).
2. **Snapshot isolation:** flags off ⇒ runner contract strings, activation facts,
   frame_analysis request + gate condition, DB reads, persisted clip shape,
   image-prompt text, and video payload assembly byte-identical to recaptured
   baseline fixtures. Skill-file changes are tested for conditional dormancy rather
   than merge-base byte equality.
3. **Taught-not-wired gates (mandatory per new skill field):** real-file
   loader test (skill.md loads; REQUEST lines present when flag on; absent
   when off) + real-LLM gate test asserting the model actually emits
   `motion_profile`/observability fields on a fixture shot (house pattern,
   memory `project_vd_skill_taught_not_wired`).
4. **Judged-loop tests:** contract-compliance dimension affects candidate
   selection on crafted fixtures; ≤4-call budget preserved. Use once-queue
   hygiene (drain mockReturnValueOnce leaks — memory
   `project_vitest_once_queue_leak`) and verify against the red baseline by
   fail-set identity diff.
5. **Cost/activation tests:** no extra P1 LLM call; bounded token growth is present
   only with `verticalDramaMotionContracts`; a model volunteering new fields while
   the flag is off is ignored; bulk output schema remains unchanged. Missing and
   malformed profiles consume no retry beyond the existing bounded judged loop,
   persist the correct status, leave risk absent, and never produce `i2v_ok` by
   treating absence as low risk.
6. **P2:** observability runner (skip-no-character, idempotency per assetId,
   fail-open persistence); video-safe regen path attaches emotional frame +
   angle-matched refs and passes the mapping validator; angle-pack selection
   fallback to `primary_portrait`.
7. **P3 (pytest):** sampler task — positions, timeout, rehost, failure ⇒
   `samples_unavailable`; Node trigger on completion AND on manual import.
8. **Labeled-set calibration:** 30 frames (safe/conditional/risky) + 10 clips
   (consistent/drift/break) as fixtures; assert verdict accuracy thresholds of
   §19 before each GA.

---

## 23. Observability

Audit events (existing audit JSONL + trace-id conventions):
`vd_motion_contract_generated` (shot, effectiveRisk?, contractStatus, modelFamily,
observabilityPresent, contractPresent, ms),
`vd_frame_observability_qc` (verdict, reasons, model, ms),
`vd_video_safe_frame_generated` (source, shot), `vd_clip_identity_qc`
(status, per-character verdicts), `vd_generation_mode_advice` (advice,
accepted-model unchanged). Metrics for GA gates: manual clip-regen count per
episode; verdict distribution; advice-shown vs user-action.

---

## 24. Security and safety

No new secret surfaces; skill calls receive image URLs and character facts
only (never env/keys — house rule). Tenant/ownership guards copied from
sibling procedures on every new mutation. Imported clips: tenant-owned media
assets only (existing import path's checks). Python sampler validates the
source is a platform storage key/URL (no arbitrary-URL fetch — SSRF guard per
existing internal-endpoint patterns). Safety directives and age policies in
image/video prompts are unchanged; the video-safe directive block is appended
via the runner (deterministic), not paraphrased (no optimizer in this
pipeline — verified §3).
Audit events never include full prompts, signed image URLs, character prose, or
reference-image payloads; they record only bounded enums, ids, timing, and outcome.

---

## 25. Acceptance criteria (summary)

- P1: with `verticalDramaMotionContracts` on, a fixture shot whose start frame hides a
  face yields a video prompt that names the preserved facial angle, restricts
  motion, and carries the family-shaped negatives; judge prefers the
  compliant candidate; a missing/malformed profile is visibly `missing|invalid`
  rather than low-risk; flags off ⇒ snapshots identical.
- P2: a `risky` frame shows the badge + CTA; generating a video-safe frame
  never alters `approvedMediaAssetId`; video request uses the video-safe
  asset as `referenceImageUrls[0]` when set and falls back cleanly when
  cleared; angle-pack selection degrades to portrait; advisory chip never
  changes the selected model.
- P3: a completed or imported clip gets sampled frames + per-character
  verdicts; sampler failure degrades to `samples_unavailable` without
  blocking; no automatic credit spend exists on any QC path (asserted by
  test).
- All new JSONB fields round-trip through `getEpisodeDetail` and old episodes
  without the fields render unchanged.

---

## 26. Open questions and revisit triggers

1. Grok reference-conditioning quality — user-verified weak today; re-evaluate
   the multi-ref advisory weight when xAI ships improved reference handling
   (watch `grok-imagine-video` releases; capability values live in model
   registry `configJson`, so re-weighting is data, not code).
2. Hermes video reference bound (1 today) — if the grok.com surface exposes
   multi-ref later, update seeds + advisory; requires 135-side verification.
3. Exact-first-frame semantics: xAI documents the image as "starting point";
   if observed drift-at-frame-0 becomes material, add a start-frame-vs-frame-0
   check to P3 QC (cheap: compare sample[0] against the start frame in the
   same vision call).
4. CV/embedding QC — revisit criteria fixed in §12.4.
5. Strict blocking mode for observability QC — only after false-positive rate
   is proven <5% on the labeled set.
6. kie.ai `gpt-image-2` 2K/4K credit pricing — verify the cost mapping before
   defaulting video-safe renders to 2K (§9.5); stay on 1K if 2K pricing is
   disproportionate.

---

## 27. Explicit non-goals (v1)

- No automatic shot splitting; no changes to the 9-shot sub-episode structure.
- No automatic model switching or automatic paid regeneration of any kind.
- No numeric CV thresholds, face embeddings, or new Python CV dependencies.
- No changes to marketplace auto-review, Hermes contracts/caps, contact-sheet
  batch mechanics, or the assembly/render pipeline.
- No always-on dual-frame generation (video-safe frames are risk-gated and
  user-initiated).
- No expression/costume canonical packs (look variants own costume identity).

---

## 28. Source references

- User brief + follow-up 2026-07-23 (`request.md`), incl. the field-verified
  start-frame-dominance observation and the Super Grok interim workflow.
- Code facts: three read-only exploration fact sheets 2026-07-23 (start-frame
  pipeline; video prompt/generation/transport; identity assets + QC infra +
  python feasibility) — file:line anchors embedded throughout §3.
- External: xAI video-generations guide (docs.x.ai — R2V on
  `grok-imagine-video` only, I2V "starting point", ≤15s); fal.ai
  `xai/grok-imagine-video/reference-to-video` (1–7 refs, ≤10s, host-dependent
  limits); x.ai/news/grok-imagine-1-5.
- Prior art: Features 131 (§7 data model, §16 QC taxonomy), 132 (§19
  angle-grid upgrade), 134 (candidate batch), 135 (Hermes lane), 136 (§3.4
  shared-guard pattern, vision-QA idiom), 118 (QA/repair engine).
