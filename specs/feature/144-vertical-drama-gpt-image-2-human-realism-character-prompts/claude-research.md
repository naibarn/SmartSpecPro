# Feature 144 Research

## Research decision

- **Codebase:** required. SmartSpecPro is an existing TypeScript/tRPC media
  generation system with an already-running Vertical Drama character visual-bible
  flow.
- **SocratiCode:** unavailable in this session. The mandatory capability check
  returned no `codebase_*` tools, so research used bounded `rg`, `nl`, and focused
  line-range reads instead of broad repository reads.
- **Web:** required only for provider-contract verification because the spec names
  current GPT Image 2, Nano Banana, and Seedream API families. The external docs
  confirm the Kie create-task model/input shapes; the exact 20,000/5,000 character
  limits are treated as the user-confirmed product requirement and repository
  catalog facts, not inferred from undocumented prose in the docs.
- **Testing:** Vitest through the web workspace, the existing Vertical Drama skill
  verifier, and the web TypeScript check. Paid provider calls remain outside unit
  and contract tests.

## Existing architecture and ownership

### Character prompt generation

`apps/web/server/services/verticalDramaCharacterImageGeneration.ts` is the skill
runtime boundary. It loads the actual
`vertical-drama-character-visual-bible` skill body, builds a facts-only user
payload, calls the LLM, validates the snake_case output with Zod, applies
deterministic identity/region/role checks, and returns the selected
`portraitPrompt` plus legacy `negativePrompt`. It does not itself render images.

Important current facts:

- `GenerateCharacterVisualPromptsParams` carries character facts, reference facts,
  preset visual identity, custom instruction, and approved design context, but no
  selected image-model capability context.
- `buildCharacterVisualBibleInputPayload` and
  `buildCharacterVisualPromptsUserPrompt` are the correct insertion points for a
  factual capability block; the skill remains the author of visual prose.
- The normal output schema and candidate output schema both still expose an
  optional `negative_prompt`.
- `findLeadPromptQualityIssues` requires role-drift guards in
  `negative_prompt`, so a single-prompt target path must adapt this validator to
  inspect the combined prompt without removing legacy compatibility for other
  paths.
- The service currently merges preset `imagePromptFragments.negative` into the
  returned `negativePrompt`. That merge is a data-flow compatibility behavior,
  but it must not become a hidden second provider instruction for target families.
- The service selects `full_body_prompt` only when the skill returns
  `primary_portrait_framing: "full_body"`; it must continue to preserve this
  skill-owned framing decision.

### Character router and paid render flow

`apps/web/server/routers/verticalDramaCharacters.ts` owns the browser-visible
preview and paid render procedures. The relevant flow is:

1. resolve the caller-selected image model and reference route;
2. generate or reuse an approved prompt snapshot;
3. apply series-look/preset handling;
4. reserve image credits;
5. call `mediaGenerationService.generateImageAsync` or queue the transport-specific
   Hermes/MCP path;
6. return a task envelope for polling and later asset linking.

Current call sites pass both `prompt` and `negativePrompt` in the portrait and
sheet branches. The approved snapshot also persists an optional
`negativePrompt` through `apps/web/shared/verticalDramaSeries/characterProfile.ts`.
The implementation must centralize target-family payload suppression so preview,
approved-prompt reuse, portrait render, sheet render, Hermes, and MCP paths cannot
silently diverge.

### Media provider payload

`apps/web/server/services/mediaGenerationService.ts` currently builds both sync
and async image payloads with:

```text
prompt -> prompt
negativePrompt -> negative_prompt
model -> model
reference images -> reference_image_urls / api_config / extra_params
```

The async payload is assembled around `generateImageAsync`; this is the most
important transport boundary for a target-family `negative_prompt` omission. The
service also supports model-specific `apiConfig`, dynamic `extraParams`, provider
model aliases, reference routing, MCP, and Hermes. A target contract must not
rewrite those transport branches or affect non-target models.

## Model capability and catalog evidence

### Existing resolver

`apps/web/server/services/modelPromptBudget.ts` already provides:

- `resolveConfiguredMaxPromptLength` for `maxPromptLength` and
  `max_prompt_length`;
- DB/config-first `resolveModelMaxPromptLength` with static-registry fallback;
- a 20,000-character absolute Vertical Drama image ceiling;
- `resolveVdImagePromptBudgetForModel`, which preserves the legacy 3,800 floor
  for low/unknown models and widens to configured values.

This is reusable infrastructure, but it is intentionally widening-only and does
not distinguish a target-family single-prompt contract from an unknown model.
Feature 144 therefore needs either a narrow capability resolver layered on this
module or an explicit target capability record, not a second unrelated prompt
length constant.

### Current Kie seed rows

`apps/web/scripts/seed-media-models-kie-ai.ts` currently declares:

| Family | Canonical row | Provider model/route | Current configured limit |
|---|---|---|---:|
| GPT Image 2 | `gpt-image-2-text-to-image` | `gpt-image-2-text-to-image`; reference route `gpt-image-2-image-to-image` | 20,000 |
| Nano Banana 2 | `google-banana-2` | `nano-banana-2` | 20,000 |
| Nano Banana 2 Lite | `google-banana-2-lite` | `nano-banana-2-lite` | 20,000 |
| Seedream 5 Pro | `seedream/5-pro-text-to-image` | text-to-image; reference route `seedream/5-pro-image-to-image` | 5,000 |

