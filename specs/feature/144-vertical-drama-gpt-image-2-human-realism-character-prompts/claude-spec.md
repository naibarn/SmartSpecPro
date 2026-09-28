# Feature 144 — Deep-plan specification

## 1. Decision summary

Feature 144 extends the existing `vertical-drama-character-visual-bible`
skill and its render boundary. It does not create a second Human Realism skill
and it does not put creative visual prose in TypeScript.

The implementation has four non-negotiable outcomes:

1. GPT Image 2, Nano Banana, and Seedream character requests use one complete
   natural-language `prompt` field. Avoidance intent is written as contextual
   prose inside that prompt; a separate `negative_prompt` is not submitted.
2. Character wording is authored by the skill and is natural-human focused:
   attractive and screen-readable, but not a fashion model, influencer,
   catalog face, plastic render, beauty-filter result, or generic corporate
   headshot.
3. The final selected image model and reference route resolve a factual
   capability record before generation. GPT Image 2/Nano Banana use a 20,000
   character ceiling; Seedream uses a deliberate compact 5,000 character
   profile. The prompt is never raw-sliced or silently hard-truncated.
4. Existing providers, legacy persisted negative fields, and non-target
   character flows remain compatible unless they are explicitly opted into the
   target contract.

The first slice is a contract and quality improvement, not a default-model
change. Paid A/B rendering is a release gate and is performed separately from
automated tests.

## 2. Resolved architecture decisions

### 2.1 Capability record

Add one explicit target capability record to the existing model capability
path. The record is resolved from the canonical selected model/config after
reference-image routing, never from display text or an alias substring.

The logical shape is:

```ts
type VerticalDramaCharacterPromptFamily =
  | "gpt_image_2"
  | "nano_banana"
  | "seedream"
  | "other";

type VerticalDramaCharacterPromptCapability = {
  family: VerticalDramaCharacterPromptFamily;
  maxPromptChars: number;
  negativePromptMode: "inline_only" | "separate_legacy";
  promptProfile: "rich" | "compact" | "legacy";
  source: "db" | "static" | "explicit_legacy";
  canonicalModelId: string;
  configured: boolean;
};
```

The exact exported type/helper name may follow local naming conventions, but
there must be one authoritative resolver layered on the existing
`modelPromptBudget.ts` infrastructure. Do not introduce a second independent
prompt-length constant or a new database table.

The target metadata should be represented in existing model `configJson`
alongside `maxPromptLength`, using one stable key such as
`verticalDramaCharacterPromptContract`:

```json
{
  "maxPromptLength": 20000,
  "verticalDramaCharacterPromptContract": {
    "family": "nano_banana",
    "negativePromptMode": "inline_only"
  }
}
```

The resolver may derive `promptProfile` from family and limit, but it must
reject malformed metadata and must not infer target status from the model name.
An unconfigured or ambiguous model remains on the legacy path or fails closed
according to the call-site contract; it must never receive an assumed 20,000
character budget.

### 2.2 Catalog and static parity

Audit every currently enabled GPT Image 2, Nano Banana, and Seedream row. For
each row, explicitly classify it as target-capable or legacy. Target-capable
rows must expose both the correct prompt ceiling and family metadata in the
database seed/config and in the static fallback used during cold start.

The first target matrix is:

| Family | Ceiling | Mode | Profile |
|---|---:|---|---|
| GPT Image 2 | 20,000 | `inline_only` | `rich` |
| Nano Banana | 20,000 | `inline_only` | `rich` |
| Seedream | 5,000 | `inline_only` | `compact` |

The legacy `google-nano-banana-pro` static entry is a required parity check. It
must either receive explicit Nano Banana metadata and 20,000 configuration, or
remain outside the target contract with an explicit legacy classification until
DB/static parity is repaired. No silent widening is allowed.

Do not assign Seedream's 5,000 limit to unverified Seedream versions merely
because they share a display-name prefix. Inventory them and configure each
one with its actual approved capability before enabling the target path.

