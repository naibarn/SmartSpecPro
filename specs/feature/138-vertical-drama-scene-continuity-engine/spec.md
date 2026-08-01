# Feature 138: Vertical Drama Scene Continuity Engine — Scene Visual State Locks, Sequential Frame Anchoring, Location Coverage Packs, and Continuity QC

Version: 1.3.0
Date: 2026-08-01
Status: P1a implementation complete; P1b neighbor-anchor canary deferred; current-worktree Gate A/B revalidated with no new failure identity; internal smoke pending
Author: Conductor session with CMD-2/4 exploration agent (facts verified in code 2026-07-23)
Priority: P1 (quality-critical for the drama-series product; sibling of Feature 137)
Depends-on:
- Feature 131 Vertical Drama Series Storyboard Video Flow (start-frame plan, storyboard `distinct_locations`, per-shot render path)
- Feature 132 Story Character Quality Engine (quality ledgers F132B — shipped; consistency ledger)
Related:
- Feature 137 Vertical Drama Identity-Stable I2V Pipeline (sibling spec, same session: face identity. 138 = the WORLD stays the same place; 137 = the PERSON stays the same person. Shared QC skill via request-gated field groups — §10, §12)
- Feature 134 Character Portrait Candidate Batch (candidate-gallery precedent, reused by location coverage packs)
Audience: Frontend (CMD-1), Backend (CMD-2), Database (CMD-4), QA (CMD-8)
Source reference: user report + 3-consecutive-shot evidence 2026-07-23 — see `request.md` in this folder. Discovery note: SocratiCode MCP unavailable this session; ground truth gathered by a read-only exploration agent via shell search per the CLAUDE.md fallback rule.

---

## Revision history

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-23 | Initial proposed spec: root-cause analysis of same-scene visual drift (incl. the lighting-variety rule conflict), scene visual state locks, sequential neighbor anchoring, location coverage packs, continuity QC shared with Feature 137. |
| 1.1.0 | 2026-07-23 | Adopts the per-model prompt budget of 137 §9.5 (primary model kie.ai `gpt-image-2`: ≤20,000-char prompts, ≤16 input images): §7.4 budget wording, §8.3 capacity note — the scene lock block no longer competes with the flat 3800 cap on the primary model. |
| 1.2.0 | 2026-07-23 | Lock-lean revision (user direction, 137 §5.9): the SCENE CONTINUITY LOCK injects as a compact constraint lock — locked facts only, emotional interpretation delegated to the render model (§7.4); provider scoping inherited from 137 §9.5.4 (kie.ai `gpt-image-2` row only; Magnific/Higgsfield keep existing defaults). |
| 1.3.0 | 2026-08-01 | Current-worktree reconciliation: P1 is staged into C1 Scene Visual State Lock first and C2 Neighbor Anchor canary second; uses long-form flags; records selected-model capacity and serial-per-scene latency; corrects the actual location-data source; and requires Feature 140's object ledger to own prop persistence instead of duplicating it in `active_props`. |
| 1.4.0 | 2026-08-01 | P1a scene-state planning, lock injection, optimistic-concurrency mutations, and minimal UI are implemented and covered by focused tests. P1b neighbor anchoring remains an explicit later canary; rollout evidence is recorded in the Section 14 verification report. |

### Approved staged implementation scope (2026-08-01)

- Stage P1a: Scene Visual State authoring, compact lock injection across batch,
  per-shot image, and video prompt builders, same-scene lighting override, state
  persistence/carry-over, manual edit API, and minimal provenance UI.
- Stage P1b: Neighbor anchoring behind dedicated flag
  `verticalDramaSceneNeighborAnchors`, rolled out as a separate internal canary.
  Batch generation may run scenes in parallel, but
  shots within one scene must run sequentially so a generated predecessor can be
  used before any frame is approved. Measure latency and anchor-drop events before
  GA.
- Defer location coverage packs and continuity QC to P2.
- Feature 140's episode object ledger is the future source of prop persistence.
  This feature may render derived active-prop facts, but must not create a second
  independently-authored prop store.

---

## 1. Executive summary

Consecutive shots of the SAME scene render as different places: lighting jumps
from sunset to midday, set geometry (water tank, doorway, skyline) rearranges
itself, wardrobe drifts, and props appear and vanish — even though a location
reference image is attached to every generation. Verified root causes:

1. **Every start frame is an independent render.** Production flow is per-shot
   (`generateStartFrameImage`); the contact-sheet batch path is dry-run only.
   Shot N+1 never sees shot N's rendered frame — no neighbor anchoring exists
   anywhere (`buildStartFrameShotPromptVisionImages` attaches only the shot's
   OWN image + portraits + ONE location image).
2. **One location image cannot define a set.** Everything outside the
   reference's coverage — and every script detail the photo does not show — is
   re-invented per shot, differently each time (the user's stated diagnosis,
   confirmed by code: at most one location URL reaches the render,
   `verticalDramaEpisodes.ts:10093`).
3. **The system actively instructs lighting drift.** The 9-shot render-plan
   skill derives lighting per shot from EMOTION and mandates "Across the 9
   shots … must show real lighting variety" — with no same-scene
   time-of-day lock, variety lands INSIDE a continuous scene (exactly the
   sunset→midday drift in the samples).
4. **No structured scene state.** `location.data` currently provides the
   persisted description and primary-asset link; lighting/time-of-day/mood must
   be authored from the location image plus episode/shot context. Nothing locks a scene's
   lighting, fixed set elements, staging axis, wardrobe-in-scene, or active
   props across its shots; no continuity QC exists at frame level.

