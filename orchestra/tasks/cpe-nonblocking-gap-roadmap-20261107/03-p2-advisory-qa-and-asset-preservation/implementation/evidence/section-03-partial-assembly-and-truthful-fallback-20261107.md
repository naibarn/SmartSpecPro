# P2 Section 03 — Partial Assembly and Truthful Fallback

## Outcome

Assembly readiness is based on technically completed video clips. Advisory
identity QC does not remove a usable clip or gate submission. Partial assembly
still requires the explicit `allowPartial` request and includes only ready
clips; zero usable clips, unreadable video sources, invalid timelines, and
owner-scope failures remain errors.

Each new assembly submission records canonical expected, included, and missing
shot numbers plus an explicit `partial` flag in
`assemblyManifest.compiledVideo`. The route response, Remotion/FFmpeg pending
state, and completed FFmpeg state carry the same completeness facts. The UI
uses those facts instead of comparing clip count to shot count, labels partial
video and missing shots, and uses a `partial` download filename. Still images
and placeholders do not count as generated clips and cannot satisfy shot
readiness.

## Changes

- Extended the canonical clip resolver with shot-level completeness metadata.
- Threaded completeness through route responses, Remotion submissions, FFmpeg
  worker feeds, and the durable compiled-video manifest.
- Replaced inferred partial labels with the persisted canonical partial flag
  and missing-shot list; clarified retry, restart, reassemble, and download
  behavior when clips are missing.
- Added regression coverage for explicit partial selection, warning-tolerant
  readiness, zero usable clips, still/placeholder exclusion, unreadable video
  rejection, manifest persistence, route results, and UI labeling.

No migration was needed; the fields are additive JSON metadata.

## Focused Verification

- `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts -t 'submits a job|returns only the completed clips|keeps a technically complete clip|still image or placeholder|succeeds with all clips complete'` — 5 passed.
- `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/verticalDramaRemotionRender.test.ts -t 'enqueues a job and persists a pending compiledVideo state|rejects an unreadable'` — 2 passed.
- `pnpm --filter @smartspec/web exec vitest run server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts -t 'returns and persists the exact partial shot scope'` — 1 passed.
- `pnpm --filter @smartspec/web exec vitest run server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts -t 'returns and persists the exact partial shot scope|fails closed for a caller that does not own the episode'` — 2 passed.
- `pnpm --filter @smartspec/web exec vitest run client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.remotionRenderBadge.test.tsx` — 11 passed.
- `pnpm --filter @smartspec/web exec vitest run shared/verticalDramaSeries/__tests__/episodeAssemblyTimeline.test.ts` — 3 passed.
- `git diff --check` — passed.

A broader combined run also exposed existing failures outside this section: a
capacity test assumes a `/tmp` mount while this host reports `/mnt/SmartSpecDev`,
an audio-timeline assertion omits current clip-local fields, and a subtitle
retiming assertion expects a removed array item. Those behaviors were not
changed here. The router test fixture's missing rate-limiter/admin-procedure
exports were supplied so the new route regression test could run.
