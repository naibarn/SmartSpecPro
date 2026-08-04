# Section 02 — Skill and generation contract

## Scope

Extend the existing `vertical-drama-character-visual-bible` runtime bundle and
the generation service that owns its LLM boundary. This section owns Human
Realism wording, rich/compact prompt profiles, facts-only capability input,
normal/candidate schema behavior, combined-prompt QC, bounded retry issues, and
stale prompt regeneration. It does not own model catalog resolution or provider
payload construction.

## Files owned

- `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md`
- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`
- the skill's JSON schemas, fixtures, and verifier expectations;
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`;
- `apps/web/server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`;
- `apps/web/server/services/__tests__/verticalDramaPromptQc.test.ts` only for
  the target-path bypass/legacy regression proof.

Keep both markdown skill files byte-for-byte synchronized. The skill remains
the sole creative prompt author. TypeScript may validate facts/contracts and
build retry issue text, but may not append an aesthetic Human Realism paragraph
or a hidden negative list.

## Human Realism authoring contract

Add a conditional Human Realism section to both mirrored skill files. It must
cover:

- identity-first, age-appropriate facial and body anatomy;
- macro/meso/micro skin variation with restrained matte-to-satin reflectance;
- believable eyes, catchlights, sclera, lips, brows, baby hair, and hair clumps;
- candid expression and physically balanced body language;
- adult lead attractiveness that is dramatic, recognizable, and memorable but
  not fashion-model, influencer, pageant, catalog, or corporate-headshot
  grammar;
- supporting and villain role differentiation without universal glamour;
- hands, joints, feet, weight distribution, wardrobe tension, and contact
  shadows for three-quarter/full-body framing;
- shot-aware camera/depth-of-field language instead of an immutable 85mm recipe;
- contextual inline prose against plastic, waxy, CGI, beauty-filter, global
  smoothing, fake HDR, oversharpening, generic posing, and anatomy failures.

The precedence remains identity, safety, approved Character DNA, continuity,
and role truth before Human Realism. Do not use `perfect face`, uniform pores,
global gloss, or generic `ultra realistic` as a substitute for concrete detail.

The profile is selected from factual capability input:

- `rich` for GPT Image 2/Nano Banana: use the full conditional vocabulary
  without repetitive boilerplate.
- `compact` for Seedream: preserve identity, age/safety, role, framing,
  anatomy, essential skin/eye/hair realism, lighting, and the most relevant
  avoidance prose in that order. It is authored independently, not sliced from
  a rich string.

Update examples/fixtures that imply every shot uses 85mm/shallow focus. Keep
shot-specific examples explicit and allow full-body composition to use a
physically appropriate optical description.

## Facts-only input contract

Extend the normal and candidate generation parameter types in
`verticalDramaCharacterImageGeneration.ts` with the resolved capability from
Section 01. Add this block to both
`buildCharacterVisualBibleInputPayload` and
`buildCharacterVisualPromptsUserPrompt`:

```json
{
  "image_prompt_capability": {
    "family": "gpt_image_2 | nano_banana | seedream | other",
    "max_prompt_chars": 20000,
    "single_prompt": true,
    "separate_negative_prompt": false,
    "prompt_profile": "rich | compact | legacy"
  }
}
```

Only factual capability fields are permitted. Do not pass secrets, display
labels, or creative text that tells TypeScript how to write the image prompt.
Target callers must fail before the LLM call if the capability is missing or
invalid. Non-target callers may retain the legacy path.

## Output and validation behavior

Keep the existing five prompt fields and optional `negative_prompt` in the
normal/candidate skill schemas for legacy readability. For a target capability:

- each emitted prompt field must individually be within the selected cap;
- `negative_prompt` is optional and never required for target quality;
- target QC inspects the selected combined prompt for natural-human and
  anti-model/anti-plastic semantic anchors;
- identity, age, child safety, role, reference, region, and approved-DNA checks
  retain their current precedence;
- the skill's portrait/full-body framing verdict still controls which field the
  renderer selects.

Adapt `findLeadPromptQualityIssues` to accept the selected prompt plus explicit
legacy/target mode. Legacy mode continues checking the legacy negative field.
Target mode checks semantic anchor categories rather than one exact sentence so
the skill can write character-specific prose. Missing anchors become structured
retry issues.

