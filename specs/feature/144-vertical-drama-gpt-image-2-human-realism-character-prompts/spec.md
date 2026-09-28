# Feature 144: Vertical Drama — Natural Human-Realism Character Prompt Contract for GPT Image 2, Nano Banana, and Seedream

**Status:** PROPOSED
**Version:** 0.2.0
**Created:** 2026-08-04
**Last reviewed:** 2026-08-05
**Priority:** P1 — character-image quality and provider-contract correctness
**Owner:** Vertical Drama / Character Visual Bible / Image Generation
**Depends-on:** Feature 132 (Vertical Drama story-character quality engine), Feature 134 (character portrait candidate batch)
**Related:** Features 131, 137, 138, 139, 140
**Source:** Human Realism Prompt Blueprint v1.0 plus the current media-model catalog capabilities and product requirements

## 1. Executive decision

Feature 144 refines the existing `vertical-drama-character-visual-bible` skill for
the target image-model families GPT Image 2, Nano Banana, and Seedream. It does
not create a second character-prompt skill and does not move creative prompt
wording into TypeScript.

The skill must author one complete, natural-language image prompt that combines:

- story-grounded character identity and role;
- attractive, camera-readable presence without a fashion-model/catalog look;
- believable human anatomy, expression, skin, eyes, hair, lips, wardrobe, light,
  and optical behavior;
- identity/reference locks and shot-specific framing;
- natural-language constraints that prevent plastic, waxy, CGI, over-smoothed,
  over-posed, or generic advertising results.

For every target family, these constraints are part of the same prompt as the
positive description. A separate negative prompt is not authoritative and must
not be sent as a second provider field. The maximum prompt budget is provider-
specific: 20,000 characters for GPT Image 2 and Nano Banana, and 5,000
characters for Seedream.

These limits are ceilings, not targets: the skill must remain specific and
non-repetitive instead of filling the budget with boilerplate.

### 1.1 Completeness review and resolved gaps

The initial 0.1.0 draft was useful as a GPT Image 2 prompt-quality direction,
but it was not complete enough as a multi-provider implementation contract. This
revision closes the following gaps before planning:

| Gap found | Resolution in 0.2.0 |
|---|---|
| Scope covered GPT Image 2 only | The contract now covers GPT Image 2, Nano Banana, and Seedream while leaving other providers unchanged. |
| One fixed 20,000-character limit | A capability matrix now defines 20,000 for GPT Image 2/Nano Banana and 5,000 for Seedream. |
| No authoritative capability lookup rule | The selected model's catalog/config capability is the source of truth; display names and aliases cannot grant a larger budget. |
| No compact strategy for Seedream | Seedream gets a deliberate compact prompt profile that preserves identity, age, safety, anatomy, and human-realism essentials. It is not a sliced GPT Image 2 prompt. |
| Unknown or incomplete model metadata was unspecified | Unknown target capability fails closed or stays on the existing legacy path until explicitly configured; it must never assume 20,000. |
| Seed/static catalog parity was not part of the contract | Seed values and static fallback values must be checked together; a Kie seed value alone must not disappear during a cold-start/static lookup. |
| Legacy `google-nano-banana-pro` static entry has no explicit 20,000-character capability | Audit and populate its authoritative model capability, or keep that entry on the legacy budget/path until parity is proven. |
| Generic truncation could violate identity/safety | The target character path must reject or use a tested compactor before provider submission; it must not reuse an unreviewed hard-truncation fallback. |
| Existing lead QC depends on `negative_prompt` | Target-family QC now inspects the combined prompt; legacy negative data remains readable but is not a target-provider instruction. |
| Preset negative fragments could be merged after skill output | Target-family adapters must not submit or silently append those fragments; any needed visual fact must be authored inline by the skill. |

### 1.2 Benefit and cost decision

The change is worth pursuing as a P1 improvement, with a staged rollout:

- **Expected benefit: high.** One existing skill can improve natural-human
  character realism, attractive-but-not-model-like casting, and cross-provider
  prompt consistency for three relevant image families. The result also reduces
  the risk that a separate negative field or a generic lens recipe undermines the
  intended character identity.