### 2.3 Skill input and output

Pass only factual capability context into the skill input. The skill decides how
to write the creative prompt. The input block must contain at least:

```json
{
  "image_prompt_capability": {
    "family": "seedream",
    "max_prompt_chars": 5000,
    "single_prompt": true,
    "separate_negative_prompt": false,
    "prompt_profile": "compact"
  }
}
```

The normal and Feature 134 candidate output schemas may retain optional
`negative_prompt` for legacy readability and migration compatibility. For a
target request, it is non-authoritative: target QC inspects the combined prompt
and the adapter omits the field before provider submission. A target response
may expose `negativePrompt` as absent or empty at the service boundary, but the
provider payload contract is always omission, not an empty negative instruction.

### 2.4 Over-limit behavior

There are two distinct enforcement points:

- During skill generation, the selected capability is included in the facts and
  the output validator/retry path reports a model-specific budget violation.
  A bounded retry may ask the skill to produce a compact semantic rewrite while
  preserving identity, age, safety, role, framing, and Human Realism essentials.
- During final render, the fully assembled prompt is validated again after
  approved-prompt reuse, series-look handling, candidate selection, and any
  existing fact-only transformations. This check occurs before credit
  reservation or external provider submission.

If the prompt still exceeds the limit, return an actionable validation error.
Do not call the generic `verticalDramaPromptQc` hard-truncation fallback for a
target character request. The first slice does not add a TypeScript-authored
semantic compactor; semantic compaction belongs to the skill/retry contract.

## 3. Human Realism content contract

The mirrored runtime skill files must add a Human Realism section and examples
for both `rich` and `compact` profiles. The skill must apply these blocks
conditionally rather than copying a universal checklist into every prompt:

- identity and age-appropriate anatomy, including approved reference locks;
- macro/meso/micro skin structure with restrained matte-to-satin reflectance;
- believable eyes, catchlights, sclera, lips, brows, baby hair, and hair clumps;
- candid expression and balanced body language rather than catalog posing;
- attractive dramatic casting for adults without generic model grammar;
- supporting and villain role differentiation without universal glamour;
- hands, joints, feet, weight distribution, clothing tension, and contact
  shadows for three-quarter/full-body framing;
- shot-aware optical language instead of a fixed 85mm/shallow-focus recipe;
- natural inline avoidance prose relevant to the current character and shot.

The priority order remains:

```text
identity → anatomy → pose/expression → lighting → skin structure
→ camera/optical behavior → retouching restraint → inline avoidance clauses
```

Child/teen safety, approved Character DNA, reference identity, continuity, and
role truth outrank Human Realism styling. The skill must never use `perfect
face`, uniform pores, global gloss, or generic `ultra realistic` language as a
substitute for concrete human detail.

The compact Seedream profile preserves, in order, identity, age/safety, role,
framing, anatomy, essential skin/eye/hair realism, lighting, and only the most
relevant avoidance prose. It is a separately authored profile, not a character
count slice of the rich prompt.

## 4. End-to-end data flow

The implementation must make this flow explicit and testable:

```text
selected model + reference route
  → capability resolver
  → facts-only skill input
  → skill output (prompt fields + legacy-readable negative)
  → schema/identity/role/age/QC validation
  → selected portrait or full-body prompt
  → series-look/preset transformation
  → final capability validation
  → target payload normalization (omit negative)
  → credit reservation
  → media/Hermes/MCP provider transport
```

The same normalization rule must apply to preview-generated prompts,
approved-prompt reuse, normal portrait generation, full-body generation, sheet
generation, and Feature 134 candidate portrait mode. The approved snapshot may
continue to persist a legacy negative value for readability, but reuse must not
reintroduce it into a target payload.

Target reuse also requires a current prompt-contract marker such as
`vd_character_natural_human_v1`. A legacy approved/candidate prompt without
that marker must be regenerated through the skill when the required character
facts are available, or fail closed with an actionable regenerate-prompt error;
the adapter must not append Human Realism prose to an old prompt.

