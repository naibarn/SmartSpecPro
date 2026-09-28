# Feature 144 implementation plan

## 1. Implementation objective

Extend the existing Vertical Drama character visual-bible pipeline so that
GPT Image 2, Nano Banana, and Seedream receive provider-aware, natural-human
character prompts with one authoritative prompt field and no separate negative
field. Keep creative authorship in the mirrored
`vertical-drama-character-visual-bible` skill, reuse Feature 137's model-aware
budget infrastructure, and preserve legacy/non-target behavior.

The implementation is backend/skill/contract work. It adds no new UI surface,
no new database table, no default model change, and no paid generation in
automated tests.

Authentication, tenant isolation, credit authorization, and existing rate
limits remain owned by the current `verticalDramaProcedure` and media/credit
services. This feature must not introduce a bypass: capability validation and
prompt-length failures happen after the existing authenticated model-selection
checks but before any credit reservation or provider submission.

## 2. Decisions fixed before implementation

These decisions close all open questions from the source spec:

| Question | Decision | Consequence |
|---|---|---|
| Where does capability enter? | Facts-only capability context is passed into the skill | The skill authors rich/compact prose; TypeScript does not author a replacement prompt |
| What is the target negative result? | Target provider requests omit `negative_prompt` entirely; service results expose no authoritative target negative | Legacy persisted values remain readable; non-target behavior is unchanged |
| What if metadata is missing? | Target-enabled character request fails closed before credit reservation; unmarked/legacy request follows the existing path | No model-name guess can grant 20,000 characters |
| How is Seedream shortened? | The skill authors a compact profile using the resolved 5,000-character fact | No LLM refiner, raw slice, or generic hard truncation in the first slice |
| What is preview metadata? | No new browser preview field in this slice | Server-side bounded diagnostics only; existing preview prompt contracts remain compatible |
| What is A/B minimum? | Twelve matched prompt pairs per family, same character facts/settings where supported, reviewed with the fixed rubric | A/B remains a release gate and is not part of unit tests |
| Which providers change? | Only target-family requests carrying the Vertical Drama character contract | Other image generation and legacy character requests keep existing semantics |

## 3. Current-to-target flow

### 3.1 Current flow

`verticalDramaCharacterImageGeneration.ts` loads the visual-bible skill, sends
facts-only character data to the LLM, validates the five prompt fields, applies
deterministic identity/role/region checks, and returns a selected prompt plus a
legacy negative prompt. The character router then applies series-look handling,
reserves credits, and calls async media, Hermes, or MCP transports. The media
service currently maps any supplied negative value to `negative_prompt`.

### 3.2 Target flow

```text
selected model + reference route
  -> existing model resolver
  -> vertical-drama character capability resolver
  -> facts-only skill input (family, cap, single-prompt, profile)
  -> skill output and schema validation
  -> combined-prompt identity/role/age/Human Realism QC
  -> portrait/full-body/candidate field selection
  -> series-look/preset transformations
  -> final cap check before credit reservation
  -> shared request normalizer
  -> provider payload (prompt only for target family)
  -> media/Hermes/MCP transport
```

Every branch must use the same normalizer: preview/approved reuse, portrait,
full-body, sheet, and Feature 134 candidate portrait mode. Retries must be
idempotent: once a target request is normalized, no retry or transport branch
may restore a negative field.

## 4. Capability contract and model catalog

### 4.1 Add a single resolver layer

Extend the existing prompt-budget infrastructure rather than creating a second
budget authority. Add
`apps/web/server/services/verticalDramaCharacterPromptContract.ts` as the
focused contract module; it must import and use
`resolveModelMaxPromptLength`/the existing configured limit parser. Keep
`modelPromptBudget.ts` as the authoritative source for configured length
resolution.

The exported logical contract is:

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

const VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION =
  "vd_character_natural_human_v1";
