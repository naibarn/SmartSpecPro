# Feature 144 TDD plan

This companion plan defines tests to write before each implementation wave. It
uses the existing SmartSpecPro web workspace Vitest conventions, current test
fixtures/mocks, the skill verifier, and the existing TypeScript check. These are
test stubs and acceptance descriptions, not implementations.

Automated tests must never call a paid image provider. Provider A/B rendering is
an explicitly approved manual release gate described in the implementation
plan.

## 1. Implementation objective — test contract

Before implementation, establish a failing contract test proving that a target
character request has one provider prompt and no `negative_prompt`, while a
legacy/non-target request preserves the current separate negative behavior.

Test fixtures should cover:

- an adult lead with approved identity facts;
- a supporting character and an attractive villain;
- a child/teen character for safety precedence;
- a reference-locked character with filter/compression artifacts;
- a full-body character with hands, feet, weight, and wardrobe facts;
- a prompt containing Thai text and emoji for length semantics.

## 2. Decisions fixed before implementation — regression tests

Add tests that lock these decisions:

- target negative value is omitted from provider payload, not sent as `undefined`
  or an empty string;
- target metadata is required for target contract activation;
- Seedream uses the compact skill profile, not a post-hoc sliced prompt;
- stale approved/candidate prompts are regenerated or rejected, never upgraded
  by TypeScript string concatenation;
- candidate preflight occurs before credit reservation/provider submit;
- non-target and legacy persisted negative behavior is unchanged.

## 3. Current-to-target flow — integration test outline

Create an integration-level test matrix with mocked model resolution, skill
generation, credit reservation, and provider transport. Verify the sequence:

1. model/reference route resolves capability;
2. capability facts reach the skill input;
3. selected prompt is checked after series-look transformation;
4. target request is normalized;
5. capability/length errors occur before credit reservation;
6. provider receives one prompt and no negative field.

Add a retry case proving that a target retry cannot restore negative data or
bypass the final length assertion.

## 4. Capability contract and model catalog

### 4.1 Add a single resolver layer

Write tests first for
`verticalDramaCharacterPromptContract.ts` and the existing budget resolver in
`verticalDramaCharacterPromptContract.test.ts`:

- explicit GPT Image 2 metadata resolves family `gpt_image_2`, limit 20,000,
  `inline_only`, and `rich`;
- explicit Nano Banana canonical and alias metadata resolves family
  `nano_banana`, limit 20,000, `inline_only`, and `rich`;
- explicit Seedream metadata resolves family `seedream`, limit 5,000,
  `inline_only`, and `compact`;
- DB/config metadata wins over static fallback;
- static fallback is used only when DB/config is absent and contains complete
  target metadata;
- reference-image route resolution does not change the family/capability;
- malformed family, mode, or limit is rejected;
- an unknown target-enabled model does not assume 20,000;
- a non-target request retains the existing legacy result and 3,800 behavior;
- exact cap passes and cap + 1 raises the typed budget error;
- prompt length uses the existing JavaScript `string.length` semantics for
  ASCII, Thai, and emoji fixtures;
- errors expose model/family/cap/length but not prompt content.

### 4.2 Catalog changes

Extend model seed/static parity tests:

- each enabled GPT Image 2/Nano Banana/Seedream target row has explicit
  `maxPromptLength` and `verticalDramaCharacterPromptContract` metadata;
- the static legacy Nano Banana Pro entry either matches target metadata or is
  explicitly legacy and cannot be widened accidentally;
- canonical/reference rows and aliases remain aligned;
- unverified family versions are not classified by display-name substring;
- existing non-target catalog snapshots do not change.

### 4.3 Capability tests

The focused contract test must test resolver precedence and failure modes without
network or database mutation. Use the repository's existing model-config mock
patterns and keep the test deterministic.

## 5. Skill contract and Human Realism authoring

### 5.1 Runtime skill files

Extend `verticalDramaCharacterVisualBible.skillContent.test.ts` and the skill
verifier expectations before editing the mirrored skill files:

- both `SKILL.md` and `skill.md` contain the same Human Realism contract;
- identity/anatomy, skin, eyes/lips/hair, candid expression, adult casting,
  support/villain differentiation, full-body anatomy, and shot-aware optics are
  present;
- the content does not require a universal 85mm/shallow-focus recipe;
- inline avoidance prose is present as guidance and is not represented only as
  a comma-list negative vocabulary;
- rich and compact profile instructions are present;
- existing child-safety, identity-lock, role, five-field, and anti-clone
  contracts remain present;
- mirrored files compare equal.

### 5.2 Input contract

Write generation-service tests for the capability input block:

- normal generation includes family, max prompt chars, single-prompt flag,
  separate-negative false, and profile;
- candidate generation includes the same facts;
- facts contain no provider secret, raw display label, or creative prose;
- omitted/invalid target capability is rejected before the LLM call or follows
  the explicit legacy path only when the target contract is not requested;
- GPT/Nano facts produce `rich`; Seedream facts produce `compact`.

### 5.3 Output and schema behavior

Extend `verticalDramaCharacterImageGeneration.test.ts`:

- all five prompt fields are individually within the selected cap;
- target output quality checks succeed when inline natural-human avoidance prose
  exists and `negative_prompt` is absent;
- target output quality checks fail/retry when anti-plastic or anti-model
  semantic anchors are missing;
- legacy quality checks still accept the existing negative field;
- role, identity, age, reference, region, and child-safety checks retain their
  current precedence;
- a full-body selection retains body/feet/weight/wardrobe and shot-aware optics;
- exactly one bounded retry is used for a target budget/quality issue and retry
  exhaustion returns the existing typed error;
- the generic hard-truncation helper is not called for target character output.

