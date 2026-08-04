# Section 03 — Character render normalizer

## Scope

Create the trusted internal character-contract marker and the shared final
request normalizer. Integrate it into every Vertical Drama character render
entry point so final prompt length and target negative omission are enforced
after all prompt selection/transformation but before credit reservation or
provider submission.

This section consumes Section 01's capability resolver and Section 02's skill
output. It does not rewrite skill prose or provider-specific payload builders;
Section 04 owns transport defense in depth.

## Files owned

- `apps/web/server/services/verticalDramaCharacterPromptContract.ts` — shared
  request normalization in addition to the capability contract exports;
- `apps/web/server/routers/verticalDramaCharacters.ts` — preview, portrait,
  candidate batch, and sheet integration;
- `apps/web/server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts`;
- focused Vertical Drama router tests under
  `apps/web/server/routers/__tests__/verticalDramaCharacters.*.test.ts`.

## Trusted internal request context

Add a non-public marker to the internal media request context:

```text
vertical_drama_character_v1
```

Only authenticated Vertical Drama server code may set it. Public tRPC/media
input schemas must not accept arbitrary capability objects or contract versions.
The internal context carries the capability resolved from the selected model,
the final prompt, the optional legacy negative value, and the current prompt
contract version.

## Shared normalizer contract

Implement one helper in
`apps/web/server/services/verticalDramaCharacterPromptContract.ts`. It must:

1. accept selected prompt, optional legacy negative, resolved model/capability,
   contract marker/version, and transport-neutral request fields;
2. add no creative wording and never append a negative list;
3. assert final prompt length using Section 01's shared `string.length` rule;
4. reject missing/invalid target capability with a typed capability error;
5. for target capability, return a request whose object has no negative field;
6. for legacy/non-target capability, preserve the current negative value and
   request shape;
7. be idempotent if called before and inside the media service;
8. include only bounded model/family/cap/length/profile/version metadata in
   errors/diagnostics, never the prompt body.

The normalizer runs after `applySeriesLookToImagePrompt`, approved snapshot or
candidate prompt selection, and any final field selection. It runs before any
credit reservation and before any external task is queued.

Use semantic errors consistent with the plan:

- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_MISSING`;
- `VERTICAL_DRAMA_CHARACTER_PROMPT_CAPABILITY_INVALID`;
- `VERTICAL_DRAMA_CHARACTER_PROMPT_TOO_LONG`;
- actionable stale-prompt/regenerate error for old records.

## Router integration

Update `apps/web/server/routers/verticalDramaCharacters.ts` at these concrete
procedures/branches:

- preview-only character prompt mutation;
- primary portrait generation mutation;
- `generatePortraitCandidateBatch`;
- character design-bible sheet mutation;
- approved-prompt reuse branches inside the above procedures.

For new prompt generation:

1. resolve the actual selected model/reference capability before invoking the
   normal or candidate skill service;
2. pass capability facts into Section 02;
3. preserve the skill's portrait/full-body/sheet field selection;
4. apply existing series-look handling;
5. require current prompt-contract marker or regenerate/reject stale prompt;
6. normalize the final request;
7. only then reserve credits or dispatch Hermes/MCP/media.

Do not duplicate target checks in each transport branch. A shared preparation
helper may return the selected prompt, capability, contract version, and
normalized optional legacy negative value for compatibility response fields.

Target preview responses may preserve optional readable negative data for old UI
types, but the normalized render request must not contain that property.

## Candidate batch preflight

The existing Feature 134 candidate lifecycle remains its owner. Feature 144
must preflight every candidate prompt/version/capability/length before batch
credit calculation, reservation, or provider submission. This prevents one bad
candidate from causing a partially paid batch.

Preferred order:

```text
load draft candidates
  -> resolve capability
  -> validate marker/profile/length for every candidate
  -> normalize all requests
  -> claim/reserve according to existing lifecycle
  -> submit each normalized task
```

If the existing storage API requires a claim to load drafts, use its existing
idempotent release/expiry path on preflight failure. The test must prove no
credit reservation and no provider task when any candidate is invalid/stale.
Do not alter candidate selection/poll/approval semantics outside this preflight.

## Approved and stale prompt behavior

An approved snapshot/candidate prompt is target-reusable only when its marker is
`vd_character_natural_human_v1` and its profile matches the selected target
capability. Missing/old marker triggers the Section 02 service regeneration
path when Character DNA is available; otherwise the router returns an actionable
regenerate-prompt error. It must never append a Human Realism clause in the
router.

## TDD-first tests

Add tests before router edits in
`apps/web/server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts`
and the focused Vertical Drama router suites:

### Normalizer unit tests

- target request has a `prompt` property and no negative property;
- legacy request preserves negative exactly;
- target normalizer is idempotent;
- final prompt is checked after series-look transformation;
- exact cap passes and cap + 1 fails;
- missing/invalid target capability fails without provider/credit work;
- stale/current marker/profile compatibility is enforced;
- Thai/emoji uses shared length semantics;
- errors omit full prompt contents.

### Router flow tests

- preview path resolves capability and does not call provider;
- primary portrait path uses normalizer before credit reserve;
- full-body selection remains skill-owned;
- sheet path uses the same normalizer;
- approved target reuse does not leak old negative data;
- stale approved prompt regenerates with Character DNA or rejects without it;
- candidate batch validates all candidates before claim/reservation when
  possible;
- if claim is required, failure releases/expires it;
- one invalid candidate causes zero reservations and zero provider submits;
- target budget/capability errors are typed/browser-visible and do not consume
  credits;
- existing authentication, tenant, rate-limit, and transport decisions are
  unchanged.

Use existing router/service mocks and assert call ordering explicitly:
`preflight < reserve < submit`. No paid provider call is allowed.

## Exit criteria

- Every character path uses one normalizer.
- Final cap validation is before credit/provider work.
- Candidate batches cannot partially reserve/submit because of one stale or
  over-limit prompt.
- Target normalized requests have no negative property; legacy requests do not
  regress.
- Stale prompts regenerate or fail, never receive router-authored prose.
- Focused router/normalizer tests pass.

## Implementation notes

- Added the trusted marker `vertical_drama_character_v1` and the shared
  `normalizeVerticalDramaCharacterPromptRequest` helper in the prompt-contract
  service. It validates the final post-series-look prompt and removes
  `negativePrompt` only for a valid target capability; legacy requests retain
  the field exactly.
- The character router now resolves capability from the selected canonical
  image model before prompt generation, passes capability facts into the
  Visual Bible skill, and normalizes portrait, sheet, candidate, Hermes, MCP,
  and gateway submissions before credit reservation/provider dispatch.
- Candidate batches use a read-only preflight before claim/reservation, verify
  contract/profile metadata, normalize every candidate, and reject the whole
  batch when any prompt is stale or over budget.
- Approved preview snapshots now carry contract/profile metadata. Target stale
  snapshots regenerate from character facts; stale candidate snapshots fail
  with an actionable fresh-batch message. No router-authored Human Realism
  prose is appended.
- Added focused normalizer coverage in
  `server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts`.