- **Implementation cost: medium.** The first slice can reuse the existing skill,
  model catalog, per-model budget resolver, schema/retry infrastructure, and
  character reference flow. The main work is capability handoff, target payload
  rules, QC adaptation, focused tests, and a compact Seedream profile.
- **Operational cost/risk: bounded but real.** A/B image evaluation consumes
  credits and provider behavior differs, so broad enablement must wait for a
  per-family comparison. No default-model switch is authorized by this spec.

The value case is strongest if capability metadata parity is completed first;
without it, the system cannot prove that a nominally 20,000-character model is
actually receiving that budget at runtime.

## 2. Problem statement

The existing character visual-bible skill already handles Story Character DNA,
role-tier attractiveness, anti-clone identity, reference locking, child safety,
solo portrait rules, five independently authored prompt fields, and cinematic
language. Those capabilities are the correct ownership boundary and must remain
the source of truth.

The remaining quality gap is the rendering description and the provider-aware
prompt contract. The current contract can
produce a visually attractive and story-consistent character while still leaving
the image model to guess too much about:

- natural variation across macro-, meso-, and micro-level facial structure;
- local skin-tone and highlight variation;
- eye, lip, eyebrow, baby-hair, and flyaway behavior;
- realistic anatomy, weight distribution, hands, feet, fabric tension, and body
  posture in full-body views;
- the difference between attractive dramatic casting and a generic model,
  influencer, catalog, corporate-headshot, or beauty-filter result;
- the correct optical language for close-up, headshot, half-body, and full-body
  prompts.

The previous comma-list `negative_prompt` pattern is also a poor fit for the new
target single-prompt contract. It separates the desired image from the reasoning
that explains what the image should avoid, and it is not needed when the full
prompt can express the visual intent in one coherent description.

The media layer already has per-model prompt-capability machinery through
`configJson.maxPromptLength` and `modelPromptBudget.ts`. The missing contract is
to make the character skill and its render adapter consume the resolved
capability together, including the shorter Seedream budget, instead of treating
20,000 as a universal character-prompt allowance.

## 3. Goals

### G1 — Skill-first ownership

Put Human Realism rules, prompt blocks, precedence, and examples in the existing
`vertical-drama-character-visual-bible` skill. The server may validate facts and
contracts, but must not become a second creative prompt author.

### G2 — Natural human realism

Make characters feel like real dramatic people rather than synthetic renders:

- varied but restrained skin microstructure;
- subtle asymmetry and age-appropriate facial anatomy;
- local color and reflectance variation rather than uniform gloss;
- believable eyes, lips, brows, hair strands, body posture, hands, feet, and
  clothing behavior;
- realistic optical depth, highlight roll-off, and motivated lighting.

### G3 — Attractive but not model-like

Adult leads must remain beautiful/handsome and compelling enough to carry a
vertical drama, but their appeal must come from story-specific identity,
emotional access, lived-in detail, and memorable contradiction—not from a
fashion-catalog pose, flawless symmetry, influencer styling, or generic beauty
campaign language.

Supporting characters must not be forced into lead-level glamour. Villains may be
attractive but must retain role-specific tension without turning every character
into the same polished face.

### G4 — One combined prompt for target image families

For GPT Image 2, Nano Banana, and Seedream character generation:

- use one complete `prompt` field;
- include avoidance constraints as natural prose inside that prompt;
- do not send a separate `negative_prompt` field;
- do not rely on a hidden comma-list appended after the main prompt;
- do not silently truncate a prompt above the selected model's capability limit.

Legacy persisted `negative_prompt` data may remain readable during migration, but
it is non-authoritative for new target-family requests and must not be submitted
as a separate provider instruction.

### G5 — Preserve identity and safety

Human realism must never override:

1. child safety and age appropriateness;
2. explicit identity/reference facts;
3. approved canonical Character DNA;
4. series and cast continuity;
5. role truth and user-approved visible variation;
6. the Human Realism rendering layer.

