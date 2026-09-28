# Usage and Verification Guide

## Runtime behavior

No operator action or migration is required. On the Vertical Drama episode
page, the Sub-episode assembly card now derives readiness from unique canonical
storyboard shots:

- a completed legacy sibling such as clip `302` satisfies parent shot `3`;
- duplicate legacy records do not increase the total;
- a genuinely missing parent shot remains listed and blocks full assembly;
- partial assembly includes one deterministic completed clip per ready shot.

The server applies the same resolver even for historical episodes that have no
storyboard or start-frame metadata by falling back to clip-derived identities.

## Main interfaces

- Shared resolver:
  `resolveCanonicalShotAssembly` in
  `apps/web/shared/verticalDramaSeries/assemblyReadiness.ts`.
- UI consumer:
  `VerticalDramaStoryboardPanel`.
- Server consumer:
  `resolveClipsForAssembly`, called by
  `verticalDramaEpisodes.assembleEpisodeVideo`.

## Verification

From `apps/web`:

```text
npm test -- shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.speakerSubShots.test.tsx server/services/__tests__/verticalDramaEpisodeVideoAssembly.test.ts server/routers/__tests__/verticalDramaEpisodes.voiceChain.test.ts
npm run check
```

Expected result: four test files and 110 tests pass; TypeScript emits no errors.

## Security review

- Existing authenticated `verticalDramaProcedure` and `loadOwnedEpisode`
  tenant/user/series/episode ownership scope are unchanged.
- No new endpoint, SQL, decrypted secret, token storage, or user-controlled HTML
  sink was introduced.
- Readiness warning content is a normalized integer list rendered through React
  text interpolation.
- Verdict: PASS; no findings or remediations.