```

Required resolver behavior:

1. Accept the already-resolved canonical model/config context, including the
   reference-image route. If the current caller only has a model ID, use the
   same repository model-resolution helper used by the media service rather
   than duplicating alias logic.
2. Read explicit `verticalDramaCharacterPromptContract` metadata from DB/config
   first, then static fallback. Validate family, negative mode, and configured
   limit.
3. Use the existing configured max prompt length as the limit source and enforce
   the existing absolute ceiling. For the target matrix, require exactly
   20,000 for GPT Image 2/Nano Banana and 5,000 for Seedream; do not silently
   widen a malformed value.
4. Return `rich` for GPT Image 2/Nano Banana and `compact` for Seedream.
5. Return an explicit legacy/unknown result only for callers not opting into
   the target contract. A target-enabled caller receives a typed missing or
   invalid-capability error.
6. Expose a shared assertion helper that reports model ID, family, cap, and
   measured length without including the full prompt.

Prompt length must use the same normalized JavaScript `string.length` semantics
already used by the existing model-budget/media checks. This is intentionally
conservative for surrogate-pair characters; do not introduce a code-point or
byte-count alternative in this feature. Add boundary fixtures containing Thai
text and emoji to make the chosen behavior explicit.

Suggested helper surface:

```ts
resolveVerticalDramaCharacterPromptCapability(modelContext):
  VerticalDramaCharacterPromptCapability | throws CapabilityError

assertVerticalDramaCharacterPromptLength(prompt, capability): void | throws PromptBudgetError