## 5. Required implementation surfaces

The plan must cover these areas without spreading creative ownership:

1. `apps/web/server/services/modelPromptBudget.ts` and related model capability
   types/resolver: explicit family/contract resolution and target budget checks.
2. `apps/web/scripts/seed-media-models-kie-ai.ts` and
   `apps/web/server/services/modelRegistry.ts`: target metadata and static/DB
   parity for all enabled target rows and aliases.
3. `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`:
   capability facts, normal/candidate schema handling, combined-prompt QC,
   bounded retry input, and final prompt selection.
4. Both mirrored
   `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md` and
   `skill.md`, plus their schemas/fixtures/verifier tests: Human Realism rich/
   compact authoring guidance and synchronized contract examples.
5. `apps/web/server/routers/verticalDramaCharacters.ts` and the existing media
   request boundary: capability resolution, final prompt validation, and
   target negative suppression across portrait/sheet/approved/candidate and
   Hermes/MCP routes.
6. `apps/web/server/services/mediaGenerationService.ts`: a defensive provider
   payload guard for target capability so direct character callers cannot leak
   `negative_prompt`; preserve all non-target payload behavior.
7. Existing persisted profile/snapshot types only where needed to keep legacy
   negative data readable without making it authoritative.
8. Focused tests and the skill verifier; no paid provider call in automated
   verification.

## 6. Error, compatibility, and observability contract

- Missing target capability: fail closed for a request explicitly requesting
  the target contract, or use the existing legacy path only where the current
  caller is not target-enabled. The response must identify that model
  capability metadata is incomplete and must not imply a provider failure.
- Over-limit final prompt: fail before credit reservation with model ID, family,
  resolved limit, and actual character count. Do not include the full prompt in
  the error or telemetry.
- LLM schema/retry exhaustion: preserve the existing typed validation/error
  path and include the compact-profile/budget reason when relevant.
- Provider transport failure: preserve existing retry/credit behavior; target
  prompt normalization must be idempotent so retries cannot restore a negative
  field.
- Legacy/non-target request: preserve existing negative prompt and generic QC
  semantics, including persisted values and existing tests.

Bounded metadata may record model ID, family, resolved cap, final prompt length,
profile, whether a semantic retry occurred, and
`negative_prompt_submitted: false` for target requests. Never log the full
prompt or legacy negative text by default.

## 7. Test and release contract

Automated tests must prove:

- capability resolution for GPT Image 2 (20,000), Nano Banana (20,000), and
  Seedream (5,000), including DB/static precedence, aliases, and missing
  metadata;
- mirrored skill content, input capability facts, rich/compact rules, child
  safety, role differentiation, full-body optical rules, and combined avoidance
  prose;
- normal and candidate output validation plus combined-prompt lead QC;
- portrait, full-body, sheet, approved snapshot reuse, and candidate flows;
- sync/async media payloads and Hermes/MCP envelopes omit target negative data;
- target prompts at the exact ceiling pass, over-limit prompts fail before paid
  work, and no raw truncation occurs;
- legacy negative data remains readable and non-target providers are unchanged;
- existing skill, identity, retry, and child-safety tests remain green.

Run focused tests with the web workspace Vitest command, the character skill
`verify.sh`, and the web TypeScript check. A bounded per-family A/B image review
is a separate, explicitly approved release gate and must compare identity,
natural human realism, attractive dramatic presence, non-model authenticity,
age/safety, anatomy/pose, and downstream reference usefulness. Broad rollout is
not complete until that gate passes for all three families.

## 8. Explicit non-goals

- no second skill or new Human Realism database object;
- no scene/start-frame prompt rewrite;
- no default image-model switch;
- no broad change to providers outside the three target families;
- no global removal of generic `verticalDramaPromptQc` hard-truncation behavior;
- no paid generation in unit/contract tests;
- no automatic migration that deletes persisted negative data.
- no silent submission of an old approved/candidate prompt that lacks the
  target contract marker.