The existing bounded LLM retry may run once for a target budget/quality issue.
The issue must request a semantic compact rewrite that preserves identity,
age, safety, role, framing, and Human Realism anchors. After retry exhaustion,
return the existing typed schema/quality error. Do not call the generic
`verticalDramaPromptQc` hard-truncation fallback for target character output.
Keep generic hard truncation behavior and its tests unchanged for legacy paths.

## Negative fragment behavior

The current service merge of preset `imagePromptFragments.negative` remains for
legacy/non-target callers. For target capability:

- do not merge the preset negative fragment into the target-bound result;
- if a preset fact matters, provide it as a factual skill input so the skill
  writes it as inline prose;
- do not append a comma-list or hidden avoidance string in TypeScript;
- apply the same rule to normal and Feature 134 candidate generation.

The target service result may keep an optional legacy-readable field for
compatibility, but later sections must remove it from target provider requests.

## Stale prompt regeneration

Define the target marker from Section 01:

```text
vd_character_natural_human_v1
```

Approved snapshots and candidate drafts without this marker are stale for the
target contract. When approved Character DNA/facts are available, the existing
`verticalDramaCharacterImageGeneration.ts` service regenerates through the skill
with current capability facts. If required facts are unavailable, return an
actionable regenerate-prompt error. The router only chooses reuse versus
regenerate/reject; it never concatenates Human Realism prose onto an old prompt.

Persist the optional marker in the existing JSON-shaped snapshot/candidate data
only if the current type needs it. No destructive migration or negative-data
deletion is allowed.

## TDD-first tests

Before editing skill/service files, add or update tests to prove:

### Skill content

- mirrored files are equal;
- Human Realism sections contain identity/anatomy, skin, eye/lip/hair,
  expression, casting, role differentiation, full-body, and shot-aware optics;
- rich and compact profiles exist;
- inline avoidance prose guidance exists without depending only on a negative
  comma-list;
- child safety, reference locks, role tiers, five fields, and anti-clone rules
  remain present;
- no normative universal 85mm/full-body mismatch remains.

### Generation input/output

- normal and candidate calls include facts-only capability context;
- GPT/Nano selects rich and Seedream selects compact;
- all five fields respect the selected cap;
- target combined QC succeeds without a negative field;
- missing target semantic anchors cause one bounded retry then typed failure;
- legacy negative-based QC still works;
- child/teen, identity, region, reference, role, and full-body checks remain;
- generic hard truncation is not invoked for target output;
- preset negative fragments are not merged for target output.

### Stale/retry behavior

- current marker allows reuse only for compatible profile;
- stale prompt with Character DNA invokes the existing skill-generation service;
- stale prompt without facts fails with regenerate-prompt error;
- retry cannot reintroduce a target negative instruction;
- no prompt body is placed in errors or logs.

## Exit criteria

- The mirrored skill is synchronized and is the only creative author.
- Rich/compact behavior is driven by capability facts, not model-name text.
- Target prompts include natural-human inline avoidance prose and preserve all
  higher-priority safety/identity rules.
- Legacy output remains readable and non-target QC remains compatible.
- Stale records are never silently upgraded.
- Focused skill/generation tests and the skill verifier pass.

## Implementation notes

- Added the facts-only `image_prompt_capability` block to normal and candidate
  skill calls. The skill selects rich/compact wording; TypeScript does not add
  Human Realism prose or a hidden negative list.
- Added mirrored Human Realism guidance to `SKILL.md` and `skill.md`, including
  natural skin/eye/hair detail, grounded anatomy, role-specific attractiveness,
  shot-aware optics, and inline anti-plastic/model avoidance prose.
- Target QC checks four semantic anchor groups on the selected prompt and
  omits preset negative-fragment merging. Legacy QC and negative behavior are
  unchanged when capability facts are absent.
- Target normal/candidate outputs carry `vd_character_natural_human_v1`; all
  five normal prompt fields and candidate prompts are checked against the
  resolved cap before LLM credits are deducted.
- The service exports the pure stale-snapshot decision contract; router wiring
  and approved/candidate reuse enforcement are owned by Section 03, so this
  section never silently upgrades a record itself.

## Verification

- Skill/generation focused suite: 244 passed.
- Combined Section 01–02 focused suite: 289 passed.
- Skill mirror and staged diff checks passed.
- Full web typecheck was attempted; diagnostics remain confined to unrelated
  pre-existing dirty files and none references the Section 02 implementation.
