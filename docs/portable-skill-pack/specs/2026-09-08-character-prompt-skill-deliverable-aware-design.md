# Character Prompt Skill: deliverable-aware Vertical Drama integration

## Problem

The Vertical Drama character flow currently calls the
`vertical-drama-character-visual-bible` skill once, but requires five prompt
fields (`primary_portrait_prompt`, `turnaround_prompt`, `full_body_prompt`,
`expression_sheet_prompt`, and `outfit_sheet_prompt`) in every response. The
portrait preview and portrait render use only the primary prompt. Turnaround
uses one field, and named Character Design Bible sheets use `sheet_prompt`.
The four always-on sibling prompts are therefore frequently generated and
discarded. They enlarge the response, increase schema-retry surface, and
consume provider work without improving the requested render.

The new `character-prompt-skill` already provides a richer, role-aware profile
with a single `positive_prompt`, `negative_prompt`, face blueprint, visual
translation, diversity signature, and quality gate. It must become the sole
prompt author for the normal single-character portrait/sheet path without
breaking existing render, approval, reference-lock, persistence, or billing
contracts.

## Goals and non-goals

Goals:

- Use `character-prompt-skill` for normal portrait and sheet prompt authoring.
- Generate one prompt for one requested deliverable per LLM call.
- Preserve the existing tRPC mutations, async media jobs, model selection,
  reference-image behavior, approval flow, and fixed skill-credit settlement.
- Preserve approved identity data for future generations and support existing
  records that still contain legacy `designDna`.
- Keep reference-guided candidate casting on its dedicated
  `character-candidate-prompt` contract.
- Fail closed on malformed profile output, incompatible age/role/region facts,
  prompt-length violations, or stale approved snapshots.

Non-goals:

- Do not change image providers, image-render credit pricing, or media polling.
- Do not migrate historical prompt text that was never persisted.
- Do not make one LLM call per prompt field.
- Do not silently run both character skills for the same normal request.

## Chosen architecture

Add a focused server adapter, `verticalDramaCharacterPromptSkill`, between the
Vertical Drama routers and the new skill. The adapter owns transport and
compatibility concerns; the skill remains the sole author of natural-language
appearance prose.

The adapter performs these steps:

1. Resolve the existing series/character facts, role tier, age profile, region
   facts, reference facts, casting preferences, approved identity context, and
   image-model prompt capability exactly as the current router does.
2. Normalize those facts to the new skill's `series_dna`, `characters`, and
   `generation` input contracts. Missing optional story fields receive bounded
   factual defaults; user text remains data, never an instruction channel.
3. Set one explicit deliverable in `generation.render_context`:
   `portrait`, `turnaround`, or `sheet:<requested_sheet_type>`. The adapter
   also states the selected model's inline/separate-negative capability so the
   skill can author the correct form once.
4. Load `apps/web/skills/character-prompt-skill/skill.md` as the system prompt
   and validate the single profile against a shared Zod contract mirroring
   `schemas/character-prompt-profile.schema.json`.
5. Return the profile's `positive_prompt` as the render prompt and its
   `negative_prompt` only when the selected model uses a separate negative
   channel. Return the profile and its visual summary for persistence/audit.

The existing `generateCharacterVisualPrompts` implementation remains available
for legacy callers and tests during the migration, but normal router calls move
to the adapter. No router path calls both implementations for one request.

The skill contract will gain an explicit deliverable rule: `generation.render_context`
is data describing the requested render, and `positive_prompt` must be a
complete standalone prompt for that render. A portrait request must not emit a
sheet layout; a turnaround request must describe the requested angles; a named
sheet request must describe exactly that sheet. The skill continues to own all
creative wording and safety/realism decisions.

## Deliverable routing

- `previewCharacterPrompt` and direct portrait generation request `portrait`.
- `generateCharacterSheet` with `turnaround`/`auto` requests `turnaround`.
- `generateCharacterSheet` with any named format or `full_combined` requests
  `sheet:<type>`.