Reference identity and skin rendering are separate concerns: preserve the person,
but do not reproduce beauty-filter artifacts, compression noise, lighting defects,
or accidental blur from a reference image.

### G6 — Provider-aware prompt budgets without provider-specific prose in code

The selected model must resolve to a factual capability profile before the skill
authors its five prompt fields. The profile includes the model family, maximum
submitted prompt characters, and whether a separate negative field is allowed.
The skill remains the sole author of creative wording; the adapter may validate
or perform a deterministic, tested compaction but may not invent a new aesthetic
paragraph in TypeScript.

## 4. Non-goals

- Do not create a new standalone Human Realism skill.
- Do not rewrite the scene-level cinematic narrative or start-frame skills in this
  feature. They already consume approved character references and have separate
  shot-composition responsibilities.
- Do not add a new database table or a new persisted `HumanRealismConfig` object
  in the first implementation slice.
- Do not force the same lighting, lens, aperture, skin detail, or beauty language
  on every character or every shot.
- Do not use LLM self-reported 0–10 scores as proof that a rendered image is
  realistic. Prompt-level checks and rendered-image evaluation are separate.
- Do not perform paid live image generation as part of unit or contract tests.
- Do not change behavior for providers outside the GPT Image 2, Nano Banana, and
  Seedream target families unless a later provider compatibility decision
  explicitly scopes them in.

## 5. Existing-system fit and non-duplication

The implementation must extend the already-owned skill and preserve the existing
contract boundaries:

| Responsibility | Owner | Feature 144 rule |
|---|---|---|
| Story DNA, role, attractiveness, anti-clone, identity locks | `vertical-drama-character-visual-bible` | Extend with Human Realism rendering guidance |
| Provider capability and model-family resolution | Media-model catalog plus `modelPromptBudget.ts` | Supply factual family/limit data; do not infer capability from display text |
| Provider prompt text | Skill output | One natural-language prompt for the selected target family |
| Fact injection, schema validation, retry classification | `verticalDramaCharacterImageGeneration.ts` | Validate and route; do not author creative prose |
| Prompt budget enforcement and provider payload | Media/router adapter | Enforce the resolved limit and omit target-family negative payloads |
| Character reference resolution | Existing character-stock/reference flow | Reuse unchanged unless a contract mismatch is proven |
| Scene composition, multi-character blocking, face visibility | Existing narrative/start-frame skills | Out of scope |
| Rendered-image fidelity judgment | Future vision/image-QA phase | Not replaced by prompt text checks |

The existing visual-bible service loads the skill body as the system prompt and
the current pipeline renders either the skill's primary portrait prompt or its
full-body prompt according to the skill's framing verdict. The new layer must
therefore be authored in the skill's actual runtime-loaded content and mirrored
skill files must remain synchronized.

## 6. Human Realism design contract

### 6.1 Prompt priority

Every generated prompt must reason in this order, adapting the wording naturally
to the character and shot:

```text
Identity → Anatomy → Pose and expression → Lighting → Skin tone and structure
→ Camera and optical behavior → Retouching restraint → Inline avoidance clauses
```

`ultra realistic`, `8K`, `highly detailed`, `perfect face`, `flawless skin`, or
`visible pores` alone are never accepted as a substitute for this structure.

### 6.2 Character realism blocks

The skill should use compact, conditional blocks rather than blindly copying all
blocks into every prompt.

#### Identity and anatomy

Describe the character's actual face geometry, eyes and gaze, brows, nose, lips,
jaw, chin, hair, silhouette, age, body proportions, and one or two distinctive
identity cues. Require subtle natural asymmetry where it does not conflict with an
approved reference or intentional variant.

For full-body or three-quarter framing, add physically plausible shoulders, arms,
hands, joints, hips, knees, feet, weight distribution, fabric tension, and contact
shadows. Do not require close-up pore detail on distant body skin.

#### Skin and local color

Use realistic variation at the appropriate scale:

- macro: face shape, jaw, cheek, head-to-body ratio;
- meso: eyelid folds, under-eye structure, nasolabial transitions, lip contour,
  neck and clothing folds;
