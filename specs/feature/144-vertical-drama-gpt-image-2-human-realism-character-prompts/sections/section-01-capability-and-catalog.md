# Section 01 — Capability and catalog

## Scope

Establish the single model capability contract used by Feature 144. This
section owns model-family classification, target prompt ceilings, explicit
metadata validation, static/database parity, aliases, the contract version, and
the shared prompt-length assertion. It does not edit the visual-bible skill,
Vertical Drama routes, or provider payload construction.

## Inputs and outputs

Inputs come from the existing resolved media-model/config context after model
alias and reference-image route resolution. The resolver must not classify a
model from a display name or loose substring.

Export the logical capability shape:

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

Define and export the target prompt contract version:

```text
vd_character_natural_human_v1
```

Keep configured maximum-length resolution owned by
`apps/web/server/services/modelPromptBudget.ts`. Add
`apps/web/server/services/verticalDramaCharacterPromptContract.ts` as the
Feature 144 layer that consumes that resolver; do not create another unrelated
limit constant.

## Required behavior

1. Resolve DB/config metadata first, then static fallback. The target metadata
   key is `verticalDramaCharacterPromptContract` and contains the normalized
   family and `negativePromptMode`.
2. Require a valid configured `maxPromptLength` for target capability. The
   accepted matrix is GPT Image 2 = 20,000, Nano Banana = 20,000, and Seedream
   = 5,000. A malformed or missing target record is not widened to 20,000.
3. Return `rich` for GPT Image 2/Nano Banana and `compact` for Seedream.
4. Return a legacy/unknown result only for callers that did not opt into the
   Vertical Drama character contract. A target-enabled caller gets a typed
   missing/invalid-capability failure before any paid work.
5. Preserve the existing absolute ceiling and legacy 3,800 behavior for
   non-target paths.
6. Resolve capability from the canonical selected model/config, including the
   reference-image route. Reference routing may change provider model details,
   but must not silently change the character family/cap.
7. Expose a shared assertion that uses the same normalized JavaScript
   `string.length` semantics as the existing media/budget checks. This is
   intentionally conservative for surrogate-pair characters. It reports model,
   family, cap, and measured length without logging the prompt.

Suggested functions (names can follow local conventions, but the authority and
semantics are fixed):

```text
resolveVerticalDramaCharacterPromptCapability(modelContext, options)
assertVerticalDramaCharacterPromptLength(prompt, capability)
isTargetVerticalDramaCharacterCapability(capability)
```

## Catalog surfaces

Update these together:

- `apps/web/scripts/seed-media-models-kie-ai.ts`: add explicit target metadata
  and limits to every enabled target row; inventory all Nano Banana and
  Seedream versions instead of matching display prefixes.
- `apps/web/server/services/modelRegistry.ts`: mirror the metadata in static
  fallback entries and aliases, including `google-nano-banana-pro`.
- Any existing model-config fixtures used by the resolver: align canonical and
  reference-image variants.

The legacy `google-nano-banana-pro` entry must either become explicitly
configured as Nano Banana/20,000 or remain explicitly legacy. Both outcomes
must be testable; a cold-start static fallback may not retain an accidental
3,800 budget while DB rows claim target capability.

Use the existing idempotent seed/catalog refresh mechanism. Do not add a new
table, delete rows, or remove old persisted prompts. Deployment must refresh
old rows before enabling the target path, and incomplete rows must remain
fail-closed.

## TDD-first tests

Write tests before implementation in:

`apps/web/server/services/__tests__/verticalDramaCharacterPromptContract.test.ts`

and extend:

`apps/web/server/services/__tests__/modelPromptBudget.test.ts`.

The tests must cover:

- GPT Image 2 text/reference capability: 20,000, rich, inline-only;
- Nano Banana canonical/alias/static capability: 20,000, rich, inline-only;
- Seedream 5 Pro text/reference capability: 5,000, compact, inline-only;
- DB/config precedence over static fallback;
- canonical/alias/reference route parity;
- malformed family/mode/limit;
- unknown target model never assuming 20,000;
- non-target legacy result preserving existing behavior;
- exact cap pass and cap + 1 failure;
- ASCII, Thai, and emoji length fixtures using `string.length`;
- error metadata not containing full prompt text;
- every enabled target seed/static row having explicit contract metadata;
- legacy Nano Banana Pro parity or explicit legacy classification;
- non-target catalog snapshots remaining unchanged.

Use existing model-config mocks and no network/database mutation. The tests must
not call an image provider.

## Failure and compatibility rules

- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING` is used when target
  contract is requested but no complete capability exists.
- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID` is used for malformed
  metadata or a limit outside the approved matrix.
- `VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG` reports cap and measured length.
- Non-target calls continue through the existing `resolveVdImagePromptBudgetForModel`
  behavior.
- No public input can submit arbitrary capability metadata; later sections pass
  the trusted result from this resolver.

## Exit criteria

- The resolver is the only Feature 144 capability authority.
- Target limits and family/profile values are parity-tested in DB/config and
  static fallback.
- Unicode boundary behavior is explicit and tested.
- Unknown/incomplete target metadata fails before credit reservation.
- Existing budget and non-target tests remain green.

## Implementation notes

- Implemented in `apps/web/server/services/verticalDramaCharacterPromptContract.ts`.
- The canonical selected `modelId` is the family/limit authority; a
  `referenceImageRoute` cannot override it.
- Static fallback and Kie seed metadata now cover GPT Image 2, Nano Banana
  (including the legacy Pro row and Nano Banana 2 variants), and Seedream 3,
  4, 4.5, and 5 Pro rows.
- Target limits require positive integers and exact family matrix parity. The
  typed error reports bounded model/family/cap/length metadata without the
  prompt body.

## Verification

- `verticalDramaCharacterPromptContract.test.ts`: 16 passed.
- `verticalDramaCharacterPromptCatalogParity.test.ts`: 4 passed.
- `modelPromptBudget.test.ts`: 17 passed.
- Focused Section 01 total: 37 passed.
- Full web typecheck was attempted; remaining diagnostics are pre-existing
  failures in unrelated dirty files, with no diagnostic from the Section 01
  implementation files.
