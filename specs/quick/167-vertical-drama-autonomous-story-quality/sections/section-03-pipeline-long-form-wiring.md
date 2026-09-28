# Section 03 — pipeline and long-form wiring

## Ownership

Prompt ledger rendering and validation calls at plan/deep/premium/script/block
boundaries, including 120-episode bounded context.

## Target files

- `verticalDramaStoryBible.ts`
- `verticalDramaScriptGeneration.ts`
- `verticalDramaEpisodePipeline.ts`
- `verticalDramaLongFormMemory.ts`
- corresponding tests

## TDD expectations

Assert deep drafts and script hydration receive the same canonical findings;
assert 50 and 120 episode block plans preserve predecessor fingerprints and
resume without regenerating accepted blocks.

## Acceptance

Twin knowledge/disclosure and repeated-event defects are repair targets;
ordinary repair completes automatically; context stays block-bounded.

## Risks

Do not allow a repair to change approved ending, identity, tenant scope, or
episode count. Keep prompt additions compact and backward compatible.