- The portrait approval path continues to pass the approved prompt back to the
  render mutation, so the second mutation does not call any LLM.
- Candidate casting remains separate. Reference-guided candidates continue to
  use `character-candidate-prompt`; the existing batch contract is not mixed
  with the single-profile contract.

## Persistence and compatibility

Extend the shared approved visual-bible contract with an optional validated
`characterPromptProfile` object and make legacy `designDna` optional only when
the new profile is present. Existing records remain valid because their
`designDna` remains unchanged.

The adapter maps legacy role values to the new enum without guessing from
occupation or free text. For example, legacy `lead_female` maps to
`lead_female`, legacy `child` maps to `child_hero`/`child_heroine` from the
authoritative gender/narrative facts, and legacy `support` maps to
`support_general` unless the stored role explicitly says memorable support.
Conflicting age/timeline/role facts fail before the LLM call.

For a new profile, persist:

- the complete validated `characterPromptProfile`;
- bounded visual-bible summary fields derived from the profile;
- `promptContractVersion` and the selected `promptProfile` so approved-prompt
  reuse remains compatible with model capability checks;
- legacy `designDna` when one already exists, without inventing hidden narrative
  facts that the new skill did not provide.

`extractVisualSummary` and the character design-context loader will recognize
the new profile's summary/face blueprint as continuity evidence. This lets the
next generation see the approved face identity even when no legacy DNA exists.
The adapter will include bounded current-cast summaries in its data context so
the new skill can apply its anti-clone rules across a series.

## Billing and operational behavior

Each normal prompt request still performs one credit-gated skill call and one
fixed skill settlement using slug `character-prompt-skill`. Image rendering
continues to be a separate media charge. The settlement metadata will record
the deliverable, profile version, model, input/output tokens, and retry count.

The preflight check uses the configured fixed price for `character-prompt-skill`
when it is available, while settlement remains the existing idempotent fixed
skill-run boundary. This prevents a request from starting when the account
cannot cover the actual configured charge.

Because the response contains one prompt instead of five, output tokens and
provider work should decrease. Schema retries remain bounded and are charged
only after a valid final profile, following the existing planning-call pattern.

## Failure handling

- Invalid JSON or profile schema: use the existing bounded schema-repair path;
  never synthesize a missing prompt in TypeScript.
- Wrong role tier, age band, explicit region, or approved identity: reject the
  response before credit settlement and image submission.
- Prompt over the selected image model's limit: reject before image credits are
  reserved.
- Missing profile snapshot on a target-model approval: require fresh preview,
  preserving the current stale-snapshot safety behavior.
- Profile persistence failure after async submission: report the warning and do
  not resubmit the paid image task.

## Testing strategy

Add focused tests for:

1. Input normalization from existing Vertical Drama facts to the new skill's
   schemas, including Thai series DNA, supporting/elder role tiers, child
   timeline, explicit region, twin/reference facts, and custom instructions.
2. One profile call per deliverable and correct routing of `positive_prompt`.
3. Portrait preview followed by approved render with zero second LLM call.
4. Turnaround and named-sheet calls that do not require sibling prompt fields.
5. Target-model negative handling and prompt-length enforcement.
6. Snapshot validation/reuse for both legacy `designDna` and new profiles.
7. Fixed-credit settlement metadata using the new skill slug and deliverable.
8. Malformed output, role/age/region conflicts, retry exhaustion, and
   persistence-warning behavior.

Validation will use focused Vitest suites, the new skill's existing audit
script, `git diff --check`, and TypeScript/esbuild checks limited to the touched
modules. No image generation, deployment, database mutation, or service restart
is part of this change.

## Migration and rollback

The migration is code-compatible and additive. Existing stored visual bibles
continue through the legacy reader. A rollback can point the router back to the
existing service without deleting the new profile field; no database migration
or data rewrite is required. The old service remains until the new adapter has
passed focused production-like tests and usage metrics show stable profile
validation and lower output tokens.