The model rows also define reference-image inputs, aspect ratios, and provider
specific dynamic input fields. Capability resolution must use the actually
resolved row after reference-image selection, not just the user-facing alias.

### Static-registry gap

`apps/web/server/services/modelRegistry.ts` has a legacy
`google-nano-banana-pro` default model entry without the same explicit
20,000-character capability in its static config. The DB-first path may still
work when the database row is present, but cold-start/static fallback can retain
the legacy 3,800 budget. This is a real implementation prerequisite: either add
static/DB parity or keep that legacy entry outside the target contract until the
capability is explicit.

The existing `modelPromptBudget.test.ts` already proves DB precedence, static
fallback, the 20,000 absolute ceiling, and current GPT Image 2/Nano Banana rows.
It should be extended with Seedream 5,000 and the legacy Nano Banana Pro parity
case rather than creating a second standalone test model registry.

## Skill bundle evidence

The runtime-loaded bundle has mirrored `SKILL.md` and `skill.md` files, JSON
schemas, fixtures, references, tests, and `scripts/verify.sh`. Existing skill
content already covers:

- Story Character DNA, role tiers, identity locks, approved references, child
  safety, solo-person constraints, and anti-clone checks;
- attractive dramatic casting that must not read as generic catalog/influencer or
  corporate-headshot imagery;
- five independently authored prompt fields;
- a fixed 85mm/shallow-focus cinematic example and a separate full-body section;
- a validator-enforced lead beauty vocabulary that still expects role guards in a
  separate `negative_prompt`.

The key skill work is additive and must be mirrored in both markdown copies and
any referenced input/output contract files. The implementation must not add a
second Human Realism skill or put creative avoidance prose in TypeScript.

## Prompt-QC conflict to resolve

`apps/web/server/services/verticalDramaPromptQc.ts` documents and tests an LLM
refinement path that, after failed refinement, can fall back to sentence-boundary
or hard truncation. That behavior is acceptable only where the existing product
contract allows it. For Feature 144 target character prompts, it conflicts with
the requirement that identity, age, safety, and inline avoidance clauses cannot
be silently truncated.

The plan should therefore choose one of these bounded target-path behaviors:

1. fail before paid provider submission with a model-specific actionable error; or
2. add a deterministic/skill-owned semantic compaction path with tests proving
   critical-fragment preservation, especially for the 5,000-character Seedream
   budget.

Reusing the generic hard-truncation fallback without a target-specific guard is
not safe.

## External provider research

The official Kie model pages confirm that all three target families use the Kie
create-task market API and carry the generation prompt as the `input.prompt`
field. They also expose separate text-to-image and image-to-image routes where
references are involved:

- [Kie GPT Image 2 — Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image)
- [Kie GPT Image 2 — Image to Image](https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image)
- [Kie Google Nano Banana 2](https://docs.kie.ai/market/google/nanobanana2)
- [Kie Seedream 5.0 Pro — Text to Image](https://docs.kie.ai/market/seedream/5-pro-text-to-image)

The docs show prompt-based request bodies and do not provide a reliable visible
character-limit declaration in the fetched page content. The plan therefore
treats the user-confirmed 20,000/20,000/5,000 values and repository seed rows as
the authoritative product inputs, with capability metadata tests guarding runtime
drift.

## Testing setup and commands

The web workspace uses Vitest:

```text
npm --workspace @smartspec/web run test -- <focused test files>
npm --workspace @smartspec/web run check
bash apps/web/skills/vertical-drama-character-visual-bible/scripts/verify.sh
```

Existing relevant tests include:

- `server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts`
- `server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`
- `server/services/__tests__/modelPromptBudget.test.ts`
- `server/services/__tests__/verticalDramaPromptQc.test.ts`
- `server/services/mediaGenerationService.test.ts` and focused prompt/payload tests
- `server/routers/__tests__/verticalDramaCharacters.*.test.ts`
- `shared/verticalDramaSeries/characterProfile.test.ts`

The previous baseline skill verifier and character-generation tests were green
before this planning session. No paid image generation is appropriate for unit
tests; bounded A/B rendering is a separate manually approved gate.

## Research conclusions

1. Keep the feature skill-first and extend the existing character visual-bible
   bundle; do not create another prompt skill.
2. Introduce one capability record resolved from the selected image model and
   reference route. Use the existing catalog/budget resolver as the source of
   the limit, with explicit target-family metadata and static parity tests.
3. Make the target character render boundary send one combined prompt and omit
   `negative_prompt`; preserve legacy persisted/readable fields and non-target
   provider behavior.
4. Treat Seedream as a first-class compact profile, not as a 20,000-character
   prompt that is sliced at the end.
5. Adapt lead QC and candidate QC to inspect the combined prompt, while keeping
   the existing role/identity/child precedence and bounded retry behavior.
6. Centralize payload suppression and capability validation across normal portrait,
   sheet, approved-prompt reuse, async media, Hermes, and MCP paths.
7. Resolve the generic hard-truncation conflict before enabling the target path.

