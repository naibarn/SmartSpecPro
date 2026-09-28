# Section 13 — Cinematic Prompt Engines (reuse the Vertical Drama per-shot skills)

<!-- SECTION_META
id: section-13-cinematic-prompt-engines
added_by: user request 2026-07-22 ("ให้ start frame ได้อารมณ์เหมือนถ่ายภาพยนตร์/ซีรีส์")
source: conductor investigation of the three shipped/staged VD skills
spec: spec.md §13 (start-frame prompts), §14 (video prompts) — extended by §13.4/§14.7 addendum
depends_on: section-04-skill-runner-loop, section-05-evidence-plan-surface
blocks: nothing (additive option layer)
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_SECTION_META -->

## 1. Why this section exists

Feature 136's own skill writes **correct** start-frame prompts — evidence-locked,
guarded, budget-clean — but they read like product documentation, not like a film.
The user asked for start frames that carry the emotional register of a drama shoot,
and for video prompts whose dialogue and camera movement feel cinematic.

Vertical Drama already solved exactly this, twice, and the work is on disk:

| Skill | Engine mode | Used for | Status in git |
|---|---|---|---|
| `vertical-drama-shot-synopsis-image-prompt` | `policy_safe_rewrite` | GPT-family image models (`gpt-image*`, `gpt-4o-image`, `dall-e`) | **UNCOMMITTED** (staged in the main checkout) |
| `vertical-drama-cinematic-narrative-image-prompt` | `cinematic_narrative` | every other image model (nano-banana, flux, z-image, grok, …) | **UNCOMMITTED** (staged in the main checkout) |
| `vertical-drama-shot-video-prompt` | — | per-shot video prompts | **committed** (`d11d0e01b`) |

Routing already exists too: `shared/verticalDramaSeries/imagePromptModelFamily.ts`
(also uncommitted) classifies the selected image model into `gpt` | `other` and
maps it through `VD_IMAGE_PROMPT_MODE_SKILL_FOLDERS` to the skill folder. It is
deliberately dependency-free and side-effect-free, imported by both server and
client — i.e. already shaped for reuse.

## 2. Compatibility verdict

**Verdict: strongly compatible as a STYLE layer, incompatible as a REPLACEMENT.**

### 2.1 What lines up (why this is worth doing)

| VD skill contract | Feature 136 equivalent | Fit |
|---|---|---|
| §1 REFERENCE MAPPING — mandatory first line | our `@ImageN` manifest + `findReferenceIndexMappingMismatches` fail-closed validator (section 02) | exact — same discipline, same failure mode guarded |
| cinematic §8 EYELINE AND FACE VISIBILITY ("this frame becomes a video") | our §13.2 start-frame action rule (frame must begin the motion) | same intent, VD states it more usefully |
| cinematic §11 VIDEO-READY START FRAME | our start-frame → `referenceImageUrls[0]` video pipeline (section 09) | exact |
| cinematic §10 CONTINUITY LOCKS | our `globalContinuity` (product/character/wardrobe/environment/lighting) | exact |
| cinematic §12 / synopsis §2 SAFETY REWRITE (positive phrasing) | our guardian + minor-safety locks (section 07) | complementary — VD rewrites, we gate |
| synopsis §7 SERIES VISUAL IDENTITY / PRODUCT TIE-IN | our product identity lock | VD already does product placement |
| video skill: MODEL-FAMILY SHAPING, CAMERA & EMOTION GRAMMAR, FRAME ANALYSIS FIRST, NATIVE AUDIO DIRECTION, silent-beat handling | our §14 video prompt contract + audio strategies | this is precisely the "พูดคุย + มุมกล้องเหมือนภาพยนตร์" the user asked for |
| per-shot, one-still-one-instant framing | our 9 independent shots | exact |

### 2.2 The one blocking incompatibility

**The VD skills are fiction-first; Feature 136 is evidence-first.**