isTargetVerticalDramaCharacterCapability(capability): boolean
```

The names may follow local conventions, but the resolver and assertion must be
shared by generation, router, and media payload code.

### 4.2 Catalog changes

Update the following surfaces together:

- `apps/web/scripts/seed-media-models-kie-ai.ts`: add explicit contract metadata
  and the correct `maxPromptLength` for every enabled target row. Inventory
  existing Nano Banana and Seedream rows first; do not classify a version from a
  loose prefix alone.
- `apps/web/server/services/modelRegistry.ts`: mirror target metadata for
  static fallback entries and aliases, including the legacy
  `google-nano-banana-pro` entry. If a row is intentionally legacy, mark it
  explicitly as such and add a regression test preventing accidental target
  widening.
- Any model config/fixture used by the media resolver: keep canonical and
  reference-image variants aligned. The reference route may change provider
  model names, but not the selected character capability.

Do not add a database migration for a new table or new column. Existing seed or
catalog-refresh behavior must upsert the config JSON idempotently. If the
runtime catalog has old rows, the deployment/runbook must refresh those rows
before enabling the target gate; the application must continue to fail closed
for rows that remain incomplete.

### 4.3 Capability tests

Extend the existing `modelPromptBudget.test.ts` and add a focused capability
contract test beside it. Cover DB-over-static precedence, static fallback,
aliases, reference variants, exact target limits, malformed metadata, unknown
target capability, and non-target legacy behavior. Verify that the existing
3,800 legacy floor is not used as a hidden target ceiling or expanded into a
target capability without metadata.

## 5. Skill contract and Human Realism authoring

### 5.1 Runtime skill files

Update both mirrored files:

- `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md`
- `apps/web/skills/vertical-drama-character-visual-bible/skill.md`

Keep them byte-for-byte synchronized after editing. Add a clearly bounded
Human Realism section with:

- identity-first anatomy and age-appropriate rendering;
- macro/meso/micro skin variation without repeated pores or global gloss;
- believable eyes, lips, brows, hair strands, and catchlights;
- candid expression and physically balanced body language;
- adult lead attractiveness that is dramatic and memorable, not model-like;
- supporting/villain differentiation without universal glamour;
- full-body anatomy, weight-bearing feet, hands, fabric tension, and contact
  shadows;
- shot-aware optical language that does not reuse a fixed 85mm recipe for every
  framing;
- contextual inline prose against plastic, waxy, CGI, beauty-filter, generic
  catalog, and anatomy failures.

Preserve existing Character DNA, reference, child-safety, role, and five-field
contracts. Human Realism is lower priority than identity, safety, approved DNA,
continuity, and role truth.

Add two authoring modes:

- `rich`: GPT Image 2/Nano Banana. Use the full conditional realism vocabulary
  within a concise, non-repetitive prompt.
- `compact`: Seedream. Preserve identity, age/safety, role, framing, anatomy,
  essential skin/eye/hair realism, lighting, and the most relevant avoidance
  prose in that order. Do not emit a rich prompt and slice it later.

Remove the fixed-lens implication from normative guidance while retaining any
example that is explicitly labeled as an example. Update the existing skill
example/fixture that currently hardcodes 85mm so it demonstrates shot-aware
selection instead.

### 5.2 Input contract

Extend both normal and candidate generation parameter types in
`verticalDramaCharacterImageGeneration.ts` with a factual capability object.
Insert it into `buildCharacterVisualBibleInputPayload` and
`buildCharacterVisualPromptsUserPrompt` as `image_prompt_capability`.

The skill input must expose only facts:

```json
{
  "family": "gpt_image_2 | nano_banana | seedream | other",
  "max_prompt_chars": 20000,
  "single_prompt": true,
  "separate_negative_prompt": false,
  "prompt_profile": "rich | compact | legacy"
}
```

Do not pass provider API secrets, raw model display labels, or instructions that
ask TypeScript to write aesthetic text. Existing facts-only payload tests must
assert the capability block is present and contains no hidden prompt prose.

### 5.3 Output and schema behavior

Keep the existing five prompt fields and optional legacy `negative_prompt` in
the skill schema so stored/legacy responses remain readable. For target
capabilities:

- all emitted prompt fields must be individually no longer than the selected
  capability cap, because any one may be selected later;
- `negative_prompt` may be ignored/empty, but it must not be required for target
  quality validation;
- target quality validation must inspect the combined selected prompt for
  natural-human and anti-model/anti-plastic intent;
- child-safety, identity-lock, role, and reference checks remain unchanged and
  higher priority.

Adjust the existing lead QC helper (`findLeadPromptQualityIssues`) so it accepts
the selected combined prompt and an explicit mode. Legacy mode continues to
inspect the legacy negative field. Target mode checks the combined prompt for
the minimum semantic anchors required by the skill contract and returns a
structured retry issue when they are absent. Avoid exact full-sentence matching
so the skill can write natural character-specific prose.

The existing bounded LLM retry mechanism may retry once with a structured issue
such as “rewrite the selected prompt compactly while preserving identity, age,
safety, role, framing, and natural-human avoidance prose.” After retry
exhaustion, return the existing typed schema/quality error. Do not invoke the
generic string hard-truncation fallback.

### 5.4 Negative fragment compatibility

The current service merges preset `imagePromptFragments.negative` into the
returned `negativePrompt`. Preserve this for legacy/non-target callers only.
For target capabilities, do not merge or submit that field. If a preset fact is
needed for target quality, pass it as a factual visual input for the skill to
express inline; do not append a hidden comma-list in TypeScript.

Apply this rule to normal and Feature 134 candidate output paths.

## 6. Shared render adapter and payload enforcement

### 6.1 Internal request context

Add an internal, non-public request context to the character render request,
for example:

```ts
type ImagePromptContract = "vertical_drama_character_v1";
```

The context is set only by Vertical Drama character routes. It carries the
resolved capability and selected final prompt into the shared normalization
boundary. Public media input schemas must not allow a caller to spoof arbitrary
capability metadata.

### 6.2 Character request normalizer

Create one shared helper in the existing server-service layer that:

1. accepts the selected prompt, optional legacy negative value, model context,
   capability, and contract marker;
2. applies no creative wording;
3. asserts final length after all prompt transformations;
4. for target family, returns a request with no negative field/property;
5. for legacy/non-target, preserves the current negative value and request shape;
6. is idempotent when called by both a router and the media service.

The normalizer must run after `applySeriesLookToImagePrompt` and after any
approved snapshot/candidate prompt selection. It must run before credit
reservation. It must be used by portrait, full-body, sheet, approved-prompt
reuse, and candidate flows.

Persisted approved snapshots and candidate drafts need an optional contract
version marker using
`VERTICAL_DRAMA_CHARACTER_PROMPT_CONTRACT_VERSION`. A target request may reuse
an approved/candidate prompt only when the marker is current and compatible with
the selected target profile. When an old record has no marker, regenerate from
available Character DNA through `verticalDramaCharacterImageGeneration.ts`
using the same capability facts and current approved-DNA context before submit;
if the required facts are unavailable, fail with an actionable
regenerate-prompt error. The router decides reuse versus regenerate/reject but
never appends Human Realism prose to upgrade an old prompt.

### 6.3 Router integration

Update `apps/web/server/routers/verticalDramaCharacters.ts` at each character
render entry point: the preview mutation, the primary portrait mutation, the
`generatePortraitCandidateBatch` mutation, and the character-sheet mutation.
The existing candidate draft/selection/poll lifecycle remains Feature 134's
owner; Feature 144 only applies the prompt contract at generation and submit
boundaries.

- resolve the actual selected model/reference capability before skill generation
  when generating a new prompt;
- pass capability facts into normal and candidate skill generation;
- preserve preview and approved snapshot readability;
- select portrait/full-body exactly as the skill currently decides;
- apply existing series-look handling before the final assertion;
- normalize the request before reserving credits;
- preflight every candidate prompt and contract version before claiming the
  candidate batch or calculating/reserving its credit total, so one invalid
  candidate cannot reserve credits and fail halfway through submission; if the
  existing lifecycle requires a claim to load drafts, use its existing
  idempotent release/expiry path on preflight failure;
- pass the normalized request to async media, Hermes, and MCP branches.

Do not duplicate target logic in each branch. A route may call a shared
`prepareVerticalDramaCharacterImageRequest` helper that returns the final prompt,
capability, and normalized optional negative value.

### 6.4 Media service defense in depth

Update `apps/web/server/services/mediaGenerationService.ts` at the common sync
and async payload construction boundary. When the internal character contract
and target capability are present, omit the `negative_prompt` property entirely
from the provider payload. Do not send `undefined`, an empty string, or the
legacy preset value. Preserve the existing mapping for all other requests.

The same guard must apply to Kie/provider payload construction and any shared
Hermes/MCP envelope builder that can receive a negative value. If Hermes/MCP
uses a different request type, adapt it through the same normalizer rather than
reimplementing the decision.

## 7. Persistence and compatibility

Keep optional negative fields and an optional prompt-contract version in existing
approved snapshot/profile/candidate JSON schemas and database records. Do not
delete or rewrite old records. When a target prompt is
generated or reused:

- the prompt remains the authoritative content;
- any old negative value remains readable for legacy inspection but is not
  submitted to a target provider;
- preview/result types may retain optional compatibility fields, but the target
  normalized render request must have no negative property;
- an old prompt without the current contract marker is regenerated or rejected,
  never silently upgraded by string concatenation;
- non-target and old saved flows retain current behavior.

Add regression coverage to `characterProfile.test.ts` only if the snapshot type
or serialization path changes. Avoid a schema migration unless implementation
proves an existing field cannot represent the compatibility behavior.

## 8. Detailed execution waves

### Wave 1 — Baseline and capability contract

1. Confirm the dirty worktree and preserve unrelated changes.
2. Add capability types/resolver and final length assertion using the existing
   prompt budget resolver.
3. Update seed/static metadata and aliases for target rows.
4. Add capability and catalog parity tests.

Exit criteria: capability resolution is deterministic for all target examples,
unknown target metadata fails closed, and existing non-target budget tests pass.

### Wave 2 — Skill and generation contract

1. Update both mirrored skill markdown files and synchronized examples.
2. Update skill input/output schemas, fixtures, and verifier expectations.
3. Thread the capability facts through normal and candidate generation.
4. Adapt combined-prompt QC and bounded retry issue handling.
5. Preserve legacy negative merge/readability while disabling it for target
   output semantics.

Exit criteria: skill verifier, skill-content tests, normal/candidate schema tests,
identity/safety tests, and focused generation tests pass; a target response has
natural-human inline prose and no dependency on a separate negative list.

### Wave 3 — Render boundary and payload enforcement

1. Add the internal character contract marker and shared request normalizer.
2. Integrate all Vertical Drama portrait/full-body/sheet/approved/candidate
   branches.
3. Add media sync/async payload omission and Hermes/MCP normalization.
4. Place final prompt validation before credit reservation.
5. Add payload-shape, over-limit, and legacy compatibility tests.

Exit criteria: every target provider payload has exactly one prompt field,
no `negative_prompt` property, and over-limit requests stop before paid work.
Non-target payload snapshots remain unchanged.

### Wave 4 — Verification, rollout, and A/B gate

1. Run focused Vitest suites, skill verifier, and TypeScript check.
2. Review changed-surface diffs and verify mirrored skill files are equal.
3. Execute a bounded manual A/B with twelve matched pairs per target family.
4. Score the fixed rubric with two reviewers or one reviewer plus a recorded
   second pass; reject rollout on any identity/safety regression.
5. Enable the target contract only for catalog rows with complete metadata and
   record telemetry for prompt length, retry, omission, and regeneration.

## 9. File-by-file change map

| File/module | Planned responsibility | Wave |
|---|---|---:|
| `apps/web/server/services/modelPromptBudget.ts` | existing configured budget source, extended only where required for the shared contract | 1 |
| `apps/web/server/services/verticalDramaCharacterPromptContract.ts` | target capability resolver, contract version, final length assertion, request normalizer | 1/3 |
| `apps/web/scripts/seed-media-models-kie-ai.ts` | DB seed/config metadata and limits | 1 |
| `apps/web/server/services/modelRegistry.ts` | static fallback/alias parity | 1 |
| `apps/web/server/services/__tests__/modelPromptBudget.test.ts` | resolver and limit regressions | 1 |
| `apps/web/server/services/__tests__/verticalDramaCharacterPromptContract.test.ts` | metadata validation, target matrix, and contract-version constants | 1 |
| `apps/web/server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts` | final cap check, stale-marker handling, idempotent target omission | 3 |
| `apps/web/skills/vertical-drama-character-visual-bible/SKILL.md` | Human Realism rich/compact authoring | 2 |
| `apps/web/skills/vertical-drama-character-visual-bible/skill.md` | mirrored runtime content | 2 |
| skill schemas/fixtures/verifier files | capability input and output examples | 2 |
| `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` | capability facts, schema/QC/retry, stale-prompt regeneration, target negative semantics | 2/3 |
| `verticalDramaCharacterVisualBible.skillContent.test.ts` | synchronized content and required guidance | 2 |
| `verticalDramaCharacterImageGeneration.test.ts` | normal/candidate generation contract | 2 |
| `apps/web/server/services/verticalDramaCharacterPromptContract.ts` | final cap check and target negative omission shared by router/media/Hermes/MCP | 3 |
| `apps/web/server/routers/verticalDramaCharacters.ts` | all character render entry points | 3 |
| `apps/web/server/services/mediaGenerationService.ts` | sync/async provider payload defense | 3 |
| `apps/web/server/services/hermesMediaScheduler.ts` and `hermesMediaReferences.ts` | normalized prompt passed to Hermes queue/envelope | 3 |
| `apps/web/server/services/mcpMediaAdapter.ts` and `apps/web/server/services/mcpProviderModelAliases.ts` where the shared envelope is assembled | normalized MCP request without target negative data | 3 |
| media/Vertical Drama router tests | branch and payload integration proof | 3 |
| `verticalDramaPromptQc.test.ts` | prove generic behavior remains and target path bypasses hard truncation | 3 |
| `characterProfile.test.ts` if serialization changes | legacy snapshot compatibility | 3 |
| A/B evaluation record under the feature spec directory | release evidence, not runtime code | 4 |

The implementer must resolve exact adjacent module names through existing exports
before editing; no duplicate helpers with equivalent authority may be added.

## 10. Test-driven acceptance matrix

### Capability and budget

- GPT Image 2 text and reference routes resolve `gpt_image_2`, 20,000, rich,
  inline-only.
- Nano Banana canonical/alias/static rows resolve `nano_banana`, 20,000, rich,
  inline-only.
- Seedream 5 Pro text/reference routes resolve `seedream`, 5,000, compact,
  inline-only.
- DB metadata wins over static fallback; static fallback contains the same
  contract for enabled rows.
- Missing/invalid target metadata cannot fall back to an assumed 20,000.
- Exact cap passes; cap + 1 fails with a bounded error before paid work.

### Skill and QC

- Adult lead is attractive and dramatic but contains anti-model and
  anti-plastic intent in the combined prompt.
- Supporting and villain prompts retain role-specific treatment.
- Child/teen prompt remains age-appropriate and safety precedence is preserved.
- Reference lock preserves identity without copying filter/compression artifacts.
- Full-body prompt contains body/feet/weight/wardrobe and does not inherit
  close-up-only optical grammar.
- Seedream compact input is selected by capability fact and preserves critical
  semantic anchors.
- Target combined QC does not require a separate negative field; legacy QC still
  supports the old field.

### Render and transport

- Preview/approved reuse, portrait, full-body, sheet, and candidate flows use
  one normalizer.
- Candidate batches preflight all prompts before batch credit reservation and
  reject stale contract versions before any claim/reservation/provider submit;
  if a claim is unavoidable for loading, it is released/expired on failure.
- A stale approved prompt with no current marker is regenerated in the existing
  skill-generation service when approved Character DNA is available, and is
  otherwise rejected without a creative router-side append.
- GPT Image 2/Nano Banana/Seedream sync and async payloads omit
  `negative_prompt` entirely.
- Hermes and MCP target envelopes omit negative data as well.
- Legacy/non-target payloads retain current negative behavior.
- Series-look transformation cannot cause a post-selection prompt to bypass the
  final cap check.
- Credit reservation is not reached for missing capability or over-limit prompt.
- A retry cannot reintroduce negative data or bypass final validation.
- The existing one-retry bound and provider backpressure/rate-limit behavior are
  unchanged; capability errors do not consume retry budget or enqueue work.

## 11. Error and observability details

Use the existing typed error conventions and map the following semantic errors
to browser-visible actionable failures at the router boundary:

- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING`
- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID`
- `VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG`
- existing schema/quality retry exhaustion with a target-specific issue detail

Error metadata may include canonical model ID, family, cap, length, and profile.
Never include the full prompt, the full legacy negative value, or reference image
data in logs/errors.

Record bounded diagnostics only after normalization:

```text
model_id, family, prompt_profile, max_prompt_chars, prompt_length,
semantic_retry_count, negative_prompt_submitted=false, contract_version
```

Do not log the prompt body by default. Preserve existing credit and provider
retry semantics for transport failures.

## 12. Rollback and operational safety

- The target path is gated by explicit model metadata and the internal character
  contract marker; removing/invalidating metadata disables the target path
  without changing old records.
- Rollback of skill content returns target generation to the prior skill behavior,
  but the payload guard must remain covered by tests before re-enable.
- Catalog refresh is idempotent and must not delete models or persisted prompts.
- Existing saved negative values are never bulk-deleted.
- If A/B shows identity, age, or safety regression, disable target metadata for
  the affected family and retain legacy behavior while preserving evidence.

## 13. Definition of done

The feature is plan-complete for implementation when:

1. all target catalog rows have explicit, parity-tested capability metadata;
2. the skill writes rich/compact natural-human prompts with inline avoidance
   prose and no TypeScript creative replacement;
3. target requests have one provider prompt and no separate negative field over
   all character routes;
4. prompt caps are resolved per actual model/reference route, validated before
   credit reservation, and never silently truncated;
5. legacy records and non-target providers remain compatible;
6. focused automated verification passes, including the existing baseline tests;
7. twelve matched A/B pairs per family pass the fixed identity/realism/safety
   rubric before broad enablement.