- micro: uneven pore distribution, fine vellus hair, sparse pigmentation, subtle
  redness, natural lip lines, and localized sebum highlights.

The result should describe real skin with a balanced matte-to-satin response.
Pores must not be equally visible everywhere, repeated like a texture pattern, or
turned into orange-peel detail. Highlights must be localized and interrupted by
microtexture rather than forming a glossy mask.

#### Eyes, lips, and hair

Use physically plausible catchlights tied to the stated light source, subtle
scleral variation, natural pupil size, non-glassy irises, irregular eyelashes,
fine lip lines, restrained moisture, individual eyebrow hairs, baby hairs, and
varied hair clumping. Do not turn these into a checklist that makes every person
look identical.

#### Expression and body language

Prefer candid, emotionally readable, physically balanced behavior: a controlled
breath, a delayed blink, a restrained smile, slight shoulder imbalance, relaxed
hands, or a story-specific tension tell. Avoid `perfect pose`, `perfect smile`,
catalog posing, mannequin stillness, or generic model confidence.

#### Beauty and casting

For adult leads, use clear role-appropriate attractiveness and screen presence,
but frame it as believable dramatic casting: recognizable, emotionally accessible,
story-specific, and memorable. The prompt must not make the character read as a
fashion model, influencer, pageant contestant, commercial beauty model, or generic
corporate headshot.

For support roles, grounded attractiveness and one memorable cue are sufficient.
For villains, preserve attractive contradiction and controlled tension without
using the same glossy beauty grammar as the leads.

### 6.3 Shot-aware optical rules

The skill must choose optical language that matches the requested framing instead
of repeating one fixed lens preset:

| Framing | Rendering emphasis |
|---|---|
| Extreme close-up / close-up | high but restrained facial microtexture, eyes and central face resolved, gradual optical falloff, no oversharpened pores |
| Headshot | facial identity, eyes, skin and hair readable; natural portrait compression and believable background separation |
| Half-body | face remains readable; upper-body anatomy, shoulder/arm placement, wardrobe drape and moderate skin detail |
| Three-quarter | natural torso-to-leg proportions, counterbalance, hands and joints, wardrobe tension |
| Full-body | head-to-toe framing, realistic weight-bearing leg, feet contacting the floor, body-scale skin detail, fabric and contact shadows; avoid headshot depth-of-field grammar |

Lens and aperture are guidance, not immutable numbers. The scene, user framing,
reference identity, provider behavior, and story world may override a default
preset. The skill must not use a close-up 85mm shallow-focus recipe for a prompt
that explicitly requests full body.

### 6.4 Inline avoidance prose

The prompt must express constraints as part of the same description, for example:

> Keep the face recognizably human with naturally varied skin texture, subtle
> asymmetry, believable eyes, and restrained retouching. Let the subject feel like
> a real dramatic person captured in a truthful moment; avoid a waxy or plastic
> beauty-filter finish, generic fashion-model posing, uniform facial gloss,
> repeated pore patterns, CGI geometry, and digital oversharpening.

This is illustrative prose, not a mandatory exact string. The skill should write
the clauses naturally for the character, age, role, shot, and provider budget.

The following concepts are preferred as inline prose when relevant:

- plastic, waxy, porcelain, silicone, mannequin, CGI, airbrushed, beauty-filtered;
- globally smoothed or textureless skin;
- uniform gloss, fake HDR, oversharpening, halo sharpening;
- glass-like eyes, helmet-like hair, duplicated strands;
- perfect symmetry, generic model pose, pageant styling, corporate headshot;
- deformed hands, fused fingers, broken joints, floating feet, distorted anatomy;
- extra people, background figures, text, logo, watermark.

These terms are not a license to build a long negative list. The skill must select
only the clauses that protect the current output and explain them in natural
prose.

## 7. Target image-provider contract

### 7.1 Capability matrix and scope

The contract applies only after the actual selected model and its reference-image
route are resolved. Family names are normalized from the model catalog/capability
record, not from a loose substring match on a user-facing label.