VD's input is a *story synopsis* the writer invented — inventing a detail is the
job. Feature 136's whole reason to exist is that inventing a product detail is the
failure (the production incident: fabricated furniture-assembly reviews showing
parts that do not exist). The VD skills carry no claim whitelist, no
`assembly_documented`, no evidence profile, and no `demonstration_type`.

Handed a product review directly, they would happily invent mechanisms, materials
and construction — regressing the exact defect this feature was built to stop.

**Therefore:** the VD engine may shape *how a shot is said*, never *what is true
about the product*. It receives an already-evidence-locked shot contract as its
"synopsis" and is forbidden from adding product facts. Our claim whitelist,
guards, and preflight run **after** it, unchanged.

### 2.3 Secondary incompatibilities (all handleable)

1. **I/O shape.** VD skills return ONE prompt for ONE shot; our runner returns a
   9-shot pack with both prompt families, `loopReport` and `finalQc`. The engine
   is therefore called *inside* Phase F, per shot — it does not replace the pack.
2. **Divergent output shapes between the two modes** — `policy_safe_rewrite`
   returns `safety_adjustments` at the top level; `cinematic_narrative` nests the
   rest under `analysis_summary` (documented at
   `verticalDramaStartFrameGeneration.ts:1115-1116`). The adapter must normalize.
3. **Budget.** VD's image cap is 3800; ours is `min(4000, provider cap)`. Pass our
   effective budget in; never let the VD text push past it (the optimizer path in
   section 04 still applies).
4. **Two of the three skills are uncommitted (G1 class).** See §6.

## 3. Design — `startFramePromptStyle`, an additive option

New per-run option, threaded exactly like the other Feature 136 overrides
(section 01 pattern), default preserves today's behavior:

```ts
type MarketplaceStartFramePromptStyle =
  | "evidence_product"    // DEFAULT — Feature 136's own Phase F wording, unchanged
  | "cinematic_auto";     // route by image-model family to the VD engine
```

- `evidence_product` — byte-identical to what sections 03/04 already ship. No VD
  skill is loaded. This is the default so nothing changes unless asked for.
- `cinematic_auto` — resolve the family from the run's image model
  (`gpt` ⇒ `policy_safe_rewrite`, otherwise ⇒ `cinematic_narrative`), load that
  skill body, and use it to author the *wording* of each shot's start-frame
  prompt. The mode actually used is stamped per shot as
  `shots[i].start_frame_prompt_engine` so the UI can badge it and section 12 can
  measure it.

Video prompts get the parallel treatment under the same option value: when
`cinematic_auto` is selected, Phase G's per-shot video prompt is authored with
`vertical-drama-shot-video-prompt` as the style engine (it is committed, so no
G1 risk), keeping our mandatory global block, budget and price backstop.

### 3.1 The evidence contract passed to the engine (non-negotiable)

The engine never sees raw product text. It receives, per shot:

- `visual_summary`, `purpose`, `demonstration_type`, `transition_from_previous`,
  `dialogue` — the evidence-locked shot contract our Phase D/E already produced;
- `globalContinuity` (product identity summary, character identity, wardrobe,
  environment, lighting);
- the reference manifest (index → role → angleLabel) for the mandatory
  first-line mapping;
- the guardian / minor-safety / demonstration-evidence directives (section 07);
- the effective image budget;
- an explicit **FACT LOCK**: "every product fact in this contract is already
  verified; you may re-word, frame, light and stage it cinematically, but you may
  NOT add, infer, or embellish any product attribute, component, material,
  mechanism, capability, or measurement not present above."

### 3.2 Guards that stay mandatory in every style

Unchanged and applied after the engine returns: reference-index mapping
validation, guardian presence directive, demonstration/assembly guard,
minor-safety lock, price backstop, budget + optimizer path, the 3-round loop, and
`finalQc`. A cinematic prompt that trips any of them is repaired or rejected
exactly like an `evidence_product` one.