### 5.4 Negative fragment compatibility

Add tests proving:

- legacy callers still receive merged preset negative fragments;
- target callers do not merge preset negative fragments into a provider-bound
  prompt or target negative field;
- any required preset visual fact reaches the skill as facts and is authored
  inline, rather than appended by TypeScript;
- normal and Feature 134 candidate generation follow the same rule.

## 6. Shared render adapter and payload enforcement

### 6.1 Internal request context

Test that the internal character contract marker can only be set by the trusted
Vertical Drama server path. Public media/router input cannot submit arbitrary
capability metadata or bypass the resolver.

### 6.2 Character request normalizer

Write unit tests in
`server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts`
for the shared normalizer:

- target capability returns prompt-only request with no negative property;
- legacy capability preserves the negative value exactly;
- normalizer is idempotent;
- final length is checked after series-look/prompt assembly;
- exact cap passes, cap + 1 fails, and no provider call is possible on failure;
- stale contract version is accepted only when current and profile-compatible;
- stale approved prompt with available Character DNA requests skill regeneration;
- stale approved prompt without required facts fails with regenerate-prompt error;
- no router-side prose append occurs;
- Thai/emoji length fixtures use the shared count semantics.

### 6.3 Router integration

Add focused tests for `verticalDramaCharacters.ts` procedures:

- preview returns compatibility-readable data without making a provider call;
- primary portrait reuses/renews prompt under the contract marker;
- full-body/portrait selection remains skill-owned;
- `generatePortraitCandidateBatch` preflights every candidate before claim or
  credit reservation, rejects one invalid/stale candidate, and performs no
  provider submit;
- if the existing candidate loader requires a claim, a preflight failure
  releases/expires it through the existing idempotent path;
- character-sheet flow uses the same normalizer;
- approved prompt reuse cannot leak old negative data into target transport;
- authentication, tenant, credit, and existing transport decisions remain
  unchanged;
- target budget/capability errors are browser-visible typed errors and do not
  consume credits.

### 6.4 Media service defense in depth

Extend `mediaGenerationService.test.ts` and focused payload tests:

- sync target payload has `prompt` and no `negative_prompt` property;
- async target payload has `prompt` and no `negative_prompt` property;
- `undefined`, empty, and non-empty legacy negative values are all omitted for
  target contract requests;
- non-target sync/async payload snapshots retain current negative behavior;
- normalized retries remain negative-free;
- MCP transport envelope receives normalized target request;
- Hermes queue/envelope receives normalized target request;
- provider/model/reference routing fields remain unchanged.

## 7. Persistence and compatibility

Extend `apps/web/shared/verticalDramaSeries/characterProfile.test.ts` and
candidate persistence tests only where the optional version marker is added:

- old snapshots without a version deserialize successfully;
- old negative values remain readable and are not deleted;
- current target snapshots persist/read the contract marker;
- candidate drafts preserve compatibility metadata;
- target reuse chooses regenerate/reject for stale snapshots;
- non-target reuse remains byte/shape compatible where existing tests assert it.

## 8. Detailed execution waves — test order

### Wave 1 — Baseline and capability contract

Run capability and catalog tests before implementation; then implement until
the resolver, parity, Unicode, and legacy tests pass.

### Wave 2 — Skill and generation contract

Run skill content/verifier tests first, then generation schema/QC/candidate tests.
Do not proceed to transport edits while mirrored skill/content contracts fail.

### Wave 3 — Render boundary and payload enforcement

Run normalizer unit tests, router branch tests, candidate credit-preflight tests,
and media/Hermes/MCP payload tests. Verify the negative property is absent with
property-level assertions, not only deep equality against a permissive object.

### Wave 4 — Verification, rollout, and A/B gate

Run the focused suite, skill verifier, and TypeScript check. Then perform the
manual matched-pair A/B review; do not replace it with an LLM self-score or a
unit-test fixture.

## 9. File-by-file test map

| Test file/surface | First tests to write |
|---|---|
| `server/services/__tests__/modelPromptBudget.test.ts` | configured limit and precedence regressions |
| `server/services/__tests__/verticalDramaCharacterPromptContract.test.ts` | family metadata, caps, Unicode, version |
| `server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts` | normalizer, stale reuse, property omission, call-order inputs |
| `server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts` | mirrored Human Realism content and profile rules |
| `server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts` | facts, schema, QC, retry, stale regeneration |
| `server/services/__tests__/verticalDramaPromptQc.test.ts` | legacy truncation remains; target path bypasses it |
| `server/services/mediaGenerationService.test.ts` | sync/async negative omission and legacy preservation |
| `server/routers/__tests__/verticalDramaCharacters.*.test.ts` | portrait/sheet/candidate/approved/credit sequencing |
| `shared/verticalDramaSeries/characterProfile.test.ts` | optional version and negative compatibility |
| `apps/web/skills/vertical-drama-character-visual-bible/scripts/verify.sh` | skill bundle synchronization/contract checks |

## 10. Commands and evidence

Use the existing package manager and workspace commands:

```text
npm --workspace @smartspec/web run test -- <focused test files>
bash apps/web/skills/vertical-drama-character-visual-bible/scripts/verify.sh
npm --workspace @smartspec/web run check
```

Final evidence must distinguish focused passes from any unrelated full-repo
baseline failures. No paid image-generation command belongs in the automated
test sequence.

## 11. Definition of test-complete

The implementation is test-complete when all target contract tests, skill
verifier checks, existing relevant tests, and the TypeScript check pass; target
payload assertions prove the negative property is absent across every listed
transport; stale/over-limit/capability failures prove no credit/provider work;
and the manual twelve-pair-per-family A/B record is approved separately.