| Target family | Current catalog examples | Submitted prompt ceiling | Separate negative field | Prompt profile |
|---|---|---:|---|---|
| GPT Image 2 | `gpt-image-2-text-to-image`, reference-image variant | 20,000 | Not sent | Rich natural-human realism |
| Nano Banana | `google-nano-banana-pro`, `google-banana-2`, `google-banana-2-lite` / `nano-banana-2` aliases | 20,000 | Not sent | Rich natural-human realism |
| Seedream | `seedream/5-pro-text-to-image`, reference-image variant | 5,000 | Not sent | Compact natural-human realism |
| Other providers | Existing catalog entries | Existing configured limit | Existing behavior | Out of scope for this feature |

The current Kie seed definitions are evidence for these values, but the
implementation must preserve DB-first/config-first resolution and static-registry
fallback parity. A model alias is not sufficient evidence: every enabled target
model must expose an explicit `maxPromptLength` (or an equivalent capability
field) before the target contract is enabled for it.

This extends the per-model budget direction already established by Feature 137;
it does not create a second prompt-budget authority. Feature 144 adds the
character-skill single-prompt and human-realism rules, plus the Nano Banana and
Seedream family coverage.

### 7.2 Single-prompt rule

For every target-family character-generation adapter:

```text
provider request:
  prompt: <one complete skill-authored prompt>
  negative_prompt: not sent
```

The combined prompt must contain both desired visual behavior and the relevant
avoidance prose. The adapter must not append a legacy comma-list after the skill's
prompt, must not silently transform a separate field into an unreviewed prompt,
and must not pass preset negative fragments as a hidden second instruction.

### 7.3 Length, capability resolution, and compaction

- Hard maximums for the target families are the values in §7.1. The shared
  absolute ceiling remains 20,000 characters.
- The skill receives factual capability input before authoring, or an explicitly
  deterministic adapter compactor is applied before submission. The plan must
  choose the concrete handoff, but both paths must produce a reviewed prompt
  within the selected model's limit.
- GPT Image 2 and Nano Banana may use the rich profile up to 20,000 characters;
  Seedream must use a compact profile capped at 5,000 characters.
- If the prompt exceeds the selected limit, the request fails with an actionable
  validation error or uses an explicitly tested compaction path.
- Silent truncation is prohibited because it can remove identity, age, safety, or
  inline avoidance clauses.
- Compaction order, if later needed, is: remove repeated optical adjectives →
  remove redundant environment detail → merge repeated wardrobe/camera clauses →
  preserve identity, age, role, reference locks, anatomy, safety, and
  human-realism constraints. Seedream compaction must be semantic and
  sentence-aware, never a raw character slice.
- The generic `verticalDramaPromptQc` hard-truncation fallback must not be used
  for this target character contract unless it is replaced by a target-specific,
  tested behavior that proves preservation of the critical clauses.

If the selected model has no explicit target capability, the implementation must
fail closed with an actionable configuration error or remain on the existing
legacy provider path. It must not infer a 20,000-character allowance from a
string such as `nano-banana`, `gpt-image`, or `seedream` alone.

### 7.4 Legacy compatibility

Existing saved records may still contain `negative_prompt`. During migration:

- the field remains readable for old data;
- target-family generation treats it as non-authoritative;
- new target-family outputs either omit it or leave it empty according to the final
  contract decision;
- the provider request contains only the combined prompt;
- providers outside the target families retain their existing behavior.

The implementation plan must choose one backward-compatible representation and
update the relevant schema, service, tests, and provider payload together. It must
not leave a path where UI preview shows one prompt but the paid provider receives a
different hidden negative field.

### 7.5 Request, preview, and observability consistency

The prompt shown for approval, the prompt persisted for the render handoff, and
the prompt sent to the paid provider must be the same effective combined prompt.
The provider adapter should expose bounded metadata for debugging and rollout:

- resolved model ID and normalized family;
- configured prompt ceiling and actual prompt length;
- whether compaction occurred and which deterministic profile was used;
- `negative_prompt_submitted: false` for all target-family requests.

Do not persist full prompts in ordinary telemetry when an existing privacy/data-
retention policy forbids it; a hash and bounded length/contract metadata are
sufficient for correlation.

