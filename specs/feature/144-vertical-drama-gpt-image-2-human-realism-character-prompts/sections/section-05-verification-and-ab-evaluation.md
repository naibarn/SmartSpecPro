# Section 05 — Verification and A/B evaluation

## Scope

Provide final proof that Sections 01–04 satisfy the Feature 144 contract, then
record the bounded manual image-quality gate required before broad enablement.
This section does not implement runtime behavior or run paid generation as part
of automated tests.

## Automated verification order

Run the smallest relevant suites after each wave, then the complete changed
surface:

1. capability/budget and catalog parity tests;
2. skill-content and skill verifier tests;
3. character generation schema/QC/retry tests;
4. normalizer and Vertical Drama router tests;
5. media sync/async, Hermes/MCP, and persistence tests;
6. final focused suite, skill verifier, and TypeScript check.

Use the repository's existing commands:

```text
npm --workspace @smartspec/web run test -- <focused test files>
bash apps/web/skills/vertical-drama-character-visual-bible/scripts/verify.sh
npm --workspace @smartspec/web run check
```

The final report must distinguish focused passes from unrelated baseline/full
repository failures. Never substitute an LLM self-score for tests or image
review.

## Required automated proof

### Capability and budget

Prove that:

- GPT Image 2 and Nano Banana resolve 20,000/rich/inline-only;
- Seedream 5 Pro resolves 5,000/compact/inline-only;
- DB/config precedence, static fallback, aliases, and reference routes agree;
- malformed/missing target metadata fails closed rather than assuming 20,000;
- exact caps pass and cap + 1 fails before credit/provider work;
- the shared JavaScript `string.length` rule is covered with Thai and emoji;
- non-target legacy 3,800/negative behavior is unchanged.

### Skill and generation

Prove that:

- mirrored `SKILL.md`/`skill.md` content is synchronized;
- Human Realism covers identity, anatomy, skin, eyes/lips/hair, expression,
  casting, role differentiation, full-body behavior, and shot-aware optics;
- rich/compact profile selection follows facts, not display names;
- target combined prompts contain inline anti-plastic/anti-model intent without
  requiring `negative_prompt`;
- child/teen safety, identity/reference, role, and full-body checks retain
  precedence;
- target retry is bounded and semantic, with no generic hard truncation;
- stale prompt regeneration/rejection is deterministic.

### Render and transport

Prove that:

- preview, portrait, full-body, sheet, approved reuse, and candidate paths use
  the same normalizer;
- candidate batch preflights all prompts before claim/reservation where
  possible, otherwise releases/expiries a claim on failure;
- target sync/async media, MCP, and Hermes payloads have no
  `negative_prompt` property;
- non-target payloads preserve current negative behavior;
- stored legacy negative values remain readable but are never sent to target
  providers;
- credit reservation and provider submission are not reached for stale,
  missing-capability, or over-limit requests;
- authentication/tenant/credit authorization and existing transport routing are
  unchanged.

## Manual A/B release gate

The restricted evidence form is available at
`implementation/ab-evaluation-template.md`; it remains intentionally blank
until explicit approval is granted for credit-consuming provider calls.

Automated tests cannot establish rendered human realism. Before broad target
enablement, perform a bounded, explicitly approved comparison for each family:

- at least 12 matched prompt pairs per family;
- same character facts, reference images, framing, aspect ratio, and generation
  settings where the provider permits;
- compare the existing prompt path against the Feature 144 target path;
- use the same selected model version for each pair;
- record provider, model ID, contract/profile, prompt length, and task IDs in a
  restricted evaluation record, not in normal prompt telemetry;
- do not include secrets or full prompt text in the public report.

The Seedream set must specifically test whether compact authoring preserves
identity, age, safety, and Human Realism essentials at 5,000 characters.

## Fixed evaluation rubric

Score each pair on a consistent 1–5 scale for:

1. identity recognizability and reference lock;
2. natural human skin/facial structure;
3. attractive dramatic presence;
4. non-model/non-catalog authenticity;
5. age and safety correctness;
6. pose, hands, feet, anatomy, and wardrobe plausibility;
7. usefulness as a downstream character reference.

Use two reviewers or one reviewer with a recorded second pass. Broad rollout is
blocked by any identity, age, or safety regression. A target family may be
enabled only when the target path maintains or improves those mandatory scores
and shows a meaningful preference for natural-human realism on the remaining
rubric. Record disagreements and the decision; do not hide failures by averaging
away a safety regression.

## Telemetry verification

Confirm bounded diagnostics are emitted only after normalization and contain:

```text
model_id, family, prompt_profile, max_prompt_chars, prompt_length,
semantic_retry_count, negative_prompt_submitted=false, contract_version
```

Confirm full prompt, full negative value, reference images, secrets, and user
content are not logged by default. Confirm no new browser preview field or
feature flag is required for the first slice; explicit catalog capability is the
enablement gate.

## Rollback proof

Test/verify that invalidating target metadata disables the target contract
without deleting models, snapshots, negative data, or Character DNA. Confirm
legacy/non-target requests continue through their existing path. If a family
fails A/B, disable that family's target metadata and preserve the evaluation
record for follow-up.

## Final evidence checklist

- [x] Focused capability/catalog tests pass.
- [x] Skill verifier passes and mirrored files compare equal.
- [x] Focused character generation/QC/retry tests pass.
- [x] Normalizer/router preflight and credit-order tests pass.
- [x] Media sync/async and Hermes/MCP property-absence tests pass.
- [x] Persistence compatibility tests pass where changed.
- [x] Web TypeScript check passes with no diagnostics in the current checkout.
- [ ] Twelve matched A/B pairs per family are recorded and approved.
- [x] No paid provider call was made by automated tests.

## Exit criteria

Feature 144 is ready for broad enablement only after automated proof passes and
all three family A/B gates are approved. Until then, only explicitly complete
catalog rows may use the target contract; incomplete rows remain fail-closed or
legacy according to Section 01.

## Implementation status

- Automated capability, catalog, skill, generation, normalizer, router-model,
  and skill-verifier checks are complete; the current Feature 144 focused suite
  passes 344 tests.
- Full web typecheck was attempted; unrelated dirty-worktree diagnostics still
  block a clean repository-wide result, while no diagnostic references the
  changed Feature 144 lines.
- The paid-provider A/B gate remains intentionally pending explicit approval;
  no provider generation was run by implementation or automated verification.