## 4. Deliverables

1. `shared/marketplaceCapture/startFramePromptStyle.ts` (new, pure): the option
   union, the default, and a thin re-export/adapter over VD's
   `imagePromptModelFamily.ts` classifier. If that VD module is still uncommitted
   at implementation time, **vendor a minimal copy of the classifier here** rather
   than importing an untracked file (§6), and leave a TODO to collapse to a single
   source once VD's module lands.
2. Section 01-style plumbing: `startFramePromptStyle` on the auto-plan defaults +
   override schemas (optional, no default), the `startAutoReview` zod, and run
   metadata.
3. `productReviewSequentialStoryboardSkillRunner.ts`: a `StartFramePromptEngine`
   seam — Phase F/G delegate wording to the selected engine; `evidence_product`
   keeps today's inline path. Load VD skill bodies from disk verbatim (the
   `loadSkillSystemPrompt` pattern), normalize the two output shapes (§2.3.2).
4. Per-shot stamp `start_frame_prompt_engine` + `video_prompt_engine` in the
   output schema and `metadataJson.sequentialStoryboard.shots[i]`.
5. UI (section 11 surface): a style selector with the two options plus an engine
   badge per shot card; Thai copy.
6. Observability (section 12 surface): engine stamped on
   `sequential_skill_plan_round` and on the mode-comparison metrics, so the pilot
   can compare cinematic vs evidence-product quality with real numbers.

## 5. Tests (write first)

- Default is `evidence_product`; with it, prompts are byte-identical to the
  section 04 baseline (no VD skill loaded — assert the loader was never called).
- Family routing: `gpt-image-1.5-all` / `gpt-4o-image` / `dall-e-3` ⇒
  `policy_safe_rewrite`; `google-nano-banana-pro`, `flux-2.0`, `z-image`,
  `grok-imagine` ⇒ `cinematic_narrative`; unknown model ⇒ `cinematic_narrative`
  (fail-open to the general engine, never to GPT-only policy rewriting).
- Both VD output shapes normalize to the same internal prompt record.
- **FACT LOCK regression (the important one):** an engine response that
  introduces a product attribute absent from the shot contract is rejected /
  repaired — assert with a fixture whose cinematic prompt adds "solid oak frame"
  to a product whose evidence never mentions material.
- Every section 04 preflight blocker still fires under `cinematic_auto`
  (guardian, assembly, price, budget, mapping, duration).
- Real-file gate: the two VD image skills and the video skill exist on disk and
  their bodies are non-empty when the style is selected; a missing skill folder
  degrades to `evidence_product` with an audit warning rather than failing the
  run.

## 6. G1 risk — two of the three skills are not in git

`vertical-drama-shot-synopsis-image-prompt`,
`vertical-drama-cinematic-narrative-image-prompt` and
`shared/verticalDramaSeries/imagePromptModelFamily.ts` are **staged but
uncommitted** in the main checkout (same class as G1's `characterPresenceMode`).
They run in production because production serves from that checkout on disk.

Rules for this section:

- Do **not** copy those skill folders into this branch (they belong to the VD
  session; duplicating them creates two divergent sources).
- The loader must treat a missing skill folder as a **soft degrade**: fall back to
  `evidence_product`, emit an audit warning, never throw. That makes this section
  safe to merge before the VD session commits.
- Vendor only the tiny model-family classifier if needed (§4.1), clearly marked.
- Add a real-file test that is **skipped** (not failed) when the folders are
  absent, so CI on a clean clone stays green.

## 7. Out of scope

- Changing VD's own behavior or committing VD's staged work.
- The `vertical-drama-shot-video-prompt-subshots`, `…-video-motion-prompt-pack`,
  and `…-video-prompt-judge` skills (the judged best-of-2 loop) — a possible later
  upgrade, not part of this option.
- Making `cinematic_auto` the default. Default stays `evidence_product` until the
  pilot metrics (section 12) justify a switch.