## 8. Safety and care requirements

- Child and teen handling has absolute precedence. Do not add adult beauty,
  sensuality, mature expression, heavy makeup, adult wrinkle language, or body
  emphasis to a minor.
- Preserve stated age and age-appropriate body proportions; do not make youth look
  older to improve attractiveness.
- Ethnicity, nationality, and region are facts, not visual stereotypes. Do not
  infer a face from nationality alone or erase an explicit region anchor.
- For an attached own-reference image, lock the person's identity and applicable
  wardrobe/accessories, while reconstructing natural skin instead of copying
  filter artifacts.
- Keep solo character prompts to exactly one intended person unless a separate
  sheet deliverable explicitly defines a multi-panel layout.
- Avoid sexualized, humiliating, discriminatory, or exploitative framing.
- Never let the phrase “natural” become a reason to make a lead plain, unhealthy,
  careless, or visually generic. Natural realism and dramatic attractiveness must
  coexist.

## 9. Skill output expectations

The five existing prompt fields remain independently authored:

- `primary_portrait_prompt` — canonical face anchor and normal render prompt;
- `turnaround_prompt` — identity across angles;
- `full_body_prompt` — true head-to-toe anatomy and wardrobe prompt;
- `expression_sheet_prompt` — consistent identity with varied expressions;
- `outfit_sheet_prompt` — identity-preserving wardrobe variation when allowed.

Every field must use the same approved Character DNA and the same human-realism
policy, while changing only the deliverable-specific framing, pose, sheet layout,
or permitted wardrobe variation. None may fall back to a mechanical suffix.

The skill must still return the existing snake_case contract and preserve:

- role-tier and child precedence;
- approved-DNA identity pinning;
- reference-image locks;
- target-region/ethnicity anchoring;
- story/cast contrast and anti-clone evidence;
- the existing `primary_portrait_framing` verdict.

Before prompt authoring, the runtime must provide a factual capability context or
an equivalent deterministic compilation input containing at least:

```text
image_prompt_capability:
  family: gpt_image_2 | nano_banana | seedream | other
  max_prompt_chars: resolved model limit
  single_prompt: true for target families
  separate_negative_prompt: false for target families
```

The exact transport shape belongs to the implementation plan. The values must be
derived from the selected catalog model and must not be authored by the LLM or
guessed from a display name.

## 10. Quality and verification contract

### 10.1 Deterministic prompt checks

The implementation may add deterministic checks, but they must validate rather
than author prose. The checks should cover:

- one combined prompt for the selected target family is present;
- no separate provider negative-prompt payload is sent;
- prompt length is within the resolved model-specific limit (20,000 or 5,000 for
  the target families);
- the resolved family and model capability agree with the actual provider route;
- required identity, age, role, reference, and child-safety facts are present;
- the prompt contains human-realism coverage from several semantic categories,
  not one brittle exact phrase;
- the prompt does not collapse into a generic model/catalog/corporate-headshot
  direction for a lead;
- the selected framing has matching anatomy and optical language;
- inline avoidance prose is present without requiring a comma-list format.

Existing lead-beauty and villain-drift QC must be adapted to inspect the combined
prompt rather than relying on a separate negative field for target families. The
skill remains the author of all corrective wording; retry guidance must remain
bounded.

### 10.2 Contract tests

The implementation plan must add focused tests for:

1. adult female lead — beautiful, emotionally accessible, non-model, natural skin;
2. adult male lead — handsome, warm/trustworthy, non-corporate, natural anatomy;
3. supporting character — believable and memorable without lead-level glamour;
4. attractive villain — controlled contradiction without universal glossy styling;
5. child and teen — age-appropriate, safe, and not adult-retouched;
6. own-reference lock — identity preserved while filter artifacts are not copied;
7. full-body framing — feet, joints, weight distribution, clothing, and optical
   language are present;
8. GPT Image 2 request shape — one prompt field, 20,000-character ceiling, and no
   separate negative field;
9. Nano Banana request shape — one prompt field, 20,000-character ceiling, and no
   separate negative field;