The design principle is **"invent once, reuse everywhere"**: decide the
uncovered details ONE time per scene, then force every shot of that scene to
consume the same decisions — textually (scene visual state lock), visually
(previous approved same-scene frame attached as a reference), and
verifiably (fail-open continuity QC).

Two flag-gated phases, all additive, zero migrations:

- **Phase 1a — `verticalDramaSceneContinuity`:** a per-scene, skill-authored **Scene
  Visual State** (lighting lock, fixed elements, spatial layout, staging
  axis, wardrobe-in-scene, active props) generated once per scene (~1 LLM
  call), stored on the episode plan, injected into every same-scene image AND
  video prompt; the lighting-variety rule gains a same-scene override clause.
  Zero additional image cost.
- **Phase 1b — `verticalDramaSceneNeighborAnchors` canary:** the nearest earlier same-scene approved
  frame, falling back to the latest generated frame for fresh batch runs, is
  attached at prompt and render time. Scenes may run in parallel, while shots
  inside a scene run sequentially. This changes latency and therefore is measured
  separately before GA.
- **Phase 2 — `verticalDramaSceneContinuityQc`:** **location coverage packs** (additive
  asset roles: reverse/side/detail angles with the primary plate as identity
  ref — the location twin of 137's character angle packs) + **scene
  continuity QC** (location/lighting/wardrobe/prop/staging verdicts,
  fail-open badges) sharing Feature 137's frame-QC skill via request-gated
  field groups, so both features cost ONE vision call per frame when both
  are enabled.

---

## 2. Problem statement

### 2.1 Evidence (3 consecutive shots, one rooftop scene, 2026-07-23)

| Drift class | Observation across shots 1→2→3 |
|---|---|
| Lighting / time of day | golden hour, low warm sun → warm afternoon → bright midday blue sky |
| Set geometry | water tank + ladder move; door/wall materials change; skyline differs |
| Wardrobe | observer woman: long apron dress (1–2) → short beige dress (3) |
| Staging / axis | trio's positions vs doorway and roof edge shift per shot |
| Prop persistence | brown envelope on the ledge exists only in shot 2 |

### 2.2 Why prompts + one location photo cannot fix this

The location reference constrains only what it shows, from the angle it shows.
A continuous scene needs (a) the same INVENTED details everywhere the photo is
silent, (b) the same lighting state, (c) the same staging geography, and
(d) the same wardrobe/props — none of which any per-shot-independent process
can guarantee. The fix must make the scene's decisions ONCE and distribute
them to every shot, and let later shots SEE earlier shots.

### 2.3 Aggravator found in the current skill contract

`vertical-drama-shot-start-frame-render/skill.md`: lighting rule 4 — lighting
follows "the scene's emotion, location, and time-of-day … do NOT default to
low-key/dark" AND "Across the 9 shots … must show real lighting variety."
Emotion-driven per-shot lighting plus a variety mandate, with no same-scene
lock, is a direct instruction to produce the observed drift whenever several
shots share one scene. (The rule is correct BETWEEN scenes; it lacks a
WITHIN-scene exception — §7.5.)

---

## 3. Verified current state (as-is anchors, 2026-07-23)

All paths under `apps/web/` unless noted.

| Capability | Where | Status |
|---|---|---|
| Locations: `verticalDramaLocations` (`drizzle/schema.ts:20814-20844`, unique `(seriesId, locationKey)`), `data` jsonb holds `description`, `aggregatedFacts[]`, `environment`, `timeOfDay`, `mood`, `primaryAssetLinkId` (writers `verticalDramaLocationReconciliation.ts:512-517`; router `:1126`) | schema + reconciliation | Shipped |
| Location assets: `verticalDramaLocationAssets` (`schema.ts:20852-20893`) — `assetType` ("location_reference"), `role` ("establishing_plate"), `approved`, `qcStatus`, `metadata` jsonb; MANY candidate images per location + pick-primary gallery (`verticalDramaLocations.ts:1088-1135`) | schema + router | Shipped |
| Location image generation: `generateLocationImage` (`verticalDramaLocations.ts:514-809`) → skill `vertical-drama-location-visual-bible` → 16:9, numImages:1 | mutation | Shipped |
| Scene grouping: storyboard `distinct_locations[]` `{location_key, location_name, description, shot_numbers[1..9]}` partition-validated (`verticalDramaStoryboardGeneration.ts:279-287,274-277`; fallback minting `:1055-1094`); per-shot override `setShotLocation` (`verticalDramaEpisodes.ts:9307-9382`); precedence resolver `resolveEffectiveShotLocationIdentity` (`:2041-2071`); dedup by normalized name (`verticalDramaLocationReconciliation.ts:470-501`) | storyboard + router | Shipped |
| Per-shot render is the ONLY paid path (`generateStartFrameImage`; UI `VerticalDramaEpisodePage.tsx:1278,5336`); contact-sheet router is DRY-RUN by contract (`verticalDramaStartFrames.ts:8-9,219-223`); plan default `mode: "single_frame_per_shot"` (`verticalDramaStartFrameGeneration.ts:389`) | routers | Shipped |
| Reference attach today — prompt-time: own image → ≤4 portraits → ONE location ("Location reference: <name>") → additional, cap 6 (`verticalDramaStartFrameGeneration.ts:1847-1914`); render-time: characters → ONE location URL (`resolveShotLocationReferenceEntry`, `verticalDramaEpisodes.ts:10093`) → products, trimmed identity > environment > product (`:10085-10138`); regen-in-place uses own currentUrl only (`:11519`) | services + router | Shipped |
| NO neighbor anchoring: `previousFramesByShotNumber` is same-shot carry-over across plan regens only (`verticalDramaEpisodePipeline.ts:2766`; `projectStartFramePlan` `:340-437`) — never another shot's data | verified | Gap |
| Lighting/time-of-day storage: current `location.data` persists description + primary asset linkage, not a governing lighting/time-of-day state; storyboard shot `lighting` is an unvalidated freeform passthrough (`verticalDramaStoryboardGeneration.ts:175`, absent from `storyboardShotSchema` `:229-266`); NO per-shot structured lighting | verified | Gap |
| Render-plan skill has location-consistency text ("Image N = location: <name>", "must visually match that reference precisely") and per-shot in-frame person-count discipline — but lighting rule mandates cross-shot VARIETY with no scene lock (`vertical-drama-shot-start-frame-render/skill.md`) | skill | Shipped (conflict §2.3) |
| Video-prompt side: `locationReferenceImage` attached as "Environment/location reference image: <name>" with keep-consistent text (`verticalDramaVideoMotionPromptGeneration.ts:1238-1251,1524-1543`); `shotContext` has NO lighting/time-of-day/continuity fields; `episodePlanContext` is reference-only prose (`:709-732`) | service | Partial |
| F132B ledgers SHIPPED: 7 quality ledgers + 11-field story state (`shared/verticalDramaSeries/qualityLedgers.ts:188-200,272-286`), planner skill `vertical-drama-ledger-planner`, reconcile + findings (`verticalDramaQualityLedgerReconcile.ts`), tenant flag `verticalDramaSeriesQualityLedgers` (`verticalDramaEpisodes.ts:3380,16342-16350`); separate character `consistencyLedger.ts` with face/hair/wardrobe drift entries | shared + services | Shipped |
| Frame-level continuity QC: none (Feature 137 §8 proposes the frame-QC skill this spec extends); marketplace precedent reason code `storyboard_continuity_mismatch` (`marketplaceAutoReviewService.ts:2560`) | — | Gap |

---

## 4. Gap analysis and component ROI

| Root cause | Component | Value | Cost | Risk to existing | Verdict → Phase |
|---|---|---|---|---|---|
| Uncovered details re-invented per shot; no shared scene decisions | **C1 Scene Visual State Lock** (§7) | **Highest** — converts "invent differently 9×" into "invent once"; also carries the lighting lock | ~1 LLM call per scene; prompt injection only | Low (flag-gated injected block; dormant otherwise) | **ADOPT — P1** |
| Shot N+1 never sees shot N | **C2 Sequential neighbor anchoring** (§8) | **High** — the rendered set beats any prose | zero new generations (reference plumbing exists) | Low-Med (attach-order/cap changes, flag-gated; trim can drop it on small-cap models) | **ADOPT — P1** |
| Lighting-variety rule fires inside scenes | **C1.5 same-scene override clause** (§7.5) | High | skill.md clause, dormant without injected lock | None when flag off (clause conditions on the block's presence) | **ADOPT — P1** |
| One angle cannot cover a set; script details missing from the photo | **C3 Location coverage packs** (§9) | Medium-High | one-time renders per location (user-initiated); selection logic | Low (additive roles on existing gallery; fallback to primary always) | **ADOPT — P2** |
| Nothing verifies continuity | **C4 Scene continuity QC** (§10) | Medium-High | +0 vision calls when 137's frame QC is on (shared call); else ≤1/frame | Low (fail-open, badges only) | **ADOPT — P2** |
| Wardrobe/prop drift within scene | **C5 wardrobe + prop lines in the state lock** (§11) | High (cheap) | included in C1 | Low | **ADOPT — P1** (QC side in P2) |

Rejected alternatives: reviving the 3×3 contact sheet as the consistency
mechanism (1/9 pixel budget — the fidelity ceiling Feature 136 §2 documented
on the marketplace side; and the paid path doesn't exist); deterministic 3D
set modeling / 180°-rule geometry engine (overengineering — prose staging
axis + QC covers the observed failures); automatic re-render cascades when an
anchor frame changes (credit burn; continuity QC flags instead).

---

## 5. Core principles

1. **Invent once, reuse everywhere.** All scene-level visual decisions are
   made a single time per scene and distributed to every shot — never decided
   per shot.
2. **Lock WITHIN a scene, vary BETWEEN scenes.** Lighting/mood variety
   remains desirable across the episode; it is forbidden across shots of one
   continuous scene unless the script itself declares a time jump.
3. **Rendered frames outrank concept plates.** Once a same-scene frame is
   approved, it becomes the strongest continuity reference for its
   neighbors — the location plate defines the set; the neighbor frame defines
   this scene's realization of it.
4. **Skill-first; TS computes facts.** The scene state is LLM-authored
   (planner skill); TypeScript groups shots (existing resolver), orders
   references, and injects blocks deterministically.
5. **Fail-open QC; no automatic spend.** Continuity verdicts badge and
   suggest; they never block and never trigger paid regeneration
   (same posture as Feature 137 §5.5, §8.3).
6. **Additive-only persistence; request-gated activation** — identical rules
   to 137 §5.7–5.8 (zero migrations; loader + real-LLM gate tests per new
   skill field).

---

## 6. High-level architecture

```text
Storyboard (distinct_locations partition, unchanged)
      ▼
P1: Scene Visual State planning (once per scene per episode)
    skill vertical-drama-scene-visual-state
    inputs: location.data prose + primary location image (vision)
            + the scene's shots' canonical summaries + script beats
            + character wardrobe facts (currentState/wardrobeRules)
    output: sceneVisualStates[location_key]  (§7.2)
      ▼
Start-frame prompt + paid render (per shot, unchanged engines)
    + SCENE CONTINUITY LOCK block injected for same-scene shots (P1)
    + neighbor reference attached: nearest earlier same-scene approved frame,
      otherwise that nearest candidate's latest-generated frame
      (prompt-time vision + render-time referenceImageUrls)        (P1)
    + angle-matched location asset instead of always-primary       (P2)
      ▼
P2: frame QC (SHARED skill with Feature 137 §8.2)
    + continuity field group: location/lighting/wardrobe/prop/staging
    → frames[].sceneContinuity + badges (fail-open)
      ▼
Video prompt generation (unchanged shape)
    + sceneVisualState text block in shotContext (P1)
      ▼
Video generation / assembly — unchanged
```

Implementation surface:

```text
apps/web/skills/vertical-drama-scene-visual-state/            — NEW (P1) planner skill
apps/web/skills/vertical-drama-shot-start-frame-render/       — P1: lock-consumption rules + §7.5 clause
apps/web/skills/vertical-drama-cinematic-narrative-image-prompt/ + shot-synopsis twin — P1: lock consumption
apps/web/skills/vertical-drama-shot-video-prompt/ (+subshots, pack) — P1: scene-state input line
apps/web/skills/vertical-drama-start-frame-video-safety-qa/   — P2: continuity field group (skill shared with 137)
apps/web/skills/vertical-drama-location-visual-bible/         — P2: coverage-angle directives
apps/web/shared/verticalDramaSeries/contracts.ts              — sceneVisualStates + sceneContinuity fields (§13)
apps/web/shared/verticalDramaSeries/sceneContinuity.ts        — NEW pure module: grouping/anchor selection/attach order
apps/web/server/services/verticalDramaSceneVisualState.ts     — NEW (P1) planner runner
apps/web/server/services/verticalDramaStartFrameGeneration.ts — block injection + neighbor attach (prompt time)
apps/web/server/routers/verticalDramaEpisodes.ts              — render-time neighbor ref + mutations (§14)
apps/web/server/routers/verticalDramaLocations.ts             — coverage-pack generation/approval (§14)
apps/web/client/src/components/verticalDramaSeries/…          — badges, scene-state viewer/edit, pack UI (§15)
```

---

## 7. C1 — Scene Visual State Lock (P1)

### 7.1 Scope and keying

One state per **effective scene** = the `distinct_locations` group (or
locationKey-override group) resolved by `resolveEffectiveShotLocationIdentity`
(`verticalDramaEpisodes.ts:2041-2071`). Stored per episode:
`startFramePlan.sceneVisualStates?: Record<locationKey, SceneVisualState>`.
Automatic batch preflight plans only scenes with at least two shots. A single-shot
scene may be planned explicitly when the user expects later re-shoots or wants the
same state carried into its video prompt; otherwise it incurs no planner call. v1
limitation: ONE state per location per episode —
an intra-episode time jump at the same location is flagged, not modeled (§24).

### 7.2 Contract (skill-authored; lenient zod)

```jsonc
{
  "location_key": "rooftop_old_building",
  "lighting_state": "late golden hour; low warm sun from screen-right; long soft shadows toward screen-left; sky pale orange fading to blue",
  "fixed_elements": [
    { "name": "rusty water tank with ladder", "placement": "behind the couple, screen-right, mid-distance" },
    { "name": "weathered doorway to stairwell", "placement": "screen-left foreground, teal flaking paint, rusted hinges" },
    { "name": "low city skyline", "placement": "beyond the far railing, hazy" }
  ],
  "spatial_layout": "door opens onto the roof from screen-left; open concrete deck center; railing along the far edge; tank right",
  "staging_axis": "observer stays at the doorway screen-left; the talking pair hold center-right; camera stays on the doorway side of the axis",
  "wardrobe_in_scene": [ { "character": "…", "wardrobe": "long cream apron dress, hair in low ponytail" } ],
  "active_props": [ { "name": "brown envelope", "placement": "on the concrete ledge, foreground right", "from_shot": 2 } ],
  "palette_mood": "sun-bleached concrete, rust accents, warm nostalgic tone",
  "time_jump_suspected": false
}
```

`active_props` is optional in P1a and must not be independently invented when a
Feature 140 object ledger exists; it is derived from that ledger. All free prose
except closed booleans; the value is CONSISTENCY, not schema precision. Authored by
new skill `vertical-drama-scene-visual-state`
(vision-capable — it sees the primary location image; ~1 call per scene) from
`location.data` (`description` and `primaryAssetLinkId` currently persisted), the
primary location image, the
scene group's `description` + member shots' canonical summaries, and
character wardrobe facts. When Feature 139 is active, the effective series look is
also an input: `palette_mood` and lighting treatment must stay within that register,
while the scene state owns concrete time-of-day and light direction. User-editable
as text (§15) — manual edits are
authoritative and never overwritten by re-planning without confirmation.

### 7.3 Generation triggers

The explicit "วางแผนความต่อเนื่องของฉาก" action and ≥2-shot-scene batch preflight
are the primary triggers. A per-shot prompt/render in an eligible multi-shot scene
may lazily plan when absent, but a failed
or malformed planner result stops **before image credits** with a retry CTA; it must
not silently spend on an unlocked render. Regenerating the storyboard invalidates
states whose scene membership changed (`projectStartFramePlan` carry-over extension
keeps untouched scenes' states — §13).

Planner concurrency contract:

- Compute a stable membership hash from episode id, location key, member shot
  numbers, location asset id, and canonical summaries.
- Use a deterministic LLM/credit idempotency key for that hash and double-check the
  fresh state before and after the external call; concurrent requests may share one
  result but must not charge or persist multiple plans.
- Persist with a row lock and compare the membership hash. If membership changed
  during the call, discard the stale result without overwriting the newer plan.
- Manual edits carry `revision` and `manualEdit: true`; a stale update returns
  `CONFLICT`. Automatic replanning never overwrites a manual state without
  `force: true` plus the expected current revision.
- Bound all text/array fields and reject control characters/oversized state blocks.
  The rendered lock must fit the selected model's effective budget; never
  mechanically truncate it.

### 7.4 Injection

Runner-injected `SCENE CONTINUITY LOCK` block (deterministic template over
§7.2 fields) into: both start-frame prompt engines and the batch render-plan
contract (per shot, when the shot's effective scene has a state), the
video-prompt `shotContext` (new optional `sceneVisualState` input rendered as
a grounding block, sibling of `episodePlanContext` — reference-only, "ห้าม
คัดลอกลง output" wording reused), and Feature 137's video-safe regen
directive composition (137 §9.3). Flag-gated REQUEST lines; prompt-budget
interaction: the block participates in the PER-MODEL prompt budget of
Feature 137 §9.5 (`configJson.maxPromptLength ?? 3800`; the primary kie.ai
`gpt-image-2` model accepts 20,000 chars, so the lock virtually never
triggers compression there) — over-budget resolution on small-budget models
follows the shipped compression path, never mechanical truncation of lock
content. The injected template is a COMPACT CONSTRAINT LOCK per 137 §5.9 —
locked facts only (light, fixed elements, axis, wardrobe, props), no
scene-describing or emotion-directing prose: the render model keeps owning
the imagination, the lock only pins what must not drift.

### 7.5 Lighting-variety exception (the §2.3 fix)

`vertical-drama-shot-start-frame-render/skill.md` lighting rule gains: "When a
SCENE CONTINUITY LOCK is present for a shot, its `lighting_state` OVERRIDES
the variety guidance: shots of the same scene share the same time of day, sun
direction, and light quality; express per-shot emotion through framing,
blocking, and micro-expression — not by changing the scene's light. Lighting
variety applies BETWEEN scenes." The clause conditions on the injected
block's presence ⇒ dormant (byte-inert) when the flag is off.

---

## 8. C2 — Sequential neighbor anchoring (P1)

### 8.1 Anchor selection (pure, `sceneContinuity.ts`)

For shot N: inspect lower shot numbers in the same effective scene from nearest to
farthest. For each candidate, prefer its valid `approvedMediaAssetId`; otherwise use
its valid latest-generated asset. The nearest candidate with either source becomes
the **scene continuity reference**. First shot of a scene: none (location refs only
— unchanged behavior).
The APPROVED (emotional) frame is the canon; a 137 video-safe variant is
never the anchor (display canon rules continuity).

Resolve the anchor once per generation attempt and persist
`frames[].sceneAnchor = { shotNumber, mediaAssetId, source, resolvedAt }`. Prompt
authoring and render submission for that attempt must use the same asset id; do not
re-resolve between the two layers and accidentally ground text and pixels on
different predecessors. Provenance is informational and never treated as a live
claim after an earlier shot is re-approved.

### 8.2 Prompt-time attach (flag-gated)

`buildStartFrameShotPromptVisionImages` (`:1871-1914`) appends the neighbor
labeled `"Scene continuity reference (shot N): same scene, same lighting,
same set"`. Auto-attach cap 6 → 7 under the flag; overflow drop order:
neighbor first, then location, then 4th portrait (identity > location >
neighbor, consistent with the shipped trim philosophy).

### 8.3 Render-time attach (flag-gated)

`generateStartFrameImage` reference assembly (`:10085-10138`) inserts the
neighbor URL after the location entry: characters → location → **scene
neighbor** → products; `mergeAndTrimReferenceImageUrls` priority extended to
identity > environment > scene-neighbor > product. Small-cap models may drop
it — acceptable; the §7 text lock still applies. When the selected render model
declares sufficient reference capacity, the neighbor survives trimming; otherwise
it is the first continuity-specific reference dropped. The kie.ai `gpt-image-2`
seed currently declares capacity 16, but this is a selected-model capability rather
than a permanent primary-model assumption. Regenerate-in-place anchoring is deferred
unless it can land with its own focused tests; repair already carries the shot's
current image.

### 8.4 Ripple semantics — no cascades

Re-approving an earlier shot does NOT auto-regenerate later shots that
anchored to its previous version. Later shots keep their approvals; the P2
continuity QC surfaces any resulting mismatch as a badge with a one-click
manual regen. This is a deliberate credit-protection decision (§5.5).

---

## 9. C3 — Location coverage packs (P2)

Additive `verticalDramaLocationAssets.role` values beside `establishing_plate`:
`reverse_angle`, `side_angle`, `detail_corner` (free slots via `metadata.
angleLabel` for extras). Generated through the EXISTING `generateLocationImage`
flow (`verticalDramaLocations.ts:514-809`) with two changes: an angle
directive per role, and the approved primary plate attached as a vision
consistency reference (mirror of 137 §10.2's portrait-anchored pack
generation; same candidate-gallery + pick-primary UX already shipped
`:1088-1135`). Selection at attach time: match the shot's camera direction
(storyboard `camera` prose / 137 `motion_profile` when present) to a role;
fallback to primary ALWAYS. **Coverage assist:** the §7 planner emits
`coverage_gaps[]` (script-required elements visible in no approved location
asset) → CTA "สร้างภาพมุมที่ขาด" pre-filled with the gap description.
User-initiated renders only.

---

## 10. C4 — Scene continuity QC (P2, shared with Feature 137)

Extends the frame-QC skill proposed by 137 §8.2
(`vertical-drama-start-frame-video-safety-qa`) with a second request-gated
field group (requested only when `verticalDramaSceneContinuityQc` is on; 137's
observability group keyed to ITS flag — one skill file, one vision call when
either or both are on):

```jsonc
"scene_continuity": {
  "location_match":   "match|minor_drift|different_place",
  "lighting_match":   "match|minor_drift|different_time",
  "wardrobe_match":   [ { "character": "…", "verdict": "match|changed" } ],
  "prop_persistence": [ { "name": "…", "expected": true, "present": false } ],
  "staging_axis_ok":  true,
  "notes": ["…"]
}
```

Comparison inputs: current frame + neighbor anchor frame + primary location
asset + the §7.2 state (text). Persisted at `frames[].sceneContinuity` and as
a `verticalDramaQcReports` row (existing stage `start_frame_image`; issue
codes `scene_location_mismatch`, `scene_lighting_mismatch`,
`scene_wardrobe_mismatch`, `scene_prop_missing`, `scene_axis_flip` — naming
follows the marketplace `storyboard_continuity_mismatch` precedent). Fail-open
everywhere: badges + suggested regen, never blocking, never auto-spend.

---

## 11. C5 — Wardrobe and prop continuity

Wardrobe: `wardrobe_in_scene` lines (from character `data.currentState` /
`wardrobeRules` — already stored per character) ride the §7 lock into every
same-scene prompt; QC verifies per character (§10). Findings MAY append to the
shipped character `consistencyLedger` (wardrobe drift entries exist there
today) — integration point only, not a new ledger. Props: until Feature 140 lands,
`active_props` may be absent. After Feature 140 lands it is a derived view of that
feature's episode object ledger, with `from_shot` visibility so props neither vanish
nor leak into shots before they exist; Feature 138 does not own a second prop store.
Prop EXCLUSION also matters: objects absent from `active_props` and the
location assets must not spontaneously appear on continuity-critical
surfaces (QC `notes` cover egregious cases; no hard rule in v1).

---

## 12. Interaction with Feature 137 (composition contract)

1. One frame-QC skill, two flags, two request-gated field groups (§10) — a
   frame render triggers at most ONE vision QC call regardless of which
   subset of {observability, continuity} is enabled.
2. 137's video-safe regen composes BOTH directive blocks (video-safe +
   scene lock) and receives the neighbor anchor like any same-scene render.
3. The video-prompt runner injects 137's motion-contract data and 138's
   scene-state block independently — either feature functions alone; specs
   share no flag.
4. 137 P3 clip identity QC MAY later add scene fields for clips — explicitly
   out of scope here (§25).

---

## 13. Data model (all additive, zero migrations)

```text
startFramePlan (contracts.ts, plan level):
  sceneVisualStates?: Record<string /*locationKey*/, SceneVisualState (§7.2) & {
      membershipHash, revision, plannedAt, skillVersion,
      manualEdit?: boolean, stale?: boolean, coverage_gaps?: string[] }>

startFramePlan.frames[]:
  sceneAnchor?      ({ shotNumber, mediaAssetId, source, resolvedAt }; P1b provenance)
  sceneContinuity?  (§10 object + analyzedAssetId/analyzedAt/skillVersion)

verticalDramaLocationAssets.role (varchar — new VALUES only):
  "reverse_angle" | "side_angle" | "detail_corner"

verticalDramaQcReports: reuses existing stage "start_frame_image" with the §10 issue codes.
```

`projectStartFramePlan` carry-over (`:340-437`) extended: `sceneVisualStates`
survives plan regen per scene (invalidated only when that scene's shot
membership changed); `frames[].sceneContinuity` carried like `videoSafety`
(137 §9.4). `frames[].sceneAnchor` is attempt provenance and is replaced by a
successful anchored generation rather than carried into a newly projected plan.
Lenient zod; absent fields = today's behavior.

A state whose `membershipHash` no longer matches the effective scene membership is
marked `stale` and is not injected. An eligible multi-shot generation must replan it
successfully before paid image rendering; explicit single-shot generation may
continue without a scene state and records a bounded warning. This prevents an old
lock from silently governing shots that moved scenes.

---

## 14. API surface (tRPC)

| Procedure | Router | Kind | Notes |
|---|---|---|---|
| `planSceneVisualState({episodeId, locationKey, force?, expectedRevision?})` | verticalDramaEpisodes | mutation | P1a; membership-hash idempotent and LLM-metered; `force` requires the current revision when replacing a manual state |
| `updateSceneVisualState({episodeId, locationKey, patch, expectedRevision})` | verticalDramaEpisodes | mutation | P1; bounded patch, row-locked fresh merge, sets `manualEdit: true`; stale revisions return `CONFLICT` |
| `runFrameContinuityQc({episodeId, shotNumber})` | verticalDramaEpisodes | mutation | P2; shares the 137 QC runner |
| `generateLocationCoverageImage({locationId, role \| gapDescription})` | verticalDramaLocations | mutation | P2; existing generate flow + role directive + primary as ref |
| `getEpisodeDetail` (existing) | — | query | returns new optional fields verbatim |

Tenant/ownership guards copied from sibling procedures; no Express routes; no
Python involvement in this feature.

---

## 15. UI requirements

1. Storyboard panel, per scene group header: scene chip ("ฉาก: ดาดฟ้าตึกเก่า ·
   ล็อกแสง: แดดเย็น") + view/edit dialog for the §7.2 state (textareas; save →
   `updateSceneVisualState`); "วางแผนความต่อเนื่องของฉาก" action when absent.
2. Shot card: continuity badge from `sceneContinuity` (เขียว/เหลือง/แดง + reason
   tooltip); indicator when a neighbor anchor was used ("อ้างอิงภาพช็อต N").
3. Location panel (existing gallery): role labels on assets; "สร้างมุมที่ขาด"
   CTA fed by `coverage_gaps`.
4. Default-visible surfaces, Thai-first copy, discoverability rule per 137
   §17.4.
5. Use Astryx components and tokens per the repository contract: discover the
   page/block/component APIs before implementation, add no raw color/spacing values,
   and cover loading, disabled, empty, stale/replan, conflict, save-error,
   keyboard/focus, and responsive states.

---

## 16. Credits and cost model (per 9-shot sub-episode, 1–3 scenes typical)

| Phase | New LLM calls | New image renders | Net |
|---|---|---|---|
| P1a scene states | +1–3 metered calls (one per scene/membership hash, reused all episode) | 0 | small; no duplicate charge under concurrency |
| P1b neighbor anchoring | 0 | 0 | no generation credits; may increase vision-input tokens and batch latency |
| P2 continuity QC | +0 when 137's frame QC runs (shared call); else ≤9 cheap vision | 0 | small |
| P2 coverage packs | 0 | one-time, user-initiated per location (typically 1–3 images) | one-time |

No automatic image/video render spend is added. Scene-state planning is a small,
metered LLM action invoked by explicit planning, eligible batch preflight, or lazy
multi-shot precondition; membership-hash idempotency prevents duplicate charge.

---

## 17. Feature flags and rollout

| Flag (tenant, default OFF) | Gates |
|---|---|
| `verticalDramaSceneContinuity` | P1a: state planner + injection (image + video prompts) and §7.5 clause |
| `verticalDramaSceneNeighborAnchors` | P1b only: anchor resolution, persisted provenance, prompt/render attachment, and serial-per-scene batch scheduling |
| `verticalDramaSceneContinuityQc` | P2: continuity field group in the shared QC skill, badges, coverage packs + gaps CTA |

`verticalDramaSceneNeighborAnchors` is an AND-gated child of
`verticalDramaSceneContinuity`. If the neighbor flag is on while the parent is off,
the runtime behaves as neighbor-off and emits one bounded configuration warning;
it must not alter scheduling, references, prompts, or persistence.

Rollout: P1a internal tenant → measure → P1a GA; then P1b canary; then P2. P1
must not depend on the deferred in-product QC feature for its own GA evidence. Use a
fixed offline/manual rubric over at least 30 same-scene consecutive-frame pairs from
≥3 episodes. Require ≥85% "same place, same time" agreement and ≥30% fewer manual
frame regens attributed to scene mismatch. For P1b additionally require p95 batch
latency within the declared internal budget, ≥95% of eligible non-first shots to
record an anchor, and zero cases where prompt-time and render-time anchor ids differ.

---

## 18. Impact on existing behavior — isolation guarantees

1. All feature flags off ⇒ byte-identical runner-built prompts, attach lists,
   caps, payloads, DB reads, and persisted shapes. Skill files may gain compact
   conditional sections, but their activation facts/lock blocks are absent and
   real-file tests prove those sections remain dormant.
2. Attach-cap (6→7) and trim-priority changes exist only under
   `verticalDramaSceneNeighborAnchors`; small-cap models degrade by dropping the neighbor
   first — never a character or location reference regression.
   The chosen anchor id is resolved and persisted before prompt authoring. Render
   submission revalidates ownership and availability of that exact id; if it is no
   longer valid, fail before paid image credits and require a new attempt. Never
   substitute another frame after the prompt was authored.
3. Fail-closed layers untouched (Image-N mapping, no-model guard, credits);
   `setShotLocation`, `distinct_locations` validation, and the dedup
   reconciliation are consumed, not modified.
4. Contact-sheet dry-run path, marketplace, Hermes: untouched.
5. Feature 137 remains independently shippable; the shared QC skill's field
   groups are separately request-gated (§12.1).
6. Known-red video-prompt suites: P1's `shotContext` addition is verified by
   fail-set identity diff per the 137 §20.8 rule.

---

## 19. Validation rules

Hard failures: pre-existing only (mapping/model/ownership — unchanged).
Warnings (fail-open, persisted): any §10 non-match verdict;
`time_jump_suspected: true`; `coverage_gaps` non-empty; neighbor anchor
dropped by model cap (audit note, not user-facing). Prohibited: mechanical
truncation of lock content; auto-regeneration; auto model switching.

---

## 20. Testing plan

1. Pure module: anchor selection (scene edges, overrides via
   `resolveEffectiveShotLocationIdentity`, approved/latest-generated precedence,
   no-neighbor, first shot),
   attach order + drop order at caps {3,5,6,7,10}, carry-over/invalidations.
2. Snapshot isolation: all flags off ⇒ runner-built attach lists, caps, contracts,
   prompts, DB reads, scheduling, and persisted shapes byte-identical to baseline
   fixtures. Conditional skill-file sections are tested for dormancy.
3. Taught-not-wired gates: loader tests assert the state-planner skill loads
   and every REQUEST line (image engines, batch skill, video shotContext, QC
   field group) appears exactly when its flag is on; real-LLM gate tests
   assert the planner emits §7.2 fields and the QC emits `scene_continuity`
   on fixtures (memory `project_vd_skill_taught_not_wired`).
4. §7.5 clause: with a lock present, generated lighting text for same-scene
   shots is consistent (fixture assertion on the batch plan output); without,
   contract text is byte-identical to today.
5. Planner concurrency: same membership hash charges/persists once; changed
   membership discards a stale result; manual revision conflict returns `CONFLICT`;
   planner failure stops before image credits.
6. Neighbor canary: `verticalDramaSceneContinuity=true` with
   `verticalDramaSceneNeighborAnchors=false` never changes scheduling or references;
   flag on serializes only within a scene, persists one anchor id, and uses that same
   id at prompt and render submission. Deleted/unowned/unavailable anchors fail
   before paid render rather than silently switching ids. "Latest-generated" means
   the most recent successful same-scene frame from the current plan/revision, never
   a failed, rejected, stale-plan, or cross-scene asset.
7. QC runner: shared-call composition with 137 (one vision call, both
   groups), fail-open persistence, no-credit-spend assertion.
8. Once-queue hygiene + fail-set identity diff per house testing memories.

---

## 21. Observability

Audit events: `vd_scene_state_planned` (locationKey, membershipHash, revision,
result, ms), `vd_scene_neighbor_anchor_attached` (shot, anchorShot, assetId,
source, dropped, promptRenderIdMatch),
`vd_frame_continuity_qc` (verdicts). Metrics for §17 GA gates; QC verdict
distribution per scene.

---

## 22. Security and safety

No new secret surfaces; skill inputs are platform-stored prose + image URLs.
Tenant/ownership guards on all new mutations (sibling-procedure copies).
Location assets remain tenant-owned media; coverage generation uses the
existing metered generate flow. Prompt safety directives unchanged; injected
blocks are deterministic templates (no paraphrase step exists in these
pipelines — verified 137 §3).
Manual state edits use bounded fields, reject control characters, and never include
raw signed URLs or full user prose in audit events. Conflict responses expose only
the caller-owned revision and never disclose another tenant's state.

---

## 23. Acceptance criteria (summary)

- P1a: two same-scene fixture shots generated with the scene-continuity flag on receive the
  same `lighting_state` text and fixed-element descriptions in their prompts;
  the neighbor flag off changes neither references nor scheduling; all flags off ⇒
  snapshots identical.
- P1b: with the neighbor flag on, shot 2 uses shot 1's approved or
  latest-generated frame at both prompt and render time (same persisted asset id,
  subject to model cap); invalidation before submission fails without spending image
  credits or substituting another asset.
- P1a: batch render-plan output for a same-scene pair contains no
  variety-driven lighting divergence when a lock is present.
- P2: a frame contradicting the lock (different time-of-day fixture) yields
  `lighting_match: "different_time"` + badge; nothing blocks; no credits
  spent by QC beyond the metered vision call.
- P2: coverage generation with role `reverse_angle` attaches the primary
  plate as reference; selection falls back to primary when no role matches.
- Old episodes without the new fields parse and render unchanged.

---

## 24. Open questions and revisit triggers

1. Intra-episode time jumps at one location (v1: single state +
   `time_jump_suspected` warning) — revisit with per-shot-range sub-states if
   real scripts hit it.
2. Neighbor anchor vs conflicting user intent (deliberate new angle far from
   the anchor): the lock constrains SET + LIGHT, not camera angle — monitor
   whether anchoring over-homogenizes composition; loosen the neighbor label
   text if so.
3. Cross-episode scene continuity (same location later in the season):
   `location.data` prose already persists; promoting a series-level canonical
   state is future work.
4. Whether QC findings should auto-append to `consistencyLedger` (v1: manual
   integration point only).

---

## 25. Explicit non-goals (v1)

- No automatic re-render cascades or automatic image/video spend on anchor changes;
  the separately documented metered scene-planner call remains part of P1a.
- No 3D set modeling, camera solving, or deterministic 180°-rule geometry.
- No revival of the contact-sheet paid path; no changes to its dry-run
  contract.
- No series-level scene canon (episode-scoped only, §24.3).
- No clip-level scene QC (Feature 137 P3's domain, later).
- No new ledger kinds (F132B ledgers untouched; consistencyLedger integration
  is a hook only).

---

## 26. Source references

- User report + 3-shot evidence 2026-07-23 (`request.md`).
- Exploration fact sheet 2026-07-23 (location/scene system, continuity
  mechanisms, F132B status) — file:line anchors embedded in §3.
- Sibling: Feature 137 spec (this session) — shared QC skill, angle-pack
  pattern, fail-open posture, testing gates.
- Prior art: 131 (storyboard/`distinct_locations`, QC taxonomy), 132
  (ledgers F132B — shipped; consistency ledger), 134 (candidate gallery),
  136 §2 (grid fidelity ceiling — why contact sheets are not the fix),
  marketplace `storyboard_continuity_mismatch` reason-code precedent.
