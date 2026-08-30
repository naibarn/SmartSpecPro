# Implementation plan

## Objective

Extend the existing Vertical Drama story-generation pipeline with a pure
semantic consistency contract and an autonomous completion/repair policy that
always returns a structurally complete story when ordinary content-quality
repair is exhausted, while preserving hard operational safety boundaries.

## Workstreams

### 1. Shared consistency contract

Add types and pure validators for episode events, character knowledge,
disclosure visibility, premise facts, and event fingerprints. Detect:

- a character learning a fact before its disclosure;
- a character marked unaware while authoring a decision that requires that fact;
- a secret spoken while the unaware character is present/hearing;
- conflicting premise knowledge statements;
- repeated character/event/location patterns without a causal distinction.

Keep findings structured with severity, episode/shot, repair instruction,
preserved story locks, and affected episodes. Compose these findings with the
existing completion and thread-ledger reports.

### 2. Candidate repair policy

Add a pure repair-policy helper that classifies findings as retryable content
quality, structurally incomplete, or operational hard failure. It must choose
target episodes and neighboring closure episodes, derive a stable next attempt
key, and return `completed_with_warnings` with the best structurally complete
candidate when quality attempts are exhausted. Never downgrade an operational
failure to a fabricated success.

Update existing story repair planners and long-form block runtime to use this
policy. Preserve accepted blocks and checkpoint state on every attempt. Keep
the current stale checkpoint and ownership checks.

### 3. Prompt and pipeline wiring

Render a compact consistency ledger and exact findings into deep-draft and
episode-script prompts. Invoke validation after plan/deep candidate acceptance,
after premium revise/sweep, and after script hydration. Route ordinary findings
through automatic targeted repair; retain the existing repair-context path for
the actual script repair call. Make automatic quality review available from the
generation pipeline rather than requiring a separate user click.

### 4. Long-form integration

Add consistency fingerprints to long-form block/checkpoint values and use the
existing reverse dependency index to limit repair impact. Ensure 120-episode
plans continue with bounded block prompts and can resume after worker/provider
redelivery. Final closure checks should repair ordinary content findings and
finish with warnings if only subjective issues remain.

### 5. Observability and tests

Persist or expose structured findings through the existing story run artifact
and metadata contracts. Add tests for the twin knowledge leak, the ambiguous
stepparent disclosure, the repeated helper event, contradictory premise facts,
50/120 episode completion, provider failure, stale checkpoint, repair exhaustion,
and idempotent retry behavior.

## Affected files

- `apps/web/shared/verticalDramaSeries/` semantic contract and long-form types
- `apps/web/server/services/verticalDramaCompletionContract.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRepair.ts`
- `apps/web/server/services/verticalDramaLongFormRuntime.ts`
- `apps/web/server/services/verticalDramaLongFormMemory.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/services/verticalDramaScriptGeneration.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- corresponding focused tests under `apps/web/server/services/__tests__` and
  `apps/web/shared/verticalDramaSeries/__tests__`

## Acceptance criteria

- No ordinary quality finding sends the user to a manual restart as the only
  path to a structurally complete story.
- Best-known fallback never contains missing episode/shot/dialogue structure.
- 120-episode block generation has bounded context and preserves causal facts.
- Twin/knowledge/disclosure and repeated-event fixtures fail before acceptance
  and are repaired by the automatic loop fixture.
- Existing provider, billing, tenant, stale-checkpoint, and security failures
  remain hard/retryable and never fabricate output.

## Verification

Run focused Vitest suites for the new shared contract, completion/runtime,
story-bible premium logic, script hydration, and episode pipeline; then run
affected workspace typecheck and `git diff --check`. Do not claim browser,
provider, deployment, or production proof without running those separately.