10. Seedream request shape — one prompt field, 5,000-character ceiling, compact
    profile, and no separate negative field;
11. legacy saved negative data — readable but not sent to any target family;
12. over-limit prompt — explicit failure or tested semantic compaction, never
    silent truncation;
13. missing/unknown capability — fail closed or use the existing legacy path,
    never assume 20,000 from a model-name substring;
14. other providers — no regression when the target-family behavior is disabled;
15. all existing skill-content, schema, retry, identity, and child-safety tests.

Unit and contract tests must not call a paid image provider.

### 10.3 Rendered-image evaluation gate

Prompt tests alone do not prove visual realism. Before enabling the new target
path broadly, run a separately approved, bounded A/B evaluation for each target
family using the same character inputs and comparable generation settings. The
Seedream comparison must specifically verify that the compact profile does not
drop identity, age, safety, or natural-human constraints. Evaluate at least:

- identity recognizability;
- natural human skin and facial structure;
- attractive dramatic presence;
- non-model/non-catalog authenticity;
- age and safety correctness;
- pose, hands, body, and wardrobe plausibility;
- usefulness as a downstream character reference.

The new prompt should be promoted only if it improves or maintains identity and
safety while showing a meaningful preference for natural-human realism. This live
evaluation is not part of normal automated tests and requires explicit approval
because it consumes image-generation credits.

## 11. Rollout boundary

The future implementation should be staged as:

1. capability catalog normalization, alias coverage, and DB/static parity;
2. skill contract and worked examples for rich and compact profiles;
3. combined-prompt provider adapter contract;
4. focused service/schema/QC compatibility updates;
5. target-family capability gate and per-model prompt-budget enforcement;
6. bounded A/B evaluation;
7. gradual enablement and telemetry for prompt length, retries, provider payload
   shape, and user acceptance/regeneration outcomes.

No implementation plan, migration, feature-flag name, or file-by-file patch is
authorized by this spec alone. Those decisions belong in the next planning step
after this spec is reviewed and approved.

## 12. Acceptance criteria

- [ ] The existing character visual-bible skill is the sole author of Human
  Realism prompt wording.
- [ ] GPT Image 2, Nano Banana, and Seedream each receive one complete prompt and
  no separate negative prompt.
- [ ] Avoidance constraints are expressed as natural prose inside the prompt.
- [ ] Adult leads remain beautiful/handsome and screen-magnetic without reading as
  generic fashion models, influencers, pageant faces, or corporate headshots.
- [ ] Supporting characters remain believable and distinct without forced glamour.
- [ ] Skin, eyes, lips, hair, anatomy, lighting, and optical behavior are
  described conditionally and age-/shot-appropriately.
- [ ] Full-body prompts do not inherit close-up lens/depth-of-field grammar.
- [ ] Child/teen safety and reference/approved-DNA locks remain higher precedence.
- [ ] No silent truncation occurs at the resolved 20,000-character GPT Image 2 /
  Nano Banana limit or the 5,000-character Seedream limit.
- [ ] Seedream uses a compact semantic profile rather than a raw slice of a rich
  prompt.
- [ ] Unknown or incomplete capability metadata cannot silently enter the target
  contract with a guessed prompt budget.
- [ ] Existing providers and legacy records remain compatible according to the
  final migration decision.
- [ ] Focused contract tests cover the matrix in §10.2 with no paid provider call.
- [ ] A bounded A/B image evaluation is completed before broad enablement.

## 13. Open decisions for the implementation plan

1. Whether the shared schema should omit `negative_prompt` entirely or expose an
   explicitly empty value for target-family responses, while never submitting a
   separate negative instruction.
2. Whether capability facts should reach the skill as input, or whether a
   deterministic adapter compactor should own the rich-to-compact transformation.
3. Whether unknown target capability should fail closed immediately or remain on
   the existing legacy path until catalog configuration is repaired.
4. Whether inline Human Realism clauses should be stored only in the five prompt
   strings or also exposed as a bounded preview metadata summary.
5. The exact prompt-level telemetry and the minimum sample size for the per-family
   A/B gate.
