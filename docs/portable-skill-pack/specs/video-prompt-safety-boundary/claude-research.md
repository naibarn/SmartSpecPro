# Research Decision

- Codebase research: required. This is an existing TypeScript/Vitest repository;
  SocratiCode was unavailable in the current runtime, so targeted shell search,
  source reads, Redis inspection, PostgreSQL inspection, audit-log inspection,
  and local focused tests were used instead.
- Web research: skipped. The change follows an existing local safety contract and
  does not require a new external API or current provider specification.
- Testing: use the existing Vitest commands from the repository root, with paths
  relative to `apps/web` when invoked through the workspace script.

## Findings

The user-facing action is `verticalDramaEpisodes.generateShotVideoPrompt`, which
admits a Redis/BullMQ job and later executes the protected worker resolver. The
single-shot generator performs input analysis, calls the selected vision-capable
LLM, performs motion assurance, then runs a final story safety scan before credit
deduction and persistence. The current final scan throws on any high result.

The safety analyzer is a conservative marker-pair detector. It treats a whole-word
`restrained` as coercion and combines it with a whole-word `child` in the same
segment. It intentionally excludes negative-prompt and policy metadata fields, but
does not understand that `restrained tension` is a cinematography/audio modifier
rather than a physical restraint.

The exact runtime regression is episode 232, shot 1. PostgreSQL contains an
approved start frame asset and the image audit reports provider success with
`blocked: false`, `rewritten: false`. Redis contains a terminal failed video
prompt job created at 2026-08-28T13:48:25Z and updated at 13:48:47Z with the exact
policy error and no result. The audit contains a successful HTTP-200 LLM response
whose prompt includes `the child's sudden cry` and `restrained tension`. Running
that exact prompt through the current analyzer yields `high / abuse_or_coercion`;
replacing `restrained tension` with `quiet tension` removes the high finding.

The current audit and credit rows show no successful shot-1 video-prompt
transaction or persisted clip. Shot 2 and a later shot-3 request succeeded in the
same episode, so this is not a general model, queue, or credit outage.

The repository already has a queue job result/error distinction and focused tests
for safety, motion generation, judged generation, and queue behavior. Existing
safety tests cover real minor-threat combinations and ordinary childcare with
mild distress, but not cinematic modifier false positives or warning-bearing
successful jobs.

## Relevant files

- `apps/web/server/services/verticalDramaStorySafety.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaShotVideoPromptJobs.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/server/services/__tests__/verticalDramaStorySafety.test.ts`
- `apps/web/server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts`
- `apps/web/server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts`
